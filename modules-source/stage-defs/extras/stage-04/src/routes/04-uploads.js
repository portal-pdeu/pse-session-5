// NeonCart file storage (shipped by the AI agents in stage 04).
// Users upload avatars and other assets; anyone can download a file by name.

const fs = require('fs')
const path = require('path')
const log = require('../logger')
const { readLicense, deriveFlag } = require('../flaglib')

const SALT = '__MODULE_SALT_04__'

const STORAGE_DIR = path.join(__dirname, '..', '..', 'storage')
const UPLOAD_DIR = path.join(STORAGE_DIR, 'uploads')
const PRIVATE_DIR = path.join(STORAGE_DIR, 'private')

function json(res, code, obj) {
  res.writeHead(code, { 'content-type': 'application/json' })
  res.end(JSON.stringify(obj))
}

function parseJsonBody(body) {
  if (!body) return {}
  try {
    return JSON.parse(body)
  } catch {
    return {}
  }
}

// The agents sanitised the file name by stripping leading slashes and calling
// it a day. The name is still joined onto the upload directory as-is.
function safeName(name) {
  return String(name || '').replace(/^\/+/, '')
}

function init() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
  fs.mkdirSync(PRIVATE_DIR, { recursive: true })
  // The deployment writes the signed storage key here so the download service
  // can hand it to the storage backend.
  try {
    const vault = path.join(PRIVATE_DIR, 'vault.txt')
    fs.writeFileSync(vault, deriveFlag(readLicense().seed, SALT))
    log.info('storage', 'storage backend ready, signed key written to the private vault')
  } catch (e) {
    // no personal license installed (running straight from a repo checkout)
    log.warn('storage', 'no personal license found, private vault left empty')
  }
}

function upload(req, res, body) {
  const { name, content } = parseJsonBody(body)
  if (!name) return json(res, 400, { error: 'name required' })
  const target = path.join(UPLOAD_DIR, safeName(name))
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, String(content == null ? '' : content))
  log.info('storage', `stored file "${name}" as ${path.relative(STORAGE_DIR, target)}`)
  json(res, 200, { ok: true, stored: path.basename(target) })
}

function download(req, res, body, url) {
  const name = url.searchParams.get('name') || 'avatar.png'
  const target = path.join(UPLOAD_DIR, safeName(name))
  if (!fs.existsSync(target)) {
    log.warn('storage', `download refused, no file named "${name}"`)
    return json(res, 404, { error: 'file not found' })
  }
  log.debug('storage', `serving file "${name}" from ${path.relative(STORAGE_DIR, target)}`)
  res.writeHead(200, { 'content-type': 'text/plain' })
  res.end(fs.readFileSync(target, 'utf8'))
}

// Everything the signed-in customer has uploaded.
function listFiles(req, res) {
  let files = []
  try {
    files = fs.readdirSync(UPLOAD_DIR).filter((f) => fs.statSync(path.join(UPLOAD_DIR, f)).isFile())
  } catch {
    files = []
  }
  log.info('storage', `listed ${files.length} file(s) for the gallery`)
  json(res, 200, { files })
}

const PAGE = `
<h2>Profile</h2>
<p class="hint">Your account details and the files you have uploaded. Avatars are shown on
your public profile page.</p>

<fieldset>
  <legend>Account</legend>
  <div class="row2">
    <div><div class="lbl">Name</div><div>Robin Vasquez</div></div>
    <div><div class="lbl">Email</div><div>robin@example.com</div></div>
    <div><div class="lbl">Member since</div><div>March 2026</div></div>
  </div>
</fieldset>

<fieldset>
  <legend>Profile picture</legend>
  <div class="row2">
    <div><label>Upload a new picture</label><input id="fname" value="avatar.png"></div>
    <div><label>File</label><input id="fcontent" value="hello neon"></div>
  </div>
  <button onclick="call('POST','/api/files/upload',{name:document.getElementById('fname').value,content:document.getElementById('fcontent').value}).then(loadFiles)">Upload</button>
</fieldset>

<fieldset>
  <legend>Your files</legend>
  <div id="gallery" class="dim">loading…</div>
</fieldset>

<pre id="out" class="dim"></pre>

<script>
async function loadFiles() {
  const d = await call('GET', '/api/files/list');
  const files = d.files || [];
  document.getElementById('gallery').innerHTML = files.length
    ? files.map(f => '<div class="filerow"><a href="/api/files/download?name=' + encodeURIComponent(f) + '">' + f + '</a></div>').join('')
    : '<div class="dim">nothing uploaded yet</div>';
}
loadFiles();
</script>
`

module.exports = {
  init,
  routes: [
    { method: 'POST', path: '/api/files/upload', handler: upload },
    { method: 'GET', path: '/api/files/download', handler: download },
    { method: 'GET', path: '/api/files/list', handler: listFiles },
  ],
  pages: [{ path: '/ui/files', title: 'Profile', body: PAGE }],
}
