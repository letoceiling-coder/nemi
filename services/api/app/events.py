"""Calendar events. Owner-scoped, UTC in the database.

Quick input reuses the Russian parser from tasks: «завтра в 15:00 созвон с Иваном на 30 минут».
Reminders: `remind_minutes` before the start (default 15, 0 = none) come through /reminders/due together with tasks.
"""
from __future__ import annotations
import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import current_user
from .db import Event, Project, audit, now
from .tasks import get_db, iso, local_now, quick_parse, to_utc

router = APIRouter(prefix="/api/v1")
DEFAULT_MINUTES = 60
DEFAULT_REMIND = 15


def _naive_utc(dt: datetime) -> datetime:
    return to_utc(dt).replace(tzinfo=None)


def event_out(e: Event, pname: str | None = None) -> dict:
    return {"id": e.id, "title": e.title, "start": iso(e.start), "end": iso(e.end), "all_day": e.all_day,
            "location": e.location, "notes": e.notes, "project_id": e.project_id, "project": pname,
            "remind_minutes": e.remind_minutes, "source": e.source, "created": iso(e.created),
            "ext_source": e.ext_source, "ext_cal": e.ext_cal}


def list_events(db: Session, uid: str, start: datetime, end: datetime) -> list[dict]:
    rows = db.execute(select(Event, Project.name).outerjoin(Project, Project.id == Event.project_id)
                      .where(Event.user_id == uid, Event.start < _naive_utc(end), Event.end > _naive_utc(start))
                      .order_by(Event.start)).all()
    return [event_out(e, p) for e, p in rows]


def conflicts(db: Session, uid: str, start: datetime, end: datetime, exclude: str | None = None) -> list[Event]:
    """Timed events that overlap [start, end). All-day events don't block time."""
    q = select(Event).where(Event.user_id == uid, Event.all_day.is_(False),
                            Event.start < _naive_utc(end), Event.end > _naive_utc(start))
    if exclude:
        q = q.where(Event.id != exclude)
    return list(db.scalars(q.order_by(Event.start)))


def duration_from_text(text: str) -> tuple[str, int | None]:
    """«… на 30 минут», «на полчаса», «на 2 часа» -> (text without it, minutes)."""
    m = re.search(r"(?i)\s*на\s+(\d+|полчаса|час)\s*(минут[уы]?|мин|час(?:а|ов)?)?(?=\s|$|[,.])", text)
    if not m:
        return text, None
    n = m.group(1).lower()
    unit = (m.group(2) or "").lower()
    mins = 30 if n == "полчаса" else 60 if n == "час" else int(n) * (1 if unit.startswith("мин") else 60)
    return (text[:m.start()] + text[m.end():]).strip(), mins


def create_event(db: Session, uid: str, title: str, start: datetime, end: datetime | None = None, *, all_day: bool = False,
                 location: str = "", notes: str = "", project_id: str | None = None,
                 remind_minutes: int = DEFAULT_REMIND, source: str = "manual") -> Event:
    if all_day:
        start = start.replace(hour=0, minute=0, second=0, microsecond=0)
        end = (end or start).replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
    end = end or start + timedelta(minutes=DEFAULT_MINUTES)
    if end <= start:
        raise ValueError("конец события раньше начала")
    e = Event(user_id=uid, title=title.strip()[:300], start=to_utc(start), end=to_utc(end), all_day=all_day,
              location=location[:500], notes=notes[:4000], project_id=project_id,
              remind_minutes=max(0, min(int(remind_minutes), 7 * 24 * 60)), source=source)
    db.add(e)
    db.commit()
    return e


EXT_NAMES = {"google": "Google Календаря", "yandex": "Яндекс Календаря"}


def _own(db: Session, eid: str, uid: str, write: bool = False) -> Event:
    e = db.get(Event, eid)
    if not e or e.user_id != uid:
        raise HTTPException(404, "Событие не найдено")
    if write and e.ext_source:                 # imported events are read-only: they would be overwritten by the next sync
        raise HTTPException(409, f"Это событие из {EXT_NAMES.get(e.ext_source, e.ext_source)} — измените его там")
    return e


def _check_project(db: Session, pid: str | None, uid: str) -> None:
    if pid:
        p = db.get(Project, pid)
        if not p or p.user_id != uid:
            raise HTTPException(404, "Проект не найден")


class EventIn(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    start: datetime | None = None
    end: datetime | None = None
    all_day: bool = False
    location: str = ""
    notes: str = ""
    project_id: str | None = None
    remind_minutes: int = DEFAULT_REMIND
    quick: bool = False                # parse «завтра в 15:00 … на 30 минут» from the title


class EventPatch(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=300)
    start: datetime | None = None
    end: datetime | None = None
    all_day: bool | None = None
    location: str | None = None
    notes: str | None = None
    project_id: str | None = None
    remind_minutes: int | None = None
    clear_project: bool = False


@router.get("/events")
def events_get(start: datetime | None = None, end: datetime | None = None, uid: str = Depends(current_user),
               db: Session = Depends(get_db)):
    s = start or local_now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return list_events(db, uid, s, end or s + timedelta(days=42))


@router.post("/events")
def events_post(b: EventIn, uid: str = Depends(current_user), db: Session = Depends(get_db)):
    _check_project(db, b.project_id, uid)
    title, start, end, all_day = b.title, b.start, b.end, b.all_day
    if b.quick and not start:
        text, mins = duration_from_text(b.title)
        title, due, has_time = quick_parse(text)
        if not due:
            raise HTTPException(422, "Не понял, когда событие: напишите, например, «завтра в 15:00 …»")
        start, all_day = due, not has_time
        end = due + timedelta(minutes=mins) if mins and has_time else None
    if not start:
        raise HTTPException(422, "Укажите время начала")
    try:
        e = create_event(db, uid, title, start, end, all_day=all_day, location=b.location, notes=b.notes,
                         project_id=b.project_id, remind_minutes=b.remind_minutes)
    except ValueError as err:
        raise HTTPException(422, str(err))
    audit(db, uid, "event.create", e.id)
    clash = [event_out(c) for c in conflicts(db, uid, e.start.replace(tzinfo=timezone.utc), e.end.replace(tzinfo=timezone.utc), e.id)] if not e.all_day else []
    return {**event_out(e), "conflicts": clash}


@router.patch("/events/{eid}")
def events_patch(eid: str, b: EventPatch, uid: str = Depends(current_user), db: Session = Depends(get_db)):
    e = _own(db, eid, uid, write=True)
    length = e.end - e.start
    if b.title is not None:
        e.title = b.title.strip()
    if b.all_day is not None:
        e.all_day = b.all_day
    if b.start is not None:                                          # DB holds naive UTC: compare like with like
        e.start = _naive_utc(b.start)
        e.end = _naive_utc(b.end) if b.end else e.start + length    # moving keeps the duration
        e.reminded = False
    elif b.end is not None:
        e.end = _naive_utc(b.end)
    if e.end <= e.start:
        raise HTTPException(422, "Конец события раньше начала")
    for f in ("location", "notes"):
        if getattr(b, f) is not None:
            setattr(e, f, getattr(b, f))
    if b.remind_minutes is not None:
        e.remind_minutes, e.reminded = max(0, b.remind_minutes), False
    if b.project_id is not None:
        _check_project(db, b.project_id, uid)
        e.project_id = b.project_id
    if b.clear_project:
        e.project_id = None
    db.commit()
    audit(db, uid, "event.update", eid)
    return event_out(e)


@router.delete("/events/{eid}")
def events_delete(eid: str, uid: str = Depends(current_user), db: Session = Depends(get_db)):
    e = _own(db, eid, uid, write=True)
    db.delete(e)
    db.commit()
    audit(db, uid, "event.delete", eid)
    return {"ok": True}


def due_event_reminders(db: Session, uid: str) -> list[dict]:
    """Events starting within their reminder window (and not yet started more than 5 min ago). Each fires once."""
    n = now().replace(tzinfo=None)
    rows = db.scalars(select(Event).where(Event.user_id == uid, Event.reminded.is_(False), Event.remind_minutes > 0,
                                          Event.all_day.is_(False), Event.start > n - timedelta(minutes=5),
                                          Event.start <= n + timedelta(days=7))).all()
    out = []
    for e in rows:
        if e.start - timedelta(minutes=e.remind_minutes) <= n:
            e.reminded = True
            out.append(event_out(e))
    db.commit()
    return out
