// NeonCart storefront (the first thing the AI agents shipped).
// Stage 00 is the skeleton: the shop front, the navigation and the layout.
// Every later module adds one more area to this app.
//
// The deployment stamps the build key into the storefront, so the home page
// carries this session's first flag. It is derived from the player's own
// license seed, so it is different for every participant, and it is only
// printed when the personal license is installed.

const { readLicense, deriveFlag } = require('../flaglib')

const SALT = '__MODULE_SALT_00__'

const FEATURED = [
  { id: 'neon-drone', name: 'NeonCart Drone', price: 199, blurb: 'Hovers. Judges your posture.' },
  { id: 'glow-mug', name: 'Glow Mug', price: 12, blurb: 'Keeps coffee slightly radioactive.' },
  { id: 'pixel-poster', name: 'Pixel Poster', price: 25, blurb: 'A cat, in 64 colours.' },
]

// The build key the deployment left in the storefront.
function buildKey() {
  if (!SALT) return null
  try {
    return deriveFlag(readLicense().seed, SALT)
  } catch {
    // no personal license installed (running straight from a repo checkout)
    return null
  }
}

const KEY = buildKey()

const PAGE = `
<h2>NeonCart</h2>
<p class="hint">Everything we sell, delivered tomorrow. Free shipping over $50.</p>

<div class="cards">
  <div class="statcard"><div class="statname">Orders</div><div class="ok">open</div></div>
  <div class="statcard"><div class="statname">Shipping</div><div class="ok">next day</div></div>
  <div class="statcard"><div class="statname">Returns</div><div class="dim">30 days</div></div>
</div>

<fieldset>
  <legend>Featured</legend>
  <div id="featured">
    ${FEATURED.map(
      (p) => `<div class="product">
        <div class="pname">${p.name}</div>
        <div class="pblurb">${p.blurb}</div>
        <div class="prow"><span class="pprice">$${p.price}.00</span></div>
      </div>`,
    ).join('\n    ')}
  </div>
</fieldset>

<fieldset>
  <legend>Why NeonCart</legend>
  <div class="row2">
    <div><div class="lbl">Shipping</div><div>Next day, always</div></div>
    <div><div class="lbl">Support</div><div>Real humans, one business day</div></div>
    <div><div class="lbl">Payments</div><div>Card, wallet or invoice</div></div>
  </div>
</fieldset>

${
  KEY
    ? `<fieldset>
  <legend>Build information</legend>
  <div class="row2">
    <div><div class="lbl">Build</div><div>0.4.2-ai-preview</div></div>
    <div><div class="lbl">Build key</div><div class="flag">${KEY}</div></div>
  </div>
</fieldset>`
    : ''
}
`

module.exports = {
  pages: [{ path: '/ui/store', title: 'Storefront', body: PAGE }],
}
