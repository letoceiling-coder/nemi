import { useState } from 'react'
import { Lock, Mail, User as UserIcon, ShieldCheck } from 'lucide-react'
import { useApp } from '../store'
import { api, ApiError, setSession } from '../api'
import { Button, Input, Tabs } from '../ui'

export function Auth() {
  const { setAuthed } = useApp()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [name, setName] = useState(''); const [login, setLogin] = useState('')
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('')
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)

  const submit = async () => {
    setErr('')
    if (mode === 'signup') {
      if (!name.trim()) return setErr('Укажите имя')
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErr('Укажите корректную почту — это ваш логин')
      if (pw.length < 8) return setErr('Пароль — не короче 8 символов')
      if (pw !== pw2) return setErr('Пароли не совпадают')
    }
    setBusy(true)
    try {
      const r = mode === 'login' ? await api.login(login, pw) : await api.register(name.trim(), email.trim(), pw)
      setSession(r.token, r.user); setAuthed(true)
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Ошибка входа'); setPw('') }
    finally { setBusy(false) }
  }

  return (
    <div className="grid h-full place-items-center overflow-y-auto bg-bg px-4 py-8">
      <div className="anim-in w-full max-w-[380px]">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-accent text-[20px] font-bold text-accentfg">Ф</div>
          <h1 className="text-[22px] font-semibold tracking-tight">{mode === 'login' ? 'Вход в Фокус' : 'Создать аккаунт'}</h1>
          <p className="mt-1 text-fg3">{mode === 'login' ? 'Введите почту и пароль' : 'Данные аккаунта хранятся только на этом компьютере'}</p>
        </div>
        <div className="mb-3 flex justify-center"><Tabs value={mode} onChange={m => { setMode(m); setErr('') }} items={[{ id: 'login', label: 'Вход' }, { id: 'signup', label: 'Регистрация' }]} /></div>
        <form onSubmit={e => { e.preventDefault(); submit() }} className="space-y-2.5 rounded-2xl bg-surface p-5">
          {mode === 'signup' ? <>
            <Input icon={<UserIcon size={15} />} placeholder="Имя" value={name} onChange={e => setName(e.target.value)} autoFocus autoComplete="name" />
            <Input icon={<Mail size={15} />} placeholder="Эл. почта" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
          </> : <Input icon={<Mail size={15} />} placeholder="Почта или имя" value={login} onChange={e => setLogin(e.target.value)} autoFocus autoComplete="username" />}
          <Input icon={<Lock size={15} />} type="password" placeholder="Пароль" value={pw} onChange={e => setPw(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          {mode === 'signup' && <Input icon={<Lock size={15} />} type="password" placeholder="Повторите пароль" value={pw2} onChange={e => setPw2(e.target.value)} autoComplete="new-password" />}
          {err && <div role="alert" className="text-[13px] text-err">{err}</div>}
          <Button type="submit" variant="primary" className="w-full" disabled={busy || !pw}>{busy ? 'Проверяю…' : mode === 'login' ? 'Войти' : 'Создать и войти'}</Button>
        </form>
        <div className="mt-4 flex items-start gap-2 text-[12px] text-fg3"><ShieldCheck size={14} className="mt-0.5 shrink-0" /><span>Пароль хранится только в виде хэша (scrypt). Данные каждого аккаунта изолированы друг от друга.</span></div>
      </div>
    </div>
  )
}
