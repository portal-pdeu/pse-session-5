// NeonCart checkout (shipped by the AI agents in stage 03).
// The catalog, the cart and the checkout endpoint. The agents also added an
// internal "manual discount" path so support could fix broken orders.

const log = require('../logger')
const { readLicense, deriveFlag } = require('../flaglib')

const SALT = '__MODULE_SALT_03__'

const CATALOG = {
  'neon-drone': { name: 'NeonCart Drone', price: 199, blurb: 'Hovers. Judges your posture.' },
  'glow-mug': { name: 'Glow Mug', price: 12, blurb: 'Keeps coffee slightly radioactive.' },
  'pixel-poster': { name: 'Pixel Poster', price: 25, blurb: 'A cat, in 64 colours.' },
}

const ORDERS = []

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

function catalog(req, res) {
  json(res, 200, { items: Object.entries(CATALOG).map(([id, item]) => ({ id, ...item })) })
}

function checkout(req, res, body) {
  const { item_id, quantity, amount } = parseJsonBody(body)
  const item = CATALOG[item_id]
  if (!item) return json(res, 400, { error: 'unknown item' })
  const qty = Math.max(1, Number(quantity) || 1)
  const expected = item.price * qty

  // The agents let the client send the amount it wants to pay, because the
  // mobile app "already calculated it".
  const total = amount === undefined ? expected : Number(amount)

  if (total < expected) {
    // Support fix path: orders below list price are re-priced by the internal
    // coupon engine and logged with the internal promo code.
    const order = { id: ORDERS.length + 1, item_id, total, discounted: true }
    ORDERS.push(order)
    log.debug('billing', `order ${order.id} paid ${total} instead of ${expected} - re-priced by the internal coupon engine`)
    return json(res, 200, {
      order_id: order.id,
      charged: total,
      discount_applied: true,
      internal_coupon: deriveFlag(readLicense().seed, SALT),
    })
  }

  const order = { id: ORDERS.length + 1, item_id, total, discounted: false }
  ORDERS.push(order)
  log.info('billing', `order ${order.id} paid normally: ${total}`)
  json(res, 200, { order_id: order.id, charged: total, discount_applied: false })
}

function orders(req, res) {
  json(res, 200, { orders: ORDERS })
}

const PAGE = `
<h2>Checkout</h2>
<p class="hint">Everything ships free from the NeonCart warehouse. Orders are usually
confirmed within a minute.</p>

<fieldset>
  <legend>Catalog</legend>
  <div id="items" class="dim">loading…</div>
</fieldset>

<fieldset>
  <legend>Your cart</legend>
  <div id="cart" class="dim">Your cart is empty.</div>
  <div class="carttotal">Total <span id="total">$0.00</span></div>
  <button onclick="pay()" id="paybtn" disabled>Place order</button>
</fieldset>

<pre id="out" class="dim"></pre>

<script>
let cart = [];
const catalog = {};

async function loadCatalog() {
  const d = await call('GET', '/api/catalog');
  document.getElementById('items').innerHTML = (d.items || []).map(function (i) {
    catalog[i.id] = i;
    return '<div class="product"><div class="pname">' + i.name + '</div>' +
      '<div class="pblurb">' + i.blurb + '</div>' +
      '<div class="prow"><span class="pprice">$' + i.price + '.00</span>' +
      '<button class="ghost small" onclick="add(\\'' + i.id + '\\')">Add to cart</button></div></div>';
  }).join('');
}

function cartTotal() {
  return cart.reduce(function (sum, id) { return sum + catalog[id].price; }, 0);
}

function add(id) {
  cart.push(id);
  document.getElementById('cart').innerHTML = cart.map(function (id) {
    return '<div class="cartline"><span>' + catalog[id].name + '</span><span>$' + catalog[id].price + '.00</span></div>';
  }).join('');
  document.getElementById('total').textContent = '$' + cartTotal().toFixed(2);
  document.getElementById('paybtn').disabled = false;
}

async function pay() {
  await call('POST', '/api/checkout', {
    item_id: cart[0],
    quantity: cart.length,
    amount: cartTotal(),
  });
}

loadCatalog();
</script>
`

module.exports = {
  routes: [
    { method: 'GET', path: '/api/catalog', handler: catalog },
    { method: 'POST', path: '/api/checkout', handler: checkout },
    { method: 'GET', path: '/api/orders', handler: orders },
  ],
  pages: [{ path: '/ui/checkout', title: 'Checkout', body: PAGE }],
}
