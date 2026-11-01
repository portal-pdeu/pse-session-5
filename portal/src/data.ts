import { ExecutionMethod, Functions, Query, Storage, TablesDB, type Models } from 'appwrite'
import { account, client, PROJECT_ID_IN_USE } from './appwrite'

// Everything the Modules tab needs from Appwrite. Reads go straight to the
// database (the permissions in appwrite/schema.mjs make a player see only their
// own rows); the one thing that needs a server - checking a flag - goes through
// the `ctf` Function.

const DATABASE_ID = 'ctf'
const BUCKET_ID = 'stages'
const FUNCTION_ID = 'ctf'

const tables = new TablesDB(client)
const storage = new Storage(client)
const functions = new Functions(client)

export interface Me {
  seed: string
  points: number
  solved: number
  // wrong flags so far, one counter per module
  wrong: number[]
}

export const MAX_WRONG = 3 // keep in step with MAX_WRONG_PER_FLAG on the Function

const toMe = (r: Models.DefaultRow): Me => ({
  seed: r.seed,
  points: r.points ?? 0,
  solved: r.solved ?? 0,
  wrong: r.wrong ?? [],
})

// The only thing read about modules: which are released. Everything else about
// a module is baked into the portal (see modules.ts).
export async function loadReleased(): Promise<Set<number>> {
  const { rows } = await tables.listRows({
    databaseId: DATABASE_ID,
    tableId: 'modules',
    queries: [Query.select(['number', 'released']), Query.limit(50)],
  })
  return new Set(rows.filter((r) => r.released).map((r) => r.number as number))
}

// One module's released flag - what the per-card "Refresh status" button reads.
export async function loadModuleReleased(module: number): Promise<boolean> {
  const row = await tables.getRow({
    databaseId: DATABASE_ID,
    tableId: 'modules',
    rowId: `m${module}`,
    queries: [Query.select(['released'])],
  })
  return !!row.released
}

// null when the admin has not made this player's row yet
export async function loadMe(userId: string): Promise<Me | null> {
  try {
    return toMe(await tables.getRow({ databaseId: DATABASE_ID, tableId: 'players', rowId: userId }))
  } catch (err) {
    if ((err as { code?: number }).code === 404) return null
    throw err
  }
}

// module numbers this player has captured
export async function loadSolved(): Promise<Set<number>> {
  const { rows } = await tables.listRows({ databaseId: DATABASE_ID, tableId: 'solves', queries: [Query.limit(50)] })
  return new Set(rows.map((r) => r.module as number))
}

export type SubmitResult =
  | { kind: 'correct'; points: number; total: number }
  | { kind: 'wrong'; message: string; attemptsLeft: number | null }
  | { kind: 'error'; message: string }

export async function submitFlag(module: number, flag: string): Promise<SubmitResult> {
  const ex = await functions.createExecution({
    functionId: FUNCTION_ID,
    body: JSON.stringify({ module, flag }),
    async: false,
    xpath: '/',
    method: ExecutionMethod.POST,
  })
  let body: { correct?: boolean; points?: number; total?: number; error?: string; attempts_left?: number } = {}
  try {
    body = JSON.parse(ex.responseBody || '{}')
  } catch {
    // fall through to the generic error below
  }
  if (ex.responseStatusCode === 200 && body.correct) return { kind: 'correct', points: body.points ?? 0, total: body.total ?? 0 }
  if (ex.responseStatusCode === 400 || ex.responseStatusCode === 429) {
    return { kind: 'wrong', message: body.error ?? 'Wrong flag', attemptsLeft: body.attempts_left ?? null }
  }
  return { kind: 'error', message: body.error ?? `The flag check failed (${ex.responseStatusCode})` }
}

// Chromium browsers (Chrome, Edge, Brave...) can show a real "Save as" dialog.
// Firefox and Safari cannot, and fall back to a normal download.
interface SaveFilePickerWindow {
  showSaveFilePicker?: (options: {
    suggestedName: string
    types: { description: string; accept: Record<string, string[]> }[]
  }) => Promise<{ createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }> }>
}

// Returns false if the player closed the "Save as" dialog without choosing.
//
// The dialog has to open straight from the click (browsers only allow it
// within a moment of a user action), so it comes first and the file is fetched
// afterwards.
export async function downloadStage(module: number): Promise<boolean> {
  const name = `neoncart-v${module}.zip`
  const picker = (window as unknown as SaveFilePickerWindow).showSaveFilePicker

  let target: Awaited<ReturnType<NonNullable<SaveFilePickerWindow['showSaveFilePicker']>>> | null = null
  if (picker) {
    try {
      target = await picker.call(window, {
        suggestedName: name,
        types: [{ description: 'Zip archive', accept: { 'application/zip': ['.zip'] } }],
      })
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return false
      throw err
    }
  }

  // The download URL needs the player's session. Cookies often do not reach
  // Appwrite from another domain, so ask for a short-lived JWT and send that.
  const fileId = `stage_${String(module).padStart(2, '0')}`
  const url = storage.getFileDownload({ bucketId: BUCKET_ID, fileId })
  const { jwt } = await account.createJWT()
  // Left cacheable on purpose: Appwrite lets browsers keep a download for 45
  // days (max-age=3888000) and the stage zips do not change during an event, so
  // a repeat download is served locally. (While a zip is still being changed, a
  // stale copy can come back - clear the site's cached files to get the new one.)
  const res = await fetch(url, { headers: { 'X-Appwrite-Project': PROJECT_ID_IN_USE, 'X-Appwrite-JWT': jwt } })
  if (!res.ok) throw new Error(res.status === 401 || res.status === 404 ? 'This module is not available yet' : `Download failed (${res.status})`)
  const blob = await res.blob()

  if (target) {
    const writable = await target.createWritable()
    await writable.write(blob)
    await writable.close()
    return true
  }

  const blobUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(blobUrl)
  return true
}
