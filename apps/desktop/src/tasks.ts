// Tasks, projects and reminders: API client, date formatting, Windows notifications.
import { req, ApiError } from './api'
import { isDesktop } from './updates'

export type TaskStatus = 'todo' | 'doing' | 'done'
export type Priority = 'low' | 'mid' | 'high'
export interface Task {
  id: string; title: string; notes: string; status: TaskStatus; priority: Priority
  due: string | null; due_time: boolean; remind_at: string | null; reminded: boolean
  project_id: string | null; project: string | null; source: 'manual' | 'agent'
  created: string; updated: string; done_at: string | null
}
export interface Project {
  id: string; name: string; description: string; status: 'active' | 'paused' | 'done'; color: string
  tasks: number; done: number; progress: number; created: string
}
/** /reminders/due item: a task, or a calendar event about to start */
export type Reminder = (Task & { kind: 'task' }) | { kind: 'event'; id: string; title: string; start: string; location: string; remind_minutes: number }
export function reminderText(r: Reminder): string {
  if (r.kind === 'task') return `${r.title}${r.due ? ` — ${fmtDue(r)}` : ''}`
  const mins = Math.max(0, Math.round((new Date(r.start).getTime() - Date.now()) / 60000))
  return `${r.title} — ${mins ? `через ${mins} мин` : 'начинается'}${r.location ? ` · ${r.location}` : ''}`
}
export interface TaskInput { title: string; notes?: string; due?: string; due_time?: boolean; remind_at?: string; priority?: Priority; project_id?: string; quick?: boolean }

export const tasksApi = {
  list: (view = 'all') => req<Task[]>(`/tasks?view=${view}`),
  create: (t: TaskInput) => req<Task>('/tasks', { method: 'POST', body: JSON.stringify(t) }),
  update: (id: string, p: Partial<Omit<TaskInput, 'quick'>> & { status?: TaskStatus; clear?: string[] }) =>
    req<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(p) }),
  remove: (id: string) => req<{ ok: boolean }>(`/tasks/${id}`, { method: 'DELETE' }),
  dueReminders: () => req<Reminder[]>('/reminders/due'),
  projects: () => req<Project[]>('/projects'),
  createProject: (name: string, description = '') => req<Project>('/projects', { method: 'POST', body: JSON.stringify({ name, description }) }),
  updateProject: (id: string, p: { name: string; description: string; status: Project['status']; color?: string }) =>
    req<{ ok: boolean }>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(p) }),
  removeProject: (id: string) => req<{ ok: boolean }>(`/projects/${id}`, { method: 'DELETE' }),
}
export const errText = (e: unknown, fallback = 'Не удалось сохранить') => e instanceof ApiError ? e.message : fallback

// ---------- dates ----------
const day0 = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
const hm = (d: Date) => d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

/** «Сегодня, 11:00», «Завтра», «Вчера», «14 нояб», «Без срока» */
export function fmtDue(t: Pick<Task, 'due' | 'due_time'>): string {
  if (!t.due) return 'Без срока'
  const d = new Date(t.due), diff = Math.round((day0(d) - day0(new Date())) / 86400000)
  const day = diff === 0 ? 'Сегодня' : diff === 1 ? 'Завтра' : diff === -1 ? 'Вчера'
    : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', ...(d.getFullYear() !== new Date().getFullYear() && { year: 'numeric' }) }).replace('.', '')
  return t.due_time ? `${day}, ${hm(d)}` : day
}
export function isOverdue(t: Pick<Task, 'due' | 'due_time' | 'status'>): boolean {
  if (!t.due || t.status === 'done') return false
  const d = new Date(t.due)
  return t.due_time ? d.getTime() < Date.now() : day0(d) < day0(new Date())
}
export function isToday(t: Pick<Task, 'due'>): boolean {
  return !!t.due && day0(new Date(t.due)) <= day0(new Date())       // today + overdue: still today's work
}
/** value for <input type="datetime-local"> / "date" */
export const toLocalInput = (iso: string | null, withTime: boolean) => {
  if (!iso) return ''
  const d = new Date(iso), p = (n: number) => String(n).padStart(2, '0')
  const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  return withTime ? `${date}T${p(d.getHours())}:${p(d.getMinutes())}` : date
}

// ---------- reminders ----------
async function osNotify(title: string, body: string) {
  if (isDesktop()) {
    try {
      const n = await import('@tauri-apps/plugin-notification')
      let ok = await n.isPermissionGranted()
      if (!ok) ok = (await n.requestPermission()) === 'granted'
      if (ok) { n.sendNotification({ title, body }); return true }
    } catch { /* fall through */ }
  } else if (typeof Notification !== 'undefined') {
    if (Notification.permission === 'default') await Notification.requestPermission()
    if (Notification.permission === 'granted') { new Notification(title, { body }); return true }
  }
  return false
}

/** Polls the backend every 30 s; each due reminder becomes a Windows notification + an in-app toast. */
export function startReminders(onFire: (r: Reminder) => void) {
  let stopped = false
  const tick = async () => {
    if (stopped) return
    try {
      for (const t of await tasksApi.dueReminders()) {
        await osNotify(t.kind === 'event' ? 'NEMI · скоро встреча' : 'NEMI · напоминание', reminderText(t))
        onFire(t)
      }
    } catch { /* backend restarting: next tick */ }
  }
  const first = setTimeout(tick, 3000)
  const every = setInterval(tick, 30000)
  return () => { stopped = true; clearTimeout(first); clearInterval(every) }
}
