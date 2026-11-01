#!/usr/bin/env node
// Looks over the built site before it is deployed and fails (exit 1) if something
// that must never be public is in it, or something the deployment relies on is
// missing. `npm run build` runs it, so a bad build never reaches Cloudflare Pages.
//
//   node scripts/check-dist.mjs [dist-folder]      (default: dist)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const dist = path.resolve(process.argv[2] || path.join(here, '..', 'dist'))
const problems = []
const fail = (msg) => problems.push(msg)

if (!fs.existsSync(dist) || !fs.statSync(dist).isDirectory()) {
  console.error(`No build output at ${dist} - run the build first.`)
  process.exit(1)
}

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))
const files = walk(dist)
const rel = (f) => path.relative(dist, f)

// ---- 1. things that must not be in a public folder ---------------------------

for (const f of files) {
  const name = path.basename(f)
  if (name.endsWith('.map')) fail(`${rel(f)}: source map would publish the source code`)
  if (name === '.env' || name.startsWith('.env.')) fail(`${rel(f)}: environment file in the build output`)
  if (name.endsWith('.pem') || name.endsWith('.key')) fail(`${rel(f)}: key file in the build output`)
}

// secrets: a pattern for Appwrite API keys, the names of the server-side settings,
// and any module salts found next to the portal (the real salts.json locally,
// the committed example file in CI).
const patterns = [
  [/standard_[0-9a-f]{40,}/i, 'looks like an Appwrite API key'],
  [/x-appwrite-key/i, 'mentions the server-side x-appwrite-key header'],
  [/APPWRITE_API_KEY/, 'mentions APPWRITE_API_KEY'],
  [/MODULE_SALTS/, 'mentions MODULE_SALTS'],
]
let salts = []
for (const name of ['salts.json', 'salts.example.json']) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(here, '..', '..', 'appwrite', name), 'utf8'))
    salts.push(...Object.values(raw).filter((s) => typeof s === 'string' && s.length >= 6))
  } catch {
    // not available: the patterns above still apply
  }
}

const text = /\.(js|mjs|css|html|json|txt|map|svg)$/i
for (const f of files.filter((x) => text.test(x))) {
  const body = fs.readFileSync(f, 'utf8')
  for (const [re, what] of patterns) if (re.test(body)) fail(`${rel(f)}: ${what}`)
  for (const salt of salts) if (body.includes(salt)) fail(`${rel(f)}: contains a module salt`)
}

// ---- 2. what the deployment relies on ----------------------------------------

const headersFile = path.join(dist, '_headers')
if (!fs.existsSync(headersFile)) {
  fail('_headers is missing (portal/public/_headers): the site would be served without its security headers')
} else {
  const headers = fs.readFileSync(headersFile, 'utf8')
  const csp = /Content-Security-Policy:\s*(.+)/i.exec(headers)?.[1] ?? ''
  if (!csp) fail('_headers has no Content-Security-Policy')
  else {
    const directive = (name) => new RegExp(`(?:^|;)\\s*${name}\\s+([^;]*)`, 'i').exec(csp)?.[1] ?? ''
    if (/unsafe-eval|unsafe-inline/.test(directive('script-src'))) fail('Content-Security-Policy allows unsafe scripts')
    if (/\*/.test(directive('script-src')) || /\*/.test(directive('connect-src'))) fail('Content-Security-Policy uses a wildcard for scripts or connections')
    if (!/'none'/.test(directive('frame-ancestors'))) fail("Content-Security-Policy does not set frame-ancestors 'none'")
    if (!directive('connect-src')) fail('Content-Security-Policy has no connect-src, so the site could not reach Appwrite')
    // every Appwrite endpoint the code is built for must be allowed to connect
    for (const f of files.filter((x) => x.endsWith('.js'))) {
      const used = new Set(fs.readFileSync(f, 'utf8').match(/https:\/\/(?:[a-z0-9-]+\.)?cloud\.appwrite\.io/gi) ?? [])
      for (const origin of used) if (!directive('connect-src').includes(origin)) fail(`${rel(f)} calls ${origin}, which connect-src does not allow`)
    }
  }
  if (!/X-Content-Type-Options:\s*nosniff/i.test(headers)) fail('_headers is missing X-Content-Type-Options: nosniff')
}
if (!fs.existsSync(path.join(dist, 'robots.txt'))) fail('robots.txt is missing')
if (!fs.existsSync(path.join(dist, 'index.html'))) fail('index.html is missing')

// ---- result -------------------------------------------------------------------

if (problems.length) {
  console.error(`\nBuild check failed (${problems.length}):`)
  for (const p of problems) console.error(`  x ${p}`)
  process.exit(1)
}
console.log(`Build check passed: ${files.length} files in ${path.relative(process.cwd(), dist) || '.'}, no secrets, headers in place.`)
