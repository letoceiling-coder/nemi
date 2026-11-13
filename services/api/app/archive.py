"""Permanent archive: the assistant's action journal («Центр активности») and search over everything ever recorded —
dialogs, tasks (done ones too), events, memory, projects and the assistant's actions. Nothing here expires."""
from __future__ import annotations
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from . import agent
from .auth import current_user
from .db import AgentAction, Conversation, Event, MemoryFact, Message, Project, SessionLocal, Task

router = APIRouter(prefix="/api/v1")
KINDS = ("message", "task", "event", "memory", "project", "action")
STATUSES = ("ok", "error", "declined", "timeout", "stopped")


def get_db():
    with SessionLocal() as db:
        yield db


def _aware(d: datetime) -> datetime:
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _naive(d: datetime | None) -> datetime | None:
    return d.astimezone(timezone.utc).replace(tzinfo=None) if d and d.tzinfo else d


def _snip(text: str, q: str, width: int = 160) -> str:
    t = " ".join((text or "").split())
    i = t.lower().find(q.lower())
    if i < 0:
        return t[:width * 2]
    a = max(0, i - width // 2)
    return ("…" if a else "") + t[a:i + len(q) + width] + ("…" if i + len(q) + width < len(t) else "")


def _like(col, q: str):
    return func.ulower(col).like(f"%{q.lower()}%", escape="\\")


def search(db: Session, uid: str, q: str, kinds: list[str] | None = None, since: datetime | None = None,
           until: datetime | None = None, limit: int = 30) -> list[dict]:
    """Case-insensitive substring search (Cyrillic too) over the user's whole history, newest first."""
    q = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    if not q:
        return []
    kinds = [k for k in (kinds or KINDS) if k in KINDS]
    since, until = _naive(since), _naive(until)
    out: list[dict] = []

    def rng(col):
        c = []
        if since:
            c.append(col >= since)
        if until:
            c.append(col < until)
        return c

    plain = q.replace("\\\\", "\\").replace("\\%", "%").replace("\\_", "_")
    if "message" in kinds:
        for m, title in db.execute(select(Message, Conversation.title).join(Conversation, Conversation.id == Message.conv_id)
                                   .where(Message.user_id == uid, _like(Message.content, q), *rng(Message.created))
                                   .order_by(Message.created.desc()).limit(limit)):
            out.append({"kind": "message", "id": m.id, "conv_id": m.conv_id, "at": m.created,
                        "title": title, "who": "user" if m.role == "user" else "assistant", "snippet": _snip(m.content, plain)})
    if "task" in kinds:
        for t in db.scalars(select(Task).where(Task.user_id == uid, or_(_like(Task.title, q), _like(Task.notes, q)),
                                               *rng(Task.created)).order_by(Task.created.desc()).limit(limit)):
            out.append({"kind": "task", "id": t.id, "at": t.created, "title": t.title, "status": t.status,
                        "snippet": _snip(t.notes, plain) if t.notes else ""})
    if "event" in kinds:
        for e in db.scalars(select(Event).where(Event.user_id == uid, or_(_like(Event.title, q), _like(Event.notes, q),
                                                                           _like(Event.location, q)), *rng(Event.start))
                            .order_by(Event.start.desc()).limit(limit)):
            out.append({"kind": "event", "id": e.id, "at": e.start, "title": e.title, "snippet": e.location or _snip(e.notes, plain)})
    if "memory" in kinds:
        for f in db.scalars(select(MemoryFact).where(MemoryFact.user_id == uid, _like(MemoryFact.text, q), *rng(MemoryFact.created))
                            .order_by(MemoryFact.created.desc()).limit(limit)):
            out.append({"kind": "memory", "id": f.id, "at": f.created, "title": f.text, "snippet": ""})
    if "project" in kinds:
        for p in db.scalars(select(Project).where(Project.user_id == uid, or_(_like(Project.name, q), _like(Project.description, q)),
                                                  *rng(Project.created)).limit(limit)):
            out.append({"kind": "project", "id": p.id, "at": p.created, "title": p.name, "snippet": _snip(p.description, plain)})
    if "action" in kinds:
        for a in db.scalars(select(AgentAction).where(AgentAction.user_id == uid, or_(_like(AgentAction.label, q), _like(AgentAction.detail, q)),
                                                      *rng(AgentAction.at)).order_by(AgentAction.at.desc()).limit(limit)):
            out.append({"kind": "action", "id": a.id, "conv_id": a.conv_id, "at": a.at, "title": a.label, "status": a.status,
                        "snippet": _snip(a.detail, plain)})
    out.sort(key=lambda x: _aware(x["at"]), reverse=True)
    for x in out:
        x["at"] = _aware(x["at"]).isoformat()
    return out[:limit]


@router.get("/archive/search")
def archive_search(q: str = Query(..., min_length=2, max_length=200), kinds: str = "", since: datetime | None = None,
                   until: datetime | None = None, limit: int = Query(40, le=200),
                   uid: str = Depends(current_user), db: Session = Depends(get_db)):
    return search(db, uid, q, [k for k in kinds.split(",") if k] or None, since, until, limit)


@router.get("/archive/stats")
def archive_stats(uid: str = Depends(current_user), db: Session = Depends(get_db)):
    """How much is kept and since when — shown next to the archive search."""
    def n(model, col):
        return db.scalar(select(func.count()).select_from(model).where(col == uid)) or 0
    first = db.scalar(select(func.min(Message.created)).where(Message.user_id == uid))
    return {"messages": n(Message, Message.user_id), "conversations": n(Conversation, Conversation.user_id),
            "tasks": n(Task, Task.user_id), "events": n(Event, Event.user_id), "memory": n(MemoryFact, MemoryFact.user_id),
            "actions": n(AgentAction, AgentAction.user_id), "since": _aware(first).isoformat() if first else None}


def _action_out(a: AgentAction, titles: dict[str, str]) -> dict:
    return {"id": a.id, "run_id": a.run_id, "conv_id": a.conv_id, "conv_title": titles.get(a.conv_id or ""), "tool": a.tool,
            "label": a.label, "status": a.status, "detail": a.detail, "ms": a.ms, "at": _aware(a.at).isoformat()}


@router.get("/activity")
def activity(status: str = "", before: datetime | None = None, limit: int = Query(50, le=200),
             uid: str = Depends(current_user), db: Session = Depends(get_db)):
    """The assistant's journal: runs in progress (with pending approvals), counters and past actions (paged by `before`)."""
    stmt = select(AgentAction).where(AgentAction.user_id == uid)
    if status == "error":
        stmt = stmt.where(AgentAction.status.in_(("error", "timeout")))
    elif status in STATUSES:
        stmt = stmt.where(AgentAction.status == status)
    if before:
        stmt = stmt.where(AgentAction.at < _naive(before))
    rows = list(db.scalars(stmt.order_by(AgentAction.at.desc()).limit(limit)))
    ids = {a.conv_id for a in rows if a.conv_id}
    titles = dict(db.execute(select(Conversation.id, Conversation.title).where(Conversation.id.in_(ids), Conversation.user_id == uid)).all()) if ids else {}
    day = _naive(datetime.now().astimezone().replace(hour=0, minute=0, second=0, microsecond=0))
    today = dict(db.execute(select(AgentAction.status, func.count()).where(AgentAction.user_id == uid, AgentAction.at >= day)
                            .group_by(AgentAction.status)).all())
    runs = agent.active(uid)
    return {"runs": runs,
            "stats": {"running": len(runs), "waiting": sum(len(r["approvals"]) for r in runs),
                      "done_today": today.get("ok", 0), "errors_today": today.get("error", 0) + today.get("timeout", 0)},
            "items": [_action_out(a, titles) for a in rows]}
