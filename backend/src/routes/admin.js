const express = require('express');
const db = require('../db');
const { getProducts, setProductOverride } = require('../db');
const { requireAdmin } = require('../auth');

const router = express.Router();
router.use(requireAdmin);

const ORDER_STATUSES = ['placed', 'paid', 'shipped', 'delivered', 'cancelled'];
const EDITABLE_PRODUCT_FIELDS = ['title', 'price', 'compareAt', 'available', 'type'];

// GET /api/admin/orders — every order, across all customers/guests
router.get('/orders', (req, res) => {
  const data = db.load();
  const orders = data.orders.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ items: orders });
});

// PATCH /api/admin/orders/:id  { status }
router.patch('/orders/:id', (req, res) => {
  const { status } = req.body || {};
  if (!ORDER_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'status must be one of: ' + ORDER_STATUSES.join(', ') });
  }
  const data = db.load();
  const order = data.orders.find((o) => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  order.status = status;
  db.save();
  res.json(order);
});

// PATCH /api/admin/products/:handle  { title, price, compareAt, available, type }
router.patch('/products/:handle', (req, res) => {
  const exists = getProducts().find((p) => p.handle === req.params.handle);
  if (!exists) return res.status(404).json({ error: 'Product not found' });

  const fields = {};
  EDITABLE_PRODUCT_FIELDS.forEach((key) => {
    if (req.body && req.body[key] !== undefined) fields[key] = req.body[key];
  });
  if (fields.price !== undefined) fields.price = Number(fields.price);
  if (fields.compareAt !== undefined) fields.compareAt = fields.compareAt === null ? null : Number(fields.compareAt);
  if (fields.available !== undefined) fields.available = Boolean(fields.available);

  const updated = setProductOverride(req.params.handle, fields);
  res.json(updated);
});

module.exports = router;
