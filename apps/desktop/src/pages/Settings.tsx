import { useState } from 'react'
import clsx from 'clsx'
import { Palette as PaletteIcon, ShieldCheck, RefreshCw, Activity, HardDrive, Bell, Loader2, Download, Search, User, Plug, Cpu, ListChecks, LogOut, Brain } from 'lucide-react'
import { MemoryPanel } from './Memory'
import { DiagnosticsPanel } from './Diagnostics'
import { UpdatesPanel } from './Updates'
import { useApp, SettingsCat as Cat } from '../store'
import { Card, Switch, Badge, Button, Input, Tabs } from '../ui'
import { getUser, userKey } from '../api'
import { IntegrationsPage } from './Integrations'
import { ModelsPage } from './Models'
import { ActivityPage } from './Activity'
import { StoragePanel } from './Storage'
import { SecurityPanel } from './Security'
import { osNotify, osNotifyOn, setOsNotify } from '../tasks'

const cats: { id: Cat; label: string; icon: typeof Bell }[] = [
  { id: 'general', label: 'Внешний вид', icon: PaletteIcon }, { id: 'memory', label: 'Память', icon: Brain }, { id: 'account', label: 'Аккаунт и вход', icon: User }, { id: 'security', label: 'Безопасность', icon: ShieldCheck },
  { id: 'integrations', label: 'Интеграции', icon: Plug }, { id: 'models', label: 'Модели AI', icon: Cpu }, { id: 'activity', label: 'Центр активности', icon: ListChecks },
  { id: 'notifications', label: 'Уведомления', icon: Bell }, { id: 'storage', label: 'Хранилище S3', icon: HardDrive },
  { id: 'updates', label: 'Обновления', icon: RefreshCw }, { id: 'diagnostics', label: 'Диагностика', icon: Activity },
]

const Row = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-6 border-b border-line py-3.5 last:border-0">
    <div><div>{title}</div>{hint && <div className="text-[12.5px] text-fg3">{hint}</div>}</div>{children}
  </div>
)

export function SettingsPage() {
  const { theme, toggleTheme, notify, settingsCat: cat, setSettingsCat: setCat, setAuthed } = useApp()
  const [lock, setLock] = useState(localStorage.getItem(userKey('autolock')) ?? '15')
  const profile = getUser()
  const [q, setQ] = useState('')
  const [motion, setMotion] = useState(localStorage.getItem('pai:motion') !== 'off')
  const [osOn, setOsOn] = useState(osNotifyOn())
  const shownCats = cats.filter(c => c.label.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="anim-in grid h-full grid-cols-[230px_1fr]">
      <div className="border-r border-line p-4">
        <h1 className="mb-3 px-2 text-[18px] font-semibold">Настройки</h1>
        <Input placeholder="Поиск" value={q} onChange={e => setQ(e.target.value)} icon={<Search size={14} />} className="mb-3" />
        {shownCats.map(c => { const I = c.icon; return <button key={c.id} onClick={() => setCat(c.id)} className={clsx('flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13.5px]', cat === c.id ? 'bg-surface2' : 'text-fg2 hover:bg-surface2/60')}><I size={15} />{c.label}</button> })}
      </div>
      {['integrations', 'models', 'activity'].includes(cat)
        ? <div className="min-h-0 overflow-hidden">{cat === 'integrations' ? <IntegrationsPage /> : cat === 'models' ? <ModelsPage /> : <ActivityPage />}</div>
        : <div className="overflow-y-auto p-8"><div className="max-w-2xl">
        <h2 className="mb-4 text-[18px] font-semibold">{cats.find(c => c.id === cat)?.label}</h2>
        {cat === 'account' && <div className="space-y-4">
          <Card><Row title={profile?.name ?? 'Профиль'} hint={profile?.email}><Button icon={<LogOut size={14} />} onClick={() => setAuthed(false)}>Выйти</Button></Row><Row title="Изоляция данных" hint="У каждого аккаунта свои чаты, память, проекты и ключи — данные не пересекаются"><Badge tone="ok">включена</Badge></Row>
            <Row title="Автоблокировка" hint="При бездействии потребуется ввести пароль">
              <select value={lock} onChange={e => { setLock(e.target.value); localStorage.setItem(userKey('autolock'), e.target.value); notify('Сохранено') }} className="h-8 rounded-lg border border-line bg-surface2 px-2 text-[13px]">
                {[['0', 'Выключена'], ['5', '5 минут'], ['15', '15 минут'], ['60', '1 час']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Row></Card>
          <Card><div className="text-[12.5px] text-fg3">Аккаунт хранится на этом компьютере: пароль — только в виде хэша, вход действует до закрытия NEMI или блокировки. Ключи сервисов (OpenRouter, сервер, S3, календари) лежат в Windows Credential Manager, а не в базе.</div></Card></div>}
        {cat === 'general' && <Card><Row title="Тема" hint="Тёмная по умолчанию"><Tabs value={theme} onChange={() => toggleTheme()} items={[{ id: 'dark', label: 'Тёмная' }, { id: 'light', label: 'Светлая' }]} /></Row><Row title="Анимации" hint="Выключите, если мешают. Системная настройка Windows тоже учитывается"><Switch checked={motion} onChange={v => { setMotion(v); localStorage.setItem('pai:motion', v ? 'on' : 'off'); document.documentElement.dataset.motion = v ? 'on' : 'off' }} label="Анимации" /></Row><Row title="Язык интерфейса"><Badge>Русский</Badge></Row></Card>}
        {cat === 'security' && <SecurityPanel />}
        {cat === 'notifications' && <Card><Row title="Уведомления Windows" hint="Напоминания о задачах и встречах. В самом окне NEMI они показываются всегда"><Switch checked={osOn} onChange={v => { setOsOn(v); setOsNotify(v); notify(v ? 'Уведомления включены' : 'Уведомления выключены') }} label="Уведомления Windows" /></Row><Row title="Проверка" hint="Если уведомление не пришло — проверьте «Параметры Windows → Уведомления» для NEMI"><Button size="sm" onClick={async () => notify(await osNotify('NEMI', 'Так будут выглядеть напоминания') ? 'Уведомление отправлено' : 'Windows не разрешил уведомления')}>Отправить тестовое</Button></Row></Card>}
        {cat === 'storage' && <StoragePanel />}
        {cat === 'updates' && <UpdatesPanel />}
        {cat === 'memory' && <MemoryPanel />}
        {cat === 'diagnostics' && <DiagnosticsPanel />}
      </div></div>}
    </div>
  )
}
