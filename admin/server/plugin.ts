import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { createBackend } from './backend.ts'
import * as ops from './ops.ts'

// Serves the panel's small JSON API from inside the Vite dev server, so one
// command runs the whole thing and the API key stays in this Node process.
// The browser only ever sees the results.
//
// Because the key is powerful, the panel is local-only, enforced three ways:
//   1. it refuses to run if the server ends up listening on anything but a
//      loopback address (e.g. someone passes `--host`);
//   2. every request must come from a loopback connection and carry a
//      localhost Host header (this also defeats DNS-rebinding from web pages);
//   3. the API additionally needs a custom header, which other websites cannot
//      send without a CORS preflight that this server never approves.

interface Env {
  endpoint: string
  projectId: string
  apiKey: string
}

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (c) => {
      raw += c
      if (raw.length > 1_000_000) reject(new ops.OpError(413, 'Request too large'))
    })
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        reject(new ops.OpError(400, 'Bad JSON'))
      }
    })
  })
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

export const isLoopbackAddress = (address: string | undefined) => LOOPBACK.has(address || '')

// A request is accepted only if the connection is from this machine AND the
// Host header names this machine ("localhost:5175" -> "localhost"). The second
// half is what stops a web page from reaching the panel through a hostname it
// controls (DNS rebinding).
export function isLocalRequest(remoteAddress: string | undefined, hostHeader: string | undefined) {
  const host = (hostHeader || '').replace(/:\d+$/, '').toLowerCase()
  return isLoopbackAddress(remoteAddress) && LOCAL_HOSTS.has(host)
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}

export function adminApi(env: Env): Plugin {
  return {
    name: 'admin-api',
    configureServer(server) {
      const backend = env.apiKey ? createBackend(env) : null

      server.httpServer?.once('listening', () => {
        const addr = server.httpServer!.address()
        const host = typeof addr === 'object' && addr ? addr.address : String(addr)
        if (!isLoopbackAddress(host)) {
          console.error(`\n[admin] refusing to run: listening on ${host}, not localhost. Start it without --host.\n`)
          process.exit(1)
        }
      })

      // first in line, for every request (pages, assets and the API alike)
      server.middlewares.use((req, res, next) => {
        if (!isLocalRequest(req.socket.remoteAddress, req.headers.host)) {
          res.statusCode = 403
          return res.end('Forbidden: the admin panel only answers on localhost')
        }
        next()
      })

      server.middlewares.use('/api', async (req, res) => {
        try {
          if (req.headers['x-admin-panel'] !== '1') return send(res, 403, { error: 'Forbidden' })
          if (!backend) {
            return send(res, 500, { error: 'APPWRITE_API_KEY is not set - put it in admin/.env and restart' })
          }
          const url = new URL(req.url || '/', 'http://local')
          const route = `${req.method} ${url.pathname}`
          const body = req.method === 'GET' ? {} : await readBody(req)

          if (route === 'GET /state') return send(res, 200, await ops.getState(backend))

          if (route === 'POST /players') return send(res, 200, { results: await ops.addPlayers(backend, body.players || []) })

          let m = url.pathname.match(/^\/players\/([^/]+)$/)
          if (m && req.method === 'DELETE') {
            await ops.deletePlayer(backend, decodeURIComponent(m[1]))
            return send(res, 200, { ok: true })
          }

          m = url.pathname.match(/^\/players\/([^/]+)\/reset-attempts$/)
          if (m && req.method === 'POST') {
            await ops.resetAttempts(backend, decodeURIComponent(m[1]), body.module ?? null)
            return send(res, 200, { ok: true })
          }

          m = url.pathname.match(/^\/modules\/(\d+)\/release$/)
          if (m && req.method === 'POST') {
            return send(res, 200, { modules: await ops.setReleased(backend, Number(m[1]), body.released !== false) })
          }

          if (route === 'POST /reset') {
            return send(res, 200, await ops.resetRun(backend, body.mode === 'full' ? 'full' : 'progress', body.confirm))
          }

          return send(res, 404, { error: 'Not found' })
        } catch (err) {
          if (err instanceof ops.OpError) return send(res, err.status, { error: err.message })
          const e = err as { message?: string; code?: number; type?: string }
          console.error('[admin-api]', e.type || '', e.message || err)
          return send(res, 500, { error: e.message || 'Internal error' })
        }
      })
    },
  }
}
