import { useState, type FormEvent } from 'react'
import { login, type Player } from '../auth'

interface Props {
  onLogin: (player: Player) => void
  error?: string
}

export default function Auth({ onLogin, error }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr('')
    setBusy(true)
    try {
      const player = await login(email, password)
      onLogin(player)
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="authwrap">
      <form className="authcard" onSubmit={submit}>
        <h1>◈ NeonCart Bug Hunt</h1>
        <label>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus />
        <label>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        {(err || error) && <div className="error">{err || error}</div>}
        <button className="btn primary wide" disabled={busy}>
          {busy ? '...' : 'Log in'}
        </button>
      </form>
    </div>
  )
}
