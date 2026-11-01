#!/usr/bin/env node
// Creates / updates the "ctf" Function (flag checking) and deploys its code.
//
//   APPWRITE_API_KEY=... node deploy-function.mjs
//
// The API key needs: functions.read/write (plus the scopes in setup.mjs).
// Safe to re-run: the Function and its settings are updated, and the code is
// deployed again and activated.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { Client, Functions, Runtime } from 'node-appwrite'
import { InputFile } from 'node-appwrite/file'
import { ENDPOINT as ENDPOINT_IN_USE, projectId, apiKey, loadSalts } from './config.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FUNCTION_ID = 'ctf'
const ENDPOINT = ENDPOINT_IN_USE
const PROJECT_ID = projectId()
const API_KEY = apiKey()

const salts = JSON.stringify(loadSalts())
const functions = new Functions(
  new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY),
)

const settings = {
  name: 'CTF flag check',
  runtime: Runtime.Node22,
  // only players may call it. Anyone can sign up with the public project id, so
  // `users` would let junk accounts burn the monthly execution quota; the
  // gateway turns everyone without the label away before the code runs.
  execute: ['label:player'],
  events: [],
  timeout: 15,
  enabled: true,
  logging: true,
  entrypoint: 'src/main.js',
  commands: 'npm install',
  // what the Function's own (per-execution) API key may do
  scopes: ['rows.read', 'rows.write'],
}

try {
  await functions.get({ functionId: FUNCTION_ID })
  await functions.update({ functionId: FUNCTION_ID, ...settings })
  console.log(`= function ${FUNCTION_ID} (settings synced)`)
} catch (err) {
  if (err?.code !== 404) throw err
  await functions.create({ functionId: FUNCTION_ID, ...settings })
  console.log(`+ function ${FUNCTION_ID}`)
}

// settings the code reads at runtime
const variables = {
  MODULE_SALTS: { value: salts, secret: true },
  MAX_WRONG_PER_FLAG: { value: process.env.MAX_WRONG_PER_FLAG || '3', secret: false },
}
const { variables: existing } = await functions.listVariables({ functionId: FUNCTION_ID })
for (const [key, { value, secret }] of Object.entries(variables)) {
  const found = existing.find((v) => v.key === key)
  if (found) {
    // a secret variable cannot be read back, so just overwrite it
    await functions.updateVariable({ functionId: FUNCTION_ID, variableId: found.$id, key, value, secret })
    console.log(`= variable ${key}`)
  } else {
    await functions.createVariable({ functionId: FUNCTION_ID, variableId: key, key, value, secret })
    console.log(`+ variable ${key}`)
  }
}

// package the code (not node_modules, Appwrite installs those)
const archive = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ctf-fn-')), 'code.tar.gz')
execFileSync('tar', ['-czf', archive, '--exclude=node_modules', '-C', path.join(__dirname, 'functions', 'ctf'), '.'])

const deployment = await functions.createDeployment({
  functionId: FUNCTION_ID,
  code: InputFile.fromPath(archive, 'code.tar.gz'),
  activate: true,
  entrypoint: settings.entrypoint,
  commands: settings.commands,
})
console.log(`~ deployment ${deployment.$id} uploaded, building...`)

for (let i = 0; i < 120; i++) {
  const d = await functions.getDeployment({ functionId: FUNCTION_ID, deploymentId: deployment.$id })
  if (d.status === 'ready') {
    console.log('Deployed and active.')
    process.exit(0)
  }
  if (d.status === 'failed' || d.status === 'canceled') {
    console.error(`Build ${d.status}:\n${d.buildLogs || '(no logs)'}`)
    process.exit(1)
  }
  await new Promise((r) => setTimeout(r, 2000))
}
console.error('Timed out waiting for the build')
process.exit(1)
