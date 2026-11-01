import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { loadTestSalts } from '../config.mjs'

// portal/scripts/check-dist.mjs gates the build: these tests feed it small fake
// build folders and check what it lets through and what it stops.

const script = new URL('../../portal/scripts/check-dist.mjs', import.meta.url).pathname
const publicDir = new URL('../../portal/public/', import.meta.url).pathname
const salts = Object.values(loadTestSalts())

function build(files = {}, { withPublic = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dist-check-'))
  const all = {
    'index.html': '<!doctype html><div id="root"></div>',
    'assets/app.js': "fetch('https://cloud.appwrite.io/v1/ping')",
    ...(withPublic ? Object.fromEntries(fs.readdirSync(publicDir).map((f) => [f, fs.readFileSync(path.join(publicDir, f), 'utf8')])) : {}),
    ...files,
  }
  for (const [name, body] of Object.entries(all)) {
    if (body === null) continue
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true })
    fs.writeFileSync(path.join(dir, name), body)
  }
  return dir
}

function run(dir) {
  const r = spawnSync(process.execPath, [script, dir], { encoding: 'utf8' })
  fs.rmSync(dir, { recursive: true, force: true })
  return { code: r.status, out: r.stdout + r.stderr }
}

test('a clean build with the shipped headers passes', () => {
  const r = run(build())
  assert.equal(r.code, 0, r.out)
})

test('an Appwrite API key in the bundle fails the build', () => {
  const r = run(build({ 'assets/app.js': `const k = "standard_${'a1'.repeat(40)}"` }))
  assert.equal(r.code, 1)
  assert.match(r.out, /API key/)
})

test('a module salt in the bundle fails the build', () => {
  const r = run(build({ 'assets/app.js': `const s = ${JSON.stringify(salts[0])}` }))
  assert.equal(r.code, 1)
  assert.match(r.out, /module salt/)
})

test('server-side setting names in the bundle fail the build', () => {
  assert.equal(run(build({ 'assets/app.js': 'process.env.MODULE_SALTS' })).code, 1)
  assert.equal(run(build({ 'assets/app.js': 'headers["x-appwrite-key"]' })).code, 1)
})

test('source maps and env files in the output fail the build', () => {
  assert.equal(run(build({ 'assets/app.js.map': '{}' })).code, 1)
  assert.equal(run(build({ '.env': 'X=1' })).code, 1)
})

test('missing headers or robots.txt fail the build', () => {
  const r = run(build({}, { withPublic: false }))
  assert.equal(r.code, 1)
  assert.match(r.out, /_headers is missing/)
  assert.match(r.out, /robots\.txt is missing/)
})

test('a weak Content-Security-Policy fails the build', () => {
  const headers = fs.readFileSync(path.join(publicDir, '_headers'), 'utf8')
  assert.equal(run(build({ _headers: headers.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'") })).code, 1)
  assert.equal(run(build({ _headers: headers.replace("frame-ancestors 'none'", 'frame-ancestors *') })).code, 1)
})

test('calling an Appwrite endpoint that connect-src does not allow fails the build', () => {
  const r = run(build({ 'assets/app.js': "fetch('https://nyc.cloud.appwrite.io/v1/ping')" }))
  assert.equal(r.code, 1)
  assert.match(r.out, /connect-src does not allow/)
})
