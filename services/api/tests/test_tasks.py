import asyncio
import time
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app import tasks, tools

BASE = datetime(2026, 11, 13, 10, 0).astimezone()          # Friday, 10:00 local


@pytest.mark.parametrize("text,title,due,has_time", [
    ("завтра в 11:00 проверить договор", "Проверить договор", (2026, 11, 14, 11, 0), True),
    ("позвонить Ивану в пятницу", "Позвонить Ивану", (2026, 11, 20, 23, 59), False),     # next Friday, not today
    ("в 9 утра зарядка", "Зарядка", (2026, 11, 14, 9, 0), True),                       # 9:00 already passed -> tomorrow
    ("сегодня в 9 утра зарядка", "Зарядка", (2026, 11, 13, 9, 0), True),               # said «сегодня»: keep today
    ("сдать отчёт 15.11", "Сдать отчёт", (2026, 11, 15, 23, 59), False),
    ("в 3 дня созвон", "Созвон", (2026, 11, 13, 15, 0), True),
    ("оплатить счёт 5 января", "Оплатить счёт", (2027, 1, 5, 23, 59), False),
    ("купить молоко", "купить молоко", None, False),
])
def test_quick_parse(text, title, due, has_time):
    t, d, ht = tasks.quick_parse(text, BASE)
    assert t == title and ht == has_time
    assert (d.timetuple()[:5] if d else None) == due


def test_quick_parse_relative():
    t, d, ht = tasks.quick_parse("через 2 часа выпить таблетку", BASE)
    assert t == "Выпить таблетку" and ht and d == BASE + timedelta(hours=2)


@pytest.fixture()
def client(monkeypatch):
    from app import auth, main
    monkeypatch.setattr(auth, "get_secret", lambda n: "k" * 64)
    with TestClient(main.app) as c:
        yield c


def _user(c, name="u"):
    r = c.post("/api/v1/auth/register", json={"name": name, "email": f"{name}-{time.time_ns()}@t.ru", "password": "secret-pass-1"})
    return {"Authorization": f"Bearer {r.json()['token']}"}, r.json()["user"]["id"]


def test_tasks_crud_views_and_isolation(client):
    a, _ = _user(client, "a")
    b, _ = _user(client, "b")
    p = client.post("/api/v1/projects", headers=a, json={"name": "Сайт"}).json()
    assert client.post("/api/v1/projects", headers=a, json={"name": "сайт"}).status_code == 409
    t = client.post("/api/v1/tasks", headers=a, json={"title": "завтра в 11:00 проверить договор", "quick": True,
                                                       "project_id": p["id"], "priority": "high"}).json()
    assert t["title"] == "Проверить договор" and t["due_time"] and t["remind_at"] == t["due"] and t["project"] == "Сайт"
    client.post("/api/v1/tasks", headers=a, json={"title": "Без срока"})
    assert [x["title"] for x in client.get("/api/v1/tasks?view=upcoming", headers=a).json()] == ["Проверить договор", "Без срока"]
    assert client.get("/api/v1/tasks?view=today", headers=a).json() == []
    # other user sees nothing and can't touch it
    assert client.get("/api/v1/tasks", headers=b).json() == []
    assert client.patch(f"/api/v1/tasks/{t['id']}", headers=b, json={"status": "done"}).status_code == 404
    assert client.delete(f"/api/v1/tasks/{t['id']}", headers=b).status_code == 404
    assert client.post("/api/v1/tasks", headers=b, json={"title": "x", "project_id": p["id"]}).status_code == 404
    # done + progress
    d = client.patch(f"/api/v1/tasks/{t['id']}", headers=a, json={"status": "done"}).json()
    assert d["status"] == "done" and d["done_at"]
    proj = client.get("/api/v1/projects", headers=a).json()[0]
    assert proj["tasks"] == 1 and proj["done"] == 1 and proj["progress"] == 100
    # deleting a project keeps its tasks
    client.delete(f"/api/v1/projects/{p['id']}", headers=a)
    assert client.get("/api/v1/tasks", headers=a).json()[0]["project_id"] is None


def test_reminder_is_delivered_once_and_not_for_done(client):
    a, _ = _user(client, "r")
    past = (datetime.now().astimezone() - timedelta(minutes=1)).isoformat()
    t1 = client.post("/api/v1/tasks", headers=a, json={"title": "Позвонить", "due": past, "due_time": True, "remind_at": past}).json()
    t2 = client.post("/api/v1/tasks", headers=a, json={"title": "Уже сделано", "remind_at": past}).json()
    client.patch(f"/api/v1/tasks/{t2['id']}", headers=a, json={"status": "done"})
    future = (datetime.now().astimezone() + timedelta(hours=1)).isoformat()
    client.post("/api/v1/tasks", headers=a, json={"title": "Позже", "remind_at": future})
    assert [x["id"] for x in client.get("/api/v1/reminders/due", headers=a).json()] == [t1["id"]]
    assert client.get("/api/v1/reminders/due", headers=a).json() == []          # only once
    assert [x["title"] for x in client.get("/api/v1/tasks?view=overdue", headers=a).json()] == ["Позвонить"]


def test_agent_task_tools(client):
    _, uid = _user(client, "ag")
    ctx = tools.Ctx(uid=uid, router=None, private=True)
    out = asyncio.run(tools.TOOLS["task_create"].run(ctx, {"title": "Позвонить Ивану", "due": "2030-01-10T11:00", "project": "CRM"}))
    assert "Позвонить Ивану" in out and "проект «CRM»" in out and "напоминание 10.01 11:00" in out
    tid = out.split("[")[1].split("]")[0]
    listed = asyncio.run(tools.TOOLS["tasks_list"].run(ctx, {"view": "upcoming"}))
    assert tid in listed
    asyncio.run(tools.TOOLS["task_update"].run(ctx, {"task_id": tid, "status": "done"}))
    assert "[выполнена]" in asyncio.run(tools.TOOLS["tasks_list"].run(ctx, {"view": "done"}))
    assert tools.TOOLS["task_delete"].risk == "confirm"
    assert "Позвонить Ивану" in tools.TOOLS["task_delete"].confirm_text(ctx, {"task_id": tid})
    other = tools.Ctx(uid="someone-else", router=None, private=True)
    with pytest.raises(tools.ToolError):
        asyncio.run(tools.TOOLS["task_update"].run(other, {"task_id": tid, "status": "todo"}))
    with pytest.raises(tools.ToolError):
        asyncio.run(tools.TOOLS["task_create"].run(ctx, {"title": "x y", "due": "завтра"}))
