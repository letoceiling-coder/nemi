import { useApp } from '../store'
import { fmtDue, isOverdue, isToday } from '../tasks'
import { Resizer, usePanelWidth } from './Resizer'
import { meetings, agents } from '../data'
import { Badge, Progress } from '../ui'
import { CheckCircle2, Circle, Mic, Bot, Bell, Database, Cpu, HardDrive } from 'lucide-react'

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
  const { tasks, setTaskStatus, go, emergency, bg } = useApp()
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
      <Block title="Ближайшие встречи" onMore={() => go('meetings')}>
        {meetings.slice(0, 2).map(m => (
          <button key={m.id} onClick={() => go('meetings', m.id)} className="flex w-full items-start gap-2 rounded-lg px-1.5 py-1.5 text-left hover:bg-surface2">
            <Mic size={15} className="mt-0.5 text-info" />
            <span className="min-w-0"><span className="block truncate text-[13px]">{m.title}</span><span className="text-[11.5px] text-fg3">{m.date} · {m.platform}</span></span>
          </button>
        ))}
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
      <Block title="Уведомления">
        <div className="space-y-1.5">
          {[['Доступна версия 0.4.0', 'info'], ['Протокол встречи готов', 'ok'], ['Нужно подтвердить отправку письма', 'warn']].map(([t, tone]) => (
            <div key={t} className="flex items-start gap-2 rounded-lg px-1.5 py-1 text-[13px]"><Bell size={14} className={`mt-0.5 text-${tone}`} />{t}</div>
          ))}
        </div>
      </Block>
      <Block title="Локальные сервисы">
        <ul className="space-y-1 px-1.5 text-[13px]">
          {[[Cpu, 'Ollama', 'ok'], [Database, 'Backend · Qdrant', 'ok'], [HardDrive, 'S3 Selectel', 'ok']].map(([Icon, n, s]) => {
            const I = Icon as typeof Cpu
            return <li key={n as string} className="flex items-center gap-2"><I size={14} className="text-fg3" /><span className="flex-1">{n as string}</span><span className={`size-2 rounded-full bg-${s as string}`} /></li>
          })}
        </ul>
      </Block>
    </aside>
    </>
  )
}
