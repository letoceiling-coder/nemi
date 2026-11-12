import { useState } from 'react'
import { ArrowLeft, Circle, Clock, Users, Search, Square, Download, CheckCircle2, ListChecks } from 'lucide-react'
import { meetings } from '../data'
import { useApp } from '../store'
import { Page, PageHeader, Card, Badge, Button, Input, Tabs, Avatar, Section } from '../ui'

export function MeetingsPage() {
  const { openId, go, notify } = useApp()
  const [rec, setRec] = useState(false)
  const [tab, setTab] = useState<'protocol' | 'transcript'>('protocol')
  const [q, setQ] = useState('')
  const m = meetings.find(x => x.id === openId)

  if (m) {
    const lines = m.transcript.filter(l => l.text.toLowerCase().includes(q.toLowerCase()))
    return (
      <Page>
        <div className="px-8 pt-6">
          <button onClick={() => go('meetings')} className="mb-4 flex items-center gap-1.5 text-fg3 hover:text-fg"><ArrowLeft size={14} />Все встречи</button>
          <div className="flex items-start justify-between">
            <div><h1 className="text-[22px] font-semibold tracking-tight">{m.title}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-fg3"><span className="flex items-center gap-1"><Clock size={13} />{m.date} · {m.duration}</span><span className="flex items-center gap-1"><Users size={13} />{m.people.join(', ')}</span><Badge tone="accent">{m.project}</Badge></div></div>
            <Button icon={<Download size={14} />} onClick={() => notify('Протокол сохранён в «Отчёты»')}>Экспорт</Button>
          </div>
          <div className="my-5"><Tabs value={tab} onChange={setTab} items={[{ id: 'protocol', label: 'Протокол' }, { id: 'transcript', label: 'Расшифровка' }]} /></div>
          {tab === 'protocol' ? (
            <>
              <Section title="Краткое содержание"><p className="max-w-2xl text-fg2">{m.summary}</p></Section>
              <Section title="Принятые решения"><ul className="space-y-1.5">{m.decisions.map(d => <li key={d} className="flex gap-2"><CheckCircle2 size={16} className="mt-0.5 text-ok" />{d}</li>)}</ul></Section>
              <Section title="Задачи" right={<Button size="sm" onClick={() => notify('Задачи созданы в проекте')}>Создать задачи</Button>}><ul className="space-y-1.5">{m.actions.map(a => <li key={a} className="flex gap-2"><ListChecks size={16} className="mt-0.5 text-accent" />{a}</li>)}</ul></Section>
            </>
          ) : (
            <>
              <Input placeholder="Поиск по расшифровке" value={q} onChange={e => setQ(e.target.value)} className="mb-4 w-80" />
              <div className="space-y-4">{lines.map(l => <div key={l.t} className="flex gap-3"><Avatar name={l.who} /><div><div className="text-[12.5px] text-fg3"><span className="font-medium text-fg2">{l.who}</span> · {l.t}</div><div contentEditable suppressContentEditableWarning className="rounded outline-none focus:bg-surface2" title="Можно исправить вручную">{l.text}</div></div></div>)}
                {lines.length === 0 && <div className="text-fg3">Ничего не найдено.</div>}</div>
            </>
          )}
        </div>
      </Page>
    )
  }

  return (
    <Page>
      <PageHeader title="Встречи" subtitle="Запись, расшифровка и протоколы" actions={rec
        ? <Button variant="danger" icon={<Square size={13} fill="currentColor" />} onClick={() => { setRec(false); notify('Запись остановлена, идёт расшифровка') }}>Остановить запись</Button>
        : <Button variant="primary" icon={<Circle size={13} />} onClick={() => { setRec(true); notify('Запись началась. Участников нужно предупредить') }}>Начать запись</Button>} />
      {rec && <div className="anim-in mx-8 mb-4 flex items-center gap-3 rounded-xl border border-err/40 bg-err/10 px-4 py-3"><span className="pulse size-2.5 rounded-full bg-err" /><span className="font-medium text-err">Идёт запись</span><span className="text-fg2">Микрофон + системный звук (WASAPI Loopback). Убедитесь, что участники согласны на запись.</span></div>}
      <div className="space-y-2 px-8">
        {meetings.map(x => (
          <Card key={x.id} onClick={() => go('meetings', x.id)} className="flex items-center gap-4">
            <div className="min-w-0 flex-1"><div className="font-medium">{x.title}</div><div className="mt-0.5 line-clamp-1 text-fg3">{x.summary}</div></div>
            <div className="flex -space-x-2">{x.people.slice(0, 3).map(p => <span key={p} className="rounded-full ring-2 ring-[var(--surface)]"><Avatar name={p} size={24} /></span>)}</div>
            <div className="w-36 text-right text-[12.5px] text-fg3"><div>{x.date}</div><div>{x.duration} · {x.platform}</div></div>
          </Card>
        ))}
      </div>
      <div className="mt-3 px-8 text-[12px] text-fg3 flex items-center gap-1"><Search size={12} />Поиск по содержанию встреч доступен в Ctrl+K</div>
    </Page>
  )
}
