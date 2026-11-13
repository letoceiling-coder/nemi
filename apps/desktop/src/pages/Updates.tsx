import { useEffect, useState } from 'react'
import { Download, Loader2, RefreshCw, ShieldCheck, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Card, Badge, Button, Progress, Switch } from '../ui'
import { useApp } from '../store'
import { useUpdates, loadCurrentVersion, getAutoCheck, setAutoCheck } from '../updates'

const when = (ms: number) => {
  if (!ms) return 'ещё не проверялось'
  const d = new Date(ms), today = new Date().toDateString() === d.toDateString()
  return (today ? 'сегодня, ' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ', ') + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}
const date = (s?: string) => { if (!s) return ''; const d = new Date(s.replace(' ', 'T').replace(/ UTC$|\.\d+ \+00:00:00$/, 'Z')); return isNaN(+d) ? '' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) }

/** Settings → Обновления: real version, check, one-click signed update with progress. */
export function UpdatesPanel() {
  const { notify } = useApp()
  const { current, state, info, progress, error, lastCheck, check, install } = useUpdates()
  const [auto, setAuto] = useState(getAutoCheck())
  useEffect(() => { loadCurrentVersion() }, [])

  if (state === 'unsupported') return (
    <Card className="text-fg3">Обновления работают только в установленном приложении NEMI, не в браузерной версии.</Card>
  )

  const busy = state === 'checking' || state === 'downloading' || state === 'installing'
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[12.5px] text-fg3">Установленная версия</div>
            <div className="text-[20px] font-semibold">{current || '…'}</div>
          </div>
          {state === 'none' && <Badge tone="ok" dot>Последняя версия</Badge>}
          {state === 'available' && <Badge tone="accent" dot>Есть обновление</Badge>}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button icon={state === 'checking' ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} disabled={busy} onClick={() => check()}>Проверить обновления</Button>
          <span className="text-[12.5px] text-fg3">
            {state === 'checking' ? 'Проверяю…' : state === 'none' ? `Обновлений нет · проверено ${when(lastCheck)}` : `Последняя проверка: ${when(lastCheck)}`}
          </span>
        </div>
        {state === 'error' && <div className="mt-3 flex items-start gap-2 rounded-lg bg-err/10 px-3 py-2 text-[12.5px] text-err"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{error}</div>}
      </Card>

      {info && ['available', 'downloading', 'installing', 'error'].includes(state) && (
        <Card className="anim-in border-accent/50">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-medium">Доступна версия {info.version}</div>
              <div className="flex items-center gap-1.5 text-[12.5px] text-fg3">{date(info.date) && <>Выпущена {date(info.date)} · </>}<ShieldCheck size={13} />подпись проверяется перед установкой</div>
            </div>
          </div>
          {info.notes && <div className="mt-3 whitespace-pre-wrap text-[13px] text-fg2">{info.notes}</div>}
          {state === 'downloading' || state === 'installing' ? (
            <div className="mt-4">
              <Progress value={progress < 0 ? 50 : progress} />
              <div className="mt-1 text-[12px] text-fg3">{state === 'installing' ? 'Устанавливаю — приложение перезапустится само…' : progress < 0 ? 'Скачиваю…' : `Скачиваю… ${progress}%`}</div>
            </div>
          ) : (
            <Button className="mt-4" variant="primary" icon={<Download size={14} />} onClick={install}>Обновить и перезапустить</Button>
          )}
          <div className="mt-3 text-[12px] text-fg3">Аккаунт, диалоги, память и настройки при обновлении сохраняются: они хранятся отдельно от программы. Незавершённый ответ в чате прервётся.</div>
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between gap-6">
          <div><div>Проверять автоматически</div><div className="text-[12.5px] text-fg3">При запуске и каждые 6 часов. Устанавливается только по вашей кнопке.</div></div>
          <Switch checked={auto} onChange={v => { setAuto(v); setAutoCheck(v); notify(v ? 'Автопроверка включена' : 'Автопроверка выключена') }} label="Автопроверка" />
        </div>
      </Card>
      {state === 'none' && <div className="flex items-center gap-1.5 text-[12.5px] text-fg3"><CheckCircle2 size={13} />Обновления подписаны ключом NEMI; пакет с чужой подписью не установится.</div>}
    </div>
  )
}
