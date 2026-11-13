import { useCallback, useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { ChevronLeft, ChevronRight, Plus, MapPin, Video, Trash2, Loader2, Bell, CheckSquare, Sparkles } from 'lucide-react'
import { Page, PageHeader, Card, IconButton, Button, Input, Modal } from '../ui'
import { useApp } from '../store'
import { calApi, CalEvent, onDay, fmtTime, sameDay, startOfDay, addDays, toInput, isLink } from '../calendar'
import { errText, fmtDue } from '../tasks'

const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const field = 'h-9 w-full rounded-lg border border-line bg-surface2 px-2.5 text-[13px] outline-none focus:border-accent'
const REMIND = [[0, 'Не напоминать'], [5, 'За 5 минут'], [15, 'За 15 минут'], [30, 'За 30 минут'], [60, 'За час'], [1440, 'За день']] as const

function EventDialog({ ev, draftDay, onClose, onSaved }: { ev: CalEvent | null; draftDay: Date | null; onClose: () => void; onSaved: () => void }) {
  const { projects, notify } = useApp()
  const open = !!ev || !!draftDay
  const [f, setF] = useState({ title: '', start: '', end: '', allDay: false, location: '', notes: '', project: '', remind: 15 })
  const [busy, setBusy] = useState(false)
  const [ask, setAsk] = useState(false)
  useEffect(() => {
    if (ev) setF({ title: ev.title, start: toInput(ev.start), end: toInput(ev.end), allDay: ev.all_day, location: ev.location, notes: ev.notes, project: ev.project_id ?? '', remind: ev.remind_minutes })
    else if (draftDay) {
      const s = new Date(draftDay); s.setHours(10, 0, 0, 0)
      setF({ title: '', start: toInput(s.toISOString()), end: toInput(new Date(s.getTime() + 3600e3).toISOString()), allDay: false, location: '', notes: '', project: '', remind: 15 })
    }
    setAsk(false)
  }, [ev, draftDay])
  if (!open) return null
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(s => ({ ...s, [k]: e.target.value }))
  const save = async () => {
    if (!f.title.trim() || !f.start) return
    setBusy(true)
    const body = { title: f.title.trim(), start: f.start, end: f.allDay ? undefined : f.end || undefined, all_day: f.allDay, location: f.location, notes: f.notes, remind_minutes: Number(f.remind), ...(f.project && { project_id: f.project }) }
    try {
      if (ev) await calApi.update(ev.id, { ...body, ...(!f.project && { clear_project: true }) })
      else {
        const r = await calApi.create(body)
        if (r.conflicts.length) notify(`Пересекается: ${r.conflicts.map(c => c.title).join(', ')}`)
      }
      onSaved(); onClose()
    } catch (e) { notify(errText(e)) } finally { setBusy(false) }
  }
  const del = async () => {
    if (!ev) return
    if (!ask) { setAsk(true); return }
    try { await calApi.remove(ev.id); onSaved(); onClose() } catch (e) { notify(errText(e, 'Не удалось удалить')) }
  }
  return (
    <Modal open onClose={onClose} title={ev ? 'Событие' : 'Новое событие'} footer={<>
      {ev && <Button className="mr-auto" icon={<Trash2 size={13} />} onClick={del}>{ask ? 'Точно удалить?' : 'Удалить'}</Button>}
      <Button onClick={onClose}>Отмена</Button>
      <Button variant="primary" disabled={busy || !f.title.trim()} onClick={save}>{busy ? <Loader2 size={14} className="spin" /> : 'Сохранить'}</Button></>}>
      <div className="space-y-3 text-[13px]">
        <input autoFocus className={field} placeholder="Название" value={f.title} onChange={set('title')} maxLength={300} />
        <label className="flex items-center gap-2 text-fg2"><input type="checkbox" className="accent-[var(--accent)]" checked={f.allDay} onChange={e => setF(s => ({ ...s, allDay: e.target.checked }))} />Весь день</label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><span className="mb-1 block text-[12px] text-fg3">Начало</span><input type={f.allDay ? 'date' : 'datetime-local'} className={field} value={f.allDay ? f.start.slice(0, 10) : f.start} onChange={e => setF(s => ({ ...s, start: f.allDay ? `${e.target.value}T00:00` : e.target.value }))} /></label>
          {!f.allDay && <label className="block"><span className="mb-1 block text-[12px] text-fg3">Конец</span><input type="datetime-local" className={field} value={f.end} onChange={set('end')} /></label>}
        </div>
        <input className={field} placeholder="Место или ссылка на звонок" value={f.location} onChange={set('location')} maxLength={500} />
        <div className="grid grid-cols-2 gap-2">
          <select className={field} value={f.remind} onChange={e => setF(s => ({ ...s, remind: Number(e.target.value) }))} aria-label="Напоминание">{REMIND.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <select className={field} value={f.project} onChange={set('project')} aria-label="Проект"><option value="">Без проекта</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </div>
        <textarea className={clsx(field, 'h-16 py-2')} placeholder="Заметки" value={f.notes} onChange={set('notes')} />
      </div>
    </Modal>
  )
}

export function CalendarPage() {
  const { tasks, projects, notify, calTick, loadTasks } = useApp()
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [sel, setSel] = useState(() => startOfDay(new Date()))
  const [evs, setEvs] = useState<CalEvent[]>([])
  const [edit, setEdit] = useState<CalEvent | null>(null)
  const [draft, setDraft] = useState<Date | null>(null)
  const [quick, setQuick] = useState('')
  const [busy, setBusy] = useState(false)

  // the grid always shows 6 weeks starting on Monday
  const gridStart = useMemo(() => addDays(month, -((month.getDay() + 6) % 7)), [month])
  const cells = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)), [gridStart])
  const load = useCallback(() => { calApi.range(gridStart, addDays(gridStart, 42)).then(setEvs).catch(() => {}) }, [gridStart])
  useEffect(() => { load() }, [load, calTick])
  useEffect(() => { loadTasks() }, [loadTasks])

  const color = (e: CalEvent) => projects.find(p => p.id === e.project_id)?.color ?? 'var(--accent)'
  const dayTasks = (d: Date) => tasks.filter(t => t.status !== 'done' && t.due && sameDay(new Date(t.due), d))
  const today = startOfDay(new Date())
  const selEvents = evs.filter(e => onDay(e, sel))
  const go = (n: number) => setMonth(m => new Date(m.getFullYear(), m.getMonth() + n, 1))
  const add = async () => {
    if (!quick.trim() || busy) return
    setBusy(true)
    try {
      const r = await calApi.create({ title: quick.trim(), quick: true })
      setQuick(''); load()
      const s = new Date(r.start)
      setSel(startOfDay(s)); setMonth(new Date(s.getFullYear(), s.getMonth(), 1))
      notify(r.conflicts.length ? `Добавлено, но пересекается: ${r.conflicts.map(c => c.title).join(', ')}` : 'Событие добавлено')
    } catch (e) { notify(errText(e)) } finally { setBusy(false) }
  }

  return (
    <Page>
      <PageHeader title="Календарь" subtitle={month.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
        actions={<>
          <Button size="sm" onClick={() => { setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSel(today) }}>Сегодня</Button>
          <IconButton label="Предыдущий месяц" onClick={() => go(-1)}><ChevronLeft size={16} /></IconButton>
          <IconButton label="Следующий месяц" onClick={() => go(1)}><ChevronRight size={16} /></IconButton>
        </>} />
      <div className="mb-4 flex gap-2 px-8">
        <Input icon={<Plus size={15} />} placeholder="Новое событие — например, «завтра в 15:00 созвон с Иваном на 30 минут»" value={quick} onChange={e => setQuick(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} className="flex-1" maxLength={300} />
        <Button variant="primary" onClick={add} disabled={!quick.trim() || busy}>Добавить</Button>
      </div>
      <div className="grid grid-cols-[1fr_300px] gap-5 px-8 pb-8">
        <div className="overflow-hidden rounded-xl border border-line">
          <div className="grid grid-cols-7 border-b border-line bg-surface text-center text-[12px] text-fg3">{WD.map(d => <div key={d} className="py-2">{d}</div>)}</div>
          <div className="grid grid-cols-7">
            {cells.map(d => {
              const inMonth = d.getMonth() === month.getMonth()
              const de = evs.filter(e => onDay(e, d)), dt = dayTasks(d)
              return (
                <button key={d.toISOString()} onClick={() => setSel(d)} onDoubleClick={() => setDraft(d)}
                  className={clsx('h-[92px] overflow-hidden border-b border-r border-line p-1.5 text-left align-top transition-colors hover:bg-surface2', !inMonth && 'opacity-40', sameDay(d, sel) && 'bg-accentsoft')}>
                  <span className={clsx('grid size-6 place-items-center rounded-full text-[12.5px]', sameDay(d, today) && 'bg-accent text-accentfg')}>{d.getDate()}</span>
                  {de.slice(0, 2).map(e => <div key={e.id} className="mt-0.5 truncate rounded px-1 text-[11px]" style={{ background: `color-mix(in srgb, ${color(e)} 20%, transparent)`, color: color(e) }}>{!e.all_day && new Date(e.start).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) + ' '}{e.title}</div>)}
                  {(de.length > 2 || dt.length > 0) && <div className="mt-0.5 truncate px-1 text-[11px] text-fg3">{de.length > 2 && `ещё ${de.length - 2}`}{de.length > 2 && dt.length > 0 && ' · '}{dt.length > 0 && `задач: ${dt.length}`}</div>}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-medium">{sameDay(sel, today) ? 'Сегодня, ' : ''}{sel.toLocaleDateString('ru-RU', { weekday: sameDay(sel, today) ? undefined : 'long', day: 'numeric', month: 'long' })}</h3>
            <IconButton label="Добавить событие на этот день" onClick={() => setDraft(sel)}><Plus size={15} /></IconButton>
          </div>
          <div className="space-y-2">
            {selEvents.map(e => (
              <Card key={e.id} className="!p-3" onClick={() => setEdit(e)}>
                <div className="flex gap-2.5">
                  <span className="w-1 shrink-0 rounded-full" style={{ background: color(e) }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px]">{e.title}</div>
                    <div className="flex items-center gap-1.5 text-[12px] text-fg3">{fmtTime(e)}{e.remind_minutes > 0 && !e.all_day && <Bell size={11} />}{e.source === 'agent' && <Sparkles size={11} />}{e.project && <span className="truncate">· {e.project}</span>}</div>
                    {e.location && (isLink(e.location)
                      ? <a href={e.location} target="_blank" rel="noreferrer" onClick={ev => ev.stopPropagation()} className="mt-1 inline-flex items-center gap-1 text-[12px] text-accent hover:underline"><Video size={12} />Подключиться</a>
                      : <div className="mt-1 flex items-center gap-1 text-[12px] text-fg3"><MapPin size={12} />{e.location}</div>)}
                  </div>
                </div>
              </Card>
            ))}
            {dayTasks(sel).map(t => (
              <div key={t.id} className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-fg2"><CheckSquare size={14} className="shrink-0 text-fg3" /><span className="min-w-0 flex-1 truncate">{t.title}</span><span className="text-[12px] text-fg3">{fmtDue(t).replace(/^.*, /, '')}</span></div>
            ))}
            {selEvents.length === 0 && dayTasks(sel).length === 0 && <div className="text-fg3">Ничего не запланировано. Добавьте событие выше, двойным щелчком по дню или попросите ассистента: «запланируй созвон…».</div>}
          </div>
        </div>
      </div>
      <EventDialog ev={edit} draftDay={draft} onClose={() => { setEdit(null); setDraft(null) }} onSaved={load} />
    </Page>
  )
}
