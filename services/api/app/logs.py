"""Application file logs (ТЗ Phase 1 «Логи»).

<data_dir>/logs/api.log, rotated at 2 MB, 5 backups (~12 MB max).
Every record passes a redaction filter: API keys, bearer tokens, passwords and URL query strings never reach disk.
Message bodies are never logged by the app itself.
"""
from __future__ import annotations

import logging
import re
from collections import deque
from logging.handlers import RotatingFileHandler
from pathlib import Path

from .config import settings

LOG_DIR = Path(settings.data_dir) / "logs"
LOG_FILE = LOG_DIR / "api.log"
FORMAT = "%(asctime)s %(levelname)-7s %(name)s: %(message)s"

_RULES = [
    (re.compile(r"sk-(?:or-v1|sa|proj|ant)?-?[A-Za-z0-9_-]{16,}"), "sk-***"),
    (re.compile(r"(?i)(bearer\s+)[A-Za-z0-9._~+/=-]{8,}"), r"\1***"),
    (re.compile(r'(?i)("?(?:password|passwd|token|secret|api_key|access_key|secret_key|value)"?\s*[:=]\s*)("[^"]*"|[^\s,}]+)'), r"\1***"),
    (re.compile(r'(?<=[ "])(/[^\s"?]*)\?[^\s"]*'), r"\1?…"),   # drop query strings: search text is personal data
]


def redact(text: str) -> str:
    for rx, repl in _RULES:
        text = rx.sub(repl, text)
    return text


class RedactingFormatter(logging.Formatter):
    """Redacts the final text (message + traceback), so nothing reaches the file unmasked."""
    def format(self, record: logging.LogRecord) -> str:
        return redact(super().format(record))


_configured = False


def setup_logging(level: int = logging.INFO) -> Path:
    """Idempotent. Attaches the rotating file handler to the root and uvicorn loggers."""
    global _configured
    if _configured:
        return LOG_FILE
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    fh = RotatingFileHandler(LOG_FILE, maxBytes=2_000_000, backupCount=5, encoding="utf-8")
    fh.setFormatter(RedactingFormatter(FORMAT))
    root = logging.getLogger()
    root.setLevel(level)
    root.addHandler(fh)
    # uvicorn loggers don't propagate to root; add the file handler next to their console handlers
    # ("uvicorn.error" propagates to "uvicorn", so attaching there covers both)
    for name in ("uvicorn", "uvicorn.access"):
        logging.getLogger(name).addHandler(fh)
    for noisy in ("httpx", "httpcore", "botocore", "boto3", "urllib3"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    _configured = True
    logging.getLogger("pai").info("logging started, file=%s", LOG_FILE)
    return LOG_FILE


def tail(lines: int = 200, min_level: str = "") -> list[str]:
    """Last N lines of the current log file (already redacted on write)."""
    if not LOG_FILE.exists():
        return []
    levels = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
    want = set(levels[levels.index(min_level):]) if min_level in levels else None
    out: deque[str] = deque(maxlen=max(1, min(lines, 2000)))
    with LOG_FILE.open(encoding="utf-8", errors="replace") as f:
        for line in f:
            parts = line.split(maxsplit=3)
            if want and not (len(parts) > 2 and parts[2] in want):
                continue
            out.append(line.rstrip("\n"))
    return list(out)
