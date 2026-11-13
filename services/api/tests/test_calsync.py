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


def _item(ext_id, title, days=1, h=10):
    s = (datetime.now().astimezone() + timedelta(days=days)).replace(hour=h, minute=0, second=0, microsecond=0)
    return {"ext_id": ext_id, "cal": "Мои события", "title": title, "start": s, "end": s + timedelta(hours=1),
            "all_day": False, "location": "", "notes": ""}


def test_sync_upserts_removes_and_is_read_only(client, monkeypatch):
    a, uid = _user(client, "a")
    b, _ = _user(client, "b")
    calsync._set_setting("calsync:yandex:owner", uid)
    upstream = [_item("e1", "Планёрка"), _item("e2", "Обед")]

    async def fake(start, end):
        return list(upstream)
    monkeypatch.setattr(calsync, "fetch_yandex", fake)
    assert asyncio.run(calsync.sync("yandex")) == {"provider": "yandex", "count": 2}
    rng = {"start": datetime.now().astimezone().isoformat(), "end": (datetime.now().astimezone() + timedelta(days=3)).isoformat()}
    evs = {e["title"]: e for e in client.get("/api/v1/events", headers=a, params=rng).json()}
    assert set(evs) == {"Планёрка", "Обед"} and evs["Обед"]["ext_source"] == "yandex"
    assert client.get("/api/v1/events", headers=b, params=rng).json() == []          # only the owner gets them
    # imported events are read-only in NEMI (API and agent)
    assert client.patch(f"/api/v1/events/{evs['Обед']['id']}", headers=a, json={"title": "x"}).status_code == 409
    assert client.delete(f"/api/v1/events/{evs['Обед']['id']}", headers=a).status_code == 409
    with pytest.raises(tools.ToolError):
        asyncio.run(tools.TOOLS["event_update"].run(tools.Ctx(uid=uid, router=None, private=True), {"event_id": evs["Обед"]["id"], "title": "x"}))
    # renamed + moved upstream, the other one deleted upstream
    upstream[:] = [dict(_item("e1", "Планёрка (перенос)", h=12))]
    asyncio.run(calsync.sync("yandex"))
    evs = client.get("/api/v1/events", headers=a, params=rng).json()
    assert [(e["title"], datetime.fromisoformat(e["start"]).astimezone().hour) for e in evs] == [("Планёрка (перенос)", 12)]
    # accounts view + disconnect removes imported events
    acc = {x["provider"]: x for x in client.get("/api/v1/calendar/accounts", headers=a).json()}
    assert acc["yandex"]["mine"] and acc["yandex"]["status"]["count"] == 1
    assert client.delete("/api/v1/calendar/yandex", headers=b).status_code == 404
    assert client.delete("/api/v1/calendar/yandex", headers=a).json() == {"ok": True, "removed": 1}
    assert client.get("/api/v1/events", headers=a, params=rng).json() == []


def test_sync_error_keeps_events_and_reports(client, monkeypatch):
    _, uid = _user(client, "e")
    calsync._set_setting("calsync:google:owner", uid)

    async def boom(start, end):
        raise RuntimeError("доступ к Google отозван — подключите заново")
    monkeypatch.setattr(calsync, "fetch_google", boom)
    assert asyncio.run(calsync.sync("google"))["error"].startswith("доступ к Google отозван")
    calsync._set_setting("calsync:google:owner", None)
