import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as ops from '../server/ops.ts'
import { DATABASE_ID, BUCKET_ID, moduleRowId, stageFileId } from '../server/backend.ts'
import * as schema from '../../appwrite/schema.mjs'
import type { Backend, ModuleRow, PlayerRow } from '../server/types.ts'

function fake() {
  const modules: ModuleRow[] = [0, 1, 2].map((n) => ({ number: n, title: `M${n}`, points: 500, released: false }))
  const players = new Map<string, PlayerRow>()
  const users = new Map<string, { email: string; labels: string[] }>()
  const solves: { player_id: string }[] = []
  let nextId = 1
  const failLabelFor = new Set<string>()

  const backend: Backend = {
    listModules: async () => modules.map((m) => ({ ...m })),
    setModuleReleased: async (n, released) => {
      modules.find((m) => m.number === n)!.released = released
    },
    listPlayers: async () => [...players.values()].map((p) => ({ ...p, wrong: [...p.wrong] })),
    createPlayerRow: async (id, data) => {
      players.set(id, { id, ...data })
    },
    updatePlayer: async (id, data) => {
      Object.assign(players.get(id)!, data)
    },
    deletePlayerRow: async (id) => {
      players.delete(id)
    },
    createUser: async (email) => {
      if ([...users.values()].some((u) => u.email === email)) throw Object.assign(new Error('exists'), { type: 'user_already_exists' })
      const id = `u${nextId++}`
      users.set(id, { email, labels: [] })
      return { id }
    },
    addPlayerLabel: async (id) => {
      if (failLabelFor.has(users.get(id)!.email)) throw new Error('label failed')
      users.get(id)!.labels.push('player')
    },
    deleteUser: async (id) => {
      users.delete(id)
    },
    listPlayerUsers: async () => [...users].filter(([, u]) => u.labels.includes('player')).map(([id, u]) => ({ id, labels: u.labels })),
    deleteSolvesFor: async (pid) => {
      for (let i = solves.length - 1; i >= 0; i--) if (solves[i].player_id === pid) solves.splice(i, 1)
    },
    deleteAllSolves: async () => {
      solves.length = 0
    },
    deleteAllPlayerRows: async () => {
      players.clear()
    },
  }
  return { backend, modules, players, users, solves, failLabelFor }
}

test('adding a player creates the account, the label and a seeded row', async () => {
  const f = fake()
  const [r] = await ops.addPlayers(f.backend, [{ email: ' Ada@Example.com ', password: 'a-good-password' }])
  assert.equal(r.ok, true)
  assert.equal(r.email, 'ada@example.com')
  assert.equal('password' in r, false, 'the password is never echoed back')
  const row = [...f.players.values()][0]
  assert.equal(row.email, 'ada@example.com')
  assert.match(row.seed, /^[0-9a-f]{32}$/)
  assert.deepEqual(row.wrong, [0, 0, 0])
  assert.deepEqual([...f.users.values()][0].labels, ['player'])
})

test('a line without a password is refused and creates nothing', async () => {
  const f = fake()
  const out = await ops.addPlayers(f.backend, [{ email: 'a@b.co', password: '' }, { email: 'c@d.co' } as never])
  assert.deepEqual(out.map((r) => r.ok), [false, false])
  assert.match(out[0].error!, /email,password/)
  assert.equal(f.users.size + f.players.size, 0)
})

test('every player gets a different seed', async () => {
  const f = fake()
  await ops.addPlayers(f.backend, [{ email: 'a@b.co', password: 'password-1' }, { email: 'c@d.co', password: 'password-2' }, { email: 'e@f.co', password: 'password-3' }])
  assert.equal(new Set([...f.players.values()].map((p) => p.seed)).size, 3)
})

test('bad emails, short passwords and duplicates are reported per line', async () => {
  const f = fake()
  const out = await ops.addPlayers(f.backend, [
    { email: 'nope', password: 'long-enough-1' },
    { email: 'ok@x.io', password: 'short' },
    { email: 'dup@x.io', password: 'long-enough-2' },
    { email: 'dup@x.io', password: 'long-enough-3' },
  ])
  assert.deepEqual(out.map((r) => r.ok), [false, false, true, false])
  assert.match(out[0].error!, /valid email/)
  assert.match(out[1].error!, /at least 8/)
  assert.match(out[3].error!, /already exists/)
})

test('a failure half way removes the account again', async () => {
  const f = fake()
  f.failLabelFor.add('half@x.io')
  const [r] = await ops.addPlayers(f.backend, [{ email: 'half@x.io', password: 'long-enough-4' }])
  assert.equal(r.ok, false)
  assert.equal(f.users.size, 0)
  assert.equal(f.players.size, 0)
})

test('deleting a player removes account, row and solves', async () => {
  const f = fake()
  await ops.addPlayers(f.backend, [{ email: 'a@b.co', password: 'long-enough-5' }])
  const id = [...f.players.keys()][0]
  f.solves.push({ player_id: id }, { player_id: 'other' })
  await ops.deletePlayer(f.backend, id)
  assert.equal(f.players.size + f.users.size, 0)
  assert.equal(f.solves.length, 1)
})

test('reset attempts: one module or all', async () => {
  const f = fake()
  await ops.addPlayers(f.backend, [{ email: 'a@b.co', password: 'long-enough-5' }])
  const id = [...f.players.keys()][0]
  f.players.get(id)!.wrong = [3, 2, 1]
  await ops.resetAttempts(f.backend, id, 1)
  assert.deepEqual(f.players.get(id)!.wrong, [3, 0, 1])
  await ops.resetAttempts(f.backend, id)
  assert.deepEqual(f.players.get(id)!.wrong, [0, 0, 0])
  await assert.rejects(ops.resetAttempts(f.backend, id, 9), /No such module/)
  await assert.rejects(ops.resetAttempts(f.backend, 'ghost'), /No such player/)
})

test('release and lock a module', async () => {
  const f = fake()
  const after = await ops.setReleased(f.backend, 1, true)
  assert.deepEqual(after.map((m) => m.released), [false, true, false])
  await ops.setReleased(f.backend, 1, false)
  assert.equal(f.modules[1].released, false)
  await assert.rejects(ops.setReleased(f.backend, 7, true), /No such module/)
})

test('ranking: points, then who got there first, then email', () => {
  const p = (email: string, points: number, last: string | null) =>
    ({ id: email, email, seed: '', points, solved: 0, wrong: [], last_solve_at: last }) as PlayerRow
  const ranked = ops.rank([p('c@x', 500, '2026-01-01T10:05:00Z'), p('b@x', 500, '2026-01-01T10:01:00Z'), p('a@x', 0, null), p('d@x', 900, '2026-01-01T11:00:00Z')])
  assert.deepEqual(ranked.map((r) => r.email), ['d@x', 'b@x', 'c@x', 'a@x'])
  assert.deepEqual(ranked.map((r) => r.rank), [1, 2, 3, 4])
})

test('reset needs RESET; progress keeps players, full removes them', async () => {
  const f = fake()
  await ops.addPlayers(f.backend, [{ email: 'a@b.co', password: 'long-enough-6' }, { email: 'c@d.co', password: 'long-enough-7' }])
  f.users.set('admin-ish', { email: 'boss@x.io', labels: ['somethingelse'] })
  await ops.setReleased(f.backend, 0, true)
  for (const p of f.players.values()) Object.assign(p, { points: 500, solved: 1, wrong: [1, 0, 0], last_solve_at: 'x' })
  f.solves.push({ player_id: 'x' })

  await assert.rejects(ops.resetRun(f.backend, 'progress', 'nope'), /Type RESET/)

  const a = await ops.resetRun(f.backend, 'progress', 'reset')
  assert.equal(a.players, 2)
  assert.equal(f.solves.length, 0)
  assert.equal(f.modules.some((m) => m.released), false)
  assert.ok([...f.players.values()].every((p) => p.points === 0 && p.solved === 0 && p.last_solve_at === null && p.wrong.every((w) => w === 0)))

  const b = await ops.resetRun(f.backend, 'full', 'RESET')
  assert.equal(b.players, 0)
  assert.equal(f.players.size, 0)
  assert.deepEqual([...f.users.keys()], ['admin-ish'], 'accounts without the player label are left alone')
})

test('the ids used here match appwrite/schema.mjs', () => {
  assert.equal(DATABASE_ID, schema.DATABASE_ID)
  assert.equal(BUCKET_ID, schema.BUCKET_ID)
  for (const n of [0, 3, 5]) {
    assert.equal(moduleRowId(n), schema.moduleRowId(n))
    assert.equal(stageFileId(n), schema.stageFileId(n))
  }
})
