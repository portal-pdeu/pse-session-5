import { useState } from 'react'
import { api, type State } from '../api'

interface Props {
  state: State
  onChanged: () => Promise<void>
}

export default function Modules({ state, onChanged }: Props) {
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState('')

  async function toggle(n: number, released: boolean) {
    setBusy(n)
    setError('')
    try {
      await api.setReleased(n, released)
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <p className="dim small">
        Releasing a module opens it to every player at once: its row turns "released" and its stage zip becomes
        downloadable. Locking it again closes both.
      </p>
      {error && <div className="error">{error}</div>}
      <table className="board">
        <thead>
          <tr>
            <th>#</th>
            <th>Module</th>
            <th>Points</th>
            <th>State</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {state.modules.map((m) => (
            <tr key={m.number}>
              <td>{String(m.number).padStart(2, '0')}</td>
              <td>
                <strong>{m.title}</strong>
              </td>
              <td>{m.points}</td>
              <td>{m.released ? <span className="pillgreen">live</span> : <span className="dim">locked</span>}</td>
              <td>
                {m.released ? (
                  <button className="btn sm" disabled={busy === m.number} onClick={() => void toggle(m.number, false)}>
                    Lock
                  </button>
                ) : (
                  <button className="btn primary sm" disabled={busy === m.number} onClick={() => void toggle(m.number, true)}>
                    Release
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
