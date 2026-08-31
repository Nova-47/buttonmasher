I reviewed every non-test file in `packages/features/bookings/lib/handleNewBooking/` and traced each helper into its caller (`lib/service/RegularBookingService.ts`) and its dependencies. No files were modified. (I also verified the working tree is a pristine checkout of `176037d` — every blob matches HEAD — so everything below is a defect in the code as shipped, not local drift.)

## 1. Restriction schedules reject valid bookings whenever local date ≠ UTC date — `ensureAvailableUsers.ts:198-212`

`buildDateRanges` is called with `dateFrom: startDateTimeUtc` / `dateTo: endDateTimeUtc` — i.e. a window exactly as long as the booking (often 30 min), and in **UTC mode**, not in the restriction schedule's timezone.

Inside `processWorkingHours` (`packages/features/schedules/lib/date-ranges.ts:50-58`) the day loop starts at `dateFrom.startOf("day")`, which for a UTC dayjs is *UTC* midnight, and `dateInTz` is then derived from that UTC date. With a window this narrow the loop runs exactly once, so **only the local day matching the booking's UTC date is ever considered**, and the resulting range is clamped to `[dateFrom, dateTo]`.

Failure scenario: restriction schedule `Mon–Fri 09:00–18:00 America/Los_Angeles`; booker picks Thu Jan 2, 17:00 PST (= Jan 3 01:00 UTC).
- `dateFrom.startOf("day")` → Jan 3 00:00 UTC → `dateInTz` → Jan 3 00:00 PST (the *wrong* local day).
- Friday's rule yields start = Jan 3 09:00 PST = Jan 3 17:00 UTC, which is after the booking; `endResult.isBefore(startResult)` → `continue`.
- `restrictionRanges` is empty → `hasDateRangeForBooking` false → `throw new Error(ErrorCode.BookingNotAllowedByRestrictionSchedule)`.

So for any negative-offset restriction timezone, every slot at/after local 16:00 (PST) / 19:00 (EST) fails at booking time, and for positive offsets (e.g. IST) early-morning local slots fail — the slot is offered on the booking page, then the booking is rejected. Morning bookings work, which is why the existing tests (all daytime Europe/London, offset 0 in winter) don't catch it. Fix: pass `startDateTimeUtc.tz(restrictionTimezone)` / `endDateTimeUtc.tz(restrictionTimezone)` (and/or widen the window by ±1 day) so day iteration happens in the schedule's timezone.

## 2. Booker email-verification block is bypassable by changing capitalization — `checkIfBookerEmailIsBlocked.ts:18-57`

`extractBaseEmail` (`packages/lib/extract-base-email.ts`) does not lowercase, the booking responses schema never lowercases `responses.email`, and `User.email` is a plain `TEXT` column (no `citext` in any migration) storing lowercased addresses (signup lowercases: `apps/web/app/api/auth/signup/handlers/calcomSignupHandler.ts:94`). So `prisma.user.findFirst({ where: { email: baseEmail } })` misses the account whenever the booker types any capital letter.

- **Bypass:** a booker who enters `Victim@Example.com` for an account with `requiresBookerEmailVerification: true` yields `user === null` → `blockedByUserSetting = false` → `shouldBlock = false` → the function returns early and the booking is created with **no verification at all**.
- **Inverse breakage:** for a `BLACKLISTED_GUEST_EMAILS` address the env comparison *is* case-insensitive (line 25), so `shouldBlock` is true but `user` is null → the owner gets the hard `"Cannot use this email to create the booking."` error at line 64, even when logged in as that user — the login escape hatch at line 67 is unreachable.

The guest branch of the same feature does normalize (`RegularBookingService.ts:1218-1231` and `UserRepository.findManyByEmailsWithEmailVerificationSettings`, which does `emails.map(e => e.toLowerCase())`), which confirms the intended contract. Fix: `extractBaseEmail(bookerEmail).toLowerCase()`.

Same class, lower severity: `checkActiveBookingsLimitForBooker.ts:56,90` matches `attendees.some.email` exactly, so `maxActiveBookingsPerBooker` is also evadable by varying capitalization.

## 3. Array `user` crashes dynamic group bookings — `createBooking.ts:204`

`dynamicGroupSlugRef: !eventType.id ? (reqBody.user as string).toLowerCase() : null`

`user` is declared `z.union([z.string(), z.array(z.string())])` (`bookingCreateBodySchema.ts:17`) and the array form is explicitly supported upstream of here (`RegularBookingService.ts:639`: `Array.isArray(reqBody.user) ? reqBody.user : getUsernameList(reqBody.user)`), and `reqBody.user` is forwarded raw into `createBooking` (line 1711). An API client posting `{"eventTypeSlug": "30min", "user": ["alice","bob"], ...}` passes user loading, availability checks and the payment-credential check, then dies with `reqBody.user.toLowerCase is not a function` → 500. The `as string` cast is what hides it. Fix: `getUsernameList(reqBody.user).join("+")` (or `Array.isArray(...) ? ... .join("+") : ...`).

## Smaller items

- **`handleAppsStatus.ts:49-61`** — the aggregation adds `success`, `errors` and `warnings` across entries but never `failures`; the first entry's `failures` wins. If the first calendar/video attempt succeeded and later ones failed, the organizer's "apps status" email block (`packages/emails/src/components/AppsStatus.tsx:18-19`) renders ✅ and no ❌ for events that were never created. Currently only reachable when a client supplies `appsStatus` in the request body (`RecurringBookingService.ts` has its own aggregation commented out at lines 81-91), so it's latent for the web app but live for API callers.
- **`ensureAvailableUsers.ts:251-253`** — the catch logs `"Unable set isAvailableToBeBooked. Using true."` but does *not* push the user, so a throw from `checkForConflicts` silently makes the host unavailable — the opposite of what the message claims. Either push the user or fix the message.
- **`checkActiveBookingsLimitForBooker.ts:79-118`** — `take: maxActiveBookingsPerBooker` with `orderBy: startTime desc` fetches the N *furthest* bookings, so when the booker has more than N upcoming bookings the "reschedule this one instead" offer points at an arbitrary middle booking rather than the soonest. It happens to be correct at exactly N, which is what `test/booking-validations.test.ts` covers.
- **`getLocationValuesForDb.ts:11-15`** — `(a.username && dynamicUserList.indexOf(a.username)) || 0` maps a not-found username to `-1` (sorts first) and relies on `|| 0` coincidentally being harmless for index 0; `loadUsers.ts:109-113` already does this sort correctly, so this copy is both redundant and mutates the caller's array in place.
