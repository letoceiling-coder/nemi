// Calendar events: API client and date helpers.
import { req } from './api'

export interface CalEvent {
  id: string; title: string; start: string; end: string; all_day: boolean
  location: string; notes: string; project_id: string | null; project: string | null
  remind_minutes: number; source: 'manual' | 'agent'; created: string
  conflicts?: CalEvent[]
}
export interface EventInput { title: string; start?: string; end?: string; all_day?: boolean; location?: string; notes?: string; project_id?: string; remind_minutes?: number; quick?: boolean }

export const calApi = {
  range: (start: Date, end: Date) => req<CalEvent[]>(`/events?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`),
  create: (e: EventInput) => req<CalEvent & { conflicts: CalEvent[] }>('/events', { method: 'POST', body: JSON.stringify(e) }),
  update: (id: string, p: Partial<EventInput> & { clear_project?: boolean }) => req<CalEvent>(`/events/${id}`, { method: 'PATCH', body: JSON.stringify(p) }),
  remove: (id: string) => req<{ ok: boolean }>(`/events/${id}`, { method: 'DELETE' }),
}

export const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const hm = (d: Date) => d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

/** Does the event touch this calendar day? (end is exclusive) */
export const onDay = (e: CalEvent, day: Date) => new Date(e.start) < addDays(startOfDay(day), 1) && new Date(e.end) > startOfDay(day)

export const fmtTime = (e: CalEvent) => e.all_day ? 'Весь день' : `${hm(new Date(e.start))}–${hm(new Date(e.end))}`

/** «Сегодня, 15:00», «Завтра, 9:30», «чт, 20 нояб, 10:00» */
export function fmtWhen(e: CalEvent): string {
  const s = new Date(e.start), today = startOfDay(new Date())
  const diff = Math.round((startOfDay(s).getTime() - today.getTime()) / 86400000)
  const day = diff === 0 ? 'Сегодня' : diff === 1 ? 'Завтра' : s.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '')
  return e.all_day ? day : `${day}, ${hm(s)}`
}

/** "2026-11-14T15:00" for <input type="datetime-local"> */
export const toInput = (iso: string) => {
  const d = new Date(iso), p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Is this a meeting link? (shown as a button) */
export const isLink = (s: string) => /^https?:\/\//i.test(s.trim())
