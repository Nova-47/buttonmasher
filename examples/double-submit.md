# Double submit

**Target:** React checkout form + Express handler, Postgres.

## The code

```jsx
// CheckoutForm.jsx
export function CheckoutForm({ cart }) {
  const [error, setError] = useState(null);
  const pay = async () => {
    const res = await fetch("/api/checkout", { method: "POST", body: JSON.stringify({ cartId: cart.id }) });
    if (!res.ok) setError("Payment failed. Try again.");
  };
  return <button onClick={pay}>Pay {cart.total}</button>;
}
```

```js
// checkout.js
app.post("/api/checkout", async (req, res) => {
  const cart = await db.carts.find(req.body.cartId);
  const intent = await stripe.paymentIntents.create({ amount: cart.total });
  const order = await db.orders.insert({ cartId: cart.id, intentId: intent.id });
  res.json(order);
});
```

## What buttonmasher did

```
BUTTONMASHER

BROKE — duplicate order and charge

I double-clicked Pay.

Two POST /api/checkout requests went out 90ms apart. The button has
no in-flight guard, the handler creates a payment intent before it
inserts anything, and nothing is unique on orders(cart_id). Both
requests ran to completion: two intents, two orders.

Impact:
One impatient click charges the customer twice. A slow response
makes the second click almost guaranteed.

Smallest fix:
Disable the button while pending; unique index on orders(cart_id);
pass the cart id as Stripe's idempotency key so a retry reuses the
intent. Applied.

Retest:
Two concurrent POSTs for the same cart → one intent, one order;
second request gets 409 with the existing order id.

Refresh on the confirmation page and Back after paying were boring.
```

## The fix

```diff
 export function CheckoutForm({ cart }) {
   const [error, setError] = useState(null);
+  const [busy, setBusy] = useState(false);
   const pay = async () => {
+    setBusy(true);
     const res = await fetch("/api/checkout", { method: "POST", body: JSON.stringify({ cartId: cart.id }) });
     if (!res.ok) setError("Payment failed. Try again.");
+    setBusy(false);
   };
-  return <button onClick={pay}>Pay {cart.total}</button>;
+  return <button onClick={pay} disabled={busy}>Pay {cart.total}</button>;
 }
```

```diff
-  const intent = await stripe.paymentIntents.create({ amount: cart.total });
+  const intent = await stripe.paymentIntents.create(
+    { amount: cart.total }, { idempotencyKey: `cart-${cart.id}` });
```

```sql
CREATE UNIQUE INDEX orders_one_per_cart ON orders (cart_id);
```

The button fix stops the double-click. The index stops everything else:
retries, two tabs, a flaky client library. You want both; the server-side
one is the one that matters.
