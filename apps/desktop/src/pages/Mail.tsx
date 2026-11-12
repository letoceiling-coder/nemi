import { useState } from 'react'
import clsx from 'clsx'
import { Sparkles, Send, Pencil, Star } from 'lucide-react'
import { mails, Mail } from '../data'
import { useApp } from '../store'
import { Page, PageHeader, Tabs, Badge, Button, Input, Avatar } from '../ui'

const catTone: Record<string, 'info' | 'err' | 'warn' | 'neutral' | 'ok'> = { Клиент: 'info', Жалоба: 'err', Счёт: 'warn', Деловая: 'ok' }

export function MailPage() {
  const { notify, go } = useApp()
  const [f, setF] = useState<'all' | 'unread' | 'important' | 'reply'>('all')
  const [q, setQ] = useState('')
  const [list, setList] = useState<Mail[]>(mails)
  const [sel, setSel] = useState<string>('e1')
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [sent, setSent] = useState<string[]>([])
  const shown = list.filter(m => (f === 'all' || (f === 'unread' && m.unread) || (f === 'important' && m.important) || (f === 'reply' && !!m.draft)) && (m.subject + m.from).toLowerCase().includes(q.toLowerCase()))
  const cur = list.find(m => m.id === sel)
  const text = cur ? draft[cur.id] ?? cur.draft ?? '' : ''

  return (
    <div className="anim-in flex h-full flex-col">
      <PageHeader title="Почта" subtitle="Gmail · IMAP · режим отправки: с подтверждением" />
      <div className="flex items-center gap-3 px-8 pb-3">
        <Input placeholder="Поиск по письмам" value={q} onChange={e => setQ(e.target.value)} className="w-64" />
        <Tabs value={f} onChange={setF} items={[{ id: 'all', label: 'Все' }, { id: 'unread', label: 'Непрочитанные', count: list.filter(m => m.unread).length }, { id: 'important', label: 'Важные' }, { id: 'reply', label: 'Ждут ответа', count: list.filter(m => m.draft && !sent.includes(m.id)).length }]} />
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[340px_1fr] border-t border-line">
        <div className="overflow-y-auto border-r border-line">
          {shown.map(m => (
            <button key={m.id} onClick={() => { setSel(m.id); setList(l => l.map(x => x.id === m.id ? { ...x, unread: false } : x)) }} className={clsx('block w-full border-b border-line px-4 py-3 text-left transition-colors hover:bg-surface', sel === m.id && 'bg-surface')}>
              <div className="flex items-center gap-2"><Avatar name={m.from} size={22} /><span className={clsx('flex-1 truncate', m.unread && 'font-semibold')}>{m.from}</span><span className="text-[11.5px] text-fg3">{m.time}</span></div>
              <div className={clsx('mt-1 truncate text-[13.5px]', m.unread ? 'text-fg' : 'text-fg2')}>{m.subject}</div>
              <div className="mt-0.5 truncate text-[12.5px] text-fg3">{m.preview}</div>
              <div className="mt-2 flex gap-1.5"><Badge tone={catTone[m.category] ?? 'neutral'}>{m.category}</Badge>{m.important && <Badge tone="warn"><Star size={10} />Важно</Badge>}</div>
            </button>
          ))}
          {shown.length === 0 && <div className="p-8 text-center text-fg3">Писем нет по этому фильтру.</div>}
        </div>
        <div className="overflow-y-auto p-8">
          {cur && (
            <div className="mx-auto max-w-2xl">
              <h2 className="text-[18px] font-semibold">{cur.subject}</h2>
              <div className="mt-1 flex items-center gap-2 text-fg3"><span>{cur.from}</span>·<span>{cur.time}</span>{cur.project && <button onClick={() => go('projects')}><Badge tone="accent">{cur.project}</Badge></button>}</div>
              <p className="mt-5 whitespace-pre-wrap text-fg2">{cur.body}</p>
              {cur.draft && (
                <div className="mt-6 rounded-xl border border-line bg-surface p-4">
                  <div className="mb-2 flex items-center gap-1.5 text-[12.5px] font-medium text-accent"><Sparkles size={14} />Предложенный ответ{cur.important && ' · срок: сегодня'}</div>
                  <textarea value={text} onChange={e => setDraft(d => ({ ...d, [cur.id]: e.target.value }))} rows={4} className="w-full resize-none rounded-lg bg-surface2 p-3 outline-none focus:ring-1 focus:ring-[var(--accent)]" />
                  <div className="mt-3 flex gap-2">
                    {sent.includes(cur.id) ? <Badge tone="ok">Отправлено</Badge> : <>
                      <Button variant="primary" icon={<Send size={14} />} onClick={() => { setSent(s => [...s, cur.id]); notify('Письмо отправлено (демо)') }}>Подтвердить и отправить</Button>
                      <Button icon={<Pencil size={14} />} onClick={() => notify('Сохранено в черновики')}>В черновики</Button></>}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
