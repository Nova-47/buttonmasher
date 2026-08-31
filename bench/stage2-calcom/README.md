# Stage 2 — bare prompt vs buttonmasher on cal.com (production)

Target: `calcom/cal.com@176037d`, scope `packages/features/bookings/lib/handleNewBooking/`.
Conditions, prompts, isolation, timebox: `conditions.md`. Raw transcripts:
`run-a1.md`, `run-a2.md`, `run-b1.md`, `run-b2.md`. n=2 each.

Pre-registered pass bar (set by the coordinating session *before* this ran, not
moved afterward): buttonmasher surfaces **≥2 multi-step / race / idempotency /
partial-success real bugs that the bare prompt did not**, and is **not below the
bare prompt on severity**. Bug *count* was explicitly not the bar.

## Result: PASS — with real caveats recorded below

buttonmasher surfaced a cluster of booking-lifecycle bugs — double-booking,
double-charge, reschedule-twice, seat races — that **neither bare run found**,
and that bare run A2 **explicitly reviewed and cleared as fine**. Every
load-bearing claim was verified against the code by hand.

### The bugs buttonmasher found and bare missed (verified)

1. **Idempotency key is only generated for `ACCEPTED` bookings** — so paid /
   requires-confirmation bookings (written `PENDING`) get `idempotencyKey =
   null`, and `Booking_idempotencyKey_key` is a plain nullable unique index, so
   Postgres treats every null as distinct. Two submits → two PENDING rows → the
   organizer can accept both → two ACCEPTED bookings in one slot, two Stripe
   sessions, double charge. **Verified exactly:** `booking-idempotency-key.ts:28`
   (`if (args.data.status === BookingStatus.ACCEPTED)`), the `update` hook only
   *nulls* the key on cancel/reject and never generates it on PENDING→ACCEPTED,
   and `migrations/20240226125946_add_idempotency_key/migration.sql` is a bare
   `CREATE UNIQUE INDEX`. (B2, BROKE)
2. **A rescheduled booking can be rescheduled again** via Back / retry.
   `getOriginalRescheduledBooking` rejects only `CANCELLED && !rescheduled`
   (`originalRescheduledBookingUtils.ts:16`), so a booking left
   `CANCELLED, rescheduled:true` by a completed reschedule stays rescheduleable
   forever; the second pass never cancels the first replacement → host booked at
   two times from one reschedule. **Verified exactly.** (B1 + B2)
3. **Retry duplicates a pending booking.** Availability only counts `ACCEPTED`
   (`checkActiveBookingsLimitForBooker.ts:52,86`, and the busy-times query), so
   a first PENDING booking is invisible to the second request and nothing dedupes
   on (eventTypeId, startTime, booker email). **Verified.** (B1)
4. **Retry books a second host** on round-robin (availability recomputed, busy
   query keyed on host ids/emails not booker email). (B1)
5. **Seated first-seat race + requires-confirmation determinism** — the
   seat lookup filters `ACCEPTED`, so under requires-confirmation the
   `AlreadySignedUpForBooking` 409 never fires. (B1)
6. **One booker takes two seats** — `createNewSeat` re-reads inside
   `SELECT ... FOR UPDATE` but selects only seat *count*, never re-checks the
   attendee email, so the outer email check is not enforced under the lock. (B2)

Six distinct findings, all in the target class, zero found by either bare run.
Bar was two. Severity: the cluster includes double-charge on a payment path,
so buttonmasher is not below bare on severity.

## Required honesty section — what bare did better, and buttonmasher's misses

This is not a clean sweep. On the same target the bare prompt found serious
bugs buttonmasher **did not**:

- **Timezone restriction-schedule bug** (A1, `ensureAvailableUsers.ts`): for any
  non-UTC restriction schedule, valid afternoon/evening slots are offered and
  then rejected at booking time. Subtle, high-impact, affects everyday bookings
  — and buttonmasher missed it in both runs. It is a timezone-logic bug, not a
  user-misbehavior bug, so it is outside buttonmasher's declared lane, but a
  developer running the bare prompt would have caught it and buttonmasher's user
  would not.
- **Case-sensitivity bypass of booker email verification** (A1,
  `checkIfBookerEmailIsBlocked.ts`): capitalizing a letter makes the
  `requiresBookerEmailVerification` check miss the account and skip verification
  entirely. A real security bypass. buttonmasher missed it.
- **Array `user` → 500 on dynamic group bookings** (A1), and **apps-status
  `failures` dropped in aggregation** (both A runs) — a data-integrity bug where
  the organizer's email shows ✅ for a calendar event that was never created.
  buttonmasher missed both.

Other honest caveats:

- **buttonmasher could not execute anything.** cal.com has no `node_modules` /
  DB in the sandbox, so every "Retest" line in B is "traced by hand," not run.
  On the fastapi stage buttonmasher booted SQLite and actually reproduced its
  findings; here it could not. Its findings are code-traced, not executed.
- **The FRAGILE/BROKE label wobbled again.** B1 labeled the whole cluster
  FRAGILE (correctly — it couldn't reproduce); B2 labeled the same
  double-booking bug BROKE. Same bug, two labels, driven by run-to-run framing
  rather than by the code. The label discipline is still not reproducible.
- **Bare A2 was disciplined, not blind.** It reported one high-confidence
  finding and explicitly cleared the concurrency paths. Its miss of the cluster
  is a real miss, but it was not spraying low-confidence guesses.
- **No false positives in either condition.** Every claim in all four runs
  checked out.

## What this supports, and what it does not

Supported by this evidence:
- On a **stateful production path**, buttonmasher surfaces a multi-step /
  idempotency / race cluster that a competent bare review misses even when it
  inspects the same files. This is the opposite of the stage-1 template result,
  and it is exactly the hypothesis stage 2 was built to test.

Not supported / still open:
- buttonmasher is **not a superset** of a normal review — it missed a timezone
  bug and a security bypass that bare caught. The honest framing is
  **complementary**: buttonmasher for the lifecycle/idempotency class, a normal
  review for logic/security. "Run buttonmasher *and* a normal review" is
  defensible; "buttonmasher instead of a review" is not.
- buttonmasher's own reproduction claim ("it runs the code") did **not** hold
  here — the repo was too heavy to boot. On heavy repos it degrades to static
  tracing, same as the bare prompt.

Publication decision remains a human call and is out of scope for this run.
