import { useState } from 'react'
import type { AddEntry, AddResult } from '../../server/types.ts'
import { api, type State } from '../api'

interface Props {
  state: State
  onChanged: () => Promise<void>
}

const CHUNK = 10
const MAX_WRONG = 3 // matches MAX_WRONG_PER_FLAG in the Function

// one line per player: "email,password". The password is everything after the
// first comma, so it may itself contain commas. A line without one is sent on
// with an empty password and comes back with a clear error.
function parseLines(text: string): AddEntry[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [email, ...rest] = l.split(',')
      return { email: email.trim(), password: rest.join(',').trim() }
    })
}

function AddPlayers({ onChanged }: { onChanged: () => Promise<void> }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [results, setResults] = useState<AddResult[]>([])
  const [error, setError] = useState('')

  async function add() {
    const entries = parseLines(text)
    if (!entries.length) return
    setBusy(true)
    setError('')
    setResults([])
    const done: AddResult[] = []
    try {
      for (let i = 0; i < entries.length; i += CHUNK) {
        setProgress(`Creating ${Math.min(i + CHUNK, entries.length)} / ${entries.length}…`)
        done.push(...(await api.addPlayers(entries.slice(i, i + CHUNK))).results)
        setResults([...done])
      }
      // keep only the lines that failed, so they can be fixed and retried
      const failed = new Set(done.filter((r) => !r.ok).map((r) => r.email))
      setText(entries.filter((e) => failed.has(e.email.toLowerCase())).map((e) => `${e.email},${e.password}`).join('\n'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
      setProgress('')
      await onChanged()
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>Add players</h3>
      <p className="dim small">
        One player per line: <code>email,password</code> (passwords need 8+ characters). Each player gets an account,
        the player label and a personal seed.
      </p>
      <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={'ada@example.com,a-password\ngrace@example.com,another-password'} />
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn primary sm" disabled={busy || !text.trim()} onClick={() => void add()}>
          {busy ? progress || 'Working…' : 'Create accounts'}
        </button>
      </div>
      {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}
      {results.length > 0 && (
        <table className="board" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Email</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.email}>
                <td>{r.email}</td>
                <td className={r.ok ? 'pillgreen' : 'msger'}>{r.ok ? 'created' : r.error}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default function Players({ state, onChanged }: Props) {
  const [error, setError] = useState('')

  async function act(fn: () => Promise<unknown>) {
    setError('')
    try {
      await fn()
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    }
  }

  return (
    <div>
      <AddPlayers onChanged={onChanged} />
      {error && <div className="error">{error}</div>}
      <h3 className="secttitle">{state.players.length} players</h3>
      <table className="board">
        <thead>
          <tr>
            <th>Email</th>
            <th>Seed</th>
            <th>Points</th>
            <th>Wrong flags per module</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {state.players.map((p) => (
            <tr key={p.id}>
              <td>{p.email}</td>
              <td>
                <code title="click to copy" style={{ cursor: 'pointer' }} onClick={() => void navigator.clipboard.writeText(p.seed)}>
                  {p.seed.slice(0, 8)}…
                </code>
              </td>
              <td className="pts">{p.points}</td>
              <td className="dim small">
                {p.wrong.map((w, i) => (
                  <span key={i} style={{ marginRight: 8, color: w >= MAX_WRONG ? 'var(--err)' : undefined }}>
                    {i}:{w}
                  </span>
                ))}
              </td>
              <td>
                <button className="btn sm" onClick={() => void act(() => api.resetAttempts(p.id))}>
                  Reset attempts
                </button>{' '}
                <button
                  className="btn danger sm"
                  onClick={() => {
                    if (window.confirm(`Delete ${p.email} and their progress?`)) void act(() => api.deletePlayer(p.id))
                  }}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {state.players.length === 0 && <div className="loading">No players yet. Add some above.</div>}
    </div>
  )
}
