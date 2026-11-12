import { useState } from 'react'
import clsx from 'clsx'
import { Palette as PaletteIcon, ShieldCheck, RefreshCw, Activity, HardDrive, Bell, Loader2, Download, Search, User, Plug, Cpu, ListChecks, LogOut, Brain } from 'lucide-react'
import { MemoryPanel } from './Memory'
import { useApp, SettingsCat as Cat } from '../store'
import { Card, Switch, Badge, Button, Progress, Input, Tabs } from '../ui'
import { getUser, userKey } from '../api'
import { IntegrationsPage } from './Integrations'
import { ModelsPage } from './Models'
import { ActivityPage } from './Activity'

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

function Updates() {
  const { notify } = useApp()
  const [st, setSt] = useState<'idle' | 'check' | 'found' | 'dl' | 'done'>('idle')
  const [p, setP] = useState(0)
  const [ch, setCh] = useState<'stable' | 'beta'>('stable')
  const check = () => { setSt('check'); setTimeout(() => setSt('found'), 1200) }
  const install = () => { setSt('dl'); let v = 0; const t = setInterval(() => { v += 10; setP(v); if (v >= 100) { clearInterval(t); setSt('done') } }, 250) }
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between">
          <div><div className="text-[12.5px] text-fg3">Установленная версия</div><div className="text-[20px] font-semibold">0.3.2</div></div>
          <Tabs value={ch} onChange={setCh} items={[{ id: 'stable', label: 'Stable' }, { id: 'beta', label: 'Beta' }]} />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button icon={st === 'check' ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} disabled={st === 'check' || st === 'dl'} onClick={check}>Проверить обновления</Button>
          <span className="text-fg3">{st === 'idle' && 'Последняя проверка: сегодня, 09:00'}{st === 'check' && 'Проверяю…'}{st === 'done' && 'Версия 0.4.0 установлена. Перезапуск выполнен, данные сохранены.'}</span>
        </div>
      </Card>
      {(st === 'found' || st === 'dl') && (
        <Card className="anim-in border-accent/50">
          <div className="flex items-center justify-between"><div><div className="font-medium">Доступна версия 0.4.0</div><div className="text-[12.5px] text-fg3">Выпущена 11 ноября · 84 МБ · подпись проверена</div></div><Badge tone="accent">{ch}</Badge></div>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-fg2"><li>Новый центр активности</li><li>Режим «только черновики» для почты</li><li>Исправлено: сбой при повторной загрузке в S3</li></ul>
          {st === 'dl' ? <div className="mt-4"><Progress value={p} /><div className="mt-1 text-[12px] text-fg3">Загрузка и проверка контрольной суммы… {p}%</div></div>
            : <Button className="mt-4" variant="primary" icon={<Download size={14} />} onClick={install}>Скачать и установить</Button>}
          <div className="mt-3 text-[12px] text-fg3">База данных, история чатов, память, проекты и настройки при обновлении сохраняются. Предыдущая версия остаётся для отката.</div>
        </Card>
      )}
      <Card><Row title="Автоматическая проверка" hint="Раз в сутки"><Switch checked onChange={() => notify('Сохранено')} label="Автопроверка" /></Row></Card>
    </div>
  )
}

export function SettingsPage() {
  const { theme, toggleTheme, notify, settingsCat: cat, setSettingsCat: setCat, setAuthed } = useApp()
  const [lock, setLock] = useState(localStorage.getItem(userKey('autolock')) ?? '15')
  const profile = getUser()
  const [q, setQ] = useState('')
  const [mode, setMode] = useState<'drafts' | 'confirm' | 'auto'>('confirm')
  const [tog, setTog] = useState<Record<string, boolean>>({ win: true, sound: true, tray: true, remind: true, motion: true, screen: false })
  const t = (k: string, label: string) => <Switch checked={tog[k]} onChange={v => { setTog(s => ({ ...s, [k]: v })); notify('Сохранено') }} label={label} />
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
          <Card><div className="text-[12.5px] text-fg3">Прототип хранит только хэш пароля в браузере. В рабочей версии вход будет привязан к Windows Credential Manager, а токены интеграций шифруются через DPAPI.</div></Card></div>}
        {cat === 'general' && <Card><Row title="Тема" hint="Тёмная по умолчанию"><Tabs value={theme} onChange={() => toggleTheme()} items={[{ id: 'dark', label: 'Тёмная' }, { id: 'light', label: 'Светлая' }]} /></Row><Row title="Уменьшить анимации" hint="Также учитывается системная настройка">{t('motion', 'Анимации')}</Row><Row title="Язык интерфейса"><Badge>Русский</Badge></Row></Card>}
        {cat === 'security' && <div className="space-y-4">
          <Card><div className="mb-2 font-medium">Отправка писем и сообщений</div>
            <div className="space-y-2">{([['drafts', 'Только черновики'], ['confirm', 'Подтверждение каждой отправки'], ['auto', 'Автоматически по правилам']] as const).map(([k, l]) => <label key={k} className="flex cursor-pointer items-center gap-2.5"><input type="radio" checked={mode === k} onChange={() => { setMode(k); notify('Режим изменён') }} className="accent-[var(--accent)]" />{l}</label>)}</div></Card>
          <Card><Row title="Наблюдение за экраном" hint="Только по явному включению, с индикатором">{t('screen', 'Экран')}</Row><Row title="Уровни разрешений" hint="Чтение · Подготовка · Изменение · Внешние действия"><Button size="sm" onClick={() => notify('Политики по инструментам — в рабочей версии')}>Политики</Button></Row></Card></div>}
        {cat === 'notifications' && <Card><Row title="Уведомления Windows">{t('win', 'Windows')}</Row><Row title="Звук">{t('sound', 'Звук')}</Row><Row title="Системный трей">{t('tray', 'Трей')}</Row><Row title="Повторные напоминания">{t('remind', 'Повторы')}</Row></Card>}
        {cat === 'storage' && <div className="space-y-4"><Card><Row title="Selectel S3" hint="Бакет: personal-assistant · ru-1"><Badge tone="ok" dot>Подключено</Badge></Row><Row title="Использовано"><div className="w-40"><Progress value={34} /><div className="mt-1 text-right text-[12px] text-fg3">8.2 из 24 ГБ</div></div></Row><Row title="Проверка соединения"><Button size="sm" onClick={() => notify('Соединение в порядке')}>Проверить</Button></Row></Card></div>}
        {cat === 'updates' && <Updates />}
        {cat === 'memory' && <MemoryPanel />}
        {cat === 'diagnostics' && <Card>{[['Backend', 'работает', 'ok'], ['Ollama', 'работает', 'ok'], ['Qdrant', 'работает', 'ok'], ['SQLite', '124 МБ', 'ok'], ['S3', 'подключено', 'ok'], ['RAM', '18 / 64 ГБ', 'ok'], ['VRAM', '20 / 24 ГБ', 'warn']].map(([k, v, tone]) => <Row key={k} title={k}><Badge tone={tone as 'ok' | 'warn'} dot>{v}</Badge></Row>)}</Card>}
      </div></div>}
    </div>
  )
}
