// Minimal server-rendered UI for the NeonCart app.
//
// Every module can ship its own pages by exporting
//   pages: [{ path: '/ui/auth', title: 'Authentication', body: '<html>' }]
// The shell below wraps them, keeps the look consistent and gives the player
// a tiny helper for calling the API from the browser.

const STYLES = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #0b0e14; color: #d7dce6;
         font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 14px; }
  header { padding: 14px 20px; border-bottom: 1px solid #232a38; display: flex;
           gap: 18px; align-items: baseline; flex-wrap: wrap; }
  header h1 { margin: 0; font-size: 16px; color: #5eead4; }
  header .tag { color: #7a8399; font-size: 12px; }
  nav { padding: 10px 20px; border-bottom: 1px solid #232a38; display: flex;
        gap: 8px; flex-wrap: wrap; }
  nav a { color: #7a8399; text-decoration: none; border: 1px solid #232a38;
          border-radius: 999px; padding: 5px 12px; font-size: 12px; }
  nav a:hover { color: #22d3ee; border-color: #22d3ee; }
  main { padding: 20px; max-width: 880px; }
  h2 { font-size: 15px; margin: 0 0 6px; }
  p.hint { color: #7a8399; font-size: 12px; margin: 0 0 16px; line-height: 1.5; }
  fieldset { border: 1px solid #232a38; border-radius: 10px; margin: 0 0 16px;
             padding: 14px 16px; }
  legend { color: #22d3ee; font-size: 12px; padding: 0 6px; }
  label { display: block; color: #7a8399; font-size: 12px; margin: 10px 0 4px; }
  input, textarea, select { width: 100%; background: #0e1219; color: #d7dce6;
    border: 1px solid #232a38; border-radius: 8px; padding: 8px 10px;
    font: inherit; }
  textarea { min-height: 70px; resize: vertical; }
  button { background: #5eead4; color: #06251f; border: 0; border-radius: 8px;
           padding: 8px 14px; font: inherit; font-weight: 700; cursor: pointer;
           margin-top: 10px; }
  button.ghost { background: transparent; color: #7a8399; border: 1px solid #232a38;
                 font-weight: 400; }
  pre { background: #0e1219; border: 1px solid #232a38; border-radius: 8px;
        padding: 12px; overflow: auto; font-size: 12px; min-height: 40px;
        white-space: pre-wrap; word-break: break-word; }
  .ok { color: #34d399; } .err { color: #f87171; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 16px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #232a38;
           font-size: 13px; }
  th { color: #7a8399; font-size: 11px; text-transform: uppercase; }
  .flag { color: #5eead4; font-weight: 700; }
  .row { display: flex; gap: 10px; flex-wrap: wrap; }
  .row > * { flex: 1; min-width: 180px; }
  .row2 { display: flex; gap: 24px; flex-wrap: wrap; }
  .row2 > div { flex: 1; min-width: 150px; }
  .lbl { color: #7a8399; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
  .tiny { font-size: 11.5px; }
  .cards { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; }
  .statcard { background: #0e1219; border: 1px solid #232a38; border-radius: 10px; padding: 12px 16px; flex: 1; min-width: 150px; }
  .statname { color: #7a8399; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
  .statcard .ok { color: #34d399; font-size: 13px; }
  .product { background: #0e1219; border: 1px solid #232a38; border-radius: 10px; padding: 12px 14px; margin-bottom: 10px; }
  .pname { font-weight: 700; }
  .pblurb { color: #7a8399; font-size: 12.5px; margin: 3px 0 10px; }
  .prow { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .pprice { color: #5eead4; font-weight: 700; }
  button.small { padding: 5px 10px; font-size: 12px; margin-top: 0; }
  .cartline { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #232a38; font-size: 13px; }
  .carttotal { margin: 12px 0 0; color: #d7dce6; }
  .carttotal span { color: #5eead4; font-weight: 700; font-size: 16px; }
  .ticketrow { display: flex; gap: 12px; padding: 8px 0; border-bottom: 1px solid #232a38; color: #d7dce6; text-decoration: none; }
  .ticketrow:hover { color: #22d3ee; }
  .ticketrow .tid { color: #7a8399; min-width: 36px; }
  .ticketview { background: #0e1219; border: 1px solid #232a38; border-radius: 10px; padding: 14px 16px; margin-bottom: 16px; }
  .ticketview h3 { margin: 4px 0 6px; }
  .ticketview p { color: #d7dce6; margin: 0; white-space: pre-wrap; }
  .filerow { padding: 6px 0; border-bottom: 1px solid #232a38; }
  .filerow a { color: #22d3ee; text-decoration: none; }
  .filerow a:hover { text-decoration: underline; }
  .appfoot {
    display: flex; gap: 16px; align-items: center; flex-wrap: wrap;
    padding: 18px 20px; border-top: 1px solid #232a38; margin-top: 30px;
    color: #55607a; font-size: 12px;
  }
  .appfoot a { color: #55607a; text-decoration: none; }
  .appfoot a:hover { color: #22d3ee; }
  .appfoot span { margin-left: auto; }
`

function shell({ title, body, nav = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} - NeonCart</title>
<style>${STYLES}</style>
<script>
// tiny helper the pages use to call the API from the browser
async function call(method, path, body, out) {
  const target = out || document.getElementById('out');
  try {
    const res = await fetch(path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(window.neonToken ? { authorization: 'Bearer ' + window.neonToken } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    if (target) {
      target.textContent = 'HTTP ' + res.status + '\\n' +
        (typeof data === 'string' ? data : JSON.stringify(data, null, 2));
      target.className = res.ok ? 'ok' : 'err';
    }
    if (typeof data === 'object' && data && data.__token) {
      window.neonToken = data.__token;
      const t = document.getElementById('tokenbox');
      if (t) t.textContent = window.neonToken;
    }
    return data;
  } catch (e) {
    if (target) { target.textContent = String(e); target.className = 'err'; }
    return null;
  }
}
</script>
</head>
<body>
<header>
  <h1>NeonCart</h1>
  <span class="tag">built by AI agents. shipped too fast.</span>
</header>
<nav>${nav}</nav>
<main>
${body}
</main>
<footer class="appfoot">
  <a href="/api/routes">API routes</a>
  <a href="/logs">Server logs</a>
  <span>NeonCart &middot; built by AI agents, shipped too fast</span>
</footer>
</body>
</html>`
}

module.exports = { shell }
