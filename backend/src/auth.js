const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_EXPIRES_IN = '30d';
const GUEST_COOKIE = 'avelyn_guest_id';

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, name: user.name }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN
  });
}

// Reads an Authorization: Bearer <token> header if present and attaches
// req.user. Never rejects the request — routes decide what's required.
function attachUser(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme === 'Bearer' && token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      req.user = { id: payload.sub, email: payload.email, name: payload.name };
    } catch (err) {
      // invalid/expired token: treat as anonymous rather than erroring,
      // so cart/wishlist routes can fall back to the guest id.
    }
  }
  next();
}

// Requires a valid logged-in user (used for /api/auth/me, order history, etc).
function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

// Requires a logged-in user whose stored role is 'admin'. Looks the role up
// fresh from the db rather than trusting the JWT payload, so revoking admin
// access takes effect immediately without waiting for the token to expire.
async function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const user = await db.findUserById(req.user.id);
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    next();
  } catch (err) {
    next(err);
  }
}

// Every cart/wishlist request needs an "owner" — the logged-in user's id if
// present, otherwise a stable anonymous guest id stored in a cookie. This
// lets the cart work for guests (like the original client-side demo) while
// also supporting real accounts.
function attachOwnerId(req, res, next) {
  // Always expose the guest owner id (if a guest cookie exists) so logged-in
  // requests can still merge a pre-login guest cart/wishlist into the account.
  const existingGuestId = req.cookies && req.cookies[GUEST_COOKIE];
  req.guestOwnerId = existingGuestId ? `guest:${existingGuestId}` : null;

  if (req.user) {
    req.ownerId = `user:${req.user.id}`;
    return next();
  }
  let guestId = existingGuestId;
  if (!guestId) {
    guestId = uuidv4();
    // Frontend and backend live on different domains in production (e.g.
    // lunafemme.in vs onrender.com), so the cookie needs SameSite=None +
    // Secure to survive a cross-site fetch. Locally (plain http://) that
    // combination is rejected by browsers, so fall back to Lax there.
    res.cookie(GUEST_COOKIE, guestId, {
      httpOnly: true,
      sameSite: req.secure ? 'none' : 'lax',
      secure: req.secure,
      maxAge: 1000 * 60 * 60 * 24 * 365
    });
  }
  req.ownerId = `guest:${guestId}`;
  req.guestOwnerId = req.ownerId;
  next();
}

module.exports = {
  hashPassword,
  verifyPassword,
  signToken,
  attachUser,
  requireAuth,
  requireAdmin,
  attachOwnerId
};
