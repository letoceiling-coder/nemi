"""Secret storage: Windows Credential Manager (via keyring). Env vars PAI_<NAME> are a dev/CI fallback.
Secrets are never written to files, logs or the database."""
from __future__ import annotations
import os
import keyring
from keyring.errors import KeyringError

SERVICE = "personal-ai-assistant"
KNOWN = ("s3_access_key", "s3_secret_key", "openrouter_api_key", "siteaccess_api_key")


def get_secret(name: str) -> str | None:
    env = os.environ.get(f"PAI_{name.upper()}")
    if env:
        return env
    try:
        return keyring.get_password(SERVICE, name)
    except KeyringError:
        return None


def set_secret(name: str, value: str) -> None:
    keyring.set_password(SERVICE, name, value)


def delete_secret(name: str) -> None:
    try:
        keyring.delete_password(SERVICE, name)
    except KeyringError:
        pass


def secrets_status() -> dict[str, bool]:
    return {n: bool(get_secret(n)) for n in KNOWN}
