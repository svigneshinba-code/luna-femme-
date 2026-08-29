const express = require('express');
const db = require('../db');
const { getProducts } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

function getCart(ownerId) {
  const data = db.load();
  return data.carts[ownerId] || [];
}

function setCart(ownerId, items) {
  const data = db.load();
  data.carts[ownerId] = items;
  db.save();
}

// Attach product details + a computed subtotal to the raw {handle,size,qty} lines.
function hydrate(items) {
  const products = getProducts();
  const lines = items.map((line) => {
    const product = products.find((p) => p.handle === line.handle);
    return { ...line, product: product || null, lineTotal: product ? product.price * line.qty : 0 };
  }).filter((line) => line.product); // drop lines whose product disappeared

  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  return { items: lines, subtotal, count: lines.reduce((n, l) => n + l.qty, 0) };
}

// GET /api/cart
router.get('/', (req, res) => {
  res.json(hydrate(getCart(req.ownerId)));
});

// POST /api/cart/items  { handle, size, qty }
router.post('/items', (req, res) => {
  const { handle, size = 'ONE SIZE', qty = 1 } = req.body || {};
  if (!handle) return res.status(400).json({ error: 'handle is required' });

  const product = getProducts().find((p) => p.handle === handle);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  if (!product.available) return res.status(400).json({ error: 'Product is out of stock' });

  const items = getCart(req.ownerId);
  const existing = items.find((l) => l.handle === handle && l.size === size);
  if (existing) existing.qty += Number(qty) || 1;
  else items.push({ handle, size, qty: Number(qty) || 1 });

  setCart(req.ownerId, items);
  res.status(201).json(hydrate(items));
});

// PATCH /api/cart/items/:handle/:size  { qty }
router.patch('/items/:handle/:size', (req, res) => {
  const { handle, size } = req.params;
  const { qty } = req.body || {};
  if (qty === undefined) return res.status(400).json({ error: 'qty is required' });

  let items = getCart(req.ownerId);
  const line = items.find((l) => l.handle === handle && l.size === size);
  if (!line) return res.status(404).json({ error: 'Item not in cart' });

  if (Number(qty) <= 0) {
    items = items.filter((l) => !(l.handle === handle && l.size === size));
  } else {
    line.qty = Number(qty);
  }
  setCart(req.ownerId, items);
  res.json(hydrate(items));
});

// DELETE /api/cart/items/:handle/:size
router.delete('/items/:handle/:size', (req, res) => {
  const { handle, size } = req.params;
  const items = getCart(req.ownerId).filter((l) => !(l.handle === handle && l.size === size));
  setCart(req.ownerId, items);
  res.json(hydrate(items));
});

// DELETE /api/cart  (empty it out, e.g. after checkout)
router.delete('/', (req, res) => {
  setCart(req.ownerId, []);
  res.json(hydrate([]));
});

// POST /api/cart/merge  — fold the pre-login guest cart (if any) into the
// now-authenticated user's cart. Matching handle+size lines have their
// quantities summed. Call this once right after login/signup.
router.post('/merge', requireAuth, (req, res) => {
  if (!req.guestOwnerId || req.guestOwnerId === req.ownerId) {
    return res.json(hydrate(getCart(req.ownerId)));
  }

  const guestItems = getCart(req.guestOwnerId);
  if (guestItems.length === 0) {
    return res.json(hydrate(getCart(req.ownerId)));
  }

  const items = getCart(req.ownerId);
  guestItems.forEach((line) => {
    const existing = items.find((l) => l.handle === line.handle && l.size === line.size);
    if (existing) existing.qty += line.qty;
    else items.push({ handle: line.handle, size: line.size, qty: line.qty });
  });

  setCart(req.ownerId, items);
  setCart(req.guestOwnerId, []);
  res.json(hydrate(items));
});

module.exports = router;
