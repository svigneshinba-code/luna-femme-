const express = require('express');
const db = require('../db');
const { getProducts } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

function getWishlist(ownerId) {
  const data = db.load();
  return data.wishlists[ownerId] || [];
}

function setWishlist(ownerId, handles) {
  const data = db.load();
  data.wishlists[ownerId] = handles;
  db.save();
}

function hydrate(handles) {
  const products = getProducts();
  const items = handles
    .map((handle) => products.find((p) => p.handle === handle))
    .filter(Boolean);
  return { items, count: items.length };
}

// GET /api/wishlist
router.get('/', (req, res) => {
  res.json(hydrate(getWishlist(req.ownerId)));
});

// POST /api/wishlist/items  { handle }
router.post('/items', (req, res) => {
  const { handle } = req.body || {};
  if (!handle) return res.status(400).json({ error: 'handle is required' });

  const product = getProducts().find((p) => p.handle === handle);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const handles = getWishlist(req.ownerId);
  if (!handles.includes(handle)) handles.push(handle);
  setWishlist(req.ownerId, handles);
  res.status(201).json(hydrate(handles));
});

// DELETE /api/wishlist/items/:handle
router.delete('/items/:handle', (req, res) => {
  const handles = getWishlist(req.ownerId).filter((h) => h !== req.params.handle);
  setWishlist(req.ownerId, handles);
  res.json(hydrate(handles));
});

// POST /api/wishlist/items/:handle/toggle  — convenience for a single heart button
router.post('/items/:handle/toggle', (req, res) => {
  const { handle } = req.params;
  const product = getProducts().find((p) => p.handle === handle);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  let handles = getWishlist(req.ownerId);
  const inWishlist = handles.includes(handle);
  handles = inWishlist ? handles.filter((h) => h !== handle) : [...handles, handle];
  setWishlist(req.ownerId, handles);
  res.json({ inWishlist: !inWishlist, ...hydrate(handles) });
});

// POST /api/wishlist/merge — fold the pre-login guest wishlist (if any) into
// the now-authenticated user's wishlist. Call this once right after login/signup.
router.post('/merge', requireAuth, (req, res) => {
  if (!req.guestOwnerId || req.guestOwnerId === req.ownerId) {
    return res.json(hydrate(getWishlist(req.ownerId)));
  }

  const guestHandles = getWishlist(req.guestOwnerId);
  if (guestHandles.length === 0) {
    return res.json(hydrate(getWishlist(req.ownerId)));
  }

  const handles = getWishlist(req.ownerId);
  guestHandles.forEach((handle) => {
    if (!handles.includes(handle)) handles.push(handle);
  });

  setWishlist(req.ownerId, handles);
  setWishlist(req.guestOwnerId, []);
  res.json(hydrate(handles));
});

module.exports = router;
