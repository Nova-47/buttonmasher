I reviewed all 27 source files in `packages/features/bookings/lib/handleNewBooking/` and traced the call sites into `RegularBookingService`/`RecurringBookingService` and the email renderers. One real bug stands out.

## Finding: `failures` is dropped when aggregating apps status

`packages/features/bookings/lib/handleNewBooking/handleAppsStatus.ts:49-61`

```ts
const aggregatedStatus = reqAppsStatus.concat(resultStatus).reduce((acc, curr) => {
    if (acc[curr.type]) {
      acc[curr.type].success += curr.success;
      acc[curr.type].errors = acc[curr.type].errors.concat(curr.errors);
      acc[curr.type].warnings = acc[curr.type].warnings?.concat(curr.warnings || []);
    } else {
      acc[curr.type] = curr;
    }
    return acc;
  }, {} as { [key: string]: AppsStatus });
```

Every counter is merged except `failures`. When two entries share a `type`, the second entry's `failures` is silently discarded — only the first entry's value survives.

**Why it matters.** `handleAppsStatus` builds `evt.appsStatus` (`RegularBookingService.ts:2012, 2028, 2133`), which is rendered directly to the organizer in emails and calendar descriptions:

- `packages/emails/src/components/AppsStatus.tsx:19` — `{status.failures >= 1 && \`❌ ...\`}`
- `packages/lib/CalEventParser.ts:142` — same `app.failures >= 1` check

`reqAppsStatus` is a client-supplied field (`bookingCreateBodySchema.ts:81`, carried across recurring-booking slots), so a booking whose first slot succeeded for an app and whose current slot failed produces:

- input `{type: "google_calendar", success: 1, failures: 0, errors: []}`
- result `{type: "google_calendar", success: 0, failures: 1, errors: ["Calendar creation failed"]}`
- aggregated → `{success: 1, failures: 0, errors: ["Calendar creation failed"]}`

The organizer's email shows a green ✅ for Google Calendar even though the event was never created on the calendar. The failure is invisible in exactly the UI built to surface it.

**Corroboration that `failures` belongs here:** the same reduce, with the `failures` line intact, is preserved as commented-out code at `packages/features/bookings/lib/service/RecurringBookingService.ts:82-90`:

```
//         prev[curr.type].failures += curr.failures;
//         prev[curr.type].success += curr.success;
```

The fix is a one-line addition of `acc[curr.type].failures += curr.failures;` alongside the `success` line. I did not modify any files, as requested.

## Things I checked and cleared

`checkActiveBookingsLimitForBooker` (both the COUNT and offer-reschedule branches — the `take`/`orderBy`/last-element logic is exercised by `test/booking-validations.test.ts:407+` including the seated `seatUid` case), `ensureAvailableUsers` restriction-schedule and conflict paths, `createBooking`'s reschedule/seats branches, `getBookingData` location extraction, `getRequiresConfirmationFlags` threshold logic, `validateEventLength`, `checkIfBookerEmailIsBlocked`, and `scheduleNoShowTriggers`.

One note that is *not* a bug: `loadUsers.ts:15` defines a local `getOrgDomainConfig` stub that always returns `currentOrgDomain: null`. That would break org-scoped dynamic group bookings in production, but the real utility doesn't exist anywhere in this repo snapshot — it's pruning scaffolding for this checkout, not a defect in the booking path.
