import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { ArrowLeft, ArrowRight, RotateCw, X, Plus, ExternalLink, Bot, Hand, Lock, Globe } from 'lucide-react'
import { useApp } from '../store'
import { IconButton } from '../ui'

interface Tab { id: number; url: string; title: string; hist: string[]; i: number }
const HOME = 'about:home'
const links = [['Википедия', 'https://ru.wikipedia.org'], ['Пример', 'https://example.com'], ['OpenStreetMap', 'https://www.openstreetmap.org']]

const homeDoc = `<body style="margin:0;font:14px system-ui;background:#17171a;color:#ececef;display:grid;place-items:center;height:100vh"><div style="text-align:center"><div style="font-size:22px;font-weight:600">Встроенный браузер</div><p style="color:#8a8a94">Введите адрес или запрос в строке выше</p></div></body>`

function normalize(v: string) {
  const s = v.trim()
  if (!s) return HOME
  if (s === HOME) return s
  if (/^https?:\/\//i.test(s)) return s
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(s)) return 'https://' + s
  return 'https://ru.wikipedia.org/w/index.php?search=' + encodeURIComponent(s)
}

export function BrowserView({ compact, onClose }: { compact?: boolean; onClose?: () => void }) {
  const { browserUrl, notify } = useApp()
  const [tabs, setTabs] = useState<Tab[]>([{ id: 1, url: HOME, title: 'Новая вкладка', hist: [HOME], i: 0 }])
  const [active, setActive] = useState(1)
  const [addr, setAddr] = useState('')
  const [agent, setAgent] = useState(true)
  const [reload, setReload] = useState(0)
  const tab = tabs.find(t => t.id === active) ?? tabs[0]

  const nav = (url: string) => {
    const u = normalize(url)
    setTabs(ts => ts.map(t => t.id === tab.id ? { ...t, url: u, title: u === HOME ? 'Новая вкладка' : new URL(u).hostname, hist: [...t.hist.slice(0, t.i + 1), u], i: t.i + 1 } : t))
  }
  const step = (d: number) => setTabs(ts => ts.map(t => { const i = t.i + d; return t.id === tab.id && i >= 0 && i < t.hist.length ? { ...t, i, url: t.hist[i], title: t.hist[i] === HOME ? 'Новая вкладка' : new URL(t.hist[i]).hostname } : t }))
  useEffect(() => { setAddr(tab.url === HOME ? '' : tab.url) }, [tab.url, tab.id])
  useEffect(() => { if (browserUrl) nav(browserUrl) }, [browserUrl])
  const newTab = () => { const id = Date.now(); setTabs(ts => [...ts, { id, url: HOME, title: 'Новая вкладка', hist: [HOME], i: 0 }]); setActive(id) }
  const close = (id: number) => { if (tabs.length === 1) return; const r = tabs.filter(t => t.id !== id); setTabs(r); if (active === id) setActive(r[r.length - 1].id) }

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <div className="flex items-end gap-0.5 overflow-x-auto border-b border-line bg-surface px-2 pt-1.5">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActive(t.id)} className={clsx('group flex h-8 max-w-[180px] items-center gap-2 rounded-t-lg px-3 text-[12.5px]', t.id === active ? 'bg-bg text-fg' : 'text-fg3 hover:bg-surface2')}>
            <Globe size={12} /><span className="truncate">{t.title}</span>
            {tabs.length > 1 && <span onClick={e => { e.stopPropagation(); close(t.id) }} className="rounded p-0.5 opacity-0 hover:bg-surface3 group-hover:opacity-100"><X size={11} /></span>}
          </button>
        ))}
        <IconButton label="Новая вкладка" className="!size-7 mb-0.5" onClick={newTab}><Plus size={14} /></IconButton>
        <div className="flex-1" />
        {onClose && <IconButton label="Закрыть браузер" className="!size-7 mb-0.5" onClick={onClose}><X size={14} /></IconButton>}
      </div>
      <div className="flex items-center gap-1 border-b border-line px-2 py-1.5">
        <IconButton label="Назад" className="!size-7" disabled={tab.i === 0} onClick={() => step(-1)}><ArrowLeft size={14} /></IconButton>
        <IconButton label="Вперёд" className="!size-7" disabled={tab.i >= tab.hist.length - 1} onClick={() => step(1)}><ArrowRight size={14} /></IconButton>
        <IconButton label="Обновить" className="!size-7" onClick={() => setReload(r => r + 1)}><RotateCw size={13} /></IconButton>
        <form className="flex-1" onSubmit={e => { e.preventDefault(); nav(addr) }}>
          <label className="flex h-7 items-center gap-1.5 rounded-lg bg-surface2 px-2.5 text-fg3 focus-within:ring-1 focus-within:ring-[var(--accent)]">
            <Lock size={11} /><input value={addr} onChange={e => setAddr(e.target.value)} placeholder="Адрес или поисковый запрос" className="w-full bg-transparent text-[12.5px] text-fg outline-none" />
          </label>
        </form>
        <IconButton label="Открыть в системном браузере" className="!size-7" onClick={() => tab.url !== HOME && window.open(tab.url, '_blank')}><ExternalLink size={13} /></IconButton>
      </div>
      <div className={clsx('flex items-center gap-2 border-b border-line px-3 py-1 text-[12px]', agent ? 'bg-accentsoft text-accent' : 'bg-surface2 text-fg3')}>
        {agent ? <Bot size={13} /> : <Hand size={13} />}
        <span className="flex-1">{agent ? 'Агент управляет браузером' : 'Вы управляете браузером'}</span>
        <button className="underline" onClick={() => { setAgent(a => !a); notify(agent ? 'Управление у вас' : 'Управление передано агенту') }}>{agent ? 'Перехватить' : 'Передать агенту'}</button>
      </div>
      <div className="relative min-h-0 flex-1 bg-white">
        {tab.url === HOME
          ? <div className="grid h-full place-items-center bg-bg">
              <div className="text-center"><div className="text-[18px] font-semibold">Встроенный браузер</div><p className="mb-4 mt-1 text-fg3">Агент открывает страницы здесь — вы видите всё, что он делает</p>
                <div className="flex flex-wrap justify-center gap-2">{links.map(([n, u]) => <button key={u} onClick={() => nav(u)} className="rounded-full border border-line px-3 py-1 text-[12.5px] text-fg2 hover:bg-surface2">{n}</button>)}</div></div>
            </div>
          : <iframe key={tab.url + reload} src={tab.url} title={tab.title} className="size-full border-0" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />}
      </div>
      {!compact && <div className="border-t border-line px-3 py-1.5 text-[11.5px] text-fg3">Часть сайтов запрещает встраивание — в версии на Tauri страницы откроются в нативном WebView. CAPTCHA и MFA пользователь проходит сам.</div>}
    </div>
  )
}
export { homeDoc }
