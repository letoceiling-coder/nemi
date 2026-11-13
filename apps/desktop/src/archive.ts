import { create } from 'zustand'
import { req } from './api'

export type ActStatus = 'ok' | 'error' | 'declined' | 'timeout' | 'stopped'
export interface Action { id: string; run_id: string; conv_id: string | null; conv_title: string | null; tool: string; label: string; status: ActStatus; detail: string; ms: number; at: string }
export interface LiveRun { id: string; conv_id: string | null; started: number; current: string; approvals: { id: string; text: string }[] }
export interface ActivityResp { runs: LiveRun[]; stats: { running: number; waiting: number; done_today: number; errors_today: number }; items: Action[] }

export type HitKind = 'message' | 'task' | 'event' | 'memory' | 'project' | 'action'
export interface Hit { kind: HitKind; id: string; conv_id?: string; at: string; title: string; snippet: string; who?: 'user' | 'assistant'; status?: string }
export interface ArchiveStats { messages: number; conversations: number; tasks: number; events: number; memory: number; actions: number; since: string | null }

export interface BackupState { ok: boolean; at: string; key: string | null; size: number; error: string | null }
export interface Backups { last: BackupState | null; last_ok: BackupState | null; items: { key: string; size: number; at: string }[]; error: string | null; every_hours: number; keep_recent: number; restore_pending: boolean }
export interface Usage { ok: boolean; bucket: string; endpoint: string; total?: number; count?: number; folders?: Record<string, { size: number; count: number }>; error?: string }
export interface ToolInfo { name: string; description: string; risk: 'read' | 'write' | 'confirm'; cloud: boolean; enabled: boolean }

const qs = (o: Record<string, string | number | undefined>) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString()

export const archiveApi = {
  activity: (status = '', before?: string) => req<ActivityResp>(`/activity?${qs({ status, before, limit: 50 })}`),
  search: (q: string, kinds: HitKind[] = [], since?: string, until?: string) => req<Hit[]>(`/archive/search?${qs({ q, kinds: kinds.join(','), since, until, limit: 100 })}`),
  stats: () => req<ArchiveStats>('/archive/stats'),
  backups: () => req<Backups>('/system/backups'),
  backupNow: () => req<BackupState>('/system/backups', { method: 'POST' }),
  restore: (key: string) => req<{ ok: boolean; restart: boolean }>('/system/backups/restore', { method: 'POST', body: JSON.stringify({ key }) }),
  usage: () => req<Usage>('/storage/usage'),
  tools: () => req<ToolInfo[]>('/assistant/tools'),
  approve: (run: string, id: string, approve: boolean) => req<null>(`/assistant/runs/${run}/approvals/${id}`, { method: 'POST', body: JSON.stringify({ approve }) }),
}

export const KIND_RU: Record<HitKind, string> = { message: 'Диалог', task: 'Задача', event: 'Событие', memory: 'Память', project: 'Проект', action: 'Действие ассистента' }
export const STATUS_RU: Record<ActStatus, string> = { ok: 'выполнено', error: 'ошибка', declined: 'отклонено вами', timeout: 'нет ответа', stopped: 'остановлено' }

export const fmtSize = (b: number) => b < 1024 ? `${b} Б` : b < 1048576 ? `${(b / 1024).toFixed(0)} КБ` : b < 1073741824 ? `${(b / 1048576).toFixed(1)} МБ` : `${(b / 1073741824).toFixed(2)} ГБ`
export const fmtAt = (iso: string) => {
  const d = new Date(iso), now = new Date()
  const t = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === now.toDateString()) return t
  const y = new Date(now); y.setDate(now.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return `вчера, ${t}`
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() && { year: 'numeric' }) }) + `, ${t}`
}

/** Live state of the assistant for the top bar and the right panel: polled while the app is open. */
export const useLive = create<{ data: ActivityResp | null }>(() => ({ data: null }))
export function startLive(): () => void {
  let t: ReturnType<typeof setTimeout>
  let stopped = false
  const tick = async () => {
    try { useLive.setState({ data: await archiveApi.activity() }) } catch { /* backend restarting */ }
    if (!stopped) t = setTimeout(tick, useLive.getState().data?.runs.length ? 2500 : 10000)
  }
  tick()
  return () => { stopped = true; clearTimeout(t) }
}
