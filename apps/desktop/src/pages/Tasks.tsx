import { useState } from 'react'
import clsx from 'clsx'
import { Plus, Flag, Trash2 } from 'lucide-react'
import { useApp } from '../store'
import { Page, PageHeader, Tabs, Badge, Input, Button, Empty, Card, Modal } from '../ui'
import { Task } from '../data'

const pr = { high: ['err', 'Высокий'], mid: ['warn', 'Средний'], low: ['neutral', 'Низкий'] } as const

export function TasksPage() {
  const { tasks, setTaskStatus, addTask, notify } = useApp()
  const [tab, setTab] = useState<'today' | 'soon' | 'overdue' | 'done' | 'board'>('today')
  const [title, setTitle] = useState('')
  const [del, setDel] = useState<Task | null>(null)
  const [removed, setRemoved] = useState<string[]>([])
  const all = tasks.filter(t => !removed.includes(t.id))
  const isToday = (t: Task) => t.due.startsWith('Сегодня')
  const isOver = (t: Task) => t.due === 'Вчера' || t.due === '10 нояб'
  const sets = {
    today: all.filter(t => t.status !== 'done' && isToday(t)),
    soon: all.filter(t => t.status !== 'done' && !isToday(t) && !isOver(t)),
    overdue: all.filter(t => t.status !== 'done' && isOver(t)),
    done: all.filter(t => t.status === 'done'),
    board: all,
  }
  const cur = sets[tab]
  const submit = () => { if (title.trim()) { addTask(title.trim()); setTitle(''); notify('Задача создана') } }

  const Row = ({ t }: { t: Task }) => (
    <div className="group flex items-center gap-3 border-b border-line px-2 py-2.5 last:border-0 hover:bg-surface/60">
      <input type="checkbox" checked={t.status === 'done'} onChange={e => setTaskStatus(t.id, e.target.checked ? 'done' : 'todo')} className="size-4 accent-[var(--accent)]" aria-label="Выполнено" />
      <div className="min-w-0 flex-1"><div className={clsx('truncate', t.status === 'done' && 'text-fg3 line-through')}>{t.title}</div><div className="text-[12px] text-fg3">{t.project}{t.source && ` · из: ${t.source}`}</div></div>
      <Badge tone={pr[t.priority][0]}><Flag size={10} />{pr[t.priority][1]}</Badge>
      <span className={clsx('w-28 text-right text-[12.5px]', isOver(t) && t.status !== 'done' ? 'text-err' : 'text-fg3')}>{t.due}</span>
      <button onClick={() => setDel(t)} aria-label="Удалить" className="text-fg3 opacity-0 transition-opacity hover:text-err group-hover:opacity-100"><Trash2 size={14} /></button>
    </div>
  )

  return (
    <Page>
      <PageHeader title="Задачи" subtitle={`${sets.today.length} на сегодня · ${sets.overdue.length} просрочено`} />
      <div className="mb-4 flex gap-2 px-8">
        <Input icon={<Plus size={15} />} placeholder="Новая задача — например, «Завтра в 11:00 проверить договор»" value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} className="flex-1" />
        <Button variant="primary" onClick={submit} disabled={!title.trim()}>Добавить</Button>
      </div>
      <div className="mb-3 px-8"><Tabs value={tab} onChange={setTab} items={[{ id: 'today', label: 'Сегодня', count: sets.today.length }, { id: 'soon', label: 'Предстоящие', count: sets.soon.length }, { id: 'overdue', label: 'Просроченные', count: sets.overdue.length }, { id: 'done', label: 'Выполненные' }, { id: 'board', label: 'Доска' }]} /></div>
      <div className="px-8">
        {tab !== 'board' ? (cur.length === 0 ? <Empty title="Здесь пусто" hint="Создайте задачу выше или попросите ассистента извлечь задачи из писем и встреч." /> : <div>{cur.map(t => <Row key={t.id} t={t} />)}</div>) : (
          <div className="grid grid-cols-3 gap-3">
            {([['todo', 'К выполнению'], ['doing', 'В работе'], ['done', 'Готово']] as const).map(([k, l]) => (
              <div key={k} className="rounded-xl bg-surface2/60 p-2"
                onDragOver={e => e.preventDefault()} onDrop={e => { const id = e.dataTransfer.getData('id'); if (id) setTaskStatus(id, k) }}>
                <div className="px-2 pb-2 pt-1 text-[12.5px] font-medium text-fg2">{l} <span className="text-fg3">{all.filter(t => t.status === k).length}</span></div>
                <div className="min-h-24 space-y-2">
                  {all.filter(t => t.status === k).map(t => (
                    <div key={t.id} draggable onDragStart={e => e.dataTransfer.setData('id', t.id)}><Card className="!p-3 cursor-grab"><div className="mb-1.5 text-[13.5px]">{t.title}</div><div className="flex items-center justify-between text-[12px] text-fg3"><span className="truncate">{t.project}</span><Badge tone={pr[t.priority][0]}>{pr[t.priority][1]}</Badge></div></Card></div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Modal open={!!del} onClose={() => setDel(null)} title="Удалить задачу?" footer={<><Button onClick={() => setDel(null)}>Отмена</Button><Button variant="danger" onClick={() => { setRemoved(r => [...r, del!.id]); setDel(null); notify('Задача удалена') }}>Удалить</Button></>}>
        <p className="text-fg2">«{del?.title}» будет удалена. Это действие нельзя отменить.</p>
      </Modal>
    </Page>
  )
}
