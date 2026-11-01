import { Client, Account } from 'node-appwrite'
import { createStore } from './store.js'
import { submitFlag, HttpError } from './handlers.js'

// Entry point of the Appwrite Function. The portal calls it with
//   POST  { "module": 3, "flag": "FLAG{...}" }
// and gets back JSON: { correct, points, total, attempts_left } on success,
// or { error, attempts_left? } with a 4xx status.
//
// Settings (Function -> Settings -> Variables):
//   MODULE_SALTS       JSON { "0": "salt", ... } - never leaves the server
//   MAX_WRONG_PER_FLAG wrong tries allowed per flag, default 3

const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT
const projectId = process.env.APPWRITE_FUNCTION_PROJECT_ID

// Who is calling? Appwrite hands the function the caller's session as a JWT;
// asking Appwrite who that JWT belongs to is the trustworthy answer.
async function getCaller(req) {
  const jwt = req.headers['x-appwrite-user-jwt']
  if (!jwt) throw new HttpError(401, 'Sign in first')
  try {
    const user = await new Account(new Client().setEndpoint(endpoint).setProject(projectId).setJWT(jwt)).get()
    return { id: user.$id, labels: user.labels }
  } catch {
    throw new HttpError(401, 'Sign in first')
  }
}

export default async ({ req, res, log, error }) => {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Use POST')
    const key = req.headers['x-appwrite-key'] || process.env.APPWRITE_API_KEY
    if (!key) throw new Error('No API key available to the function')
    const salts = JSON.parse(process.env.MODULE_SALTS || '{}')
    const maxWrong = Number(process.env.MAX_WRONG_PER_FLAG || 3)

    const user = await getCaller(req)
    const body = typeof req.bodyJson === 'object' && req.bodyJson ? req.bodyJson : {}
    const result = await submitFlag(
      { store: createStore({ endpoint, projectId, key }), salts, maxWrong },
      user,
      body,
    )
    return res.json(result)
  } catch (err) {
    if (err instanceof HttpError) return res.json({ error: err.message, ...err.extra }, err.status)
    error(String(err?.stack || err))
    return res.json({ error: 'Internal error' }, 500)
  }
}
