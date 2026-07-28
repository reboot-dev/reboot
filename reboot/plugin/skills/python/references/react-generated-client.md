---
title: The Generated React Client Contract
impact: HIGH
impactDescription: The exact hook, mutator, and error shapes `rbt generate --react=` emits — identical for web apps and MCP chat apps
tags: react, hooks, generated, codegen, errors, typescript
---

## The Generated React Client Contract

`rbt generate --react=<dir>` emits the same client for every surface,
so this contract holds whether the component renders in a browser SPA
or inside an MCP host. What differs between surfaces — where the
files live, how the backend URL is found, how a user signs in — is in
the skill you are building with:
[`web-app/references/react-client.md`](../../web-app/references/react-client.md)
or
[`chat-app/references/react-scaffolding.md`](../../chat-app/references/react-scaffolding.md).

**Do not read the generated `*_rbt_react.ts` to rediscover any of
this.** It runs to tens of thousands of lines, and every one you open
is re-sent on every later turn.

## What Is Emitted, per State Type

For a state type `Foo`:

```ts
// Two overloads. With an id, the handle directly; without one, the
// default-id form (the signed-in user, or the id the MCP session or
// a URL parameter resolves to).
export function useFoo(args: { id: string }): UseFooApi;
export function useFoo(args?: undefined): {
  foo: UseFooApi | undefined;      // named after the state type
  isLoading: boolean;
};

export interface UseFooApi {
  state_id: string;                // the resolved id
  mutators: FooMutators;
  idempotently: (args: { key: string }) => FooIdempotently;

  // One `use<Reader>` per Reader method. `partialRequest` is
  // optional and partial — every field has a default.
  useBar(partialRequest?: Foo.PartialBarRequest): {
    response: Foo.BarResponse | undefined;
    isLoading: boolean;
    aborted: FooBarAborted | undefined;
  };

  // One per mutation, callable straight off the handle.
  baz(
    partialRequest?: Foo.PartialBazRequest,
    options?: { metadata?: any; idempotencyKey?: string },
  ): Promise<ResponseOrAborted<Foo.BazResponse, FooBazAborted>>;
}

// Per method, a typed error union you can switch on.
export type FooBazAbortedError = /* your declared errors | framework errors */;
export class FooBazAborted extends reboot_api.Aborted { /* .error, .message */ }
```

## Naming Rules

Write the call before you read anything:

- Python snake_case → TypeScript camelCase, for fields and methods
  (`from_index` → `fromIndex`, `open_task_count` → `openTaskCount`).
- A mutation's argument type is `Partial<Method>Request`; request and
  response types are Zod-validated.
- A method's failure type is `<Type><Method>Aborted`, and
  `aborted.error.type` is the Python error class's name.

## Readers Return Three Fields, Not Two

`response`, `isLoading`, **and** `aborted`. A reader can abort — a
denied `authorizer()`, for instance — and that surfaces as `aborted`
rather than by throwing.

Guard on `response !== undefined` before touching data: it is the
only one of the three that narrows `T | undefined`. Use `isLoading`
for connection state. They diverge — an aborted reader is
`!isLoading` with no `response`, a reconnect is `isLoading` with a
stale `response` — and transport disconnects auto-reconnect without
surfacing as `aborted`, so don't build an online/offline indicator
out of it.

## Mutations Never Throw

They resolve to `{ response, aborted }`. A `try/catch` around one
catches nothing and the failure disappears silently. Branch on
`aborted`:

```tsx
const { aborted } = await foo.baz({ title });
if (aborted !== undefined) {
  // `aborted.error.type` is the Python error class's name.
  return show(aborted);
}
```

## Hook IDs Must Be Real on Every Render

An explicit-id hook is not SWR-style: there is no "pass `undefined`
to skip" mode. `id: ''` throws
`state ID must have a length of at least 1`, and `id: undefined`
throws inside `stateIdToRef`. Identity often resolves
asynchronously, so the fix is **not** a placeholder id —
`useFoo({ id: id || '__none__' })` makes every loading session
subscribe to the same shared actor. Don't mount the component until
the id is real: guard at the parent and pass a guaranteed-real id
down.

## Live Updates Are Free

Reader hooks are push-based subscriptions. When any session mutates
the state, every mounted reader re-renders with the new response —
no polling, no refetch call, no transport code of your own.

The transport underneath is chosen for you: gRPC server-streaming
over `https:`, and a WebSocket multiplex otherwise, which is what a
local `http://` dev server uses. It matters only when you are
reading a network trace — and because cross-origin WebSocket frames
carry no cookies, which is why the session JWT rides in the request
payload rather than in a `Cookie` header.
