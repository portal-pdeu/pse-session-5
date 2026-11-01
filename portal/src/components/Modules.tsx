import { useCallback, useEffect, useRef, useState } from 'react'
import { downloadStage, loadMe, loadModuleReleased, loadReleased, loadSolved, MAX_WRONG, submitFlag, type Me } from '../data'
import { MODULES, type StaticModule } from '../modules'
import { isFlagShape, sanitizeFlag } from '../flag'
import type { Player } from '../auth'

// One cooldown shared by every card's Refresh status button, so clicking around
// different modules is no faster than clicking one. Each refresh is a database
// read, and the Free plan has a monthly read limit.
const REFRESH_COOLDOWN_MS = 10_000

// whole seconds left until `until` (a timestamp), ticking once a second while it counts down
function useSecondsLeft(until: number): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (until <= Date.now()) return
    setNow(Date.now())
    const t = setInterval(() => {
      setNow(Date.now())
      if (Date.now() >= until) clearInterval(t)
    }, 500)
    return () => clearInterval(t)
  }, [until])
  return Math.max(0, Math.ceil((until - now) / 1000))
}

interface CardProps {
  m: StaticModule
  released: boolean
  me: Me
  solved: boolean
  onSubmitted: () => Promise<void>
  // re-reads this module's released flag; resolves to the fresh value
  onRefresh: (module: number) => Promise<boolean>
  // timestamp until which Refresh status is cooling down (shared by all cards)
  refreshCoolUntil: number
  // true while any card's refresh is in flight - only one runs at a time
  refreshing: boolean
}

function ModuleCard({ m, released, me, solved, onSubmitted, onRefresh, refreshCoolUntil, refreshing }: CardProps) {
  const coolLeft = useSecondsLeft(refreshCoolUntil)
  const [flag, setFlag] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const attemptsLeft = Math.max(0, MAX_WRONG - (me.wrong[m.number] ?? 0))
  const state = solved ? 'solved' : released ? 'unlocked' : 'locked'
  const label = solved ? 'SOLVED' : released ? 'OPEN' : 'LOCKED'

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setMsg(null)
    try {
      await fn()
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Something went wrong' })
    } finally {
      setBusy(false)
    }
  }

  // `run` calls this synchronously from the click, so the browser's "Save as"
  // dialog (opened first thing inside downloadStage) is still allowed to open.
  const download = () =>
    run(async () => {
      if (await downloadStage(m.number)) setMsg({ ok: true, text: 'Saved.' })
    })

  const refreshStatus = () =>
    run(async () => {
      const nowOpen = await onRefresh(m.number)
      setMsg(nowOpen ? { ok: true, text: 'This module is now open.' } : { ok: false, text: 'Still locked.' })
    })

  const submit = () =>
    run(async () => {
      // Anything that is not shaped like a flag is turned away here: no request
      // is made, so it neither costs one of the player's tries nor a read.
      if (!isFlagShape(flag)) {
        setMsg({ ok: false, text: 'That is not a flag. A flag looks like FLAG{xxxxxxxxxx}.' })
        return
      }
      const r = await submitFlag(m.number, sanitizeFlag(flag))
      if (r.kind === 'correct') {
        setFlag('')
        setMsg({ ok: true, text: `Correct! +${r.points} points` })
        await onSubmitted()
      } else if (r.kind === 'wrong') {
        setMsg({ ok: false, text: r.attemptsLeft === null ? r.message : `${r.message} - ${r.attemptsLeft} ${r.attemptsLeft === 1 ? 'try' : 'tries'} left` })
        await onSubmitted()
      } else {
        setMsg({ ok: false, text: r.message })
      }
    })

  return (
    <div className={`card module ${state} flagged`}>
      <div className="cardhead">
        <span className="num">{String(m.number).padStart(2, '0')}</span>
        <div className="titlebox">
          <h3>
            {m.title} <span className="fpill">flag · {m.points} pts</span>
          </h3>
          <p className="desc">{m.description}</p>
        </div>
        <span className={`status ${state}`}>{label}</span>
      </div>
      <div className="cardfoot">
        {released && !solved && attemptsLeft > 0 && (
          <form
            className="subrow"
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
          >
            <input value={flag} onChange={(e) => setFlag(e.target.value)} placeholder="FLAG{..........}" className="flaginput" />
            <button className="btn primary" disabled={busy || !flag.trim()}>
              Submit
            </button>
          </form>
        )}
        {released && !solved && attemptsLeft === 0 && (
          <div className="msger">No tries left on this module - ask an admin to reset your attempts.</div>
        )}
        {solved && <div className="solvedline">You solved this. Good hunting.</div>}
        <div className="actions">
          {/* nothing left to do with the code once the flag is captured or the tries are used up */}
          {!solved && attemptsLeft > 0 && (
            <button className="btn" disabled={busy || !released} onClick={() => void download()}>
              Download snapshot
            </button>
          )}
          {!released && (
            <button className="btn" disabled={busy || refreshing || coolLeft > 0} onClick={() => void refreshStatus()}>
              {refreshing ? 'Refreshing…' : coolLeft > 0 ? `Refresh status (${coolLeft}s)` : 'Refresh status'}
            </button>
          )}
        </div>
        {msg && <div className={msg.ok ? 'msgok' : 'msger'}>{msg.text}</div>}
      </div>
    </div>
  )
}

export default function Modules({ player }: { player: Player }) {
  const [released, setReleased] = useState<Set<number> | null>(null)
  const [me, setMe] = useState<Me | null | undefined>(undefined) // undefined: still loading
  const [solved, setSolved] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')
  const [refreshCoolUntil, setRefreshCoolUntil] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  // the ref answers instantly, even for a second click before React re-renders
  const refreshLock = useRef(false)
  const [copied, setCopied] = useState<'seed' | 'command' | null>(null)

  const refreshProgress = useCallback(async () => {
    const [m, s] = await Promise.all([loadMe(player.id), loadSolved()])
    setMe(m)
    setSolved(s)
  }, [player.id])

  // Loaded once per page load. A release from the admin shows up when the
  // player refreshes the page; there is no live connection or polling.
  useEffect(() => {
    Promise.all([loadReleased(), refreshProgress()])
      .then(([open]) => setReleased(open))
      .catch((e: Error) => setError(e.message))
  }, [refreshProgress])

  async function refreshOne(module: number): Promise<boolean> {
    // one refresh at a time, whichever card it came from
    if (refreshLock.current) return released?.has(module) ?? false
    refreshLock.current = true
    setRefreshing(true)
    // the cooldown starts before the read, so a failed attempt cools down too
    setRefreshCoolUntil(Date.now() + REFRESH_COOLDOWN_MS)
    try {
      const open = await loadModuleReleased(module)
      setReleased((cur) => {
        const next = new Set(cur ?? [])
        if (open) next.add(module)
        else next.delete(module)
        return next
      })
      return open
    } finally {
      refreshLock.current = false
      setRefreshing(false)
    }
  }

  function copy(what: 'seed' | 'command', text: string) {
    void navigator.clipboard.writeText(text)
    setCopied(what)
    setTimeout(() => setCopied(null), 1500)
  }

  if (error) return <div className="error">{error}</div>
  if (!released || me === undefined) return <div className="loading">Loading modules…</div>
  if (me === null) return <div className="error">Your account is not fully set up yet - ask an admin.</div>

  const command = `PLAYER_SEED=${me.seed} node server.js`

  return (
    <div>
      <div className="statrow">
        <div className="stat">
          <span className="big">{me.points}</span> points
        </div>
        <div className="stat">
          <span className="big">
            {solved.size}/{MODULES.length}
          </span>{' '}
          flags captured
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="small dim">Your seed - keep it private</div>
        <div className="row" style={{ marginTop: 8 }}>
          <code style={{ fontSize: 14 }}>{me.seed}</code>
          <button className="btn sm" onClick={() => copy('seed', me.seed)}>
            {copied === 'seed' ? 'Copied' : 'Copy seed'}
          </button>
        </div>
        <div className="small dim" style={{ marginTop: 14 }}>Run the app you download with</div>
        <div className="row" style={{ marginTop: 8 }}>
          <code style={{ fontSize: 14 }}>{command}</code>
          <button className="btn primary sm" onClick={() => copy('command', command)}>
            {copied === 'command' ? 'Copied' : 'Copy command'}
          </button>
        </div>
      </div>

      {MODULES.map((m) => (
        <ModuleCard key={m.number} m={m} released={released.has(m.number)} me={me} solved={solved.has(m.number)} onSubmitted={refreshProgress} onRefresh={refreshOne} refreshCoolUntil={refreshCoolUntil} refreshing={refreshing} />
      ))}
    </div>
  )
}
