// The checkout endpoint from the README, runnable. Zero dependencies.
//
//   node demo/server.js            buggy: no guard, no uniqueness, no idempotency
//   FIX=1 node demo/server.js      unique constraint on orders(cart_id) only
//   FIX=2 node demo/server.js      unique constraint + idempotency key on the charge
//
// then, in another terminal:  node demo/mash.js

const http = require("node:http");
const FIX = +(process.env.FIX || 0);
const PORT = +(process.env.PORT || 3000);

// "database"
const db = {
  carts: new Map([["cart_1", { id: "cart_1", total: 4900 }]]),
  orders: [],
  // stand-in for CREATE UNIQUE INDEX ON orders(cart_id)
  insertOrder(order) {
    if (FIX >= 1 && this.orders.some((o) => o.cartId === order.cartId)) {
      const err = new Error("unique violation"); err.code = "23505"; throw err;
    }
    this.orders.push(order);
    return order;
  },
};

// "stripe": every call charges the card, unless you give it an idempotency key
const stripe = {
  charges: [],
  byKey: new Map(),
  async createIntent({ amount }, { idempotencyKey } = {}) {
    if (idempotencyKey && this.byKey.has(idempotencyKey)) return this.byKey.get(idempotencyKey);
    const work = (async () => {
      await new Promise((r) => setTimeout(r, 150)); // network latency
      const intent = { id: "pi_" + (this.charges.length + 1), amount };
      this.charges.push(intent);
      return intent;
    })();
    if (idempotencyKey) this.byKey.set(idempotencyKey, work); // same key in flight → same result
    return work;
  },
};

async function checkout(cartId) {
  const cart = db.carts.get(cartId);
  if (!cart) return [404, { error: "no such cart" }];

  const intent = await stripe.createIntent(
    { amount: cart.total },
    FIX >= 2 ? { idempotencyKey: `cart-${cart.id}` } : {}
  );

  try {
    const order = db.insertOrder({ id: "ord_" + (db.orders.length + 1), cartId, intentId: intent.id });
    return [201, order];
  } catch (e) {
    if (e.code !== "23505") throw e;
    return [200, db.orders.find((o) => o.cartId === cartId)];
  }
}

http
  .createServer(async (req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.method === "GET" && req.url === "/state")
      return res.end(JSON.stringify({ orders: db.orders, charges: stripe.charges }));
    if (req.method === "POST" && req.url === "/api/checkout") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const [status, payload] = await checkout(JSON.parse(body || "{}").cartId);
      res.statusCode = status;
      return res.end(JSON.stringify(payload));
    }
    res.statusCode = 404;
    res.end("{}");
  })
  .listen(PORT, () => console.log(`checkout server on :${PORT} (FIX=${FIX})`));
