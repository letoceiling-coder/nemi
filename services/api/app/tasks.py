"""Tasks, projects and reminders. Owner-scoped like everything else; times are stored in UTC.

Quick input understands short Russian phrases without a model:
  «завтра в 11:00 проверить договор», «в пятницу позвонить Ивану», «15.11 отчёт», «через 2 часа выпить таблетку».
"""
from __future__ import annotations
import re
from datetime import datetime, time as dtime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .auth import current_user
from .db import Project, SessionLocal, Task, audit, now

router = APIRouter(prefix="/api/v1")
STATUSES = {"todo", "doing", "done"}
PRIORITIES = {"low", "mid", "high"}
COLORS = ["#d98a5f", "#6aa0e8", "#5fb98a", "#b58be0", "#e2b04e", "#e07a8b", "#4fb3bf"]


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def local_now() -> datetime:
    return datetime.now().astimezone()


def to_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:                      # naive = the user's local time
        dt = dt.astimezone()
    return dt.astimezone(timezone.utc)


def iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:                      # SQLite returns naive UTC
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


# ---------- quick input ----------
WD = {"понедельник": 0, "пн": 0, "вторник": 1, "вт": 1, "среду": 2, "среда": 2, "ср": 2, "четверг": 3, "чт": 3,
      "пятницу": 4, "пятница": 4, "пт": 4, "субботу": 5, "суббота": 5, "сб": 5, "воскресенье": 6, "вс": 6}
MONTHS = {"января": 1, "февраля": 2, "марта": 3, "апреля": 4, "мая": 5, "июня": 6, "июля": 7, "августа": 8,
          "сентября": 9, "октября": 10, "ноября": 11, "декабря": 12}


def quick_parse(text: str, base: datetime | None = None) -> tuple[str, datetime | None, bool]:
    """Returns (title, due as local aware datetime or None, has_time)."""
    base = base or local_now()
    s = " " + " ".join(text.split()) + " "
    day: datetime | None = None
    t: dtime | None = None

    def cut(m):
        nonlocal s
        s = s[:m.start()] + " " + s[m.end():]

    if m := re.search(r"(?i)\sчерез\s+(\d+|полчаса|час)\s*(минут[уы]?|мин|час(?:а|ов)?|дн(?:я|ей)|день)?\s", s):
        n = {"полчаса": 30, "час": 1}.get(m.group(1).lower(), None)
        unit = (m.group(2) or ("минут" if m.group(1).lower() == "полчаса" else "час")).lower()
        n = n if n is not None else int(m.group(1))
        delta = timedelta(minutes=n) if unit.startswith("мин") or m.group(1).lower() == "полчаса" else \
            timedelta(hours=n) if unit.startswith("час") else timedelta(days=n)
        cut(m)
        due = (base + delta).replace(second=0, microsecond=0)
        title = " ".join(s.split()).strip(" ,.-") or text.strip()
        return title[:1].upper() + title[1:], due, not unit.startswith("д")
    if m := re.search(r"(?i)\s(сегодня|завтра|послезавтра)\s", s):
        day = base + timedelta(days={"сегодня": 0, "завтра": 1, "послезавтра": 2}[m.group(1).lower()])
        cut(m)
    elif m := re.search(r"(?i)\s(?:в|во)\s+(" + "|".join(WD) + r")\s", s):
        wd = WD[m.group(1).lower()]
        ahead = (wd - base.weekday()) % 7 or 7
        day = base + timedelta(days=ahead)
        cut(m)
    elif m := re.search(r"(?i)\s(\d{1,2})\s+(" + "|".join(MONTHS) + r")\s", s):
        day = _date(base, int(m.group(1)), MONTHS[m.group(2).lower()])
        cut(m)
    elif m := re.search(r"\s(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?\s", s):
        day = _date(base, int(m.group(1)), int(m.group(2)), m.group(3))
        cut(m)
    if m := re.search(r"(?i)\s(?:в|к)\s+(\d{1,2})(?:[:.](\d{2}))?(?:\s*(утра|дня|вечера|ночи))?(?=\s)", s) or \
            re.search(r"\s(\d{1,2}):(\d{2})(?=\s)", s):
        h, mi = int(m.group(1)), int(m.group(2) or 0)
        part = m.group(3).lower() if m.lastindex and m.lastindex >= 3 and m.group(3) else ""
        if part in ("дня", "вечера") and h < 12:
            h += 12
        if 0 <= h < 24 and 0 <= mi < 60:
            t = dtime(h, mi)
            cut(m)
    title = " ".join(s.split()).strip(" ,.-") or text.strip()
    if day is None and t is None:
        return text.strip(), None, False
    day = day or base
    due = day.replace(hour=t.hour if t else 23, minute=t.minute if t else 59, second=0, microsecond=0)
    if day is base and t and due <= base:      # «в 9:00» said after 9:00 -> tomorrow
        due += timedelta(days=1)
    return title[:1].upper() + title[1:], due, t is not None


def _date(base: datetime, d: int, mo: int, y: str | None = None) -> datetime | None:
    year = int(y) + (2000 if y and len(y) == 2 else 0) if y else base.year
    try:
        dt = base.replace(year=year, month=mo, day=d)
    except ValueError:
        return None
    if not y and dt.date() < base.date():      # «5.01» in December -> next year
        dt = dt.replace(year=year + 1)
    return dt


# ---------- serialization ----------
def task_out(t: Task, pname: str | None = None) -> dict:
    return {"id": t.id, "title": t.title, "notes": t.notes, "status": t.status, "priority": t.priority,
            "due": iso(t.due), "due_time": t.due_time, "remind_at": iso(t.remind_at), "reminded": t.reminded,
            "project_id": t.project_id, "project": pname, "source": t.source,
            "created": iso(t.created), "updated": iso(t.updated), "done_at": iso(t.done_at)}


def _own_task(db: Session, tid: str, uid: str) -> Task:
    t = db.get(Task, tid)
    if not t or t.user_id != uid:
        raise HTTPException(404, "Задача не найдена")
    return t


def _own_project(db: Session, pid: str | None, uid: str) -> Project | None:
    if not pid:
        return None
    p = db.get(Project, pid)
    if not p or p.user_id != uid:
        raise HTTPException(404, "Проект не найден")
    return p


def list_tasks(db: Session, uid: str, view: str = "all", project_id: str | None = None) -> list[dict]:
    q = select(Task, Project.name).outerjoin(Project, Project.id == Task.project_id).where(Task.user_id == uid)
    if project_id:
        q = q.where(Task.project_id == project_id)
    rows = db.execute(q).all()
    ln = local_now()
    end_today = ln.replace(hour=23, minute=59, second=59).astimezone(timezone.utc).replace(tzinfo=None)
    start_today = ln.replace(hour=0, minute=0, second=0).astimezone(timezone.utc).replace(tzinfo=None)

    def keep(t: Task) -> bool:
        if view == "done":
            return t.status == "done"
        if t.status == "done":
            return view == "all"
        if view == "today":
            return t.due is not None and t.due <= end_today      # overdue included: it's still today's work
        if view == "overdue":
            return t.due is not None and t.due < (now().replace(tzinfo=None) if t.due_time else start_today)
        if view == "upcoming":
            return t.due is None or t.due > end_today
        return True

    out = [task_out(t, pname) for t, pname in rows if keep(t)]
    pr = {"high": 0, "mid": 1, "low": 2}
    out.sort(key=lambda x: (x["status"] == "done", x["due"] is None, x["due"] or "", pr.get(x["priority"], 1)))
    return out


def create_task(db: Session, uid: str, title: str, *, notes: str = "", due: datetime | None = None, due_time: bool = False,
                remind_at: datetime | None = None, priority: str = "mid", project_id: str | None = None,
                source: str = "manual") -> Task:
    if due is None and remind_at is not None:     # «напомни в 15:00 …» — the reminder time is also the deadline
        due, due_time = remind_at, True
    t = Task(user_id=uid, title=title.strip()[:300], notes=notes[:4000], priority=priority if priority in PRIORITIES else "mid",
             due=to_utc(due), due_time=due_time, remind_at=to_utc(remind_at), project_id=project_id, source=source)
    db.add(t)
    db.commit()
    return t


# ---------- API ----------
class TaskIn(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    notes: str = ""
    due: datetime | None = None
    due_time: bool | None = None
    remind_at: datetime | None = None
    priority: str = "mid"
    project_id: str | None = None
    quick: bool = False            # parse date/time from the title («завтра в 11 …»)


class TaskPatch(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=300)
    notes: str | None = None
    status: str | None = None
    priority: str | None = None
    due: datetime | None = None
    due_time: bool | None = None
    remind_at: datetime | None = None
    project_id: str | None = None
    clear: list[str] = []          # fields to set to null: due, remind_at, project_id


@router.get("/tasks")
def tasks_get(view: str = "all", project_id: str | None = None, uid: str = Depends(current_user), db: Session = Depends(get_db)):
    return list_tasks(db, uid, view, project_id)


@router.post("/tasks")
def tasks_post(b: TaskIn, uid: str = Depends(current_user), db: Session = Depends(get_db)):
    _own_project(db, b.project_id, uid)
    title, due, has_time = (b.title, b.due, bool(b.due_time))
    if b.quick and not b.due:
        title, due, has_time = quick_parse(b.title)
    remind = b.remind_at or (due if due and has_time else None)        # a timed task reminds at its time
    t = create_task(db, uid, title, notes=b.notes, due=due, due_time=has_time, remind_at=remind,
                    priority=b.priority, project_id=b.project_id)
    audit(db, uid, "task.create", t.id)
    return task_out(t, _own_project(db, t.project_id, uid).name if t.project_id else None)


@router.patch("/tasks/{tid}")
def tasks_patch(tid: str, b: TaskPatch, uid: str = Depends(current_user), db: Session = Depends(get_db)):
    t = _own_task(db, tid, uid)
    if b.title is not None:
        t.title = b.title.strip()
    if b.notes is not None:
        t.notes = b.notes[:4000]
    if b.status is not None:
        if b.status not in STATUSES:
            raise HTTPException(422, "Неизвестный статус")
        t.done_at = now() if b.status == "done" and t.status != "done" else (t.done_at if b.status == "done" else None)
        t.status = b.status
    if b.priority is not None:
        if b.priority not in PRIORITIES:
            raise HTTPException(422, "Неизвестный приоритет")
        t.priority = b.priority
    if b.due is not None:
        t.due = to_utc(b.due)
        t.due_time = True if b.due_time is None else b.due_time
    if b.remind_at is not None:
        t.remind_at, t.reminded = to_utc(b.remind_at), False
    if b.project_id is not None:
        _own_project(db, b.project_id, uid)
        t.project_id = b.project_id
    for f in b.clear:
        if f in ("due", "remind_at", "project_id"):
            setattr(t, f, None)
    t.updated = now()
    db.commit()
    audit(db, uid, "task.update", tid)
    p = db.get(Project, t.project_id) if t.project_id else None
    return task_out(t, p.name if p else None)


@router.delete("/tasks/{tid}")
def tasks_delete(tid: str, uid: str = Depends(current_user), db: Session = Depends(get_db)):
    t = _own_task(db, tid, uid)
    db.delete(t)
    db.commit()
    audit(db, uid, "task.delete", tid)
    return {"ok": True}


@router.get("/reminders/due")
def reminders_due(uid: str = Depends(current_user), db: Session = Depends(get_db)):
    """Reminders whose time has come. Each is returned once (marked as delivered)."""
    n = now().replace(tzinfo=None)
    rows = db.scalars(select(Task).where(Task.user_id == uid, Task.status != "done", Task.reminded.is_(False),
                                         Task.remind_at.is_not(None), Task.remind_at <= n)).all()
    for t in rows:
        t.reminded = True
    db.commit()
    return [task_out(t) for t in rows]


class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = ""
    status: str = "active"
    color: str | None = None


@router.get("/projects")
def projects_get(uid: str = Depends(current_user), db: Session = Depends(get_db)):
    ps = db.scalars(select(Project).where(Project.user_id == uid).order_by(Project.created)).all()
    counts = {pid: (total, done) for pid, total, done in db.execute(
        select(Task.project_id, func.count(), func.sum(Task.status == "done")).where(Task.user_id == uid)
        .group_by(Task.project_id)).all()}
    out = []
    for p in ps:
        total, done = counts.get(p.id, (0, 0))
        out.append({"id": p.id, "name": p.name, "description": p.description, "status": p.status, "color": p.color,
                    "tasks": total, "done": int(done or 0), "progress": round(100 * (done or 0) / total) if total else 0,
                    "created": iso(p.created)})
    return out


@router.post("/projects")
def projects_post(b: ProjectIn, uid: str = Depends(current_user), db: Session = Depends(get_db)):
    # SQLite lower() is ASCII-only: compare Cyrillic names in Python
    if any(p.name.lower() == b.name.strip().lower() for p in db.scalars(select(Project).where(Project.user_id == uid))):
        raise HTTPException(409, "Проект с таким названием уже есть")
    n = db.scalar(select(func.count()).select_from(Project).where(Project.user_id == uid)) or 0
    p = Project(user_id=uid, name=b.name.strip(), description=b.description[:2000],
                status=b.status if b.status in ("active", "paused", "done") else "active", color=b.color or COLORS[n % len(COLORS)])
    db.add(p)
    db.commit()
    audit(db, uid, "project.create", p.id)
    return {"id": p.id, "name": p.name, "description": p.description, "status": p.status, "color": p.color,
            "tasks": 0, "done": 0, "progress": 0, "created": iso(p.created)}


@router.patch("/projects/{pid}")
def projects_patch(pid: str, b: ProjectIn, uid: str = Depends(current_user), db: Session = Depends(get_db)):
    p = _own_project(db, pid, uid)
    p.name, p.description = b.name.strip(), b.description[:2000]
    if b.status in ("active", "paused", "done"):
        p.status = b.status
    if b.color:
        p.color = b.color
    db.commit()
    audit(db, uid, "project.update", pid)
    return {"ok": True}


@router.delete("/projects/{pid}")
def projects_delete(pid: str, uid: str = Depends(current_user), db: Session = Depends(get_db)):
    """Deletes the project; its tasks stay (moved to «Без проекта»)."""
    p = _own_project(db, pid, uid)
    for t in db.scalars(select(Task).where(Task.project_id == pid, Task.user_id == uid)):
        t.project_id = None
    db.delete(p)
    db.commit()
    audit(db, uid, "project.delete", pid)
    return {"ok": True}
