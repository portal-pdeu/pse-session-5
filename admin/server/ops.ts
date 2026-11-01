import crypto from 'node:crypto'
import type { AddEntry, AddResult, Backend, ModuleRow, PlayerRow } from './types.ts'

// What the admin panel can do. Each operation is plain logic over a Backend, so
// it is the same code against the live Appwrite project and in the tests.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD = 8

export class OpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const newSeed = () => crypto.randomBytes(16).toString('hex')

const zeros = (n: number) => Array.from({ length: n }, () => 0)

// ---- reading ----------------------------------------------------------------

// Players ranked the way the old leaderboard did: points, then whoever reached
// their score first, then email.
export function rank(players: PlayerRow[]): (PlayerRow & { rank: number })[] {
  return [...players]
    .sort(
      (a, b) =>
        b.points - a.points ||
        (a.last_solve_at ?? '9').localeCompare(b.last_solve_at ?? '9') ||
        a.email.localeCompare(b.email),
    )
    .map((p, i) => ({ ...p, rank: i + 1 }))
}

export async function getState(backend: Backend) {
  const [modules, players] = await Promise.all([backend.listModules(), backend.listPlayers()])
  return {
    modules: [...modules].sort((a, b) => a.number - b.number),
    players: rank(players),
  }
}

// ---- players ----------------------------------------------------------------

// Creates the account, gives it the `player` label and creates its seed row.
// If any step fails, what was already created is removed again, so a half-made
// player never exists.
export async function addPlayer(backend: Backend, entry: AddEntry, moduleCount: number): Promise<AddResult> {
  const email = String(entry.email || '').trim().toLowerCase()
  if (!EMAIL_RE.test(email)) return { email, ok: false, error: 'Not a valid email' }
  const password = String(entry.password ?? '')
  if (!password) return { email, ok: false, error: 'Add a password: email,password' }
  if (password.length < MIN_PASSWORD) return { email, ok: false, error: `Password must be at least ${MIN_PASSWORD} characters` }

  let userId: string | null = null
  try {
    userId = (await backend.createUser(email, password)).id
    await backend.addPlayerLabel(userId)
    await backend.createPlayerRow(userId, {
      email,
      seed: newSeed(),
      points: 0,
      solved: 0,
      wrong: zeros(moduleCount),
      last_solve_at: null,
    })
    return { email, ok: true }
  } catch (err) {
    if (userId) await backend.deleteUser(userId).catch(() => {})
    const e = err as { type?: string; message?: string }
    return {
      email,
      ok: false,
      error: e.type === 'user_already_exists' ? 'An account with this email already exists' : e.message || 'Failed',
    }
  }
}

export async function addPlayers(backend: Backend, entries: AddEntry[]): Promise<AddResult[]> {
  if (!entries.length) throw new OpError(400, 'Nothing to add')
  if (entries.length > 50) throw new OpError(400, 'Add at most 50 players per request')
  const moduleCount = (await backend.listModules()).length
  const results: AddResult[] = []
  // one at a time: the Free plan rate-limits bursts of account creation
  for (const entry of entries) results.push(await addPlayer(backend, entry, moduleCount))
  return results
}

export async function deletePlayer(backend: Backend, id: string) {
  await backend.deleteSolvesFor(id)
  await backend.deletePlayerRow(id)
  await backend.deleteUser(id)
}

// Gives a player their wrong-flag attempts back: one module, or all of them.
export async function resetAttempts(backend: Backend, id: string, module?: number | null) {
  const player = (await backend.listPlayers()).find((p) => p.id === id)
  if (!player) throw new OpError(404, 'No such player')
  const wrong = [...player.wrong]
  if (module === undefined || module === null) {
    wrong.fill(0)
  } else {
    if (!Number.isInteger(module) || module < 0 || module >= wrong.length) throw new OpError(400, 'No such module')
    wrong[module] = 0
  }
  await backend.updatePlayer(id, { wrong })
}

// ---- modules ----------------------------------------------------------------

export async function setReleased(backend: Backend, n: number, released: boolean): Promise<ModuleRow[]> {
  const modules = await backend.listModules()
  if (!modules.some((m) => m.number === n)) throw new OpError(404, 'No such module')
  await backend.setModuleReleased(n, released)
  return backend.listModules()
}

// ---- session ----------------------------------------------------------------

//   progress  every solve and counter cleared, modules locked again; players stay
//   full      the same, and every player account is deleted too
export async function resetRun(backend: Backend, mode: 'progress' | 'full', confirm: string) {
  if (String(confirm).trim().toUpperCase() !== 'RESET') throw new OpError(400, 'Type RESET to confirm')
  const modules = await backend.listModules()

  await backend.deleteAllSolves()
  for (const m of modules) await backend.setModuleReleased(m.number, false)

  if (mode === 'full') {
    await backend.deleteAllPlayerRows()
    // only accounts carrying the player label; nothing else is touched
    for (const u of await backend.listPlayerUsers()) await backend.deleteUser(u.id)
  } else {
    for (const p of await backend.listPlayers()) {
      await backend.updatePlayer(p.id, { points: 0, solved: 0, last_solve_at: null, wrong: zeros(modules.length) })
    }
  }
  return { mode, players: (await backend.listPlayers()).length }
}
