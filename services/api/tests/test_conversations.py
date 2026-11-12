import time
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch):
    from app import auth, main
    monkeypatch.setattr(auth, "get_secret", lambda n: "k" * 64)   # never read/write the real keyring
    assert "pai-test-" in str(main.settings.data_dir)             # guard: tests run on a throwaway DB
    with TestClient(main.app) as c:
        yield c


def _user(c, name):
    r = c.post("/api/v1/auth/register", json={"name": name, "email": f"{name}-{time.time_ns()}@t.ru", "password": "secret-pass-1"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _conv(uid_headers, title, at):
    from app.db import Conversation, Message, SessionLocal
    from app.auth import read_token
    uid = read_token(uid_headers["Authorization"].split()[1])
    with SessionLocal() as db:
        c = Conversation(user_id=uid, title=title, created=at)
        db.add(c); db.commit()
        db.add(Message(conv_id=c.id, user_id=uid, role="user", content=title, created=at)); db.commit()
        return c.id


def test_list_sorted_by_last_activity_and_isolated(client):
    from app.db import now
    a, b = _user(client, "alice"), _user(client, "bob")
    t = now()
    old = _conv(a, "старый", t - timedelta(hours=2))
    new = _conv(a, "свежий", t - timedelta(minutes=1))
    foreign = _conv(b, "чужой", t)

    rows = client.get("/api/v1/assistant/conversations", headers=a).json()
    assert [r["id"] for r in rows] == [new, old]          # most recent first, bob's dialog not visible
    assert rows[0]["messages"] == 1

    assert client.get(f"/api/v1/assistant/conversations/{foreign}", headers=a).status_code == 404
    assert client.patch(f"/api/v1/assistant/conversations/{foreign}", headers=a, json={"title": "x"}).status_code == 404
    assert client.delete(f"/api/v1/assistant/conversations/{foreign}", headers=a).status_code == 404


def test_rename_and_delete(client):
    from app.db import now
    a = _user(client, "carol")
    cid = _conv(a, "черновик", now())
    assert client.patch(f"/api/v1/assistant/conversations/{cid}", headers=a, json={"title": "  Отчёт  "}).json()["ok"]
    assert client.get(f"/api/v1/assistant/conversations/{cid}", headers=a).json()["title"] == "Отчёт"
    assert client.delete(f"/api/v1/assistant/conversations/{cid}", headers=a).json()["ok"]
    assert client.get("/api/v1/assistant/conversations", headers=a).json() == []
