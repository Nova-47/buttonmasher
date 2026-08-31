# demo: click it twice

The checkout endpoint from the front page, runnable. Zero dependencies, Node 18+.

```
node demo/server.js          # terminal 1
node demo/mash.js            # terminal 2: two identical POSTs at the same instant
```

`mash.js` exits 1 if more than one order or charge exists afterwards.

## What happens

Real output, not a mock-up. Node 24, Windows 11, one machine.

**No fix.** No in-flight guard, no uniqueness on `orders(cart_id)`, no idempotency on the charge.

```
$ node demo/mash.js
request 1 → 201 {"id":"ord_1","cartId":"cart_1","intentId":"pi_1"}
request 2 → 201 {"id":"ord_2","cartId":"cart_1","intentId":"pi_2"}

BROKE   orders: 2   charges: 2   (215ms)
```

**`FIX=1`: unique constraint on `orders(cart_id)` only.** The one most people stop at.

```
$ FIX=1 node demo/server.js      # terminal 1
$ node demo/mash.js
request 1 → 200 {"id":"ord_1","cartId":"cart_1","intentId":"pi_1"}
request 2 → 201 {"id":"ord_1","cartId":"cart_1","intentId":"pi_1"}

BROKE   orders: 1   charges: 2   (208ms)
```

One order, two charges. Both requests passed the constraint check because
neither had inserted yet; both called Stripe; the constraint only collapsed
the *write*. The customer still paid twice. A unique index protects your
table, not their card.

**`FIX=2`: unique constraint + `idempotencyKey: cart-<id>` on the charge.**

```
$ FIX=2 node demo/server.js      # terminal 1
$ node demo/mash.js
request 1 → 200 {"id":"ord_1","cartId":"cart_1","intentId":"pi_1"}
request 2 → 201 {"id":"ord_1","cartId":"cart_1","intentId":"pi_1"}

BORING   orders: 1   charges: 1   (197ms)
```

Boring. Good.

## Why this is here

A skill that claims "I clicked it twice, it charged me twice" should be able
to show it. This is the smallest server that exhibits the bug, the smallest
script that triggers it, and the intermediate fix that *looks* sufficient and
isn't. Point `/buttonmasher demo/server.js` at it and compare its report to
the output above.

The fake Stripe behaves like the real one in the way that matters: without
an idempotency key every call charges; with one, a second call for the same
key (even while the first is in flight) returns the first result.

## The skill against the demo

`demo/report.md` is what `/buttonmasher demo/server.js` actually produced,
headless, unedited, with the SKILL.md shipped in v1.1.1:

```
cp -r skills/buttonmasher .claude/skills/
claude -p "/buttonmasher demo/server.js" --allowedTools "Read,Grep,Glob,Bash" > demo/report.md
node demo/check-report.js demo/report.md
```

Git Bash on Windows rewrites the leading `/buttonmasher` into a path and the
skill never fires; prefix the command with `MSYS_NO_PATHCONV=1`. Interactive
slash commands are unaffected.

It started the server itself, ran all three modes, and found the FIX=1
double charge (and the triple charge on retry, which `mash.js` does not even
try). `check-report.js` is the format gate: opens with `BUTTONMASHER`, no
headers, no emoji, no preamble, a Retest for every BROKE, no closing recap,
every Retest tagged `Reproduced` or `Traced`, and — the newest check — a
money/duplicate outcome is never labeled below BROKE. That last one is a
regression guard for a real inconsistency the cal.com benchmark exposed
(`bench/stage2-calcom/`): two runs scored the same double-booking as FRAGILE
in one and BROKE in the other, because the old severity table mixed "how bad
is the outcome" with "did you reproduce it." SKILL.md now splits those into a
priority-ordered outcome tree plus a separate `Reproduced`/`Traced` tag, and
the gate fails the old FRAGILE-with-a-double-charge shape. The Recap drift
that an earlier run introduced is also still caught. Keep the checker; these
are the kinds of drift a prose rule alone will not stop the next time.
