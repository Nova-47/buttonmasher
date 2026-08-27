# Moves by boundary

What each move looks like depending on what you're abusing, what usually goes
wrong, and the fix that is usually enough. Pick the rows that apply. Skip the
rest.

## UI form / button

| Move | Realistic version | Usual failure | Usual fix |
|---|---|---|---|
| Click it twice | Double-click Submit; click again when nothing visibly happens | Two requests, two records | Disable the control while the request is in flight; server-side dedupe as backup |
| Refresh it | Reload on the "processing..." screen | Form resubmits (POST on refresh), or UI shows stale/unknown state | Redirect after POST; make the result page a GET that reads state |
| Interrupt it | Press Back after submit; close tab mid-upload | Back re-shows a submittable form; half-finished server state | Post/Redirect/Get; make the server state self-describing |
| Empty it | Submit untouched form; submit whitespace | Server accepts blank; creates empty record | Validate on the server, not only the client |
| Race it | Same form open in two tabs; both submit | Last write wins, or two records | Version/ETag check or unique constraint |
| Reorder it | Old tab acts on a deleted/finished object | Action applies to something no longer in that state | Check current state before transitioning |

Signs to look for in code: `onClick` that fires a request with no `loading`
guard; a button whose `disabled` depends only on validation, not on in-flight
state; success pages rendered from POST responses; optimistic UI with no
reconciliation.

## HTTP endpoint (POST / PUT / DELETE)

| Move | Realistic version | Usual failure | Usual fix |
|---|---|---|---|
| Repeat it | Same request sent twice, seconds apart | Two records / two side effects | Idempotency key, or natural key + unique constraint |
| Retry it | Client times out after server committed; retries | Duplicate side effect; second call errors on the user | Make the second call return the first result, not an error |
| Race it | Two identical requests at the same instant | Both pass the "does it exist?" check, both insert | Unique constraint at the DB; catch conflict and return existing |
| Reorder it | `confirm` arrives before `create`; `cancel` after `ship` | Transition from a state that doesn't allow it | Explicit state machine: reject illegal transitions |
| Empty it | Empty body; missing optional field; null | 500 instead of 400; record with nulls | Validate; default explicitly |

Signs: check-then-insert without a constraint; `find_or_create` outside a
transaction; a DELETE that assumes the row exists; a status update that doesn't
include the expected previous status in the WHERE clause.

Cheap way to run it:

```
# two identical requests, concurrently
curl -s -X POST $URL -d @body.json & curl -s -X POST $URL -d @body.json & wait
```

## Webhook / event receiver

| Move | Realistic version | Usual failure | Usual fix |
|---|---|---|---|
| Repeat it | Provider redelivers the same event (they all do) | Processed twice: double credit, double email | Store processed event ids; skip seen ones |
| Reorder it | `payment.succeeded` arrives before `payment.created` | Handler can't find the parent; drops or errors | Handle out-of-order: upsert, or fetch current state from the provider |
| Retry it | Handler crashes after the DB write but before ACK; provider retries | Same as Repeat | Same as Repeat; make the write and the "seen" mark one transaction |
| Interrupt it | Handler times out halfway | Partial state; provider retries | Idempotent handler; ACK fast, process async |

Signs: no `event_id` column anywhere; handler trusts the event payload's
state rather than re-reading current state; side effects (email, charge)
before the DB write.

## Background job / queue consumer

| Move | Realistic version | Usual failure | Usual fix |
|---|---|---|---|
| Repeat it | At-least-once delivery hands the job over twice | Duplicate work | Job-level idempotency key; check "already done" first |
| Interrupt it | Worker killed mid-job | Half-done, stuck `processing` forever | Lease with timeout; make steps resumable |
| Race it | Two workers pick the same job | Both run | Atomic claim (`UPDATE ... WHERE status = 'pending'`, check rows affected) |
| Retry it | Job retries after a partial failure | Redoes completed steps | Per-step "done" markers |

## Multi-step workflow (wizard, checkout, onboarding, signup + verify)

| Move | Realistic version | Usual failure | Usual fix |
|---|---|---|---|
| Interrupt it | Leave at step 3, come back tomorrow | Can't resume; or resumes into inconsistent state | Persist progress server-side; make each step re-enterable |
| Reorder it | Deep-link straight to step 4 | Step 4 assumes 1-3 happened | Each step checks prerequisites, not the previous page |
| Refresh it | Reload on the final "confirming..." step | Duplicate final action, or lost confirmation | Final action idempotent; confirmation page reads state |
| Repeat it | Click "Resend code" five times | User types the code from the first email and it is rejected with no hint that a newer one replaced it; or all five stay valid forever | Rate-limit softly; either keep recent codes valid or say "a new code was sent" on rejection. Silently invalidating old codes is not boring |
| Race it | Finish the flow in two tabs | Two completions | Single-completion check inside a transaction |

Signs: step N's handler reads nothing from the DB about steps 1..N-1; a
"complete" flag set from the client; a final step that is a plain POST with
no idempotency.

## What is NOT a move

- Malformed JSON, SQL in a name field, oversized payloads: fuzzing/security.
- Database down, disk full, DNS failure: infrastructure chaos.
- Every permutation of every field: edge-case enumeration.

If it takes an attacker or an outage to trigger, leave it for someone else.
