import { useEffect, useState } from 'react'
import { getCurrentPlayer, logout, type Player } from './auth'
import Auth from './components/Auth'
import Modules from './components/Modules'

// Restores the Appwrite session on page load. `loading` keeps the login form
// from flashing at someone who is already signed in.
function useMe() {
  const [me, setMe] = useState<Player | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    getCurrentPlayer()
      .then(setMe)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])
  return { me, setMe, loading, error }
}

export default function App() {
  const { me, setMe, loading, error } = useMe()

  if (loading) return <div className="loading">Loading…</div>
  if (!me) return <Auth error={error} onLogin={setMe} />

  // Accounts are made by the admin with the `player` label. Anything else
  // (including the admin, who uses the local admin panel) gets no portal.
  if (!me.is_player) {
    return (
      <div className="authwrap">
        <div className="authcard">
          <h1>◈ NeonCart Bug Hunt</h1>
          <div className="error">This account has no access. Ask an admin to create your account.</div>
          <button className="btn wide" onClick={() => logout().finally(() => setMe(null))}>
            Log out
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">◈</span> NeonCart Bug Hunt
          <span className="tagline">the AI agents shipped it — you break it</span>
        </div>
        <div className="me">
          <span className="username">{me.email}</span>
          <button className="btn ghost" onClick={() => logout().finally(() => setMe(null))}>
            Log out
          </button>
        </div>
      </header>
      <main className="content">
        <Modules player={me} />
      </main>
      <footer className="footer">Play individually. Flags are unique per player. Be excellent to each other.</footer>
    </div>
  )
}
