// App updates: Tauri updater (signed packages from https://nemi.siteaccess.ru/updates/latest.json).
// Outside the desktop shell (browser dev mode) everything reports "unsupported".
import { create } from 'zustand'

export const isDesktop = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export type UpdState = 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'installing' | 'error' | 'unsupported'
export interface UpdInfo { version: string; date?: string; notes?: string }

interface Store {
  current: string
  state: UpdState
  info: UpdInfo | null
  progress: number            // 0..100, -1 = size unknown
  error: string
  lastCheck: number           // ms epoch, 0 = never
  check: (silent?: boolean) => Promise<void>
  install: () => Promise<void>
}

const LAST = 'pai:update:last_check'
const AUTO = 'pai:update:auto'
export const getAutoCheck = () => { try { return localStorage.getItem(AUTO) !== '0' } catch { return true } }
export const setAutoCheck = (on: boolean) => { try { localStorage.setItem(AUTO, on ? '1' : '0') } catch { /* storage off */ } }

// the Update object from the plugin holds a native resource: keep it outside React state
let pending: import('@tauri-apps/plugin-updater').Update | null = null

const human = (e: unknown) => {
  const m = String((e as Error)?.message ?? e)
  if (/signature/i.test(m)) return 'Подпись обновления не прошла проверку — установка отменена'
  if (/network|connect|dns|timed? ?out|request/i.test(m)) return 'Нет связи с сервером обновлений'
  return m.length > 160 ? m.slice(0, 160) + '…' : m
}

export const useUpdates = create<Store>((set, get) => ({
  current: '',
  state: isDesktop() ? 'idle' : 'unsupported',
  info: null,
  progress: 0,
  error: '',
  lastCheck: (() => { try { return Number(localStorage.getItem(LAST)) || 0 } catch { return 0 } })(),

  async check(silent = false) {
    if (!isDesktop() || ['checking', 'downloading', 'installing'].includes(get().state)) return
    set({ state: 'checking', error: '' })
    try {
      const [{ check }, { getVersion }] = await Promise.all([import('@tauri-apps/plugin-updater'), import('@tauri-apps/api/app')])
      if (!get().current) set({ current: await getVersion() })
      const u = await check({ timeout: 20000 })
      const now = Date.now(); try { localStorage.setItem(LAST, String(now)) } catch { /* storage off */ }
      pending = u
      set(u ? { state: 'available', info: { version: u.version, date: u.date, notes: u.body }, lastCheck: now }
            : { state: 'none', info: null, lastCheck: now })
    } catch (e) {
      // a silent background check must not bother the user with network errors
      set(silent ? { state: 'idle' } : { state: 'error', error: human(e) })
    }
  },

  async install() {
    if (!pending) return
    let total = 0, got = 0
    set({ state: 'downloading', progress: 0, error: '' })
    try {
      await pending.downloadAndInstall(ev => {
        if (ev.event === 'Started') total = ev.data.contentLength ?? 0
        else if (ev.event === 'Progress') { got += ev.data.chunkLength; set({ progress: total ? Math.min(99, Math.round(got / total * 100)) : -1 }) }
        else if (ev.event === 'Finished') set({ state: 'installing', progress: 100 })
      })
      // on Windows the installer usually closes the app itself; relaunch covers the other case
      const { relaunch } = await import('@tauri-apps/plugin-process')
      await relaunch()
    } catch (e) {
      set({ state: 'error', error: human(e) })
    }
  },
}))

/** Version only (no network): used for the header of Settings → Обновления */
export async function loadCurrentVersion() {
  if (!isDesktop() || useUpdates.getState().current) return
  try { const { getVersion } = await import('@tauri-apps/api/app'); useUpdates.setState({ current: await getVersion() }) } catch { /* ignore */ }
}

/** Background check: shortly after start, then every 6 hours, unless switched off. */
export function startAutoCheck() {
  if (!isDesktop()) return () => {}
  const run = () => { if (getAutoCheck()) useUpdates.getState().check(true) }
  const first = setTimeout(run, 8000)
  const every = setInterval(run, 6 * 3600 * 1000)
  return () => { clearTimeout(first); clearInterval(every) }
}

/** After an update: returns the new version once (first launch of a newer version), else null. */
export async function justUpdatedTo(): Promise<string | null> {
  if (!isDesktop()) return null
  await loadCurrentVersion()
  const cur = useUpdates.getState().current
  if (!cur) return null
  try {
    const prev = localStorage.getItem('pai:app:version')
    localStorage.setItem('pai:app:version', cur)
    return prev && prev !== cur ? cur : null
  } catch { return null }
}
