const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { hashPassword, verifyPassword, signToken, requireAuth } = require('../auth');

const router = express.Router();

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

router.post('/signup', async (req, res, next) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email and password are required' });
    }
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email' });
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await db.findUserByEmail(email);
    if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

    const user = {
      id: uuidv4(),
      name: String(name).trim(),
      email: String(email).toLowerCase().trim(),
      passwordHash: hashPassword(password),
      role: 'customer',
      createdAt: new Date().toISOString()
    };
    await db.createUser(user);

    const token = signToken(user);
    res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

    const user = await db.findUserByEmail(email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signToken(user);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role || 'customer' } });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await db.findUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role || 'customer', createdAt: user.createdAt });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
