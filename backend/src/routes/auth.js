const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { hashPassword, verifyPassword, signToken, requireAuth } = require('../auth');

const router = express.Router();

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

router.post('/signup', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email and password are required' });
  }
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email' });
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const data = db.load();
  const existing = data.users.find((u) => u.email.toLowerCase() === String(email).toLowerCase());
  if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

  const user = {
    id: uuidv4(),
    name: String(name).trim(),
    email: String(email).toLowerCase().trim(),
    passwordHash: hashPassword(password),
    role: 'customer',
    createdAt: new Date().toISOString()
  };
  data.users.push(user);
  db.save();

  const token = signToken(user);
  res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

  const data = db.load();
  const user = data.users.find((u) => u.email.toLowerCase() === String(email).toLowerCase());
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = signToken(user);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role || 'customer' } });
});

router.get('/me', requireAuth, (req, res) => {
  const data = db.load();
  const user = data.users.find((u) => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ id: user.id, name: user.name, email: user.email, role: user.role || 'customer', createdAt: user.createdAt });
});

// TEMPORARY: one-off password reset, gated by a secret env var so it can't
// be abused. Remove this route (and the TEMP_RESET_SECRET env var) once used.
router.post('/temp-reset-password', (req, res) => {
  const { secret, email, newPassword } = req.body || {};
  if (!process.env.TEMP_RESET_SECRET || secret !== process.env.TEMP_RESET_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!email || !newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ error: 'email and newPassword (6+ chars) are required' });
  }
  const data = db.load();
  const user = data.users.find((u) => u.email.toLowerCase() === String(email).toLowerCase());
  if (!user) return res.status(404).json({ error: 'No account with that email' });
  user.passwordHash = hashPassword(newPassword);
  db.save();
  res.json({ ok: true });
});

module.exports = router;
