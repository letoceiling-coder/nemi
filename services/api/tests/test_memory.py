import asyncio
import time

import pytest
from fastapi.testclient import TestClient

from app import memory
from app.providers import ProviderError


class FakeRouter:
    """complete_role returns a canned extraction; embed maps known words to fixed vectors."""
    def __init__(self, raw='{"facts": []}', embed_ok=True):
        self.raw, self.embed_ok, self.calls = raw, embed_ok, []

    async def complete_role(self, role, messages, private=False, temperature=0.2):
        self.calls.append(("complete", role, private))
        return self.raw, {"model": "fake"}

    async def embed(self, texts):
        self.calls.append(("embed", texts[0]))
        if not self.embed_ok:
            raise ProviderError("no embeddings")
        t = texts[0].lower()
        return [[1.0, 0.0] if "кофе" in t else [0.0, 1.0] if "python" in t else [0.6, 0.8]]


def test_secret_filter():
    for s in ["мой пароль qwerty123", "карта 4276 1234 5678 9012", "ключ sk-or-v1-abcdef123456", "API key: zzz"]:
        assert memory.is_secret(s), s
    for s in ["Пользователя зовут Анна", "Любит короткие ответы", "Работает в студии SiteAccess"]:
        assert not memory.is_secret(s), s


def test_parse_facts_tolerant_and_drops_secrets():
    raw = 'Вот:\n```json\n{"facts":[{"text":"Пользователя зовут Анна","kind":"profile"},' \
          '{"text":"Пароль от почты 12345","kind":"fact"},{"text":"Любит кофе","kind":"weird"}]}\n```'
    assert memory.parse_facts(raw) == [{"text": "Пользователя зовут Анна", "kind": "profile"},
                                       {"text": "Любит кофе", "kind": "fact"}]
    assert memory.parse_facts("не JSON") == []


@pytest.fixture
def client(monkeypatch):
    from app import auth, main
    monkeypatch.setattr(auth, "get_secret", lambda n: "k" * 64)
    assert "pai-test-" in str(main.settings.data_dir)
    with TestClient(main.app) as c:
        yield c, main


def _user(c, name):
    r = c.post("/api/v1/auth/register", json={"name": name, "email": f"{name}-{time.time_ns()}@t.ru", "password": "secret-pass-1"})
    from app.auth import read_token
    tok = r.json()["token"]
    return {"Authorization": f"Bearer {tok}"}, read_token(tok)


def test_remember_dedupes_and_private_never_embeds(client):
    c, main = client
    _, uid = _user(c, "mem1")
    r = FakeRouter('{"facts":[{"text":"Пользователь любит кофе","kind":"preference"}]}')
    with main.SessionLocal() as db:
        assert asyncio.run(memory.remember(db, r, uid, "c1", "Я обожаю кофе по утрам", private=False)) == ["Пользователь любит кофе"]
        # same meaning, different wording -> similar embedding -> no duplicate
        r.raw = '{"facts":[{"text":"Пользователь очень любит кофе","kind":"preference"}]}'
        assert asyncio.run(memory.remember(db, r, uid, "c1", "Кофе — моя любовь, правда", private=False)) == []
        assert [f.text for f in memory.user_facts(db, uid)] == ["Пользователь очень любит кофе"]

        p = FakeRouter('{"facts":[{"text":"Пишет на Python","kind":"profile"}]}')
        asyncio.run(memory.remember(db, p, uid, "c2", "Я пишу на Python каждый день", private=True))
        assert ("complete", "bulk", True) in p.calls and not any(k == "embed" for k, *_ in p.calls)

        # a message that is basically a secret is never sent for extraction
        s = FakeRouter()
        assert asyncio.run(memory.remember(db, s, uid, "c3", "мой пароль qwerty123", private=False)) == [] and not s.calls


def test_recall_all_when_few_and_ranked_when_many(client, monkeypatch):
    c, main = client
    _, uid = _user(c, "mem2")
    r = FakeRouter()
    with main.SessionLocal() as db:
        asyncio.run(memory.add_fact(db, r, uid, "Любит кофе"))
        asyncio.run(memory.add_fact(db, r, uid, "Пишет на Python"))
        assert set(asyncio.run(memory.recall(db, r, uid, "что угодно"))) == {"Любит кофе", "Пишет на Python"}
        monkeypatch.setattr(memory, "ALL_FACTS_LIMIT", 1)
        monkeypatch.setattr(memory, "TOP_K", 1)
        assert asyncio.run(memory.recall(db, r, uid, "посоветуй кофе")) == ["Любит кофе"]
        assert asyncio.run(memory.recall(db, FakeRouter(embed_ok=False), uid, "кофе")) == ["Пишет на Python"]  # newest first


def test_memory_api_isolation_and_secret_guard(client, monkeypatch):
    c, main = client
    monkeypatch.setattr(main, "router_models", FakeRouter(embed_ok=False))
    a, _ = _user(c, "mem3")
    b, _ = _user(c, "mem4")
    fid = c.post("/api/v1/memory", headers=a, json={"text": "Пользователя зовут Анна", "kind": "profile"}).json()["id"]
    assert c.post("/api/v1/memory", headers=a, json={"text": "пароль от банка 1234"}).status_code == 422
    assert [f["text"] for f in c.get("/api/v1/memory", headers=a).json()] == ["Пользователя зовут Анна"]
    assert c.get("/api/v1/memory", headers=b).json() == []
    assert c.patch(f"/api/v1/memory/{fid}", headers=b, json={"text": "взлом"}).status_code == 404
    assert c.delete(f"/api/v1/memory/{fid}", headers=b).status_code == 404
    assert c.patch(f"/api/v1/memory/{fid}", headers=a, json={"text": "Пользователя зовут Аня", "kind": "profile"}).json()["text"] == "Пользователя зовут Аня"
    assert c.delete("/api/v1/memory", headers=a).json()["deleted"] == 1
    # audit never contains the fact text
    assert all("Ан" not in e["detail"] for e in c.get("/api/v1/system/audit", headers=a).json())
