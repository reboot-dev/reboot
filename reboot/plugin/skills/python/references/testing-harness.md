---
title: Spin Up Tests with the `Reboot()` Harness
impact: MEDIUM
impactDescription: Without the harness, Servicer methods can't be exercised end-to-end
tags: testing, Reboot, harness, IsolatedAsyncioTestCase, setup, authorizer, libraries, impersonation, bearer-token, oauth, token-verifier
---

## Spin Up Tests with the `Reboot()` Harness

> **Critical:** don't construct Servicer instances directly — that
> bypasses identity, context, and persistence. Use `Reboot()` +
> `rbt.up(Application(...))` + `rbt.create_external_context(...)`,
> then call methods through `Service.ref(id).method(context, ...)`.

Reboot ships an in-process test harness at `reboot.aio.tests.Reboot`.
Use it from a `unittest.IsolatedAsyncioTestCase` to start a Reboot
runtime, register an `Application` via `rbt.up(...)`, and tear it
down between tests. Pytest discovers `IsolatedAsyncioTestCase`
subclasses automatically — see
[testing-project-setup.md](testing-project-setup.md) for the
project-level wiring.

**Incorrect (calling Servicer methods directly without a harness):**

```python
# DON'T — there's no actor identity, no context, no persistence.
servicer = ChatRoomServicer()
await servicer.send(...)
```

**Correct (the minimal template):**

```python
import unittest
from chat_room.v1.chat_room_rbt import ChatRoom
from chat_room_servicer import ChatRoomServicer
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot


class TestChatRoom(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_chat_room(self) -> None:
        await self.rbt.up(Application(servicers=[ChatRoomServicer]))

        context = self.rbt.create_external_context(name=f"test-{self.id()}")
        chat_room = ChatRoom.ref("testing-chat-room")

        await chat_room.send(context, message="Hello, World")

        response = await chat_room.messages(context)
        self.assertEqual(response.messages, ["Hello, World"])
```

## Pattern: Setup → Up → Run → Teardown

- `Reboot()` constructs the harness.
- `await rbt.start()` boots the in-process runtime.
- `await rbt.up(Application(...))` launches the application; pass it
  the same Servicers and stdlib `libraries=[...]` you'd pass in
  production.
- `await rbt.stop()` tears it all down.

You can move `rbt.up(...)` into `asyncSetUp` if every test in the
class uses the same `Application` configuration (cleaner) or keep
it in each test method if different tests need different
configurations (more explicit).

## Multi-Servicer Applications

Production apps usually have several servicers. Register all of them
in one `Application(...)` so cross-actor calls work:

```python
await self.rbt.up(
    Application(
        servicers=[
            BankServicerWithAuthorizer,
            AccountServicerWithNoInterestAndAuthorizer,
            CustomerServicer,
        ],
        libraries=[sorted_map_library()],
    )
)
```

Things to know:

- **`libraries=[...]`** — stdlib state types like `OrderedMap` /
  `SortedMap` / `Queue` need their library registered, exactly as
  in `main.py`. See `stdlib-*.md`.
- **`legacy_grpc_servicers=[...]`** — for mixed pydantic + plain
  gRPC apps, listing the plain-gRPC servicers alongside the
  `servicers=[...]` pydantic ones.
- **`initialize=<async fn>`** — runs the same one-shot bootstrap
  hook your `main.py` would run (e.g. creating a singleton state):

  ```python
  async def _initialize(context) -> None:
      await CouponBook.create(context, COUPON_BOOK_ID)

  await self.rbt.up(
      Application(
          servicers=[...],
          initialize=_initialize,
      )
  )
  ```

## Test Against the Real Authorizers — Impersonate, Don't Disable

The harness runs production-mode authorization, and that's the
point: register the **real** servicers — the exact classes `main.py`
registers — and give each test context a real, verified identity. A
test that only passes with authorization disabled proves nothing
about the application the user actually runs; the agent's
`authorizer()` code would ship untested.

The rule of thumb: tests may substitute the **identity layer** (the
OAuth provider or `TokenVerifier`) — **never the authorizers**.

`rbt.make_valid_oauth_access_token(user_id=...)` mints a token the
runtime treats as a real, verified identity. Pair it with
`create_external_context(..., bearer_token=...)` to impersonate that
user and exercise the production authorizer end-to-end:

```python
from reboot.aio.auth.oauth_providers import Anonymous
from reboot.aio.tests import OAuthProviderForTest, Reboot
from servicers.food import APPLICATION_SERVICERS, UserServicer


class TestFoodOrder(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(
            Application(
                # The REAL servicers, with their REAL authorizers.
                servicers=APPLICATION_SERVICERS,
                oauth=OAuthProviderForTest(Anonymous()),
            ),
        )
        self.user_id = "test-user"
        self.context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            bearer_token=self.rbt.make_valid_oauth_access_token(
                user_id=self.user_id,
            ),
        )
```

If a call is denied under the real authorizer, either the context is
missing the right identity (fix the test, see below), or the
authorizer has a bug — which is exactly what the test just caught.
Don't react by weakening the authorizer.

Negative auth tests use a **second** context with a different
`user_id` and assert that calls from it are aborted. See
[testing-external-context.md](testing-external-context.md) for
asserting on aborts.

## Identity Wiring per App Type

Tests mirror the production identity wiring, substituting only the
test-friendly arm:

- **Chat app** (production uses
  `oauth=OAuthProviderByEnvironment(...)`): pass
  `oauth=OAuthProviderForTest(Anonymous())` (both from
  `reboot.aio.tests` / `reboot.aio.auth.oauth_providers`) to the
  test's `Application(...)`, as in the template above.
- **Web app** (production uses `token_verifier=<your IdP verifier>`): pass `token_verifier=TokenVerifierForTest()` (from
  `reboot.aio.tests`) instead. Minted tokens won't — and don't need
  to — pass your production verifier; the verifier seam is the
  supported swap point, and the authorizers still run for real.
- **No identity wiring** (app has no `User` type and no rules that
  need identity): a plain `create_external_context(name=...)`
  without a bearer token is fine.

## App-Internal-Only Methods

Methods whose rule is `is_app_internal()` are reachable only from
inside the application (e.g. other servicers), not from external
callers. To call one from a test, create a context with
`create_external_context(name=..., app_internal=True)`. Keep that
context separate from user contexts: it impersonates the
_application_, not a user, so don't reuse it for calls that should
be attributed to a user.

## Auto-Construct Under Auth

If a state type has a real authorizer that gates its constructor —
typically the case for `User`-shaped front-door types — the MCP session
hook in production calls `_auto_construct` to create the state for an
authenticated user. Tests that don't use MCP skip that hook, so trigger
it manually right after creating the context:

```python
await UserServicer._auto_construct(
    self.context,
    state_id=self.user_id,
)
```

Symptom if you forget: the first call into `User.ref(self.user_id)`
aborts because the state was never constructed.

## Last Resort: Permissive Authorizers

It is possible to subclass a servicer and override `authorizer()` to
`allow()` for the test suite only. **Don't reach for this** — it
tests a different application: the one with no authorization. With
impersonation (above) just as easy to set up, the legitimate uses
are narrow, e.g. exercising the pure behavior of a state type whose
authorization rules are themselves covered by other tests. If you do
use it, say why in a comment, and keep at least one test that runs
the real authorizers.

Subclassing a servicer to mock **non-auth** behavior (e.g. replacing
a method that calls an external service) is fine — see
[testing-external-context.md](testing-external-context.md). The line
is `authorizer()`: overriding it discards the very code the tests
exist to protect.

## Use a Unique Actor ID per Test

Each test should pick its own actor IDs (e.g.
`f"test-room-{self.id()}"`, or just embed `self.id()` in the
external-context `name`). The harness is fresh per test, but using
`self.id()` keeps trace output identifiable.

## Tests Are Real End-to-End

The harness exercises the full RPC path — not Servicer instances
directly. That means the same context-type rules, error semantics,
and serialization apply. If a test passes, the wiring is correct.
This is exactly why "write tests for each user story before
handing the app off" is in the `chat-app` and `web-app` build
flows: the tests catch contract bugs that a manual click-through
won't surface for several minutes.
