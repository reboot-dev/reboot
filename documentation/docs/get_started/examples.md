# Examples

Complete Reboot applications to run and take apart. Each one is a real
project, not a snippet.

## Start here

### `bank-pydantic`

[`reboot-dev/reboot-bank-pydantic`](https://github.com/reboot-dev/reboot-bank-pydantic)
— _Python backend; React web app, Expo mobile app, and AI chat UIs_

The most complete example, and the one that shows what "general
purpose" means in practice: **one backend, one `User` per person, and
three front ends**. A multi-user bank with signup, accounts,
transfers, and interest.

It demonstrates:

* [Sign-in and `User` auto-construction](/users/overview): signing in
  enrols the user as a bank customer, in `UserServicer.create`.
* A [web app](/surfaces/web) under `frontend/web/`, signing in with
  `useSignIn()` and branching on `useUser()`.
* A [React Native app](/surfaces/react_native) under
  `frontend/mobile/`, signing in with `expoAuth(...)` against the same
  OAuth server — same hooks, same user.
* [AI chat UIs](/surfaces/ai_chat) under `frontend/mcp/`, so a chat
  client can open accounts and read balances too.
* A debit/credit [transaction](/define/methods#kinds) that atomically
  moves funds between accounts.
* A [task](/tasks) that pays out interest.

### `chat-room` / `hello`

[`reboot-dev/reboot-hello`](https://github.com/reboot-dev/reboot-hello)
— _Python backend, React frontend_

The simplest possible app: one singleton chat room, one reactive
frontend. Open two browsers on the same backend and watch messages
flow.

It includes:

* A reactive frontend.
* [Optimistic updates](/call/from_react#optimistic-updates): sent
  messages render as pending until the backend confirms them.
* A `Dockerfile` showing how to publish to
  [Reboot Cloud](/deploy_on_reboot_cloud).

Because of its simplicity it uses no
[transactions](/define/methods#kinds) — see `bank` or `counter` for
those.

## Web apps

### `counter`

[`reboot-dev/reboot-counter`](https://github.com/reboot-dev/reboot-counter)
— _TypeScript backend, React frontend_

The most concise demonstration of a Reboot transaction plus a reactive
frontend:

* Multiple instances of the same [state type](/define/overview).
* A [transaction](/define/methods#kinds) that
  [atomically moves counts between counters](https://github.com/reboot-dev/reboot-counter/blob/ae017cbe980a1f1cbb6002c28828d333e26b7a64/backend/src/counter_servicer.ts#L36-L58).
* A Next.js frontend using
  [server components](/call/from_react#nextjs-and-server-components).

### `bank`

[`reboot-dev/reboot-bank`](https://github.com/reboot-dev/reboot-bank)
— _Python backend, React frontend_

A sibling of `bank-pydantic` that adds the
[Mailgun integration](/library_services/mailgun), sending an email
transactionally as part of signup.

### `bank-zod`

[`reboot-dev/reboot-bank-zod`](https://github.com/reboot-dev/reboot-bank-zod)
— _TypeScript backend, React frontend_

The same bank with its API defined in [Zod](/define/zod).

### `prosemirror-zod`

[`reboot-dev/reboot-prosemirror-zod`](https://github.com/reboot-dev/reboot-prosemirror-zod)
— _TypeScript backend, React frontend_

Integration with the [ProseMirror](https://prosemirror.net) rich-text
editor.

It demonstrates:

* How to _sync_ a React frontend with a Reboot backend.
* A long-lived control loop as a
  [`workflow`](/define/methods#kinds) method, checkpointing the
  ProseMirror document.

### `boutique`

[`reboot-dev/reboot-boutique`](https://github.com/reboot-dev/reboot-boutique)
— _Python backend, React frontend_

The largest example: a fairly complete web shop, factored into
components that separate teams would plausibly own. Originally forked
from
[GoogleCloudPlatform/microservices-demo](https://github.com/GoogleCloudPlatform/microservices-demo).

Of particular note:

* A more complex React frontend.
* Many [state types](/define/overview) and interactions between them.
* A multi-faceted
  ["checkout" method](https://github.com/reboot-dev/reboot-boutique/blob/7480e9d6b0a72c560a54f73571c49b10d3fa5478/backend/src/checkout/servicer.py#L45-L149)
  that transactionally composes calls to many other services — if any
  part fails, the whole thing aborts atomically.
* Calls to Reboot-hosted gRPC services.

Start with `hello`, `counter`, or `bank` before this one.

## AI chat apps

### `ai-chat-counter`

[`reboot-dev/reboot/…/ai-chat-counter`](https://github.com/reboot-dev/reboot/tree/main/reboot/examples/ai-chat-counter)
— _Python backend, React AI chat UIs and a web app_

A counter with visual UIs that run inside ChatGPT, Claude, VS Code, or
Goose — plus a standalone browser SPA that the chat UI deep-links to.

It demonstrates:

* [`UI` methods](/surfaces/ui_methods) that open React apps in the
  chat interface.
* The [`User` type](/users/overview) as an entry point that creates
  other state types.
* Generated React hooks (`useCounter()`) working unchanged in both the
  chat and browser contexts.

Ask [Claude Code](/get_started/claude_code) or
[Codex](/get_started/codex) to build something like it.

### `chick-potle`

[`reboot-dev/reboot-chick-potle`](https://github.com/reboot-dev/reboot-chick-potle)
— _Python backend, React AI chat UIs_

A small food-ordering app. The AI calls tools to start an order,
browse the menu, and change the cart; the human sees a menu grid and a
cart rendered alongside the conversation.

It demonstrates:

* Two `UI` methods sharing one generated hook (`useFoodOrder()`), so
  adding an item in one view updates the other immediately.
* `User.start_order` as a `Transaction` entry point.
* MCP `Tool`s (`get_menu`, `get_cart`, `add_to_cart`,
  `remove_from_cart`) that let the AI drive the order.

### `agent-wiki`

[`reboot-dev/reboot-agent-wiki`](https://github.com/reboot-dev/reboot-agent-wiki)
— _Python backend, React AI chat UIs_

A shared knowledge base that humans and AIs both read and write. Users
hand in raw conversation transcripts; a background "librarian"
[agent](/agents) distils them into a small, well-organized set of
markdown pages.

It demonstrates:

* A long-running [`workflow`](/implement/workflows) (`Wiki.ingest`)
  acting as a per-wiki background agent.
* `Transaction`s that atomically create related state across types.
* Cross-state references as `<StateType>:<state_id>` URIs embedded in
  markdown, building a page graph with no link table.
* An in-process test suite driving the librarian with a scripted
  Pydantic AI `FunctionModel`, so CI needs no real model calls.
