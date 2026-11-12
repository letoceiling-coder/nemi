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
