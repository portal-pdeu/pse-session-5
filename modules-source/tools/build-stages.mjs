#!/usr/bin/env node
// Builds cumulative app snapshots for every CTF stage.
//
//   modules-source/
//     base-stage-00/          complete app skeleton (stage 0)
//     extras/stage-<NN>/      files overlaid onto the previous snapshot
//     stage-<NN>/             generated cumulative snapshot for module <NN>
//
// Run from anywhere:  node modules-source/tools/build-stages.mjs

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadSalts } from '../../appwrite/config.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const srcRoot = path.resolve(__dirname, '..')

// One salt per stage, from the gitignored appwrite/salts.json (or MODULE_SALTS).
// It is injected into each stage's code, so the stage app and the Function
// always derive the same flag.
const MODULE_SALTS = loadSalts()

// The number of stages is whatever has content: stage 0 is the base, every
// further stage comes from stage-defs/extras/stage-NN. Add a folder there and
// the snapshot appears; remove it and the stage disappears.
function highestStage() {
  const extras = path.join(srcRoot, 'stage-defs', 'extras')
  if (!fs.existsSync(extras)) return 0
  const numbers = fs
    .readdirSync(extras)
    .map((name) => /^stage-(\d+)$/.exec(name))
    .filter(Boolean)
    .map((m) => Number(m[1]))
  return numbers.length ? Math.max(...numbers) : 0
}

const STAGES = highestStage()

function stageName(n) {
  return `stage-${String(n).padStart(2, '0')}`
}

// Each module file carries a placeholder for its own salt. The salt is
// injected at build time from appwrite/salts.json, the same source used by the
// Appwrite Function.
function injectSalts(dir, stageNumber) {
  const salt = MODULE_SALTS[stageNumber]
  if (!salt) return
  const needle = `__MODULE_SALT_${String(stageNumber).padStart(2, '0')}__`
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    if (fs.statSync(full).isDirectory()) {
      injectSalts(full, stageNumber)
    } else if (/\.(js|md|txt)$/.test(name)) {
      const content = fs.readFileSync(full, 'utf8')
      if (content.includes(needle)) {
        fs.writeFileSync(full, content.split(needle).join(salt))
      }
    }
  }
}

// The scaffold's own flag belongs to stage 0. Every later snapshot inherits
// the scaffold, so the flag has to be switched off there - otherwise the
// stage 0 flag would leak into every later download and the module would be
// worth nothing. The scaffold reads its salt as a constant, so switching the
// flag off is writing null in its place.
const BASE_SALT = MODULE_SALTS[0]
const BASE_FLAG_LINE = new RegExp(`(const SALT = )'${BASE_SALT}'`)

function disableBaseFlag(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    if (fs.statSync(full).isDirectory()) {
      disableBaseFlag(full)
    } else if (/\.(js|md|txt)$/.test(name)) {
      const content = fs.readFileSync(full, 'utf8')
      if (content.includes(BASE_SALT)) {
        fs.writeFileSync(full, content.replace(BASE_FLAG_LINE, '$1null'))
      }
    }
  }
}

function copyOverlay(fromDir, toDir) {
  const cp = (src, dst) => {
    for (const name of fs.readdirSync(src)) {
      const s = path.join(src, name)
      const d = path.join(dst, name)
      if (fs.statSync(s).isDirectory()) {
        fs.mkdirSync(d, { recursive: true })
        cp(s, d)
      } else {
        fs.mkdirSync(path.dirname(d), { recursive: true })
        fs.copyFileSync(s, d)
      }
    }
  }
  fs.mkdirSync(toDir, { recursive: true })
  cp(fromDir, toDir)
}

// 1. Stage 00 = base snapshot, with the scaffold's own flag switched on
const baseOut = path.join(srcRoot, stageName(0))
fs.rmSync(baseOut, { recursive: true, force: true })
copyOverlay(path.join(srcRoot, 'stage-defs', 'base-stage-00'), baseOut)
injectSalts(baseOut, 0)

// 2. Stage N = snapshot of stage N-1 + extras
for (let i = 1; i <= STAGES; i++) {
  const prev = path.join(srcRoot, stageName(i - 1))
  const out = path.join(srcRoot, stageName(i))
  // wipe first: a stage that lost its content must not keep stale files
  fs.rmSync(out, { recursive: true, force: true })
  copyOverlay(prev, out)
  const extras = path.join(srcRoot, 'stage-defs', 'extras', stageName(i))
  if (fs.existsSync(extras)) copyOverlay(extras, out)
  // inject this stage's salt into the freshly built snapshot
  injectSalts(out, i)
  // the scaffold's flag belongs to stage 0 only
  disableBaseFlag(out)
}

console.log(`Built snapshots: ${stageName(0)}..${stageName(STAGES)} in ${srcRoot}`)
