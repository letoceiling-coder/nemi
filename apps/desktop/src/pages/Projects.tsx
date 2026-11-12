import { useState } from 'react'
import { ArrowLeft, Calendar, Plus, FileText, Mic, Gavel } from 'lucide-react'
import { projects, decisions, docs, meetings } from '../data'
import { useApp } from '../store'
import { Page, PageHeader, Card, Badge, Progress, Input, Tabs, Button, Section, Avatar } from '../ui'

const st = { active: ['ok', 'Активен'], paused: ['warn', 'На паузе'], done: ['neutral', 'Завершён'] } as const

export function ProjectsPage() {
  const { openId, go, tasks, setTaskStatus, notify } = useApp()
  const [q, setQ] = useState('')
  const [f, setF] = useState<'all' | 'active' | 'paused' | 'done'>('all')
  const [tab, setTab] = useState<'tasks' | 'decisions' | 'files' | 'meetings'>('tasks')
  const open = projects.find(p => p.id === openId)

  if (open) {
    const pt = tasks.filter(t => t.project === open.name)
    return (
      <Page>
        <div className="px-8 pt-6">
          <button onClick={() => go('projects')} className="mb-4 flex items-center gap-1.5 text-fg3 hover:text-fg"><ArrowLeft size={14} />Все проекты</button>
          <div className="flex items-start justify-between gap-4">
            <div><div className="flex items-center gap-3"><span className="size-3 rounded-full" style={{ background: open.color }} /><h1 className="text-[22px] font-semibold tracking-tight">{open.name}</h1><Badge tone={st[open.status][0]}>{st[open.status][1]}</Badge></div>
              <p className="mt-1.5 max-w-xl text-fg2">{open.desc}</p></div>
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => notify('Задача добавлена в проект')}>Задача</Button>
          </div>
          <div className="mt-5 grid grid-cols-4 gap-3">
            {[['Этап', open.stage], ['Срок', open.due], ['Задач', String(open.tasks)], ['Ответственный', open.owner]].map(([k, v]) => <Card key={k}><div className="text-[12px] text-fg3">{k}</div><div className="mt-0.5 font-medium">{v}</div></Card>)}
          </div>
          <div className="mt-4 flex items-center gap-3"><Progress value={open.progress} /><span className="text-fg2">{open.progress}%</span></div>
          <div className="mb-4 mt-6"><Tabs value={tab} onChange={setTab} items={[{ id: 'tasks', label: 'Задачи', count: pt.length }, { id: 'decisions', label: 'Журнал решений' }, { id: 'files', label: 'Документы' }, { id: 'meetings', label: 'Встречи' }]} /></div>
          {tab === 'tasks' && <div className="space-y-1.5">{pt.length === 0 ? <div className="text-fg3">В проекте пока нет задач.</div> : pt.map(t => (
            <Card key={t.id} className="flex items-center gap-3 !py-2.5"><input type="checkbox" checked={t.status === 'done'} onChange={e => setTaskStatus(t.id, e.target.checked ? 'done' : 'todo')} className="size-4 accent-[var(--accent)]" /><span className={t.status === 'done' ? 'text-fg3 line-through' : ''}>{t.title}</span><span className="ml-auto text-fg3">{t.due}</span></Card>))}</div>}
          {tab === 'decisions' && <div className="space-y-2">{decisions.filter(d => d.project === open.name).map(d => <Card key={d.text} className="flex gap-3"><Gavel size={16} className="mt-0.5 text-accent" /><div><div>{d.text}</div><div className="text-[12px] text-fg3">{d.d} · {d.src}</div></div></Card>)}
            {!decisions.some(d => d.project === open.name) && <div className="text-fg3">Решений пока нет. Скажите ассистенту: «По этому проекту решили…» — он добавит запись с источником.</div>}</div>}
          {tab === 'files' && <div className="space-y-2">{docs.filter(d => d.project === open.name).map(d => <Card key={d.id} className="flex items-center gap-3"><FileText size={16} className="text-fg3" /><span>{d.name}</span><span className="ml-auto text-fg3">{d.size}</span></Card>)}</div>}
          {tab === 'meetings' && <div className="space-y-2">{meetings.filter(m => m.project === open.name).map(m => <Card key={m.id} onClick={() => go('meetings', m.id)} className="flex items-center gap-3"><Mic size={16} className="text-info" /><span>{m.title}</span><span className="ml-auto text-fg3">{m.date}</span></Card>)}</div>}
        </div>
      </Page>
    )
  }

  const list = projects.filter(p => (f === 'all' || p.status === f) && p.name.toLowerCase().includes(q.toLowerCase()))
  return (
    <Page>
      <PageHeader title="Проекты" subtitle={`${projects.filter(p => p.status === 'active').length} активных`} actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => notify('Создание проекта: опишите его ассистенту')}>Новый проект</Button>} />
      <div className="flex items-center gap-3 px-8 pb-4">
        <Input placeholder="Поиск проектов" value={q} onChange={e => setQ(e.target.value)} className="w-72" />
        <Tabs value={f} onChange={setF} items={[{ id: 'all', label: 'Все' }, { id: 'active', label: 'Активные' }, { id: 'paused', label: 'На паузе' }, { id: 'done', label: 'Завершённые' }]} />
      </div>
      <div className="grid grid-cols-2 gap-3 px-8">
        {list.map(p => (
          <Card key={p.id} onClick={() => go('projects', p.id)}>
            <div className="mb-2 flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: p.color }} /><span className="flex-1 truncate font-medium">{p.name}</span><Badge tone={st[p.status][0]}>{st[p.status][1]}</Badge></div>
            <p className="mb-4 line-clamp-2 text-fg3">{p.desc}</p>
            <Progress value={p.progress} tone={p.progress === 100 ? 'ok' : 'accent'} />
            <div className="mt-3 flex items-center justify-between text-[12.5px] text-fg3"><span>{p.stage}</span><span className="flex items-center gap-1"><Calendar size={12} />{p.due}</span></div>
          </Card>
        ))}
      </div>
      {list.length === 0 && <div className="px-8 py-10 text-center text-fg3">Ничего не найдено. Измените запрос или фильтр.</div>}
      <div className="px-8 pt-8"><Section title="Последние решения">{decisions.map(d => <div key={d.text} className="flex items-center gap-3 border-b border-line py-2.5 last:border-0"><Avatar name="Фокус" size={22} /><span className="flex-1">{d.text}</span><span className="text-[12px] text-fg3">{d.src}</span></div>)}</Section></div>
    </Page>
  )
}
