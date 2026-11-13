import { useEffect, useMemo, useState } from 'react'
import { Check, Loader2, RefreshCw, Search, Server, Cloud, ShieldCheck } from 'lucide-react'
import clsx from 'clsx'
import { Page, PageHeader, Card, Badge, Button, Section, Switch, Input } from '../ui'
import { useApp } from '../store'
import { api, ApiError, getPref, setPref, ProviderModels, ModelRoles } from '../api'
import { BudgetCard } from './Budget'

const PROVIDER: Record<string, { title: string; hint: string; icon: typeof Server }> = {
  siteaccess: { title: 'Ваш сервер · SiteAccess', hint: 'Основной. Данные не покидают ваш сервер.', icon: Server },
  openrouter: { title: 'OpenRouter', hint: 'Резерв, когда сервер занят или недоступен. Платный, с месячным лимитом.', icon: Cloud },
}
const ROLE: Record<string, { title: string; hint: string }> = {
  bulk: { title: 'Массовая обработка', hint: 'Разбивка, саммари, теги, извлечение памяти' },
  main: { title: 'Основная работа', hint: 'Задачи и решения из документов, ответы по базе знаний' },
  deep: { title: 'Сложный анализ', hint: 'Итоговые отчёты, редкие тяжёлые задачи' },
}

/** Settings → Модели AI: real providers, the chat model, private mode, roles and the cloud budget. */
export function ModelsPage() {
  const { notify } = useApp()
  const [pm, setPm] = useState<ProviderModels[] | null>(null)
  const [roles, setRoles] = useState<ModelRoles | null>(null)
  const [priv, setPriv] = useState<boolean | null>(null)
  const [pref, setP] = useState(getPref())
  const [q, setQ] = useState('')
  const [all, setAll] = useState(false)

  const load = () => { setPm(null); api.models().then(setPm).catch(() => setPm([])) }
  useEffect(() => {
    load()
    api.modelRoles().then(setRoles).catch(() => {})
    api.modelSettings().then(s => setPriv(s.private_only)).catch(() => setPriv(false))
  }, [])

  const choose = (provider?: string, model?: string) => {
    const p = provider ? { provider, model } : {}
    setPref(p); setP(p)
    notify(model ? `Модель для чата: ${model}` : 'Модель для чата: авто')
  }
  const togglePriv = async (on: boolean) => {
    setPriv(on)
    try {
      await api.setModelSettings(on)
      if (on && pref.provider && pref.provider !== 'siteaccess') choose()   // a cloud model can't be used any more
      notify(on ? 'Только ваш сервер: облако не используется' : 'Облачный резерв включён')
    } catch (e) { setPriv(!on); notify(e instanceof ApiError ? e.message : 'Не удалось сохранить') }
  }

  const own = pm?.find(p => p.provider === 'siteaccess')
  const cloud = pm?.find(p => p.provider === 'openrouter')
  const cloudShown = useMemo(() => {
    const ms = cloud?.models ?? []
    const f = q.trim() ? ms.filter(m => m.toLowerCase().includes(q.trim().toLowerCase())) : ms
    if (all || q.trim()) return f
    // recommended = the models the role chains use (prices checked), in chain order
    const rec = [...new Set(Object.values(roles?.roles ?? {}).flat())]
    return rec.filter(m => ms.includes(m))
  }, [cloud, q, all, roles])

  const Row = ({ provider, m }: { provider: string; m: string }) => {
    const active = pref.provider === provider && pref.model === m
    return (
      <button onClick={() => choose(provider, m)} className={clsx('flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px]', active ? 'bg-accentsoft' : 'hover:bg-surface2')}>
        <span className="truncate font-mono text-[12.5px]">{m}</span>
        {active ? <Check size={14} className="shrink-0 text-accent" /> : <span className="shrink-0 text-[12px] text-fg3 opacity-0 group-hover:opacity-100">выбрать</span>}
      </button>
    )
  }

  const status = (p?: ProviderModels) => !pm ? <Badge><Loader2 size={11} className="spin" />Проверяю</Badge>
    : !p ? <Badge>Нет данных</Badge>
    : p.available ? <Badge tone="ok" dot>Доступен · {p.models.length}</Badge>
    : <Badge tone="err" dot>Недоступен</Badge>

  return (
    <Page>
      <PageHeader title="Модели AI" subtitle="Ваш сервер → резерв OpenRouter"
        actions={<Button size="sm" icon={<RefreshCw size={13} />} onClick={load}>Проверить снова</Button>} />
      <div className="space-y-1 px-8 pb-8">
        <Section title="Режим">
          <Card>
            <div className="flex items-start justify-between gap-6">
              <div className="flex gap-3">
                <ShieldCheck size={18} className="mt-0.5 shrink-0 text-accent" />
                <div>
                  <div className="font-medium">Только мой сервер</div>
                  <div className="text-[12.5px] text-fg3">Чат, выделение фактов в память и поиск по памяти идут только через ваш сервер — ничего не уходит в облако. Если сервер занят или недоступен, ассистент сообщит об ошибке вместо переключения на OpenRouter.</div>
                </div>
              </div>
              {priv === null ? <Loader2 size={14} className="spin text-fg3" /> : <Switch checked={priv} onChange={togglePriv} label="Только мой сервер" />}
            </div>
          </Card>
        </Section>

        <Section title="Модель для чата">
          <Card className="space-y-3">
            <button onClick={() => choose()} className={clsx('flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left', !pref.model ? 'border-accent bg-accentsoft' : 'border-line hover:bg-surface2')}>
              <div>
                <div className="font-medium">Авто</div>
                <div className="text-[12.5px] text-fg3">{priv ? 'Модель вашего сервера по умолчанию' : 'Ваш сервер, при занятости — OpenRouter'}</div>
              </div>
              {!pref.model && <Check size={15} className="text-accent" />}
            </button>
            {pref.model && <div className="text-[12.5px] text-fg3">Выбрано: <span className="font-mono text-fg">{pref.model}</span> · {PROVIDER[pref.provider ?? '']?.title ?? pref.provider}. Тот же выбор доступен в чате, рядом с полем ввода.</div>}
          </Card>
        </Section>

        {[{ id: 'siteaccess', p: own }, { id: 'openrouter', p: cloud }].map(({ id, p }) => {
          const meta = PROVIDER[id]; const I = meta.icon
          const off = id === 'openrouter' && priv
          return (
            <Section key={id} title={meta.title}>
              <Card className={clsx('space-y-3', off && 'opacity-60')}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex gap-3"><I size={17} className="mt-0.5 shrink-0 text-fg3" /><div className="text-[12.5px] text-fg3">{off ? 'Отключено режимом «Только мой сервер».' : meta.hint}</div></div>
                  {status(p)}
                </div>
                {p && !p.available && <div className="rounded-lg bg-err/10 px-3 py-2 text-[12.5px] text-err">{p.error || 'Нет ответа'}{id === 'openrouter' && /ключ/.test(p.error ?? '') ? ' — добавьте ключ в «Интеграции»' : ''}</div>}
                {p?.available && !off && (id === 'siteaccess' ? (
                  <div className="group space-y-0.5">{p.models.map(m => <Row key={m} provider={id} m={m} />)}</div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <Input placeholder={`Найти среди ${p.models.length} моделей`} value={q} onChange={e => setQ(e.target.value)} icon={<Search size={14} />} className="flex-1" />
                      {!q.trim() && <Button size="sm" onClick={() => setAll(a => !a)}>{all ? 'Рекомендуемые' : 'Все модели'}</Button>}
                    </div>
                    <div className="group max-h-72 space-y-0.5 overflow-y-auto">
                      {cloudShown.map(m => <Row key={m} provider={id} m={m} />)}
                      {!cloudShown.length && <div className="py-3 text-center text-[12.5px] text-fg3">Ничего не найдено</div>}
                    </div>
                  </>
                ))}
              </Card>
            </Section>
          )
        })}

        <Section title="Расходы OpenRouter"><BudgetCard /></Section>

        <Section title="Роли для фоновой работы">
          <Card className="space-y-3">
            <div className="text-[12.5px] text-fg3">Для обработки документов и памяти у каждой роли своя цепочка: если первая модель не ответила, берётся следующая. {priv ? 'Сейчас всё выполняется на вашем сервере.' : ''}</div>
            {!roles ? <div className="flex items-center gap-2 text-fg3"><Loader2 size={14} className="spin" />Загружаю…</div> : (
              <div className="divide-y divide-line">
                {Object.entries(roles.roles).map(([r, chain]) => (
                  <div key={r} className="flex items-start gap-4 py-2.5">
                    <div className="w-48 shrink-0"><div className="text-[13.5px]">{ROLE[r]?.title ?? r}</div><div className="text-[12px] text-fg3">{ROLE[r]?.hint}</div></div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {chain.map((m, i) => <span key={m} className="flex items-center gap-1.5">{i > 0 && <span className="text-fg3">→</span>}<span className="rounded-md bg-surface3 px-2 py-0.5 font-mono text-[12px]">{m}</span></span>)}
                    </div>
                  </div>
                ))}
                <div className="flex items-start gap-4 py-2.5">
                  <div className="w-48 shrink-0"><div className="text-[13.5px]">Поиск по памяти</div><div className="text-[12px] text-fg3">Векторы для поиска похожих фактов</div></div>
                  <span className="rounded-md bg-surface3 px-2 py-0.5 font-mono text-[12px]">{roles.embedding}</span>
                </div>
              </div>
            )}
          </Card>
        </Section>
      </div>
    </Page>
  )
}
