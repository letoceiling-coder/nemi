"""Model Provider abstraction. Business logic never talks to a concrete API: it uses ModelRouter.
Priority: own server (siteaccess) -> OpenRouter fallback when the server is busy/unavailable."""
from __future__ import annotations
import json
from abc import ABC, abstractmethod
from typing import AsyncIterator
import httpx
from . import budget
from .config import settings
from .secrets import get_secret


class ProviderError(Exception):
    """Provider unavailable/busy -> router should try the next one."""


class ModelProvider(ABC):
    name: str
    last_model: str | None = None

    @abstractmethod
    async def list_models(self) -> list[str]: ...

    @abstractmethod
    def stream_chat(self, messages: list[dict], model: str | None, temperature: float) -> AsyncIterator[str]: ...

    @abstractmethod
    def configured(self) -> bool: ...


class OpenAICompatProvider(ModelProvider):
    """Any OpenAI-compatible /v1 API (own server, OpenRouter, ...)."""

    def __init__(self, name: str, base_url: str, secret_name: str, default_model: str, extra_headers: dict | None = None,
                 paid: bool = False):
        self.name, self.base_url, self.secret_name = name, base_url.rstrip("/"), secret_name
        self.default_model, self.extra = default_model, extra_headers or {}
        self.paid = paid   # paid per call -> monthly limit is enforced and every call's cost goes to the ledger

    async def _guard(self) -> None:
        if self.paid:
            try:
                await budget.check()
            except budget.BudgetExceeded as e:
                raise ProviderError(f"{self.name}: {e}") from e

    def configured(self) -> bool:
        return bool(get_secret(self.secret_name))

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {get_secret(self.secret_name)}", **self.extra}

    def _timeout(self) -> httpx.Timeout:
        return httpx.Timeout(settings.request_timeout, connect=settings.connect_timeout)

    async def list_models(self) -> list[str]:
        if not self.configured():
            raise ProviderError(f"{self.name}: нет ключа")
        try:
            async with httpx.AsyncClient(timeout=self._timeout()) as c:
                r = await c.get(f"{self.base_url}/models", headers=self._headers())
            if r.status_code != 200:
                raise ProviderError(f"{self.name}: HTTP {r.status_code}")
            return sorted(m["id"] for m in r.json().get("data", []))
        except httpx.HTTPError as e:
            raise ProviderError(f"{self.name}: {type(e).__name__}") from e

    async def embed(self, texts: list[str], model: str) -> list[list[float]]:
        if not self.configured():
            raise ProviderError(f"{self.name}: нет ключа")
        await self._guard()
        try:
            async with httpx.AsyncClient(timeout=self._timeout()) as c:
                r = await c.post(f"{self.base_url}/embeddings", json={"model": model, "input": texts}, headers=self._headers())
            if r.status_code != 200:
                raise ProviderError(f"{self.name}: HTTP {r.status_code}")
            if self.paid:
                budget.record(model, float((r.json().get("usage") or {}).get("cost") or 0), "embed")
            return [d["embedding"] for d in sorted(r.json()["data"], key=lambda d: d["index"])]
        except httpx.HTTPError as e:
            raise ProviderError(f"{self.name}: {type(e).__name__}") from e

    async def stream_chat(self, messages, model, temperature=0.7, kind: str = "chat"):
        if not self.configured():
            raise ProviderError(f"{self.name}: нет ключа")
        await self._guard()
        model = model or self.default_model
        if not model:  # own server: pick the first available model
            ms = await self.list_models()
            if not ms:
                raise ProviderError(f"{self.name}: нет моделей")
            model = ms[0]
        self.last_model = model
        body = {"model": model, "messages": messages, "stream": True, "temperature": temperature}
        if self.paid:
            body["usage"] = {"include": True}   # OpenRouter adds the exact cost to the final chunk
        cost = 0.0
        try:
            async with httpx.AsyncClient(timeout=self._timeout()) as c:
                async with c.stream("POST", f"{self.base_url}/chat/completions", json=body, headers=self._headers()) as r:
                    if r.status_code != 200:
                        await r.aread()
                        raise ProviderError(f"{self.name}: HTTP {r.status_code}")
                    got = False
                    async for line in r.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        data = line[5:].strip()
                        if data == "[DONE]":
                            break
                        try:
                            obj = json.loads(data)
                            if isinstance(obj.get("usage"), dict):
                                cost = float(obj["usage"].get("cost") or 0)
                            ch = obj.get("choices") or [{}]
                            delta = ch[0].get("delta", {}).get("content")
                        except (KeyError, IndexError, TypeError, ValueError):
                            continue
                        if delta:
                            got = True
                            yield delta
                    if not got:
                        raise ProviderError(f"{self.name}: пустой ответ")
        except httpx.HTTPError as e:
            raise ProviderError(f"{self.name}: {type(e).__name__}") from e
        finally:
            if self.paid:   # also on cancel / mid-stream break: whatever was billed is recorded
                budget.record(model, cost, kind)


def build_providers() -> list[ModelProvider]:
    return [
        OpenAICompatProvider("siteaccess", settings.siteaccess_base_url, "siteaccess_api_key", settings.siteaccess_default_model),
        OpenAICompatProvider("openrouter", settings.openrouter_base_url, "openrouter_api_key", settings.openrouter_default_model,
                             {"X-Title": "Personal AI Assistant"}, paid=True),
    ]


class ModelRouter:
    def __init__(self, providers: list[ModelProvider] | None = None):
        self.providers = providers or build_providers()

    def by_name(self, name: str) -> ModelProvider | None:
        return next((p for p in self.providers if p.name == name), None)

    async def stream(self, messages: list[dict], model: str | None = None, prefer: str | None = None, temperature: float = 0.7,
                     only: str | None = None):
        """Yields ('meta', {...}) once, then ('delta', text). Falls back to the next provider if nothing was sent yet.
        only="siteaccess" -> that provider alone, no cloud fallback (private mode)."""
        order = list(self.providers)
        if prefer and (p := self.by_name(prefer)):
            order = [p] + [x for x in order if x is not p]
        if only:
            order = [x for x in order if x.name == only]
        errors: list[str] = []
        for p in order:
            if not p.configured():
                errors.append(f"{p.name}: нет ключа")
                continue
            started = False
            use_model = model if (not prefer or prefer == p.name) else None
            try:
                async for chunk in p.stream_chat(messages, use_model, temperature):
                    if not started:
                        started = True
                        yield "meta", {"provider": p.name, "model": p.last_model, "fallback": bool(errors), "skipped": errors}
                    yield "delta", chunk
                if started:
                    return
            except ProviderError as e:
                errors.append(str(e))
                if started:  # mid-stream failure: cannot silently switch without duplicating text
                    yield "error", f"Соединение прервано ({e})"
                    return
        yield "error", "Модели недоступны: " + "; ".join(errors)


    async def complete_role(self, role: str, messages: list[dict], private: bool = False, temperature: float = 0.2) -> tuple[str, dict]:
        """Non-streaming call for background knowledge-base jobs.
        private=True -> only the own server (data never leaves it). Otherwise OpenRouter model chain for the role."""
        if private:
            p = self.by_name("siteaccess")
            if not p or not p.configured():
                raise ProviderError("private: собственный сервер не настроен")
            text = "".join([c async for c in p.stream_chat(messages, None, temperature)])
            return text, {"provider": p.name, "model": p.last_model}
        p = self.by_name("openrouter")
        if not p or not p.configured():
            raise ProviderError("openrouter: нет ключа")
        errors = []
        for model in settings.role_models[role]:
            try:
                text = "".join([c async for c in p.stream_chat(messages, model, temperature, "role")])
                return text, {"provider": p.name, "model": model, "role": role}
            except ProviderError as e:
                errors.append(f"{model}: {e}")
        raise ProviderError("; ".join(errors))

    async def embed(self, texts: list[str]) -> list[list[float]]:
        p = self.by_name("openrouter")
        if not p or not p.configured():
            raise ProviderError("openrouter: нет ключа")
        return await p.embed(texts, settings.embedding_model)  # type: ignore[attr-defined]
