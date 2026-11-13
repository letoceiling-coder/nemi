"""Model Provider abstraction. Business logic never talks to a concrete API: it uses ModelRouter.
Priority: own server (siteaccess) -> OpenRouter fallback when the server is busy/unavailable."""
from __future__ import annotations
import asyncio
import json
import time
from abc import ABC, abstractmethod
from typing import AsyncIterator
import httpx
from . import budget
from .config import settings
from .secrets import get_secret


class ProviderError(Exception):
    """Provider unavailable/busy -> router should try the next one."""

    def __init__(self, msg: str, status: int | None = None):
        super().__init__(msg)
        self.status = status


class ModelProvider(ABC):
    name: str
    last_model: str | None = None

    @abstractmethod
    async def list_models(self) -> list[str]: ...

    @abstractmethod
    def stream_chat(self, messages: list[dict], model: str | None, temperature: float) -> AsyncIterator[str]: ...

    @abstractmethod
    def configured(self) -> bool: ...

    async def stream_turn(self, messages, model, temperature=0.7, kind: str = "chat", tools: list[dict] | None = None):
        """Default for providers without tool support: plain text turn."""
        first = True
        async for chunk in self.stream_chat(messages, model, temperature):
            if first:
                first = False
                yield "model", self.last_model
            yield "delta", chunk


class OpenAICompatProvider(ModelProvider):
    """Any OpenAI-compatible /v1 API (own server, OpenRouter, ...)."""

    def __init__(self, name: str, base_url: str, secret_name: str, default_model: str, extra_headers: dict | None = None,
                 paid: bool = False):
        self.name, self.base_url, self.secret_name = name, base_url.rstrip("/"), secret_name
        self.default_model, self.extra = default_model, extra_headers or {}
        self.paid = paid   # paid per call -> monthly limit is enforced and every call's cost goes to the ledger

    async def _guard(self, model: str | None = None) -> None:
        if self.paid and not budget.is_free(model):   # free models cost nothing: the money limit does not apply
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
        """Plain text stream (no tools)."""
        async for k, v in self.stream_turn(messages, model, temperature, kind):
            if k == "delta":
                yield v

    async def stream_turn(self, messages, model, temperature=0.7, kind: str = "chat", tools: list[dict] | None = None):
        """One model turn. Yields ("model", name) first, then ("delta", text)… and, if the model wants tools,
        a final ("tool_calls", [{"id", "name", "arguments"}]). Tool-call fragments are merged by index."""
        if not self.configured():
            raise ProviderError(f"{self.name}: нет ключа")
        model = model or self.default_model
        if not model:  # own server: pick the first available model
            ms = await self.list_models()
            if not ms:
                raise ProviderError(f"{self.name}: нет моделей")
            model = ms[0]
        await self._guard(model)
        self.last_model = model
        body = {"model": model, "messages": messages, "stream": True, "temperature": temperature}
        if tools:
            body["tools"] = tools
        if self.paid:
            body["usage"] = {"include": True}   # OpenRouter adds the exact cost to the final chunk
        cost = 0.0
        try:
            async with httpx.AsyncClient(timeout=self._timeout()) as c:
                async with c.stream("POST", f"{self.base_url}/chat/completions", json=body, headers=self._headers()) as r:
                    if r.status_code != 200:
                        await r.aread()
                        raise ProviderError(f"{self.name}: HTTP {r.status_code}", r.status_code)
                    yield "model", model
                    got = False
                    calls: dict[int, dict] = {}
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
                            d = ch[0].get("delta") or {}
                        except (KeyError, IndexError, TypeError, ValueError):
                            continue
                        for i, tc in enumerate(d.get("tool_calls") or []):
                            slot = calls.setdefault(tc.get("index", i), {"id": "", "name": "", "arguments": ""})
                            fn = tc.get("function") or {}
                            slot["id"] = tc.get("id") or slot["id"]
                            slot["name"] = fn.get("name") or slot["name"]
                            args = fn.get("arguments")
                            if isinstance(args, dict):
                                slot["arguments"] = json.dumps(args, ensure_ascii=False)
                            elif args:
                                slot["arguments"] += args
                        if d.get("content"):
                            got = True
                            yield "delta", d["content"]
                    if calls:
                        out = [dict(c, id=c["id"] or f"call_{i}") for i, c in sorted(calls.items()) if c["name"]]
                        if out:
                            yield "tool_calls", out
                            return
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
    """Chooses where a chat turn goes. Route chain (each route = provider + model):
         the user's explicit choice -> own server -> free OpenRouter models -> cheap paid model.
    A route is abandoned (and the next one tried) on an error or if it sends nothing within its first-token
    deadline - e.g. the GPU is busy and the request just sits in the queue. That is safe because nothing has been
    shown yet. Routes that failed recently are skipped for a while (circuit breaker)."""

    def __init__(self, providers: list[ModelProvider] | None = None):
        self.providers = providers or build_providers()
        self.down: dict[str, float] = {}           # route key -> monotonic time until which it is skipped

    def by_name(self, name: str) -> ModelProvider | None:
        return next((p for p in self.providers if p.name == name), None)

    def routes(self, model: str | None, prefer: str | None, only: str | None) -> list[tuple[str, str | None]]:
        r: list[tuple[str, str | None]] = []
        if prefer:
            r.append((prefer, model))
        if only:
            return [x for x in r if x[0] == only] or [(only, None)]
        r.append(("siteaccess", None))
        r += [("openrouter", m) for m in settings.chat_free_models]
        r += [("openrouter", m) for m in settings.chat_paid_models]
        seen, out = set(), []
        for x in r:
            if x not in seen and self.by_name(x[0]):
                seen.add(x)
                out.append(x)
        return out

    @staticmethod
    def _key(provider: str, model: str | None) -> str:
        return f"{provider}/{model or '*'}"

    def _mark_down(self, provider: str, model: str | None, e: Exception) -> None:
        secs = settings.cooldown_rate_limited if getattr(e, "status", None) == 429 else settings.cooldown_failed
        self.down[self._key(provider, model)] = time.monotonic() + secs

    def status(self) -> dict:
        now = time.monotonic()
        return {k: round(t - now) for k, t in self.down.items() if t > now}

    async def stream(self, messages: list[dict], model: str | None = None, prefer: str | None = None, temperature: float = 0.7,
                     only: str | None = None, tools: list[dict] | None = None):
        """Yields ('meta', {...}) once, then ('delta', text)... and possibly ('tool_calls', [...]).
        only="siteaccess" -> that provider alone, no cloud fallback (private mode)."""
        errors: list[str] = []
        chain = self.routes(model, prefer, only)
        for i, (pname, m) in enumerate(chain):
            p = self.by_name(pname)
            key = self._key(pname, m)
            last = i == len(chain) - 1
            if not p.configured():
                errors.append(f"{pname}: нет ключа")
                continue
            if not last and self.down.get(key, 0) > time.monotonic():
                errors.append(f"{m or pname}: недавно не отвечал, пропущен")
                continue
            if budget.is_free(m) and not budget.free_quota_ok():
                errors.append(f"{m}: дневной лимит бесплатных запросов исчерпан")
                continue
            deadline = settings.first_token_own if pname == "siteaccess" else settings.first_token_cloud
            agen = p.stream_turn(messages, m, temperature, "chat", tools)
            started, name = False, m
            try:
                t_end = time.monotonic() + deadline
                while True:
                    try:
                        if started:
                            kind, val = await agen.__anext__()
                        else:
                            kind, val = await asyncio.wait_for(agen.__anext__(), max(0.1, t_end - time.monotonic()))
                    except StopAsyncIteration:
                        break
                    if kind == "model":
                        name = val
                        continue
                    if not started:
                        started = True
                        self.down.pop(key, None)
                        yield "meta", {"provider": pname, "model": name, "fallback": bool(errors), "skipped": errors}
                    yield kind, val
                if started:
                    return
                errors.append(f"{name or pname}: пустой ответ")
            except asyncio.TimeoutError:
                await agen.aclose()
                errors.append(f"{name or pname}: нет ответа за {deadline:g} с (занят)")
                self._mark_down(pname, m, TimeoutError())
            except ProviderError as e:
                await agen.aclose()
                errors.append(f"{m}: {e}" if m else str(e))
                self._mark_down(pname, m, e)
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
