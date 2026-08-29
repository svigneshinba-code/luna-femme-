# Luna Femme Backend

A REST API for the Luna Femme storefront: products, cart, wishlist, orders/checkout,
and basic account auth. Node.js + Express, with a simple JSON-file "database"
(`src/data/db.json`, auto-created) — no external DB or native build tools needed.

## Run it

```bash
cd backend
npm install
cp .env.example .env      # edit JWT_SECRET and CLIENT_ORIGIN if needed
npm start                 # http://localhost:4000
```

`src/data/products.json` is your existing product catalog — copy a fresh
export over it any time to update the catalog (no re-seeding step needed,
it's read straight from disk).

## How cart/wishlist work without login

Every request gets an "owner": a logged-in user's id (from the JWT) if
they're signed in, otherwise a `avelyn_guest_id` cookie the server sets
automatically. That means Add to Bag / Wishlist work immediately for
anonymous visitors, exactly like the current client-side demo — and if they
later sign up or log in you can merge the guest cart into their account
(not wired up yet, but `req.ownerId` gives you both ids to do that with).

**Frontend requirement:** requests must include cookies, so use
`fetch(url, { credentials: 'include', ... })` and set `CLIENT_ORIGIN` in
`.env` to wherever you serve `index.html` from (e.g.
`http://localhost:5500` if using VS Code's Live Server).

## Endpoints

### Products
| Method | Path | Notes |
|---|---|---|
| GET | `/api/products` | Query: `type, tag, search, minPrice, maxPrice, available, sort=price_asc\|price_desc\|newest, page, limit` |
| GET | `/api/products/meta` | Distinct types, top tags, price range — for building filter UI |
| GET | `/api/products/:handle` | Single product |

### Auth
| Method | Path | Body |
|---|---|---|
| POST | `/api/auth/signup` | `{ name, email, password }` → `{ token, user }` |
| POST | `/api/auth/login` | `{ email, password }` → `{ token, user }` |
| GET | `/api/auth/me` | requires `Authorization: Bearer <token>` |

### Cart (guest or logged-in)
| Method | Path | Body |
|---|---|---|
| GET | `/api/cart` | — |
| POST | `/api/cart/items` | `{ handle, size, qty }` |
| PATCH | `/api/cart/items/:handle/:size` | `{ qty }` (qty ≤ 0 removes it) |
| DELETE | `/api/cart/items/:handle/:size` | — |
| DELETE | `/api/cart` | empties the cart |

### Wishlist (guest or logged-in)
| Method | Path | Body |
|---|---|---|
| GET | `/api/wishlist` | — |
| POST | `/api/wishlist/items` | `{ handle }` |
| POST | `/api/wishlist/items/:handle/toggle` | convenience for a heart button |
| DELETE | `/api/wishlist/items/:handle` | — |

### Orders
| Method | Path | Body |
|---|---|---|
| POST | `/api/orders/checkout` | `{ shipping: {name, phone, address, city, state, pincode}, paymentMethod }` — builds the order from the current cart and empties it |
| GET | `/api/orders` | order history for the current guest/user |
| GET | `/api/orders/:id` | single order |

Free shipping ≥ ₹1499, otherwise ₹79 flat (matches the site's banner) — tune
`FREE_SHIP_THRESHOLD` / `SHIP_COST` in `src/routes/orders.js`.

## Wiring it into your existing `script.js`

Replace the `products.json` fetch and the localStorage-based cart/wishlist
with calls to this API. Minimal example:

```js
const API = 'http://localhost:4000/api';

// Catalog
async function loadCatalog() {
  const res = await fetch(`${API}/products?limit=100`, { credentials: 'include' });
  const data = await res.json();
  return data.items; // same shape as your current products.json entries
}

// Add to bag
async function addToCart(handle, size, qty = 1) {
  const res = await fetch(`${API}/cart/items`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ handle, size, qty })
  });
  return res.json(); // { items, subtotal, count }
}

// Checkout
async function checkout(shipping) {
  const res = await fetch(`${API}/orders/checkout`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shipping, paymentMethod: 'cod' })
  });
  return res.json();
}
```

If a user is logged in, add `Authorization: Bearer <token>` (from
`/api/auth/login`) to these requests too — cart/wishlist will automatically
follow their account instead of the guest cookie.

## Notes / next steps

- **Storage**: `src/data/db.json` is fine for a demo or small store. For
  production traffic, swap `src/db.js` for a real database (Postgres,
  SQLite via `better-sqlite3`, MongoDB) — every route already goes through
  `db.load()` / `db.save()`, so only that one file needs to change.
- **Payments**: `paymentMethod` is stored as-is; no payment gateway is
  wired up. Plug in Razorpay/Stripe in `orders.js` before marking an order
  `placed` if you need real payments.
- **Guest → account cart merge**: not implemented. On login, you'd read the
  guest cart via the `avelyn_guest_id` cookie and merge it into
  `carts[user:<id>]` before dropping the guest entry.
