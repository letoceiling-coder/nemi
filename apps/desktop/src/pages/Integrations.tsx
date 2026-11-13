import { useEffect, useState } from 'react'
import { api, ApiError, Health, ProviderModels } from '../api'
import { Page, PageHeader, Card, Badge, Button, Section, Modal, Input } from '../ui'
import { useApp } from '../store'
import { CalendarSync } from './CalendarSync'

const PROVIDERS = [
  { id: 'siteaccess', secret: 'siteaccess_api_key', name: 'Сервер SiteAccess', desc: 'Ваш сервер моделей api.siteaccess.ru — основной', placeholder: 'API-ключ сервера (раздел «Ключи» в кабинете)' },
  { id: 'openrouter', secret: 'openrouter_api_key', name: 'OpenRouter', desc: 'Облачные модели — резерв, когда сервер занят', placeholder: 'API-ключ OpenRouter (sk-or-…)' },
] as const

// not built yet: shown so it is clear what is coming, never as «connected»
const PLANNED = [
  { name: 'Яндекс Почта', desc: 'Чтение, разбор, черновики ответов', stage: 2 },
  { name: 'Gmail', desc: 'Через ваш проект Google', stage: 2 },
  { name: 'Яндекс Телемост · Zoom', desc: 'Запись и расшифровка встреч', stage: 5 },
  { name: 'Telegram', desc: 'Личные чаты и каналы', stage: 7 },
  { name: 'WordPress и сайты', desc: 'Публикация материалов', stage: 9 },
]

export function IntegrationsPage() {
  const { notify, go, setSettingsCat } = useApp()
  const [health, setHealth] = useState<Health | null>(null)
  const [models, setModels] = useState<ProviderModels[] | null>(null)
  const [cfg, setCfg] = useState<(typeof PROVIDERS)[number] | null>(null)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const refresh = () => { api.health().then(setHealth).catch(() => {}); api.models().then(setModels).catch(() => setModels([])) }
  useEffect(() => { refresh() }, [])

  const saveKey = async () => {
    if (!cfg) return
    setBusy(true)
    try {
      await api.putSecret(cfg.secret, key.trim())
      const m = (await api.models()).find(x => x.provider === cfg.id)
      notify(m?.available ? `Ключ сохранён в Credential Manager. Моделей: ${m.models.length}` : `Ключ сохранён, но сервер ответил: ${m?.error ?? 'нет связи'}`)
      setKey(''); setCfg(null); refresh()
    } catch (e) { notify(e instanceof ApiError ? e.message : 'Не удалось сохранить') }
    finally { setBusy(false) }
  }
  const state = (id: string) => {
    const configured = health?.providers.find(p => p.name === id)?.configured
    const m = models?.find(x => x.provider === id)
    if (!health) return null
    if (!configured) return <Badge>нет ключа</Badge>
    if (!models) return <Badge>проверяю…</Badge>
    return m?.available ? <Badge tone="ok" dot>Подключено · {m.models.length} моделей</Badge> : <Badge tone="err" dot>{m?.error ?? 'нет связи'}</Badge>
  }
  return (
    <Page>
      <PageHeader title="Интеграции" subtitle="Показаны только настоящие подключения. Ключи хранятся в Windows Credential Manager." />
      <div className="px-8 pb-8">
        <CalendarSync />
        <Section title="AI-провайдеры">
          <div className="grid grid-cols-2 gap-3">
            {PROVIDERS.map(p => (
              <Card key={p.id} className="flex items-center gap-3">
                <div className="grid size-9 place-items-center rounded-lg bg-surface3 font-semibold text-fg2">{p.name[0]}</div>
                <div className="min-w-0 flex-1"><div className="font-medium">{p.name}</div><div className="truncate text-[12.5px] text-fg3">{p.desc}</div></div>
                {state(p.id)}<Button size="sm" onClick={() => setCfg(p)}>Ключ</Button>
              </Card>
            ))}
          </div>
        </Section>
        <Section title="Хранилище">
          <Card className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-lg bg-surface3 font-semibold text-fg2">S</div>
            <div className="min-w-0 flex-1"><div className="font-medium">Selectel S3</div><div className="truncate text-[12.5px] text-fg3">Файлы и ежедневные резервные копии{health?.s3.bucket && ` · бакет ${health.s3.bucket}`}</div></div>
            {health && (health.s3.ok ? <Badge tone="ok" dot>Подключено</Badge> : <Badge tone="err" dot>{health.s3.error ?? 'нет связи'}</Badge>)}
            <Button size="sm" onClick={() => { setSettingsCat('storage'); go('settings') }}>Подробнее</Button>
          </Card>
        </Section>
        <Section title="В разработке">
          <div className="grid grid-cols-2 gap-3">
            {PLANNED.map(p => (
              <Card key={p.name} className="flex items-center gap-3 opacity-70">
                <div className="grid size-9 place-items-center rounded-lg bg-surface3 font-semibold text-fg3">{p.name[0]}</div>
                <div className="min-w-0 flex-1"><div className="font-medium">{p.name}</div><div className="truncate text-[12.5px] text-fg3">{p.desc}</div></div>
                <Badge>этап {p.stage}</Badge>
              </Card>
            ))}
          </div>
        </Section>
      </div>
      <Modal open={!!cfg} onClose={() => setCfg(null)} title={cfg?.name ?? ''} footer={<>
        <Button onClick={() => setCfg(null)}>Закрыть</Button>
        <Button variant="primary" onClick={saveKey} disabled={busy || key.trim().length < 8}>{busy ? 'Проверяю…' : 'Проверить и сохранить'}</Button></>}>
        <p className="mb-3 text-fg2">Ключ сохраняется в Windows Credential Manager и не попадает в логи и Git.</p>
        {cfg && <Input type="password" placeholder={cfg.placeholder} value={key} onChange={e => setKey(e.target.value)} />}
        {cfg?.id === 'openrouter' && <p className="mt-3 text-[12.5px] text-fg3">Запросы в OpenRouter уходят во внешнее облако. Выбор моделей, месячный лимит и режим «Только мой сервер» — в «Модели AI».</p>}
        {cfg?.id === 'siteaccess' && <p className="mt-3 text-[12.5px] text-fg3">Основной провайдер. Если сервер занят или недоступен, запросы автоматически уходят в OpenRouter.</p>}
      </Modal>
    </Page>
  )
}
