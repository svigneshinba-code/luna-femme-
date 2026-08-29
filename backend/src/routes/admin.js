const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../auth');

const router = express.Router();
router.use(requireAdmin);

const ORDER_STATUSES = ['placed', 'paid', 'shipped', 'delivered', 'cancelled'];
const EDITABLE_PRODUCT_FIELDS = ['title', 'price', 'compareAt', 'available', 'type'];

// GET /api/admin/orders — every order, across all customers/guests
router.get('/orders', async (req, res, next) => {
  try {
    const orders = await db.findAllOrders();
    res.json({ items: orders });
  } catch (err) { next(err); }
});

// PATCH /api/admin/orders/:id  { status }
router.patch('/orders/:id', async (req, res, next) => {
  try {
    const { status } = req.body || {};
    if (!ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'status must be one of: ' + ORDER_STATUSES.join(', ') });
    }
    const order = await db.updateOrderStatus(req.params.id, status);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) { next(err); }
});

// PATCH /api/admin/products/:handle  { title, price, compareAt, available, type }
router.patch('/products/:handle', async (req, res, next) => {
  try {
    const products = await db.getProducts();
    const exists = products.find((p) => p.handle === req.params.handle);
    if (!exists) return res.status(404).json({ error: 'Product not found' });

    const fields = {};
    EDITABLE_PRODUCT_FIELDS.forEach((key) => {
      if (req.body && req.body[key] !== undefined) fields[key] = req.body[key];
    });
    if (fields.price !== undefined) fields.price = Number(fields.price);
    if (fields.compareAt !== undefined) fields.compareAt = fields.compareAt === null ? null : Number(fields.compareAt);
    if (fields.available !== undefined) fields.available = Boolean(fields.available);

    const updated = await db.setProductOverride(req.params.handle, fields);
    res.json(updated);
  } catch (err) { next(err); }
});

module.exports = router;
