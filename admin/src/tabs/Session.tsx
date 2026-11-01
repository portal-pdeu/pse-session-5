import { useState } from 'react'
import { api } from '../api'

export default function Session({ onChanged }: { onChanged: () => Promise<void> }) {
  const [mode, setMode] = useState<'progress' | 'full'>('progress')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function run() {
    if (!window.confirm('Clean the run? This cannot be undone.')) return
    setBusy(true)
    setMsg(null)
    try {
      const r = await api.reset(mode, confirm)
      setMsg({ ok: true, text: `Run cleaned (${r.mode}) - ${r.players} players left` })
      setConfirm('')
      await onChanged()
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Failed' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card cleanup">
      <h3 style={{ marginTop: 0 }}>Session cleanup</h3>
      <p className="dim small">
        Wipe the run so the session can be replayed: every solve and wrong-flag counter is cleared and all modules go
        back to locked.
      </p>
      <div className="row">
        <select value={mode} onChange={(e) => setMode(e.target.value as 'progress' | 'full')}>
          <option value="progress">Clear progress only - keep the players</option>
          <option value="full">Full reset - also delete every player account</option>
        </select>
        <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Type RESET to confirm" style={{ maxWidth: 200 }} />
        <button className="btn danger sm" disabled={busy || confirm.trim().toUpperCase() !== 'RESET'} onClick={() => void run()}>
          {busy ? 'Working…' : 'Clean the run'}
        </button>
      </div>
      {msg && <div className={msg.ok ? 'msgok' : 'msger'} style={{ marginTop: 10 }}>{msg.text}</div>}
    </div>
  )
}
