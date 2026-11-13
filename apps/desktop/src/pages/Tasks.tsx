import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { Plus, Flag, Trash2, Bell, Sparkles, Loader2 } from 'lucide-react'
import { useApp } from '../store'
import { Page, PageHeader, Tabs, Badge, Input, Button, Empty, Card, Modal } from '../ui'
import { Task, Priority, fmtDue, isOverdue, isToday, toLocalInput } from '../tasks'

export const PR: Record<Priority, ['err' | 'warn' | 'neutral', string]> = { high: ['err', 'Высокий'], mid: ['warn', 'Средний'], low: ['neutral', 'Низкий'] }
const field = 'h-9 w-full rounded-lg border border-line bg-surface2 px-2.5 text-[13px] outline-none focus:border-accent'

/** Edit dialog: title, due (with or without time), reminder, priority, project, notes. */
export function TaskEditor({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const { projects, updateTask } = useApp()
  const [f, setF] = useState({ title: '', due: '', withTime: true, remind: '', priority: 'mid' as Priority, project: '', notes: '' })
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (task) setF({ title: task.title, due: toLocalInput(task.due, task.due_time), withTime: task.due ? task.due_time : true,
      remind: toLocalInput(task.remind_at, true), priority: task.priority, project: task.project_id ?? '', notes: task.notes })
  }, [task])
  if (!task) return null
  const save = async () => {
    setBusy(true)
    const clear = [!f.due && 'due', !f.remind && 'remind_at', !f.project && 'project_id'].filter(Boolean) as string[]
    await updateTask(task.id, {
      title: f.title.trim() || task.title, notes: f.notes, priority: f.priority,
      ...(f.due && { due: f.withTime ? f.due : `${f.due}T23:59`, due_time: f.withTime }),
      ...(f.remind && { remind_at: f.remind }), ...(f.project && { project_id: f.project }), clear,
    })
    setBusy(false); onClose()
  }
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(s => ({ ...s, [k]: e.target.value }))
  return (
    <Modal open onClose={onClose} title="Задача" footer={<><Button onClick={onClose}>Отмена</Button><Button variant="primary" disabled={busy} onClick={save}>{busy ? <Loader2 size={14} className="spin" /> : 'Сохранить'}</Button></>}>
      <div className="space-y-3 text-[13px]">
        <input className={field} value={f.title} onChange={set('title')} maxLength={300} aria-label="Название" />
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><span className="mb-1 block text-[12px] text-fg3">Срок</span>
            <input type={f.withTime ? 'datetime-local' : 'date'} className={field} value={f.due} onChange={set('due')} /></label>
          <label className="block"><span className="mb-1 block text-[12px] text-fg3">Напомнить</span>
            <input type="datetime-local" className={field} value={f.remind} onChange={set('remind')} /></label>
        </div>
        <label className="flex items-center gap-2 text-fg2"><input type="checkbox" className="accent-[var(--accent)]" checked={f.withTime}
          onChange={e => setF(s => ({ ...s, withTime: e.target.checked, due: s.due ? (e.target.checked ? `${s.due.slice(0, 10)}T09:00` : s.due.slice(0, 10)) : '' }))} />Срок с точным временем</label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><span className="mb-1 block text-[12px] text-fg3">Приоритет</span>
            <select className={field} value={f.priority} onChange={set('priority')}>{(Object.keys(PR) as Priority[]).map(p => <option key={p} value={p}>{PR[p][1]}</option>)}</select></label>
          <label className="block"><span className="mb-1 block text-[12px] text-fg3">Проект</span>
            <select className={field} value={f.project} onChange={set('project')}><option value="">Без проекта</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        </div>
        <textarea className={clsx(field, 'h-20 py-2')} placeholder="Заметки" value={f.notes} onChange={set('notes')} />
      </div>
    </Modal>
  )
}

export function TaskRow({ t, onOpen, onDelete, hideProject }: { t: Task; onOpen: (t: Task) => void; onDelete?: (t: Task) => void; hideProject?: boolean }) {
  const { setTaskStatus } = useApp()
  const over = isOverdue(t)
  return (
    <div className="group flex items-center gap-3 border-b border-line px-2 py-2.5 last:border-0 hover:bg-surface/60">
      <input type="checkbox" checked={t.status === 'done'} onChange={e => setTaskStatus(t.id, e.target.checked ? 'done' : 'todo')} className="size-4 shrink-0 accent-[var(--accent)]" aria-label="Выполнено" />
      <button onClick={() => onOpen(t)} className="min-w-0 flex-1 text-left">
        <div className={clsx('truncate', t.status === 'done' && 'text-fg3 line-through')}>{t.title}</div>
        <div className="flex items-center gap-1.5 text-[12px] text-fg3">
          {!hideProject && <span className="truncate">{t.project ?? 'Без проекта'}</span>}
          {t.source === 'agent' && <span className="flex items-center gap-0.5" title="Создано ассистентом"><Sparkles size={11} />ассистент</span>}
          {t.status === 'doing' && <span className="text-accent">в работе</span>}
        </div>
      </button>
      {t.remind_at && !t.reminded && t.status !== 'done' && <Bell size={13} className="shrink-0 text-fg3" aria-label="Есть напоминание" />}
      {t.priority !== 'mid' && <Badge tone={PR[t.priority][0]}><Flag size={10} />{PR[t.priority][1]}</Badge>}
      <span className={clsx('w-28 shrink-0 text-right text-[12.5px]', over ? 'text-err' : 'text-fg3')}>{fmtDue(t)}</span>
      {onDelete && <button onClick={() => onDelete(t)} aria-label="Удалить" className="text-fg3 opacity-0 transition-opacity hover:text-err group-hover:opacity-100 focus:opacity-100"><Trash2 size={14} /></button>}
    </div>
  )
}

export function TasksPage() {
  const { tasks, loadTasks, setTaskStatus, addTask, removeTask, notify } = useApp()
  const [tab, setTab] = useState<'today' | 'soon' | 'overdue' | 'done' | 'board'>('today')
  const [title, setTitle] = useState('')
  const [del, setDel] = useState<Task | null>(null)
  const [edit, setEdit] = useState<Task | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { loadTasks() }, [loadTasks])

  const open = tasks.filter(t => t.status !== 'done')
  const sets = {
    today: open.filter(isToday),
    soon: open.filter(t => !isToday(t)),
    overdue: open.filter(isOverdue),
    done: tasks.filter(t => t.status === 'done').sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? '')),
    board: tasks,
  }
  const cur = sets[tab]
  const submit = async () => {
    if (!title.trim() || busy) return
    setBusy(true)
    const t = await addTask(title.trim())
    setBusy(false)
    if (t) { setTitle(''); notify(t.due ? `Задача на ${fmtDue(t).toLowerCase()}${t.remind_at ? ' · напомню' : ''}` : 'Задача создана') }
  }

  return (
    <Page>
      <PageHeader title="Задачи" subtitle={`${sets.today.length} на сегодня · ${sets.overdue.length} просрочено`} />
      <div className="mb-4 flex gap-2 px-8">
        <Input icon={<Plus size={15} />} placeholder="Новая задача — например, «завтра в 11:00 проверить договор»" value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} className="flex-1" maxLength={300} />
        <Button variant="primary" onClick={submit} disabled={!title.trim() || busy}>Добавить</Button>
      </div>
      <div className="mb-3 px-8"><Tabs value={tab} onChange={setTab} items={[{ id: 'today', label: 'Сегодня', count: sets.today.length }, { id: 'soon', label: 'Предстоящие', count: sets.soon.length }, { id: 'overdue', label: 'Просроченные', count: sets.overdue.length }, { id: 'done', label: 'Выполненные' }, { id: 'board', label: 'Доска' }]} /></div>
      <div className="px-8 pb-8">
        {tab !== 'board' ? (cur.length === 0
          ? <Empty title={tab === 'today' ? 'На сегодня всё' : 'Здесь пусто'} hint="Напишите задачу выше со сроком («в пятницу позвонить Ивану») или попросите ассистента в чате: «добавь задачу…»." />
          : <div>{cur.map(t => <TaskRow key={t.id} t={t} onOpen={setEdit} onDelete={setDel} />)}</div>) : (
          <div className="grid grid-cols-3 gap-3">
            {([['todo', 'К выполнению'], ['doing', 'В работе'], ['done', 'Готово']] as const).map(([k, l]) => (
              <div key={k} className="rounded-xl bg-surface2/60 p-2"
                onDragOver={e => e.preventDefault()} onDrop={e => { const id = e.dataTransfer.getData('id'); if (id) setTaskStatus(id, k) }}>
                <div className="px-2 pb-2 pt-1 text-[12.5px] font-medium text-fg2">{l} <span className="text-fg3">{tasks.filter(t => t.status === k).length}</span></div>
                <div className="min-h-24 space-y-2">
                  {tasks.filter(t => t.status === k).map(t => (
                    <div key={t.id} draggable onDragStart={e => e.dataTransfer.setData('id', t.id)}>
                      <Card className="!p-3 cursor-grab" onClick={() => setEdit(t)}>
                        <div className="mb-1.5 text-[13.5px]">{t.title}</div>
                        <div className="flex items-center justify-between gap-2 text-[12px] text-fg3">
                          <span className="truncate">{t.project ?? 'Без проекта'}</span>
                          <span className={clsx('shrink-0', isOverdue(t) && 'text-err')}>{fmtDue(t)}</span>
                        </div>
                      </Card>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <TaskEditor task={edit} onClose={() => setEdit(null)} />
      <Modal open={!!del} onClose={() => setDel(null)} title="Удалить задачу?" footer={<><Button onClick={() => setDel(null)}>Отмена</Button><Button variant="danger" onClick={() => { removeTask(del!.id); setDel(null); notify('Задача удалена') }}>Удалить</Button></>}>
        <p className="text-fg2">«{del?.title}» будет удалена. Это действие нельзя отменить.</p>
      </Modal>
    </Page>
  )
}
