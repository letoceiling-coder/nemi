import { useState } from 'react'
import { Globe, Play, Download, Table2, Loader2, Check } from 'lucide-react'
import { Page, PageHeader, Card, Button, Input, Badge, Tabs } from '../ui'
import { BrowserView } from '../components/BrowserView'
import { useApp } from '../store'

const rows = [
  ['Мебель-Холдинг', 'mebel-holding.ru', '+7 495 120-45-67', 'info@mebel-holding.ru'],
  ['Фабрика «Орион»', 'orion-mebel.ru', '+7 495 330-12-90', 'sales@orion-mebel.ru'],
  ['Дом Дерева', 'dom-dereva.ru', '+7 499 701-33-08', 'hello@dom-dereva.ru'],
  ['Столярка-М', 'stolyarka-m.ru', '+7 495 555-71-20', 'order@stolyarka-m.ru'],
]
const prog = ['Выполняю поиск', 'Открываю сайты', 'Извлекаю данные', 'Проверяю дубликаты', 'Формирую таблицу']

function DataCollect() {
  const { notify } = useApp()
  const [q, setQ] = useState('Найди компании по производству мебели в Москве')
  const [step, setStep] = useState(-1)
  const go = () => { setStep(0); prog.forEach((_, i) => setTimeout(() => setStep(i + 1), 800 * (i + 1))) }
  const running = step >= 0 && step < prog.length
  return (
    <Page>
      <PageHeader title="Браузер" subtitle="Browser Agent · отдельный профиль автоматизации" actions={<Badge tone="ok" dot>Chrome · профиль «Ассистент»</Badge>} />
      <div className="space-y-4 px-8">
        <div className="flex gap-2"><Input icon={<Globe size={15} />} value={q} onChange={e => setQ(e.target.value)} className="flex-1" /><Button variant="primary" icon={<Play size={14} />} disabled={running} onClick={go}>Выполнить</Button></div>
        <Card className="!p-3 text-[12.5px] text-fg3">CAPTCHA, MFA и защитные механизмы сайтов не обходятся: в таких случаях агент остановится и попросит вас продолжить вручную. Существующий профиль Chrome подключается только после явного разрешения.</Card>
        {step >= 0 && (
          <div className="anim-in grid grid-cols-[220px_1fr] gap-4">
            <Card><ul className="space-y-2">{prog.map((p, i) => <li key={p} className="flex items-center gap-2 text-[13px]">{i < step ? <Check size={14} className="text-ok" /> : i === step ? <Loader2 size={14} className="spin text-accent" /> : <span className="size-3.5 rounded-full border border-line2" />}<span className={i > step ? 'text-fg3' : ''}>{p}</span></li>)}</ul></Card>
            <Card className="!p-0 overflow-hidden">
              <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-[12.5px] text-fg3"><Table2 size={14} />Результат · {step >= prog.length ? rows.length : 0} записи</div>
              {step >= prog.length ? (
                <table className="w-full text-left text-[13px]"><thead className="text-fg3"><tr>{['Компания', 'Сайт', 'Телефон', 'Почта'].map(h => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
                  <tbody>{rows.map(r => <tr key={r[0]} className="border-t border-line">{r.map((c, i) => <td key={i} className={i === 1 ? 'px-3 py-2 text-info' : 'px-3 py-2'}>{c}</td>)}</tr>)}</tbody></table>
              ) : <div className="p-8 text-center text-fg3">Собираю данные…</div>}
              {step >= prog.length && <div className="flex gap-2 border-t border-line p-3"><Button size="sm" icon={<Download size={13} />} onClick={() => notify('Файл Excel сохранён (демо)')}>Экспорт в Excel</Button><Button size="sm" onClick={() => notify('Источники сохранены в базу знаний')}>Сохранить источники</Button></div>}
            </Card>
          </div>
        )}
      </div>
    </Page>
  )
}

export function BrowserPage() {
  const [tab, setTab] = useState<'view' | 'collect'>('view')
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-8 pb-3 pt-6">
        <div><h1 className="text-[22px] font-semibold tracking-tight">Браузер</h1><p className="text-fg3">Встроенный браузер и Browser Agent</p></div>
        <Tabs value={tab} onChange={setTab} items={[{ id: 'view', label: 'Браузер' }, { id: 'collect', label: 'Сбор данных' }]} />
      </div>
      {tab === 'view' ? <div className="mx-8 mb-6 min-h-0 flex-1 overflow-hidden rounded-xl border border-line"><BrowserView /></div> : <div className="min-h-0 flex-1"><DataCollect /></div>}
    </div>
  )
}
