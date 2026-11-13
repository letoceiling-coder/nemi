import { useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'

const KEY = (k: string) => `pai:layout:${k}`

/** Panel width in px, remembered between launches (layout is a per-device preference, not per-account). */
export function usePanelWidth(key: string, def: number, min: number, max: number) {
  const clamp = useCallback((v: number) => Math.round(Math.min(max, Math.max(min, v))), [min, max])
  const [w, setW] = useState(() => {
    try { const v = Number(localStorage.getItem(KEY(key))); return v ? clamp(v) : def } catch { return def }
  })
  const set = useCallback((v: number) => setW(clamp(v)), [clamp])
  const save = useCallback((v: number) => { try { localStorage.setItem(KEY(key), String(clamp(v))) } catch { /* storage off */ } }, [key, clamp])
  const reset = useCallback(() => { setW(def); try { localStorage.removeItem(KEY(key)) } catch { /* storage off */ } }, [key, def])
  return { width: w, set, save, reset }
}

/**
 * Vertical drag handle on a panel edge. `side` is where the panel lies relative to the handle:
 * "left" -> dragging right grows the panel (sidebar); "right" -> dragging left grows it (right panel, browser).
 * Double click restores the default width.
 */
export function Resizer({ side, width, onChange, onCommit, onReset, label }: {
  side: 'left' | 'right'; width: number; onChange: (w: number) => void; onCommit: (w: number) => void; onReset: () => void; label: string
}) {
  const [drag, setDrag] = useState(false)
  const start = useRef({ x: 0, w: 0, last: 0 })

  useEffect(() => {
    if (!drag) return
    const move = (e: PointerEvent) => {
      const dx = e.clientX - start.current.x
      const w = start.current.w + (side === 'left' ? dx : -dx)
      start.current.last = w
      onChange(w)
    }
    const up = () => { setDrag(false); onCommit(start.current.last) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }, [drag, side, onChange, onCommit])

  const key = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 40 : 10
    const d = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
    if (!d) return
    e.preventDefault()
    const w = width + (side === 'left' ? d : -d)
    onChange(w); onCommit(w)
  }

  return (
    <>
      <div role="separator" aria-orientation="vertical" aria-label={label} aria-valuenow={width} tabIndex={0} title={`${label}: потяните, двойной щелчок — по умолчанию`}
        onPointerDown={e => { e.preventDefault(); start.current = { x: e.clientX, w: width, last: width }; setDrag(true) }}
        onDoubleClick={onReset} onKeyDown={key}
        className={clsx('group relative z-20 w-0 shrink-0 cursor-col-resize outline-none', side === 'left' ? '-mr-0' : '-ml-0')}>
        <div className={clsx('absolute inset-y-0 -left-[3px] w-[6px] transition-colors', drag ? 'bg-accent/60' : 'group-hover:bg-accent/40 group-focus-visible:bg-accent/60')} />
      </div>
      {/* while dragging: catch the pointer above iframes (the built-in browser) and keep the cursor */}
      {drag && <div className="fixed inset-0 z-[100] cursor-col-resize select-none" />}
    </>
  )
}
