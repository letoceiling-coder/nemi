import { useEffect, useState } from 'react'
import clsx from 'clsx'
import {
  MessageSquare, FolderKanban, CheckSquare, CalendarDays, Mic, Mail, Globe, Workflow, BookOpen, BarChart3, Plug, Cpu, Settings, Activity,
  PanelLeft, PanelRight, Plus, Search, Sun, Moon, OctagonX, Lock, Loader2, X, Check, ArrowUpCircle,
} from 'lucide-react'
import { useApp, Route } from './store'
import { Kbd, IconButton, Progress } from './ui'
import ChatPage from './pages/Chat'
import { ProjectsPage } from './pages/Projects'
import { TasksPage } from './pages/Tasks'
import { CalendarPage } from './pages/Calendar'
import { MeetingsPage } from './pages/Meetings'
import { MailPage } from './pages/Mail'
import { BrowserPage } from './pages/Browser'
import { AutomationsPage } from './pages/Automations'
import { KnowledgePage } from './pages/Knowledge'
import { ReportsPage } from './pages/Reports'
import { IntegrationsPage } from './pages/Integrations'
import { ModelsPage } from './pages/Models'
import { ActivityPage } from './pages/Activity'
import { SettingsPage } from './pages/Settings'
import { RightPanel } from './components/RightPanel'
import { Resizer, usePanelWidth } from './components/Resizer'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useUpdates, startAutoCheck, justUpdatedTo } from './updates'
import { startReminders, isToday, reminderText } from './tasks'
import { Palette } from './components/Palette'
import { Auth } from './components/Auth'
import { api, userKey } from './api'

const nav: { id: Route; label: string; icon: typeof Mail; badge?: number }[] = [
  { id: 'chat', label: 'Ассистент', icon: MessageSquare },
  { id: 'projects', label: 'Проекты', icon: FolderKanban },
  { id: 'tasks', label: 'Задачи', icon: CheckSquare },
  { id: 'calendar', label: 'Календарь', icon: CalendarDays },
  { id: 'meetings', label: 'Встречи', icon: Mic },
  { id: 'mail', label: 'Почта', icon: Mail, badge: 3 },
  { id: 'browser', label: 'Браузер', icon: Globe },
  { id: 'automations', label: 'Автоматизации', icon: Workflow },
  { id: 'knowledge', label: 'База знаний', icon: BookOpen },
  { id: 'reports', label: 'Отчёты', icon: BarChart3 },
]
const nav2: typeof nav = [
  { id: 'settings', label: 'Настройки', icon: Settings },
]

function NavItem({ item: raw, collapsed }: { item: (typeof nav)[number]; collapsed: boolean }) {
  const { route, go, tasks } = useApp()
  // live counter: open tasks due today or overdue
  const item = raw.id === 'tasks' ? { ...raw, badge: tasks.filter(t => t.status !== 'done' && isToday(t)).length || undefined } : raw
  const Icon = item.icon
  const active = route === item.id
  return (
    <button onClick={() => go(item.id)} title={item.label}
      className={clsx('relative flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] transition-colors', active ? 'bg-surface2 text-fg' : 'text-fg2 hover:bg-surface2/60 hover:text-fg', collapsed && 'justify-center px-0')}>
      <Icon size={16} />
      {!collapsed && <span className="flex-1 truncate text-left">{item.label}</span>}
      {!collapsed && item.badge && <span className="rounded-full bg-accentsoft px-1.5 text-[11px] font-medium text-accent">{item.badge}</span>}
      {collapsed && item.badge && <span className="absolute right-1.5 top-1 size-1.5 rounded-full bg-accent" />}
    </button>
  )
}

/** Real dialogs from the backend, most recently active first. Delete needs a second click to confirm. */
function Recent() {
  const { convs, convId, loadConvs, openConv, removeConv } = useApp()
  const [ask, setAsk] = useState<string | null>(null)
  const [all, setAll] = useState(false)
  useEffect(() => { loadConvs() }, [loadConvs])
  useEffect(() => { if (!ask) return; const t = setTimeout(() => setAsk(null), 3000); return () => clearTimeout(t) }, [ask])
  if (!convs.length) return null
  const list = all ? convs : convs.slice(0, 8)
  return (
    <div className="pt-4">
      <div className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wider text-fg3">Недавние</div>
      {list.map(h => (
        <div key={h.id} className={clsx('group relative flex h-7 items-center rounded-lg', h.id === convId ? 'bg-surface2' : 'hover:bg-surface2/60')}>
          <button onClick={() => openConv(h.id)} title={h.title}
            className={clsx('h-full min-w-0 flex-1 truncate px-2.5 pr-7 text-left text-[13px]', h.id === convId ? 'text-fg' : 'text-fg2 group-hover:text-fg')}>{h.title || 'Без названия'}</button>
          <button onClick={() => ask === h.id ? (setAsk(null), removeConv(h.id)) : setAsk(h.id)}
            title={ask === h.id ? 'Нажмите ещё раз, чтобы удалить' : 'Удалить диалог'}
            className={clsx('absolute right-1 grid h-5 place-items-center rounded px-1 text-[11px] transition-opacity',
              ask === h.id ? 'bg-err/15 text-err opacity-100' : 'text-fg3 opacity-0 hover:text-fg group-hover:opacity-100')}>
            {ask === h.id ? 'Удалить?' : <X size={12} />}
          </button>
        </div>
      ))}
      {convs.length > 8 && (
        <button onClick={() => setAll(v => !v)} className="h-7 w-full rounded-lg px-2.5 text-left text-[12px] text-fg3 hover:text-fg">
          {all ? 'Свернуть' : `Показать все (${convs.length})`}
        </button>
      )}
    </div>
  )
}

function Sidebar() {
  const { sidebar, newChat, setPalette } = useApp()
  const c = !sidebar
  const pw = usePanelWidth('sidebar', 248, 200, 420)
  return (
    <>
    <aside style={{ width: c ? 56 : pw.width }} className="flex shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex h-12 items-center gap-2 px-3">
        <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent text-[13px] font-bold text-accentfg">N</div>
        {!c && <span className="font-semibold tracking-tight">NEMI</span>}
      </div>
      <div className="space-y-1 px-2">
        <button onClick={newChat} title="Новый диалог" className={clsx('flex h-9 w-full items-center gap-2 rounded-lg border border-line bg-surface2 px-2.5 text-[13.5px] font-medium transition-colors hover:bg-surface3', c && 'justify-center px-0')}>
          <Plus size={16} />{!c && 'Новый диалог'}
        </button>
        <button onClick={() => setPalette(true)} title="Поиск (Ctrl+K)" className={clsx('flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-[13.5px] text-fg3 hover:bg-surface2', c && 'justify-center px-0')}>
          <Search size={15} />{!c && <><span className="flex-1 text-left">Поиск</span><Kbd>Ctrl K</Kbd></>}
        </button>
      </div>
      <nav className="mt-2 flex-1 space-y-0.5 overflow-y-auto px-2">
        {nav.map(n => <NavItem key={n.id} item={n} collapsed={c} />)}
        {!c && <Recent />}
      </nav>
      <div className="space-y-0.5 border-t border-line p-2">
        {nav2.map(n => <NavItem key={n.id} item={n} collapsed={c} />)}
      </div>
    </aside>
    {!c && <Resizer side="left" label="Ширина боковой панели" width={pw.width} onChange={pw.set} onCommit={pw.save} onReset={pw.reset} />}
    </>
  )
}


function BgButton() {
  const { bg, cancelBg, go } = useApp()
  const [open, setOpen] = useState(false)
  const run = bg.filter(b => b.status === 'run' || b.status === 'queued')
  const shown = bg.filter(b => b.status !== 'cancel')
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] text-fg2 hover:bg-surface2" title="Фоновые задачи">
        {run.length ? <Loader2 size={14} className="spin text-accent" /> : <Check size={14} className="text-ok" />}
        <span className="hidden whitespace-nowrap sm:inline">{run.length ? `${run.length} в фоне` : 'Фон'}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="anim-in absolute right-0 top-10 z-40 w-[340px] rounded-xl border border-line2 bg-surface p-3" style={{ boxShadow: 'var(--shadow)' }}>
            <div className="mb-2 flex items-center justify-between"><span className="text-[12px] font-medium uppercase tracking-wider text-fg3">Фоновые задачи</span><button className="text-[12px] text-fg3 hover:text-fg" onClick={() => { setOpen(false); go('activity') }}>Журнал</button></div>
            <ul className="max-h-[320px] space-y-3 overflow-y-auto">
              {shown.map(b => (
                <li key={b.id}>
                  <div className="flex items-center gap-2 text-[13px]"><span className="min-w-0 flex-1 truncate">{b.title}</span>
                    {b.status === 'done' ? <Check size={14} className="text-ok" /> : <button aria-label="Отменить" onClick={() => cancelBg(b.id)} className="text-fg3 hover:text-err"><X size={13} /></button>}</div>
                  <div className="mb-1 text-[11.5px] text-fg3">{b.agent} · {b.status === 'queued' ? 'в очереди' : b.status === 'done' ? 'готово' : `${Math.round(b.progress)}%`}</div>
                  <Progress value={b.progress} tone={b.status === 'done' ? 'ok' : 'accent'} />
                </li>
              ))}
              {shown.length === 0 && <li className="text-fg3">Нет фоновых задач</li>}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}

/** Shown only when a newer signed version is published; opens Settings → Обновления */
function UpdateChip() {
  const { state, info } = useUpdates()
  const { go, setSettingsCat } = useApp()
  if (!info || !['available', 'downloading', 'installing'].includes(state)) return null
  return (
    <button onClick={() => { setSettingsCat('updates'); go('settings') }} title="Открыть «Обновления»"
      className="mr-1 flex h-8 items-center gap-1.5 rounded-lg bg-accentsoft px-2.5 text-[12.5px] font-medium text-accent hover:bg-accent/20">
      <ArrowUpCircle size={15} />{state === 'available' ? `Обновление ${info.version}` : 'Обновляется…'}
    </button>
  )
}

function TopBar() {
  const { toggleSidebar, toggleRight, rightPanel, theme, toggleTheme, emergency, setEmergency, notify, route } = useApp()
  const label = [...nav, ...nav2].find(n => n.id === route)?.label
  return (
    <header className="flex h-12 shrink-0 items-center justify-between px-3">
      <div className="flex items-center gap-1">
        <IconButton label="Свернуть панель" onClick={toggleSidebar}><PanelLeft size={16} /></IconButton>
        <span className="ml-1 text-[13.5px] text-fg2">{label}</span>
      </div>
      <div className="flex items-center gap-1">
        <UpdateChip />
        <BgButton />
        <button
          onClick={() => {
            // emergency stop: running agents stop at once on the server, new tasks are blocked until resumed
            if (!emergency) api.stopAgents().catch(() => {})
            setEmergency(!emergency); notify(emergency ? 'Агенты возобновлены' : 'Все агенты остановлены')
          }}
          className={clsx('mr-1 flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium transition-colors', emergency ? 'bg-err text-white' : 'text-fg2 hover:bg-err/15 hover:text-err')}
          title="Аварийная остановка всех агентов">
          <OctagonX size={15} />{emergency ? 'Остановлено' : 'Стоп'}
        </button>
        <IconButton label="Заблокировать" onClick={() => useApp.getState().setAuthed(false)}><Lock size={16} /></IconButton>
        <IconButton label="Сменить тему" onClick={toggleTheme}>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</IconButton>
        <IconButton label="Правая панель" active={rightPanel} onClick={toggleRight}><PanelRight size={16} /></IconButton>
      </div>
    </header>
  )
}

export default function App() {
  const authed = useApp(s => s.authed)
  return authed ? <Shell /> : <Auth />
}

function Shell() {
  const { route, rightPanel, setPalette, toast, sidebar, tickBg } = useApp()
  useEffect(() => { const t = setInterval(tickBg, 1000); return () => clearInterval(t) }, [tickBg])
  useEffect(() => startAutoCheck(), [])
  useEffect(() => {
    useApp.getState().loadTasks()
    // reminders: Windows notification + toast; the list is refreshed so the bell disappears
    return startReminders(r => { useApp.getState().notify(`${r.kind === 'event' ? 'Скоро' : 'Напоминание'}: ${reminderText(r)}`); useApp.getState().loadTasks() })
  }, [])
  useEffect(() => { justUpdatedTo().then(v => { if (v) useApp.getState().notify(`NEMI обновлён до версии ${v}`) }) }, [])
  useEffect(() => {
    // автоблокировка по бездействию (минуты в localStorage, 0 = выкл.)
    let last = Date.now()
    const bump = () => { last = Date.now() }
    const ev = ['mousemove', 'keydown', 'click']; ev.forEach(e => window.addEventListener(e, bump))
    const t = setInterval(() => { const m = +(localStorage.getItem(userKey('autolock')) ?? 15); if (m > 0 && Date.now() - last > m * 60000) useApp.getState().setAuthed(false) }, 10000)
    return () => { ev.forEach(e => window.removeEventListener(e, bump)); clearInterval(t) }
  }, [])
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true) }
      if (e.key === 'Escape') setPalette(false)
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [setPalette])
  useEffect(() => { if (window.innerWidth < 1200 && sidebar) useApp.getState().toggleSidebar() }, [])

  const page = {
    chat: <ChatPage />, projects: <ProjectsPage />, tasks: <TasksPage />, calendar: <CalendarPage />, meetings: <MeetingsPage />,
    mail: <MailPage />, browser: <BrowserPage />, automations: <AutomationsPage />, knowledge: <KnowledgePage />, reports: <ReportsPage />,
    integrations: <IntegrationsPage />, models: <ModelsPage />, activity: <ActivityPage />, settings: <SettingsPage />,
  }[route]

  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <div className="flex min-h-0 flex-1">
          <main key={route} className="min-w-0 flex-1"><ErrorBoundary onHome={() => useApp.getState().go('chat')}>{page}</ErrorBoundary></main>
          {rightPanel && route !== 'settings' && route !== 'browser' && <RightPanel />}
        </div>
      </div>
      <Palette />
      {toast && <div className="anim-in fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-xl border border-line2 bg-surface3 px-4 py-2 text-[13px]" style={{ boxShadow: 'var(--shadow)' }}>{toast}</div>}
    </div>
  )
}
