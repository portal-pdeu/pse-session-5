#!/usr/bin/env node
// Provisions the Appwrite project for the portal: database, tables, columns,
// indexes, permissions, the seeded modules, and the stage zips in Storage.
//
//   APPWRITE_API_KEY=... node setup.mjs             create / sync everything
//   APPWRITE_API_KEY=... node setup.mjs --refresh-stages
//                                                    re-upload the stage zips
//                                                    (keeps who may read them)
//   node setup.mjs --dry-run                         build the zips, print the
//                                                    plan, call nothing
//
// Safe to run again: anything that already exists is left alone (tables and
// modules get their permissions / text synced, released modules stay released).
//
// The API key needs these scopes: databases.read/write, tables.read/write,
// columns.read/write, indexes.read/write, rows.read/write, buckets.read/write,
// files.read/write. Create it in Console -> Overview -> Integrations -> API
// keys, and delete it once the event is over.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { zipSync } from 'fflate'
import { Client, TablesDB, Storage, Permission } from 'node-appwrite'
import { InputFile } from 'node-appwrite/file'
import { DATABASE_ID, BUCKET_ID, TABLES, MODULES, player, stageFileId, moduleRowId } from './schema.mjs'
import { ENDPOINT, projectId, apiKey, loadTestSalts } from './config.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const modulesSource = path.resolve(__dirname, '..', 'modules-source')

const args = new Set(process.argv.slice(2))
const DRY = args.has('--dry-run')
const REFRESH_STAGES = args.has('--refresh-stages')
const PROJECT_ID = projectId(DRY ? '(unset - set APPWRITE_PROJECT_ID)' : undefined)

const log = (msg) => console.log(msg)
const alreadyExists = (err) => err?.code === 409

// ---- stage zips -------------------------------------------------------------

function listFiles(dir, base = dir, out = []) {
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name)
    if (fs.statSync(full).isDirectory()) listFiles(full, base, out)
    else out.push(path.relative(base, full).split(path.sep).join('/'))
  }
  return out
}

// The folder inside each zip (and the zip's own name) carries the module
// number - neoncart-v0, neoncart-v1, ... - so two stages unpacked side by side
// never collide.
const stageFolder = (n) => `neoncart-v${n}`

// One static zip per stage. It is the same for every player: the personal part
// is the seed shown in the portal, which the player puts into the app.
function buildStageZip(n) {
  const dir = path.join(modulesSource, `stage-${String(n).padStart(2, '0')}`)
  if (!fs.existsSync(dir)) throw new Error(`Missing ${dir} - run the stage builder first`)
  const entries = {}
  for (const rel of listFiles(dir)) {
    entries[`${stageFolder(n)}/${rel}`] = [fs.readFileSync(path.join(dir, rel)), { mtime: new Date('2026-01-01') }]
  }
  return zipSync(entries, { level: 9 })
}

// ---- helpers ----------------------------------------------------------------

async function waitForColumns(tablesDB, tableId, keys) {
  for (let i = 0; i < 60; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: DATABASE_ID, tableId })
    const mine = columns.filter((c) => keys.includes(c.key))
    const failed = mine.find((c) => c.status === 'failed' || c.status === 'stuck')
    if (failed) throw new Error(`Column ${tableId}.${failed.key} failed: ${failed.error}`)
    if (mine.length === keys.length && mine.every((c) => c.status === 'available')) return
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`Timed out waiting for columns of ${tableId}`)
}

async function createColumn(tablesDB, tableId, col) {
  const base = { databaseId: DATABASE_ID, tableId, key: col.key, required: col.required, array: col.array }
  const xdefault = col.default
  switch (col.type) {
    case 'string':
      return tablesDB.createStringColumn({ ...base, size: col.size, xdefault })
    case 'integer':
      return tablesDB.createIntegerColumn({ ...base, min: col.min, max: col.max, xdefault })
    case 'boolean':
      return tablesDB.createBooleanColumn({ ...base, xdefault })
    case 'datetime':
      return tablesDB.createDatetimeColumn({ ...base, xdefault })
    default:
      throw new Error(`Unknown column type ${col.type}`)
  }
}

// ---- main -------------------------------------------------------------------

// A dry run should work on a fresh clone, before any salts exist.
if (DRY) process.env.MODULE_SALTS ??= JSON.stringify(loadTestSalts())

// Rebuild the snapshots from stage-defs so the zips carry the current salts.
execFileSync(process.execPath, [path.join(modulesSource, 'tools', 'build-stages.mjs')], { stdio: 'inherit' })

const zips = MODULES.map((m) => ({ number: m.number, bytes: buildStageZip(m.number) }))
log(`Built ${zips.length} stage zips: ${zips.map((z) => `${stageFileId(z.number)} ${(z.bytes.length / 1024).toFixed(0)}KB`).join(', ')}`)

if (DRY) {
  log(`\nDry run - would use project ${PROJECT_ID} at ${ENDPOINT}`)
  log(`Database "${DATABASE_ID}", tables: ${TABLES.map((t) => `${t.id} (${t.columns.length} columns, ${t.indexes.length} indexes)`).join(', ')}`)
  log(`Bucket "${BUCKET_ID}" with ${zips.length} files, ${MODULES.length} modules seeded`)
  process.exit(0)
}

const API_KEY = apiKey()

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY)
const tablesDB = new TablesDB(client)
const storage = new Storage(client)

// database. Look first: the Free plan allows one database, and Appwrite
// answers "limit reached" (not "already exists") when we try to create it again.
try {
  await tablesDB.get({ databaseId: DATABASE_ID })
  log(`= database ${DATABASE_ID}`)
} catch (err) {
  if (err?.code !== 404) throw err
  await tablesDB.create({ databaseId: DATABASE_ID, name: 'CTF' })
  log(`+ database ${DATABASE_ID}`)
}

// tables, columns, indexes
for (const t of TABLES) {
  try {
    await tablesDB.createTable({
      databaseId: DATABASE_ID,
      tableId: t.id,
      name: t.name,
      permissions: t.permissions,
      rowSecurity: t.rowSecurity,
    })
    log(`+ table ${t.id}`)
  } catch (err) {
    if (!alreadyExists(err)) throw err
    // keep permissions in sync with schema.mjs on re-runs
    await tablesDB.updateTable({
      databaseId: DATABASE_ID,
      tableId: t.id,
      name: t.name,
      permissions: t.permissions,
      rowSecurity: t.rowSecurity,
    })
    log(`= table ${t.id} (permissions synced)`)
  }

  const created = []
  for (const col of t.columns) {
    try {
      await createColumn(tablesDB, t.id, col)
      created.push(col.key)
      log(`  + column ${t.id}.${col.key}`)
    } catch (err) {
      if (!alreadyExists(err)) throw err
    }
  }
  await waitForColumns(tablesDB, t.id, t.columns.map((c) => c.key))

  for (const idx of t.indexes) {
    try {
      await tablesDB.createIndex({
        databaseId: DATABASE_ID,
        tableId: t.id,
        key: idx.key,
        type: idx.type,
        columns: idx.columns,
        orders: idx.orders,
      })
      log(`  + index ${t.id}.${idx.key}`)
    } catch (err) {
      if (!alreadyExists(err)) throw err
    }
  }
}

// modules (a released module stays released on re-runs)
for (const m of MODULES) {
  const data = { number: m.number, title: m.title, description: m.description, points: m.points }
  try {
    await tablesDB.createRow({
      databaseId: DATABASE_ID,
      tableId: 'modules',
      rowId: moduleRowId(m.number),
      data: { ...data, released: false },
    })
    log(`+ module ${m.number} ${m.title}`)
  } catch (err) {
    if (!alreadyExists(err)) throw err
    await tablesDB.updateRow({ databaseId: DATABASE_ID, tableId: 'modules', rowId: moduleRowId(m.number), data })
    log(`= module ${m.number} ${m.title}`)
  }
}

// bucket: a stage zip is readable by nobody until its module is released
// (the admin panel then grants read to the `player` label)
const bucketSettings = {
  bucketId: BUCKET_ID,
  name: 'Stages',
  permissions: [],
  fileSecurity: true,
  allowedFileExtensions: ['zip'],
  maximumFileSize: 10 * 1024 * 1024,
}
try {
  await storage.getBucket({ bucketId: BUCKET_ID })
  await storage.updateBucket(bucketSettings)
  log(`= bucket ${BUCKET_ID} (permissions synced)`)
} catch (err) {
  if (err?.code !== 404) throw err
  await storage.createBucket({ ...bucketSettings, compression: 'none' })
  log(`+ bucket ${BUCKET_ID}`)
}

for (const z of zips) {
  const fileId = stageFileId(z.number)
  const file = InputFile.fromBuffer(Buffer.from(z.bytes), `${stageFolder(z.number)}.zip`)
  // who may read it follows the module: released -> players, otherwise nobody
  const row = await tablesDB.getRow({ databaseId: DATABASE_ID, tableId: 'modules', rowId: moduleRowId(z.number) })
  const permissions = row.released ? [Permission.read(player)] : []

  let existing = null
  try {
    existing = await storage.getFile({ bucketId: BUCKET_ID, fileId })
  } catch (err) {
    if (err?.code !== 404) throw err
  }
  if (existing && !REFRESH_STAGES) {
    await storage.updateFile({ bucketId: BUCKET_ID, fileId, permissions })
    log(`= ${fileId} (permissions synced; --refresh-stages re-uploads)`)
    continue
  }
  if (existing) await storage.deleteFile({ bucketId: BUCKET_ID, fileId })
  await storage.createFile({ bucketId: BUCKET_ID, fileId, file, permissions })
  log(`${existing ? '~' : '+'} ${fileId}`)
}

log('\nDone. Next: node deploy-function.mjs, then start the admin panel.')
