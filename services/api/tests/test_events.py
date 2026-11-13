import asyncio
import time
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app import events, tools


@pytest.mark.parametrize("text,rest,mins", [
    ("завтра в 15:00 созвон с Иваном на 30 минут", "завтра в 15:00 созвон с Иваном", 30),
    ("встреча в пятницу в 10 на полчаса", "встреча в пятницу в 10", 30),
    ("планёрка завтра в 9:00 на 2 часа", "планёрка завтра в 9:00", 120),
    ("обед с партнёром завтра в 13", "обед с партнёром завтра в 13", None),
])
def test_duration_from_text(text, rest, mins):
    assert events.duration_from_text(text) == (rest, mins)


@pytest.fixture()
def client(monkeypatch):
    from app import auth, main
    monkeypatch.setattr(auth, "get_secret", lambda n: "k" * 64)
    with TestClient(main.app) as c:
        yield c


def _user(c, name="u"):
    r = c.post("/api/v1/auth/register", json={"name": name, "email": f"{name}-{time.time_ns()}@t.ru", "password": "secret-pass-1"})
    return {"Authorization": f"Bearer {r.json()['token']}"}, r.json()["user"]["id"]


def _at(days=0, h=10, m=0):
    return (datetime.now().astimezone() + timedelta(days=days)).replace(hour=h, minute=m, second=0, microsecond=0)


def test_events_quick_conflicts_move_and_isolation(client):
    a, _ = _user(client, "a")
    b, _ = _user(client, "b")
    e1 = client.post("/api/v1/events", headers=a, json={"title": "завтра в 15:00 созвон с Иваном на 30 минут", "quick": True}).json()
    assert e1["title"] == "Созвон с Иваном" and e1["conflicts"] == []
    s, e = datetime.fromisoformat(e1["start"]), datetime.fromisoformat(e1["end"])
    assert e - s == timedelta(minutes=30) and s.astimezone().hour == 15
    # overlapping event is created but reported
    e2 = client.post("/api/v1/events", headers=a, json={"title": "Планёрка", "start": _at(1, 15, 15).isoformat()}).json()
    assert [c["id"] for c in e2["conflicts"]] == [e1["id"]]
    # all-day events don't block time
    allday = client.post("/api/v1/events", headers=a, json={"title": "День рождения", "start": _at(1).isoformat(), "all_day": True}).json()
    assert allday["conflicts"] == [] and allday["all_day"]
    rng = {"start": _at(1, 0).isoformat(), "end": _at(2, 0).isoformat()}
    assert {x["title"] for x in client.get("/api/v1/events", headers=a, params=rng).json()} == {"Созвон с Иваном", "Планёрка", "День рождения"}
    # moving keeps the duration
    moved = client.patch(f"/api/v1/events/{e1['id']}", headers=a, json={"start": _at(2, 9).isoformat()}).json()
    assert datetime.fromisoformat(moved["end"]) - datetime.fromisoformat(moved["start"]) == timedelta(minutes=30)
    assert client.patch(f"/api/v1/events/{e1['id']}", headers=a, json={"end": _at(1, 8).isoformat()}).status_code == 422
    # another user: nothing visible, nothing writable
    assert client.get("/api/v1/events", headers=b, params=rng).json() == []
    assert client.patch(f"/api/v1/events/{e1['id']}", headers=b, json={"title": "x"}).status_code == 404
    assert client.delete(f"/api/v1/events/{e1['id']}", headers=b).status_code == 404
    assert client.post("/api/v1/events", headers=a, json={"title": "без времени", "quick": True}).status_code == 422


def test_event_reminder_fires_once_before_start(client):
    a, _ = _user(client, "r")
    soon = datetime.now().astimezone() + timedelta(minutes=10)
    later = datetime.now().astimezone() + timedelta(hours=3)
    e = client.post("/api/v1/events", headers=a, json={"title": "Созвон", "start": soon.isoformat(), "remind_minutes": 15}).json()
    client.post("/api/v1/events", headers=a, json={"title": "Потом", "start": later.isoformat()})
    client.post("/api/v1/events", headers=a, json={"title": "Без напоминания", "start": soon.isoformat(), "remind_minutes": 0})
    due = client.get("/api/v1/reminders/due", headers=a).json()
    assert [(x["kind"], x["id"]) for x in due] == [("event", e["id"])]
    assert client.get("/api/v1/reminders/due", headers=a).json() == []


def test_agent_calendar_tools_warn_about_conflicts_and_overview(client):
    _, uid = _user(client, "ag")
    ctx = tools.Ctx(uid=uid, router=None, private=True)
    day = _at(3)
    run = lambda name, args: asyncio.run(tools.TOOLS[name].run(ctx, args))
    out1 = run("event_create", {"title": "Созвон с Иваном", "start": day.replace(hour=15).strftime("%Y-%m-%dT%H:%M"), "duration_minutes": 30})
    assert "ВНИМАНИЕ" not in out1 and "15:00–15:30" in out1
    out2 = run("event_create", {"title": "Встреча с Марией", "start": day.replace(hour=15, minute=15).strftime("%Y-%m-%dT%H:%M")})
    assert "ВНИМАНИЕ" in out2 and "Созвон с Иваном" in out2
    run("task_create", {"title": "Подготовить отчёт", "due": day.strftime("%Y-%m-%d")})
    ov = run("day_overview", {"date": day.strftime("%Y-%m-%d")})
    assert "Созвон с Иваном" in ov and "Встреча с Марией" in ov and "Подготовить отчёт" in ov
    eid = out1.split("[")[1].split("]")[0]
    moved = run("event_update", {"event_id": eid, "start": day.replace(hour=17).strftime("%Y-%m-%dT%H:%M")})
    assert "17:00–17:30" in moved
    assert tools.TOOLS["event_delete"].risk == "confirm" and "Созвон с Иваном" in tools.TOOLS["event_delete"].confirm_text(ctx, {"event_id": eid})
    with pytest.raises(tools.ToolError):
        asyncio.run(tools.TOOLS["event_update"].run(tools.Ctx(uid="other", router=None, private=True), {"event_id": eid, "title": "x"}))
