// Shared configuration for the Appwrite provisioning scripts.
//
// Nothing here is a secret except the API key and the module salts, and both
// are supplied at run time (`.env` or the environment). The repository ships
// no project id, endpoint or salt values.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

// Appwrite's public Cloud endpoint. Point APPWRITE_ENDPOINT at a regional
// endpoint (for example https://fra.cloud.appwrite.io/v1) if your project
// lives in one; update the CSP connect-src in portal/public/_headers to match.
export const ENDPOINT = process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1'

export function projectId(fallback) {
  const id = process.env.APPWRITE_PROJECT_ID
  if (!id && fallback !== undefined) return fallback
  if (!id) {
    console.error('Set APPWRITE_PROJECT_ID (see env.sample) before running this script.')
    process.exit(1)
  }
  return id
}

export function apiKey() {
  const key = process.env.APPWRITE_API_KEY
  if (!key) {
    console.error('Set APPWRITE_API_KEY (Console -> Overview -> Integrations -> API keys).')
    process.exit(1)
  }
  return key
}

// Real salts are generated per event and never committed. `npm run salts`
// writes appwrite/salts.json; MODULE_SALTS overrides it for CI or hosting.
export function loadSalts() {
  if (process.env.MODULE_SALTS) return JSON.parse(process.env.MODULE_SALTS)
  const file = path.join(here, 'salts.json')
  if (!fs.existsSync(file)) {
    console.error('No module salts yet. Run `npm run salts` in appwrite/ (or set MODULE_SALTS).')
    process.exit(1)
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

// Tests only compare derived flags with each other, so the committed example
// values work and keep the real event salts out of the repository.
export function loadTestSalts() {
  return JSON.parse(fs.readFileSync(path.join(here, 'salts.example.json'), 'utf8'))
}
