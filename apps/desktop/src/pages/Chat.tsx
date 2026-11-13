import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { ArrowUp, Paperclip, Mic, Square, ChevronDown, Copy, RotateCw, Check, Loader2, AlertCircle, Circle, Sparkles, Pencil, X, ChevronRight, ShieldCheck, Globe, FileText, FileSpreadsheet, File as FileIcon, Mail, CalendarCheck, BarChart3, FolderKanban, Mic as MicI, UploadCloud, Brain } from 'lucide-react'
import { useApp, Msg, Step, Att } from '../store'
import { BrowserView } from '../components/BrowserView'
import { api, chatStream, getPref, setPref, ProviderModels, getAutoMemory, Budget } from '../api'
import { IconButton, Button, Badge } from '../ui'

const fmtSize = (n: number) => n > 1048576 ? (n / 1048576).toFixed(1) + ' МБ' : Math.max(1, Math.round(n / 1024)) + ' КБ'
const toAtt = (f: File): Att => ({ name: f.name, size: f.size, type: f.type, url: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined })
function fileIcon(a: Att) {
  if (/sheet|excel|csv/.test(a.type) || /\.(xlsx?|csv)$/i.test(a.name)) return <FileSpreadsheet size={18} />
  if (/pdf|word|text/.test(a.type) || /\.(pdf|docx?|txt|md)$/i.test(a.name)) return <FileText size={18} />
  return <FileIcon size={18} />
}
function AttView({ a, onRemove, onOpen }: { a: Att; onRemove?: () => void; onOpen?: (a: Att) => void }) {
  return (
    <div className="group/att relative">
      {a.url
        ? <button onClick={() => onOpen?.(a)} className="block overflow-hidden rounded-xl border border-line"><img src={a.url} alt={a.name} className="size-16 object-cover" /></button>
        : <div className="flex h-16 w-44 items-center gap-2.5 rounded-xl border border-line bg-surface2 px-3"><span className="text-fg2">{fileIcon(a)}</span><span className="min-w-0"><span className="block truncate text-[12.5px]">{a.name}</span><span className="text-[11.5px] text-fg3">{fmtSize(a.size)}</span></span></div>}
      {onRemove && <button onClick={onRemove} aria-label="Убрать файл" className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full border border-line bg-surface3 text-fg2 hover:text-fg"><X size={11} /></button>}
    </div>
  )
}

function StepsView({ steps, running }: { steps: Step[]; running?: boolean }) {
  const [open, setOpen] = useState(true)
  const done = steps.filter(s => s.status === 'done').length
  return (
    <div className="mb-3 rounded-xl border border-line bg-surface">
      <button onClick={() => setOpen(o => !o)} className="flex w-full items-center gap-2 px-3 py-2 text-[13px] text-fg2">
        {running ? <Loader2 size={14} className="spin text-accent" /> : <Check size={14} className="text-ok" />}
        <span className="flex-1 text-left">{running ? steps.find(s => s.status === 'active')?.label ?? 'Работаю…' : `Выполнено · ${done} шагов`}</span>
        <ChevronRight size={14} className={clsx('transition-transform', open && 'rotate-90')} />
      </button>
      {open && (
        <ul className="space-y-1.5 border-t border-line px-3 py-2.5">
          {steps.map((s, i) => (
            <li key={i} className="flex items-center gap-2.5 text-[13px]">
              {s.status === 'done' && <Check size={14} className="text-ok" />}
              {s.status === 'active' && <Loader2 size={14} className="spin text-accent" />}
              {s.status === 'pending' && <Circle size={14} className="text-fg3" />}
              {s.status === 'error' && <AlertCircle size={14} className="text-err" />}
              <span className={clsx(s.status === 'pending' && 'text-fg3')}>{s.label}</span>
              <span className="ml-auto font-mono text-[11.5px] text-fg3">{s.tool}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Rich({ text }: { text: string }) {
  const inline = (t: string) => t.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, i) => p.startsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : p.startsWith('`') && p.length > 1 ? <code key={i}>{p.slice(1, -1)}</code> : p)
  const parts = text.split(/(```[\s\S]*?(?:```|$))/g)
  return (
    <div className="prose-chat">
      {parts.map((part, k) => {
        if (part.startsWith('```')) {
          const code = part.replace(/^```[^\n]*\n?/, '').replace(/```$/, '')
          return <pre key={k} className="my-2 overflow-x-auto rounded-xl bg-surface2 p-3 font-mono text-[12.5px]"><code style={{ background: 'none', padding: 0 }}>{code}</code></pre>
        }
        return part.split(/\n{2,}/).filter(Boolean).map((b, i) => {
          if (/^#{1,3} /.test(b)) return <h4 key={k + '-' + i} className="mb-1 mt-3 text-[15px] font-semibold">{inline(b.replace(/^#+ /, ''))}</h4>
          if (/^(- |\* )/.test(b)) return <ul key={k + '-' + i}>{b.split('\n').map((l, j) => <li key={j}>{inline(l.replace(/^[-*] /, ''))}</li>)}</ul>
          if (/^\d+[.)] /.test(b)) return <ol key={k + '-' + i} style={{ listStyle: 'decimal', paddingLeft: '1.3em', margin: '.5em 0' }}>{b.split('\n').map((l, j) => <li key={j}>{inline(l.replace(/^\d+[.)] /, ''))}</li>)}</ol>
          return <p key={k + '-' + i} className="whitespace-pre-wrap">{inline(b)}</p>
        })
      })}
    </div>
  )
}

/** Warn about the OpenRouter limit once per level per app session, not on every message */
let budgetShown = ''
function budgetNotice(b: Budget, notify: (t: string) => void) {
  if (budgetShown === b.level + b.month) return
  budgetShown = b.level + b.month
  notify(b.level === 'stop'
    ? `Месячный лимит OpenRouter ${b.limit} исчерпан — отвечает только ваш сервер. Лимит: Настройки → Модели AI`
    : `Израсходовано ${Math.round(b.ratio * 100)} % месячного лимита OpenRouter (${b.spent.toFixed(2)} из ${b.limit})`)
}

const cards = [
  { icon: CalendarCheck, t: 'Что сегодня нужно сделать?', d: 'План дня по задачам и встречам' },
  { icon: Mail, t: 'Проверь почту', d: 'Важные письма и готовые ответы' },
  { icon: FolderKanban, t: 'Проверь мои проекты', d: 'Статусы, риски и просрочки' },
  { icon: BarChart3, t: 'Подготовь отчёт', d: 'Сводка за неделю в PDF или DOCX' },
  { icon: MicI, t: 'Проанализируй последнюю встречу', d: 'Решения, задачи, протокол' },
  { icon: Globe, t: 'Найди в интернете новости про ИИ', d: 'Откроет встроенный браузер' },
]

export default function ChatPage() {
  const { messages, setMessages, emergency, notify, browserOpen, openBrowser, closeBrowser, addBg } = useApp()
  const [val, setVal] = useState('')
  const [pm, setPm] = useState<ProviderModels[]>([])
  const [model, setModel] = useState(getPref().model || 'Авто')
  const [menu, setMenu] = useState(false)
  const [rec, setRec] = useState(false)
  const [files, setFiles] = useState<Att[]>([])
  const [drag, setDrag] = useState(false)
  const [light, setLight] = useState<Att | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const run = useRef<number>(0)
  const abort = useRef<AbortController | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)
  const busy = messages.some(m => m.running)

  // private mode: the picker offers only the own server's models
  useEffect(() => { Promise.all([api.models(), api.modelSettings().catch(() => ({ private_only: false }))]).then(([ms, st]) => setPm(st.private_only ? ms.filter(m => m.provider === 'siteaccess') : ms)).catch(() => {}) }, [])
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  useEffect(() => { if (emergency) stop() }, [emergency])
  useEffect(() => {
    const q = (window as unknown as { __ask?: string }).__ask
    if (q) { (window as unknown as { __ask?: string }).__ask = undefined; send(q) }
  }, [])

  const addFiles = (list: FileList | File[] | null) => {
    const arr = Array.from(list ?? []); if (!arr.length) return
    setFiles(x => [...x, ...arr.map(toAtt)]); notify(`Добавлено файлов: ${arr.length}`)
  }
  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
  const dnd = {
    onDragEnter: (e: React.DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth.current++; setDrag(true) },
    onDragOver: (e: React.DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy' },
    onDragLeave: (e: React.DragEvent) => { if (!hasFiles(e)) return; dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDrag(false) },
    onDrop: (e: React.DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth.current = 0; setDrag(false); addFiles(e.dataTransfer.files) },
  }
  const onPaste = (e: React.ClipboardEvent) => { const f = Array.from(e.clipboardData.files); if (f.length) { e.preventDefault(); addFiles(f) } }

  const patch = (id: string, f: (m: Msg) => Msg) => setMessages(ms => ms.map(m => m.id === id ? f(m) : m))
  function stop() {
    run.current++; abort.current?.abort()
    setMessages(ms => ms.map(m => m.running ? { ...m, running: false, text: m.text || 'Остановлено пользователем.', steps: m.steps?.map(s => s.status === 'active' ? { ...s, status: 'error' as const } : s) } : m))
  }
  async function send(text: string, atts: Att[] = files) {
    if ((!text.trim() && !atts.length) || busy) return
    if (emergency) { notify('Агенты остановлены — снимите аварийную остановку'); return }
    const q = text.trim() || 'Посмотри вложенные файлы'
    const id = 'a' + Date.now(); const my = ++run.current
    const ac = new AbortController(); abort.current = ac
    const steps: Step[] = [{ label: 'Выбираю модель', tool: 'Model Router', status: 'active' }, { label: 'Формирую ответ', tool: '—', status: 'pending' }]
    setMessages(ms => [...ms, { id: 'u' + Date.now(), role: 'user', text, files: atts.length ? atts : undefined }, { id, role: 'assistant', text: '', steps, running: true }])
    const doc = atts.find(a => !a.type.startsWith('image/'))
    if (doc) addBg(`Индексация: ${doc.name}`, 'Knowledge Agent')
    setVal(''); setFiles([])
    const pref = getPref()
    let acc = ''
    let recalled = 0
    const finish = () => patch(id, m => m.running ? { ...m, running: false, steps: m.steps?.map(s => ({ ...s, status: s.status === 'error' ? s.status : 'done' as const })) } : m)
    for await (const ev of chatStream({ message: q, conversation_id: useApp.getState().convId, model: pref.model, prefer: pref.provider, remember: getAutoMemory() }, ac.signal)) {
      // memory arrives after the answer; it belongs to this message even if the user already sent the next one
      if (ev.type === 'memory') { patch(id, m => ({ ...m, memory: ev.added })); continue }
      if (ev.type === 'budget') { budgetNotice(ev, notify); continue }
      if (run.current !== my) continue
      if (ev.type === 'conversation') { useApp.getState().setConvId(ev.id); useApp.getState().loadConvs() }
      else if (ev.type === 'recall') recalled = ev.count
      else if (ev.type === 'answered') finish()
      else if (ev.type === 'meta') {
        patch(id, m => ({ ...m, steps: [...(recalled ? [{ label: `Учтено из памяти: ${recalled}`, tool: 'Memory', status: 'done' as const }] : []), { label: 'Выбрана модель', tool: `${ev.provider} · ${ev.model}`, status: 'done' }, { label: ev.fallback ? 'Основной сервер недоступен — использован резервный' : 'Формирую ответ', tool: '—', status: 'active' }] }))
      } else if (ev.type === 'delta') { acc += ev.text; patch(id, m => ({ ...m, text: acc })) }
      else if (ev.type === 'error') { patch(id, m => ({ ...m, running: false, error: ev.message, steps: m.steps?.map(s => s.status === 'active' ? { ...s, status: 'error' as const } : s) })); return }
    }
    if (run.current === my) finish()
    useApp.getState().loadConvs()   // move the dialog to the top of «Недавние»
  }
  const retry = (idx: number) => { const u = messages[idx - 1]; if (u) { setMessages(ms => ms.slice(0, idx - 1)); setTimeout(() => send(u.text, u.files ?? []), 0) } }
  const submitEdit = (id: string) => { const i = messages.findIndex(m => m.id === id); const t = val; setMessages(ms => ms.slice(0, i)); setEditing(null); setVal(''); setTimeout(() => send(t), 0) }

  const empty = messages.length === 0
  const hour = new Date().getHours()
  const greet = hour < 6 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер'
  const canSend = !!val.trim() || files.length > 0

  const composer = (
    <div className="mx-auto w-full max-w-[760px]">
      <div className={clsx('rounded-2xl border bg-surface transition-colors', drag ? 'border-accent bg-accentsoft' : 'border-line focus-within:border-line2')} style={{ boxShadow: 'var(--shadow)' }}>
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2.5 px-3.5 pt-3.5">
            {files.map((f, i) => <AttView key={f.name + i} a={f} onOpen={setLight} onRemove={() => setFiles(x => x.filter((_, j) => j !== i))} />)}
          </div>
        )}
        <textarea
          value={val} rows={1} placeholder={drag ? 'Отпустите, чтобы прикрепить файлы' : rec ? 'Слушаю…' : 'Поставьте задачу обычным языком…'}
          onChange={e => { setVal(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 180) + 'px' }}
          onPaste={onPaste}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); editing ? submitEdit(editing) : send(val) } }}
          className="block max-h-[180px] min-h-[52px] w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-[15px] outline-none placeholder:text-fg3" />
        <div className="flex items-center gap-1 px-2 pb-2">
          <input ref={fileRef} type="file" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
          <IconButton label="Добавить файл" onClick={() => fileRef.current?.click()}><Paperclip size={16} /></IconButton>
          <IconButton label="Встроенный браузер" active={browserOpen} onClick={() => browserOpen ? closeBrowser() : openBrowser()}><Globe size={16} /></IconButton>
          <div className="relative">
            <button onClick={() => setMenu(m => !m)} className="flex h-8 items-center gap-1 rounded-lg px-2 text-[12.5px] text-fg2 hover:bg-surface2">{model}<ChevronDown size={13} /></button>
            {menu && (
              <div className="anim-in absolute bottom-9 left-0 z-20 w-72 rounded-xl border border-line2 bg-surface p-1" style={{ boxShadow: 'var(--shadow)' }}>
                <button onClick={() => { setPref({}); setModel('Авто'); setMenu(false) }} className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-surface2">Авто (сервер → резерв){model === 'Авто' && <Check size={14} className="text-accent" />}</button>
                <div className="max-h-64 overflow-y-auto">
                {pm.filter(p => p.available).flatMap(p => p.models.slice(0, 60).map(m => (
                  <button key={p.provider + m} onClick={() => { setPref({ provider: p.provider, model: m }); setModel(m); setMenu(false) }} className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] hover:bg-surface2"><span className="truncate">{m}</span><span className="shrink-0 text-[11px] text-fg3">{p.provider}</span></button>
                )))}
                {pm.every(p => !p.available) && <div className="px-2.5 py-2 text-[12.5px] text-fg3">Нет доступных провайдеров</div>}
                </div>
              </div>
            )}
          </div>
          <div className="flex-1" />
          <IconButton label="Голосовой ввод" active={rec} onClick={() => { setRec(r => !r); if (!rec) notify('Голосовой ввод появится в следующей версии') }} className={rec ? '!text-err' : ''}><Mic size={16} /></IconButton>
          {busy
            ? <button onClick={stop} aria-label="Остановить" className="grid size-8 place-items-center rounded-lg bg-fg text-bg"><Square size={13} fill="currentColor" /></button>
            : <button onClick={() => editing ? submitEdit(editing) : send(val)} disabled={!canSend} aria-label="Отправить" className="grid size-8 place-items-center rounded-lg bg-accent text-accentfg transition disabled:opacity-30"><ArrowUp size={16} /></button>}
        </div>
      </div>
      <div className="mt-2 text-center text-[11.5px] text-fg3">Файлы можно перетащить в окно или вставить из буфера · Внешние действия — только с вашего подтверждения</div>
    </div>
  )

  const overlay = drag && (
    <div className="pointer-events-none absolute inset-3 z-30 grid place-items-center rounded-2xl border-2 border-dashed border-accent bg-bg/80">
      <div className="text-center"><UploadCloud size={30} className="mx-auto mb-2 text-accent" /><div className="font-medium">Отпустите файлы, чтобы прикрепить</div><div className="text-fg3">Изображения, PDF, DOCX, XLSX, TXT</div></div>
    </div>
  )

  const lightbox = light && (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-6" onClick={() => setLight(null)}>
      <img src={light.url} alt={light.name} className="max-h-full max-w-full rounded-xl" />
    </div>
  )

  const body = empty ? (
    <div className="anim-in flex h-full flex-col items-center overflow-y-auto px-6 pb-10 pt-[12vh]">
      <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-accentsoft text-accent"><Sparkles size={24} /></div>
      <h1 className="mb-1 text-[30px] font-semibold tracking-tight">{greet}</h1>
      <p className="mb-8 text-fg3">Чем займёмся?</p>
      {composer}
      <div className="mt-6 grid w-full max-w-[760px] grid-cols-2 gap-2.5 lg:grid-cols-3">
        {cards.map(c => { const I = c.icon; return (
          <button key={c.t} onClick={() => send(c.t, files)} className="flex flex-col items-start gap-1 rounded-xl border border-line bg-surface p-3 text-left transition-colors hover:border-line2 hover:bg-surface2">
            <I size={16} className="text-accent" /><span className="text-[13px] font-medium">{c.t}</span><span className="text-[12px] text-fg3">{c.d}</span>
          </button>) })}
      </div>
    </div>
  ) : (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-[760px] space-y-7">
          {messages.map((m, idx) => m.role === 'user' ? (
            <div key={m.id} className="anim-in group flex flex-col items-end gap-2">
              {m.files && <div className="flex max-w-[85%] flex-wrap justify-end gap-2">{m.files.map((f, i) => <AttView key={i} a={f} onOpen={setLight} />)}</div>}
              {m.text && <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-surface2 px-4 py-2.5">{m.text}</div>}
              <div className="opacity-0 transition-opacity group-hover:opacity-100">
                <IconButton label="Редактировать" className="!size-7" onClick={() => { setEditing(m.id); setVal(m.text) }}><Pencil size={13} /></IconButton>
              </div>
            </div>
          ) : (
            <div key={m.id} className="anim-in group flex gap-3">
              <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-accentsoft text-accent"><Sparkles size={14} /></div>
              <div className="min-w-0 flex-1">
                {m.steps && <StepsView steps={m.steps} running={m.running} />}
                {m.text && <Rich text={m.text} />}
                {m.error && <div role="alert" className="mt-2 flex items-start gap-2 rounded-xl bg-err/10 px-3 py-2 text-[13px] text-err"><AlertCircle size={15} className="mt-0.5 shrink-0" />{m.error}</div>}
                {m.memory && m.memory.length > 0 && (
                  <button onClick={() => { useApp.getState().setSettingsCat('memory'); useApp.getState().go('settings') }} title="Открыть память"
                    className="mt-2 flex max-w-full items-start gap-2 rounded-xl bg-surface2 px-3 py-2 text-left text-[12.5px] text-fg2 hover:text-fg">
                    <Brain size={14} className="mt-0.5 shrink-0 text-accent" />
                    <span><span className="font-medium text-fg">Запомнил:</span> {m.memory.join(' · ')}</span>
                  </button>
                )}
                {m.confirm && (
                  <div className="mt-3 rounded-xl border border-warn/40 bg-warn/10 p-3.5">
                    <div className="mb-1 flex items-center gap-1.5 text-[12.5px] font-medium text-warn"><ShieldCheck size={14} />Требуется подтверждение · Уровень 4</div>
                    <div className="mb-3 text-[13.5px]">{m.confirm.text}</div>
                    {m.confirm.state === 'ask' ? (
                      <div className="flex gap-2">
                        <Button variant="primary" size="sm" onClick={() => { patch(m.id, x => ({ ...x, confirm: { ...x.confirm!, state: 'ok' } })); notify('Письмо отправлено (демо)') }}>Отправить</Button>
                        <Button size="sm" onClick={() => patch(m.id, x => ({ ...x, confirm: { ...x.confirm!, state: 'no' } }))}>Только черновик</Button>
                      </div>
                    ) : <Badge tone={m.confirm.state === 'ok' ? 'ok' : 'neutral'}>{m.confirm.state === 'ok' ? 'Отправлено' : 'Сохранено как черновик'}</Badge>}
                  </div>
                )}
                {!m.running && m.text && (
                  <div className="mt-2 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <IconButton label="Копировать" className="!size-7" onClick={() => { navigator.clipboard?.writeText(m.text); notify('Скопировано') }}><Copy size={13} /></IconButton>
                    <IconButton label="Повторить" className="!size-7" onClick={() => retry(idx)}><RotateCw size={13} /></IconButton>
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={end} />
        </div>
      </div>
      <div className="px-6 pb-4 pt-2">
        {editing && <div className="mx-auto mb-1.5 flex max-w-[760px] items-center gap-2 text-[12px] text-fg3">Редактирование сообщения <button className="underline" onClick={() => { setEditing(null); setVal('') }}>отмена</button></div>}
        {composer}
      </div>
    </div>
  )

  return (
    <div className="relative flex h-full" {...dnd}>
      <div className="relative min-w-0 flex-1">{body}</div>
      {browserOpen && <div className="anim-in w-[46%] min-w-[340px] shrink-0 border-l border-line"><BrowserView compact onClose={closeBrowser} /></div>}
      {overlay}{lightbox}
    </div>
  )
}
