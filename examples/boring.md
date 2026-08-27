# Boring

**Target:** `POST /comments` in a Next.js route handler. Included because a
report with nothing in it is a result too, and this is how short it should be.

## The code

```ts
export async function POST(req: Request) {
  const { postId, body, clientId } = schema.parse(await req.json());
  const comment = await db.comment.upsert({
    where: { clientId },
    create: { postId, body, clientId, authorId: session.userId },
    update: {},
  });
  return Response.json(comment, { status: 201 });
}
```

The form disables its button while pending and sends a `clientId` generated
when the form mounts.

## What buttonmasher did

```
BUTTONMASHER

I double-clicked Post: one comment, upsert on clientId.
I dropped the response and retried: same comment, same id.
I sent it from two tabs at once: one comment.
I submitted an empty body: 400 from schema.parse, nothing written.

Boring. Good.
```

## The fix

None. That's the point. buttonmasher does not invent work when the code
survives; it says what it tried, one line each, and leaves.
