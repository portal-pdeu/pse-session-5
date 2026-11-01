#!/usr/bin/env node
// Generates a fresh set of module salts for one event.
//
//   npm run salts
//
// The flags of every player are derived from their seed and these salts, so
// the salts must stay private: appwrite/salts.json is gitignored and is only
// read by the provisioning/deploy scripts. Regenerate them for each event
// (players from two events must never share flags) and run `npm run setup`
// and `npm run deploy` afterwards so the snapshots and the Function agree.

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MODULES } from '../schema.mjs'

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'salts.json')

if (fs.existsSync(out) && !process.argv.includes('--force')) {
  console.error('appwrite/salts.json already exists. Pass --force to replace it.')
  process.exit(1)
}

const salts = Object.fromEntries(
  MODULES.map((m) => [String(m.number), crypto.randomBytes(24).toString('hex')]),
)

fs.writeFileSync(out, JSON.stringify(salts, null, 2) + '\n')
console.log(`Wrote ${Object.keys(salts).length} salts to appwrite/salts.json`)
