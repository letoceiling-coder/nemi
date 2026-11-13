import { useEffect, useState } from 'react'
import { Loader2, RefreshCw, Link2, Unplug, CalendarDays } from 'lucide-react'
import { Card, Badge, Button, Section } from '../ui'
import { useApp } from '../store'
import { req } from '../api'
import { errText } from '../tasks'

interface Account { provider: 'google' | 'yandex'; title: string; credentials: boolean; connected: boolean; mine: boolean
  status: { at: string; count: number; error: string | null } | null }

const calSync = {
  accounts: () => req<Account[]>('/calendar/accounts'),
  connectGoogle: () => req<{ url: string }>('/calendar/google/connect', { method: 'POST' }),
  connectYandex: () => req<{ count: number }>('/calendar/yandex/connect', { method: 'POST' }),
  sync: () => req<{ provider: string; count?: number; error?: string }[]>('/calendar/sync', { method: 'POST' }),
  disconnect: (p: string) => req<{ removed: number }>(`/calendar/${p}`, { method: 'DELETE' }),
}
const ago = (iso: string) => { const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? 'только что' : m < 60 ? `${m} мин назад` : new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }

/** Integrations → Календари: import from Google and Yandex (read-only for now). */
export function CalendarSync() {
  const { notify, bumpCal } = useApp()
  const [acc, setAcc] = useState<Account[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [ask, setAsk] = useState<string | null>(null)
  const load = () => calSync.accounts().then(setAcc).catch(() => setAcc([]))
  useEffect(() => { load() }, [])
  // Google sign-in happens in the system browser; poll until the account shows up
  useEffect(() => {
    if (busy !== 'google-wait') return
    const t = setInterval(async () => {
      const a = await calSync.accounts().catch(() => null)
      if (a?.find(x => x.provider === 'google')?.mine) {
        setAcc(a); setBusy(null); notify('Google Календарь подключён — загружаю события')
        await calSync.sync().catch(() => {}); load(); bumpCal()
      }
    }, 2500)
    const stop = setTimeout(() => setBusy(null), 5 * 60000)
    return () => { clearInterval(t); clearTimeout(stop) }
  }, [busy])
  useEffect(() => { if (!ask) return; const t = setTimeout(() => setAsk(null), 3000); return () => clearTimeout(t) }, [ask])

  const connect = async (a: Account) => {
    try {
      if (a.provider === 'google') { await calSync.connectGoogle(); setBusy('google-wait'); notify('Откройте браузер и разрешите NEMI доступ к Google Календарю') }
      else { setBusy('yandex'); const r = await calSync.connectYandex(); notify(`Яндекс Календарь подключён · событий: ${r.count}`); load(); bumpCal(); setBusy(null) }
    } catch (e) { notify(errText(e, 'Не удалось подключить')); setBusy(null) }
  }
  const syncNow = async () => {
    setBusy('sync')
    try {
      const r = await calSync.sync()
      const err = r.find(x => x.error)
      notify(err ? `Ошибка: ${err.error}` : `Синхронизировано · событий: ${r.reduce((s, x) => s + (x.count ?? 0), 0)}`)
      load(); bumpCal()
    } catch (e) { notify(errText(e)) } finally { setBusy(null) }
  }
  const disconnect = async (a: Account) => {
    if (ask !== a.provider) { setAsk(a.provider); return }
    setAsk(null)
    try { const r = await calSync.disconnect(a.provider); notify(`${a.title} отключён, убрано событий: ${r.removed}`); load(); bumpCal() }
    catch (e) { notify(errText(e)) }
  }

  return (
    <Section title="Календари" right={acc?.some(a => a.mine) ? <Button size="sm" icon={busy === 'sync' ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />} disabled={!!busy} onClick={syncNow}>Синхронизировать</Button> : undefined}>
      <div className="grid grid-cols-2 gap-3">
        {(acc ?? []).map(a => (
          <Card key={a.provider} className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="grid size-9 place-items-center rounded-lg bg-surface3 text-fg2"><CalendarDays size={16} /></div>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{a.title}</div>
                <div className="truncate text-[12.5px] text-fg3">
                  {a.mine && a.status ? (a.status.error ? <span className="text-err">{a.status.error}</span> : `событий: ${a.status.count} · ${ago(a.status.at)}`)
                    : a.mine ? 'подключён · первая синхронизация скоро' : a.connected ? 'подключён другим пользователем' : a.credentials ? 'готов к подключению' : 'не настроен'}
                </div>
              </div>
              {a.mine ? <Badge tone={a.status?.error ? 'err' : 'ok'} dot>{a.status?.error ? 'Ошибка' : 'Подключён'}</Badge> : null}
            </div>
            <div className="flex gap-2">
              {!a.mine && a.credentials && !a.connected && (
                <Button size="sm" variant="primary" disabled={!!busy} icon={busy === a.provider || (busy === 'google-wait' && a.provider === 'google') ? <Loader2 size={13} className="spin" /> : <Link2 size={13} />} onClick={() => connect(a)}>
                  {busy === 'google-wait' && a.provider === 'google' ? 'Жду разрешения в браузере…' : 'Подключить'}
                </Button>)}
              {a.mine && <Button size="sm" icon={<Unplug size={13} />} onClick={() => disconnect(a)}>{ask === a.provider ? 'Точно отключить?' : 'Отключить'}</Button>}
            </div>
          </Card>
        ))}
        {acc === null && <div className="flex items-center gap-2 text-fg3"><Loader2 size={14} className="spin" />Загружаю…</div>}
      </div>
      <div className="mt-2 text-[12.5px] text-fg3">События из Google и Яндекса появляются в календаре NEMI раз в 5 минут и доступны ассистенту. Пока только чтение: изменять их нужно в исходном календаре.</div>
    </Section>
  )
}
