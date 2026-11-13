import asyncio
import pytest
from app.providers import ModelProvider, ModelRouter, ProviderError


class Fake(ModelProvider):
    """ok: True | False (HTTP 503) | {model: bool}; delay: seconds before the first token (a busy GPU)."""
    def __init__(self, name, ok=True, key=True, fail_after=None, delay=0, status=503):
        self.name, self.ok, self.key, self.fail_after, self.delay, self.status = name, ok, key, fail_after, delay, status
        self.calls = []

    def configured(self): return self.key
    async def list_models(self): return ["m"]

    async def stream_chat(self, messages, model, temperature, kind="chat"):
        self.calls.append(model)
        self.last_model = model or "m"
        ok = self.ok.get(model, True) if isinstance(self.ok, dict) else self.ok
        if self.delay:
            await asyncio.sleep(self.delay)
        if not ok:
            raise ProviderError(f"{self.name}: HTTP {self.status}", self.status)
        for i, t in enumerate(["a", "b", "c"]):
            if self.fail_after is not None and i == self.fail_after:
                raise ProviderError(f"{self.name}: drop")
            yield t


@pytest.fixture(autouse=True)
def chain(monkeypatch):
    from app import budget, providers
    monkeypatch.setattr(providers.settings, "chat_free_models", ["free-a:free", "free-b:free"])
    monkeypatch.setattr(providers.settings, "chat_paid_models", ["cheap"])
    monkeypatch.setattr(providers.settings, "first_token_own", 0.2)
    monkeypatch.setattr(providers.settings, "first_token_cloud", 0.2)
    budget._remote["free_left"] = None


def run(router, **kw):
    async def go():
        return [e async for e in router.stream([{"role": "user", "content": "hi"}], **kw)]
    return asyncio.run(go())


def meta(ev):
    return next(v for k, v in ev if k == "meta")


def test_primary_used_when_healthy():
    ev = run(ModelRouter([Fake("siteaccess"), Fake("openrouter")]))
    assert meta(ev)["provider"] == "siteaccess" and not meta(ev)["fallback"]
    assert "".join(v for k, v in ev if k == "delta") == "abc"


def test_busy_own_server_falls_to_free_model_by_first_token_deadline():
    cloud = Fake("openrouter")
    ev = run(ModelRouter([Fake("siteaccess", delay=2), cloud]))
    assert meta(ev)["model"] == "free-a:free" and meta(ev)["fallback"]
    assert "занят" in meta(ev)["skipped"][0]


def test_free_models_fail_then_cheap_paid_model():
    cloud = Fake("openrouter", ok={"free-a:free": False, "free-b:free": False})
    ev = run(ModelRouter([Fake("siteaccess", ok=False), cloud]))
    assert meta(ev)["model"] == "cheap" and cloud.calls == ["free-a:free", "free-b:free", "cheap"]


def test_recently_failed_route_is_skipped():
    cloud = Fake("openrouter", ok={"free-a:free": False}, status=429)
    r = ModelRouter([Fake("siteaccess", ok=False), cloud])
    run(r)
    cloud.calls.clear()
    ev = run(r)
    assert "free-a:free" not in cloud.calls and meta(ev)["model"] == "free-b:free"
    assert any("пропущен" in s for s in meta(ev)["skipped"])


def test_free_models_skipped_when_daily_quota_is_used_up():
    from app import budget
    budget._remote["free_left"] = 0
    cloud = Fake("openrouter")
    ev = run(ModelRouter([Fake("siteaccess", ok=False), cloud]))
    assert meta(ev)["model"] == "cheap"


def test_free_models_work_when_money_limit_is_reached(monkeypatch):
    from app import budget, providers
    async def over():
        raise budget.BudgetExceeded("лимит")
    monkeypatch.setattr(budget, "check", over)
    p = providers.OpenAICompatProvider("openrouter", "https://x", "k", "m", paid=True)
    asyncio.run(p._guard("free-a:free"))                  # free: allowed
    with pytest.raises(ProviderError):
        asyncio.run(p._guard("cheap"))                     # paid: refused


def test_private_mode_never_leaves_own_server():
    cloud = Fake("openrouter")
    ev = run(ModelRouter([Fake("siteaccess", delay=2), cloud]), only="siteaccess")
    assert ev[-1][0] == "error" and not cloud.calls


def test_fallback_when_primary_has_no_key():
    ev = run(ModelRouter([Fake("siteaccess", key=False), Fake("openrouter")]))
    assert meta(ev)["provider"] == "openrouter"


def test_midstream_failure_does_not_switch_provider():
    ev = run(ModelRouter([Fake("siteaccess", fail_after=1), Fake("openrouter")]))
    assert [k for k, _ in ev][-1] == "error"
    assert [v["provider"] for k, v in ev if k == "meta"] == ["siteaccess"]


def test_all_down_reports_error():
    ev = run(ModelRouter([Fake("siteaccess", ok=False), Fake("openrouter", ok=False)]))
    assert len(ev) == 1 and ev[0][0] == "error" and ev[0][1].startswith("Модели недоступны: siteaccess: HTTP 503; free-a:free")


def test_token_roundtrip_and_tamper(monkeypatch):
    from app import auth
    monkeypatch.setattr(auth, "get_secret", lambda n: "k" * 64)
    t = auth.make_token("u1")
    assert auth.read_token(t) == "u1"
    assert auth.read_token(t[:-1] + ("0" if t[-1] != "0" else "1")) is None


def test_role_chain_falls_through_and_private_is_own_server_only(monkeypatch):
    from app import providers
    monkeypatch.setitem(providers.settings.role_models, "main", ["bad", "good"])

    class P(Fake):
        async def stream_chat(self, messages, model, temperature, kind="chat"):
            self.last_model = model
            if model == "bad":
                raise ProviderError("403")
            yield "ok"

    r = ModelRouter([Fake("siteaccess", key=False), P("openrouter")])
    text, meta = asyncio.run(r.complete_role("main", []))
    assert text == "ok" and meta["model"] == "good"
    with pytest.raises(ProviderError):           # private never falls back to the cloud
        asyncio.run(r.complete_role("main", [], private=True))


def test_only_mode_never_falls_back_to_cloud():
    async def go(r):
        return [e async for e in r.stream([{"role": "user", "content": "hi"}], prefer="openrouter", only="siteaccess")]
    ok = asyncio.run(go(ModelRouter([Fake("siteaccess"), Fake("openrouter")])))
    assert ok[0][1]["provider"] == "siteaccess"
    down = asyncio.run(go(ModelRouter([Fake("siteaccess", ok=False), Fake("openrouter")])))
    assert [k for k, _ in down] == ["error"] and "openrouter" not in down[0][1]


def test_private_only_setting_api(monkeypatch):
    import time
    from fastapi.testclient import TestClient
    from app import auth, main
    monkeypatch.setattr(auth, "get_secret", lambda n: "k" * 64)
    with TestClient(main.app) as c:
        hs = []
        for n in ("p1", "p2"):
            r = c.post("/api/v1/auth/register", json={"name": n, "email": f"{n}-{time.time_ns()}@t.ru", "password": "secret-pass-1"})
            hs.append({"Authorization": f"Bearer {r.json()['token']}"})
        assert c.get("/api/v1/models/settings", headers=hs[0]).json() == {"private_only": False}
        assert c.put("/api/v1/models/settings", headers=hs[0], json={"private_only": True}).json() == {"private_only": True}
        assert c.get("/api/v1/models/settings", headers=hs[0]).json() == {"private_only": True}
        assert c.get("/api/v1/models/settings", headers=hs[1]).json() == {"private_only": False}   # per user
        # manual memory add in private mode must not call embeddings (the cloud)
        called = []

        async def no_embed(texts):
            called.append(texts)
            raise AssertionError("cloud embeddings called in private mode")
        monkeypatch.setattr(main.router_models, "embed", no_embed)
        assert c.post("/api/v1/memory", headers=hs[0], json={"text": "Любит чай", "kind": "fact"}).status_code == 200
        assert not called
