import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { RefreshCw, Copy, Loader2 } from 'lucide-react'
import { useApp } from '../store'
import { Card, Badge, Button, Tabs } from '../ui'
import { api, Health, ProviderModels } from '../api'

type Tone = 'ok' | 'warn' | 'err'
const PROVIDER: Record<string, string> = { siteaccess: 'Свой сервер (api.siteaccess.ru)', openrouter: 'OpenRouter (резерв)' }

const Row = ({ title, hint, tone, value }: { title: string; hint?: string; tone: Tone; value: string }) => (
  <div className="flex items-center justify-between gap-6 border-b border-line py-3 last:border-0">
    <div className="min-w-0"><div>{title}</div>{hint && <div className="truncate text-[12.5px] text-fg3">{hint}</div>}</div>
    <Badge tone={tone} dot>{value}</Badge>
  </div>
)

/** Settings → Diagnostics: real backend state + tail of the redacted app log. */
export function DiagnosticsPanel() {
  const { notify } = useApp()
  const [h, setH] = useState<Health | null>(null)
  const [pm, setPm] = useState<ProviderModels[] | null>(null)
  const [down, setDown] = useState(false)
  const [log, setLog] = useState<{ file: string; lines: string[] } | null>(null)
  const [level, setLevel] = useState<'' | 'WARNING'>('WARNING')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    setBusy(true)
    try {
      const [hh, mm, ll] = await Promise.all([api.health(), api.models().catch(() => null), api.logs(150, level)])
      setH(hh); setPm(mm); setLog(ll); setDown(false)
    } catch { setDown(true) } finally { setBusy(false) }
  }
  useEffect(() => { load() }, [level])

  if (down) return <Card><Row title="Служба ассистента" hint="Backend на 127.0.0.1:8731 не отвечает" tone="err" value="не запущена" /></Card>
  if (!h) return <div className="flex items-center gap-2 text-fg3"><Loader2 size={14} className="spin" />Проверяю…</div>

  const avail = (name: string) => pm?.find(p => p.provider === name)
  return (
    <div className="space-y-4">
      <Card>
        <Row title="Служба ассистента" hint={`Версия ${h.version}`} tone="ok" value="работает" />
        {h.providers.map(p => {
          const a = avail(p.name)
          const tone: Tone = !p.configured ? 'err' : a && !a.available ? 'warn' : 'ok'
          const value = !p.configured ? 'нет ключа' : !a ? 'настроен' : a.available ? `доступен · ${a.models.length} моделей` : 'недоступен'
          return <Row key={p.name} title={PROVIDER[p.name] ?? p.name} hint={a?.error} tone={tone} value={value} />
        })}
        <Row title="Хранилище S3" hint={h.s3.bucket ? `Бакет ${h.s3.bucket}` : h.s3.error} tone={h.s3.ok ? 'ok' : 'warn'} value={h.s3.ok ? 'подключено' : 'нет связи'} />
        <Row title="Свободно на диске" tone={h.disk_free_gb < 5 ? 'warn' : 'ok'} value={`${h.disk_free_gb} ГБ`} />
      </Card>

      <Card>
        <div className="mb-3 flex items-center gap-3">
          <div className="font-medium">Журнал</div>
          <Tabs value={level} onChange={setLevel} items={[{ id: 'WARNING', label: 'Проблемы' }, { id: '', label: 'Всё' }]} />
          <div className="flex-1" />
          <Button size="sm" icon={<Copy size={13} />} disabled={!log?.lines.length}
            onClick={() => { navigator.clipboard.writeText(log!.lines.join('\n')).then(() => notify('Скопировано')).catch(() => notify('Не удалось скопировать')) }}>Копировать</Button>
          <Button size="sm" icon={<RefreshCw size={13} className={clsx(busy && 'spin')} />} onClick={load}>Обновить</Button>
        </div>
        {log && log.lines.length ? (
          <pre className="max-h-[360px] overflow-auto rounded-lg bg-surface2 p-3 font-mono text-[11.5px] leading-relaxed text-fg2">
            {log.lines.map((l, i) => <div key={i} className={clsx(/ ERROR | CRITICAL /.test(l) && 'text-err', / WARNING /.test(l) && 'text-warn')}>{l}</div>)}
          </pre>
        ) : <div className="py-4 text-fg3">{level ? 'Проблем не найдено.' : 'Журнал пуст.'}</div>}
        <div className="mt-2 truncate text-[12px] text-fg3" title={log?.file}>
          Файл: {log?.file}. Ключи, токены, пароли и поисковые запросы в журнал не попадают, тексты сообщений не пишутся.
        </div>
      </Card>
    </div>
  )
}
