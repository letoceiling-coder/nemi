import { Clock, Sparkles } from 'lucide-react'
import { Page, PageHeader, Card, Button } from '../ui'
import { useApp } from '../store'

/** A section that is not built yet: says so honestly, what it will do, and what already works today. No sample data. */
export function Planned({ title, subtitle, stage, will, now }: {
  title: string; subtitle: string; stage: string; will: string[]; now?: { text: string; ask?: string }[]
}) {
  const { go, setMessages } = useApp()
  const ask = (q: string) => { (window as unknown as { __ask?: string }).__ask = q; setMessages(() => []); go('chat') }
  return (
    <Page>
      <PageHeader title={title} subtitle={subtitle} />
      <div className="max-w-3xl space-y-4 px-8 pb-8">
        <Card className="flex items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface3 text-fg2"><Clock size={16} /></div>
          <div>
            <div className="font-medium">Раздел ещё не подключён</div>
            <div className="text-[13px] text-fg2">Появится на этапе: {stage}. Здесь не будет примеров — только ваши настоящие данные, когда раздел заработает.</div>
          </div>
        </Card>
        <Card>
          <div className="mb-2 text-[12px] font-medium uppercase tracking-wider text-fg3">Что здесь будет</div>
          <ul className="list-disc space-y-1 pl-5 text-[13.5px] text-fg2">{will.map(w => <li key={w}>{w}</li>)}</ul>
        </Card>
        {now && now.length > 0 && (
          <Card>
            <div className="mb-2 text-[12px] font-medium uppercase tracking-wider text-fg3">Что можно уже сейчас</div>
            <div className="space-y-2">
              {now.map(n => (
                <div key={n.text} className="flex items-center justify-between gap-4 text-[13.5px]">
                  <span className="text-fg2">{n.text}</span>
                  {n.ask && <Button size="sm" icon={<Sparkles size={13} />} onClick={() => ask(n.ask!)}>Спросить</Button>}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </Page>
  )
}
