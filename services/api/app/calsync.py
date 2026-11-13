"""Two-way sync with Google Calendar (OAuth) and Yandex Calendar (CalDAV, app password).

Pull: external events are copied into the NEMI calendar of the user who connected the account.
Push: events created in NEMI go to the user's target calendar; edits/deletes of external events go upstream first
(read-only: calendars without write access, recurring Yandex instances). Each sync covers −30…+180 days; events that disappeared upstream are
removed. Credentials live in Windows Credential Manager; only the connecting user's id is stored in the DB.
"""
from __future__ import annotations
import asyncio
import base64
import hashlib
import html
import logging
import secrets as pysecrets
import threading
import urllib.parse
import webbrowser
from datetime import date, datetime, time as dtime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from xml.etree import ElementTree as ET

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from .auth import current_user
from .db import AppSetting, Event, SessionLocal, audit, now
from .secrets import delete_secret, get_secret, set_secret

log = logging.getLogger("pai.calsync")
router = APIRouter(prefix="/api/v1/calendar")
PROVIDERS = {"google": "Google Календарь", "yandex": "Яндекс Календарь"}
PAST, FUTURE = timedelta(days=30), timedelta(days=180)
SYNC_EVERY = 300
GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly"
WRITE_SCOPE = "https://www.googleapis.com/auth/calendar.events"
CALDAV = "https://caldav.yandex.ru"
_status: dict[str, dict] = {}          # provider -> {"at", "count", "error"}
_lock = asyncio.Lock()


# ---------- settings (owner = NEMI user who connected the account) ----------
def _setting(key: str) -> str | None:
    with SessionLocal() as db:
        s = db.get(AppSetting, key)
        return s.value if s else None


def _set_setting(key: str, value: str | None) -> None:
    with SessionLocal() as db:
        s = db.get(AppSetting, key)
        if value is None:
            if s:
                db.delete(s)
        elif s:
            s.value = value
        else:
            db.add(AppSetting(key=key, value=value))
        db.commit()


def owner(provider: str) -> str | None:
    return _setting(f"calsync:{provider}:owner")


def has_credentials(provider: str) -> bool:
    if provider == "google":
        return bool(get_secret("google_client_id") and get_secret("google_client_secret"))
    return bool(get_secret("yandex_caldav_login") and get_secret("yandex_caldav_password"))


# ---------- time helpers ----------
def _local_midnight(d: date) -> datetime:
    return datetime.combine(d, dtime.min).astimezone()


def _naive_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        dt = dt.astimezone()
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


# ---------- Google OAuth (installed app: loopback redirect + PKCE) ----------
_pending: dict[str, dict] = {}


def google_connect_url(uid: str) -> str:
    cid = get_secret("google_client_id")
    if not cid:
        raise HTTPException(400, "Ключ приложения Google не настроен")
    verifier = pysecrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    state = pysecrets.token_urlsafe(24)
    done = threading.Event()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *a):          # keep codes out of the log
            pass

        def do_GET(self):
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            ok = q.get("state", [""])[0] == state and "code" in q
            if ok:
                _pending[state]["code"] = q["code"][0]
            else:
                _pending[state]["error"] = q.get("error", ["отказ или неверный запрос"])[0]
            msg = "Google Календарь подключён. Вкладку можно закрыть и вернуться в NEMI." if ok else \
                "Подключение не выполнено: " + html.escape(_pending[state]["error"])
            body = f"<!doctype html><meta charset=utf-8><title>NEMI</title><body style='font:16px system-ui;padding:40px'>{msg}</body>".encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(body)
            done.set()

    srv = HTTPServer(("127.0.0.1", 0), Handler)
    port = srv.server_address[1]
    redirect = f"http://127.0.0.1:{port}"
    _pending[state] = {"uid": uid, "verifier": verifier, "redirect": redirect}

    def serve():
        srv.timeout = 1
        deadline = datetime.now() + timedelta(minutes=5)
        while not done.is_set() and datetime.now() < deadline:
            srv.handle_request()
        srv.server_close()
        p = _pending.get(state, {})
        if p.get("code"):
            try:
                _google_exchange(p)
            except Exception:  # noqa: BLE001
                log.warning("google token exchange failed", exc_info=True)
                _status["google"] = {"at": now().isoformat(), "count": 0, "error": "не удалось получить доступ"}
        _pending.pop(state, None)

    threading.Thread(target=serve, daemon=True).start()
    url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode({
        "client_id": cid, "redirect_uri": redirect, "response_type": "code", "scope": GOOGLE_SCOPE,
        "code_challenge": challenge, "code_challenge_method": "S256", "access_type": "offline",
        "prompt": "consent", "state": state})
    try:
        webbrowser.open(url)                   # the system browser: Google forbids sign-in inside embedded webviews
    except Exception:  # noqa: BLE001
        pass
    return url


def _google_exchange(p: dict) -> None:
    r = httpx.post("https://oauth2.googleapis.com/token", timeout=20, data={
        "code": p["code"], "client_id": get_secret("google_client_id"), "client_secret": get_secret("google_client_secret"),
        "redirect_uri": p["redirect"], "grant_type": "authorization_code", "code_verifier": p["verifier"]})
    r.raise_for_status()
    rt = r.json().get("refresh_token")
    if not rt:
        raise RuntimeError("no refresh token")
    set_secret("google_refresh_token", rt)
    _set_setting("calsync:google:scope", r.json().get("scope", ""))
    _set_setting("calsync:google:owner", p["uid"])
    log.info("google calendar connected")
    with SessionLocal() as db:
        audit(db, p["uid"], "calendar.connect", "google")


async def _google_token(c: httpx.AsyncClient) -> str:
    rt = get_secret("google_refresh_token")
    if not rt:
        raise RuntimeError("Google не подключён")
    r = await c.post("https://oauth2.googleapis.com/token", data={
        "client_id": get_secret("google_client_id"), "client_secret": get_secret("google_client_secret"),
        "refresh_token": rt, "grant_type": "refresh_token"})
    if r.status_code in (400, 401):
        raise RuntimeError("доступ к Google отозван — подключите заново")
    r.raise_for_status()
    return r.json()["access_token"]


async def fetch_google(start: datetime, end: datetime) -> list[dict]:
    out: list[dict] = []
    async with httpx.AsyncClient(timeout=30) as c:
        h = {"Authorization": f"Bearer {await _google_token(c)}"}
        cals = (await c.get("https://www.googleapis.com/calendar/v3/users/me/calendarList", headers=h,
                            params={"minAccessRole": "reader"})).json().get("items", [])
        can_write = WRITE_SCOPE in (_setting("calsync:google:scope") or "")
        for cal in cals:
            if not (cal.get("primary") or cal.get("selected")):
                continue
            token = None
            while True:
                params = {"singleEvents": "true", "orderBy": "startTime", "maxResults": 2500,
                          "timeMin": start.isoformat(), "timeMax": end.isoformat()}
                if token:
                    params["pageToken"] = token
                r = await c.get(f"https://www.googleapis.com/calendar/v3/calendars/{urllib.parse.quote(cal['id'])}/events",
                                headers=h, params=params)
                r.raise_for_status()
                d = r.json()
                for e in d.get("items", []):
                    if e.get("status") == "cancelled":
                        continue
                    s, en = e.get("start", {}), e.get("end", {})
                    if "date" in s:
                        st, et, all_day = _local_midnight(date.fromisoformat(s["date"])), _local_midnight(date.fromisoformat(en["date"])), True
                    else:
                        st, et, all_day = datetime.fromisoformat(s["dateTime"]), datetime.fromisoformat(en["dateTime"]), False
                    out.append({"ext_id": f"{cal['id']}|{e['id']}", "cal": cal.get("summary", ""),
                                "ro": not (can_write and cal.get("accessRole") in ("owner", "writer")),
                                "title": e.get("summary") or "(без названия)",
                                "start": st, "end": et, "all_day": all_day,
                                "location": e.get("hangoutLink") or e.get("location") or "", "notes": (e.get("description") or "")[:4000]})
                token = d.get("nextPageToken")
                if not token:
                    break
    return out


# ---------- Yandex CalDAV ----------
NS = {"d": "DAV:", "c": "urn:ietf:params:xml:ns:caldav"}


async def _propfind(c: httpx.AsyncClient, url: str, body: str, depth: str = "0") -> ET.Element:
    r = await c.request("PROPFIND", url, content=body, headers={"Depth": depth, "Content-Type": "application/xml"})
    if r.status_code == 401:
        raise RuntimeError("Яндекс отклонил пароль приложения — создайте новый")
    r.raise_for_status()
    return ET.fromstring(r.content)


async def fetch_yandex(start: datetime, end: datetime) -> list[dict]:
    from icalendar import Calendar
    auth = (get_secret("yandex_caldav_login") or "", get_secret("yandex_caldav_password") or "")
    out: list[dict] = []
    async with httpx.AsyncClient(timeout=30, auth=auth, base_url=CALDAV) as c:
        x = await _propfind(c, "/", '<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>')
        principal = x.find(".//d:current-user-principal/d:href", NS).text
        x = await _propfind(c, principal, '<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">'
                                          '<d:prop><c:calendar-home-set/></d:prop></d:propfind>')
        home = x.find(".//c:calendar-home-set/d:href", NS).text
        x = await _propfind(c, home, '<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop>'
                                     '<d:resourcetype/><d:displayname/><c:supported-calendar-component-set/></d:prop></d:propfind>', "1")
        cals = []
        for resp in x.findall("d:response", NS):
            if resp.find(".//d:resourcetype/c:calendar", NS) is None:
                continue
            comps = [e.get("name") for e in resp.findall(".//c:supported-calendar-component-set/c:comp", NS)]
            if comps and "VEVENT" not in comps:
                continue
            cals.append((resp.find("d:href", NS).text, (resp.findtext(".//d:displayname", "", NS) or "").strip()))
        fmt = lambda d: d.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        for href, name in cals:
            body = ('<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-data>'
                    f'<c:expand start="{fmt(start)}" end="{fmt(end)}"/></c:calendar-data></d:prop>'
                    '<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">'
                    f'<c:time-range start="{fmt(start)}" end="{fmt(end)}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>')
            r = await c.request("REPORT", href, content=body, headers={"Depth": "1", "Content-Type": "application/xml"})
            r.raise_for_status()
            for resp in ET.fromstring(r.content).iterfind("d:response", NS):
                data, rhref = resp.find(".//c:calendar-data", NS), resp.findtext("d:href", "", NS)
                if data is None or not data.text:
                    continue
                for ve in Calendar.from_ical(data.text).walk("VEVENT"):
                    ds, de = ve.get("DTSTART"), ve.get("DTEND")
                    if not ds:
                        continue
                    s = ds.dt
                    e = de.dt if de else (s + timedelta(days=1) if not isinstance(s, datetime) else s + timedelta(hours=1))
                    all_day = not isinstance(s, datetime)
                    st = _local_midnight(s) if all_day else (s if s.tzinfo else s.astimezone())
                    et = _local_midnight(e) if all_day else (e if e.tzinfo else e.astimezone())
                    if et <= st:                     # Yandex has zero-length "reminder" events: show them as 30 min
                        et = st + (timedelta(days=1) if all_day else timedelta(minutes=30))
                    recurring = bool(ve.get("RECURRENCE-ID") or ve.get("RRULE"))
                    # ext_id = the .ics resource (writable); recurring instances get "#start" and stay read-only
                    ext = rhref + (f"#{st.isoformat()}" if recurring else "")
                    out.append({"ext_id": ext[:300], "cal": name, "ro": recurring, "title": str(ve.get("SUMMARY") or "(без названия)"),
                                "start": st, "end": et, "all_day": all_day, "location": str(ve.get("LOCATION") or ""),
                                "notes": str(ve.get("DESCRIPTION") or "")[:4000]})
    return out


# ---------- sync ----------
async def sync(provider: str) -> dict:
    uid = owner(provider)
    if not uid:
        return {"provider": provider, "skipped": "не подключён"}
    start = datetime.now().astimezone() - PAST
    end = datetime.now().astimezone() + FUTURE
    try:
        items = await (fetch_google if provider == "google" else fetch_yandex)(start, end)
    except Exception as e:  # noqa: BLE001
        msg = str(e) if isinstance(e, RuntimeError) else f"нет связи ({type(e).__name__})"
        log.warning("calendar sync %s failed: %s", provider, type(e).__name__)
        _status[provider] = {"at": now().isoformat(), "count": _status.get(provider, {}).get("count", 0), "error": msg}
        return {"provider": provider, "error": msg}
    seen = set()
    with SessionLocal() as db:
        existing = {e.ext_id: e for e in db.scalars(select(Event).where(Event.user_id == uid, Event.ext_source == provider))}
        for it in items:
            if it["ext_id"] in seen or it["end"] <= it["start"]:
                continue
            seen.add(it["ext_id"])
            e = existing.get(it["ext_id"])
            if not e:
                e = Event(user_id=uid, ext_source=provider, ext_id=it["ext_id"], source=provider, remind_minutes=15)
                db.add(e)
            new_start = _naive_utc(it["start"])
            if e.start != new_start:
                e.reminded = False                    # moved upstream -> remind again
            e.title, e.start, e.end, e.all_day = it["title"][:300], new_start, _naive_utc(it["end"]), it["all_day"]
            e.location, e.notes, e.ext_cal, e.ext_ro = it["location"][:500], it["notes"], it["cal"][:300], bool(it.get("ro"))
        for ext_id, e in existing.items():           # deleted upstream (within the synced window)
            if ext_id not in seen and _naive_utc(start) <= e.start <= _naive_utc(end):
                db.delete(e)
        db.commit()
    _status[provider] = {"at": now().isoformat(), "count": len(seen), "error": None}
    log.info("calendar sync %s: %d events", provider, len(seen))
    return {"provider": provider, "count": len(seen)}


async def sync_all() -> list[dict]:
    async with _lock:
        return [await sync(p) for p in PROVIDERS if owner(p)]


async def loop() -> None:
    await asyncio.sleep(20)
    while True:
        try:
            await sync_all()
        except Exception:  # noqa: BLE001
            log.warning("calendar sync loop error", exc_info=True)
        await asyncio.sleep(SYNC_EVERY)


# ---------- API ----------
@router.get("/accounts")
def accounts(uid: str = Depends(current_user)):
    out = []
    for p, title in PROVIDERS.items():
        o = owner(p)
        out.append({"provider": p, "title": title, "credentials": has_credentials(p),
                    "connected": o is not None and (p != "google" or bool(get_secret("google_refresh_token"))),
                    "mine": o == uid, "status": _status.get(p) if o == uid else None})
    return out


@router.post("/google/connect")
def google_connect(uid: str = Depends(current_user)):
    o = owner("google")
    if o and o != uid:
        raise HTTPException(409, "Google Календарь уже подключён другим пользователем этого компьютера")
    return {"url": google_connect_url(uid)}


@router.post("/yandex/connect")
async def yandex_connect(uid: str = Depends(current_user)):
    if not has_credentials("yandex"):
        raise HTTPException(400, "Пароль приложения Яндекса не настроен")
    o = owner("yandex")
    if o and o != uid:
        raise HTTPException(409, "Яндекс Календарь уже подключён другим пользователем этого компьютера")
    _set_setting("calsync:yandex:owner", uid)
    with SessionLocal() as db:
        audit(db, uid, "calendar.connect", "yandex")
    res = await sync("yandex")
    if res.get("error"):
        _set_setting("calsync:yandex:owner", None)
        raise HTTPException(502, res["error"])
    return res


@router.post("/sync")
async def sync_now(uid: str = Depends(current_user)):
    async with _lock:
        return [await sync(p) for p in PROVIDERS if owner(p) == uid]


@router.delete("/{provider}")
def disconnect(provider: str, uid: str = Depends(current_user)):
    if provider not in PROVIDERS:
        raise HTTPException(404, "Неизвестный календарь")
    if owner(provider) != uid:
        raise HTTPException(404, "Календарь не подключён")
    _set_setting(f"calsync:{provider}:owner", None)
    if provider == "google":
        delete_secret("google_refresh_token")
    with SessionLocal() as db:
        n = 0
        for e in db.scalars(select(Event).where(Event.user_id == uid, Event.ext_source == provider)):
            db.delete(e)
            n += 1
        db.commit()
        audit(db, uid, "calendar.disconnect", provider)
    _status.pop(provider, None)
    return {"ok": True, "removed": n}


# ---------- push (NEMI -> Google / Yandex) ----------
class PushError(Exception):
    pass


def target(uid: str) -> str | None:
    t = _setting(f"calsync:target:{uid}")
    return t if t in PROVIDERS and owner(t) == uid else None


def can_write(e: Event, uid: str) -> bool:
    if not e.ext_source:
        return True
    if e.ext_ro or owner(e.ext_source) != uid:
        return False
    return e.ext_source != "google" or WRITE_SCOPE in (_setting("calsync:google:scope") or "")


def _aware(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def _gtoken() -> str:
    if WRITE_SCOPE not in (_setting("calsync:google:scope") or ""):
        raise PushError("переподключите Google Календарь, чтобы разрешить запись")
    r = httpx.post("https://oauth2.googleapis.com/token", timeout=20, data={
        "client_id": get_secret("google_client_id"), "client_secret": get_secret("google_client_secret"),
        "refresh_token": get_secret("google_refresh_token") or "", "grant_type": "refresh_token"})
    if r.status_code != 200:
        raise PushError("доступ к Google отозван — подключите заново")
    return r.json()["access_token"]


def _gbody(e: Event) -> dict:
    s, en = _aware(e.start).astimezone(), _aware(e.end).astimezone()
    when = (lambda d: {"date": d.date().isoformat()}) if e.all_day else (lambda d: {"dateTime": d.isoformat()})
    return {"summary": e.title, "location": e.location or "", "description": e.notes or "", "start": when(s), "end": when(en)}


def _ycal_href(c: httpx.Client) -> tuple[str, str]:
    def pf(url, body, depth="0"):
        r = c.request("PROPFIND", url, content=body, headers={"Depth": depth, "Content-Type": "application/xml"})
        if r.status_code == 401:
            raise PushError("Яндекс отклонил пароль приложения")
        r.raise_for_status()
        return ET.fromstring(r.content)
    p = pf("/", '<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>').find(".//d:current-user-principal/d:href", NS).text
    home = pf(p, '<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>').find(".//c:calendar-home-set/d:href", NS).text
    x = pf(home, '<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:resourcetype/><d:displayname/>'
                 '<c:supported-calendar-component-set/></d:prop></d:propfind>', "1")
    for resp in x.findall("d:response", NS):
        comps = [k.get("name") for k in resp.findall(".//c:supported-calendar-component-set/c:comp", NS)]
        if resp.find(".//d:resourcetype/c:calendar", NS) is not None and (not comps or "VEVENT" in comps):
            return resp.find("d:href", NS).text, (resp.findtext(".//d:displayname", "", NS) or "").strip()
    raise PushError("в Яндекс Календаре нет календаря для событий")


def _ics(e: Event, uid: str, base=None) -> bytes:
    from icalendar import Calendar, Event as IEvent
    cal = base or Calendar()
    if base is None:
        cal.add("prodid", "-//NEMI//RU")
        cal.add("version", "2.0")
        ve = IEvent()
        ve.add("uid", uid)
        cal.add_component(ve)
    ve = next(iter(cal.walk("VEVENT")))
    seq = int(ve.get("SEQUENCE", 0)) + 1 if base is not None else 0   # a bumped SEQUENCE tells other clients it changed
    if "SEQUENCE" in ve:
        del ve["SEQUENCE"]
    ve.add("sequence", seq)
    for k in ("SUMMARY", "LOCATION", "DESCRIPTION", "DTSTART", "DTEND", "DTSTAMP"):
        if k in ve:
            del ve[k]
    s, en = _aware(e.start), _aware(e.end)
    ve.add("summary", e.title)
    if e.location:
        ve.add("location", e.location)
    if e.notes:
        ve.add("description", e.notes)
    ve.add("dtstart", s.astimezone().date() if e.all_day else s)
    ve.add("dtend", en.astimezone().date() if e.all_day else en)
    ve.add("dtstamp", datetime.now(timezone.utc))
    return cal.to_ical()


def _yclient() -> httpx.Client:
    return httpx.Client(timeout=30, base_url=CALDAV, auth=(get_secret("yandex_caldav_login") or "", get_secret("yandex_caldav_password") or ""))


def push_create(e: Event, provider: str) -> None:
    """Create upstream and turn the local event into a linked one (sets ext_*). Caller commits."""
    try:
        if provider == "google":
            h = {"Authorization": f"Bearer {_gtoken()}"}
            cid = httpx.get("https://www.googleapis.com/calendar/v3/calendars/primary", headers=h, timeout=20).json()["id"]
            r = httpx.post(f"https://www.googleapis.com/calendar/v3/calendars/{urllib.parse.quote(cid)}/events", headers=h, json=_gbody(e), timeout=20)
            r.raise_for_status()
            e.ext_source, e.ext_id, e.ext_cal = "google", f"{cid}|{r.json()['id']}", "основной"
        else:
            with _yclient() as c:
                href, name = _ycal_href(c)
                uid = f"nemi-{e.id}"
                res = href.rstrip("/") + f"/{uid}.ics"
                r = c.put(res, content=_ics(e, uid), headers={"Content-Type": "text/calendar; charset=utf-8", "If-None-Match": "*"})
                r.raise_for_status()
                e.ext_source, e.ext_id, e.ext_cal = "yandex", res, name
        e.ext_ro = False
    except PushError:
        raise
    except Exception as err:  # noqa: BLE001
        raise PushError(f"не удалось записать в {PROVIDERS[provider]} ({type(err).__name__})") from err


def push_update(e: Event) -> None:
    try:
        if e.ext_source == "google":
            cid, gid = e.ext_id.split("|", 1)
            r = httpx.patch(f"https://www.googleapis.com/calendar/v3/calendars/{urllib.parse.quote(cid)}/events/{urllib.parse.quote(gid)}",
                            headers={"Authorization": f"Bearer {_gtoken()}"}, json=_gbody(e), timeout=20)
            r.raise_for_status()
        else:
            from icalendar import Calendar
            with _yclient() as c:
                g = c.get(e.ext_id)
                g.raise_for_status()
                body = _ics(e, "", Calendar.from_ical(g.text))
                r = c.put(e.ext_id, content=body, headers={"Content-Type": "text/calendar; charset=utf-8",
                                                           **({"If-Match": g.headers["etag"]} if g.headers.get("etag") else {})})
                r.raise_for_status()
    except PushError:
        raise
    except Exception as err:  # noqa: BLE001
        raise PushError(f"не удалось сохранить в {PROVIDERS.get(e.ext_source, '')} ({type(err).__name__})") from err


def push_delete(e: Event) -> None:
    try:
        if e.ext_source == "google":
            cid, gid = e.ext_id.split("|", 1)
            r = httpx.delete(f"https://www.googleapis.com/calendar/v3/calendars/{urllib.parse.quote(cid)}/events/{urllib.parse.quote(gid)}",
                             headers={"Authorization": f"Bearer {_gtoken()}"}, timeout=20)
        else:
            with _yclient() as c:
                r = c.delete(e.ext_id)
        if r.status_code not in (200, 204, 404, 410):          # already gone upstream is fine
            r.raise_for_status()
    except PushError:
        raise
    except Exception as err:  # noqa: BLE001
        raise PushError(f"не удалось удалить в {PROVIDERS.get(e.ext_source, '')} ({type(err).__name__})") from err


@router.get("/target")
def target_get(uid: str = Depends(current_user)):
    return {"target": target(uid) or "", "google_write": WRITE_SCOPE in (_setting("calsync:google:scope") or "")}


@router.put("/target")
def target_put(b: dict, uid: str = Depends(current_user)):
    t = (b or {}).get("target") or ""
    if t and (t not in PROVIDERS or owner(t) != uid):
        raise HTTPException(400, "Сначала подключите этот календарь")
    _set_setting(f"calsync:target:{uid}", t or None)
    return {"target": t}
