import { useEffect, useState } from 'react'
import { api, ApiError } from '../api'
import { integrations } from '../data'
import { Page, PageHeader, Card, Badge, Button, Section, Modal, Input } from '../ui'
import { useApp } from '../store'
import { CalendarSync } from './CalendarSync'

export function IntegrationsPage() {
  const { notify } = useApp()
  const [state, setState] = useState(Object.fromEntries(integrations.map(i => [i.id, i.connected])))
  const [cfg, setCfg] = useState<string | null>(null)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const secretOf: Record<string, string> = { i0: 'openrouter_api_key', i00: 'siteaccess_api_key' }
  const providerOf: Record<string, string> = { i0: 'openrouter', i00: 'siteaccess' }
  const refresh = () => api.health().then(h => setState(s => ({ ...s, i0: h.providers.find(p => p.name === 'openrouter')?.configured ?? false, i00: h.providers.find(p => p.name === 'siteaccess')?.configured ?? false, i10: h.s3.ok }))).catch(() => {})
  useEffect(() => { refresh() }, [])
  const saveKey = async () => {
    if (!cur) return
    if (!secretOf[cur.id]) { setState(s => ({ ...s, [cur.id]: true })); setCfg(null); notify('Подключение проверено'); return }
    setBusy(true)
    try {
      await api.putSecret(secretOf[cur.id], key.trim())
      const m = (await api.models()).find(x => x.provider === providerOf[cur.id])
      notify(m?.available ? `Ключ сохранён в Credential Manager. Моделей: ${m.models.length}` : `Ключ сохранён, но сервер ответил: ${m?.error ?? 'нет связи'}`)
      setKey(''); setCfg(null); refresh()
    } catch (e) { notify(e instanceof ApiError ? e.message : 'Не удалось сохранить') }
    finally { setBusy(false) }
  }
  const kinds = [...new Set(integrations.map(i => i.kind))]
  const cur = integrations.find(i => i.id === cfg)
  return (
    <Page>
      <PageHeader title="Интеграции" subtitle="Каждая интеграция — отдельный плагин с минимальными правами" />
      <div className="px-8">
        <CalendarSync />
        {kinds.map(k => (
          <Section key={k} title={k}>
            <div className="grid grid-cols-2 gap-3">
              {integrations.filter(i => i.kind === k).map(i => (
                <Card key={i.id} className="flex items-center gap-3">
                  <div className="grid size-9 place-items-center rounded-lg bg-surface3 font-semibold text-fg2">{i.name[0]}</div>
                  <div className="min-w-0 flex-1"><div className="font-medium">{i.name}</div><div className="truncate text-[12.5px] text-fg3">{i.desc}</div></div>
                  {state[i.id] ? <><Badge tone="ok" dot>Подключено</Badge><Button size="sm" onClick={() => setCfg(i.id)}>Настроить</Button></> : <Button size="sm" onClick={() => setCfg(i.id)}>Подключить</Button>}
                </Card>
              ))}
            </div>
          </Section>
        ))}
      </div>
      <Modal open={!!cur} onClose={() => setCfg(null)} title={cur ? `${cur.name}` : ''} footer={<>
        {cur && state[cur.id] && <Button variant="danger" onClick={() => { setState(s => ({ ...s, [cur.id]: false })); setCfg(null); notify('Интеграция отключена') }}>Отключить</Button>}
        <Button onClick={() => setCfg(null)}>Закрыть</Button>
        <Button variant="primary" onClick={saveKey} disabled={busy || !cur || (!!secretOf[cur.id] && key.trim().length < 8)}>{busy ? 'Проверяю…' : 'Проверить и сохранить'}</Button></>}>
        <p className="mb-3 text-fg2">Секреты хранятся в Windows Credential Manager и не попадают в логи и Git.</p>
        {cur?.id === 'i0'
          ? <div className="space-y-2"><Input type="password" placeholder="API-ключ OpenRouter (sk-or-…)" value={key} onChange={e => setKey(e.target.value)} />
              <select className="h-9 w-full rounded-lg border border-line bg-surface px-2 text-[13.5px]">{['Авто (лучшая по цене/качеству)', 'anthropic/claude-sonnet', 'openai/gpt-4o', 'qwen/qwen3-235b', 'google/gemini-2.5-pro', 'meta-llama/llama-3.3-70b'].map(m => <option key={m}>{m}</option>)}</select>
              <Input placeholder="Месячный лимит расходов, $" />
              <p className="text-[12.5px] text-warn">Запросы уйдут во внешнее облако. Для приватных данных используйте локальные модели Ollama — можно отключить OpenRouter для отдельных агентов в «Модели AI».</p></div>
          : cur?.id === 'i00'
          ? <div className="space-y-2"><Input value="https://api.siteaccess.ru/v1" readOnly /><Input type="password" placeholder="API-ключ сервера (раздел «Ключи» в кабинете)" value={key} onChange={e => setKey(e.target.value)} />
              <p className="text-[12.5px] text-fg3">Основной провайдер. Если сервер занят или недоступен, запросы автоматически уходят в OpenRouter.</p></div>
          : <div className="space-y-2"><Input placeholder="Endpoint / адрес сервера" /><Input type="password" placeholder="Ключ доступа" /></div>}
        <p className="mt-3 text-[12.5px] text-fg3">Разрешения: чтение (по умолчанию). Отправка и публикация — по запросу.</p>
      </Modal>
    </Page>
  )
}
