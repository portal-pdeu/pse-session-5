import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { loadTestSalts } from '../config.mjs'
import { submitFlag, HttpError, solveRowId } from '../functions/ctf/src/handlers.js'
import { deriveFlag } from '../functions/ctf/src/flags.js'

const salts = loadTestSalts()

// The stage snapshots are generated (and gitignored), so build them with the
// example salts before the tests that read them run. This also checks that the
// builder and the Function still derive the same flag.
process.env.MODULE_SALTS ??= JSON.stringify(salts)
execFileSync(process.execPath, [new URL('../../modules-source/tools/build-stages.mjs', import.meta.url).pathname], {
  stdio: 'ignore',
})

const require = createRequire(import.meta.url)

// An in-memory stand-in for functions/ctf/src/store.js
function fakeStore({ released = [0, 1, 2, 3, 4, 5], players = {} } = {}) {
  const solves = new Map()
  return {
    solves,
    players,
    getModule: async (n) => ({ number: n, points: 500, released: released.includes(n) }),
    getPlayer: async (id) => players[id] || null,
    getSolve: async (id) => solves.get(id) || null,
    updatePlayer: async (id, data) => Object.assign(players[id], data),
    createSolve: async (id, userId, data) => {
      if (solves.has(id)) throw Object.assign(new Error('exists'), { code: 409 })
      solves.set(id, data)
    },
    listSolves: async (userId) => [...solves.values()].filter((s) => s.player_id === userId),
  }
}

const player = { id: 'u1', labels: ['player'] }
const newPlayers = () => ({ u1: { seed: 'seed-one', wrong: [0, 0, 0, 0, 0, 0], points: 0, solved: 0 } })
const ctx = (store, maxWrong = 3) => ({ store, salts, maxWrong, now: () => 1_700_000_000_000 })

async function expectError(promise, status, message) {
  await assert.rejects(promise, (err) => {
    assert.ok(err instanceof HttpError, `expected HttpError, got ${err}`)
    assert.equal(err.status, status)
    if (message) assert.match(err.message, message)
    return true
  })
}

test('a correct flag scores and records the solve', async () => {
  const store = fakeStore({ players: newPlayers() })
  const flag = deriveFlag('seed-one', salts[2])
  const out = await submitFlag(ctx(store), player, { module: 2, flag })
  assert.deepEqual([out.correct, out.points, out.total], [true, 500, 500])
  assert.equal(store.players.u1.points, 500)
  assert.equal(store.players.u1.solved, 1)
  assert.ok(store.solves.has(solveRowId('u1', 2)))
})

test('the flag is case and whitespace insensitive', async () => {
  const store = fakeStore({ players: newPlayers() })
  const flag = ` ${deriveFlag('seed-one', salts[0]).toLowerCase()} \n`
  assert.equal((await submitFlag(ctx(store), player, { module: 0, flag })).correct, true)
})

test('a flag from another module or another player is wrong', async () => {
  const store = fakeStore({ players: newPlayers() })
  await expectError(submitFlag(ctx(store), player, { module: 1, flag: deriveFlag('seed-one', salts[2]) }), 400, /Wrong flag/)
  await expectError(submitFlag(ctx(store), player, { module: 1, flag: deriveFlag('someone-else', salts[1]) }), 400, /Wrong flag/)
})

test('three wrong flags lock that module only', async () => {
  const store = fakeStore({ players: newPlayers() })
  for (const left of [2, 1, 0]) {
    await assert.rejects(submitFlag(ctx(store), player, { module: 3, flag: 'FLAG{0000000000}' }), (e) => e.status === 400 && e.extra.attempts_left === left)
  }
  // even the right flag is refused now
  await expectError(submitFlag(ctx(store), player, { module: 3, flag: deriveFlag('seed-one', salts[3]) }), 429, /No attempts left/)
  // module 4 is unaffected
  assert.equal((await submitFlag(ctx(store), player, { module: 4, flag: deriveFlag('seed-one', salts[4]) })).correct, true)
  assert.deepEqual(store.players.u1.wrong, [0, 0, 0, 3, 0, 0])
})

test('an unreleased module cannot be solved', async () => {
  const store = fakeStore({ released: [0], players: newPlayers() })
  await expectError(submitFlag(ctx(store), player, { module: 1, flag: deriveFlag('seed-one', salts[1]) }), 403, /not been released/)
})

test('solving twice is refused and does not double the points', async () => {
  const store = fakeStore({ players: newPlayers() })
  const flag = deriveFlag('seed-one', salts[5])
  await submitFlag(ctx(store), player, { module: 5, flag })
  await expectError(submitFlag(ctx(store), player, { module: 5, flag }), 409, /Already solved/)
  assert.equal(store.players.u1.points, 500)
})

test('accounts without the player label, and bad input, are refused', async () => {
  const store = fakeStore({ players: newPlayers() })
  await expectError(submitFlag(ctx(store), { id: 'u1', labels: [] }, { module: 0, flag: 'FLAG{0000000000}' }), 403)
  await expectError(submitFlag(ctx(store), player, { module: 9, flag: 'FLAG{0000000000}' }), 400, /No such module/)
  await expectError(submitFlag(ctx(store), player, { module: 'abc', flag: 'FLAG{0000000000}' }), 400, /No such module/)
  await expectError(submitFlag(ctx(store), player, { module: 0, flag: '  ' }), 400, /Enter a flag/)
  await expectError(submitFlag(ctx(store), { id: 'ghost', labels: ['player'] }, { module: 0, flag: 'FLAG{0000000000}' }), 403, /no seed/)
})

test('input not shaped like a flag is refused and does not use up a try', async () => {
  const store = fakeStore({ players: newPlayers() })
  for (const flag of ['hello', 'FLAG{nope}', 'FLAG{012345678}', 'FLAG{01234567890}', 'FLAG{012345678g}', 'xFLAG{0123456789}', "FLAG{0123456789}'; --"]) {
    await expectError(submitFlag(ctx(store), player, { module: 3, flag }), 400, /not a flag/)
  }
  await assert.rejects(submitFlag(ctx(store), player, { module: 3, flag: 'FLAG{0000000000}' }), (e) => e.status === 400 && e.extra.attempts_left === 2)
})

test('total points add up across modules', async () => {
  const store = fakeStore({ players: newPlayers() })
  for (const n of [0, 1, 2]) await submitFlag(ctx(store), player, { module: n, flag: deriveFlag('seed-one', salts[n]) })
  assert.equal(store.players.u1.points, 1500)
  assert.equal(store.players.u1.solved, 3)
})

// The salts here must be the ones baked into the stage snapshots, and the
// stage apps must derive the same flag from the same seed.
for (const n of Object.keys(salts)) {
  test(`stage ${n}: snapshot flaglib and the Function agree`, () => {
    const dir = new URL(`../../modules-source/stage-${String(n).padStart(2, '0')}/src/flaglib.js`, import.meta.url).pathname
    process.env.PLAYER_SEED = 'abc123'
    const lib = require(dir)
    assert.equal(lib.deriveFlag(lib.readLicense().seed, salts[n]), deriveFlag('abc123', salts[n]))
    delete process.env.PLAYER_SEED
  })
}

test('a stage app refuses to run without a seed', () => {
  delete process.env.PLAYER_SEED
  const lib = require(new URL('../../modules-source/stage-00/src/flaglib.js', import.meta.url).pathname)
  assert.throws(() => lib.readLicense(), /No seed set/)
})
