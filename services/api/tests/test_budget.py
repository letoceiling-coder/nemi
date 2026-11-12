import asyncio
import time

import httpx
import pytest
from fastapi.testclient import TestClient

from app import budget, providers
from app.db import SessionLocal, SpendEntry, init_db


@pytest.fixture(autouse=True)
def clean(monkeypatch):
    init_db()
    with SessionLocal() as db:
        db.query(SpendEntry).delete()
        db.commit()
    budget.set_limit(10.0)
    budget._remote.update(value=0.0, month="", at=0.0)

    async def no_network(force=False):
        return None
    monkeypatch.setattr(budget, "refresh_remote", no_network)


def test_levels_ok_warn_stop():
    assert budget.status()["level"] == "ok"
    budget.record("m", 7.9, "chat")
    assert budget.status()["level"] == "ok"
    budget.record("m", 0.2, "chat")                       # 8.1 / 10
    assert budget.status()["level"] == "warn"
    asyncio.run(budget.check())                          # warning does not block
    budget.record("m", 2.0, "chat")
    st = budget.status()
    assert st["level"] == "stop" and st["spent"] == pytest.approx(10.1)
    with pytest.raises(budget.BudgetExceeded):
        asyncio.run(budget.check())
    budget.set_limit(0)                                  # 0 = no limit
    assert budget.status()["level"] == "ok"


def test_remote_usage_counts_when_higher():
    budget.record("m", 1.0, "chat")
    budget._remote.update(value=9.5, month=budget._month())   # spend made with the same key elsewhere
    assert budget.status()["spent"] == pytest.approx(9.5) and budget.status()["level"] == "warn"
    budget._remote.update(month="1999-01")                      # last month's figure is ignored
    assert budget.status()["spent"] == pytest.approx(1.0)


def test_paid_provider_refuses_before_any_request(monkeypatch):
    monkeypatch.setattr(providers, "get_secret", lambda n: "fake-key")

    def boom(*a, **k):
        raise AssertionError("network must not be touched when the limit is reached")
    monkeypatch.setattr(httpx, "AsyncClient", boom)
    budget.record("m", 10.0, "chat")
    p = providers.OpenAICompatProvider("openrouter", "https://x", "openrouter_api_key", "m", paid=True)

    async def run():
        with pytest.raises(providers.ProviderError, match="лимит"):
            async for _ in p.stream_chat([{"role": "user", "content": "hi"}], "m"):
                pass
        with pytest.raises(providers.ProviderError, match="лимит"):
            await p.embed(["x"], "e")
    asyncio.run(run())


def test_cost_from_stream_is_recorded(monkeypatch):
    monkeypatch.setattr(providers, "get_secret", lambda n: "fake-key")
    sse = ('data: {"choices":[{"delta":{"content":"Привет"}}]}\n\n'
           'data: {"choices":[{"delta":{"content":""}}],"usage":{"cost":0.0123}}\n\ndata: [DONE]\n\n')

    def handler(req):
        assert b'"usage"' in req.content                   # cost reporting requested from OpenRouter
        return httpx.Response(200, text=sse)
    real = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **k: real(transport=httpx.MockTransport(handler), **k))
    p = providers.OpenAICompatProvider("openrouter", "https://x", "openrouter_api_key", "m", paid=True)

    async def run():
        return "".join([c async for c in p.stream_chat([{"role": "user", "content": "hi"}], "m")])
    assert asyncio.run(run()) == "Привет"
    assert budget.local_spent() == pytest.approx(0.0123)


def test_budget_api(monkeypatch):
    from app import auth, main
    monkeypatch.setattr(auth, "get_secret", lambda n: "k" * 64)
    with TestClient(main.app) as c:
        r = c.post("/api/v1/auth/register", json={"name": "b", "email": f"b-{time.time_ns()}@t.ru", "password": "secret-pass-1"})
        h = {"Authorization": f"Bearer {r.json()['token']}"}
        assert c.get("/api/v1/system/budget").status_code == 401
        assert c.get("/api/v1/system/budget", headers=h).json()["limit"] == 10.0
        assert c.put("/api/v1/system/budget", headers=h, json={"limit": -1}).status_code == 422
        assert c.put("/api/v1/system/budget", headers=h, json={"limit": 25}).json()["limit"] == 25.0
        assert budget.get_limit() == 25.0
