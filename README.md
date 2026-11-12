# Personal AI Assistant

Локальный персональный AI-ассистент. Статус: **Phase 1 (Core Platform) — в работе**.

## Структура
- `apps/desktop` — интерфейс (React 19 + Vite + Tailwind). Tauri-оболочка будет добавлена после установки Rust.
- `services/api` — backend (FastAPI, SQLite, роутер моделей, приватный S3).
- `docs/architecture` — архитектура, установка, аккаунты, платформы.

## Запуск (dev)
```bash
# backend (127.0.0.1:8731)
cd services/api
python -m venv .venv && .venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/python -m uvicorn app.main:app --host 127.0.0.1 --port 8731

# интерфейс (http://localhost:5173)
cd apps/desktop && npm install && npm run dev
```
Тесты backend: `.venv/Scripts/python -m pytest tests`

## Секреты
Ключи (S3, OpenRouter, ключ сервера моделей) хранятся **только в Windows Credential Manager** (сервис `personal-ai-assistant`).
Задаются в интерфейсе: Настройки → Интеграции. В Git, логи и файлы конфигурации секреты не попадают.
Для CI/dev допустимы переменные окружения `PAI_<NAME>` (например `PAI_OPENROUTER_API_KEY`).

## Модели
Порядок: собственный сервер `api.siteaccess.ru` → если занят/недоступен/нет ключа — OpenRouter. Локальный Ollama не используется.

## Хранилище
Приватный бакет Selectel S3 (`personal-assistant`-структура: personal/, projects/, meetings/, …). Доступ только по ключам, анонимный доступ запрещён, контроль целостности SHA-256.
