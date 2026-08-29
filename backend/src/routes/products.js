const express = require('express');
const { getProducts } = require('../db');

const router = express.Router();

function matchesTag(product, tag) {
  return product.tags.some((t) => t.toLowerCase() === tag.toLowerCase());
}

function matchesSearch(product, q) {
  const needle = q.toLowerCase();
  return (
    product.title.toLowerCase().includes(needle) ||
    product.type.toLowerCase().includes(needle) ||
    product.tags.some((t) => t.toLowerCase().includes(needle))
  );
}

// GET /api/products?type=Dresses&tag=bestseller&search=raglan&minPrice=500&maxPrice=2000
//     &sort=price_asc|price_desc|newest&available=true&page=1&limit=24
router.get('/', (req, res) => {
  const { type, tag, search, minPrice, maxPrice, sort, available, page = 1, limit = 24 } = req.query;

  let list = getProducts();

  if (type) list = list.filter((p) => p.type.toLowerCase() === String(type).toLowerCase());
  if (tag) list = list.filter((p) => matchesTag(p, String(tag)));
  if (search) list = list.filter((p) => matchesSearch(p, String(search)));
  if (minPrice) list = list.filter((p) => p.price >= Number(minPrice));
  if (maxPrice) list = list.filter((p) => p.price <= Number(maxPrice));
  if (available === 'true') list = list.filter((p) => p.available);

  if (sort === 'price_asc') list = list.slice().sort((a, b) => a.price - b.price);
  else if (sort === 'price_desc') list = list.slice().sort((a, b) => b.price - a.price);
  else if (sort === 'newest') {
    list = list.slice().sort((a, b) => new Date(b.published || 0) - new Date(a.published || 0));
  }

  const total = list.length;
  const pageNum = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(limit) || 24));
  const start = (pageNum - 1) * pageSize;
  const items = list.slice(start, start + pageSize);

  res.json({
    items,
    page: pageNum,
    limit: pageSize,
    total,
    totalPages: Math.ceil(total / pageSize)
  });
});

// GET /api/products/meta  -> distinct types + top tags, for building filter UI
router.get('/meta', (req, res) => {
  const list = getProducts();
  const types = [...new Set(list.map((p) => p.type).filter(Boolean))].sort();

  const tagCounts = {};
  list.forEach((p) => p.tags.forEach((t) => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
  const tags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([tag, count]) => ({ tag, count }));

  const prices = list.map((p) => p.price);
  res.json({
    types,
    tags,
    priceRange: { min: Math.min(...prices), max: Math.max(...prices) },
    total: list.length
  });
});

// GET /api/products/:handle
router.get('/:handle', (req, res) => {
  const product = getProducts().find((p) => p.handle === req.params.handle);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

module.exports = router;
