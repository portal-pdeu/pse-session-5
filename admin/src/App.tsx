import { useCallback, useEffect, useState } from 'react'
import { api, type State } from './api'
import Players from './tabs/Players'
import Modules from './tabs/Modules'
import Leaderboard from './tabs/Leaderboard'
import Session from './tabs/Session'

const TABS = [
  { k: 'players', label: 'Players' },
  { k: 'modules', label: 'Modules' },
  { k: 'leaderboard', label: 'Leaderboard' },
  { k: 'session', label: 'Session' },
] as const
type Tab = (typeof TABS)[number]['k']

export default function App() {
  const [tab, setTab] = useState<Tab>('players')
  const [state, setState] = useState<State | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Reads cost database quota, so the panel loads on open and after each action,
  // plus the Refresh button - there is deliberately no background polling.
  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setState(await api.state())
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">◈</span> NeonCart Bug Hunt <span className="tagline">admin</span>
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.k} className={tab === t.k ? 'tab active' : 'tab'} onClick={() => setTab(t.k)}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="me">
          <button className="btn sm" onClick={() => void refresh()} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </header>
      <main className="content">
        {error && <div className="error">{error}</div>}
        {!state && !error && <div className="loading">Loading…</div>}
        {state && tab === 'players' && <Players state={state} onChanged={refresh} />}
        {state && tab === 'modules' && <Modules state={state} onChanged={refresh} />}
        {state && tab === 'leaderboard' && <Leaderboard state={state} />}
        {state && tab === 'session' && <Session onChanged={refresh} />}
      </main>
    </div>
  )
}
