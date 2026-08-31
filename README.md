# buttonmasher

> *if it can be clicked twice, it will be.*

<p align="center"><picture><source media="(prefers-color-scheme: light)" srcset="assets/logo-light.svg"><img src="assets/logo.svg" width="280" alt="buttonmasher: the guy, one finger already on SUBMIT"></picture></p>

**users don’t read instructions.**

You know him. Hair he has not touched since the last deploy. The grin.
One finger already on SUBMIT, and the page has not finished loading. He
clicked once, nothing happened for 300ms, so he clicked again. He is not
an attacker. He is the tester your team never hired: not malicious, just
not going to wait for the spinner.

buttonmasher puts him inside your AI agent.

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
idempotencyKey on the Stripe call; disabled={busy} on the button.
Applied, 3 lines. Unique index on orders(cart_id): proposed, it is
a migration.

Retest:
Two concurrent POSTs → one charge.
```

It does not only double-click. Another target, the signup wizard:

```
BROKE — activation without verification

I went straight to step 4.

activate checks nothing: not verified_at, not plan. A bookmarked URL
activates an unverified account with plan = nil.

Smallest fix:
Two guards at the top of activate. Applied, 2 lines.

Retest:
GET /activate unverified → redirected to /verify, status unchanged.
```

Four more in [examples/](examples/). Want to see it break for real? [demo/](demo/) is that endpoint, runnable, with the output of two concurrent POSTs against it: no fix, the fix that looks sufficient (it isn't), and the one that is.

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

When to run it: on the diff, right before you open the PR. That is the one
moment the code is fresh, the happy path is in your head, and the double-click
has not happened to a customer yet.

Or just ask: *"buttonmash the webhook handler"*, *"what happens if the user
clicks this twice?"*, *"is this endpoint safe to retry?"* The skill triggers
on its own for that kind of question.

On a repo light enough to boot in the session — one that installs and runs
without a live database or a heavy build — it starts the app and actually sends
the two requests. On a repo too heavy to boot it traces the code path by hand
instead, and labels every finding `Traced` rather than `Reproduced`, so you
always know which one you got.

## Severity

| Label | Meaning |
|---|---|
| **BROKE** | Wrong money, a duplicate/lost record, or a wrong status was produced. |
| **FRAGILE** | Correct here, but a realistic race/retry would make it BROKE. |
| **ANNOYING** | Outcome correct, experience bad. Mentioned, not dwelt on. |
| **BORING** | Survived. This is what you want. |

Each finding is also tagged `Reproduced` (it ran the code) or `Traced` (it read
the path) — severity is about the outcome, not about whether it could boot the repo.

## Install

### Claude Code plugin

```
/plugin marketplace add Nova-47/buttonmasher
/plugin install buttonmasher@buttonmasher
```

Two separate prompts. Start a new session and `/buttonmasher` is there.

### Codex / Copilot CLI

```
codex plugin marketplace add Nova-47/buttonmasher && codex plugin add buttonmasher@buttonmasher
copilot plugin marketplace add Nova-47/buttonmasher && copilot plugin install buttonmasher@buttonmasher
```

### Anything that reads SKILL.md (Cursor, OpenCode, Gemini CLI, ...)

```
git clone https://github.com/Nova-47/buttonmasher
cp -r buttonmasher/skills/buttonmasher ~/.claude/skills/      # Claude Code, every project
cp -r buttonmasher/skills/buttonmasher .claude/skills/        # Claude Code, this project
cp -r buttonmasher/skills/buttonmasher .agents/skills/        # Codex / Copilot, this project
```

The skill is one Markdown file plus one reference table. No hooks, so there is
nothing to port; if your agent loads `SKILL.md` files, it loads this one. The
Codex and Copilot manifests mirror ponytail's, which are known to install; they
have not been exercised against those CLIs from this repo yet.

### What's in the box

```
buttonmasher/
├── .claude-plugin/          Claude Code plugin + marketplace manifests
├── .codex-plugin/           Codex plugin manifest
├── .github/plugin/          Copilot CLI plugin + marketplace manifests
├── skills/buttonmasher/
│   ├── SKILL.md             the skill: moves, workflow, severity, fix rules, report format
│   └── references/moves.md  each move per boundary type, the smell that predicts it, the usual fix
├── examples/                five reports with the code that broke and the fix
├── demo/                    the front-page endpoint, runnable, with real output
└── assets/                  the guy: logo.svg, logo-light.svg, social-preview.png, original jpg
```

No hooks, no dependencies, no config. The only scripts are the demo, and
they exist so the front-page double-charge claim is something you can run
yourself, not just read.

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

**I ran it twice and got different findings. Which run is right?**
Both. It picks the five sharpest scenarios it sees, and it does not always
see the same five. Anything labelled BROKE was reproduced in that run. If you
want the union, run it twice.

**Will it refactor my code into a "robust request pipeline"?**
No. The fix for a double-submit is one `disabled` attribute and one unique
index. If it proposes more than that, the code had more than one problem.

## License

[MIT](LICENSE)
