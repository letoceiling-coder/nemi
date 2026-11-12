import { useState } from 'react'
import { Download, Loader2, Star } from 'lucide-react'
import { models, agents } from '../data'
import { Page, PageHeader, Card, Badge, Button, Section, Progress } from '../ui'
import { useApp } from '../store'

export function ModelsPage() {
  const { notify } = useApp()
  const [main, setMain] = useState('qwen3:32b')
  const [pulling, setPulling] = useState<number | null>(null)
  const [have, setHave] = useState<string[]>(models.filter(m => m.installed).map(m => m.id))
  const [temp, setTemp] = useState(0.7)
  const [ctx, setCtx] = useState(16384)
  const pull = (id: string) => {
    setPulling(0); let p = 0
    const t = setInterval(() => { p += 20; setPulling(p); if (p >= 100) { clearInterval(t); setPulling(null); setHave(h => [...h, id]); notify('Модель загружена') } }, 400)
  }
  return (
    <Page>
      <PageHeader title="Модели AI" subtitle="Сервер SiteAccess → резерв OpenRouter" actions={<Badge tone="ok" dot>Маршрутизация включена</Badge>} />
      <div className="px-8">
        <Section title="Модели">
          <div className="space-y-2">
            {models.map(m => (
              <Card key={m.id} className="flex items-center gap-4">
                <div className="min-w-0 flex-1"><div className="flex items-center gap-2 font-medium">{m.name}{main === m.id && <Badge tone="accent"><Star size={10} />Основная</Badge>}</div>
                  <div className="mt-0.5 flex gap-1.5">{m.roles.map(r => <Badge key={r}>{r}</Badge>)}</div></div>
                <div className="text-right text-[12.5px] text-fg3"><div>Диск: {m.size}</div><div>VRAM: {m.vram}</div></div>
                {have.includes(m.id)
                  ? (!['nomic-embed-text', 'faster-whisper-large-v3'].includes(m.id) && main !== m.id && <Button size="sm" onClick={() => { setMain(m.id); notify('Основная модель изменена') }}>Сделать основной</Button>)
                  : pulling !== null ? <div className="w-28"><Progress value={pulling} /></div> : <Button size="sm" icon={<Download size={13} />} onClick={() => pull(m.id)}>Загрузить</Button>}
              </Card>
            ))}
          </div>
        </Section>
        <Section title="Облачные модели · OpenRouter" right={<Button size="sm" onClick={() => useApp.getState().go('integrations')}>Настроить ключ</Button>}>
          <Card className="flex items-center gap-3"><div className="min-w-0 flex-1"><div className="font-medium">OpenRouter не подключён</div><div className="text-[12.5px] text-fg3">Добавьте API-ключ в «Интеграции», чтобы выбирать облачные модели (Claude, GPT, Gemini, Qwen) для отдельных агентов и ролей.</div></div><Badge>Выключено</Badge></Card>
        </Section>
        <div className="grid grid-cols-2 gap-5">
          <Section title="Параметры генерации"><Card className="space-y-4">
            <label className="block"><div className="mb-1 flex justify-between"><span>Температура</span><span className="text-fg3">{temp}</span></div><input type="range" min={0} max={1.5} step={0.1} value={temp} onChange={e => setTemp(+e.target.value)} className="w-full accent-[var(--accent)]" /></label>
            <label className="block"><div className="mb-1 flex justify-between"><span>Контекстное окно</span><span className="text-fg3">{ctx.toLocaleString('ru')}</span></div><input type="range" min={2048} max={32768} step={2048} value={ctx} onChange={e => setCtx(+e.target.value)} className="w-full accent-[var(--accent)]" /></label>
            <div className="text-[12.5px] text-fg3">Одновременно в VRAM загружена одна тяжёлая модель.</div>
          </Card></Section>
          <Section title="Модели агентов"><Card className="space-y-2">{agents.map(a => <div key={a.id} className="flex items-center justify-between text-[13px]"><span>{a.name}</span><span className="rounded-md bg-surface3 px-2 py-0.5 text-fg2">{a.model}</span></div>)}</Card></Section>
        </div>
      </div>
    </Page>
  )
}
