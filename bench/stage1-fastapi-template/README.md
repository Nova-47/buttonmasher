# Stage 1 — bare prompt vs buttonmasher on a real template

Target: `fastapi/full-stack-fastapi-template@486f054`, `backend/` only.
Condition A: bare prompt, skill not loaded. Condition B: `/buttonmasher backend/`.
Same model, same tools (`Read,Grep,Glob,Bash`, no Write), n=2 each. Raw
transcripts: `run-a1.md`, `run-a2.md`, `run-b1.md`, `run-b2.md`. Prompts and
setup: `conditions.md`.

Every claim below was checked against the code by hand. This is the honest
result, including where buttonmasher did worse.

## Headline

**On this target the bare prompt found more distinct real issues than
buttonmasher (10 vs 5).** buttonmasher did not win on bug count. What it did
that the bare prompt did not:

1. **It ran the app.** Both B runs booted the routers on a throwaway SQLite DB
   and *reproduced* every finding (actual request sequences, status codes).
   Both A runs reasoned statically ("no Postgres here, verified by reading").
2. **It found one bug both bare runs missed** — the create-user lifecycle bug
   (#4 below): create commits, then the welcome email send throws, the admin
   gets a 500 for a write that succeeded, and the retry is refused as a
   duplicate. That is a retry-after-partial-success, exactly buttonmasher's
   target class.
3. **It stayed in scope.** It did not report malformed-input 500s, dead code,
   a mistyped debug header, or JWT design questions — the things it declares
   out of scope. The bare prompt reported all of those (and they are real).

The trade is real and cuts both ways: buttonmasher trades breadth for
reproduction, lifecycle framing, and scope discipline. If you want "everything
wrong with this file," a bare prompt did more here. If you want "what an
impatient user breaks, proven by running it," buttonmasher did that and the
bare prompt did not.

## Findings, and who caught each

| # | Finding (verified real) | Bare A | buttonmasher B | Class |
|---|---|:--:|:--:|---|
| 1 | Reset token replayable for 48h, still valid after the password is changed | ✓ (a2) | ✓✓ reproduced | retry/idempotency — **buttonmasher's lane, bare also got it** |
| 2 | Check-then-insert on email → `IntegrityError` → 500 under concurrent signup / two-tab email change | ✓ (a2) | ✓✓ reproduced | race — **its lane, bare also got it** |
| 3 | `recover_password` calls `send_email` unguarded → 500 on the hit path when email is disabled; timing/status enumerates users | ✓✓ | ✗ | config/security |
| 4 | `create_user` commits then sends; SMTP down → 500 after commit → **retry refused 400**, credentials lost | ✗ | ✓✓ reproduced | **retry-after-partial-success — buttonmasher only** |
| 5 | Deleted/inactive user's session gets 404/400, frontend only logs out on 401/403 → stuck | ✓ (a2) | ✗ | correctness |
| 6 | Negative/oversized `skip`/`limit` → 500; `limit` unbounded | ✓ (a2) | ✗ | malformed input |
| 7 | Password change/reset does not invalidate existing JWTs (8-day window) | ✓ (a2) | ✗ | security design |
| 8 | Reset token accepted as access token → unhandled 500 (UUID cast) | ✓ (a2) | ✗ | security design |
| 9 | Explicit `null` in PATCH body → 500 (password / is_active / email) | ✓ (a1) | ✗ | malformed input |
| 10 | `headers={"subject:": ...}` stray colon in a debug endpoint | ✓✓ | ✗ | correctness (out of B's scope) |
| 11 | Test patches `app.utils.send_email` but route imported the symbol → real SMTP connection in the suite | ✓ (a1) | ✗ | test quality |
| 12 | Double-delete item → 404 error toast for a delete that worked | ✗ | ✓ (b2) | annoying (state correct) |
| 13 | Double password-change → 400 "incorrect password" after it succeeded | ✗ | ✓ (b2) | annoying (state correct) |

✓ = found in one run, ✓✓ = both runs. "reproduced" = B actually ran the
sequence against the booted app.

Distinct real issues: **bare 10 (#1,2,3,5,6,7,8,9,10,11), buttonmasher 7
(#1,2,4,12,13 + it also noted the two-tab race as its own item)**. Overlap on
buttonmasher's declared core class (retry / race / idempotency): #1 and #2,
found by both.

## Failures, false positives, where bare did better — required section

- **buttonmasher found fewer real bugs.** Flatly. On a CRUD template with no
  payment flow, a careful bare prompt covered more ground: input validation,
  session-logout, JWT lifetime, token type confusion. buttonmasher skipped all
  of those by design, but "by design" does not change that a user running the
  bare prompt would have learned more about this particular file.
- **buttonmasher missed #3** (the recovery-endpoint 500 + enumeration), which
  is arguably the single most serious issue in the tree and is partly a
  retry/observable-behavior bug — inside its lane. Both bare runs caught it;
  neither buttonmasher run did. This is a genuine miss, not a scope call.
- **No false positives in either condition.** Every claim in all four runs
  checked out against the code. The one thing that looks like a bug —
  `except InvalidTokenError, ValidationError:` in `deps.py:36` — is valid
  Python 3.14 syntax (PEP 758) under this repo's `requires-python = ">=3.14"`;
  run a1 explicitly checked and did *not* flag it. Good restraint, bare side.
- **Run-to-run variance, both conditions.** Bare: a1 gave 4 findings, a2 gave
  10 — the same prompt, very different depth. buttonmasher: b1 and b2 agreed on
  the three BROKEs; b2 added two ANNOYING double-click items b1 didn't. The
  FAQ line "run it twice, you may get a different five" holds for the bare
  prompt at least as much.

## What this means for the launch claim

The planned Show HN framing is "buttonmasher catches what a normal review
misses." **Stage 1 does not support that framing** on a template target — the
normal review (a decent bare prompt) caught more here, and missed only the one
lifecycle bug. The defensible claims are narrower:

- buttonmasher **reproduces** its findings by running the code, where an
  unstructured prompt tends to reason statically.
- It reliably surfaces the retry/race/duplicate class and one
  partial-success bug a bare prompt missed.
- It is terse and in-scope, which is a different value proposition than
  "finds the most bugs."

Whether that is a strong enough story for HN is a human decision. Per the
stage gate, this weakens rather than confirms the headline, so stage 2
(cal.com) should not be started on autopilot — see the report sent to the
coordinating session.
