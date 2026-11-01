// NeonCart application logger.
//
// Every request and every internal decision is logged to the console and to
// logs/app.log inside the app folder. The app also serves the same lines at
// /logs, so the player never has to leave the browser to read them.

const fs = require('fs')
const path = require('path')

const LOG_DIR = path.join(__dirname, '..', 'logs')
const LOG_FILE = path.join(LOG_DIR, 'app.log')

// How chatty the log is.
//   debug  - everything, including the server's internal reasoning (default)
//   info   - requests and operational events only
//   warn   - problems only
//   silent - nothing but errors
// Set LOG_LEVEL=info for a cohort that should find the bug by reading the code.
const RANK = { debug: 10, info: 20, warn: 30, error: 40 }
const LEVEL = (process.env.LOG_LEVEL || 'debug').toLowerCase()
const THRESHOLD = RANK[LEVEL] || RANK.debug

function write(level, tag, msg) {
  if ((RANK[level] || 0) < THRESHOLD) return
  const entry = { t: Date.now(), level, tag, msg: String(msg) }
  const stamp = new Date(entry.t).toISOString()
  const label = (level || 'info').toUpperCase()
  console.log(`${stamp} ${label} [${tag}] ${entry.msg}`)

  try {
    fs.mkdirSync(LOG_DIR, { recursive: true })
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n')
  } catch {
    // logging must never break the app
  }
}

function request(method, path, status) {
  write('info', 'http', `${method} ${path} -> ${status}`)
}

function tail(limit = 200) {
  try {
    const lines = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n')
    return lines.slice(-limit).filter(Boolean)
  } catch {
    return []
  }
}

module.exports = {
  // internal reasoning - only shown at LOG_LEVEL=debug
  debug: (tag, msg) => write('debug', tag, msg),
  info: (tag, msg) => write('info', tag, msg),
  warn: (tag, msg) => write('warn', tag, msg),
  error: (tag, msg) => write('error', tag, msg),
  request,
  tail,
  level: LEVEL,
}
