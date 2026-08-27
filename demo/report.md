BUTTONMASHER

BROKE — double-click charges twice

I sent two identical POST /api/checkout for cart_1 at the same instant (FIX=0), then a third one after success.

`checkout` at `demo/server.js:48` calls `stripe.createIntent` before anything checks whether cart_1 already has an order, and `insertOrder` at `demo/server.js:22` pushes unconditionally. Every request is a fresh charge and a fresh order; there is no window to lose, there is simply no check.

Impact:
Two clicks, two 4900 charges, two orders. Retry after a dropped response is a third. Money and records both duplicate.

Smallest fix:
Unique on orders(cart_id) plus an idempotency key on the charge — that is exactly FIX=2 in this file. Proposed, not applied: the buggy mode is the demo's on-purpose baseline.

Retest:
FIX=2, same two parallel POSTs: 201 then 200, both returning ord_1/pi_1. State: 1 order, 1 charge. Retry after success also returned ord_1. Boring.

BROKE — unique constraint only, card still charged twice

I ran the same pair with FIX=1 (unique index only).

The constraint at `demo/server.js:19` fires at insert time, but the charge at `demo/server.js:48` has already gone out on both requests. Second request gets 200 with the existing order; its pi_2 is orphaned — money taken, no order pointing at it. Retry after success made pi_3.

Impact:
Records look correct (1 order); the customer is charged once per click. Worst version: the dashboard says fine.

Smallest fix:
Idempotency key `cart-${cart.id}` on `createIntent` (FIX=2). Proposed for the same reason as above.

Retest:
Covered by the FIX=2 run: charges stayed at 1 across three requests.

Out of scope for me: no auth on /api/checkout, anyone can check out any cartId. Run a security review.

Empty body (`{}`) returned 404 "no such cart" without charging; refresh and Back have nothing server-side to break here. Both boring.
