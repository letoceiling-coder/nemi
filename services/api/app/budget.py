"""OpenRouter monthly spend limit (soft guard inside the app).

Spent this month = max(local ledger of per-call costs, OpenRouter's own `usage_monthly` for the key).
The ledger updates instantly after each call; the remote figure (refreshed at most once a minute)
also counts spend made with the same key elsewhere. At >= WARN_AT the UI warns; at >= 100 % every
cloud call is refused before it is sent. One call already in flight can overshoot by its own cost.
"""
from __future__ import annotations
import logging
import time
from datetime import datetime, timezone
import httpx
from sqlalchemy import func, select
from .config import settings
from .db import AppSetting, SessionLocal, SpendEntry
from .secrets import get_secret

log = logging.getLogger("pai.budget")
WARN_AT = 0.8
REMOTE_TTL = 60.0
_remote: dict = {"value": 0.0, "month": "", "at": 0.0}


class BudgetExceeded(Exception):
    pass


def _month() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def _month_start() -> datetime:
    n = datetime.now(timezone.utc)
    return datetime(n.year, n.month, 1, tzinfo=timezone.utc)


def get_limit() -> float:
    with SessionLocal() as db:
        s = db.get(AppSetting, "openrouter_monthly_limit")
        return float(s.value) if s else settings.openrouter_monthly_limit


def set_limit(value: float) -> None:
    with SessionLocal() as db:
        s = db.get(AppSetting, "openrouter_monthly_limit")
        if s:
            s.value = str(value)
        else:
            db.add(AppSetting(key="openrouter_monthly_limit", value=str(value)))
        db.commit()


def private_only(uid: str) -> bool:
    """Per-user "only my server" mode: chat, memory extraction and embeddings never go to the cloud."""
    with SessionLocal() as db:
        s = db.get(AppSetting, f"user:{uid}:private_only")
        return bool(s and s.value == "1")


def set_private_only(uid: str, on: bool) -> None:
    with SessionLocal() as db:
        k = f"user:{uid}:private_only"
        s = db.get(AppSetting, k)
        if s:
            s.value = "1" if on else "0"
        else:
            db.add(AppSetting(key=k, value="1" if on else "0"))
        db.commit()


def record(model: str, cost: float, kind: str) -> None:
    if not cost or cost <= 0:
        return
    with SessionLocal() as db:
        db.add(SpendEntry(provider="openrouter", model=model[:120], kind=kind, cost=cost))
        db.commit()


def local_spent() -> float:
    with SessionLocal() as db:
        v = db.scalar(select(func.sum(SpendEntry.cost)).where(SpendEntry.at >= _month_start().replace(tzinfo=None)))
        return float(v or 0.0)


async def refresh_remote(force: bool = False) -> None:
    """Pull `usage_monthly` for the key from OpenRouter (best effort, rate-limited)."""
    if not force and _remote["month"] == _month() and time.monotonic() - _remote["at"] < REMOTE_TTL:
        return
    key = get_secret("openrouter_api_key")
    if not key:
        return
    _remote["at"] = time.monotonic()   # also throttles retries after a failure
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            r = await c.get(f"{settings.openrouter_base_url}/key", headers={"Authorization": f"Bearer {key}"})
        if r.status_code == 200:
            _remote.update(value=float(r.json()["data"].get("usage_monthly") or 0.0), month=_month())
    except (httpx.HTTPError, KeyError, ValueError, TypeError) as e:
        log.warning("budget: OpenRouter usage unavailable (%s)", type(e).__name__)


def spent() -> float:
    remote = _remote["value"] if _remote["month"] == _month() else 0.0
    return max(local_spent(), remote)


def status() -> dict:
    limit, s = get_limit(), spent()
    ratio = s / limit if limit > 0 else 0.0
    level = "stop" if limit > 0 and ratio >= 1 else "warn" if limit > 0 and ratio >= WARN_AT else "ok"
    return {"limit": limit, "spent": round(s, 4), "ratio": round(ratio, 4), "level": level, "month": _month()}


async def check() -> dict:
    """Raise BudgetExceeded if the cloud must not be called. limit <= 0 means "no limit"."""
    await refresh_remote()
    st = status()
    if st["level"] == "stop":
        raise BudgetExceeded(f"месячный лимит OpenRouter ${st['limit']:g} исчерпан (потрачено ${st['spent']:.2f})")
    return st
