import { useState } from 'react'
import { ChevronRight, Play, Plus, Zap, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useApp } from '../store'
import { Page, PageHeader, Card, Switch, Badge, Button, Input, Modal } from '../ui'

export function AutomationsPage() {
  const { autos, toggleAuto, notify } = useApp()
  const [sel, setSel] = useState<string | null>(null)
  const [add, setAdd] = useState(false)
  const [text, setText] = useState('')
  const a = autos.find(x => x.id === sel)
  return (
    <Page>
      <PageHeader title="Автоматизации" subtitle="Сценарии, которые выполняются сами" actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => setAdd(true)}>Новая</Button>} />
      <div className="grid grid-cols-[1fr_360px] gap-5 px-8">
        <div className="space-y-2">
          {autos.map(x => (
            <Card key={x.id} onClick={() => setSel(x.id)} className={sel === x.id ? '!border-accent' : ''}>
              <div className="flex items-center gap-3">
                <div className="grid size-9 place-items-center rounded-lg bg-accentsoft text-accent"><Zap size={16} /></div>
                <div className="min-w-0 flex-1"><div className="font-medium">{x.name}</div><div className="text-[12.5px] text-fg3">{x.trigger} · последний запуск: {x.lastRun}</div></div>
                <span onClick={e => e.stopPropagation()}><Switch checked={x.enabled} onChange={() => { toggleAuto(x.id); notify(x.enabled ? 'Автоматизация выключена' : 'Автоматизация включена') }} label={x.name} /></span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1 text-[12px] text-fg3">{x.steps.map((s, i) => <span key={s} className="flex items-center gap-1"><span className="rounded-md bg-surface3 px-2 py-0.5 text-fg2">{s}</span>{i < x.steps.length - 1 && <ChevronRight size={12} />}</span>)}</div>
            </Card>
          ))}
        </div>
        <div>
          {a ? (
            <Card className="anim-in">
              <div className="mb-3 flex items-center justify-between"><h3 className="font-medium">История запусков</h3><Button size="sm" icon={<Play size={12} />} onClick={() => notify(`Запущено: ${a.name}`)}>Запустить</Button></div>
              <ul className="space-y-2.5">{a.runs.map(r => <li key={r.at} className="flex items-start gap-2 text-[13px]">{r.ok ? <CheckCircle2 size={15} className="mt-0.5 text-ok" /> : <AlertCircle size={15} className="mt-0.5 text-err" />}<div><div>{r.at}</div><div className="text-fg3">{r.note}</div></div></li>)}</ul>
              <div className="mt-4 border-t border-line pt-3 text-[12.5px] text-fg3">Разрешения: чтение почты, создание черновиков. Отправка — только с подтверждением.</div>
            </Card>
          ) : <div className="text-fg3">Выберите автоматизацию, чтобы увидеть историю запусков.</div>}
        </div>
      </div>
      <Modal open={add} onClose={() => setAdd(false)} title="Новая автоматизация" footer={<><Button onClick={() => setAdd(false)}>Отмена</Button><Button variant="primary" disabled={!text.trim()} onClick={() => { setAdd(false); setText(''); notify('Ассистент составит сценарий и покажет его на проверку') }}>Создать</Button></>}>
        <p className="mb-3 text-fg2">Опишите сценарий обычным языком:</p>
        <Input icon={<Zap size={15} />} placeholder="Каждый вечер формируй отчёт по задачам" value={text} onChange={e => setText(e.target.value)} />
      </Modal>
    </Page>
  )
}
