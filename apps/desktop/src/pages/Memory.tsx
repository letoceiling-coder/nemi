import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { Brain, Plus, Search, Pencil, Trash2, Check, X, Loader2 } from 'lucide-react'
import { useApp } from '../store'
import { Card, Switch, Badge, Button, Input } from '../ui'
import { memoryApi, Fact, FactKind, getAutoMemory, setAutoMemory, ApiError } from '../api'

const KIND: Record<FactKind, string> = { profile: 'О вас', preference: 'Предпочтение', person: 'Человек', project: 'Проект', fact: 'Факт' }
const fmt = (s: string) => new Date(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })

/** Settings → Память: what the assistant remembers about the user. Everything is visible, editable and deletable. */
export function MemoryPanel() {
  const { notify, openConv } = useApp()
  const [facts, setFacts] = useState<Fact[] | null>(null)
  const [q, setQ] = useState('')
  const [auto, setAuto] = useState(getAutoMemory())
  const [draft, setDraft] = useState('')
  const [kind, setKind] = useState<FactKind>('fact')
  const [edit, setEdit] = useState<{ id: string; text: string } | null>(null)
  const [ask, setAsk] = useState<string | null>(null)   // id pending delete, or 'all'
  const [busy, setBusy] = useState(false)

  const load = () => memoryApi.list().then(setFacts).catch(() => setFacts([]))
  useEffect(() => { load() }, [])
  useEffect(() => { if (!ask) return; const t = setTimeout(() => setAsk(null), 3000); return () => clearTimeout(t) }, [ask])

  const err = (e: unknown) => notify(e instanceof ApiError ? e.message : 'Не удалось сохранить')
  const add = async () => {
    if (!draft.trim()) return
    setBusy(true)
    try { const f = await memoryApi.add(draft.trim(), kind); notify(f.new ? 'Запомнено' : 'Такой факт уже есть — обновил'); setDraft(''); load() }
    catch (e) { err(e) } finally { setBusy(false) }
  }
  const save = async (f: Fact) => {
    if (!edit?.text.trim()) return
    try { await memoryApi.edit(f.id, edit.text.trim(), f.kind); setEdit(null); load() } catch (e) { err(e) }
  }
  const del = async (id: string) => {
    if (ask !== id) { setAsk(id); return }
    setAsk(null)
    try { await memoryApi.remove(id); setFacts(fs => fs?.filter(f => f.id !== id) ?? null) } catch (e) { err(e) }
  }
  const clearAll = async () => {
    if (ask !== 'all') { setAsk('all'); return }
    setAsk(null)
    try { const r = await memoryApi.clear(); notify(`Удалено фактов: ${r.deleted}`); load() } catch (e) { err(e) }
  }

  const shown = (facts ?? []).filter(f => !q.trim() || f.text.toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-start justify-between gap-6">
          <div>
            <div>Запоминать из разговоров</div>
            <div className="text-[12.5px] text-fg3">Ассистент сам выделяет устойчивые факты о вас: имя, работа, предпочтения, важные люди и проекты. Пароли, ключи и номера документов не сохраняются никогда. Если разговор шёл через ваш сервер, факты тоже выделяются на нём.</div>
          </div>
          <Switch checked={auto} onChange={v => { setAuto(v); setAutoMemory(v); notify(v ? 'Автопамять включена' : 'Автопамять выключена') }} label="Автопамять" />
        </div>
      </Card>

      <Card>
        <div className="mb-2 font-medium">Добавить вручную</div>
        <div className="flex gap-2">
          <Input icon={null} placeholder="Например: Отвечай коротко, без вступлений" value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add() }} className="flex-1" maxLength={300} />
          <select value={kind} onChange={e => setKind(e.target.value as FactKind)} className="h-9 rounded-lg border border-line bg-surface2 px-2 text-[13px]">
            {(Object.keys(KIND) as FactKind[]).map(k => <option key={k} value={k}>{KIND[k]}</option>)}
          </select>
          <Button variant="primary" icon={busy ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} disabled={busy || !draft.trim()} onClick={add}>Добавить</Button>
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex items-center gap-3">
          <div className="font-medium">Что я помню</div>
          {facts && <Badge>{facts.length}</Badge>}
          <div className="flex-1" />
          {facts && facts.length > 5 && <Input placeholder="Найти" value={q} onChange={e => setQ(e.target.value)} icon={<Search size={14} />} className="w-48" />}
        </div>
        {facts === null ? <div className="flex items-center gap-2 py-6 text-fg3"><Loader2 size={14} className="spin" />Загружаю…</div>
          : !facts.length ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-fg3">
              <Brain size={22} />
              <div>Пока пусто. Расскажите о себе в чате или добавьте факт вручную.</div>
            </div>
          ) : (
            <div className="divide-y divide-line">
              {shown.map(f => (
                <div key={f.id} className="group flex items-start gap-3 py-2.5">
                  <span className="mt-0.5 shrink-0"><Badge>{KIND[f.kind]}</Badge></span>
                  {edit?.id === f.id ? (
                    <div className="flex flex-1 gap-1.5">
                      <Input icon={null} autoFocus value={edit.text} maxLength={300} onChange={e => setEdit({ id: f.id, text: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') save(f); if (e.key === 'Escape') setEdit(null) }} className="flex-1" />
                      <Button size="sm" icon={<Check size={13} />} onClick={() => save(f)}>Сохранить</Button>
                      <Button size="sm" icon={<X size={13} />} onClick={() => setEdit(null)}>Отмена</Button>
                    </div>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px]">{f.text}</div>
                        <div className="text-[12px] text-fg3">
                          {f.source === 'manual' ? 'добавлено вручную' : 'из разговора'} · {fmt(f.updated)}
                          {f.conv_id && <> · <button className="underline-offset-2 hover:text-fg hover:underline" onClick={() => openConv(f.conv_id!)}>открыть диалог</button></>}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        <button title="Изменить" onClick={() => setEdit({ id: f.id, text: f.text })} className="grid size-7 place-items-center rounded-lg text-fg3 hover:bg-surface2 hover:text-fg"><Pencil size={13} /></button>
                        <button title={ask === f.id ? 'Нажмите ещё раз, чтобы удалить' : 'Удалить'} onClick={() => del(f.id)}
                          className={clsx('grid h-7 place-items-center rounded-lg px-1.5 text-[12px]', ask === f.id ? 'bg-err/15 text-err' : 'text-fg3 hover:bg-surface2 hover:text-fg')}>
                          {ask === f.id ? 'Удалить?' : <Trash2 size={13} />}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
              {!shown.length && <div className="py-4 text-center text-fg3">Ничего не найдено</div>}
            </div>
          )}
      </Card>

      {!!facts?.length && (
        <div className="flex items-center justify-between text-[12.5px] text-fg3">
          <span>Память хранится локально в базе приложения и привязана к вашему аккаунту.</span>
          <Button size="sm" onClick={clearAll} className={clsx(ask === 'all' && '!bg-err/15 !text-err')} icon={<Trash2 size={13} />}>
            {ask === 'all' ? 'Нажмите ещё раз — удалить всё' : 'Очистить память'}
          </Button>
        </div>
      )}
    </div>
  )
}
