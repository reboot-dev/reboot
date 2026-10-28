---
title: Call the Backend Without React Hooks — `WebContext`
impact: MEDIUM
impactDescription: The non-React web client, for browser code that has no React tree and for Node.js scripts that need reactive reads
tags: web-app, web-client, WebContext, reactively, reboot-web, typescript, node
---

## Call the Backend Without React Hooks — `WebContext`

The generated React hooks are the default for every component in
the SPA; see
[`references/react-client.md`](react-client.md). Underneath them is
a second generated client, `rbt generate --web=`, whose calls take a
`WebContext` from `@reboot-dev/reboot-web` instead of a provider. It
offers the same calls and the same reactive reads as the hooks, as
plain async functions, so it is the client for code that has no
React tree to host `<RebootClientProvider>`.

## When to Reach for `WebContext`

Use it only where a hook cannot run:

- **Browser code outside React.** A page written without React, or
  with another framework; a Web Worker or Service Worker; a browser
  extension's content script. A `WebContext` is a plain object, so
  it works anywhere `fetch` does.
- **A Node.js script or service that needs reactive reads.** The
  `ExternalContext` of `@reboot-dev/reboot` makes unary calls from
  Node.js but cannot read reactively yet. A `WebContext` can, from
  Node.js 22 or newer (Node.js 20 needs `--experimental-websocket`):
  a CLI that waits for a workflow to finish, a process that reacts
  to state changes, a TypeScript integration test that drives the
  app through its public API.

Do **not** reach for it inside a React component (the hooks subscribe
and re-render for you), in a servicer (call other states through
refs with the servicer's own context), or in a Python test
(`rbt.create_external_context(...)`, see
`python/references/testing-external-context.md`).

For example, a terminal that tails a chat room and stops once a
message it is waiting for arrives:

```ts
// scripts/tail.ts — `node scripts/tail.ts <room>`
import { WebContext } from "@reboot-dev/reboot-web";
import { ChatRoom } from "../frontend/api/chat/v1/chat_room_rbt_web.js";

const context = new WebContext({ url: "http://localhost:9991" });
const chatRoom = ChatRoom.ref(process.argv[2]);

const [responses] = await chatRoom.reactively().messages(context);
for await (const { response, aborted } of responses) {
  if (aborted !== undefined) {
    // The reader answered with an error, e.g. the room does not
    // exist yet. The read stays open and yields again once the
    // state changes.
    console.error(`Cannot read messages yet: ${aborted.message}`);
    continue;
  }
  console.log(response.messages.at(-1));
  if (response.messages.includes("done")) {
    break;
  }
}
```

## Generate the Client

Put the web client beside the React one in `.rbtrc`, pointed at the
same directory:

```
generate --react=frontend/api
generate --web=frontend/api
```

For each API module `<name>` that emits a `<name>_rbt_web.ts` next
to `<name>_rbt_react.ts`, with one class per state type, its request
and response types under the same namespace, and one
`<Type><Method>Aborted` class per method. Add `@reboot-dev/reboot-web`
to the frontend's `package.json`, pinned to the same version as the
backend's `reboot` dependency and `@reboot-dev/reboot-react`. In the
SPA import it through the `@api/*` alias; a script imports it by
relative path. Do **not** open the generated `*_rbt_web.ts` to
rediscover any of this; it is as long as the React one.

## The Context

```ts
import { WebContext } from "@reboot-dev/reboot-web";

const context = new WebContext({
  url: REBOOT_URL,
  // Optional: a token, or a function that returns the current one.
  bearerToken: async () => session.accessToken,
  // Optional: how to renew the session on a 401, see below.
  onUnauthenticated,
});
```

- `url` follows the same rules as the provider's: the page's own
  origin when the backend serves the page, `VITE_REBOOT_URL` when the
  SPA is published elsewhere (`react-client.md`, "The Backend URL").
  A script names the backend outright: `http://localhost:9991` under
  `rbt dev`, or `rbt.url()` under the TypeScript test harness.
- `bearerToken` becomes the `Authorization: Bearer` on every call;
  `context.setBearerToken(...)` replaces it later. A read from a
  method whose `authorizer()` allows anonymous callers needs none.
- `websockets: true` carries reactive reads over a WebSocket on
  HTTPS too, instead of a streaming `fetch`; on plain HTTP they
  always use a WebSocket.

One context serves every call; create it once.

## Calls

A constructor is a static method on the state's class, named after
the constructor method, and returns the ref together with the
response; everything else is a method on a ref, which `ref(id)`
makes without a round-trip:

```ts
// The id is optional; without one a UUID is chosen.
const [chatRoom, created] = await ChatRoom.create(context, "room-1", {
  topic: "Reboot",
});

const room = ChatRoom.ref("room-1");
await room.send(context, { message: "Hi" }); // writer / transaction
const { messages } = await room.messages(context); // reader, once
```

Requests are partial objects: every field has a default, so pass
only what you set. Field names are the camelCased API field names,
as in the hooks.

A call that the backend refuses **throws** its `<Type><Method>Aborted`,
unlike a hook's mutator, which resolves `{ response, aborted }`.
`aborted.error` is the same discriminated union the hooks see,
tagged by `error.type`, so the `friendlyError()` translator in
`react-client.md` serves both:

```ts
import { ChatRoomSendAborted } from "@api/chat/v1/chat_room_rbt_web";

try {
  await room.send(context, { message });
} catch (error) {
  if (error instanceof ChatRoomSendAborted) {
    show(friendlyError(error));
    return;
  }
  throw error;
}
```

A writer or transaction that must not run twice goes through
`idempotently({ key })` on the ref, with a key the caller keeps
across retries; `makeExpiringIdempotencyKey()` from
`@reboot-dev/reboot-web` makes one that expires in seven days:

```ts
await room.idempotently({ key }).send(context, { message });
```

Every call takes `{ signal }` as its last argument to abandon it,
for example from an `AbortController` a page aborts when the user
navigates away. An abandoned call throws its `<Type><Method>Aborted`
like any other failure, so code that aborted checks its own
`signal.aborted` to tell its abort from the backend's.

## Reactive Reads

`ref.reactively().<reader>(context, request?, { signal }?)` resolves
to a generator that yields `{ response }` on every change to the
state, or `{ aborted }` when the reader answered with an error, and
a `setRequest` function:

```ts
const [responses, setRequest] = await room
  .reactively()
  .messages(context, { limit: 20 });

for await (const { response, aborted } of responses) {
  if (aborted !== undefined) {
    // Decide: `continue` to wait for the state to change, `break`
    // to stop reading, or `throw aborted`.
    continue;
  }
  render(response.messages);
}
```

- An error does not end the read: the subscription stays open and
  yields again once the state changes. A dropped connection is
  retried with backoff without yielding anything.
- `setRequest({ limit: 50 })` re-issues the read with a new request
  on the same generator, the way a hook re-reads when its request
  changes.
- Leaving the loop, with `break`, `return` or an exception, ends
  the read and the request behind it; nothing else is needed to
  stop reading. An ended read cannot be resumed, so a read that must
  outlive one loop is pulled with `responses.next()` and closed with
  `responses.return()`.
- To end a read from outside the loop, pass an `AbortSignal` as
  `{ signal }` and abort it: the loop ends on its own. Do that from
  whatever owns the read's lifetime, for example a worker's
  shutdown or a page's `beforeunload`; a controller created only to
  be aborted after the loop is redundant.

## Signing In Without the Provider

Calls authenticate by bearer token only; the backend's `rbt_session`
cookie signs in the browser but does not authenticate a call by
itself. A page without the provider does by hand what
`<RebootClientProvider>` does:

1. **Sign in** by navigating to `/__/oauth/start` on the backend,
   with `return_to` set to the page to come back to:

   ```ts
   const start = new URL("/__/oauth/start", REBOOT_URL);
   start.searchParams.set("return_to", window.location.href);
   window.location.href = start.toString();
   ```

2. **Read the session** with a credentialed fetch of
   `/__/oauth/whoami`. It answers `{ authenticated: false }` when
   signed out, else `{ authenticated: true, user_id, access_token, expires_at, default_ids }`. Hand `access_token` to the context;
   `user_id` is the id of the signed-in `User`.
3. **Renew on a 401** with `onUnauthenticated`: POST
   `/__/oauth/refresh` with credentials, which answers
   `{ access_token, expires_at }` or 401 when the session is over;
   on success `setBearerToken(access_token)` and resolve `true`,
   and the client retries the call once. Resolve `false` to let
   the 401 reach the caller.
4. **Sign out** by POSTing `/__/oauth/signout` with credentials,
   then reload.

```ts
async function session(): Promise<string | undefined> {
  const response = await fetch(new URL("/__/oauth/whoami", REBOOT_URL), {
    credentials: "include",
  });
  const body = await response.json();
  return body.authenticated ? body.access_token : undefined;
}

const context = new WebContext({
  url: REBOOT_URL,
  bearerToken: await session(),
  onUnauthenticated: async () => {
    const response = await fetch(new URL("/__/oauth/refresh", REBOOT_URL), {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) {
      return false;
    }
    const { access_token } = await response.json();
    context.setBearerToken(access_token);
    return true;
  },
});
```

A cross-origin page needs its origin in the backend's
`Application(allowed_origins=[...])` for the credentialed fetches,
exactly as the SPA does. A Node.js script has no browser session: it
passes a bearer token the app accepts, or none when the methods it
calls allow anonymous callers.
