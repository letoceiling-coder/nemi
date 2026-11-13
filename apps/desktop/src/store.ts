import { create } from 'zustand'
import { getToken, clearSession, api, Conv } from './api'
import { automations as seedAuto, Automation } from './data'
import { tasksApi, Task, Project, TaskInput, errText } from './tasks'

export type Route = 'chat' | 'projects' | 'tasks' | 'calendar' | 'meetings' | 'mail' | 'browser' | 'automations' | 'knowledge' | 'reports' | 'integrations' | 'models' | 'activity' | 'settings'
export type SettingsCat = 'general' | 'memory' | 'account' | 'security' | 'notifications' | 'storage' | 'integrations' | 'models' | 'activity' | 'updates' | 'diagnostics'
export type Theme = 'dark' | 'light'

export interface Step { id?: string; label: string; tool: string; status: 'done' | 'active' | 'pending' | 'error' | 'wait'; detail?: string }
export interface Approval { id: string; run: string; text: string; state: 'ask' | 'sending' | 'approved' | 'declined' | 'timeout' | 'stopped' }
export interface Att { name: string; size: number; type: string; url?: string }
export interface Msg { id: string; role: 'user' | 'assistant'; text: string; files?: Att[]; steps?: Step[]; approval?: Approval; running?: boolean; error?: string; memory?: string[] }
export interface Bg { id: string; title: string; agent: string; progress: number; status: 'run' | 'done' | 'queued' | 'cancel' }

interface S {
  route: Route; go: (r: Route, id?: string) => void
  openId?: string
  settingsCat: SettingsCat; setSettingsCat: (c: SettingsCat) => void
  theme: Theme; toggleTheme: () => void
  sidebar: boolean; toggleSidebar: () => void
  rightPanel: boolean; toggleRight: () => void
  palette: boolean; setPalette: (v: boolean) => void
  toast?: string; notify: (t: string) => void
  messages: Msg[]; setMessages: (f: (m: Msg[]) => Msg[]) => void; newChat: () => void
  tasks: Task[]; projects: Project[]; loadTasks: () => Promise<void>
  addTask: (title: string, extra?: Partial<TaskInput>) => Promise<Task | null>; setTaskStatus: (id: string, st: Task['status']) => void
  updateTask: (id: string, p: Parameters<typeof tasksApi.update>[1]) => Promise<void>; removeTask: (id: string) => Promise<void>
  calTick: number; bumpCal: () => void   // calendar changed elsewhere (agent, reminders) -> views reload
  autos: Automation[]; toggleAuto: (id: string) => void
  emergency: boolean; setEmergency: (v: boolean) => void
  bg: Bg[]; addBg: (title: string, agent: string) => void; tickBg: () => void; cancelBg: (id: string) => void
  browserOpen: boolean; browserUrl: string; openBrowser: (url?: string) => void; closeBrowser: () => void
  authed: boolean; setAuthed: (v: boolean) => void
  convId?: string; setConvId: (id?: string) => void
  convs: Conv[]; loadConvs: () => Promise<void>; openConv: (id: string) => Promise<void>; removeConv: (id: string) => Promise<void>
}

const embedded: Route[] = ['integrations', 'models', 'activity']
let timer: ReturnType<typeof setTimeout>
export const useApp = create<S>((set, get) => ({
  route: 'chat', openId: undefined,
  settingsCat: 'general', setSettingsCat: settingsCat => set({ settingsCat }),
  go: (route, id) => embedded.includes(route) ? set({ route: 'settings', settingsCat: route as SettingsCat, openId: undefined }) : set({ route, openId: id }),
  theme: (localStorage.getItem('theme') as Theme) || 'dark',
  toggleTheme: () => { const t = get().theme === 'dark' ? 'light' : 'dark'; localStorage.setItem('theme', t); document.documentElement.dataset.theme = t; set({ theme: t }) },
  sidebar: true, toggleSidebar: () => set(s => ({ sidebar: !s.sidebar })),
  rightPanel: true, toggleRight: () => set(s => ({ rightPanel: !s.rightPanel })),
  palette: false, setPalette: palette => set({ palette }),
  toast: undefined, notify: toast => { set({ toast }); clearTimeout(timer); timer = setTimeout(() => set({ toast: undefined }), 2600) },
  messages: [], setMessages: f => set(s => ({ messages: f(s.messages) })), newChat: () => set({ messages: [], route: 'chat', browserOpen: false, convId: undefined }),
  tasks: [], projects: [], calTick: 0, bumpCal: () => set(s => ({ calTick: s.calTick + 1 })),
  loadTasks: async () => {
    try { const [tasks, projects] = await Promise.all([tasksApi.list(), tasksApi.projects()]); set({ tasks, projects }) }
    catch { /* backend not ready — keep what we have */ }
  },
  // quick input: «завтра в 11:00 проверить договор» -> date and reminder are parsed on the server
  addTask: async (title, extra = {}) => {
    try { const t = await tasksApi.create({ title, quick: !extra.due, ...extra }); await get().loadTasks(); return t }
    catch (e) { get().notify(errText(e)); return null }
  },
  setTaskStatus: (id, status) => {
    set(s => ({ tasks: s.tasks.map(t => t.id === id ? { ...t, status } : t) }))      // optimistic
    tasksApi.update(id, { status }).then(() => get().loadTasks()).catch(e => { get().notify(errText(e)); get().loadTasks() })
  },
  updateTask: async (id, p) => { try { await tasksApi.update(id, p); await get().loadTasks() } catch (e) { get().notify(errText(e)) } },
  removeTask: async id => {
    set(s => ({ tasks: s.tasks.filter(t => t.id !== id) }))
    try { await tasksApi.remove(id) } catch (e) { get().notify(errText(e, 'Не удалось удалить')) } finally { get().loadTasks() }
  },
  autos: seedAuto, toggleAuto: id => set(s => ({ autos: s.autos.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a) })),
  emergency: false, setEmergency: emergency => set({ emergency }),
  bg: [
    { id: 'b1', title: 'Расшифровка «Планёрка по CRM»', agent: 'Meeting Agent', progress: 64, status: 'run' },
    { id: 'b2', title: 'Индексация документов в базу знаний', agent: 'Knowledge Agent', progress: 30, status: 'run' },
    { id: 'b3', title: 'Резервная копия в S3', agent: 'Storage', progress: 0, status: 'queued' },
  ],
  addBg: (title, agent) => set(s => ({ bg: [{ id: 'b' + Date.now(), title, agent, progress: 0, status: 'run' }, ...s.bg] })),
  tickBg: () => set(s => {
    if (s.emergency) return {}
    let running = s.bg.filter(b => b.status === 'run').length
    return { bg: s.bg.map(b => {
      if (b.status === 'run') { const p = Math.min(100, b.progress + 2 + Math.random() * 4); return { ...b, progress: p, status: p >= 100 ? 'done' as const : 'run' as const } }
      if (b.status === 'queued' && running < 2) { running++; return { ...b, status: 'run' as const } }
      return b
    }) }
  }),
  cancelBg: id => set(s => ({ bg: s.bg.map(b => b.id === id ? { ...b, status: 'cancel' } : b) })),
  browserOpen: false, browserUrl: '',
  openBrowser: (url = '') => set(s => ({ browserOpen: true, browserUrl: url || s.browserUrl })),
  closeBrowser: () => set({ browserOpen: false }),
  authed: !!getToken(),
  setAuthed: authed => { if (!authed) clearSession(); set({ authed }) },
  convId: undefined, setConvId: convId => set({ convId }),
  convs: [],
  loadConvs: async () => { try { set({ convs: await api.conversations() }) } catch { /* backend not ready — keep list */ } },
  openConv: async id => {
    if (get().messages.some(m => m.running)) { get().notify('Дождитесь окончания ответа'); return }
    try {
      const c = await api.conversation(id)
      set({ route: 'chat', browserOpen: false, convId: c.id,
        messages: c.messages.map((m, i) => ({ id: `h${i}-${c.id}`, role: m.role, text: m.content,
          steps: m.role === 'assistant' && m.model ? [{ label: 'Модель', tool: `${m.provider} · ${m.model}`, status: 'done' as const },
            ...(m.tools ?? []).map(t => ({ label: t.label, tool: t.tool, status: t.status }))] : undefined })) })
    } catch { get().notify('Не удалось открыть диалог'); get().loadConvs() }
  },
  removeConv: async id => {
    try { await api.deleteConversation(id) } catch { get().notify('Не удалось удалить диалог'); return }
    if (get().convId === id) set({ messages: [], convId: undefined })
    set(s => ({ convs: s.convs.filter(c => c.id !== id) }))
  },
}))
document.documentElement.dataset.theme = useApp.getState().theme
