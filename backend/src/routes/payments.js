const express = require('express');
const crypto = require('crypto');
const { getCartLines, computeTotals, placeOrder, validateShipping } = require('./orders');

const router = express.Router();

function credentials() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret || keyId.includes('your_') || keySecret.includes('your_')) return null;
  return { keyId, keySecret };
}

function razorpayRequest(creds, path, body) {
  const auth = Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString('base64');
  return fetch(`https://api.razorpay.com/v1${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
    body: JSON.stringify(body)
  }).then(async (r) => {
    const data = await r.json();
    if (!r.ok) throw new Error(data.error && data.error.description ? data.error.description : 'Razorpay request failed');
    return data;
  });
}

// POST /api/payments/razorpay/order
// Creates a Razorpay order sized to the current cart total. Call this right
// before opening the Razorpay Checkout widget on the frontend.
router.post('/razorpay/order', async (req, res) => {
  const creds = credentials();
  if (!creds) return res.status(503).json({ error: 'Razorpay is not configured on this server' });

  try {
    const lines = await getCartLines(req.ownerId);
    if (lines.length === 0) return res.status(400).json({ error: 'Cart is empty or items are no longer available' });

    const totals = computeTotals(lines);
    const rpOrder = await razorpayRequest(creds, '/orders', {
      amount: Math.round(totals.total * 100), // paise
      currency: 'INR',
      receipt: 'avl_' + Date.now()
    });
    res.json({ keyId: creds.keyId, orderId: rpOrder.id, amount: rpOrder.amount, currency: rpOrder.currency });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'Could not create Razorpay order' });
  }
});

// POST /api/payments/razorpay/verify
// body: { shipping, razorpay_order_id, razorpay_payment_id, razorpay_signature }
// Verifies the payment signature, then builds the order from the (still
// intact) cart and empties it — mirroring /api/orders/checkout for COD.
router.post('/razorpay/verify', async (req, res, next) => {
  try {
    const creds = credentials();
    if (!creds) return res.status(503).json({ error: 'Razorpay is not configured on this server' });

    const { shipping, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'razorpay_order_id, razorpay_payment_id and razorpay_signature are required' });
    }
    if (!validateShipping(shipping)) {
      return res.status(400).json({ error: 'shipping.name, phone, address and pincode are required' });
    }

    const expected = crypto
      .createHmac('sha256', creds.keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expected !== razorpay_signature) {
      return res.status(400).json({ error: 'Payment verification failed' });
    }

    const lines = await getCartLines(req.ownerId);
    if (lines.length === 0) return res.status(400).json({ error: 'Cart is empty or items are no longer available' });

    const order = await placeOrder(req, lines, {
      paymentMethod: 'razorpay',
      status: 'paid',
      extra: { razorpayOrderId: razorpay_order_id, razorpayPaymentId: razorpay_payment_id }
    });
    res.status(201).json(order);
  } catch (err) { next(err); }
});

module.exports = router;
