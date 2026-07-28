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

The rule of thumb: identity in tests comes from the harness —
`up()` always backs the application under test with a test OAuth
provider — and tests **never** touch the authorizers.

`await rbt.create_external_context_as(name, user_id)` builds a
context carrying a real, verified identity for `user_id`,
exercising the production authorizer end-to-end:

```python
from reboot.aio.tests import Reboot
from servicers.food import APPLICATION_SERVICERS, UserServicer


class TestFoodOrder(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(
            Application(
                # The REAL servicers, with their REAL authorizers.
                servicers=APPLICATION_SERVICERS,
            ),
        )
        self.user_id = "test-user"
        self.context = await self.rbt.create_external_context_as(
            name=f"test-{self.id()}",
            user_id=self.user_id,
        )
```

When a test needs the raw token itself (e.g. to set an
`Authorization:` header),
`rbt.make_valid_oauth_access_token(user_id=...)` mints one.

If a call is denied under the real authorizer, either the context is
missing the right identity (fix the test, see below), or the
authorizer has a bug — which is exactly what the test just caught.
Don't react by weakening the authorizer.

Negative auth tests use a **second** context with a different
`user_id` and assert that calls from it are aborted. See
[testing-external-context.md](testing-external-context.md) for
asserting on aborts.

## Identity Wiring in Tests

Omit `oauth=` in a test's `Application(...)`, whatever the app type:
`up()` always backs the application under test with a test OAuth
provider, so `await rbt.create_external_context_as(name, user_id)`
works with no identity wiring at all. That provider rejects the
browser sign-in flow itself — tests impersonate instead of signing
in.

- **App with a production `token_verifier=`** (e.g. a web app
  verifying an external IdP's tokens): keep the `token_verifier=`
  exactly as in production. The test harness's OAuth server verifies
  the impersonation tokens `create_external_context_as` mints,
  regardless of the app's own `token_verifier=`; a custom bearer a
  test constructs by hand still flows through the app's verifier.
- **No identity needed** (app has no `User` type and no rules that
  need identity): a plain `create_external_context(name=...)`
  without a bearer token is fine.
- **Tests of an OAuth sign-in flow itself** (e.g. of a custom
  `OAuthProvider`): the one exception — pass that provider
  explicitly, via `oauth=OAuthProviderForTest(<provider>)` from
  `reboot.aio.tests`.

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
typically the case for `User`-shaped front-door types — the framework
calls `_authenticated` to create the state for an authenticated user
whenever a token is minted for them. `create_external_context_as(...)`
and `make_valid_oauth_access_token(...)` mint a token, so they
construct the `User` as a side effect and most tests need no manual
setup. To construct the state for a user no context was created for,
call `_authenticated` directly with an app-internal context:

```python
await UserServicer._authenticated(
    self.rbt.create_external_context(name="internal", app_internal=True),
    state_id=self.user_id,
)
```

Symptom if you forget: the first call into `User.ref(self.user_id)`
aborts because the state was never constructed.

To exercise a servicer's `set_claims`, deliver identity claims the
way a real sign-in does — pass `claims=` to
`make_valid_oauth_access_token` (or to `_authenticated` directly):

```python
token = await self.rbt.make_valid_oauth_access_token(
    user_id=self.user_id,
    claims={"email": "alice@example.com"},
)
```

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

## Asserting a Typed Error — and Keeping `mypy` Happy

A method that declares `errors=[QuotaExceededError, ...]` raises
`<Type>.<Method>Aborted` whose `.error` is the typed error. Two
things trip people up:

1. The generated `Aborted` type is per-method:
   `TaskList.AddTaskAborted`, not a bare `Aborted`.
2. `.error` is typed as a **union** of your declared errors plus
   every framework error (`Cancelled`, `PermissionDenied`,
   `Unknown`, …). `mypy` therefore rejects `error.limit` with
   `Item "PermissionDenied" of "QuotaExceededError | Cancelled | ..." has no attribute "limit"` until you narrow it.

```python
with self.assertRaises(TaskList.AddTaskAborted) as caught:
    await TaskList.ref(list_id).add_task(alice, title="one too many")

error = caught.exception.error
assert isinstance(error, QuotaExceededError)  # Narrows the union.
self.assertEqual(error.limit, 10)
```

`unittest`'s `assertIsInstance` checks at runtime but does **not**
narrow for `mypy`; a plain `assert isinstance(...)` does both. Use
the `assert` form, or pair the two.

## Racing Two Mutations in One Test

A concurrency test issues both calls at once and asserts exactly one
survives. Two rules make it work:

- **One external context per concurrent caller.** Contexts are not
  safe to use from two places at once, and a `ref()` is bound to
  the context that first used it (`MixedContextsError`). Create a
  second context for the same user id when a single user races
  themselves from two sessions.
- **Gather with `return_exceptions=True`**, then partition — the
  loser raises, and letting `gather` propagate it would hide the
  winner.

- **Set up a state where exactly one call can succeed.** Two
  concurrent calls that are both individually legal both succeed —
  that tests nothing. The test needs a rule that only one of them
  can satisfy: the last slot under a quota, the last item in stock,
  a balance that covers one of the two transfers.

```python
# Precondition: the rule allows 10 open tasks, and 9 already exist,
# so exactly one of the two racing calls below can be allowed.
for i in range(9):
    await TaskList.ref(list_a).add_task(self.alice, title=f"t{i}")

alice2 = await self.rbt.create_external_context_as(
    name=f"alice2-{self.id()}", user_id=ALICE,
)
results = await asyncio.gather(
    TaskList.ref(list_a).add_task(self.alice, title="race-a"),
    TaskList.ref(list_b).add_task(alice2, title="race-b"),
    return_exceptions=True,
)
failures = [r for r in results if isinstance(r, BaseException)]
self.assertEqual(len(results) - len(failures), 1)
self.assertIsInstance(failures[0], TaskList.AddTaskAborted)

# And the invariant actually held — not just "one call raised".
profile = await User.ref(ALICE).profile(self.alice)
self.assertEqual(profile.open_task_count, 10)
```

Assert the invariant, not only the exception. A test that checks
"one of them failed" passes even if the winner corrupted the
counter on the way through.

Reboot serializes writers on the same actor and rolls transactions
back all-or-nothing, so routing the shared invariant (a counter, a
quota, a balance) through **one** actor is what makes "exactly one
wins" true. If the invariant is spread across two actors with no
transaction covering both, the race is genuinely lossy and no test
setup will fix it.
