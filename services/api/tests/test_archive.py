import asyncio
import gzip
import sqlite3
import time
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app import agent, archive, backup, calsync, tools
from app.db import AgentAction, Message, SessionLocal


@pytest.fixture()
def client(monkeypatch):
    from app import auth, main
    monkeypatch.setattr(auth, "get_secret", lambda n: "k" * 64)
    monkeypatch.setattr(calsync, "loop", lambda: asyncio.sleep(0))
    monkeypatch.setattr(backup, "loop", lambda: asyncio.sleep(0))
    with TestClient(main.app) as c:
        yield c


def _user(c, name):
    r = c.post("/api/v1/auth/register", json={"name": name, "email": f"{name}-{time.time_ns()}@t.ru", "password": "secret-pass-1"})
    return {"Authorization": f"Bearer {r.json()['token']}"}, r.json()["user"]["id"]


def test_archive_search_cyrillic_case_kinds_and_isolation(client):
    a, uid = _user(client, "arch")
    b, _ = _user(client, "other")
    client.post("/api/v1/tasks", headers=a, json={"title": "Подписать ДОГОВОР с Ромашкой"})
    client.post("/api/v1/tasks", headers=b, json={"title": "Чужой договор"})
    old = datetime.now(timezone.utc) - timedelta(days=400)
    with SessionLocal() as db:   # a dialog from more than a year ago is still found
        from app.db import Conversation
        conv = Conversation(user_id=uid, title="Смета на ремонт", created=old)
        db.add(conv)
        db.commit()
        db.add(Message(conv_id=conv.id, user_id=uid, role="user", content="Решили: договор подписываем в марте", created=old))
        db.commit()
    r = client.get("/api/v1/archive/search", headers=a, params={"q": "договор"}).json()
    assert {x["kind"] for x in r} == {"task", "message"}
    assert all("Чужой" not in x["title"] for x in r)
    assert r[0]["kind"] == "task"                                     # newest first
    only = client.get("/api/v1/archive/search", headers=a, params={"q": "ДОГОВОР", "kinds": "message"}).json()
    assert len(only) == 1 and "в марте" in only[0]["snippet"] and only[0]["title"] == "Смета на ремонт"
    recent = client.get("/api/v1/archive/search", headers=a, params={"q": "договор", "since": (old + timedelta(days=30)).isoformat()}).json()
    assert [x["kind"] for x in recent] == ["task"]
    assert client.get("/api/v1/archive/search", headers=a, params={"q": "100%"}).json() == []      # LIKE wildcards are escaped
    out = asyncio.run(tools.TOOLS["archive_search"].run(tools.Ctx(uid=uid, router=None, private=True), {"query": "договор", "until": old.date().isoformat()}))
    assert "Смета на ремонт" in out and "Ромашк" not in out
    st = client.get("/api/v1/archive/stats", headers=a).json()
    assert st["messages"] == 1 and st["tasks"] == 1


def test_agent_actions_are_journaled_with_statuses(client):
    a, uid = _user(client, "act")
    run = agent.Run(id="r1", uid=uid, conv_id="c1")
    events = []

    async def push(e):
        events.append(e)
        if e["type"] == "approval":
            agent.answer(uid, "r1", e["id"], False)          # user declines

    agent.RUNS["r1"] = run
    ctx = tools.Ctx(uid=uid, router=None, private=True)
    by = tools.TOOLS
    asyncio.run(agent._tool(run, ctx, by, {"name": "current_datetime", "arguments": "{}"}, push))
    asyncio.run(agent._tool(run, ctx, by, {"name": "task_update", "arguments": '{"task_id": "nope"}'}, push))
    asyncio.run(agent._tool(run, ctx, by, {"name": "memory_forget", "arguments": '{"fact_id": "x"}'}, push))
    r = client.get("/api/v1/activity", headers=a).json()
    assert [i["status"] for i in r["items"]] == ["declined", "error", "ok"]
    assert r["items"][2]["tool"] == "current_datetime" and r["items"][2]["conv_id"] == "c1"
    assert r["stats"]["done_today"] == 1 and r["stats"]["errors_today"] == 1
    assert r["runs"] and r["runs"][0]["id"] == "r1"
    assert [i["status"] for i in client.get("/api/v1/activity", headers=a, params={"status": "error"}).json()["items"]] == ["error"]
    agent.RUNS.pop("r1")
    b, _ = _user(client, "act2")
    assert client.get("/api/v1/activity", headers=b).json()["items"] == []


def test_backup_roundtrip_retention_and_restore(client, monkeypatch, tmp_path):
    store: dict[str, bytes] = {}
    monkeypatch.setattr(backup.storage, "put_file", lambda cfg, k, d, ct="": store.__setitem__(k, d))
    monkeypatch.setattr(backup.storage, "get_file", lambda cfg, k: store[k])
    monkeypatch.setattr(backup, "list_backups", lambda: [{"key": k, "size": len(v), "at": ""} for k, v in sorted(store.items(), reverse=True)])
    monkeypatch.setattr(backup, "_prune", lambda: None)
    monkeypatch.setattr(backup, "PENDING", tmp_path / "app.db.restore")
    a, _ = _user(client, "bk")
    st = client.post("/api/v1/system/backups", headers=a).json()
    assert st["ok"] and st["key"] in store
    snap = tmp_path / "snap.db"
    snap.write_bytes(gzip.decompress(store[st["key"]]))
    assert sqlite3.connect(snap).execute("select count(*) from users").fetchone()[0] >= 1
    info = client.get("/api/v1/system/backups", headers=a).json()
    assert info["last_ok"]["key"] == st["key"] and len(info["items"]) == 1
    assert client.post("/api/v1/system/backups/restore", headers=a, json={"key": "../etc"}).status_code == 400
    assert client.post("/api/v1/system/backups/restore", headers=a, json={"key": st["key"]}).json()["restart"]
    assert (tmp_path / "app.db.restore").exists()


def test_backup_failure_is_reported(client, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("S3 keys are not set in Credential Manager")
    monkeypatch.setattr(backup.storage, "put_file", boom)
    a, _ = _user(client, "bk2")
    r = client.post("/api/v1/system/backups", headers=a)
    assert r.status_code == 502 and "ключи" in r.json()["detail"]


def test_keep_set_keeps_recent_and_monthly():
    keys = [f"backups/db/nemi-{d:%Y%m%d}-030000.db.gz" for d in (datetime(2025, 1, 1) + timedelta(days=i) for i in range(400))]
    keep = backup.keep_set(keys)
    assert set(keys[-30:]) <= keep
    assert "backups/db/nemi-20250101-030000.db.gz" in keep and "backups/db/nemi-20250201-030000.db.gz" in keep
    assert "backups/db/nemi-20250102-030000.db.gz" not in keep
    assert len(keep) == 30 + 14 - 1        # 14 months, February 2026 is already among the recent ones


def test_extract_text_pdf_docx_and_refusals(client):
    import base64
    import io
    import docx
    a, _ = _user(client, "files")
    d = docx.Document()
    d.add_paragraph("Договор поставки № 15")
    t = d.add_table(rows=1, cols=2)
    t.cell(0, 0).text, t.cell(0, 1).text = "Сумма", "120 000 ₽"
    buf = io.BytesIO()
    d.save(buf)
    r = client.post("/api/v1/files/extract", headers=a, json={"name": "dog.docx", "data": base64.b64encode(buf.getvalue()).decode()}).json()
    assert "Договор поставки" in r["text"] and "120 000" in r["text"]
    r = client.post("/api/v1/files/extract", headers=a, json={"name": "a.txt", "data": base64.b64encode("Привет".encode("cp1251")).decode()}).json()
    assert r["text"] == "Привет"
    assert client.post("/api/v1/files/extract", headers=a, json={"name": "x.exe", "data": "AAAA"}).status_code == 415
    assert client.post("/api/v1/files/extract", headers=a, json={"name": "x.pdf", "data": base64.b64encode(b"not a pdf").decode()}).status_code == 422
