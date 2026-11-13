import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { CornerDownLeft, FolderKanban, CheckSquare, Settings, Sparkles, Plus, MessageSquare, Archive } from 'lucide-react'
import { useApp } from '../store'

interface Cmd { id: string; label: string; group: string; icon: typeof Plus; run: () => void }

export function Palette() {
  const { palette, setPalette, go, tasks, projects, convs, openConv, addTask, notify, toggleTheme, setMessages } = useApp()
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (palette) { setQ(''); setI(0); setTimeout(() => ref.current?.focus(), 10) } }, [palette])

  const list = useMemo(() => {
    const close = () => setPalette(false)
    const c: Cmd[] = []
    if (q.trim()) {
      c.push({ id: 'ask', label: `Спросить ассистента: «${q}»`, group: 'Действия', icon: Sparkles, run: () => { close(); (window as unknown as { __ask?: string }).__ask = q; setMessages(() => []); go('chat') } })
      c.push({ id: 'new', label: `Создать задачу: «${q}»`, group: 'Действия', icon: Plus, run: () => { addTask(q); close(); notify('Задача создана'); go('tasks') } })
    }
    if (q.trim().length >= 2) c.push({ id: 'arch', label: `Искать «${q}» во всей истории`, group: 'Действия', icon: Archive, run: () => { close(); (window as unknown as { __archive?: string }).__archive = q; go('archive') } })
    projects.forEach(p => c.push({ id: p.id, label: p.name, group: 'Проекты', icon: FolderKanban, run: () => { close(); go('projects', p.id) } }))
    tasks.filter(t => t.status !== 'done').forEach(t => c.push({ id: t.id, label: t.title, group: 'Задачи', icon: CheckSquare, run: () => { close(); go('tasks') } }))
    convs.forEach(h => c.push({ id: h.id, label: h.title || 'Без названия', group: 'Диалоги', icon: MessageSquare, run: () => { close(); openConv(h.id) } }))
    c.push({ id: 's', label: 'Настройки', group: 'Переход', icon: Settings, run: () => { close(); go('settings') } })
    c.push({ id: 'th', label: 'Сменить тему', group: 'Переход', icon: Settings, run: () => { close(); toggleTheme() } })
    const s = q.trim().toLowerCase()
    return s ? c.filter(x => x.id === 'ask' || x.id === 'new' || x.id === 'arch' || x.label.toLowerCase().includes(s)).slice(0, 40) : c.slice(0, 9)
  }, [q, tasks, projects, convs, openConv, go, addTask, notify, setPalette, toggleTheme, setMessages])

  if (!palette) return null
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setI(x => Math.min(x + 1, list.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setI(x => Math.max(x - 1, 0)) }
    if (e.key === 'Enter') list[i]?.run()
  }
  let last = ''
  return (
    <div className="fixed inset-0 z-50 grid place-items-start justify-center bg-black/50 pt-[14vh]" onClick={() => setPalette(false)}>
      <div className="anim-in w-[600px] max-w-[92vw] overflow-hidden rounded-2xl border border-line2 bg-surface" style={{ boxShadow: 'var(--shadow)' }} onClick={e => e.stopPropagation()}>
        <input ref={ref} value={q} onChange={e => { setQ(e.target.value); setI(0) }} onKeyDown={onKey}
          placeholder="Найти проект, задачу, диалог — или дать команду ассистенту" className="h-12 w-full border-b border-line bg-transparent px-4 text-[15px] outline-none placeholder:text-fg3" />
        <div className="max-h-[360px] overflow-y-auto p-1.5">
          {list.length === 0 && <div className="p-6 text-center text-fg3">Ничего не найдено</div>}
          {list.map((c, n) => {
            const head = c.group !== last; last = c.group
            const Icon = c.icon
            return (
              <div key={c.id + n}>
                {head && <div className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-fg3">{c.group}</div>}
                <button onMouseEnter={() => setI(n)} onClick={c.run} className={clsx('flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-[13.5px]', n === i ? 'bg-surface3' : '')}>
                  <Icon size={15} className="text-fg3" /><span className="flex-1 truncate">{c.label}</span>{n === i && <CornerDownLeft size={13} className="text-fg3" />}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
