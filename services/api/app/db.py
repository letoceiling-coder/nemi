from __future__ import annotations
import uuid
from datetime import datetime, timezone
from sqlalchemy import Boolean, Float, ForeignKey, String, Text, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker
from .config import settings

engine = create_engine(settings.db_url, connect_args={"check_same_thread": False})


@event.listens_for(engine, "connect")
def _pragmas(dbapi_conn, _):  # durability + FK enforcement
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA foreign_keys=ON")
    cur.close()


SessionLocal = sessionmaker(engine, expire_on_commit=False)


def uid() -> str:
    return uuid.uuid4().hex


def now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    pw_hash: Mapped[str] = mapped_column(String(300))
    created: Mapped[datetime] = mapped_column(default=now)


class Conversation(Base):
    __tablename__ = "conversations"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200), default="Новый диалог")
    created: Mapped[datetime] = mapped_column(default=now)


class Message(Base):
    __tablename__ = "messages"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    conv_id: Mapped[str] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(String(32), index=True)  # denormalised: every query is filtered by owner
    role: Mapped[str] = mapped_column(String(16))
    content: Mapped[str] = mapped_column(Text)
    provider: Mapped[str | None] = mapped_column(String(40), nullable=True)
    model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    tools: Mapped[str | None] = mapped_column(Text, nullable=True)   # JSON [{label, tool, status}] of agent steps
    created: Mapped[datetime] = mapped_column(default=now)


class MemoryFact(Base):
    """Long-term memory: short durable facts about the user. Owner-scoped like everything else."""
    __tablename__ = "memory_facts"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    text: Mapped[str] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(String(20), default="fact")      # profile | preference | person | project | fact
    source: Mapped[str] = mapped_column(String(10), default="auto")    # auto (extracted from chat) | manual
    conv_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    embedding: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list[float]; None if embeddings unavailable
    created: Mapped[datetime] = mapped_column(default=now)
    updated: Mapped[datetime] = mapped_column(default=now)


class Project(Base):
    __tablename__ = "projects"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(10), default="active")     # active | paused | done
    color: Mapped[str] = mapped_column(String(9), default="#d98a5f")
    created: Mapped[datetime] = mapped_column(default=now)


class Task(Base):
    """Times are UTC. due_time=False means "some time that day" (due holds 23:59 local)."""
    __tablename__ = "tasks"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[str | None] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(300))
    notes: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(10), default="todo")       # todo | doing | done
    priority: Mapped[str] = mapped_column(String(6), default="mid")       # low | mid | high
    due: Mapped[datetime | None] = mapped_column(nullable=True, index=True)
    due_time: Mapped[bool] = mapped_column(Boolean, default=False)
    remind_at: Mapped[datetime | None] = mapped_column(nullable=True, index=True)
    reminded: Mapped[bool] = mapped_column(Boolean, default=False)
    source: Mapped[str] = mapped_column(String(20), default="manual")     # manual | agent
    created: Mapped[datetime] = mapped_column(default=now)
    updated: Mapped[datetime] = mapped_column(default=now)
    done_at: Mapped[datetime | None] = mapped_column(nullable=True)


class SpendEntry(Base):
    """Cost of each paid cloud call (USD as reported by OpenRouter). No message content."""
    __tablename__ = "spend_ledger"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    provider: Mapped[str] = mapped_column(String(40))
    model: Mapped[str] = mapped_column(String(120))
    kind: Mapped[str] = mapped_column(String(20))          # chat | role | embed
    cost: Mapped[float] = mapped_column(Float)
    at: Mapped[datetime] = mapped_column(default=now, index=True)


class AppSetting(Base):
    """App-wide (not per-user) settings, e.g. the OpenRouter monthly limit: the key is shared by all accounts."""
    __tablename__ = "app_settings"
    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[str] = mapped_column(Text)


class AuditLog(Base):
    """Central action log. Never contains secrets or message bodies."""
    __tablename__ = "audit_log"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    user_id: Mapped[str | None] = mapped_column(String(32), index=True, nullable=True)
    action: Mapped[str] = mapped_column(String(80))
    detail: Mapped[str] = mapped_column(Text, default="")
    at: Mapped[datetime] = mapped_column(default=now)


def init_db() -> None:
    Base.metadata.create_all(engine)
    _migrate()


def _migrate() -> None:
    """Additive column migrations for databases created by older versions (create_all never alters tables)."""
    with engine.begin() as c:
        cols = {r[1] for r in c.exec_driver_sql("PRAGMA table_info(messages)")}
        if "tools" not in cols:
            c.exec_driver_sql("ALTER TABLE messages ADD COLUMN tools TEXT")


def audit(db: Session, user_id: str | None, action: str, detail: str = "") -> None:
    db.add(AuditLog(user_id=user_id, action=action, detail=detail[:500]))
    db.commit()
