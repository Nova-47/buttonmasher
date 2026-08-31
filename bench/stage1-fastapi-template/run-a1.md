I read all of `backend/` (routes, crud, security, deps, models, config, migrations, tests). No syntax problems — note `except InvalidTokenError, ValidationError:` in `deps.py:36` is valid PEP 758 syntax under the project's `requires-python = ">=3.14"`, not a Python 2 relic.

Four real findings:

---

### 1. `POST /password-recovery/{email}` returns 500 for real users when SMTP isn't configured — which re-opens the exact enumeration hole the code was written to close

`backend/app/api/routes/login.py:53-74`

```python
if user:
    password_reset_token = generate_password_reset_token(email=email)
    email_data = generate_reset_password_email(...)
    send_email(...)          # <-- unguarded
return Message(message="If that email is registered, we sent a password recovery link")
```

`send_email` starts with `assert settings.emails_enabled` (`app/utils.py:39`), and `emails_enabled` is `bool(SMTP_HOST and EMAILS_FROM_EMAIL)` (`config.py:62`). Compare with `create_user`, which correctly guards on `if settings.emails_enabled and user_in.email:` (`users.py:69`).

**Failure scenario:** deploy with `SMTP_HOST` unset (the default — nothing in `config.py` requires it). Request recovery for an unregistered address → `200 {"message": "If that email is registered..."}`. Request recovery for a *registered* address → `AssertionError` → `500`. An attacker enumerates the entire user table off the status code, and every legitimate user hitting "forgot password" gets a 500 instead of a helpful message.

The comment on line 60 explicitly claims this endpoint is enumeration-safe, so the guarantee is stated and then broken.

Secondary, same endpoint: even with SMTP configured, the existing-user path does a JWT sign plus a synchronous SMTP round trip while the non-existent path returns immediately. The response-time gap leaks membership just as reliably as a status code. If the goal is a real mitigation, the send needs to be backgrounded.

---

### 2. Explicit `null` in a PATCH body 500s instead of 422

`backend/app/crud.py:23-26`, `backend/app/api/routes/users.py:95-99`

`model_dump(exclude_unset=True)` keeps keys the client explicitly sent as `null`, and none of the update paths distinguish "omitted" from "sent as null":

- `PATCH /users/{id}` with `{"password": null}` → `get_password_hash(None)` → `TypeError` → 500.
- `PATCH /users/{id}` with `{"is_active": null}` → column is `NOT NULL` → `IntegrityError` → 500.
- `PATCH /users/me` with `{"email": null}` → the `if user_in.email:` duplicate check is skipped (None is falsy), then `email` is written as `NULL` into a `NOT NULL UNIQUE` column → 500.

**Failure scenario:** any client that PATCHes a full form object rather than a sparse diff — which is the normal shape for a generated API client bound to a settings form — sends `{"full_name": "X", "email": null}` and gets a 500. The fields are typed `T | None` so validation passes; the crash lands in the DB layer.

---

### 3. Invalid HTTP header name breaks `/password-recovery-html-content/{email}`

`backend/app/api/routes/login.py:121-123`

```python
return HTMLResponse(
    content=email_data.html_content, headers={"subject:": email_data.subject}
)
```

The header name has a stray `:`. Colons are not legal in a field name.

**Failure scenario:** a superuser calls the endpoint against a server running uvicorn's h11 HTTP backend (the fallback when `httptools` isn't present); h11's header validation raises `LocalProtocolError` and the response fails. Under `httptools` the name is written verbatim, emitting `subject:: <value>` — a malformed header that proxies and clients may drop or reject. This never surfaces in tests because `TestClient` goes through httpx's ASGI transport, which does no header-name validation.

---

### 4. `test_create_user_new_email` mocks the wrong symbol and makes a real SMTP connection

`backend/tests/api/routes/test_users.py:40-44`

The test patches `app.utils.send_email`, but `users.py:27` does `from app.utils import send_email`, binding the function into the `app.api.routes.users` namespace at import time. Patching the attribute on `app.utils` does not rebind that reference, so the route calls the real `send_email`.

**Failure scenario:** the test also patches `SMTP_HOST` to `smtp.example.com`, and `EMAILS_FROM_EMAIL` is set in `.env`, so `emails_enabled` is `True` and the real send path executes — the test suite opens a TLS connection to a nonexistent host on every run. It passes only because the `emails` library swallows connection errors into a response object. Result: slow, network-dependent tests that provide no actual assertion about the email being sent. The correct target is `app.api.routes.users.send_email`.

---

I did not modify any files. Findings 2 and 3 also exist upstream in the FastAPI template; finding 1 is specific to the anti-enumeration change in this tree and is the one I'd fix first.
