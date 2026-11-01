import crypto from 'node:crypto'
import { deriveFlag, normalizeFlag, FLAG_SHAPE } from './flags.js'

// The Function has one job: check a submitted flag. Everything else (adding
// players, releasing modules, resets) is done from the local admin panel with
// the server API key.
//
// It talks to Appwrite through a `store` object (see store.js), so the same
// code runs against the real project in production and an in-memory fake in
// the tests.

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message)
    this.status = status
    this.extra = extra
  }
}

const isConflict = (err) => err?.code === 409

// Row ids are capped at 36 characters, so a very long user id is hashed.
export function solveRowId(userId, moduleNumber) {
  const id = userId.length <= 32 ? userId : crypto.createHash('sha256').update(userId).digest('hex').slice(0, 32)
  return `${id}_m${moduleNumber}`
}

// one counter per module, always the right length
function counters(raw, count) {
  const out = Array.isArray(raw) ? raw.slice(0, count) : []
  while (out.length < count) out.push(0)
  return out
}

// user: { id, labels }   body: { module, flag }
export async function submitFlag({ store, salts, maxWrong, now = Date.now }, user, body) {
  if (!user.labels.includes('player')) throw new HttpError(403, 'This account is not a player')

  const n = Number(body?.module)
  if (!Number.isInteger(n) || !Object.prototype.hasOwnProperty.call(salts, n)) {
    throw new HttpError(400, 'No such module')
  }
  const flag = normalizeFlag(body?.flag)
  if (!flag) throw new HttpError(400, 'Enter a flag')
  // not shaped like a flag: turned away before any lookup, and it does not use up a try
  if (!FLAG_SHAPE.test(flag)) throw new HttpError(400, 'That is not a flag. A flag looks like FLAG{xxxxxxxxxx}')

  const mod = await store.getModule(n)
  if (!mod) throw new HttpError(404, 'No such module')
  if (!mod.released) throw new HttpError(403, 'This module has not been released yet')

  const player = await store.getPlayer(user.id)
  if (!player) throw new HttpError(403, 'Your account has no seed yet - ask an admin')

  const solveId = solveRowId(user.id, n)
  if (await store.getSolve(solveId)) throw new HttpError(409, 'Already solved')

  const wrong = counters(player.wrong, Object.keys(salts).length)
  if (wrong[n] >= maxWrong) {
    throw new HttpError(429, 'No attempts left on this module - ask an admin', { attempts_left: 0 })
  }

  if (flag !== deriveFlag(player.seed, salts[n]).toUpperCase()) {
    wrong[n] += 1
    await store.updatePlayer(user.id, { wrong })
    const left = Math.max(0, maxWrong - wrong[n])
    throw new HttpError(
      400,
      left > 0 ? 'Wrong flag' : 'Wrong flag - no attempts left on this module',
      { attempts_left: left },
    )
  }

  try {
    await store.createSolve(solveId, user.id, { player_id: user.id, module: n, points: mod.points })
  } catch (err) {
    if (isConflict(err)) throw new HttpError(409, 'Already solved')
    throw err
  }

  // totals are recomputed from the solves, so a retry or a race can never
  // leave them out of step
  const solves = await store.listSolves(user.id)
  const points = solves.reduce((sum, s) => sum + s.points, 0)
  await store.updatePlayer(user.id, {
    points,
    solved: solves.length,
    last_solve_at: new Date(now()).toISOString(),
  })
  return { correct: true, points: mod.points, total: points, attempts_left: maxWrong - wrong[n] }
}
