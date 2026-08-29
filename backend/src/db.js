// Lightweight JSON-file "database".
// Good enough for a demo/small storefront backend — swap for Postgres/Mongo
// later by re-implementing the functions below with the same signatures.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');

const EMPTY_DB = {
  users: [],       // { id, name, email, passwordHash, role, createdAt }
  carts: {},        // ownerId -> [{ handle, size, qty }]
  wishlists: {},     // ownerId -> [handle, ...]
  orders: [],        // { id, ownerId, items, shipping, totals, status, createdAt }
  productOverrides: {} // handle -> partial product fields set by the admin panel (price, compareAt, available, ...)
};

let cache = null;
let writeQueued = false;

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(EMPTY_DB, null, 2));
  }
}

function load() {
  if (cache) return cache;
  ensureDb();
  const raw = fs.readFileSync(DB_FILE, 'utf-8');
  cache = { ...EMPTY_DB, ...JSON.parse(raw) };
  return cache;
}

function persist() {
  // Debounce writes slightly so bursts of requests don't thrash the disk.
  if (writeQueued) return;
  writeQueued = true;
  setImmediate(() => {
    fs.writeFileSync(DB_FILE, JSON.stringify(cache, null, 2));
    writeQueued = false;
  });
}

function save() {
  persist();
}

// ---- products (read-only catalog file, loaded once at boot; admin edits are
// stored as overrides in db.json and merged in here so products.json never
// needs to be rewritten) ----
let productsCache = null;
function getProducts() {
  if (!productsCache) {
    const raw = fs.readFileSync(PRODUCTS_FILE, 'utf-8');
    const list = JSON.parse(raw);
    // normalize tags to arrays, ensure stable fields
    productsCache = list.map((p) => ({
      ...p,
      tags: Array.isArray(p.tags) ? p.tags : String(p.tags || '').split(',').map((t) => t.trim()).filter(Boolean),
      price: Number(p.price),
      compareAt: p.compareAt ? Number(p.compareAt) : null,
      available: p.available !== false
    }));
  }

  const overrides = load().productOverrides || {};
  if (Object.keys(overrides).length === 0) return productsCache;
  return productsCache.map((p) => (overrides[p.handle] ? { ...p, ...overrides[p.handle] } : p));
}

// Merge (and persist) an admin edit for one product. Returns the updated product.
function setProductOverride(handle, fields) {
  const data = load();
  data.productOverrides[handle] = { ...data.productOverrides[handle], ...fields };
  save();
  return getProducts().find((p) => p.handle === handle);
}

module.exports = {
  load,
  save,
  getProducts,
  setProductOverride
};
