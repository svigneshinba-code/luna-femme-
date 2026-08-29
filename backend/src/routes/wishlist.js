const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

async function hydrate(handles) {
  const products = await db.getProducts();
  const items = handles
    .map((handle) => products.find((p) => p.handle === handle))
    .filter(Boolean);
  return { items, count: items.length };
}

// GET /api/wishlist
router.get('/', async (req, res, next) => {
  try {
    res.json(await hydrate(await db.getWishlist(req.ownerId)));
  } catch (err) { next(err); }
});

// POST /api/wishlist/items  { handle }
router.post('/items', async (req, res, next) => {
  try {
    const { handle } = req.body || {};
    if (!handle) return res.status(400).json({ error: 'handle is required' });

    const products = await db.getProducts();
    const product = products.find((p) => p.handle === handle);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const handles = await db.getWishlist(req.ownerId);
    if (!handles.includes(handle)) handles.push(handle);
    await db.setWishlist(req.ownerId, handles);
    res.status(201).json(await hydrate(handles));
  } catch (err) { next(err); }
});

// DELETE /api/wishlist/items/:handle
router.delete('/items/:handle', async (req, res, next) => {
  try {
    const handles = (await db.getWishlist(req.ownerId)).filter((h) => h !== req.params.handle);
    await db.setWishlist(req.ownerId, handles);
    res.json(await hydrate(handles));
  } catch (err) { next(err); }
});

// POST /api/wishlist/items/:handle/toggle  — convenience for a single heart button
router.post('/items/:handle/toggle', async (req, res, next) => {
  try {
    const { handle } = req.params;
    const products = await db.getProducts();
    const product = products.find((p) => p.handle === handle);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    let handles = await db.getWishlist(req.ownerId);
    const inWishlist = handles.includes(handle);
    handles = inWishlist ? handles.filter((h) => h !== handle) : [...handles, handle];
    await db.setWishlist(req.ownerId, handles);
    res.json({ inWishlist: !inWishlist, ...(await hydrate(handles)) });
  } catch (err) { next(err); }
});

// POST /api/wishlist/merge — fold the pre-login guest wishlist (if any) into
// the now-authenticated user's wishlist. Call this once right after login/signup.
router.post('/merge', requireAuth, async (req, res, next) => {
  try {
    if (!req.guestOwnerId || req.guestOwnerId === req.ownerId) {
      return res.json(await hydrate(await db.getWishlist(req.ownerId)));
    }

    const guestHandles = await db.getWishlist(req.guestOwnerId);
    if (guestHandles.length === 0) {
      return res.json(await hydrate(await db.getWishlist(req.ownerId)));
    }

    const handles = await db.getWishlist(req.ownerId);
    guestHandles.forEach((handle) => {
      if (!handles.includes(handle)) handles.push(handle);
    });

    await db.setWishlist(req.ownerId, handles);
    await db.setWishlist(req.guestOwnerId, []);
    res.json(await hydrate(handles));
  } catch (err) { next(err); }
});

module.exports = router;
