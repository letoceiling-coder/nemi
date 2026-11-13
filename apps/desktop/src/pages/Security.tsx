import { useEffect, useState } from 'react'
import { Globe, Loader2 } from 'lucide-react'
import { Card, Badge, Button } from '../ui'
import { useApp } from '../store'
import { archiveApi, ToolInfo } from '../archive'

const RISK: Record<ToolInfo['risk'], [string, 'ok' | 'info' | 'warn', string]> = {
  read: ['Чтение', 'ok', 'Только смотрит данные, ничего не меняет'],
  write: ['Изменение', 'info', 'Создаёт и меняет задачи, события, память — сразу, каждое действие в журнале'],
  confirm: ['С подтверждением', 'warn', 'Удаление и действия вовне — только после вашего «Разрешить»'],
}

/** Settings → Безопасность: the real permission level of every assistant tool, straight from the server's registry. */
export function SecurityPanel() {
  const { go, setSettingsCat } = useApp()
  const [tools, setTools] = useState<ToolInfo[] | null>(null)
  useEffect(() => { archiveApi.tools().then(setTools).catch(() => setTools([])) }, [])
  const offline = tools?.some(t => t.cloud && !t.enabled)
  return (
    <div className="space-y-4">
      <Card className="space-y-2 text-[13px] text-fg2">
        <div className="font-medium text-fg">Как ассистент действует</div>
        {(['read', 'write', 'confirm'] as const).map(r => <div key={r} className="flex items-center gap-3"><Badge tone={RISK[r][1]}>{RISK[r][0]}</Badge><span>{RISK[r][2]}</span></div>)}
        <div>Все действия записываются в <button className="text-accent hover:underline" onClick={() => go('activity')}>Центр активности</button> и хранятся бессрочно. Кнопка «Стоп» вверху мгновенно останавливает ассистента.</div>
        <div className="flex items-center justify-between gap-4 border-t border-line pt-2">
          <span>{offline ? 'Включён режим «Только мой сервер»: интернет-инструменты отключены, данные не уходят в облако.' : 'Инструменты с пометкой «интернет» обращаются к внешним сайтам. Их можно отключить режимом «Только мой сервер».'}</span>
          <div className="shrink-0 whitespace-nowrap"><Button size="sm" onClick={() => { setSettingsCat('models'); go('settings') }}>Модели AI</Button></div>
        </div>
      </Card>
      <Card>
        <div className="mb-2 font-medium">Инструменты ассистента ({tools?.length ?? '…'})</div>
        {!tools && <div className="flex items-center gap-2 text-fg3"><Loader2 size={14} className="spin" />Загружаю…</div>}
        <div className="divide-y divide-line">
          {tools?.map(t => (
            <div key={t.name} className={`flex items-center gap-3 py-2 ${t.enabled ? '' : 'opacity-50'}`}>
              <div className="min-w-0 flex-1"><div className="text-[13px]">{t.description}</div><div className="font-mono text-[11.5px] text-fg3">{t.name}</div></div>
              {t.cloud && <span title="Обращается к интернету" className="flex items-center gap-1 text-[11.5px] text-fg3"><Globe size={12} />интернет</span>}
              {!t.enabled && <Badge>выключен</Badge>}
              <Badge tone={RISK[t.risk][1]}>{RISK[t.risk][0]}</Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
