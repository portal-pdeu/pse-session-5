// NeonCart support tickets (shipped by the AI agents in stage 02).
// Customers open tickets, staff reply. The list endpoint filters by owner;
// the detail endpoint was written earlier and never got the same treatment.

const log = require('../logger')
const { readLicense, deriveFlag } = require('../flaglib')

const SALT = '__MODULE_SALT_02__'

// The signed demo account of the session runner. Every request acts as this
// customer unless the request says otherwise.
const DEMO_USER = 'guest'

const TICKETS = [
  {
    id: 1,
    owner: 'staff',
    subject: 'Incident report 4711',
    body:
      'Internal incident report 4711. Payment provider key rotated, ' +
      'staff handover code: ' +
      deriveFlag(readLicense().seed, SALT),
  },
  { id: 2, owner: DEMO_USER, subject: 'Where is my drone?', body: 'It says delivered but nothing arrived.' },
  { id: 3, owner: DEMO_USER, subject: 'Change my email', body: 'Please change my email address.' },
]

function json(res, code, obj) {
  res.writeHead(code, { 'content-type': 'application/json' })
  res.end(JSON.stringify(obj))
}

function listTickets(req, res) {
  const mine = TICKETS.filter((t) => t.owner === DEMO_USER)
  log.info('tickets', `listing tickets for "${DEMO_USER}" (${mine.length} shown)`)
  json(res, 200, { tickets: mine })
}

function getTicket(req, res, body, url) {
  const id = Number(url.searchParams.get('id'))
  const ticket = TICKETS.find((t) => t.id === id)
  if (!ticket) {
    log.warn('tickets', `ticket ${id} not found`)
    return json(res, 404, { error: 'ticket not found' })
  }
  log.debug('tickets', `opened ticket ${id} (owner: ${ticket.owner})`)
  json(res, 200, { ticket })
}

// A customer can open a ticket of their own.
function createTicket(req, res, body) {
  let payload = {}
  try {
    payload = JSON.parse(body || '{}')
  } catch {
    payload = {}
  }
  const subject = String(payload.subject || '').trim()
  const message = String(payload.message || '').trim()
  if (!subject) return json(res, 400, { error: 'subject required' })
  const ticket = { id: TICKETS.length + 1, owner: DEMO_USER, subject, body: message }
  TICKETS.push(ticket)
  log.info('tickets', `ticket ${ticket.id} opened by "${DEMO_USER}"`)
  json(res, 200, { ticket })
}

const PAGE = `
<h2>Support</h2>
<p class="hint">Your open requests. Our team replies within one business day.</p>

<div id="ticket-detail"></div>

<fieldset>
  <legend>Your requests</legend>
  <div id="tks" class="dim">loading…</div>
</fieldset>

<fieldset>
  <legend>Open a request</legend>
  <label>Subject</label>
  <input id="subject" placeholder="Short summary">
  <label>Message</label>
  <textarea id="message" rows="3" placeholder="Tell us what happened"></textarea>
  <button onclick="sendTicket()">Send request</button>
</fieldset>

<pre id="out" class="dim"></pre>

<script>
async function loadTickets() {
  const d = await call('GET', '/api/tickets');
  const list = d.tickets || [];
  document.getElementById('tks').innerHTML = list.length
    ? list.map(t => '<a class="ticketrow" href="/ui/tickets?id=' + t.id + '">' +
        '<span class="tid">#' + t.id + '</span><span class="tsub">' + t.subject + '</span></a>').join('')
    : '<div class="dim">no requests yet</div>';
  const id = new URLSearchParams(location.search).get('id');
  if (id) {
    const r = await call('GET', '/api/tickets/detail?id=' + encodeURIComponent(id));
    if (r && r.ticket) {
      document.getElementById('ticket-detail').innerHTML =
        '<div class="ticketview"><div class="tid">#' + r.ticket.id + '</div>' +
        '<h3>' + r.ticket.subject + '</h3><p>' + r.ticket.body + '</p></div>';
    }
  }
}
async function sendTicket() {
  const r = await call('POST', '/api/tickets', {
    subject: document.getElementById('subject').value,
    message: document.getElementById('message').value,
  });
  if (r && r.ticket) { document.getElementById('subject').value = ''; document.getElementById('message').value = ''; loadTickets(); }
}
loadTickets();
</script>
`

module.exports = {
  routes: [
    { method: 'GET', path: '/api/tickets', handler: listTickets },
    { method: 'GET', path: '/api/tickets/detail', handler: getTicket },
    { method: 'POST', path: '/api/tickets', handler: createTicket },
  ],
  pages: [{ path: '/ui/tickets', title: 'Support', body: PAGE }],
}
