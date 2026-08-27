# buttonmasher

> *if it can be clicked twice, it will be.*

<p align="center"><img src="assets/logo.jpg" width="280" alt="buttonmasher: a grinning user about to hit SUBMIT again"></p>

**users don’t read instructions.**

An agent skill that tests your code the way real users eventually will: repeatedly, impatiently, and out of order.

<sub><a href="README.ko.md">한국어</a></sub>

---

```
Click it twice.
Retry it.
Refresh it.
Interrupt it.
Empty it.
Repeat it.
Reorder it.
Race it.

If it breaks in a realistic way, explain why.
If the fix is obvious and small, fix it.
If nothing meaningful breaks, leave it alone.
```

## Before / after

You ship a checkout button.

```js
app.post("/api/checkout", async (req, res) => {
  const cart = await db.carts.find(req.body.cartId);
  const intent = await stripe.paymentIntents.create({ amount: cart.total });
  const order = await db.orders.insert({ cartId: cart.id, intentId: intent.id });
  res.json(order);
});
```

Your tests pass. Then buttonmasher shows up.

```
BUTTONMASHER

BROKE — duplicate order and charge

I double-clicked Pay.

Two requests, 90ms apart. No in-flight guard on the button, no
uniqueness on orders(cart_id). Two intents, two orders.

Smallest fix:
disabled={busy} on the button; unique index on orders(cart_id);
idempotencyKey on the Stripe call. Applied, 4 lines.

Retest:
Two concurrent POSTs → one order.
```

Four more in [examples/](examples/).

## What it does

Point it at a feature, a diff, an endpoint, a webhook handler, a multi-step
flow, or a whole repo. It works out the happy path, finds every place state
changes, and then behaves like the user you were not designing for:

- double-clicks Submit
- retries after a timeout the server already succeeded on
- refreshes halfway through
- presses Back
- has the same page open in two tabs
- sends the same webhook twice
- does step 4 before step 2
- submits the form without touching it
- leaves, and comes back tomorrow

Then it tells you what broke, why, what it costs you, and the smallest change
that fixes it. If the fix is a few obvious lines, it makes the change and
retests. If nothing breaks, it says so in four lines and leaves your code
alone.

It is especially good at finding:

- duplicate orders, payments, records, emails
- missing idempotency on create endpoints and webhooks
- check-then-insert races
- workflows that get stuck or skip steps
- buttons that stay clickable while the request is in flight
- backends that assume the frontend behaved

## What it does not do

- **Not fuzzing.** No malformed JSON, no unicode torture, no 10MB payloads.
- **Not pentesting.** No attacker model. The user is impatient, not malicious.
- **Not unit-test generation.** It may write a test to reproduce a bug. It
  won't hand you a suite.
- **Not chaos engineering.** No killing databases, no network partitions.
- **Not edge-case enumeration.** Five sharp scenarios, not fifty imaginary
  ones.

The filter is one question: *what would an impatient or confused real user
plausibly do here?* If a scenario needs an attacker or an outage, it's not
buttonmasher's problem.

## Usage

```
/buttonmasher src/api/checkout.ts
/buttonmasher the signup + email verification flow
/buttonmasher src/                 # whole codebase: ranks the boundaries, abuses the top five
/buttonmasher                      # abuses the current diff
```

Or just ask: *"buttonmash the webhook handler"*, *"what happens if the user
clicks this twice?"*, *"is this endpoint safe to retry?"* The skill triggers
on its own for that kind of question.

If a browser or a running server is available, it actually clicks twice and
actually sends two requests. If not, it traces the code path and says so.

## Severity

| Label | Meaning |
|---|---|
| **BROKE** | Realistic action produced wrong state, data, or money. Reproduced. |
| **FRAGILE** | Likely to break under retry/timing/navigation. Not reproduced. |
| **ANNOYING** | Bad experience, correct state. Mentioned, not dwelt on. |
| **BORING** | Survived. This is what you want. |

## Install

### Claude Code plugin

```
/plugin marketplace add nova-47/buttonmasher
/plugin install buttonmasher@buttonmasher
```

Two separate prompts. Start a new session and `/buttonmasher` is there.

### Or just copy the skill

```
git clone https://github.com/nova-47/buttonmasher
cp -r buttonmasher/skills/buttonmasher ~/.claude/skills/      # every project
cp -r buttonmasher/skills/buttonmasher .claude/skills/        # this project
```

### What's in the box

```
buttonmasher/
├── .claude-plugin/          plugin + marketplace manifests (two small JSON files)
├── skills/buttonmasher/
│   ├── SKILL.md             the skill: moves, workflow, severity, fix rules, report format
│   └── references/moves.md  each move per boundary type, the smell that predicts it, the usual fix
├── examples/                five reports with the code that broke and the fix
└── assets/logo.jpg          the guy
```

No scripts, no hooks, no dependencies, no config. A skill that hunts for
unnecessary machinery should not ship any.

## Why this isn't just tests, or just chaos engineering

Your tests encode what you thought the user would do. They were written by
the same person who wrote the happy path, on the same day, with the same
assumptions. They click once.

Chaos engineering breaks your infrastructure: kills pods, partitions
networks, fills disks. Useful, but the user who double-clicked Pay didn't do
any of that. Your infrastructure was fine. Your endpoint just wasn't
idempotent.

buttonmasher sits in the gap. It doesn't need your infrastructure to fail. It
needs a user with a slow connection and a mouse, which is every user you will
ever have.

Happy paths are optimistic. Users are not.

## FAQ

**Isn't this just "write integration tests"?**
It writes one, sometimes, to prove a bug. The value is in knowing which five
things to try, not in the test file.

**Why won't it fuzz?**
Because nobody's grandmother sends a 40MB JSON body. She double-clicks. Fuzzing
finds bugs that need an attacker; this finds bugs that need a Tuesday.

**What if nothing breaks?**
Then you get four lines and your afternoon back. "Boring. Good." is the report
you want.

**Will it refactor my code into a "robust request pipeline"?**
No. The fix for a double-submit is one `disabled` attribute and one unique
index. If it proposes more than that, the code had more than one problem.

## License

[MIT](LICENSE)
