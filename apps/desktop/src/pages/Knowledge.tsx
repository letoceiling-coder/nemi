import { useState } from 'react'
import { FileText, Upload } from 'lucide-react'
import { docs } from '../data'
import { Page, PageHeader, Input, Card, Badge, Button, Empty } from '../ui'
import { useApp } from '../store'

export function KnowledgePage() {
  const { notify } = useApp()
  const [q, setQ] = useState('')
  const [mode, setMode] = useState<'sem' | 'full'>('sem')
  const res = docs.filter(d => (d.name + d.snippet + d.project).toLowerCase().includes(q.toLowerCase()))
  return (
    <Page>
      <PageHeader title="База знаний" subtitle="Документы, расшифровки и инструкции" actions={<Button icon={<Upload size={14} />} onClick={() => notify('Выберите файлы для индексации')}>Загрузить</Button>} />
      <div className="mb-4 flex gap-3 px-8">
        <Input placeholder="Спросите или найдите: «где мы обсуждали PostgreSQL?»" value={q} onChange={e => setQ(e.target.value)} className="flex-1" />
        <div className="inline-flex rounded-lg bg-surface2 p-0.5 text-[13px]">{([['sem', 'Смысловой'], ['full', 'Полнотекстовый']] as const).map(([k, l]) => <button key={k} onClick={() => setMode(k)} className={`rounded-md px-3 ${mode === k ? 'bg-surface3' : 'text-fg2'}`}>{l}</button>)}</div>
      </div>
      <div className="grid grid-cols-2 gap-3 px-8">
        {res.map(d => (
          <Card key={d.id} onClick={() => notify(`Открыт: ${d.name}`)}>
            <div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-lg bg-surface3 text-fg2"><FileText size={16} /></div><div className="min-w-0 flex-1"><div className="truncate font-medium">{d.name}</div><div className="text-[12px] text-fg3">{d.size} · {d.date}</div></div><Badge>{d.type}</Badge></div>
            <p className="mt-3 line-clamp-2 text-fg3">{d.snippet}</p>
            <div className="mt-2 text-[12px] text-fg3">Источник: {d.project}</div>
          </Card>
        ))}
      </div>
      {res.length === 0 && <Empty title="Ничего не найдено" hint="Попробуйте другой запрос или загрузите документы." />}
    </Page>
  )
}
