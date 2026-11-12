import asyncio
import pytest
from app.providers import ModelProvider, ModelRouter, ProviderError


class Fake(ModelProvider):
    def __init__(self, name, ok=True, key=True, fail_after=None):
        self.name, self.ok, self.key, self.fail_after = name, ok, key, fail_after

    def configured(self): return self.key
    async def list_models(self): return ["m"]

    async def stream_chat(self, messages, model, temperature, kind="chat"):
        self.last_model = model or "m"
        if not self.ok:
            raise ProviderError(f"{self.name}: HTTP 503")
        for i, t in enumerate(["a", "b", "c"]):
            if self.fail_after is not None and i == self.fail_after:
                raise ProviderError(f"{self.name}: drop")
            yield t


def run(router):
    async def go():
        return [e async for e in router.stream([{"role": "user", "content": "hi"}])]
    return asyncio.run(go())


def test_primary_used_when_healthy():
    ev = run(ModelRouter([Fake("own"), Fake("or")]))
    assert ev[0][1]["provider"] == "own" and not ev[0][1]["fallback"]
    assert "".join(v for k, v in ev if k == "delta") == "abc"


def test_fallback_when_primary_busy():
    ev = run(ModelRouter([Fake("own", ok=False), Fake("or")]))
    assert ev[0][1]["provider"] == "or" and ev[0][1]["fallback"]


def test_fallback_when_primary_has_no_key():
    ev = run(ModelRouter([Fake("own", key=False), Fake("or")]))
    assert ev[0][1]["provider"] == "or"


def test_midstream_failure_does_not_switch_provider():
    ev = run(ModelRouter([Fake("own", fail_after=1), Fake("or")]))
    assert [k for k, _ in ev][-1] == "error"
    assert all(v != "or" for k, v in ev if k == "meta" for v in [v["provider"]])


def test_all_down_reports_error():
    ev = run(ModelRouter([Fake("own", ok=False), Fake("or", ok=False)]))
    assert ev == [("error", "Модели недоступны: own: HTTP 503; or: HTTP 503")]


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
