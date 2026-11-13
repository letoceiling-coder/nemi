import { useEffect, useState } from 'react'
import { Search, Loader2, MessageSquare, CheckSquare, CalendarDays, Brain, FolderKanban, Bot, ShieldCheck } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../store'
import { Page, PageHeader, Card, Input, Empty } from '../ui'
import { archiveApi, ArchiveStats, Backups, Hit, HitKind, KIND_RU, fmtAt } from '../archive'
import { errText } from '../tasks'

const ICON: Record<HitKind, typeof Search> = { message: MessageSquare, task: CheckSquare, event: CalendarDays, memory: Brain, project: FolderKanban, action: Bot }
const KINDS: HitKind[] = ['message', 'task', 'event', 'project', 'memory', 'action']

/** Everything ever recorded, searchable for any period. Nothing expires; the database is copied to S3 every day. */
export function ArchivePage() {
  const { openConv, go, setSettingsCat } = useApp()
  const [q, setQ] = useState(() => { const w = window as unknown as { __archive?: string }; const v = w.__archive ?? ''; w.__archive = undefined; return v })
  const [kinds, setKinds] = useState<HitKind[]>([])
  const [since, setSince] = useState('')
  const [until, setUntil] = useState('')
  const [hits, setHits] = useState<Hit[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [stats, setStats] = useState<ArchiveStats | null>(null)
  const [bk, setBk] = useState<Backups | null>(null)
  useEffect(() => { archiveApi.stats().then(setStats).catch(() => {}); archiveApi.backups().then(setBk).catch(() => {}) }, [])
  useEffect(() => {
    if (q.trim().length < 2) { setHits(null); return }
    const t = setTimeout(async () => {
      setBusy(true)
      try {
        const u = until ? new Date(new Date(until).getTime() + 86400000).toISOString() : undefined
        setHits(await archiveApi.search(q.trim(), kinds, since ? new Date(since).toISOString() : undefined, u)); setErr('')
      } catch (e) { setErr(errText(e)) } finally { setBusy(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [q, kinds, since, until])

  const open = (h: Hit) => {
    if ((h.kind === 'message' || h.kind === 'action') && h.conv_id) return openConv(h.conv_id)
    if (h.kind === 'task') return go('tasks')
    if (h.kind === 'event') return go('calendar')
    if (h.kind === 'project') return go('projects', h.id)
    if (h.kind === 'memory') { setSettingsCat('memory'); return go('settings') }
    if (h.kind === 'action') return go('activity')
  }
  const toggle = (k: HitKind) => setKinds(ks => ks.includes(k) ? ks.filter(x => x !== k) : [...ks, k])
  const lastOk = bk?.last_ok
  const age = lastOk ? (Date.now() - new Date(lastOk.at).getTime()) / 3600000 : null
  return (
    <Page>
      <PageHeader title="Архив" subtitle="Всё, что было: диалоги, задачи, встречи, проекты, память и действия ассистента — за любой срок" />
      <div className="px-8 pb-8">
        <Card className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-[12.5px] text-fg3">
          {stats ? <span>Хранится: {stats.conversations} диалогов ({stats.messages} сообщений), {stats.tasks} задач, {stats.events} событий, {stats.memory} фактов, {stats.actions} действий ассистента{stats.since && ` — с ${new Date(stats.since).toLocaleDateString('ru-RU')}`}. Ничего не удаляется автоматически.</span> : <span>Загружаю…</span>}
          <button onClick={() => { setSettingsCat('storage'); go('settings') }} className={clsx('flex items-center gap-1.5 hover:text-fg', age === null || age > 48 ? 'text-warn' : 'text-ok')}>
            <ShieldCheck size={14} />{lastOk ? `Резервная копия в S3: ${fmtAt(lastOk.at)}` : 'Резервной копии ещё нет'}
          </button>
        </Card>
        <Input autoFocus icon={busy ? <Loader2 size={14} className="spin" /> : <Search size={14} />} placeholder="Что найти? Например: договор, смета, Иван, отпуск" value={q} onChange={e => setQ(e.target.value)} className="mb-3" />
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {KINDS.map(k => <button key={k} onClick={() => toggle(k)} className={clsx('h-7 rounded-full border px-3 text-[12.5px]', kinds.includes(k) ? 'border-accent bg-accentsoft text-accent' : 'border-line text-fg2 hover:bg-surface2')}>{KIND_RU[k]}</button>)}
          <span className="ml-2 text-[12.5px] text-fg3">с</span><input type="date" value={since} onChange={e => setSince(e.target.value)} className="h-7 rounded-lg border border-line bg-surface2 px-2 text-[12.5px]" aria-label="С даты" />
          <span className="text-[12.5px] text-fg3">по</span><input type="date" value={until} onChange={e => setUntil(e.target.value)} className="h-7 rounded-lg border border-line bg-surface2 px-2 text-[12.5px]" aria-label="По дату" />
        </div>
        {err && <div className="mb-3 rounded-lg bg-err/10 px-3 py-2 text-[13px] text-err">{err}</div>}
        {hits === null && <Empty title="Поиск по всей истории" hint="Введите слово — найду его в диалогах, задачах (и выполненных), событиях, проектах, памяти и действиях ассистента. Можно спросить и ассистента: «что мы решили по договору в марте?»" />}
        {hits?.length === 0 && <Empty title="Ничего не найдено" hint="Попробуйте корень слова без окончания («смет» вместо «сметы») или уберите фильтры." />}
        <div className="space-y-1.5">
          {hits?.map(h => { const I = ICON[h.kind]; return (
            <Card key={h.kind + h.id} onClick={() => open(h)} className="flex cursor-pointer items-start gap-3 !py-2.5 hover:bg-surface2">
              <I size={16} className="mt-0.5 shrink-0 text-fg3" />
              <div className="min-w-0 flex-1">
                <div className="truncate">{h.title || 'Без названия'}</div>
                {h.snippet && <div className="line-clamp-2 text-[12.5px] text-fg2">{h.who === 'user' ? 'Вы: ' : h.who === 'assistant' ? 'Ассистент: ' : ''}{h.snippet.replace(/[*`#>]+/g, '')}</div>}
                <div className="text-[11.5px] text-fg3">{KIND_RU[h.kind]}{h.status && h.kind === 'task' && (h.status === 'done' ? ' · выполнена' : ' · открыта')}</div>
              </div>
              <span className="shrink-0 text-[12px] text-fg3">{fmtAt(h.at)}</span>
            </Card>
          ) })}
        </div>
      </div>
    </Page>
  )
}
