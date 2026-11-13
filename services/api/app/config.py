import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


def _data_dir() -> Path:
    base = os.environ.get("LOCALAPPDATA") or str(Path.home() / ".local" / "share")
    p = Path(base) / "PersonalAIAssistant"
    p.mkdir(parents=True, exist_ok=True)
    return p


class Settings(BaseSettings):
    """Non-secret configuration only. Secrets live in Windows Credential Manager (see secrets.py)."""
    model_config = SettingsConfigDict(env_prefix="PAI_", extra="ignore")

    host: str = "127.0.0.1"   # backend listens on localhost only
    port: int = 8731
    data_dir: Path = _data_dir()
    backup_auto: bool = True   # daily DB copy to S3; PAI_BACKUP_AUTO=0 for dev/test backends (never upload a test DB)
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173", "tauri://localhost", "http://tauri.localhost"]

    # model providers (ordered by priority: own server first, OpenRouter as fallback)
    siteaccess_base_url: str = "https://api.siteaccess.ru/v1"
    siteaccess_default_model: str = ""      # first available model when empty
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_default_model: str = "anthropic/claude-haiku-5.5"
    # Role routing for knowledge-base work: "Variant B" (agreed with the owner), each role has a fallback chain.
    # Prices $/1M in/out checked 2026-11-12 on the current OpenRouter account.
    role_models: dict[str, list[str]] = {
        # chunking, summaries, tags, classification — 0.10/0.40, 1M context
        "bulk": ["google/gemini-2.5-flash-lite", "qwen/qwen3-30b-a3b-instruct-2507", "mistralai/mistral-small-3.2-24b-instruct"],
        # extraction of tasks/decisions, KB answers — 0.26/0.38
        "main": ["deepseek/deepseek-v3.2", "anthropic/claude-haiku-5.5", "qwen/qwen3-235b-a22b-2507"],
        # final reports, hard analysis (rare) — 0.10/0.50, 1M context
        "deep": ["anthropic/claude-haiku-5.5", "moonshotai/kimi-k2.5", "deepseek/deepseek-v3.2"],
    }
    # Chat fallback when the own server is busy or down: free models first, then a cheap paid one (by measurement)
    # Measured 2026-11-13 (6 requests each): nemotron-3-ultra 6/6 ~1.9s, ernie-5.5-flash 6/6 ~1.8s, openrouter/free 5/6
    # (routes to random free models, some tiny); gemma-4 :free 0/6 (429 upstream), inkling 403 (region).
    chat_free_models: list[str] = ["nvidia/nemotron-3-ultra-550b-a55b:free", "baidu/ernie-5.5-flash-preview:free", "openrouter/free"]
    chat_paid_models: list[str] = ["google/gemini-2.5-flash-lite", "deepseek/deepseek-v3.2"]
    first_token_own: float = 25.0        # s the own server has to start answering (else: busy -> next route)
    first_token_cloud: float = 20.0
    cooldown_failed: float = 60.0        # s a failed route is skipped
    cooldown_rate_limited: float = 300.0  # s after HTTP 429
    openrouter_monthly_limit: float = 10.0   # USD; default, changeable in Settings (0 = no limit)
    embedding_model: str = "baai/bge-m3"    # multilingual, 8k context
    request_timeout: float = 60.0
    connect_timeout: float = 6.0

    # storage
    s3_endpoint: str = "https://s3.ru-1.storage.selcloud.ru"
    s3_region: str = "ru-1"
    s3_bucket: str = "pai-8389e4b0"

    @property
    def db_url(self) -> str:
        return f"sqlite:///{(self.data_dir / 'app.db').as_posix()}"


settings = Settings()
