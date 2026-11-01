#!/usr/bin/env node
// Read-only report of how the Appwrite project looks right now, checked against
// what schema.mjs says it should be. Exits with code 1 if anything is off.
//
//   npm run check

import { Client, TablesDB, Storage, Functions } from 'node-appwrite'
import { ENDPOINT as ENDPOINT_IN_USE, projectId, apiKey } from './config.mjs'
import { DATABASE_ID, BUCKET_ID, TABLES, MODULES, stageFileId, moduleRowId } from './schema.mjs'

const ENDPOINT = ENDPOINT_IN_USE
const PROJECT_ID = projectId()
const API_KEY = apiKey()
const FUNCTION_ID = 'ctf'

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY)
const tablesDB = new TablesDB(client)
const storage = new Storage(client)
const functions = new Functions(client)

// ---- formatting -------------------------------------------------------------

const color = process.stdout.isTTY
const paint = (code) => (s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s)
const green = paint(32)
const red = paint(31)
const dim = paint(2)
const bold = paint(1)

const problems = []
const OK = green('✓')
const BAD = red('✗')
const mark = (good, problem) => {
  if (!good) problems.push(problem)
  return good ? OK : BAD
}

const pad = (s, n) => String(s).padEnd(n)
const section = (title) => console.log(`\n${bold(title)}\n${dim('─'.repeat(title.length))}`)

// read("label:player") -> "players read"; [] -> "nobody (server key only)"
const WHO = { 'label:player': 'players', 'label:admin': 'admins', users: 'any signed-in user', any: 'anyone', guests: 'guests' }
function describe(perms) {
  if (!perms.length) return 'nobody (server key only)'
  return perms
    .map((p) => {
      const m = /^(\w+)\("(.+)"\)$/.exec(p)
      if (!m) return p
      const who = WHO[m[2]] ?? (m[2].startsWith('user:') ? 'the owner' : m[2])
      return `${who} ${m[1]}`
    })
    .join(', ')
}
const sameSet = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())

console.log(`${bold('NeonCart Bug Hunt - Appwrite project check')}`)
console.log(`${dim('project')} ${PROJECT_ID}   ${dim('endpoint')} ${ENDPOINT}`)

// ---- database ---------------------------------------------------------------

section(`Database "${DATABASE_ID}"`)
const { tables } = await tablesDB.listTables({ databaseId: DATABASE_ID })
console.log(dim(`  ${pad('table', 8)}${pad('rows', 7)}${pad('columns', 10)}who can read`))
for (const want of TABLES) {
  const t = tables.find((x) => x.$id === want.id)
  if (!t) {
    console.log(`${BAD} ${want.id}  ${red('missing - run npm run setup')}`)
    problems.push(`table ${want.id} is missing`)
    continue
  }
  const { columns } = await tablesDB.listColumns({ databaseId: DATABASE_ID, tableId: want.id })
  const { total } = await tablesDB.listRows({ databaseId: DATABASE_ID, tableId: want.id })
  const missing = want.columns.filter((c) => !columns.some((x) => x.key === c.key && x.status === 'available'))
  const permsOk = sameSet(t.$permissions, want.permissions) && t.rowSecurity === want.rowSecurity
  const access = describe(t.$permissions) + (t.rowSecurity ? '; each player reads their own rows' : '')
  console.log(
    `${mark(!missing.length && permsOk, `table ${want.id} differs from schema.mjs`)} ` +
      `${pad(want.id, 8)}${pad(total, 7)}${pad(`${columns.length - missing.length}/${want.columns.length}`, 10)}${access}`,
  )
  if (missing.length) console.log(`    ${red('missing or not ready:')} ${missing.map((c) => c.key).join(', ')}`)
  if (!permsOk) console.log(`    ${red('permissions differ from schema.mjs - run npm run setup')}`)
}

// ---- modules + stage zips ---------------------------------------------------

section('Modules and stage zips')
const { rows } = await tablesDB.listRows({ databaseId: DATABASE_ID, tableId: 'modules' })
const { files } = await storage.listFiles({ bucketId: BUCKET_ID })
console.log(dim(`  ${pad('#', 3)}${pad('module', 26)}${pad('points', 8)}${pad('state', 10)}stage zip`))
for (const m of MODULES) {
  const row = rows.find((r) => r.$id === moduleRowId(m.number))
  const file = files.find((f) => f.$id === stageFileId(m.number))
  const released = !!row?.released
  const open = !!file && file.$permissions.some((p) => p.includes('label:player'))
  // a released module needs an open zip, a locked one a closed zip
  const consistent = !!row && !!file && open === released
  const zip = !file ? red('missing') : `${(file.sizeOriginal / 1024).toFixed(1)} KB, ${open ? green('open to players') : 'locked'}`
  console.log(
    `${mark(consistent, `module ${m.number}: ${!row ? 'row missing' : !file ? 'zip missing' : 'released state and zip access disagree'}`)} ` +
      `${pad(String(m.number).padStart(2, '0'), 3)}${pad(m.title, 26)}${pad(row?.points ?? '-', 8)}${pad(released ? green('released') : 'locked', 10 + (released && color ? 9 : 0))}${zip}`,
  )
}

// ---- storage ----------------------------------------------------------------

section(`Storage bucket "${BUCKET_ID}"`)
const bucket = await storage.getBucket({ bucketId: BUCKET_ID })
console.log(`${mark(bucket.fileSecurity, 'bucket file security is off')} per-file permissions: ${bucket.fileSecurity ? 'on' : 'OFF'}`)
console.log(`${mark(bucket.$permissions.length === 0, 'bucket has open permissions')} bucket-level access: ${describe(bucket.$permissions)}`)
console.log(`  ${files.length} files`)

// ---- function ---------------------------------------------------------------

section(`Function "${FUNCTION_ID}" (flag check)`)
try {
  const fn = await functions.get({ functionId: FUNCTION_ID })
  const { variables } = await functions.listVariables({ functionId: FUNCTION_ID })
  const names = variables.map((v) => v.key)
  let deployment = null
  if (fn.deploymentId) deployment = await functions.getDeployment({ functionId: FUNCTION_ID, deploymentId: fn.deploymentId })

  const onlyPlayers = fn.execute.length === 1 && fn.execute[0] === 'label:player'
  console.log(`${mark(onlyPlayers, 'function can be called by more than players - run npm run deploy')} execute: ${onlyPlayers ? 'players only' : red(fn.execute.join(', '))}`)
  console.log(`${mark(fn.enabled, 'function is disabled')} ${fn.enabled ? 'enabled' : 'DISABLED'}   ${dim('runtime')} ${fn.runtime}   ${dim('callable by')} ${describe(fn.execute.map((e) => `execute("${e}")`)).replace(/ execute/g, '')}`)
  console.log(`${mark(deployment?.status === 'ready', 'no ready deployment - run npm run deploy')} deployment: ${deployment ? deployment.status : 'none'}${deployment ? dim(`  (${deployment.$createdAt.slice(0, 16).replace('T', ' ')} UTC)`) : ''}`)
  for (const name of ['MODULE_SALTS', 'MAX_WRONG_PER_FLAG']) {
    const v = variables.find((x) => x.key === name)
    const shown = !v ? red('missing') : v.secret ? dim('set (secret)') : `= ${v.value}`
    console.log(`${mark(names.includes(name), `function setting ${name} is missing`)} ${pad(name, 20)}${shown}`)
  }
} catch (err) {
  if (err?.code !== 404) throw err
  console.log(`${BAD} ${red('not deployed - run npm run deploy')}`)
  problems.push('the ctf Function is not deployed')
}

// ---- summary ----------------------------------------------------------------

console.log('')
if (problems.length === 0) {
  console.log(green(bold('All good.')) + dim('  Everything matches schema.mjs.'))
} else {
  console.log(red(bold(`${problems.length} problem${problems.length === 1 ? '' : 's'}:`)))
  for (const p of problems) console.log(`  ${BAD} ${p}`)
  process.exitCode = 1
}
