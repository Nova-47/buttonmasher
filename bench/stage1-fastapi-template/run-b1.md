BUTTONMASHER

BROKE — reset link never expires on use

I clicked the same password-reset link three times, then set a new password from settings and clicked the old link again.

`reset_password` (`app/api/routes/login.py:76`) only calls `verify_password_reset_token`, which checks the JWT signature and `exp` (`app/utils.py:115`). Nothing marks the token used, and nothing binds it to the current password, so every token minted by `recover_password` stays live for the full `EMAIL_RESET_TOKEN_EXPIRE_HOURS` (48h) — including the superseded one from the first "resend I didn't get the email" click, and including tokens issued before the user changed their password by hand.

Impact:
An old reset link sitting in an inbox silently overwrites the password the user deliberately chose afterwards. Anyone who reads that inbox in the next 48 hours — a shared machine, a synced tablet, a forwarded mail — owns the account, and "I already changed my password" does not close the window.

Smallest fix:
Sign the reset token with `settings.SECRET_KEY + user.hashed_password` in `generate_password_reset_token`/`verify_password_reset_token`, so changing the password invalidates every outstanding token, used or not. No new table, no new column. Proposed (write declined) — it changes token verification, which needs the user's call.

Retest:
No Postgres or Docker here, so I ran the real app in-process against SQLite (`TestClient`, routers mounted from `app.api.main`). Sequence: signup → reset with token B (200) → replay token B (200, password changed again) → reset with the superseded token A (200) → change password via `PATCH /users/me/password` (200) → reset with token A again (200). Logging in with the self-chosen password after that returned 400; the zombie-token password returned 200.

BROKE — user created, welcome email lost, retry refused

I created a user as superuser while the SMTP host was unreachable, then retried like an admin who saw a 500.

`create_user` (`app/api/routes/users.py:65`) commits inside `crud.create_user` and only then calls `send_email` (`:69`). `send_email` raises on a dead SMTP connection, so the request 500s after the row is already committed. The retry hits the `get_user_by_email` guard at `:59` and comes back 400 "already exists" — the only path that would have delivered the generated password is now unreachable.

Impact:
The admin is told the request failed; the account exists. The new user never receives the credentials mail and cannot be re-sent one, so the account sits there unusable until someone walks them through password recovery.

Smallest fix:
Wrap the `send_email` call in `try/except Exception` and log the failure, returning the created user — the create succeeded, the notification is best-effort. Proposed (write declined); it is also a deliberate behaviour choice (fail loud vs. create quietly), so worth your nod.

Retest:
Same in-process harness with `SMTP_PORT=1`. `POST /api/v1/users/` → 500; direct query for the email → row present; second identical `POST` → 400 "The user with this email already exists in the system."

ANNOYING — signup from two tabs returns 500

I submitted the same signup from two tabs, holding both requests in the window between the `get_user_by_email` check (`app/api/routes/users.py:145`) and the insert in `crud.create_user`.

One tab got 200, the other got a bare "Internal Server Error" from the uncaught `IntegrityError` on `ix_user_email` — exactly one user row, and login works, so the data is fine; the loser just sees a crash instead of "email already exists." Same unguarded window exists in `POST /users/` and both email-change handlers. Catching `IntegrityError`, rolling back, and raising the 400/409 that the check already raises would cover it. Proposed (write declined).

Creating the same item twice, deleting an item twice, deleting my own account twice, refresh, Back, and a stale profile tab re-saving an old email were all boring.
