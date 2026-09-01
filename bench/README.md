# Benchmarks

buttonmasher vs. a plain "find the bugs in this code" prompt, same model, same
tools, on real repositories nobody here wrote. Every finding was checked against
the code by hand. The losses are kept in as prominently as the wins — that's the
point.

| Stage | Target | Result |
|---|---|---|
| [stage1-fastapi-template](stage1-fastapi-template/) | `fastapi/full-stack-fastapi-template`, `backend/` | **buttonmasher lost.** Plain prompt found 10 real bugs to its 5, and buttonmasher missed the worst one (unguarded password recovery: 500 + user enumeration). |
| [stage2-calcom](stage2-calcom/) | `calcom/cal.com`, the booking-creation path | **buttonmasher won.** It found 6 lifecycle / idempotency / race bugs the plain prompt found zero of — including a double-booking + double-charge from a nullable idempotency key. It still missed a timezone bug and a security bypass the plain prompt caught. |

## Provenance

- **Stage 1:** `fastapi/full-stack-fastapi-template@486f054` (2026-08-28) — this is the repo's current `master` HEAD, so the counts are against live code, not an old checkout.
- **Stage 2:** `calcom/cal.com@176037d` (2026-08-08). The three headline claims (idempotency key only on ACCEPTED, nullable unique index, availability counts only ACCEPTED) were re-verified against cal.com's current `main` on 2026-09-01 and are still live.

One check worth recording: stage 1's most serious finding — `recover_password` re-opening email enumeration — was tested against the theory that PR #2105 (2026-01-22) already fixed it. It did not. #2105 equalized the response *text* (the "Always return the same response" comment is present); our finding is a *different* mechanism — `send_email` is called unguarded, so with SMTP unconfigured a registered address 500s while an unregistered one returns 200, and the status code re-opens enumeration. `create_user` guards this with `if settings.emails_enabled`; `recover_password` does not. Still live on current `master`.

Each stage folder has a `conditions.md` (exact prompts, isolation, timebox), the
raw unedited transcripts (`run-a*.md` = plain prompt, `run-b*.md` = buttonmasher),
and a `README.md` with the verified per-finding comparison.

The honest summary across both: buttonmasher is **not** a superset of a normal
review. On a small, mostly-static template a plain prompt found more. On a
stateful production path buttonmasher found a lifecycle/idempotency cluster a
plain prompt missed even while inspecting the same files. Run both; use
buttonmasher for the "happens twice / happens again" class.
