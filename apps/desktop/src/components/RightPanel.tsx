import { useApp } from '../store'
import { api } from '../api'
import { fmtDue, isOverdue, isToday } from '../tasks'
import { Resizer, usePanelWidth } from './Resizer'
import { agents } from '../data'
import { useEffect, useState } from 'react'
import { calApi, CalEvent, fmtWhen, addDays, startOfDay } from '../calendar'
import { Badge, Progress } from '../ui'
import { CheckCircle2, Circle, CalendarDays, Bot } from 'lucide-react'

function Block({ title, children, onMore }: { title: string; children: React.ReactNode; onMore?: () => void }) {
  return (
    <div className="mb-5">
      <div className="mb-1.5 flex items-center justify-between">
        <h4 className="text-[11.5px] font-medium uppercase tracking-wider text-fg3">{title}</h4>
        {onMore && <button onClick={onMore} className="text-[12px] text-fg3 hover:text-fg">Все</button>}
      </div>
      {children}
    </div>
  )
}

export function RightPanel() {
  const { tasks, setTaskStatus, go, emergency, bg, calTick } = useApp()
  const [upcoming, setUpcoming] = useState<CalEvent[]>([])
  // real service status (not the old demo list): own server, OpenRouter, S3
  const [svc, setSvc] = useState<[string, boolean | null, string][]>([['Ваш сервер', null, ''], ['OpenRouter', null, ''], ['Хранилище S3', null, '']])
  useEffect(() => {
    const load = async () => {
      try {
        const [ms, h] = await Promise.all([api.models(), api.health()])
        const p = (n: string) => ms.find(m => m.provider === n)
        setSvc([['Ваш сервер', !!p('siteaccess')?.available, p('siteaccess')?.error ?? `${p('siteaccess')?.models.length ?? 0} моделей`],
          ['OpenRouter', !!p('openrouter')?.available, p('openrouter')?.error ?? 'резерв'], ['Хранилище S3', h.s3.ok, h.s3.error ?? h.s3.bucket ?? '']])
      } catch { /* backend restarting */ }
    }
    load(); const t = setInterval(load, 5 * 60000); return () => clearInterval(t)
  }, [])
  useEffect(() => {
    const load = () => calApi.range(new Date(), addDays(startOfDay(new Date()), 8)).then(es => setUpcoming(es.filter(e => new Date(e.end) > new Date()).slice(0, 3))).catch(() => {})
    load(); const t = setInterval(load, 5 * 60000); return () => clearInterval(t)
  }, [calTick])
  const live = bg.filter(b => b.status !== 'cancel').slice(0, 3)
  const open = tasks.filter(t => t.status !== 'done')
  const today = [...open.filter(isToday), ...open.filter(t => !isToday(t))].slice(0, 5)
  const pw = usePanelWidth('right', 288, 240, 520)
  return (
    <>
    <div className="hidden xl:contents"><Resizer side="right" label="Ширина правой панели" width={pw.width} onChange={pw.set} onCommit={pw.save} onReset={pw.reset} /></div>
    <aside style={{ width: pw.width }} className="anim-in hidden shrink-0 overflow-y-auto border-l border-line bg-surface p-4 xl:block">
      <Block title="Текущие задачи" onMore={() => go('tasks')}>
        <ul className="space-y-0.5">
          {today.map(t => (
            <li key={t.id}>
              <button onClick={() => setTaskStatus(t.id, 'done')} className="group flex w-full items-start gap-2 rounded-lg px-1.5 py-1.5 text-left hover:bg-surface2">
                <Circle size={15} className="mt-0.5 shrink-0 text-fg3 group-hover:hidden" />
                <CheckCircle2 size={15} className="mt-0.5 hidden shrink-0 text-ok group-hover:block" />
                <span className="min-w-0">
                  <span className="block truncate text-[13px]">{t.title}</span>
                  <span className={isOverdue(t) ? 'text-[11.5px] text-err' : 'text-[11.5px] text-fg3'}>{fmtDue(t)}</span>
                </span>
              </button>
            </li>
          ))}
          {today.length === 0 && <li className="px-1.5 text-fg3">Открытых задач нет</li>}
        </ul>
      </Block>
      <Block title="Фоновые задачи" onMore={() => go('activity')}>
        <ul className="space-y-2.5 px-1.5">
          {live.map(b => <li key={b.id}><div className="truncate text-[13px]">{b.title}</div><div className="mb-1 text-[11.5px] text-fg3">{b.status === 'queued' ? 'в очереди' : b.status === 'done' ? 'готово' : `${b.agent} · ${Math.round(b.progress)}%`}</div><Progress value={b.progress} tone={b.status === 'done' ? 'ok' : 'accent'} /></li>)}
          {live.length === 0 && <li className="text-fg3">Нет активных</li>}
        </ul>
      </Block>
      <Block title="Ближайшие встречи" onMore={() => go('calendar')}>
        {upcoming.map(e => (
          <button key={e.id} onClick={() => go('calendar')} className="flex w-full items-start gap-2 rounded-lg px-1.5 py-1.5 text-left hover:bg-surface2">
            <CalendarDays size={15} className="mt-0.5 shrink-0 text-info" />
            <span className="min-w-0"><span className="block truncate text-[13px]">{e.title}</span><span className="block truncate text-[11.5px] text-fg3">{fmtWhen(e)}{e.location && ` · ${e.location}`}</span></span>
          </button>
        ))}
        {upcoming.length === 0 && <div className="px-1.5 text-fg3">На неделю встреч нет</div>}
      </Block>
      <Block title="Активные агенты" onMore={() => go('activity')}>
        <ul className="space-y-1">
          {agents.filter(a => a.enabled).slice(0, 4).map((a, i) => (
            <li key={a.id} className="flex items-center gap-2 px-1.5 text-[13px]">
              <Bot size={14} className="text-fg3" /><span className="flex-1 truncate">{a.name}</span>
              {emergency ? <Badge tone="err">стоп</Badge> : i === 0 ? <Badge tone="accent" dot>работает</Badge> : <Badge>ожидает</Badge>}
            </li>
          ))}
        </ul>
      </Block>
      <Block title="Сервисы" onMore={() => { useApp.getState().setSettingsCat('diagnostics'); go('settings') }}>
        <ul className="space-y-1 px-1.5 text-[13px]">
          {svc.map(([n, ok, hint]) => (
            <li key={n} className="flex items-center gap-2" title={hint}><span className="flex-1">{n}</span>
              <span className={ok === null ? 'size-2 rounded-full bg-fg3/40' : ok ? 'size-2 rounded-full bg-ok' : 'size-2 rounded-full bg-err'} /></li>
          ))}
        </ul>
      </Block>
    </aside>
    </>
  )
}
