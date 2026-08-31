# Stage 2 — bare prompt vs buttonmasher on cal.com (production)

Target: `calcom/cal.com@176037d`, scope hard-limited to
`packages/features/bookings/lib/handleNewBooking/` (27 source files, 688 KB —
the booking-creation path: createBooking, ensureAvailableUsers, handleSeats
callers, reschedule utils, booking limits). The monorepo was NOT swept.

Timebox: hard cap 20 min per run (`timeout 1200`). All four runs finished
inside it (exit 0, none truncated). Wall clock for the set ~ under the cap
since they ran in parallel.

Isolation: two clones of the same partial checkout. cal.com ships
`.claude/skills` as a symlink to `../agents/skills`, which materializes as a
broken text file on Windows and loads nothing — true in BOTH conditions, so it
is neutral. Condition B replaces that broken pointer with a real directory
holding buttonmasher v1.1.5; condition A is left exactly as cal.com ships.
`.claude/settings.json` is identical in both.

Condition A (bare):
    claude -p "Review this code for bugs a real user would hit; report what you find. Target: packages/features/bookings/lib/handleNewBooking/ (the booking-creation path). Do not modify files." --allowedTools "Read,Grep,Glob,Bash"

Condition B (buttonmasher):
    claude -p "/buttonmasher packages/features/bookings/lib/handleNewBooking/" --allowedTools "Read,Grep,Glob,Bash"

n=2 each, same model, same tools (no Write). Raw: run-a1/a2/b1/b2.md.
Every load-bearing claim below was verified by hand against the code.
