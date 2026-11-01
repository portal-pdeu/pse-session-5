// NeonCart diagnostics service (shipped by the AI agents in stage 01).
// The agents wired this up first, before the app had any authentication at
// all, and forgot to take it out of the public build.

const log = require('../logger')
const { readLicense, deriveFlag } = require('../flaglib')

const SALT = '__MODULE_SALT_01__'

function json(res, code, obj) {
  res.writeHead(code, { 'content-type': 'application/json' })
  res.end(JSON.stringify(obj))
}

// A diagnostics endpoint is meant for the operators: it prints the build
// information and the internal build key.
function diagnostics(req, res) {
  log.info('diagnostics', 'diagnostics report requested')
  json(res, 200, {
    service: 'neoncart',
    build: '0.4.2-ai-preview',
    node: process.version,
    features: ['catalog', 'checkout', 'uploads', 'tickets', 'sessions'],
    internal_build_key: deriveFlag(readLicense().seed, SALT),
  })
}

// The route list is handy when something breaks.
function routes(req, res) {
  log.info('diagnostics', 'route inventory requested')
  json(res, 200, {
    routes: [
      'GET  /api/debug/diagnostics',
      'GET  /api/debug/routes',
      'GET  /api/health',
    ],
  })
}

const PAGE = `
<h2>System status</h2>
<p class="hint">All NeonCart services, right now. If something looks off, the full report has
more detail than this page shows.</p>

<div class="cards">
  <div class="statcard"><div class="statname">Storefront</div><div class="ok">operational</div></div>
  <div class="statcard"><div class="statname">Checkout</div><div class="ok">operational</div></div>
  <div class="statcard"><div class="statname">Storage</div><div class="ok">operational</div></div>
  <div class="statcard"><div class="statname">Support desk</div><div class="ok">operational</div></div>
</div>

<fieldset>
  <legend>Full report</legend>
  <button onclick="call('GET','/api/debug/diagnostics')">Refresh report</button>
  <p class="dim tiny">Returns the raw service report as JSON.</p>
</fieldset>

<pre id="out" class="dim">the service report appears here</pre>
`

module.exports = {
  routes: [
    { method: 'GET', path: '/api/debug/diagnostics', handler: diagnostics },
    { method: 'GET', path: '/api/debug/routes', handler: routes },
  ],
  pages: [{ path: '/ui/diagnostics', title: 'System status', body: PAGE }],
}
