const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { getProducts } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

const FREE_SHIP_THRESHOLD = 1499;
const SHIP_COST = 79;

function computeTotals(lines) {
  const subtotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
  const shipping = subtotal >= FREE_SHIP_THRESHOLD || subtotal === 0 ? 0 : SHIP_COST;
  return { subtotal, shipping, total: subtotal + shipping };
}

// Builds the {handle, title, img, size, qty, price} lines for whatever is
// currently in req.ownerId's cart. Shared by the COD checkout route and the
// Razorpay order/verify routes so both price a payment off the same cart.
function getCartLines(ownerId) {
  const data = db.load();
  const cartItems = data.carts[ownerId] || [];
  const products = getProducts();
  return cartItems.map((line) => {
    const product = products.find((p) => p.handle === line.handle);
    return product && {
      handle: product.handle,
      title: product.title,
      img: product.img,
      size: line.size,
      qty: line.qty,
      price: product.price
    };
  }).filter(Boolean);
}

// Creates and stores the order, empties the cart, and returns it. Does not
// touch the response — callers (checkout / razorpay verify) send it back.
function placeOrder(req, lines, { paymentMethod, status, extra }) {
  const data = db.load();
  const order = Object.assign({
    id: uuidv4(),
    orderNumber: 'AVL' + Date.now().toString().slice(-8),
    ownerId: req.ownerId,
    userId: req.user ? req.user.id : null,
    items: lines,
    shipping: req.body.shipping,
    paymentMethod,
    totals: computeTotals(lines),
    status,
    createdAt: new Date().toISOString()
  }, extra || {});

  data.orders.push(order);
  data.carts[req.ownerId] = [];
  db.save();
  return order;
}

function validateShipping(shipping) {
  return shipping && shipping.name && shipping.phone && shipping.address && shipping.pincode;
}

// POST /api/orders/checkout
// body: { shipping: { name, phone, address, city, state, pincode }, paymentMethod: 'cod' }
router.post('/checkout', (req, res) => {
  const { shipping } = req.body || {};
  if (!validateShipping(shipping)) {
    return res.status(400).json({ error: 'shipping.name, phone, address and pincode are required' });
  }

  const lines = getCartLines(req.ownerId);
  if (lines.length === 0) return res.status(400).json({ error: 'Cart is empty or items are no longer available' });

  const order = placeOrder(req, lines, { paymentMethod: 'cod', status: 'placed' });
  res.status(201).json(order);
});

// GET /api/orders  — order history for the current owner (guest or logged-in)
router.get('/', (req, res) => {
  const data = db.load();
  const orders = data.orders
    .filter((o) => o.ownerId === req.ownerId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ items: orders });
});

// GET /api/orders/:id
router.get('/:id', (req, res) => {
  const data = db.load();
  const order = data.orders.find((o) => o.id === req.params.id && o.ownerId === req.ownerId);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

module.exports = router;
module.exports.computeTotals = computeTotals;
module.exports.getCartLines = getCartLines;
module.exports.placeOrder = placeOrder;
module.exports.validateShipping = validateShipping;
