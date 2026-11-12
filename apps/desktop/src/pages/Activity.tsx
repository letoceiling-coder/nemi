import { useState } from 'react'
import { ChevronRight, Check, AlertCircle, Loader2, ShieldCheck } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../store'
import { Page, PageHeader, Card, Badge, Button, Tabs, Section } from '../ui'

const ops = [
  { id: 'o1', agent: 'Email Agent', tool: 'gmail.fetch', what: 'Проверка почты за сутки', status: 'run', time: 'сейчас', log: ['10:01:02 → gmail.fetch(query="newer_than:1d")', '10:01:03 ← 12 сообщений', '10:01:04 → classify(model=gemma3:12b)'] },
  { id: 'o2', agent: 'Meeting Agent', tool: 'whisper.transcribe', what: 'Расшифровка «Планёрка по CRM»', status: 'ok', time: '10:45', log: ['10:41:10 → faster-whisper large-v3', '10:44:55 ← 4 120 слов', '10:45:01 → создано 3 задачи'] },
  { id: 'o3', agent: 'Email Agent', tool: 'smtp.send', what: 'Отправка письма Ивану Петрову', status: 'confirm', time: '10:12', log: ['10:12:30 ⏸ ожидает подтверждения (уровень 4)'] },
  { id: 'o4', agent: 'Browser Agent', tool: 'playwright.open', what: 'Поиск мебельных фабрик', status: 'ok', time: 'Вчера', log: ['→ search("мебельные фабрики Москва")', '← 10 сайтов, 4 пропущено (дубликаты)'] },
  { id: 'o5', agent: 'Automation Agent', tool: 'imap.fetch', what: 'Утренняя почта (9 нояб)', status: 'err', time: '9 нояб', log: ['08:30:00 → imap.fetch', '08:30:30 ✗ TimeoutError', '08:31:00 → повтор 1/3', '08:31:30 ✗ TimeoutError'] },
] as const

export function ActivityPage() {
  const { notify, emergency } = useApp()
  const [f, setF] = useState<'all' | 'run' | 'confirm' | 'err'>('all')
  const [open, setOpen] = useState<string | null>('o1')
  const [dec, setDec] = useState<string[]>([])
  const list = ops.filter(o => f === 'all' || o.status === f)
  return (
    <Page>
      <PageHeader title="Центр активности" subtitle="Что сейчас делают агенты и что они сделали" />
      <div className="px-8">
        <div className="mb-4 grid grid-cols-4 gap-3">{[['Выполняется', 1, 'accent'], ['Ждут подтверждения', 1, 'warn'], ['Завершено сегодня', 14, 'ok'], ['Ошибок', 1, 'err']].map(([k, v, t]) => <Card key={k as string}><div className={`text-[22px] font-semibold text-${t}`}>{v}</div><div className="text-[12.5px] text-fg3">{k}</div></Card>)}</div>
        <div className="mb-3"><Tabs value={f} onChange={setF} items={[{ id: 'all', label: 'Все' }, { id: 'run', label: 'Выполняются' }, { id: 'confirm', label: 'Подтверждение' }, { id: 'err', label: 'Ошибки' }]} /></div>
        <div className="space-y-2">
          {list.map(o => (
            <Card key={o.id} className="!p-0">
              <button onClick={() => setOpen(open === o.id ? null : o.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                {o.status === 'run' && !emergency && <Loader2 size={16} className="spin text-accent" />}{o.status === 'run' && emergency && <AlertCircle size={16} className="text-err" />}
                {o.status === 'ok' && <Check size={16} className="text-ok" />}{o.status === 'err' && <AlertCircle size={16} className="text-err" />}{o.status === 'confirm' && <ShieldCheck size={16} className="text-warn" />}
                <div className="min-w-0 flex-1"><div>{o.what}</div><div className="text-[12px] text-fg3">{o.agent} · <span className="font-mono">{o.tool}</span></div></div>
                <span className="text-[12px] text-fg3">{o.time}</span><ChevronRight size={14} className={clsx('text-fg3 transition-transform', open === o.id && 'rotate-90')} />
              </button>
              {open === o.id && (
                <div className="border-t border-line px-4 py-3">
                  <pre className="whitespace-pre-wrap font-mono text-[12px] text-fg2">{o.log.join('\n')}</pre>
                  {o.status === 'confirm' && (dec.includes(o.id) ? <div className="mt-3"><Badge tone="ok">Решение принято</Badge></div> : <div className="mt-3 flex gap-2"><Button variant="primary" size="sm" onClick={() => { setDec(d => [...d, o.id]); notify('Подтверждено') }}>Подтвердить</Button><Button size="sm" onClick={() => { setDec(d => [...d, o.id]); notify('Отклонено') }}>Отклонить</Button></div>)}
                  {o.status === 'err' && <div className="mt-3"><Button size="sm" onClick={() => notify('Повторный запуск поставлен в очередь')}>Повторить</Button></div>}
                </div>
              )}
            </Card>
          ))}
        </div>
        <Section title=" "><div className="text-[12px] text-fg3">Каждая операция имеет уникальный ID и защищена от повторного исполнения.</div></Section>
      </div>
    </Page>
  )
}
