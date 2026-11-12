import clsx from 'clsx'
import { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, useState } from 'react'
import { Search, Inbox } from 'lucide-react'

type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'err' | 'info'
const toneCls: Record<Tone, string> = {
  neutral: 'bg-surface3 text-fg2',
  accent: 'bg-accentsoft text-accent',
  ok: 'bg-ok/15 text-ok',
  warn: 'bg-warn/15 text-warn',
  err: 'bg-err/15 text-err',
  info: 'bg-info/15 text-info',
}

export function Badge({ tone = 'neutral', children, dot }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap', toneCls[tone])}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

export function Button({
  variant = 'secondary', size = 'md', icon, children, className, ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md'; icon?: ReactNode }) {
  return (
    <button
      {...p}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none select-none',
        size === 'sm' ? 'h-7 px-2.5 text-[12.5px]' : 'h-9 px-3.5 text-[13.5px]',
        variant === 'primary' && 'bg-accent text-accentfg hover:brightness-110',
        variant === 'secondary' && 'bg-surface2 border border-line hover:bg-surface3',
        variant === 'ghost' && 'text-fg2 hover:bg-surface2 hover:text-fg',
        variant === 'danger' && 'bg-err/15 text-err hover:bg-err/25',
        className,
      )}
    >
      {icon}{children}
    </button>
  )
}

export function IconButton({ children, label, active, className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button {...p} title={label} aria-label={label}
      className={clsx('grid size-8 place-items-center rounded-lg text-fg2 transition-colors hover:bg-surface2 hover:text-fg disabled:opacity-40', active && 'bg-surface2 text-fg', className)}>
      {children}
    </button>
  )
}

export function Card({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={clsx('rounded-xl border border-transparent bg-surface p-4', onClick && 'cursor-pointer transition-colors hover:border-line2 hover:bg-surface2', className)}>
      {children}
    </div>
  )
}

export function Input({ icon, className, ...p }: InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode }) {
  return (
    <label className={clsx('flex h-9 items-center gap-2 rounded-lg border border-transparent bg-surface2 px-3 text-fg2 focus-within:border-accent', className)}>
      {icon === undefined ? <Search size={15} /> : icon /* pass icon={null} for a plain field */}
      <input {...p} className="w-full bg-transparent text-[13.5px] text-fg outline-none placeholder:text-fg3" />
    </label>
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={clsx('relative h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-surface3')}>
      <span className={clsx('absolute top-0.5 size-4 rounded-full bg-white transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
    </button>
  )
}

export function Progress({ value, tone = 'accent' }: { value: number; tone?: 'accent' | 'ok' | 'warn' | 'err' }) {
  const c = { accent: 'bg-accent', ok: 'bg-ok', warn: 'bg-warn', err: 'bg-err' }[tone]
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface3">
      <div className={clsx('h-full rounded-full transition-all', c)} style={{ width: `${value}%` }} />
    </div>
  )
}

export function Tabs<T extends string>({ items, value, onChange }: { items: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex gap-0.5 rounded-lg bg-surface2 p-0.5">
      {items.map(i => (
        <button key={i.id} onClick={() => onChange(i.id)}
          className={clsx('rounded-md px-3 py-1 text-[13px] font-medium transition-colors', value === i.id ? 'bg-surface3 text-fg' : 'text-fg2 hover:text-fg')}>
          {i.label}{i.count !== undefined && <span className="ml-1.5 text-fg3">{i.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const initials = name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase()
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360
  return (
    <span className="grid shrink-0 place-items-center rounded-full font-medium text-white" style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${hue} 35% 42%)` }}>
      {initials}
    </span>
  )
}

export function Empty({ title, hint, action }: { title: string; hint: string; action?: ReactNode }) {
  return (
    <div className="grid place-items-center py-16 text-center">
      <div>
        <div className="mx-auto mb-3 grid size-10 place-items-center rounded-xl bg-surface2 text-fg3"><Inbox size={18} /></div>
        <div className="font-medium">{title}</div>
        <div className="mx-auto mt-1 max-w-xs text-fg3">{hint}</div>
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 px-8 pb-5 pt-7">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-fg3">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  )
}

export function Page({ children }: { children: ReactNode }) {
  return <div className="anim-in mx-auto h-full w-full max-w-[1100px] overflow-y-auto pb-10">{children}</div>
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[12px] font-medium uppercase tracking-wider text-fg3">{title}</h3>{right}
      </div>
      {children}
    </section>
  )
}

export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="anim-in w-full max-w-md rounded-2xl border border-line bg-surface p-5" style={{ boxShadow: 'var(--shadow)' }} onClick={e => e.stopPropagation()}>
        <h2 className="mb-3 text-[16px] font-semibold">{title}</h2>
        <div>{children}</div>
        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  )
}

export function useToggle(init = false) {
  const [v, set] = useState(init)
  return [v, () => set(x => !x), set] as const
}

export const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="rounded border border-line bg-surface2 px-1.5 py-px font-mono text-[11px] text-fg3">{children}</kbd>
)
