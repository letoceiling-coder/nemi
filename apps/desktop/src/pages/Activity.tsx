import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, Check, AlertCircle, Loader2, ShieldCheck, Ban, MessageSquare } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../store'
import { Page, PageHeader, Card, Button, Tabs, Empty } from '../ui'
import { archiveApi, Action, ActivityResp, STATUS_RU, fmtAt } from '../archive'
import { errText } from '../tasks'

type F = '' | 'ok' | 'error' | 'declined'

/** Real journal of the assistant: what runs now, what waits for your decision, and every past action (kept forever). */
export function ActivityPage() {
  const { notify, openConv } = useApp()
  const [f, setF] = useState<F>('')
  const [data, setData] = useState<ActivityResp | null>(null)
  const [more, setMore] = useState<Action[]>([])
  const [end, setEnd] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const load = useCallback(() => archiveApi.activity(f).then(d => { setData(d); setErr('') }).catch(e => setErr(errText(e))), [f])
  useEffect(() => { setMore([]); setEnd(false); load() }, [load])
  const busy = !!data?.runs.length
  useEffect(() => { const t = setInterval(load, busy ? 2500 : 15000); return () => clearInterval(t) }, [load, busy])

  const decide = async (run: string, id: string, ok: boolean) => {
    try { await archiveApi.approve(run, id, ok); notify(ok ? 'Разрешено' : 'Отклонено'); load() } catch (e) { notify(errText(e)) }
  }
  const loadMore = async () => {
    const all = [...(data?.items ?? []), ...more]
    const last = all[all.length - 1]
    if (!last) return
    const r = await archiveApi.activity(f, last.at).catch(() => null)
    if (!r) return
    setMore(m => [...m, ...r.items]); if (r.items.length < 50) setEnd(true)
  }
  const items = [...(data?.items ?? []), ...more]
  const s = data?.stats
  const cards: [string, number | undefined, string][] = [['Выполняется', s?.running, 'accent'], ['Ждут вашего решения', s?.waiting, 'warn'], ['Выполнено сегодня', s?.done_today, 'ok'], ['Ошибок сегодня', s?.errors_today, 'err']]
  return (
    <Page>
      <PageHeader title="Центр активности" subtitle="Все действия ассистента — что он делает сейчас и что сделал. Журнал хранится бессрочно." />
      <div className="px-8 pb-8">
        <div className="mb-4 grid grid-cols-4 gap-3">{cards.map(([k, v, t]) => <Card key={k}><div className={`text-[22px] font-semibold text-${t}`}>{v ?? '—'}</div><div className="text-[12.5px] text-fg3">{k}</div></Card>)}</div>
        {err && <div className="mb-3 rounded-lg bg-err/10 px-3 py-2 text-[13px] text-err">{err}</div>}

        {data?.runs.map(r => (
          <Card key={r.id} className="mb-2 space-y-2 border-accent/40">
            <div className="flex items-center gap-3">
              <Loader2 size={16} className="spin text-accent" />
              <div className="min-w-0 flex-1"><div className="truncate">{r.current}</div><div className="text-[12px] text-fg3">ассистент работает · {Math.max(1, Math.round(Date.now() / 1000 - r.started))} с</div></div>
              {r.conv_id && <Button size="sm" icon={<MessageSquare size={13} />} onClick={() => openConv(r.conv_id!)}>Открыть диалог</Button>}
            </div>
            {r.approvals.map(a => (
              <div key={a.id} className="flex items-center gap-3 rounded-lg bg-warn/10 px-3 py-2">
                <ShieldCheck size={16} className="shrink-0 text-warn" /><div className="min-w-0 flex-1 text-[13px]">{a.text}</div>
                <Button size="sm" variant="primary" onClick={() => decide(r.id, a.id, true)}>Разрешить</Button>
                <Button size="sm" onClick={() => decide(r.id, a.id, false)}>Отклонить</Button>
              </div>
            ))}
          </Card>
        ))}

        <div className="mb-3 mt-4"><Tabs value={f} onChange={setF} items={[{ id: '', label: 'Все' }, { id: 'ok', label: 'Выполнено' }, { id: 'error', label: 'Ошибки' }, { id: 'declined', label: 'Отклонено' }]} /></div>
        {data && !items.length && <Empty title={f ? 'Здесь пусто' : 'Ассистент ещё ничего не делал'} hint="Когда ассистент ищет, создаёт задачи и события, читает страницы — каждое действие появится здесь." />}
        {!data && !err && <div className="flex items-center gap-2 text-fg3"><Loader2 size={14} className="spin" />Загружаю…</div>}
        <div className="space-y-1.5">
          {items.map(o => (
            <Card key={o.id} className="!p-0">
              <button onClick={() => setOpen(open === o.id ? null : o.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left">
                {o.status === 'ok' ? <Check size={16} className="shrink-0 text-ok" /> : o.status === 'declined' || o.status === 'stopped' ? <Ban size={16} className="shrink-0 text-fg3" /> : <AlertCircle size={16} className="shrink-0 text-err" />}
                <div className="min-w-0 flex-1"><div className="truncate">{o.label}</div>
                  <div className="truncate text-[12px] text-fg3"><span className="font-mono">{o.tool}</span> · {STATUS_RU[o.status]}{o.conv_title && ` · «${o.conv_title}»`}</div></div>
                <span className="shrink-0 text-[12px] text-fg3">{fmtAt(o.at)}</span><ChevronRight size={14} className={clsx('shrink-0 text-fg3 transition-transform', open === o.id && 'rotate-90')} />
              </button>
              {open === o.id && (
                <div className="space-y-2 border-t border-line px-4 py-3 text-[12.5px]">
                  {o.detail && <pre className="max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[12px] text-fg2">{o.detail}</pre>}
                  <div className="text-fg3">{new Date(o.at).toLocaleString('ru-RU')}{o.ms > 0 && ` · ${(o.ms / 1000).toFixed(1)} с`}</div>
                  {o.conv_id && o.conv_title && <Button size="sm" icon={<MessageSquare size={13} />} onClick={() => openConv(o.conv_id!)}>Открыть диалог</Button>}
                </div>
              )}
            </Card>
          ))}
        </div>
        {items.length >= 50 && !end && <div className="mt-3"><Button size="sm" onClick={loadMore}>Показать ещё</Button></div>}
      </div>
    </Page>
  )
}
