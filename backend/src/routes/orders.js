const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

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
async function getCartLines(ownerId) {
  const cartItems = await db.getCart(ownerId);
  const products = await db.getProducts();
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
async function placeOrder(req, lines, { paymentMethod, status, extra }) {
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

  await db.insertOrder(order);
  await db.setCart(req.ownerId, []);
  return order;
}

function validateShipping(shipping) {
  return shipping && shipping.name && shipping.phone && shipping.address && shipping.pincode;
}

// POST /api/orders/checkout
// body: { shipping: { name, phone, address, city, state, pincode }, paymentMethod: 'cod' }
router.post('/checkout', async (req, res, next) => {
  try {
    const { shipping } = req.body || {};
    if (!validateShipping(shipping)) {
      return res.status(400).json({ error: 'shipping.name, phone, address and pincode are required' });
    }

    const lines = await getCartLines(req.ownerId);
    if (lines.length === 0) return res.status(400).json({ error: 'Cart is empty or items are no longer available' });

    const order = await placeOrder(req, lines, { paymentMethod: 'cod', status: 'placed' });
    res.status(201).json(order);
  } catch (err) { next(err); }
});

// GET /api/orders  — order history for the current owner (guest or logged-in)
router.get('/', async (req, res, next) => {
  try {
    const orders = await db.findOrdersByOwner(req.ownerId);
    res.json({ items: orders });
  } catch (err) { next(err); }
});

// GET /api/orders/:id
router.get('/:id', async (req, res, next) => {
  try {
    const order = await db.findOrderByIdForOwner(req.params.id, req.ownerId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) { next(err); }
});

module.exports = router;
module.exports.computeTotals = computeTotals;
module.exports.getCartLines = getCartLines;
module.exports.placeOrder = placeOrder;
module.exports.validateShipping = validateShipping;
