import { useState } from 'react'
import { Plus, Download, Loader2 } from 'lucide-react'
import { reports } from '../data'
import { Page, PageHeader, Card, Badge, Button } from '../ui'
import { useApp } from '../store'

export function ReportsPage() {
  const { notify } = useApp()
  const [gen, setGen] = useState(false)
  const [list, setList] = useState(reports)
  const make = () => {
    setGen(true)
    setTimeout(() => { setGen(false); setList(l => [{ id: 'r' + Date.now(), name: 'Ежедневный отчёт — 12 нояб', type: 'Ежедневный', date: 'Сейчас', fmt: ['PDF', 'MD'], done: 4, open: 6, overdue: 1 }, ...l]); notify('Отчёт сформирован') }, 1400)
  }
  return (
    <Page>
      <PageHeader title="Отчёты" subtitle="Автоматически собираются из задач, встреч и переписки" actions={<Button variant="primary" disabled={gen} icon={gen ? <Loader2 size={14} className="spin" /> : <Plus size={15} />} onClick={make}>{gen ? 'Формирую…' : 'Сформировать'}</Button>} />
      <div className="space-y-2 px-8">
        {list.map(r => (
          <Card key={r.id} className="anim-in flex items-center gap-4">
            <div className="min-w-0 flex-1"><div className="font-medium">{r.name}</div><div className="text-[12.5px] text-fg3">{r.type} · {r.date}</div></div>
            <div className="flex gap-4 text-center text-[12px] text-fg3"><div><div className="text-[16px] font-semibold text-ok">{r.done}</div>готово</div><div><div className="text-[16px] font-semibold text-fg">{r.open}</div>в работе</div><div><div className={`text-[16px] font-semibold ${r.overdue ? 'text-err' : 'text-fg3'}`}>{r.overdue}</div>просрочено</div></div>
            <div className="flex gap-1">{r.fmt.map(f => <button key={f} onClick={() => notify(`Экспорт ${f} (демо)`)} className="group"><Badge tone="neutral"><Download size={10} />{f}</Badge></button>)}</div>
          </Card>
        ))}
      </div>
    </Page>
  )
}
