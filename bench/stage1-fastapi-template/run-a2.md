I diffed `backend/` against upstream `fastapi/full-stack-fastapi-template@486f054` — it's **byte-identical**, so this is a review of that code as-is, not of a local change. No Postgres/Docker was available here, so the DB-level claims below are verified statically (SQLAlchemy type/bind behavior + PostgreSQL semantics) rather than by running the suite.

## Findings, most severe first

### 1. Negative or oversized `skip`/`limit` returns 500 instead of 422
`backend/app/api/routes/items.py:15` and `backend/app/api/routes/users.py:37` declare `skip: int = 0, limit: int = 100` with no `Query(ge=0, le=…)` constraints, and pass them straight into `.offset()/.limit()`.

`GET /api/v1/items/?limit=-1` compiles to `LIMIT -1`, which PostgreSQL rejects (`ERRCODE_INVALID_ROW_COUNT_IN_LIMIT_CLAUSE`, "LIMIT must not be negative"); `?skip=-1` gives "OFFSET must not be negative". Neither is caught, so the client gets a 500. A pagination component that briefly computes `skip = (page-1)*size` with `page=0` hits this. Same for a `skip` larger than int8. Separately, `limit` is unbounded — `?limit=10000000` serializes the whole table into memory on both list endpoints.

### 2. A deleted or deactivated user's session gets 404/400, so the client never logs out
`backend/app/api/deps.py:41-45` raises `404 "User not found"` when the token's user row is gone and `400 "Inactive user"` when `is_active` is false. Both are authentication failures but neither is a 4xx the client treats as one: `frontend/src/main.tsx:25` clears the token and redirects to `/login` only on `[401, 403]`.

So when a superuser deletes account X (`DELETE /users/{id}`) or flips `is_active=false` while X is logged in, X's browser gets a 404/400 on every subsequent request, stays on the authenticated shell with an error toast, and is never sent to the login page. These should be 401 (with `WWW-Authenticate: Bearer`), which is also what RFC 6750 requires and what `OAuth2PasswordBearer` already returns for a missing header — the endpoint is inconsistent with itself. (Note the invalid-token branch uses 403, which the frontend does handle, so only the deleted/inactive paths break.)

### 3. Changing or resetting a password does not invalidate existing sessions
`update_password_me` (`users.py:103-121`) and `reset_password` (`login.py:77-97`) update `hashed_password` and nothing else. Tokens are stateless JWTs with only `exp`/`sub` (`core/security.py:22-26`) and `ACCESS_TOKEN_EXPIRE_MINUTES` defaults to 8 days (`core/config.py:25`). A user who resets their password *because* they believe it was stolen leaves the attacker's existing token working for up to 8 more days. There's no token version/`iat` cutoff column to check against.

### 4. Password-reset tokens are replayable for 48 hours, including after use
`generate_password_reset_token` (`utils.py:104-114`) mints a bearer-style JWT with no nonce, no server-side record, and no invalidation on use; `EMAIL_RESET_TOKEN_EXPIRE_HOURS` is 48. The same emailed link can be submitted repeatedly, and still works after the password has already been changed — so a reset link sitting in a forwarded mail, a shared inbox, or browser history is a 48-hour standing takeover of the account.

### 5. Reset tokens and access tokens are the same credential type
`get_current_user` (`deps.py:32-35`) and `verify_password_reset_token` (`utils.py:117-124`) both accept *any* token signed with `SECRET_KEY` under HS256; neither checks an `aud` or token-type claim. The two are only kept apart by what goes in `sub` (user UUID vs. email), and cross-use fails by accident rather than by design:

- A reset token sent as `Authorization: Bearer …` reaches `session.get(User, "user@example.com")`. I confirmed SQLAlchemy's `Uuid` type installs no bind processor (it passes the raw `str` through to psycopg), so Postgres raises `invalid input syntax for type uuid` — an unhandled 500, not a 401. Plausible to hit for real: the reset-password page holds a token and one wrong wiring puts it in the auth header.
- The same 500 path fires for anyone still holding a token minted before migration `d98dd8ec85a3` (integer `sub`), i.e. every live session on upgrade day.

Adding a `typ`/`aud` claim and validating it in both decoders closes the class; catching non-UUID `sub` in `deps.py` fixes the 500.

### 6. Password recovery 500s when SMTP is unconfigured, and is an unauthenticated mail cannon
`login.py:67` calls `send_email` unconditionally, but `send_email` opens with `assert settings.emails_enabled` (`utils.py:39`). Note that `users.py:69` *does* guard with `if settings.emails_enabled` before its `send_email` — recovery doesn't. Any deployment that drops `SMTP_HOST`/`EMAILS_FROM_EMAIL` (common — plenty of projects don't want email) turns `POST /password-recovery/{email}` into a 500 for every registered address.

The endpoint is also unauthenticated, unthrottled, and sends SMTP synchronously inside the request, so it doubles as an inbox-flooding and threadpool-exhaustion primitive against a known address. The generic "If that email is registered…" response also still leaks existence through response time (SMTP round-trip only on the hit path) and through `POST /users/signup`, which answers 400 "The user with this email already exists in the system".

### 7. Email-uniqueness checks are check-then-insert
`create_user` (`users.py:61-68`), `register_user` (`users.py:151-158`), `update_user_me` (`users.py:89-98`) and `update_user` (`users.py:203-210`) all query for a conflicting email and then write. Two concurrent signups for the same address both pass the check and the loser gets an `IntegrityError` on `ix_user_email` → 500 instead of the intended 400/409. Catching the integrity error and mapping it to the same response would make the guard actually authoritative.

## Minor
- `login.py:122` — `headers={"subject:": email_data.subject}` has a stray colon in the header name; the header is emitted as `subject:` and won't be read by anything looking for `subject`.
- `users.py:228-229` — the explicit `delete(Item).where(owner_id == user_id)` is dead weight: `Item.owner_id` already has `ondelete="CASCADE"` (`models.py:97-99`) and the relationship has `cascade_delete=True`, so `session.delete(user)` alone suffices.
- `private.py:29-38` — commits without `session.refresh(user)`, so the `UserPublic` response is built from expired attributes; it happens to work because the commit expires-on-commit and lazy-loads, but it's an extra round trip and a footgun if `expire_on_commit` is ever turned off.

I did not modify any files.
