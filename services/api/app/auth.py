"""Local accounts: scrypt password hashes + HMAC-signed bearer tokens. Each request is scoped to the token's user_id."""
from __future__ import annotations
import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from fastapi import Header, HTTPException
from .secrets import get_secret, set_secret

TOKEN_TTL = 12 * 3600
_SCRYPT = dict(n=2**15, r=8, p=1, maxmem=2**26, dklen=32)


def hash_password(pw: str) -> str:
    salt = os.urandom(16)
    h = hashlib.scrypt(pw.encode(), salt=salt, **_SCRYPT)
    return f"scrypt${base64.b64encode(salt).decode()}${base64.b64encode(h).decode()}"


def verify_password(pw: str, stored: str) -> bool:
    try:
        _, s, h = stored.split("$")
        calc = hashlib.scrypt(pw.encode(), salt=base64.b64decode(s), **_SCRYPT)
        return hmac.compare_digest(calc, base64.b64decode(h))
    except Exception:  # noqa: BLE001
        return False


def _key() -> bytes:
    k = get_secret("session_secret")
    if not k:
        k = secrets.token_hex(32)
        set_secret("session_secret", k)
    return k.encode()


def make_token(user_id: str) -> str:
    body = base64.urlsafe_b64encode(json.dumps({"u": user_id, "exp": int(time.time()) + TOKEN_TTL}).encode()).decode()
    sig = hmac.new(_key(), body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{sig}"


def read_token(tok: str) -> str | None:
    try:
        body, sig = tok.split(".")
        if not hmac.compare_digest(sig, hmac.new(_key(), body.encode(), hashlib.sha256).hexdigest()):
            return None
        d = json.loads(base64.urlsafe_b64decode(body))
        return d["u"] if d["exp"] > time.time() else None
    except Exception:  # noqa: BLE001
        return None


def current_user(authorization: str = Header(default="")) -> str:
    uid = read_token(authorization.removeprefix("Bearer ").strip()) if authorization else None
    if not uid:
        raise HTTPException(401, "Требуется вход")
    return uid
