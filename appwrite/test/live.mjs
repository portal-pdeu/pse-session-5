#!/usr/bin/env node
// End-to-end check against the REAL Appwrite project: creates throwaway users,
// plays the flag loop through the deployed Function, checks what players can
// and cannot read, then removes everything it created (and re-locks module 0).
//
//   APPWRITE_API_KEY=... node test/live.mjs
//
// Needs scopes: users.read/write, rows.read/write, files.read/write,
// sessions.write plus the ones the setup already uses.

import crypto from 'node:crypto'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { Client, TablesDB, Storage, Functions, Users, ID, Permission, Role, Query } from 'node-appwrite'
import { deriveFlag } from '../functions/ctf/src/flags.js'
import { ENDPOINT, projectId, apiKey, loadSalts } from '../config.mjs'
import { DATABASE_ID, BUCKET_ID, stageFileId, moduleRowId, player as playerRole } from '../schema.mjs'

const PROJECT_ID = projectId()
const salts = loadSalts()

const admin = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(apiKey())
const users = new Users(admin)
const tables = new TablesDB(admin)
const storage = new Storage(admin)

const created = { users: [], solves: [] }
let passed = 0
const ok = (name) => console.log(`  PASS ${name}`) || passed++

async function newUser(label) {
  const password = crypto.randomBytes(9).toString('base64url')
  const email = `livetest-${crypto.randomBytes(4).toString('hex')}@example.com`
  const user = await users.create({ userId: ID.unique(), email, password })
  created.users.push(user.$id)
  if (label) await users.updateLabels({ userId: user.$id, labels: [label] })
  // a server-created session carries its secret, which a client can then use
  const session = await users.createSession({ userId: user.$id })
  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setSession(session.secret)
  return { id: user.$id, email, client, tables: new TablesDB(client), storage: new Storage(client), functions: new Functions(client) }
}

async function submit(p, module, flag) {
  const ex = await p.functions.createExecution({ functionId: 'ctf', body: JSON.stringify({ module, flag }), async: false, xpath: '/', method: 'POST' })
  let body = {}
  try { body = JSON.parse(ex.responseBody) } catch {}
  return { status: ex.responseStatusCode, body }
}

async function cleanup() {
  for (const id of created.solves) await tables.deleteRow({ databaseId: DATABASE_ID, tableId: 'solves', rowId: id }).catch(() => {})
  for (const id of created.users) {
    await tables.deleteRow({ databaseId: DATABASE_ID, tableId: 'players', rowId: id }).catch(() => {})
    await users.delete({ userId: id }).catch(() => {})
  }
  await tables.updateRow({ databaseId: DATABASE_ID, tableId: 'modules', rowId: moduleRowId(0), data: { released: false } }).catch(() => {})
  await storage.updateFile({ bucketId: BUCKET_ID, fileId: stageFileId(0), permissions: [] }).catch(() => {})
}

try {
  const seed = `live-${crypto.randomBytes(6).toString('hex')}`
  const alice = await newUser('player')
  const stranger = await newUser(null) // signed up on their own: no label
  await tables.createRow({
    databaseId: DATABASE_ID, tableId: 'players', rowId: alice.id,
    data: { email: alice.email, seed, points: 0, solved: 0, wrong: [0, 0, 0, 0, 0, 0] },
    permissions: [Permission.read(Role.user(alice.id))],
  })
  created.solves.push(`${alice.id}_m0`)

  // --- before release ---------------------------------------------------------
  let r = await submit(alice, 0, deriveFlag(seed, salts[0]))
  assert.equal(r.status, 403, JSON.stringify(r)); assert.match(r.body.error, /not been released/)
  ok('a flag for an unreleased module is refused')

  await assert.rejects(alice.storage.getFileDownload({ bucketId: BUCKET_ID, fileId: stageFileId(0) }))
  ok('the unreleased stage zip is not downloadable')

  // --- release module 0 (what the admin panel will do) ------------------------
  await tables.updateRow({ databaseId: DATABASE_ID, tableId: 'modules', rowId: moduleRowId(0), data: { released: true } })
  await storage.updateFile({ bucketId: BUCKET_ID, fileId: stageFileId(0), permissions: [Permission.read(playerRole)] })

  const zip = await alice.storage.getFileDownload({ bucketId: BUCKET_ID, fileId: stageFileId(0) })
  assert.ok(Buffer.from(zip).subarray(0, 2).toString() === 'PK', 'expected a zip')
  ok('a player downloads the released stage zip')

  // the portal downloads with a short-lived JWT in a header (cookies do not
  // reach Appwrite from another domain), so prove that path too
  {
    const { jwt } = await users.createJWT({ userId: alice.id })
    // the same URL the portal's web SDK builds for storage.getFileDownload
    const url = `${ENDPOINT}/storage/buckets/${BUCKET_ID}/files/${stageFileId(0)}/download?project=${PROJECT_ID}`
    const withJwt = await fetch(url, { headers: { 'X-Appwrite-Project': PROJECT_ID, 'X-Appwrite-JWT': jwt } })
    assert.equal(withJwt.status, 200)
    assert.equal(Buffer.from(await withJwt.arrayBuffer()).subarray(0, 2).toString(), 'PK')
    const without = await fetch(url, { headers: { 'X-Appwrite-Project': PROJECT_ID } })
    assert.notEqual(without.status, 200, 'no credentials must not download')
    ok('the portal download path works: JWT header gets the zip, no credentials do not')
  }

  await assert.rejects(stranger.storage.getFileDownload({ bucketId: BUCKET_ID, fileId: stageFileId(0) }))
  ok('an account without the player label cannot download it')

  const mods = await alice.tables.listRows({ databaseId: DATABASE_ID, tableId: 'modules' })
  assert.equal(mods.total, 6)
  // the portal reads only the released flag of each module
  const slim = await alice.tables.listRows({ databaseId: DATABASE_ID, tableId: 'modules', queries: [Query.select(['number', 'released']), Query.limit(50)] })
  assert.deepEqual(slim.rows.filter((r) => r.released).map((r) => r.number), [0])
  await assert.rejects(stranger.tables.listRows({ databaseId: DATABASE_ID, tableId: 'modules' }))
  ok('players read the modules; an unlabeled account does not')

  // --- the flag loop ----------------------------------------------------------
  r = await submit(alice, 0, 'FLAG{0000000000}')
  assert.equal(r.status, 400, JSON.stringify(r)); assert.equal(r.body.attempts_left, 2)
  ok('a wrong flag is rejected and counts an attempt (2 left)')

  r = await submit(alice, 0, deriveFlag(seed, salts[0]))
  assert.equal(r.status, 200, JSON.stringify(r)); assert.equal(r.body.total, 500)
  ok('the correct flag scores 500')

  r = await submit(alice, 0, deriveFlag(seed, salts[0]))
  assert.equal(r.status, 409)
  ok('solving the same module twice is refused')

  r = await submit(stranger, 0, deriveFlag(seed, salts[0]))
  assert.equal(r.status, 403)
  ok('an unlabeled account cannot submit')

  const guest = new Functions(new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID))
  await assert.rejects(guest.createExecution({ functionId: 'ctf', body: '{}', async: false, xpath: '/', method: 'POST' }))
  ok('a guest (not signed in) cannot call the Function')

  // --- what the player sees of their own data ---------------------------------
  const mine = await alice.tables.getRow({ databaseId: DATABASE_ID, tableId: 'players', rowId: alice.id })
  assert.equal(mine.seed, seed); assert.equal(mine.points, 500); assert.equal(mine.solved, 1)
  assert.deepEqual(mine.wrong, [1, 0, 0, 0, 0, 0])
  ok('a player reads their own seed, score and attempt counters')

  const solves = await alice.tables.listRows({ databaseId: DATABASE_ID, tableId: 'solves', queries: [Query.limit(10)] })
  assert.equal(solves.total, 1)
  ok('a player sees their own solves')

  await assert.rejects(stranger.tables.getRow({ databaseId: DATABASE_ID, tableId: 'players', rowId: alice.id }))
  await assert.rejects(alice.tables.updateRow({ databaseId: DATABASE_ID, tableId: 'players', rowId: alice.id, data: { points: 99999 } }))
  ok("nobody else reads a player's row, and a player cannot edit their own score")
} finally {
  await cleanup()
  console.log('\ncleaned up test users, rows and module 0 release')
}
console.log(`${passed} checks passed`)
