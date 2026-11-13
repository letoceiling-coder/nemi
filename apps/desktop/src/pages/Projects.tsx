import { useEffect, useState } from 'react'
import { ArrowLeft, Plus, Trash2, Loader2, FolderKanban } from 'lucide-react'
import { useApp } from '../store'
import { Page, PageHeader, Card, Badge, Progress, Input, Tabs, Button, Modal, Empty } from '../ui'
import { tasksApi, Task, Project, errText, isOverdue } from '../tasks'
import { TaskRow, TaskEditor } from './Tasks'

const ST = { active: ['ok', 'Активен'], paused: ['warn', 'На паузе'], done: ['neutral', 'Завершён'] } as const
const field = 'h-9 w-full rounded-lg border border-line bg-surface2 px-2.5 text-[13px] outline-none focus:border-accent'

function ProjectDialog({ open, onClose, project }: { open: boolean; onClose: () => void; project?: Project }) {
  const { loadTasks, notify, go } = useApp()
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [status, setStatus] = useState<Project['status']>('active')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setName(project?.name ?? ''); setDesc(project?.description ?? ''); setStatus(project?.status ?? 'active') } }, [open, project])
  const save = async () => {
    if (!name.trim()) return
    setBusy(true)
    try {
      if (project) await tasksApi.updateProject(project.id, { name: name.trim(), description: desc, status })
      else { const p = await tasksApi.createProject(name.trim(), desc); go('projects', p.id) }
      await loadTasks(); onClose()
    } catch (e) { notify(errText(e)) } finally { setBusy(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title={project ? 'Проект' : 'Новый проект'}
      footer={<><Button onClick={onClose}>Отмена</Button><Button variant="primary" disabled={busy || !name.trim()} onClick={save}>{busy ? <Loader2 size={14} className="spin" /> : project ? 'Сохранить' : 'Создать'}</Button></>}>
      <div className="space-y-3">
        <input autoFocus className={field} placeholder="Название" value={name} onChange={e => setName(e.target.value)} maxLength={120} onKeyDown={e => e.key === 'Enter' && save()} />
        <textarea className={`${field} h-20 py-2`} placeholder="Описание (необязательно)" value={desc} onChange={e => setDesc(e.target.value)} />
        {project && <Tabs value={status} onChange={setStatus} items={[{ id: 'active', label: 'Активен' }, { id: 'paused', label: 'На паузе' }, { id: 'done', label: 'Завершён' }]} />}
      </div>
    </Modal>
  )
}

export function ProjectsPage() {
  const { openId, go, tasks, projects, loadTasks, addTask, removeTask, notify } = useApp()
  const [q, setQ] = useState('')
  const [f, setF] = useState<'all' | 'active' | 'paused' | 'done'>('active')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(false)
  const [delAsk, setDelAsk] = useState(false)
  const [edit, setEdit] = useState<Task | null>(null)
  const [del, setDel] = useState<Task | null>(null)
  const [title, setTitle] = useState('')
  useEffect(() => { loadTasks() }, [loadTasks])
  const open = projects.find(p => p.id === openId)

  if (open) {
    const pt = tasks.filter(t => t.project_id === open.id)
    const todo = pt.filter(t => t.status !== 'done'), done = pt.filter(t => t.status === 'done')
    const add = async () => { if (title.trim() && await addTask(title.trim(), { project_id: open.id })) setTitle('') }
    return (
      <Page>
        <div className="px-8 pb-8 pt-6">
          <button onClick={() => go('projects')} className="mb-4 flex items-center gap-1.5 text-fg3 hover:text-fg"><ArrowLeft size={14} />Все проекты</button>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3"><span className="size-3 shrink-0 rounded-full" style={{ background: open.color }} /><h1 className="truncate text-[22px] font-semibold tracking-tight">{open.name}</h1><Badge tone={ST[open.status][0]}>{ST[open.status][1]}</Badge></div>
              {open.description && <p className="mt-1.5 max-w-xl whitespace-pre-wrap text-fg2">{open.description}</p>}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button onClick={() => setEditing(true)}>Изменить</Button>
              <Button icon={<Trash2 size={14} />} onClick={() => setDelAsk(true)}>Удалить</Button>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3">
            {[['Задач', String(pt.length)], ['Выполнено', String(done.length)], ['Просрочено', String(todo.filter(isOverdue).length)]].map(([k, v]) => <Card key={k}><div className="text-[12px] text-fg3">{k}</div><div className="mt-0.5 text-[18px] font-medium">{v}</div></Card>)}
          </div>
          <div className="mt-4 flex items-center gap-3"><Progress value={open.progress} tone={open.progress === 100 ? 'ok' : 'accent'} /><span className="text-fg2">{open.progress}%</span></div>
          <div className="mb-3 mt-6 flex gap-2">
            <Input icon={<Plus size={15} />} placeholder="Задача в проект — например, «в пятницу согласовать макеты»" value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} className="flex-1" maxLength={300} />
            <Button variant="primary" onClick={add} disabled={!title.trim()}>Добавить</Button>
          </div>
          {pt.length === 0 ? <div className="py-6 text-center text-fg3">В проекте пока нет задач.</div> : <div>{[...todo, ...done].map(t => <TaskRow key={t.id} t={t} onOpen={setEdit} onDelete={setDel} hideProject />)}</div>}
        </div>
        <ProjectDialog open={editing} onClose={() => setEditing(false)} project={open} />
        <TaskEditor task={edit} onClose={() => setEdit(null)} />
        <Modal open={!!del} onClose={() => setDel(null)} title="Удалить задачу?" footer={<><Button onClick={() => setDel(null)}>Отмена</Button><Button variant="danger" onClick={() => { removeTask(del!.id); setDel(null) }}>Удалить</Button></>}>
          <p className="text-fg2">«{del?.title}» будет удалена.</p>
        </Modal>
        <Modal open={delAsk} onClose={() => setDelAsk(false)} title="Удалить проект?" footer={<><Button onClick={() => setDelAsk(false)}>Отмена</Button><Button variant="danger" onClick={async () => {
          try { await tasksApi.removeProject(open.id); setDelAsk(false); go('projects'); loadTasks(); notify('Проект удалён, задачи сохранены') } catch (e) { notify(errText(e)) }
        }}>Удалить</Button></>}>
          <p className="text-fg2">Проект «{open.name}» будет удалён. Его задачи ({pt.length}) останутся в списке без проекта.</p>
        </Modal>
      </Page>
    )
  }

  const list = projects.filter(p => (f === 'all' || p.status === f) && p.name.toLowerCase().includes(q.trim().toLowerCase()))
  const loose = tasks.filter(t => !t.project_id && t.status !== 'done').length
  return (
    <Page>
      <PageHeader title="Проекты" subtitle={`${projects.filter(p => p.status === 'active').length} активных${loose ? ` · ${loose} задач без проекта` : ''}`}
        actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => setCreating(true)}>Новый проект</Button>} />
      <div className="flex items-center gap-3 px-8 pb-4">
        <Input placeholder="Поиск проектов" value={q} onChange={e => setQ(e.target.value)} className="w-72" />
        <Tabs value={f} onChange={setF} items={[{ id: 'active', label: 'Активные' }, { id: 'paused', label: 'На паузе' }, { id: 'done', label: 'Завершённые' }, { id: 'all', label: 'Все' }]} />
      </div>
      {projects.length === 0 ? (
        <div className="px-8"><Empty title="Проектов пока нет" hint="Создайте проект или скажите ассистенту: «добавь задачу … в проект Сайт» — проект появится сам."
          action={<Button variant="primary" icon={<FolderKanban size={14} />} onClick={() => setCreating(true)}>Создать проект</Button>} /></div>
      ) : (
        <div className="grid grid-cols-2 gap-3 px-8 pb-8">
          {list.map(p => (
            <Card key={p.id} onClick={() => go('projects', p.id)}>
              <div className="mb-2 flex items-center gap-2"><span className="size-2.5 shrink-0 rounded-full" style={{ background: p.color }} /><span className="flex-1 truncate font-medium">{p.name}</span><Badge tone={ST[p.status][0]}>{ST[p.status][1]}</Badge></div>
              <p className="mb-4 line-clamp-2 min-h-[2.6em] text-fg3">{p.description || 'Без описания'}</p>
              <Progress value={p.progress} tone={p.progress === 100 ? 'ok' : 'accent'} />
              <div className="mt-3 flex items-center justify-between text-[12.5px] text-fg3"><span>Задач: {p.tasks} · выполнено {p.done}</span><span>{p.progress}%</span></div>
            </Card>
          ))}
          {list.length === 0 && <div className="col-span-2 py-10 text-center text-fg3">Ничего не найдено. Измените запрос или фильтр.</div>}
        </div>
      )}
      <ProjectDialog open={creating} onClose={() => setCreating(false)} />
    </Page>
  )
}
