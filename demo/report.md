BUTTONMASHER

BROKE — double-click charges twice

I sent two identical POST /api/checkout at the same instant (FIX=0).

Both returned 201 with different orders (ord_1/pi_1, ord_2/pi_2). `checkout` at `demo/server.js:48` charges the card before `insertOrder` at `:54`, and with FIX=0 nothing is unique on `orders.cartId` and nothing keys the Stripe call, so two concurrent requests each run the full path.

Impact:
Two charges and two orders for one cart. Same cart three times if the user also retries later.

Smallest fix:
Proposed, not applied: the file ships the fix deliberately behind `FIX=2` (unique index on `orders(cart_id)` at `:19` + `idempotencyKey: cart-<id>` at `:50`). Run it that way; both guards are needed, see next finding.

Retest:
FIX=2, same double-click: 201 + 200 both returning ord_1/pi_1. orders=1, charges=1. Boring.

BROKE — unique constraint alone still charges twice

I ran the same double-click and a later retry against FIX=1.

The unique index at `:19` dedupes the order (orders=1) but the charge at `:48` has already happened by the time the insert fails; the catch at `:56` swallows the violation and returns the first order while the extra `pi_2`/`pi_3` intents stay on the customer's card. Charges: 3 for 1 order.

Impact:
Money leaks silently. The API says "one order" and the customer's statement says three.

Smallest fix:
Proposed: idempotency key on the charge, i.e. what `:50` already does when `FIX>=2`. Alternatively insert the order first and charge after, so the constraint guards the charge too.

Retest:
FIX=2 retry-later: 200 ord_1/pi_1, orders=1 charges=1.

BROKE — retry after lost response

I sent a third POST after the first two completed (FIX=0).

201 ord_3/pi_3. Nothing on the server checks for an existing order on the cart before charging, so a client retry after a timeout is indistinguishable from a new checkout.

Impact:
Same as above; covered by the FIX=2 changes.

Retest:
Covered in FIX=2 run above.

Refresh, Back, and empty submit (`{}` → 404 no such cart, no charge) were all boring.
