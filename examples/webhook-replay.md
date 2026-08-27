# Webhook replay

**Target:** Stripe webhook receiver in FastAPI, credits a wallet on
`payment_intent.succeeded`.

## The code

```python
@app.post("/webhooks/stripe")
async def stripe_webhook(request: Request):
    event = stripe.Webhook.construct_event(await request.body(), sig(request), SECRET)
    if event.type == "payment_intent.succeeded":
        pi = event.data.object
        user = await db.users.get(pi.metadata["user_id"])
        await db.wallets.increment(user.id, pi.amount)
        await notify(user, f"{pi.amount} credited")
    return {"ok": True}
```

## What buttonmasher did

```
BUTTONMASHER

BROKE — wallet credited on every redelivery

I sent the same event twice, five minutes apart.

Nothing records that event.id was already handled, so the second
delivery runs the same increment. Stripe redelivers on any non-2xx
and on its own retry schedule, so this needs no user at all: one
slow notify() past Stripe's timeout is enough.

Impact:
Free money. Amount depends on how flaky notify() is.

Smallest fix:
Insert event.id into a processed_events table with a unique
constraint, in the same transaction as the increment; skip on
conflict. Proposed: it is a new table, so you run the migration.
The handler change is 4 lines and is below.

Retest:
Traced against the proposed code: same event delivered three
times → one increment, three 200s.

Out-of-order (succeeded before created) was boring: the handler
doesn't depend on the created event.
```

## The fix

Proposed. The new table is the part buttonmasher does not create on its own.

```diff
     if event.type == "payment_intent.succeeded":
         pi = event.data.object
         user = await db.users.get(pi.metadata["user_id"])
-        await db.wallets.increment(user.id, pi.amount)
+        async with db.transaction():
+            if not await db.processed_events.insert_ignore(event.id):
+                return {"ok": True, "duplicate": True}
+            await db.wallets.increment(user.id, pi.amount)
         await notify(user, f"{pi.amount} credited")
```

```sql
CREATE TABLE processed_events (id text PRIMARY KEY, seen_at timestamptz DEFAULT now());
```

The "seen" mark and the side effect must commit together. Marking first and
crediting second, in separate statements, just moves the bug to "crash between
the two and the credit is lost forever."
