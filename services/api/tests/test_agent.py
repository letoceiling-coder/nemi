import asyncio
import json
import time

import pytest

from app import agent, tools
from app.db import MemoryFact, SessionLocal, User, init_db


class ScriptRouter:
    """Fake router: each call to stream() plays the next scripted turn. Records the tools it was offered."""
    def __init__(self, turns):
        self.turns, self.offered, self.seen = list(turns), [], []

    async def stream(self, msgs, model=None, prefer=None, only=None, tools=None, temperature=0.7):
        self.offered.append([t["function"]["name"] for t in tools or []])
        self.seen.append(list(msgs))
        turn = self.turns.pop(0)
        yield "meta", {"provider": "siteaccess", "model": "fake", "fallback": False, "skipped": []}
        for t in turn.get("text", []):
            yield "delta", t
        if turn.get("calls"):
            yield "tool_calls", turn["calls"]

    async def embed(self, texts):
        raise tools.ToolError("no cloud in tests")


def call(name, **args):
    return {"id": f"c_{name}", "name": name, "arguments": json.dumps(args)}


def _user():
    init_db()
    with SessionLocal() as db:
        u = User(name="a", email=f"a-{time.time_ns()}@t.ru", pw_hash="x")
        db.add(u)
        db.commit()
        return u.id


def _fact(uid, text):
    with SessionLocal() as db:
        f = MemoryFact(user_id=uid, text=text, kind="fact", source="manual")
        db.add(f)
        db.commit()
        return f.id


async def collect(router, uid, private=False, on_event=None):
    events, res = [], {}
    msgs = [{"role": "system", "content": "sys"}, {"role": "user", "content": "hi"}]
    async for e in agent.stream_agent(router, uid, msgs, res, private=private):
        events.append(e)
        if on_event:
            await on_event(e)
    return events, res


def test_tool_loop_runs_tool_and_answers():
    uid = _user()
    r = ScriptRouter([{"calls": [call("current_datetime")]}, {"text": ["Сейчас ", "вечер"]}])
    events, res = asyncio.run(collect(r, uid))
    steps = [e for e in events if e["type"] == "step"]
    assert [s["status"] for s in steps] == ["active", "done"] and steps[0]["tool"] == "current_datetime"
    assert res["text"] == "Сейчас вечер"
    tool_msg = r.seen[1][-1]
    assert tool_msg["role"] == "tool" and tool_msg["tool_call_id"] == "c_current_datetime" and "UTC" in tool_msg["content"]
    assert [e["type"] for e in events].count("meta") == 1


def _forget_router(fid):
    return ScriptRouter([{"calls": [call("memory_forget", fact_id=fid)]}, {"text": ["Готово"]}])


def test_confirm_tool_waits_and_runs_after_approval():
    uid = _user()
    fid = _fact(uid, "Любит чай")

    async def approve(e):
        if e["type"] == "approval":
            assert "Любит чай" in e["text"]                 # the card says exactly what will be deleted
            assert agent.answer(uid, e["run"], e["id"], True)
    events, res = asyncio.run(collect(_forget_router(fid), uid, on_event=approve))
    assert any(e["type"] == "approval_done" and e["result"] == "approved" for e in events)
    with SessionLocal() as db:
        assert db.get(MemoryFact, fid) is None


def test_confirm_tool_declined_does_nothing():
    uid = _user()
    fid = _fact(uid, "Любит кофе")

    async def decline(e):
        if e["type"] == "approval":
            assert not agent.answer("someone-else", e["run"], e["id"], True)   # other users can't approve
            assert agent.answer(uid, e["run"], e["id"], False)
    r = _forget_router(fid)
    events, _ = asyncio.run(collect(r, uid, on_event=decline))
    with SessionLocal() as db:
        assert db.get(MemoryFact, fid) is not None
    assert "отклонил" in r.seen[1][-1]["content"]


def test_stop_during_approval_ends_run():
    uid = _user()
    fid = _fact(uid, "Живёт в Москве")

    async def stop(e):
        if e["type"] == "approval":
            assert agent.stop_user(uid) == 1
    events, _ = asyncio.run(collect(_forget_router(fid), uid, on_event=stop))
    assert events[-1] == {"type": "error", "message": "Остановлено"}
    with SessionLocal() as db:
        assert db.get(MemoryFact, fid) is not None
    assert not agent.RUNS


def test_private_mode_hides_cloud_tools():
    uid = _user()
    r = ScriptRouter([{"text": ["ok"]}])
    asyncio.run(collect(r, uid, private=True))
    assert "web_search" not in r.offered[0] and "memory_search" in r.offered[0]
    r2 = ScriptRouter([{"text": ["ok"]}])
    asyncio.run(collect(r2, uid))
    assert "web_search" in r2.offered[0]


def test_forget_other_users_fact_is_refused():
    a, b = _user(), _user()
    fid = _fact(b, "Чужой факт")

    async def approve(e):
        if e["type"] == "approval":
            agent.answer(a, e["run"], e["id"], True)
    asyncio.run(collect(_forget_router(fid), a, on_event=approve))
    with SessionLocal() as db:
        assert db.get(MemoryFact, fid) is not None


@pytest.mark.parametrize("url", ["http://127.0.0.1:8731/api/v1/system/health", "http://localhost/", "http://192.168.1.1/",
                                 "file:///C:/Windows/win.ini", "http://[::1]/"])
def test_web_fetch_blocks_local_addresses(url):
    with pytest.raises(tools.ToolError):
        tools._check_public(url)


def test_unknown_tool_and_step_limit():
    uid = _user()
    turns = [{"calls": [call("rm_rf")]}] + [{"calls": [call("current_datetime")]}] * (agent.MAX_STEPS - 1) + [{"text": ["итог"]}]
    r = ScriptRouter(turns)
    events, res = asyncio.run(collect(r, uid))
    assert res["text"] == "итог"
    assert r.offered[-1] == []                                  # last turn: no tools, must answer
    assert any(e["type"] == "step" and e["status"] == "error" for e in events)


def test_history_tells_model_which_tools_were_used(monkeypatch):
    from fastapi.testclient import TestClient
    from app import auth, main
    monkeypatch.setattr(auth, "get_secret", lambda n: "k" * 64)
    seen = []

    class R(ScriptRouter):
        async def stream(self, msgs, *a, **k):
            seen.append(list(msgs))
            async for e in super().stream(msgs, *a, **k):
                yield e
    r = R([{"calls": [call("current_datetime")]}, {"text": ["Сегодня пятница"]}, {"text": ["ok"]}])
    monkeypatch.setattr(main, "router_models", r)
    with TestClient(main.app) as c:
        reg = c.post("/api/v1/auth/register", json={"name": "h", "email": f"h-{time.time_ns()}@t.ru", "password": "secret-pass-1"})
        h = {"Authorization": f"Bearer {reg.json()['token']}"}
        body = c.post("/api/v1/assistant/chat", headers=h, json={"message": "какой день?", "remember": False}).text
        cid = json.loads(body.split("\n\n")[0][5:])["id"]
        conv = c.get(f"/api/v1/assistant/conversations/{cid}", headers=h).json()
        assert conv["messages"][1]["tools"][0]["tool"] == "current_datetime"
        c.post("/api/v1/assistant/chat", headers=h, json={"message": "спасибо", "conversation_id": cid, "remember": False})
    prev_answer = [m for m in seen[-1] if m["role"] == "assistant"][0]["content"]
    assert "current_datetime" in prev_answer and prev_answer.endswith("Сегодня пятница")
