require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

const { attachUser, attachOwnerId } = require('./auth');
const productsRouter = require('./routes/products');
const authRouter = require('./routes/auth');
const cartRouter = require('./routes/cart');
const wishlistRouter = require('./routes/wishlist');
const ordersRouter = require('./routes/orders');
const paymentsRouter = require('./routes/payments');
const adminRouter = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 4000;
// Comma-separated list, e.g. "http://localhost:5500,http://192.168.1.5:5500"
// so the same backend serves both the local browser and other devices on the LAN.
const ALLOWED_ORIGINS = (process.env.CLIENT_ORIGIN || 'http://localhost:5500')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(morgan('dev'));
app.use(express.json());
app.use(cookieParser());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

// Attach req.user (if a valid token is present) then req.ownerId (user or guest)
app.use(attachUser);
app.use(attachOwnerId);

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api/products', productsRouter);
app.use('/api/auth', authRouter);
app.use('/api/cart', cartRouter);
app.use('/api/wishlist', wishlistRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/admin', adminRouter);

// 404
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Central error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Luna Femme backend running on http://localhost:${PORT}`);
});
