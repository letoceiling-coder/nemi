import asyncio
import time
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app import calsync, tools


@pytest.fixture()
def client(monkeypatch):
    from app import auth, main
    monkeypatch.setattr(auth, "get_secret", lambda n: "k" * 64)
    monkeypatch.setattr(calsync, "loop", lambda: asyncio.sleep(0))          # no background sync in tests
    with TestClient(main.app) as c:
        yield c


def _user(c, name):
    r = c.post("/api/v1/auth/register", json={"name": name, "email": f"{name}-{time.time_ns()}@t.ru", "password": "secret-pass-1"})
    return {"Authorization": f"Bearer {r.json()['token']}"}, r.json()["user"]["id"]


def _item(ext_id, title, days=1, h=10, ro=False):
    s = (datetime.now().astimezone() + timedelta(days=days)).replace(hour=h, minute=0, second=0, microsecond=0)
    return {"ext_id": ext_id, "cal": "Мои события", "title": title, "start": s, "end": s + timedelta(hours=1),
            "all_day": False, "location": "", "notes": "", "ro": ro}


RNG = lambda: {"start": datetime.now().astimezone().isoformat(), "end": (datetime.now().astimezone() + timedelta(days=3)).isoformat()}


def test_pull_upserts_removes_and_isolates(client, monkeypatch):
    a, uid = _user(client, "a")
    b, _ = _user(client, "b")
    calsync._set_setting("calsync:yandex:owner", uid)
    upstream = [_item("/cal/e1.ics", "Планёрка"), _item("/cal/e2.ics", "Обед")]

    async def fake(start, end):
        return list(upstream)
    monkeypatch.setattr(calsync, "fetch_yandex", fake)
    assert asyncio.run(calsync.sync("yandex")) == {"provider": "yandex", "count": 2}
    evs = {e["title"]: e for e in client.get("/api/v1/events", headers=a, params=RNG()).json()}
    assert set(evs) == {"Планёрка", "Обед"} and evs["Обед"]["ext_source"] == "yandex" and evs["Обед"]["writable"]
    assert client.get("/api/v1/events", headers=b, params=RNG()).json() == []
    upstream[:] = [_item("/cal/e1.ics", "Планёрка (перенос)", h=12)]
    asyncio.run(calsync.sync("yandex"))
    evs = client.get("/api/v1/events", headers=a, params=RNG()).json()
    assert [(e["title"], datetime.fromisoformat(e["start"]).astimezone().hour) for e in evs] == [("Планёрка (перенос)", 12)]
    acc = {x["provider"]: x for x in client.get("/api/v1/calendar/accounts", headers=a).json()}
    assert acc["yandex"]["mine"] and acc["yandex"]["status"]["count"] == 1
    assert client.delete("/api/v1/calendar/yandex", headers=b).status_code == 404
    assert client.delete("/api/v1/calendar/yandex", headers=a).json() == {"ok": True, "removed": 1}


def test_edits_go_upstream_first_and_read_only_is_enforced(client, monkeypatch):
    a, uid = _user(client, "w")
    calsync._set_setting("calsync:yandex:owner", uid)

    async def fake(start, end):
        return [_item("/cal/one.ics", "Созвон"), _item("/cal/rec.ics#x", "Йога", ro=True)]
    monkeypatch.setattr(calsync, "fetch_yandex", fake)
    asyncio.run(calsync.sync("yandex"))
    evs = {e["title"]: e for e in client.get("/api/v1/events", headers=a, params=RNG()).json()}
    # recurring instance: read-only for the API and the agent
    assert not evs["Йога"]["writable"]
    assert client.patch(f"/api/v1/events/{evs['Йога']['id']}", headers=a, json={"title": "x"}).status_code == 409
    with pytest.raises(tools.ToolError):
        asyncio.run(tools.TOOLS["event_update"].run(tools.Ctx(uid=uid, router=None, private=True), {"event_id": evs["Йога"]["id"], "title": "x"}))
    # writable: upstream refuses -> nothing changes locally
    def refuse(e):
        raise calsync.PushError("не удалось сохранить в Яндекс Календарь")
    monkeypatch.setattr(calsync, "push_update", refuse)
    r = client.patch(f"/api/v1/events/{evs['Созвон']['id']}", headers=a, json={"title": "Новое"})
    assert r.status_code == 502
    assert {e["title"] for e in client.get("/api/v1/events", headers=a, params=RNG()).json()} == {"Созвон", "Йога"}
    # upstream accepts -> local change saved
    pushed = []
    monkeypatch.setattr(calsync, "push_update", lambda e: pushed.append(e.title))
    assert client.patch(f"/api/v1/events/{evs['Созвон']['id']}", headers=a, json={"title": "Новое"}).json()["title"] == "Новое"
    assert pushed == ["Новое"]
    deleted = []
    monkeypatch.setattr(calsync, "push_delete", lambda e: deleted.append(e.ext_id))
    assert client.delete(f"/api/v1/events/{evs['Созвон']['id']}", headers=a).json() == {"ok": True}
    assert deleted == ["/cal/one.ics"]
    calsync._set_setting("calsync:yandex:owner", None)


def test_new_events_go_to_target_calendar(client, monkeypatch):
    a, uid = _user(client, "t")
    assert client.put("/api/v1/calendar/target", headers=a, json={"target": "yandex"}).status_code == 400   # not connected
    calsync._set_setting("calsync:yandex:owner", uid)
    assert client.put("/api/v1/calendar/target", headers=a, json={"target": "yandex"}).json() == {"target": "yandex"}

    def ok(e, provider):
        e.ext_source, e.ext_id, e.ext_cal, e.ext_ro = provider, f"/cal/nemi-{e.id}.ics", "Мои события", False
    monkeypatch.setattr(calsync, "push_create", ok)
    start = (datetime.now().astimezone() + timedelta(days=1)).replace(hour=9, minute=0, second=0, microsecond=0)
    r = client.post("/api/v1/events", headers=a, json={"title": "Встреча", "start": start.isoformat()}).json()
    assert r["ext_source"] == "yandex" and r["push_error"] is None and r["writable"]
    # agent too
    out = asyncio.run(tools.TOOLS["event_create"].run(tools.Ctx(uid=uid, router=None, private=True),
                                                     {"title": "Звонок", "start": start.replace(hour=15).strftime("%Y-%m-%dT%H:%M")}))
    assert "Записано также в Яндекс Календарь" in out

    def fail(e, provider):
        raise calsync.PushError("не удалось записать в Яндекс Календарь (ConnectError)")
    monkeypatch.setattr(calsync, "push_create", fail)
    r = client.post("/api/v1/events", headers=a, json={"title": "Офлайн", "start": start.replace(hour=18).isoformat()}).json()
    assert r["ext_source"] is None and "не удалось" in r["push_error"]         # kept locally, user is told
    calsync._set_setting("calsync:yandex:owner", None)
    calsync._set_setting(f"calsync:target:{uid}", None)


def test_ics_roundtrip_and_google_body():
    from icalendar import Calendar
    from app.db import Event
    s = datetime(2026, 11, 20, 12, 0)
    e = Event(id="x1", title="Созвон", start=s, end=s + timedelta(minutes=30), all_day=False, location="Телемост", notes="")
    cal = Calendar.from_ical(calsync._ics(e, "nemi-x1"))
    ve = next(iter(cal.walk("VEVENT")))
    assert str(ve["SUMMARY"]) == "Созвон" and str(ve["UID"]) == "nemi-x1" and ve["DTEND"].dt - ve["DTSTART"].dt == timedelta(minutes=30)
    body = calsync._gbody(e)
    assert body["summary"] == "Созвон" and "dateTime" in body["start"]
    e.all_day = True
    assert "date" in calsync._gbody(e)["start"]


def test_sync_error_is_reported(client, monkeypatch):
    _, uid = _user(client, "e")
    calsync._set_setting("calsync:google:owner", uid)

    async def boom(start, end):
        raise RuntimeError("доступ к Google отозван — подключите заново")
    monkeypatch.setattr(calsync, "fetch_google", boom)
    assert asyncio.run(calsync.sync("google"))["error"].startswith("доступ к Google отозван")
    calsync._set_setting("calsync:google:owner", None)
