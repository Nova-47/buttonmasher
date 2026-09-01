# Benchmarks

buttonmasher vs. a plain "find the bugs in this code" prompt, same model, same
tools, on real repositories nobody here wrote. Every finding was checked against
the code by hand. The losses are kept in as prominently as the wins — that's the
point.

| Stage | Target | Result |
|---|---|---|
| [stage1-fastapi-template](stage1-fastapi-template/) | `fastapi/full-stack-fastapi-template`, `backend/` | **buttonmasher lost.** Plain prompt found 10 real bugs to its 5, and buttonmasher missed the worst one (unguarded password recovery: 500 + user enumeration). |
| [stage2-calcom](stage2-calcom/) | `calcom/cal.com`, the booking-creation path | **buttonmasher won.** It found 6 lifecycle / idempotency / race bugs the plain prompt found zero of — including a double-booking + double-charge from a nullable idempotency key. It still missed a timezone bug and a security bypass the plain prompt caught. |

Each stage folder has a `conditions.md` (exact prompts, isolation, timebox), the
raw unedited transcripts (`run-a*.md` = plain prompt, `run-b*.md` = buttonmasher),
and a `README.md` with the verified per-finding comparison.

The honest summary across both: buttonmasher is **not** a superset of a normal
review. On a small, mostly-static template a plain prompt found more. On a
stateful production path buttonmasher found a lifecycle/idempotency cluster a
plain prompt missed even while inspecting the same files. Run both; use
buttonmasher for the "happens twice / happens again" class.
