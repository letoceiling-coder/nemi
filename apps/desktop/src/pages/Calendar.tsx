import { useState } from 'react'
import clsx from 'clsx'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { events } from '../data'
import { Page, PageHeader, Card, IconButton } from '../ui'

export function CalendarPage() {
  const [sel, setSel] = useState(12)
  // Ноябрь 2026: 1 нояб — воскресенье
  const offset = 6
  const cells = Array.from({ length: 35 }, (_, i) => i - offset + 1)
  const dayEv = (d: number) => events.filter(e => e.day === d)
  return (
    <Page>
      <PageHeader title="Календарь" subtitle="Ноябрь 2026" actions={<><IconButton label="Назад"><ChevronLeft size={16} /></IconButton><IconButton label="Вперёд"><ChevronRight size={16} /></IconButton></>} />
      <div className="grid grid-cols-[1fr_280px] gap-5 px-8">
        <div className="overflow-hidden rounded-xl border border-line">
          <div className="grid grid-cols-7 border-b border-line bg-surface text-center text-[12px] text-fg3">{['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => <div key={d} className="py-2">{d}</div>)}</div>
          <div className="grid grid-cols-7">
            {cells.map((d, i) => {
              const valid = d >= 1 && d <= 30
              return (
                <button key={i} disabled={!valid} onClick={() => setSel(d)} className={clsx('h-[88px] border-b border-r border-line p-1.5 text-left align-top transition-colors', valid ? 'hover:bg-surface2' : 'opacity-30', sel === d && 'bg-accentsoft')}>
                  <span className={clsx('grid size-6 place-items-center rounded-full text-[12.5px]', d === 12 && 'bg-accent text-accentfg')}>{valid ? d : ''}</span>
                  {valid && dayEv(d).slice(0, 2).map(e => <div key={e.id} className="mt-0.5 truncate rounded px-1 text-[11px]" style={{ background: e.color + '33', color: e.color }}>{e.title}</div>)}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <h3 className="mb-3 font-medium">{sel} ноября</h3>
          <div className="space-y-2">
            {dayEv(sel).map(e => <Card key={e.id} className="!p-3"><div className="flex items-center gap-2"><span className="h-8 w-1 rounded-full" style={{ background: e.color }} /><div><div className="text-[13.5px]">{e.title}</div><div className="text-[12px] text-fg3">{e.time} · {e.len} ч</div></div></div></Card>)}
            {dayEv(sel).length === 0 && <div className="text-fg3">Событий нет. Попросите ассистента: «Запланируй встречу на этот день».</div>}
          </div>
        </div>
      </div>
    </Page>
  )
}
