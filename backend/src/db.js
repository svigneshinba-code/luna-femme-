// MongoDB-backed persistence (Atlas free tier). Replaces the old JSON-file
// store, which lived on Render's ephemeral disk and was wiped on every
// deploy. The product catalog itself stays a static, read-only file — only
// user data (accounts, carts, wishlists, orders, admin price/stock edits)
// lives in the database.

const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const PRODUCTS_FILE = path.join(__dirname, 'data', 'products.json');
const DB_NAME = 'luna_femme';

let client = null;
let dbPromise = null;

function getDb() {
  if (!dbPromise) {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is not set');
    }
    client = new MongoClient(process.env.MONGODB_URI);
    dbPromise = client.connect().then(() => client.db(DB_NAME));
  }
  return dbPromise;
}

async function collection(name) {
  const db = await getDb();
  return db.collection(name);
}

// ---- users ----
async function findUserByEmail(email) {
  const col = await collection('users');
  return col.findOne({ email: String(email).toLowerCase() });
}

async function findUserById(id) {
  const col = await collection('users');
  return col.findOne({ id });
}

async function createUser(user) {
  const col = await collection('users');
  await col.insertOne(user);
  return user;
}

async function setUserPasswordHash(email, passwordHash) {
  const col = await collection('users');
  await col.updateOne({ email: String(email).toLowerCase() }, { $set: { passwordHash } });
}

// ---- cart ----
async function getCart(ownerId) {
  const col = await collection('carts');
  const doc = await col.findOne({ _id: ownerId });
  return doc ? doc.items : [];
}

async function setCart(ownerId, items) {
  const col = await collection('carts');
  await col.updateOne({ _id: ownerId }, { $set: { items } }, { upsert: true });
}

// ---- wishlist ----
async function getWishlist(ownerId) {
  const col = await collection('wishlists');
  const doc = await col.findOne({ _id: ownerId });
  return doc ? doc.handles : [];
}

async function setWishlist(ownerId, handles) {
  const col = await collection('wishlists');
  await col.updateOne({ _id: ownerId }, { $set: { handles } }, { upsert: true });
}

// ---- orders ----
async function insertOrder(order) {
  const col = await collection('orders');
  await col.insertOne(order);
  return order;
}

async function findOrdersByOwner(ownerId) {
  const col = await collection('orders');
  return col.find({ ownerId }).sort({ createdAt: -1 }).toArray();
}

async function findOrderByIdForOwner(id, ownerId) {
  const col = await collection('orders');
  return col.findOne({ id, ownerId });
}

async function findAllOrders() {
  const col = await collection('orders');
  return col.find({}).sort({ createdAt: -1 }).toArray();
}

async function updateOrderStatus(id, status) {
  const col = await collection('orders');
  await col.updateOne({ id }, { $set: { status } });
  return col.findOne({ id });
}

// ---- products (read-only catalog file; admin edits are stored as overrides
// in Mongo and merged in here so products.json itself is never rewritten) ----
let productsCache = null;
function loadRawProducts() {
  if (!productsCache) {
    const raw = fs.readFileSync(PRODUCTS_FILE, 'utf-8');
    const list = JSON.parse(raw);
    productsCache = list.map((p) => ({
      ...p,
      tags: Array.isArray(p.tags) ? p.tags : String(p.tags || '').split(',').map((t) => t.trim()).filter(Boolean),
      price: Number(p.price),
      compareAt: p.compareAt ? Number(p.compareAt) : null,
      available: p.available !== false
    }));
  }
  return productsCache;
}

async function getProducts() {
  const base = loadRawProducts();
  const col = await collection('productOverrides');
  const overrides = await col.find({}).toArray();
  if (overrides.length === 0) return base;

  const byHandle = {};
  overrides.forEach((o) => { byHandle[o._id] = o; });

  return base.map((p) => {
    const override = byHandle[p.handle];
    if (!override) return p;
    const { _id, ...fields } = override;
    return { ...p, ...fields };
  });
}

async function setProductOverride(handle, fields) {
  const col = await collection('productOverrides');
  await col.updateOne({ _id: handle }, { $set: fields }, { upsert: true });
  const products = await getProducts();
  return products.find((p) => p.handle === handle);
}

module.exports = {
  findUserByEmail,
  findUserById,
  createUser,
  setUserPasswordHash,
  getCart,
  setCart,
  getWishlist,
  setWishlist,
  insertOrder,
  findOrdersByOwner,
  findOrderByIdForOwner,
  findAllOrders,
  updateOrderStatus,
  getProducts,
  setProductOverride
};
