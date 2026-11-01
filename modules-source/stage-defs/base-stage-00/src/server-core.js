// NeonCart base server (stage 00 - project scaffold).
// Later modules register their routes and their pages by dropping a file into
// src/routes/.

const http = require('http')
const fs = require('fs')
const path = require('path')
const log = require('./logger')
const { shell } = require('./ui')

const routes = []
const pages = []

function route(method, pattern, handler) {
  routes.push({ method, pattern, handler })
}

function page(pathname, title, body) {
  pages.push({ path: pathname, title, body })
}

function nav() {
  return pages.map((p) => `<a href="${p.path}">${p.title}</a>`).join('')
}

// The storefront is the home page.
function serveApp(req, res) {
  const store = pages.find((p) => p.path === '/ui/store')
  if (store) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(shell({ title: store.title, nav: nav(), body: store.body }))
    return
  }
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ app: 'NeonCart', pages: pages.map((p) => p.path) }))
}

// A developer convenience: the whole route inventory in one call.
function serveRoutes(req, res) {
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify({
    app: 'NeonCart',
    pages: pages.map((p) => p.path),
    routes: routes.map((r) => `${r.method} ${r.pattern}`),
  }))
}

route('GET', '/', serveApp)
route('GET', '/api/routes', serveRoutes)
route('GET', '/api/health', (req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ ok: true, uptime: process.uptime() }))
})

// The in-app log viewer: the same lines the portal receives.
route('GET', '/logs', (req, res) => {
  const rows = log
    .tail(200)
    .map((line) => {
      try {
        const e = JSON.parse(line)
        return `<tr><td class="dim">${new Date(e.t).toLocaleTimeString()}</td><td>${e.level}</td><td>${e.tag}</td><td>${escapeHtml(e.msg)}</td></tr>`
      } catch {
        return `<tr><td colspan="4">${escapeHtml(line)}</td></tr>`
      }
    })
    .join('')
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(
    shell({
      title: 'Server logs',
      nav: nav(),
      body: `<h2>Server logs</h2>
        <p class="hint">Every request and every internal decision this app made.<br/>Log level: <b>${log.level}</b>${log.level === 'debug' ? ' - the server is telling you what it does with your input. Read the code too.' : ' - the server only logs requests. Find the bug by reading the code.'}</p>
        <table><thead><tr><th>time</th><th>level</th><th>tag</th><th>message</th></tr></thead>
        <tbody>${rows}</tbody></table>`,
    }),
  )
})

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

function readBody(req, cb) {
  let data = ''
  req.on('data', (c) => {
    data += c
    if (data.length > 1e6) req.destroy()
  })
  req.on('end', () => cb(data))
}

// Load every module that shipped in this stage. A module file exports
// { routes: [{ method, path, handler }], pages?: [...], init?: () => void }.
function loadModules() {
  const dir = path.join(__dirname, 'routes')
  if (!fs.existsSync(dir)) return
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith('.js')) continue
    const mod = require(path.join(dir, name))
    if (typeof mod.init === 'function') mod.init()
    for (const r of mod.routes || []) {
      route(r.method, r.path, r.handler)
    }
    for (const p of mod.pages || []) {
      page(p.path, p.title, p.body)
    }
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const pathname = url.pathname

  res.on('finish', () => log.request(req.method, pathname, res.statusCode))

  for (const p of pages) {
    if (req.method === 'GET' && p.path === pathname) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(shell({ title: p.title, nav: nav(), body: p.body }))
      return
    }
  }

  for (const r of routes) {
    if (r.method === req.method && r.pattern === pathname) {
      try {
        if (req.method === 'POST' || req.method === 'PUT') {
          readBody(req, (body) => r.handler(req, res, body, url))
        } else {
          r.handler(req, res, null, url)
        }
      } catch (e) {
        log.error('app', `handler failed: ${e && e.message}`)
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: String(e && e.message) }))
      }
      return
    }
  }

  res.writeHead(404, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
})

loadModules()

module.exports = { server, route, page, readBody, loadModules }
