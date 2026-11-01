// Runs the admin panel's operations against the REAL Appwrite project.
//   APPWRITE_API_KEY=... node test/live.ts
// Creates one throwaway player and removes it again (never runs a full reset).
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { Client, Functions, Storage, TablesDB, Users } from 'node-appwrite'
import { createBackend, DATABASE_ID, BUCKET_ID, stageFileId } from '../server/backend.ts'
import * as ops from '../server/ops.ts'
import { deriveFlag } from '../../appwrite/functions/ctf/src/flags.js'

const endpoint = process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1'
const projectId = process.env.APPWRITE_PROJECT_ID || ''
const apiKey = process.env.APPWRITE_API_KEY || ''
if (!projectId || !apiKey) {
  console.error('Set APPWRITE_PROJECT_ID and APPWRITE_API_KEY (see admin/env.sample).')
  process.exit(1)
}
const salts = JSON.parse(fs.readFileSync(new URL('../../appwrite/salts.json', import.meta.url), 'utf8'))

const backend = createBackend({ endpoint, projectId, apiKey })
const users = new Users(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))

let passed = 0
const ok = (name: string) => {
  console.log(`  PASS ${name}`)
  passed++
}

const email = `admintest-${crypto.randomBytes(4).toString('hex')}@example.com`
let playerId = ''
try {
  const [added] = await ops.addPlayers(backend, [{ email, password: `pw-${crypto.randomBytes(6).toString('hex')}` }])
  assert.equal(added.ok, true, JSON.stringify(added))
  const state0 = await ops.getState(backend)
  const row = state0.players.find((p) => p.email === email)!
  playerId = row.id
  assert.match(row.seed, /^[0-9a-f]{32}$/)
  assert.equal(state0.modules.length, 6)
  ok('add player: account + label + seeded row exist, 6 modules listed')

  // sign in as that player (a session made by the server, as in appwrite/test/live.mjs)
  const session = await users.createSession({ userId: playerId })
  const client = new Client().setEndpoint(endpoint).setProject(projectId).setSession(session.secret)
  const storage = new Storage(client)
  const functions = new Functions(client)
  const player = new TablesDB(client)
  const submit = async (flag: string) => {
    const ex = await functions.createExecution({ functionId: 'ctf', body: JSON.stringify({ module: 0, flag }), async: false, xpath: '/', method: 'POST' as never })
    return { status: ex.responseStatusCode, body: JSON.parse(ex.responseBody || '{}') }
  }

  const own = await player.getRow({ databaseId: DATABASE_ID, tableId: 'players', rowId: playerId })
  assert.equal(own.seed, row.seed)
  ok('the new player can sign in and read their own seed row')

  await assert.rejects(storage.getFileDownload({ bucketId: BUCKET_ID, fileId: stageFileId(0) }))
  ok('the zip is closed while the module is locked')

  await ops.setReleased(backend, 0, true)
  assert.equal(Buffer.from(await storage.getFileDownload({ bucketId: BUCKET_ID, fileId: stageFileId(0) })).subarray(0, 2).toString(), 'PK')
  ok('release: the zip opens for the player')

  let r = await submit('FLAG{0000000000}')
  assert.equal(r.status, 400)
  assert.equal(r.body.attempts_left, 2)
  assert.equal((await backend.listPlayers()).find((p) => p.id === playerId)!.wrong[0], 1)
  await ops.resetAttempts(backend, playerId, 0)
  assert.equal((await backend.listPlayers()).find((p) => p.id === playerId)!.wrong[0], 0)
  ok('a wrong flag counts an attempt; reset attempts gives it back')

  r = await submit(deriveFlag(row.seed, salts[0]))
  assert.equal(r.status, 200)
  const ranked = (await ops.getState(backend)).players.find((p) => p.id === playerId)!
  assert.equal(ranked.points, 500)
  ok('a correct flag shows up on the leaderboard with 500 points')

  await ops.resetRun(backend, 'progress', 'RESET')
  const after = await ops.getState(backend)
  assert.equal(after.players.find((p) => p.id === playerId)!.points, 0)
  assert.equal(after.modules.some((m) => m.released), false)
  await assert.rejects(storage.getFileDownload({ bucketId: BUCKET_ID, fileId: stageFileId(0) }))
  ok('reset (progress): score cleared, modules locked, zip closed again')

  await ops.deletePlayer(backend, playerId)
  playerId = ''
  assert.equal((await ops.getState(backend)).players.some((p) => p.email === email), false)
  ok('delete player removes them')
} finally {
  if (playerId) await ops.deletePlayer(backend, playerId).catch(() => {})
  await backend.setModuleReleased(0, false).catch(() => {})
}
console.log(`${passed} checks passed`)
