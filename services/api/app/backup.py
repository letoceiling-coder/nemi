"""Nightly copy of the whole database to the private S3 bucket, so nothing is lost with the computer.

Kept: the newest 30 copies plus the first copy of every month forever. Restore downloads a copy, checks it and
puts it next to the database; it replaces the database on the next start (the old one is kept aside)."""
from __future__ import annotations
import asyncio
import gzip
import json
import logging
import shutil
import sqlite3
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from . import storage
from .auth import current_user
from .config import settings
from .db import AppSetting, SessionLocal, audit

log = logging.getLogger("pai.backup")
router = APIRouter(prefix="/api/v1/system")
S3 = storage.S3Config(settings.s3_endpoint, settings.s3_region, settings.s3_bucket)
PREFIX = "backups/db/"
KEEP_RECENT = 30
EVERY_H = 24
DB = settings.data_dir / "app.db"
PENDING = settings.data_dir / "app.db.restore"
_lock = asyncio.Lock()


def _get(key: str) -> dict | None:
    with SessionLocal() as db:
        s = db.get(AppSetting, key)
        return json.loads(s.value) if s else None


def _put(key: str, val: dict) -> None:
    with SessionLocal() as db:
        s = db.get(AppSetting, key)
        if s:
            s.value = json.dumps(val)
        else:
            db.add(AppSetting(key=key, value=json.dumps(val)))
        db.commit()


def _snapshot(dst: Path) -> None:
    """Consistent copy of a live SQLite database (WAL included) via the backup API."""
    src = sqlite3.connect(DB)
    out = sqlite3.connect(dst)
    try:
        src.backup(out)
    finally:
        out.close()
        src.close()


def make_backup() -> dict:
    """Blocking: snapshot -> gzip -> upload. Returns the status that is also stored as `backup:last`."""
    at = datetime.now(timezone.utc)
    key = f"{PREFIX}nemi-{at:%Y%m%d-%H%M%S}.db.gz"
    try:
        with tempfile.TemporaryDirectory() as tmp:
            raw = Path(tmp) / "app.db"
            _snapshot(raw)
            data = gzip.compress(raw.read_bytes(), 6)
        storage.put_file(S3, key, data, "application/gzip")
        st = {"ok": True, "at": at.isoformat(), "key": key, "size": len(data), "error": None}
        _prune()
    except Exception as e:  # noqa: BLE001 — reported in the UI, retried next hour
        log.warning("backup failed", exc_info=True)
        st = {"ok": False, "at": at.isoformat(), "key": None, "size": 0, "error": _why(e)}
    _put("backup:last", st)
    if st["ok"]:
        _put("backup:last_ok", st)
    return st


def _why(e: Exception) -> str:
    t = str(e)
    if "Credential Manager" in t or "keys are not set" in t:
        return "не заданы ключи хранилища S3"
    return f"нет связи с хранилищем ({type(e).__name__})"


def list_backups() -> list[dict]:
    c = storage.client(S3)
    out = []
    for page in c.get_paginator("list_objects_v2").paginate(Bucket=S3.bucket, Prefix=PREFIX):
        for o in page.get("Contents", []):
            if o["Key"].endswith(".db.gz"):
                out.append({"key": o["Key"], "size": o["Size"], "at": o["LastModified"].astimezone(timezone.utc).isoformat()})
    return sorted(out, key=lambda x: x["key"], reverse=True)


def keep_set(keys: list[str]) -> set[str]:
    """Newest KEEP_RECENT plus the first copy of each month (names sort by time)."""
    keys = sorted(keys)
    keep = set(keys[-KEEP_RECENT:])
    months: dict[str, str] = {}
    for k in keys:
        months.setdefault(k.rsplit("nemi-", 1)[-1][:6], k)
    return keep | set(months.values())


def _prune() -> None:
    items = [b["key"] for b in list_backups()]
    drop = [k for k in items if k not in keep_set(items)]
    if drop:
        storage.client(S3).delete_objects(Bucket=S3.bucket, Delete={"Objects": [{"Key": k} for k in drop]})


def apply_pending_restore() -> str | None:
    """Called at startup before the database is opened."""
    if not PENDING.exists():
        return None
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    aside = settings.data_dir / f"app.db.before-restore-{stamp}"
    for suf in ("", "-wal", "-shm"):
        p = Path(str(DB) + suf)
        if p.exists():
            shutil.move(p, Path(str(aside) + suf))
    shutil.move(PENDING, DB)
    log.info("database restored from backup, previous one kept as %s", aside.name)
    return aside.name


async def loop() -> None:
    if not settings.backup_auto:
        log.info("automatic backups are off (PAI_BACKUP_AUTO=0)")
        return
    await asyncio.sleep(120)                  # let the app start first
    while True:
        last = _get("backup:last_ok")
        due = not last or (datetime.now(timezone.utc) - datetime.fromisoformat(last["at"])).total_seconds() > EVERY_H * 3600
        if due:
            async with _lock:
                await asyncio.to_thread(make_backup)
        await asyncio.sleep(3600)


@router.get("/backups")
async def backups(uid: str = Depends(current_user)):
    try:
        items, err = await asyncio.to_thread(list_backups), None
    except Exception as e:  # noqa: BLE001
        items, err = [], _why(e)
    return {"last": _get("backup:last"), "last_ok": _get("backup:last_ok"), "items": items, "error": err,
            "every_hours": EVERY_H, "keep_recent": KEEP_RECENT, "restore_pending": PENDING.exists()}


@router.post("/backups")
async def backup_now(uid: str = Depends(current_user)):
    if _lock.locked():
        raise HTTPException(409, "Копия уже создаётся")
    async with _lock:
        st = await asyncio.to_thread(make_backup)
    with SessionLocal() as db:
        audit(db, uid, "backup.create", "ok" if st["ok"] else st["error"])
    if not st["ok"]:
        raise HTTPException(502, f"Не удалось сделать копию: {st['error']}")
    return st


class RestoreIn(BaseModel):
    key: str


def _download_checked(key: str) -> None:
    data = gzip.decompress(storage.get_file(S3, key))
    tmp = Path(str(PENDING) + ".part")
    tmp.write_bytes(data)
    c = sqlite3.connect(tmp)
    try:
        ok = c.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        has_users = c.execute("SELECT count(*) FROM sqlite_master WHERE name='users'").fetchone()[0] == 1
    finally:
        c.close()
    if not (ok and has_users):
        tmp.unlink(missing_ok=True)
        raise ValueError("копия повреждена")
    tmp.replace(PENDING)


@router.post("/backups/restore")
async def restore(b: RestoreIn, uid: str = Depends(current_user)):
    if not b.key.startswith(PREFIX) or ".." in b.key:
        raise HTTPException(400, "Неверная копия")
    try:
        await asyncio.to_thread(_download_checked, b.key)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"Не удалось восстановить: {e if isinstance(e, ValueError) else _why(e)}")
    with SessionLocal() as db:
        audit(db, uid, "backup.restore", b.key)
    return {"ok": True, "restart": True}
