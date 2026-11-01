const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

// Your personal seed comes from the CTF portal (it is shown to you there).
// Either start the app with it in the environment:
//     PLAYER_SEED=<your seed> node server.js
// or paste it into config/player-license.json. Do not share it - every flag
// this app prints is derived from it, so it identifies you.
const PLACEHOLDER = 'PASTE_YOUR_SEED_FROM_THE_PORTAL'

function readLicense() {
  if (process.env.PLAYER_SEED) return { seed: process.env.PLAYER_SEED.trim() }
  const p = path.join(__dirname, '..', 'config', 'player-license.json')
  let license = {}
  if (fs.existsSync(p)) license = JSON.parse(fs.readFileSync(p, 'utf8'))
  if (!license.seed || license.seed === PLACEHOLDER) {
    throw new Error('No seed set - copy your seed from the CTF portal into config/player-license.json, or start with PLAYER_SEED=<seed>')
  }
  return license
}

// Each module has its own salt, injected into that module's file when the
// snapshot is built. The flag therefore only exists for the module you are
// actually reading, and only on the code path the bug lets you reach.
function deriveFlag(seed, salt) {
  return 'FLAG{' + crypto.createHash('sha256').update(String(seed) + ':' + String(salt)).digest('hex').slice(0, 10) + '}'
}

module.exports = { readLicense, deriveFlag }
