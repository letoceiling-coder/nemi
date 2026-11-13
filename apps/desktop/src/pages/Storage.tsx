import { useEffect, useState } from 'react'
import { Loader2, ShieldCheck, RotateCcw, CloudUpload, AlertTriangle } from 'lucide-react'
import { Card, Badge, Button, Modal } from '../ui'
import { useApp } from '../store'
import { archiveApi, Backups, Usage, fmtSize, fmtAt } from '../archive'
import { errText } from '../tasks'

const FOLDER_RU: Record<string, string> = { backups: 'Резервные копии', documents: 'Документы', recordings: 'Записи встреч', transcripts: 'Расшифровки',
  reports: 'Отчёты', attachments: 'Вложения', knowledge: 'База знаний', exports: 'Выгрузки', projects: 'Проекты', meetings: 'Встречи', personal: 'Личное' }

/** Settings → Хранилище S3: real usage of the bucket and the daily database backups (make one now, restore one). */
export function StoragePanel() {
  const { notify } = useApp()
  const [u, setU] = useState<Usage | null>(null)
  const [b, setB] = useState<Backups | null>(null)
  const [busy, setBusy] = useState(false)
  const [restore, setRestore] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)
  const load = () => { archiveApi.usage().then(setU).catch(() => {}); archiveApi.backups().then(setB).catch(() => {}) }
  useEffect(() => { load() }, [])

  const now = async () => {
    setBusy(true)
    try { const r = await archiveApi.backupNow(); notify(`Резервная копия сохранена в S3 · ${fmtSize(r.size)}`); load() }
    catch (e) { notify(errText(e)); load() } finally { setBusy(false) }
  }
  const doRestore = async () => {
    if (!restore) return
    setRestoring(true)
    try {
      await archiveApi.restore(restore)
      notify('Копия проверена. NEMI перезапустится и откроется с восстановленными данными')
      setTimeout(async () => {
        try { const p = await import('@tauri-apps/plugin-process'); await p.relaunch() } catch { location.reload() }
      }, 1500)
    } catch (e) { notify(errText(e)); setRestoring(false) }
  }
  const lastOk = b?.last_ok
  const failed = b?.last && !b.last.ok ? b.last : null
  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <div><div className="font-medium">Selectel S3</div><div className="text-[12.5px] text-fg3">{u ? `бакет ${u.bucket} · приватный` : 'Проверяю…'}</div></div>
          {u && (u.ok ? <Badge tone="ok" dot>Подключено</Badge> : <Badge tone="err" dot>{u.error ?? 'нет связи'}</Badge>)}
        </div>
        {u?.ok && <>
          <div className="mb-2 text-[13px]">Занято: <b>{fmtSize(u.total ?? 0)}</b> · файлов: {u.count}</div>
          <div className="space-y-1">
            {Object.entries(u.folders ?? {}).sort((a, z) => z[1].size - a[1].size).map(([k, v]) => (
              <div key={k} className="flex justify-between text-[12.5px] text-fg2"><span>{FOLDER_RU[k] ?? k}</span><span>{fmtSize(v.size)} · {v.count}</span></div>
            ))}
            {!Object.keys(u.folders ?? {}).length && <div className="text-[12.5px] text-fg3">Файлов пока нет</div>}
          </div>
        </>}
        {!u && <div className="flex items-center gap-2 text-fg3"><Loader2 size={14} className="spin" />Считаю…</div>}
      </Card>

      <Card>
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 font-medium"><ShieldCheck size={16} className={lastOk ? 'text-ok' : 'text-warn'} />Резервные копии</div>
            <div className="text-[12.5px] text-fg3">Вся база NEMI (диалоги, задачи, календарь, память, журнал) копируется в S3 раз в сутки. Хранятся последние {b?.keep_recent ?? 30} копий и первая копия каждого месяца — бессрочно.</div>
          </div>
          <div className="shrink-0 whitespace-nowrap"><Button size="sm" variant="primary" disabled={busy} icon={busy ? <Loader2 size={13} className="spin" /> : <CloudUpload size={13} />} onClick={now}>Сделать копию сейчас</Button></div>
        </div>
        <div className="mb-2 text-[13px]">{lastOk ? <>Последняя успешная: <b>{fmtAt(lastOk.at)}</b> · {fmtSize(lastOk.size)}</> : 'Копий ещё не было — первая будет сделана автоматически через пару минут после запуска.'}</div>
        {failed && <div className="mb-2 flex items-center gap-2 rounded-lg bg-err/10 px-3 py-2 text-[12.5px] text-err"><AlertTriangle size={14} />Последняя попытка {fmtAt(failed.at)}: {failed.error}</div>}
        {b?.error && <div className="mb-2 text-[12.5px] text-err">Список копий недоступен: {b.error}</div>}
        {b?.restore_pending && <div className="mb-2 text-[12.5px] text-warn">Восстановление подготовлено — перезапустите NEMI.</div>}
        {!!b?.items.length && (
          <div className="max-h-56 space-y-1 overflow-y-auto border-t border-line pt-2">
            {b.items.map(i => (
              <div key={i.key} className="flex items-center gap-3 text-[12.5px]">
                <span className="flex-1">{new Date(i.at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                <span className="text-fg3">{fmtSize(i.size)}</span>
                <button onClick={() => setRestore(i.key)} className="flex items-center gap-1 text-fg3 hover:text-fg"><RotateCcw size={12} />Восстановить</button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={!!restore} onClose={() => !restoring && setRestore(null)} title="Восстановить из копии?" footer={<>
        <Button onClick={() => setRestore(null)} disabled={restoring}>Отмена</Button>
        <Button variant="danger" onClick={doRestore} disabled={restoring}>{restoring ? 'Проверяю копию…' : 'Восстановить и перезапустить'}</Button></>}>
        <p className="text-fg2">Данные NEMI станут такими, какими были на момент копии{restore && b?.items.find(i => i.key === restore) ? ` (${new Date(b.items.find(i => i.key === restore)!.at).toLocaleString('ru-RU')})` : ''}. Всё, что появилось позже, пропадёт из приложения.</p>
        <p className="mt-2 text-[12.5px] text-fg3">Текущая база не удаляется: она сохраняется рядом с именем «app.db.before-restore-…», её можно вернуть. Копия проверяется на целостность до замены.</p>
      </Modal>
    </div>
  )
}
