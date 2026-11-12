import { useEffect, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { Card, Badge, Button, Input, Progress } from '../ui'
import { useApp } from '../store'
import { api, ApiError, Budget } from '../api'

const usd = (v: number) => `$${v < 1 ? v.toFixed(3) : v.toFixed(2)}`
const MONTH = (m: string) => new Date(m + '-01T00:00:00Z').toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })

/** OpenRouter monthly spend: real figures from the backend, limit editable. App-wide: the key is shared by all accounts. */
export function BudgetCard() {
  const { notify } = useApp()
  const [b, setB] = useState<Budget | null>(null)
  const [err, setErr] = useState('')
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => { setErr(''); api.budget().then(x => { setB(x); setDraft(String(x.limit)) }).catch(e => setErr(e instanceof ApiError ? e.message : 'Не удалось загрузить')) }
  useEffect(load, [])

  const save = async () => {
    const v = Number(draft.replace(',', '.'))
    if (!Number.isFinite(v) || v < 0) { notify('Введите сумму в долларах, 0 — без лимита'); return }
    setBusy(true)
    try { setB(await api.setBudget(v)); notify(v ? `Лимит: $${v} в месяц` : 'Лимит снят') }
    catch (e) { notify(e instanceof ApiError ? e.message : 'Не удалось сохранить') } finally { setBusy(false) }
  }

  if (err) return <Card className="flex items-center justify-between text-fg3"><span>{err}</span><Button size="sm" onClick={load}>Повторить</Button></Card>
  if (!b) return <Card className="flex items-center gap-2 text-fg3"><Loader2 size={14} className="spin" />Загружаю расходы…</Card>

  const pct = Math.min(100, b.ratio * 100)
  const tone = b.level === 'stop' ? 'err' : b.level === 'warn' ? 'warn' : 'accent'
  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-medium">Расходы за {MONTH(b.month)}</div>
          <div className="text-[12.5px] text-fg3">Облако используется, когда ваш сервер занят или недоступен, а также для памяти. При 80 % лимита появится предупреждение, при 100 % облачные запросы прекращаются до 1-го числа — останется только ваш сервер.</div>
        </div>
        {b.level === 'stop' ? <Badge tone="err" dot>Лимит исчерпан</Badge> : b.level === 'warn' ? <Badge tone="warn" dot>Почти исчерпан</Badge> : <Badge tone="ok" dot>В пределах</Badge>}
      </div>
      {b.limit > 0 ? (
        <div>
          <Progress value={pct} tone={tone} />
          <div className="mt-1 flex justify-between text-[12.5px] text-fg3"><span>{usd(b.spent)} из ${b.limit}</span><span>{Math.round(b.ratio * 100)} %</span></div>
        </div>
      ) : <div className="text-[12.5px] text-fg3">Лимит не задан · потрачено {usd(b.spent)}</div>}
      <div className="flex items-center gap-2">
        <span className="text-[13px]">Лимит в месяц, $</span>
        <Input icon={null} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save() }} className="w-24" inputMode="decimal" />
        <Button size="sm" variant="primary" disabled={busy || draft === String(b.limit)} onClick={save}>Сохранить</Button>
        <div className="flex-1" />
        <Button size="sm" icon={<RefreshCw size={13} />} onClick={load}>Обновить</Button>
      </div>
    </Card>
  )
}
