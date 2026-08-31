Reproduced everything below against the real routers with the app booted on a throwaway SQLite DB. Writes to the repo were declined, so no fix is applied.

BUTTONMASHER

BROKE — password reset links never expire on use

I clicked "forgot password" twice, reset with the second email's link, then opened the first email and clicked that link too.

`reset_password` (`backend/app/api/routes/login.py:82`) only calls `verify_password_reset_token`, which is a bare `jwt.decode` (`backend/app/utils.py:117`). Nothing marks a token as spent and nothing ties it to the password it was issued against, so every token ever minted for that email stays valid for the full `EMAIL_RESET_TOKEN_EXPIRE_HOURS` (48 by default) and can be redeemed any number of times.

Impact:
The stale link silently overwrites the password the user just set — they are locked out of the account they just recovered. Any old recovery email sitting in an inbox, a forwarded thread, or a shared mailbox is a live account takeover for two days after a reset the user believed ended it.

Smallest fix:
Bind the token to the credential it replaces: put `sha256(user.hashed_password)[:16]` in the JWT at `generate_password_reset_token`, and reject in `reset_password` when it doesn't match the current hash. One-use by construction, invalidates all older outstanding tokens, no new table or column. Proposed (write declined) — it changes the token payload, so it needs a call on tokens already in flight.

Retest:
`reset-password` with token B → 200, login with the new password → 200; replay of the older token A → 200 and the just-set password → 400. The second reset won.

BROKE — user created, admin told it failed

I created a user as superuser with the mail server refusing connections.

`create_user` (`backend/app/api/routes/users.py:68`) calls `crud.create_user`, which commits (`backend/app/crud.py:16`), and only then calls `send_email` at line 73. An exception from `send_email` propagates out of an already-committed request, so the admin gets a 500 for a write that succeeded.

Impact:
The account exists holding a password the admin typed once and can no longer see, and nobody was told it. Retrying with a fresh password gets 400 "already exists", so the admin cannot recover it without deleting the user first.

Smallest fix:
Wrap the `send_email` call in `try/except Exception` and log the failure, so a mail outage doesn't fail a request that already committed. Proposed (write declined) — swallowing the error is a deliberate choice about how the admin learns the mail never went out.

Retest:
Patched `send_email` to raise `ConnectionRefusedError`. Admin saw 500; the row was in `user`; the retry got 400 "The user with this email already exists in the system."

BROKE — 500 when two requests claim the same email

I fired two signups for the same address at once from a barrier, then had two logged-in users PATCH `/users/me` to the same new email at once.

Both paths check `crud.get_user_by_email` and then insert or commit with nothing in between: `register_user` at `backend/app/api/routes/users.py:151` vs `158`, and `update_user_me` at `:90` vs `:98`. `User.email` is `unique=True`, so the loser of the window hits an unhandled `IntegrityError` and returns 500 instead of the 400/409 the same-sequence-but-slower case returns. The frontend disables the submit button while pending, but a client retry after a timeout and two open tabs both walk straight into it.

Impact:
The data stays correct — the constraint holds — but the user is shown an unhandled server error for an ordinary duplicate-email case, and Sentry gets paged for user behaviour.

Smallest fix:
`try`/`except IntegrityError: session.rollback()` around the create and the commit, re-raising the 400/409 those handlers already return. Proposed (write declined) — four lines across `register_user`, `create_user`, `update_user_me`, `update_user`.

Retest:
Same two-thread race against the route with the `except IntegrityError` added: `[(200, 'created'), (400, 'The user with this email already exists in the system')]`, one row in the table. Without it: `[(200, created), IntegrityError]`.

ANNOYING — double delete reports failure

I clicked Delete Item twice from two tabs. First 200, second 404 "Item not found" — an error toast for a delete that worked.

ANNOYING — double password change reports wrong password

I submitted Change Password twice. First 200, second 400 "Incorrect password", because the current password is no longer current — the user is told their change failed after it succeeded.

Refresh, Back, empty `PATCH /users/me`, double-clicked item create, and repeat delete-user were all boring.
