BUTTONMASHER

BROKE — double charge, double order (FIX=0)

I clicked checkout twice at the same instant, then once more as a "retry".

`checkout()` at `demo/server.js:48` charges the card before `insertOrder` at `:54` runs, and with FIX=0 nothing is unique on `orders(cart_id)`. Every request is independent: charge, then insert, no lookup of an existing order for the cart.

Impact:
Two clicks = two orders and two charges. Retry after a lost response = three of each. It charged me three times for one cart.

Smallest fix:
Proposed, not applied: this is the deliberately-broken baseline the README demos (the file's header says so), and the fixes already exist behind `FIX=1` / `FIX=2`. Real fix is what FIX=2 does.

Retest:
`FIX=0`: concurrent pair → `201 ord_1`, `201 ord_2`; sequential retry → `201 ord_3`. `/state`: orders=3 charges=3.

BROKE — one order, three charges (FIX=1)

I did the same thing with only the unique constraint on.

The constraint dedupes the order (`:19`) but the charge at `:48` has already happened by the time the insert fails. The `23505` catch at `:56` returns the existing order with a 200, so the client sees success and never learns a second `pi_` was created. The constraint protects the database, not the customer's card.

Impact:
Concurrent double-click: 1 order, 2 charges. Plus a retry: 1 order, 3 charges. Order record points at `pi_1`; `pi_2` and `pi_3` are orphaned money.

Smallest fix:
Proposed: pass a deterministic idempotency key to the charge (`cart-${cart.id}`), i.e. exactly FIX=2. Not applied, same reason as above — FIX=1 exists to show that a unique index alone is not enough.

Retest:
`FIX=1`: `201 ord_1`, `200 ord_1`, then `200 ord_1`. `/state`: orders=1 charges=3.

BORING — FIX=2 survives everything

I ran the concurrent pair and the retry against FIX=2.

The idempotency key stores the in-flight promise (`:39`), so the two concurrent calls share one charge, and the retry hits the cache at `:32`. Unique constraint collapses the order. orders=1 charges=1 throughout.

One nit inside the boring bucket: with FIX=2 the concurrent pair returned `200` first and `201` second — whichever request loses the insert race gets the 200 even if it was sent first. Harmless; both bodies are `ord_1`.

Empty submit (no body) returned 404 "no such cart" with no state change in all three modes. Boring.

Recap: `demo/server.js` behaves exactly as its header advertises — FIX=0 and FIX=1 are reproducibly broken (double/triple charge), FIX=2 is boring. Nothing changed on disk; the buggy modes are the demo's point, so I left them. If you want the default (`FIX` unset) to be the safe mode instead, that's a one-line change to `:10`.
