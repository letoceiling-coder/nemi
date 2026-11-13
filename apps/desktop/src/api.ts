// Клиент backend (FastAPI, localhost). Токен хранится только в sessionStorage.
export const API = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://127.0.0.1:8731/api/v1'

export interface User { id: string; name: string; email: string }
export interface ProviderModels { provider: string; available: boolean; error?: string; models: string[] }
export interface Health {
  backend: string; version: string; disk_free_gb: number
  secrets: Record<string, boolean>
  s3: { ok: boolean; bucket?: string; error?: string }
  providers: { name: string; configured: boolean }[]
}
export type ChatEvent =
  | { type: 'conversation'; id: string }
  | { type: 'meta'; provider: string; model: string; fallback: boolean; skipped: string[] }
  | { type: 'delta'; text: string }
  | { type: 'recall'; count: number }
  | { type: 'answered' }
  | { type: 'memory'; added: string[] }
  | ({ type: 'budget' } & Budget)
  | { type: 'error'; message: string }
  | { type: 'run'; id: string }
  | { type: 'step'; id: string; label: string; tool: string; status: 'active' | 'done' | 'error' | 'wait'; detail?: string }
  | { type: 'approval'; id: string; run: string; tool: string; text: string }
  | { type: 'approval_done'; id: string; result: 'approved' | 'declined' | 'timeout' | 'stopped' }
  | { type: 'ui'; action: 'open_browser'; url: string }
  | { type: 'done' }

export interface Budget { limit: number; spent: number; ratio: number; level: 'ok' | 'warn' | 'stop'; month: string }

export const getToken = () => sessionStorage.getItem('pai_token') || ''
export const getUser = (): User | null => { try { return JSON.parse(sessionStorage.getItem('pai_user_obj') || 'null') } catch { return null } }
export const setSession = (token: string, user: User) => { sessionStorage.setItem('pai_token', token); sessionStorage.setItem('pai_user_obj', JSON.stringify(user)) }
export const clearSession = () => { sessionStorage.removeItem('pai_token'); sessionStorage.removeItem('pai_user_obj') }
/** localStorage-ключ, изолированный по аккаунту */
export const userKey = (k: string) => `pai:${getUser()?.id ?? 'anon'}:${k}`

export class ApiError extends Error { constructor(public status: number, msg: string) { super(msg) } }

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  let r: Response
  try {
    r = await fetch(API + path, { ...init, headers: { 'Content-Type': 'application/json', ...(getToken() && { Authorization: `Bearer ${getToken()}` }), ...init.headers } })
  } catch {
    throw new ApiError(0, 'Служба ассистента запускается или не отвечает. Подождите несколько секунд и повторите.')
  }
  if (r.status === 401 && getToken()) { clearSession(); location.reload() }
  if (!r.ok) {
    const d = await r.json().catch(() => ({}))
    throw new ApiError(r.status, typeof d.detail === 'string' ? d.detail : 'Ошибка запроса')
  }
  return r.json()
}

export const api = {
  register: (name: string, email: string, password: string) => req<{ token: string; user: User }>('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) }),
  login: (login: string, password: string) => req<{ token: string; user: User }>('/auth/login', { method: 'POST', body: JSON.stringify({ login, password }) }),
  health: () => req<Health>('/system/health'),
  models: () => req<ProviderModels[]>('/models'),
  putSecret: (name: string, value: string) => req<{ ok: boolean }>(`/system/secrets/${name}`, { method: 'PUT', body: JSON.stringify({ value }) }),
  audit: () => req<{ action: string; detail: string; at: string }[]>('/system/audit'),
  logs: (lines = 200, level = '') => req<{ file: string; lines: string[] }>(`/system/logs?lines=${lines}${level ? `&level=${level}` : ''}`),
  budget: () => req<Budget>('/system/budget'),
  setBudget: (limit: number) => req<Budget>('/system/budget', { method: 'PUT', body: JSON.stringify({ limit }) }),
  modelRoles: () => req<ModelRoles>('/models/roles'),
  modelSettings: () => req<{ private_only: boolean }>('/models/settings'),
  setModelSettings: (private_only: boolean) => req<{ private_only: boolean }>('/models/settings', { method: 'PUT', body: JSON.stringify({ private_only }) }),
  approve: (run: string, id: string, approve: boolean) => req<{ ok: boolean }>(`/assistant/runs/${run}/approvals/${id}`, { method: 'POST', body: JSON.stringify({ approve }) }),
  stopAgents: () => req<{ stopped: number }>('/assistant/stop', { method: 'POST' }),
  conversations: () => req<Conv[]>('/assistant/conversations'),
  conversation: (id: string) => req<{ id: string; title: string; messages: { role: 'user' | 'assistant'; content: string; provider?: string; model?: string; tools?: { label: string; tool: string; status: 'done' | 'error' }[] }[] }>(`/assistant/conversations/${id}`),
  renameConversation: (id: string, title: string) => req<{ ok: boolean }>(`/assistant/conversations/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) }),
  deleteConversation: (id: string) => req<{ ok: boolean }>(`/assistant/conversations/${id}`, { method: 'DELETE' }),
}

export interface ModelRoles { roles: Record<string, string[]>; embedding: string }
export interface Conv { id: string; title: string; created: string; updated: string; messages: number }

export type FactKind = 'profile' | 'preference' | 'person' | 'project' | 'fact'
export interface Fact { id: string; text: string; kind: FactKind; source: 'auto' | 'manual'; conv_id?: string; created: string; updated: string }
export const memoryApi = {
  list: (q = '') => req<Fact[]>(`/memory${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  add: (text: string, kind: FactKind = 'fact') => req<Fact & { new: boolean }>('/memory', { method: 'POST', body: JSON.stringify({ text, kind }) }),
  edit: (id: string, text: string, kind: FactKind) => req<Fact>(`/memory/${id}`, { method: 'PATCH', body: JSON.stringify({ text, kind }) }),
  remove: (id: string) => req<{ ok: boolean }>(`/memory/${id}`, { method: 'DELETE' }),
  clear: () => req<{ ok: boolean; deleted: number }>('/memory', { method: 'DELETE' }),
}
/** Auto-memory switch (per account, default on) */
export const getAutoMemory = () => localStorage.getItem(userKey('memory_auto')) !== '0'
export const setAutoMemory = (on: boolean) => localStorage.setItem(userKey('memory_auto'), on ? '1' : '0')

export async function* chatStream(body: { message: string; conversation_id?: string; model?: string; prefer?: string; remember?: boolean }, signal: AbortSignal): AsyncGenerator<ChatEvent> {
  let r: Response
  try {
    r = await fetch(API + '/assistant/chat', { method: 'POST', signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` }, body: JSON.stringify(body) })
  } catch (e) {
    if ((e as Error).name === 'AbortError') return
    yield { type: 'error', message: 'Служба ассистента не запущена.' }; return
  }
  if (!r.ok || !r.body) { yield { type: 'error', message: `Ошибка ${r.status}` }; return }
  const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = ''
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break
      buf += dec.decode(value, { stream: true })
      let i: number
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 2)
        if (line.startsWith('data:')) yield JSON.parse(line.slice(5)) as ChatEvent
      }
    }
  } catch (e) { if ((e as Error).name !== 'AbortError') yield { type: 'error', message: 'Соединение прервано' } }
}

export interface ModelPref { provider?: string; model?: string }
export const getPref = (): ModelPref => { try { return JSON.parse(localStorage.getItem(userKey('model')) || '{}') } catch { return {} } }
export const setPref = (p: ModelPref) => localStorage.setItem(userKey('model'), JSON.stringify(p))
