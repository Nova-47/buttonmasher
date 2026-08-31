BUTTONMASHER

FRAGILE — retry duplicates a pending booking

I let the first submit commit, then retried it the way the booker does after a timeout: same payload, an event type with `requiresConfirmation` on.

`createBooking.ts:192` writes the new booking as `PENDING`. The availability read that gates the second request only ever sees `ACCEPTED` rows — `BookingRepository.ts:702-704` filters `status: { in: [ACCEPTED] }`, and the one query that includes `PENDING` (`BookingRepository.ts:761-776`) requires `requiresConfirmationWillBlockSlot: true`, which defaults to false (`defaultEvents.ts:145`). So the first booking is invisible to `ensureAvailableUsers`, and nothing between `getBookingData` and `createBooking` looks for an existing booking on (eventTypeId, startTime, booker email). Second request goes through and writes a second row. `checkActiveBookingsLimitForBooker.ts:51` also counts only `ACCEPTED`, so the per-booker cap doesn't catch it either.

Impact:
Organizer gets two booking-requested emails and two webhooks for one person in one slot, and confirms both — two ACCEPTED meetings at the same time. On a paid event type each booking gets its own Payment row and its own intent (`handlePayment.ts:179`), so the booker can be charged twice for one meeting.

Smallest fix:
Proposed. Before `createBooking` (RegularBookingService.ts:1707), for the non-seats path, look up a booking with the same `eventTypeId`, `startTime`, status in ACCEPTED/PENDING and an attendee with `bookerEmail`; if one exists, return it instead of creating. Not applied: it's a new query in a 2,700-line orchestrator and it changes a deliberate "same booker may hold two slots" behaviour that only the maintainers can sign off on.

Retest:
Couldn't execute — this checkout has no `node_modules` and no database, so the vitest suite in `handleNewBooking/test/` won't run. Traced by hand end to end: `RegularBookingService.ts:863→936` (availability) → `1707` (create), against `BookingRepository.ts:699-776`. The web booker does disable its button while in flight (`useBookings.ts:429`, `isPending || isSuccess`), so this needs a failed/timed-out first attempt, a second tab, or an API client — all of which re-enable the button.

FRAGILE — retry books a second host

I retried a submit on a round-robin team event after the first one had already committed.

Availability and host selection are recomputed per request: `ensureAvailableUsers` at `RegularBookingService.ts:936` drops only the host the first booking blocked, and `getLuckyUser` at `1034` then picks from whoever is left. The second request finds another free host and creates a full second booking. Nothing compares the incoming booker against bookings that already exist in that slot.

Impact:
One attendee, one time slot, two accepted meetings with two different hosts. Both hosts block their calendar, both get a video link, and round-robin fairness counters are incremented twice.

Smallest fix:
Proposed. Same guard as the finding above — the dedupe lookup by (eventTypeId, startTime, booker email) catches this case too, before host selection matters. One check covers both.

Retest:
Not run (no deps/DB). Traced `RegularBookingService.ts:936-1044`; the busy-time query is keyed on host ids and host emails (`BookingRepository.ts:737-758`), never on the booker's email, so an existing booking by the same booker with a different host is not busy for the newly chosen host.

FRAGILE — a booking can be rescheduled twice

I reschedule X to 10:00; the response never arrives; I go back to the still-open reschedule tab and submit again, this time picking 11:00.

The first reschedule already cancelled X inside the transaction (`createBooking.ts:254-263`: `rescheduled: true`, `status: CANCELLED`) and created replacement A. The second request re-reads X via `getOriginalRescheduledBooking`, whose only guard is `status === CANCELLED && !rescheduled` (`originalRescheduledBookingUtils.ts:16`) — X is cancelled *and* `rescheduled`, so it passes, deliberately, to support the organizer's "request reschedule" flow. That flag can't distinguish "organizer asked for a reschedule" from "already rescheduled", and nothing checks for an existing booking with `fromReschedule = X.uid`. Replacement B is created and A is never cancelled.

Impact:
Booker thinks they moved one meeting; the calendar holds two. A is invisible to them — the confirmation page and email point at B — so it sits there until the host notices. The `/reschedule/[uid]` page does redirect a cancelled booking away (`determineReschedulePreventionRedirect.ts:79-90`), so this needs an already-loaded tab, a retry from an API client, or a Back button; the handler itself has no such guard.

Smallest fix:
Proposed. In `getOriginalRescheduledBooking`, when the booking is `CANCELLED && rescheduled`, also check for a live successor (`booking.findFirst({ where: { fromReschedule: uid, status: { in: [ACCEPTED, PENDING] } } })`) and reject with "already rescheduled" if one exists. Not applied: it touches the organizer request-reschedule flow, whose intended behaviour I can't verify without running the e2e suite.

Retest:
Not run (no deps/DB). Traced `RegularBookingService.ts:659-661` → `originalRescheduledBookingUtils.ts:8-21` → `createBooking.ts:228-264`, plus `BookingRepository.ts:1170-1177`, which explicitly loads CANCELLED bookings.

FRAGILE — two first seats for one slot

I had two bookers claim the first seat of an empty seated slot at the same time; then, separately, I retried the first seat on a seated event that requires confirmation.

`handleSeats.ts:41-55` looks for the slot's booking with `status: ACCEPTED`, and returns `undefined` when there is none, which sends the request down the ordinary `createBooking` path (`RegularBookingService.ts:1645`). The `SELECT ... FOR UPDATE` in `createNewSeat.ts:47` only protects joining a booking that already exists. Two concurrent first-seat requests both read nothing and both create a booking; and if the event requires confirmation, the first booking is `PENDING`, so *every* later request keeps reading nothing — the `AlreadySignedUpForBooking` 409 at `handleSeats.ts:81-88` never fires, deterministically.

Impact:
One slot ends up with two parallel bookings, each counting seats separately, so `seatsPerTimeSlot` is exceeded by up to a full booking's worth of attendees. Later bookers join whichever booking `findFirst` happens to return; the other one's attendees get a different meeting link for the same time.

Smallest fix:
Proposed. Widen the `handleSeats` lookup to `status: { in: [ACCEPTED, PENDING] }` — that alone makes the requires-confirmation case deterministic-correct. The concurrent first-seat race needs the slot row locked before the create, which is more than a few lines.

Retest:
Not run (no deps/DB). Traced `handleSeats.ts:41-101`, `createNewSeat.ts:41-108`, and the fallthrough at `RegularBookingService.ts:828-860, 1645-1658`.

Refresh, Back, and empty submit were all boring: the booker button stays disabled through `isPending || isSuccess`, sequential retries on a plain confirmed single-host event are stopped by `NoAvailableUsersFound`, and the seat-join path is properly locked.
