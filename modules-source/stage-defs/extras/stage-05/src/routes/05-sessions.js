// NeonCart session tokens (shipped by the AI agents in stage 05).
// Tokens look like "<base64url payload>.<signature>" and every request that
// needs a session sends them as "Authorization: Bearer <token>".

const crypto = require('crypto')
const log = require('../logger')
const { readLicense, deriveFlag } = require('../flaglib')

const SALT = '__MODULE_SALT_05__'

// The signing key. In a real deployment this comes from the environment; the
// agents inlined it so the "helpers" could be dropped anywhere.
const SESSION_SECRET = 'neoncart-session-secret-9f2c'

function parseJsonBody(body) {
  if (!body) return {}
  try {
    return JSON.parse(body)
  } catch {
    return {}
  }
}

function json(res, code, obj) {
  res.writeHead(code, { 'content-type': 'application/json' })
  res.end(JSON.stringify(obj))
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = crypto
    .createHash('sha256')
    .update(body + '.' + SESSION_SECRET)
    .digest('base64url')
    .slice(0, 16)
  return body + '.' + signature
}

// The agents wrote a "verify" helper that only looked at the shape of the
// token. The signature was never compared with anything.
function verify(token) {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  if (!parts[0] || !parts[1]) return null
  try {
    return JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

function bearer(req) {
  const header = req.headers.authorization || ''
  return header.startsWith('Bearer ') ? header.slice(7) : null
}

function issueSession(req, res, body) {
  const { user_id } = parseJsonBody(body)
  if (!user_id) return json(res, 400, { error: 'user_id required' })
  const token = sign({ user_id, role: 'user', issued_at: Date.now() })
  log.info('session', `session issued for user_id=${user_id}, payload signed`)
  json(res, 200, { token })
}

function whoami(req, res) {
  const payload = verify(bearer(req))
  if (!payload) return json(res, 401, { error: 'invalid session' })
  log.debug('session', `session accepted for user_id=${payload.user_id} role=${payload.role}`)
  json(res, 200, { user_id: payload.user_id, role: payload.role })
}

// Internal panel. Only staff tokens are supposed to open it.
function adminPanel(req, res) {
  const payload = verify(bearer(req))
  if (!payload) return json(res, 401, { error: 'invalid session' })
  if (payload.role !== 'admin') {
    log.debug('session', `internal panel refused: token role is "${payload.role}", panel needs "admin"`)
    return json(res, 403, { error: 'staff role required for the internal panel' })
  }
  log.info('session', 'internal panel opened with a staff token')
  json(res, 200, {
    panel: 'neoncart internal',
    staff_code: deriveFlag(readLicense().seed, SALT),
  })
}

const PAGE = `
<h2>Account</h2>
<p class="hint">Your profile, your session and the developer tools the NeonCart team uses to
debug their own apps.</p>

<fieldset>
  <legend>Profile</legend>
  <div class="row2">
    <div><div class="lbl">Name</div><div>Robin Vasquez</div></div>
    <div><div class="lbl">Email</div><div>robin@example.com</div></div>
    <div><div class="lbl">Plan</div><div>Standard</div></div>
  </div>
</fieldset>

<fieldset>
  <legend>Active session</legend>
  <p class="dim tiny">The token this browser is signed in with.</p>
  <input id="token" readonly>
  <div class="row2" style="margin-top:10px">
    <button onclick="call('GET','/api/session/whoami')">Check session</button>
  </div>
</fieldset>

<fieldset>
  <legend>Developer tools</legend>
  <p class="dim tiny">Internal staff use only.</p>
  <button class="ghost" onclick="call('GET','/api/admin/panel')">Open staff panel</button>
</fieldset>

<pre id="out" class="dim"></pre>

<script>
(async function () {
  const d = await call('POST', '/api/session/issue', { user_id: 42 });
  if (d && d.token) {
    document.getElementById('token').value = d.token;
    window.neonToken = d.token;
  }
})();
</script>
`

module.exports = {
  routes: [
    { method: 'POST', path: '/api/session/issue', handler: issueSession },
    { method: 'GET', path: '/api/session/whoami', handler: whoami },
    { method: 'GET', path: '/api/admin/panel', handler: adminPanel },
  ],
  pages: [{ path: '/ui/session', title: 'Account', body: PAGE }],
}
