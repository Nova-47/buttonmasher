BUTTONMASHER

BROKE — double-submit makes two pending bookings

I clicked Confirm twice on a paid event (and again on a requires-confirmation event), with a full round trip between clicks.

`getRequiresConfirmationFlags.ts:92` makes `isConfirmedByDefault` false whenever `price > 0` or `requiresConfirmation`, so `createBooking.ts:192` writes `status: PENDING`. The idempotency guard at `packages/prisma/extensions/booking-idempotency-key.ts:28` only computes a key `if (args.data.status === BookingStatus.ACCEPTED)` — PENDING rows get `idempotencyKey = null`, and `Booking_idempotencyKey_key` is a plain nullable unique index (`migrations/20240226125946_add_idempotency_key/migration.sql:11`), so Postgres treats every null as distinct. Nothing upstream catches it either: `getBusyTimes.ts:81` only counts `ACCEPTED` bookings as busy, so the first PENDING booking does not make the slot look taken on the second submit. This is not a race — the second click can land seconds later.

It gets worse on confirm. `handleConfirmation.ts:245` flips PENDING → ACCEPTED with `prisma.booking.update`, and the extension's `update` hook (line 39) only ever *nulls* the key on CANCELLED/REJECTED — it never generates one. So the organizer can accept both duplicates and end up with two ACCEPTED bookings on the same host at the same instant, which the unique index was specifically built to prevent.

Impact:
Two payment records and two Stripe checkout sessions for one booking attempt; a booker who pays in both tabs pays twice. Organizer gets two identical requests, and confirming both double-books the slot with two calendar events and two meeting links.

Smallest fix:
Generate the idempotency key for PENDING creates too — drop the `status === ACCEPTED` condition in `booking-idempotency-key.ts:28` — and set it on the `update` hook when transitioning to ACCEPTED, not just null it on cancel. Proposed, not applied: this widens a DB-level constraint across every booking-creation path in the repo (recurring, seats, instant, API v1/v2, dry-run fixtures), and recurring bookings deliberately create many rows per host that would need the recurrence slot folded into the key. That is a reviewer conversation, not a one-liner.

Retest:
Not executed — `node_modules` is absent in this checkout, so vitest cannot run. Traced by hand through `RegularBookingService.ts:1707` → `createBooking.ts:139` → the extension → the migration SQL, plus `handleConfirmation.ts:245` for the confirm path.

BROKE — Back button reschedules the same booking twice

I rescheduled a booking from 2pm to 3pm, hit Back to the reschedule page, and picked 4pm instead.

A completed reschedule leaves the original at `status: CANCELLED, rescheduled: true` (`createBooking.ts:254-263`). `getOriginalRescheduledBooking` (`originalRescheduledBookingUtils.ts:16`) rejects only `CANCELLED && !rescheduled` — the `rescheduled: true` case is explicitly allowed, because that is also the state an organizer-requested reschedule leaves behind. The two states are indistinguishable, so the dead original uid stays rescheduleable forever. The 3pm booking is never cancelled by the second pass, and because the target slot differs the idempotency key differs, so the unique index does not catch it either. `validateRescheduleRestrictions` (`RegularBookingService.ts:435`) only checks minimum notice.

Impact:
Host is booked at both 3pm and 4pm from one reschedule. Two calendar events, two sets of reminders, and the 3pm one is orphaned — nobody will show up for it.

Smallest fix:
In `getOriginalRescheduledBooking`, when the booking is `CANCELLED && rescheduled`, reject if a successor exists: `fromReschedule === originalBooking.uid` on a non-cancelled booking. That distinguishes "already rescheduled" from "organizer asked you to rebook" precisely, since the latter has no successor. Proposed, not applied — `Booking.fromReschedule` is unindexed, so this adds a scan to every reschedule and wants a migration alongside it.

Retest:
Not executed, same reason. Traced through `RegularBookingService.ts:659` → `originalRescheduledBookingUtils.ts:16` → `createBooking.ts:253`.

FRAGILE — one booker takes two seats

I double-clicked Confirm on a seated event as the same attendee.

`handleSeats.ts:78-85` checks whether the attendee's email is already on the booking and throws `AlreadySignedUpForBooking`, but that read happens before the transaction. `addSeatToBooking` (`createNewSeat.ts:44`) takes `SELECT ... FOR UPDATE` and re-reads inside the transaction, but only selects `bookingSeat.id` to recount seats — it never re-checks the email. Two concurrent submits both pass the outer check, then serialize through the lock and both insert.

Impact:
One person burns two of N seats and gets two confirmation emails; on a paid seated event, two `handlePayment` calls (`createNewSeat.ts:262`).

Smallest fix:
Add `email: true` to the fresh read's attendee select and throw `AlreadySignedUpForBooking` inside the transaction if it matches `input.attendee.email`. One select field and one `if`, inside a lock that already exists. Proposed (write declined) — the edit to `createNewSeat.ts` was not permitted.

Retest:
Not executed. The existing `createNewSeat.integration-test.ts` already fires concurrent `addSeatToBooking` calls for the seat-count race (line 105) but always with distinct emails, so it would not have caught this; that file is where the regression test belongs.

ANNOYING — successful booking reported as a conflict

I let the request time out on a confirmed event and hit Confirm again.

The retry hits the unique index, `RegularBookingService.ts:1821` maps P2002 to a 409 `BookingConflict`, and the booker is told the slot is taken — by their own booking, which did succeed. State is correct; the message sends them hunting for another slot.

Refresh, empty submit, and webhook replay were all boring.
