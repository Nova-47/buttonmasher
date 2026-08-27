# Retry after timeout

**Target:** `POST /invites` in an Express API, called by a mobile client with a
10-second timeout and automatic retry.

## The code

```js
app.post("/invites", async (req, res) => {
  const { email, teamId } = req.body;
  const existing = await db.invites.findOne({ email, teamId, status: "pending" });
  if (existing) return res.status(409).json({ error: "already invited" });

  const invite = await db.invites.insert({ email, teamId, status: "pending" });
  await mailer.send(email, inviteTemplate(invite));   // ~2-15s on a bad day
  res.status(201).json(invite);
});
```

## What buttonmasher did

```
BUTTONMASHER

BROKE — successful invite reported as failure, then blocked

I let the server succeed and dropped the response.

mailer.send sits after the insert and takes long enough to trip the
client's 10s timeout. The insert is already committed, so the client's
automatic retry hits the existing-invite check and gets 409. The user
sees "already invited" for an invite they never saw succeed, and the
UI has no invite to show because the 201 never arrived.

Impact:
Every slow email send turns into a confused user and a support
ticket. With a flaky mailer this is most invites.

Smallest fix:
Two lines, both proposed, neither applied: they change what the
client sees. (1) On the duplicate path return 200 with the existing
invite instead of 409, so a retry looks like the success it was.
(2) Send the mail after the response instead of before it, so a
slow mailer cannot turn a committed insert into a timeout. If a
client branches on 409, or if a failed send must fail the request,
you will want to know before I change it.

Retest:
Traced, not run: with (1) the retry returns the same invite id;
with (2) the response leaves before mailer.send starts. Nothing
sends twice either way because the insert happens once.

Sending twice with different emails and empty email were boring
(validation catches empty).
```

## The fix

Proposed. Both hunks change the API contract, which is where buttonmasher
stops fixing and starts asking.

```diff
   const existing = await db.invites.findOne({ email, teamId, status: "pending" });
-  if (existing) return res.status(409).json({ error: "already invited" });
+  if (existing) return res.status(200).json(existing);

   const invite = await db.invites.insert({ email, teamId, status: "pending" });
-  await mailer.send(email, inviteTemplate(invite));
   res.status(201).json(invite);
+  mailer.send(email, inviteTemplate(invite)).catch(log.error);
 });
```

A retry of a create that already happened should look like the create
succeeding, not like an error. "Already exists" is only an error when the
caller could not have been the one who created it.

The `.catch(log.error)` is the honest part of this proposal: a mail that
fails after the response is logged, not retried. If losing it is not
acceptable, the real fix is a job queue, and that is a bigger change than
buttonmasher makes on its own.
