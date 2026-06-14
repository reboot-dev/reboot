---
title: Drive Tests with `create_external_context`, Assert, Wait, and Mock
impact: MEDIUM
impactDescription: Tests can't call into the application, observe errors, or wait for workflows without these patterns
tags: testing, external-context, RPC, harness, aborted, errors, mocking, workflows, user-stories
---

## Drive Tests with `create_external_context`

> **Critical:** never instantiate `ReaderContext`/`WriterContext`/etc.
> directly — those are runtime-managed. Use
> `rbt.create_external_context(name=...)` and pass it as the
> `context=` argument to actor method calls. One context can drive
> many calls in a single test.

A test invokes the application using a context created by
`rbt.create_external_context(name=...)`. That context plays the
role of an outside caller — it can invoke any servicer method
just like a real client.

**Incorrect (constructing a context by hand):**

```python
# Don't try to instantiate ReaderContext etc. directly — those
# types are managed by the runtime.
ctx = ReaderContext(...)  # not a public construction path.
```

**Correct:**

```python
context = self.rbt.create_external_context(name=f"test-{self.id()}")
chat_room = ChatRoom.ref("testing-chat-room")

await chat_room.send(context, message="Hello, World")

response = await chat_room.messages(context)
self.assertEqual(response.messages, ["Hello, World"])
```

To satisfy real authorizers (e.g. an MCP-style app where the
production authorizer is `state_id_is_user_id`), impersonate a user
with a bearer token — see "Test Against the Real Authorizers" in
[testing-harness.md](testing-harness.md). Don't bypass authorization
by weakening `authorizer()` in tests.

## `name` Should Be Unique per Test

Pass a name that ties back to the test (e.g. `f"test-{self.id()}"`)
so the tracing output of failing tests is identifiable.

## One Context, Many Calls

A single external context can drive many calls in one test:

```python
async def test_chat_room(self) -> None:
    await self.rbt.up(Application(servicers=[ChatRoomServicer]))

    context = self.rbt.create_external_context(name=f"test-{self.id()}")
    chat_room = ChatRoom.ref("testing-chat-room")

    await chat_room.send(context, message="Hello, World")
    await chat_room.send(context, message="Hello, Reboot!")
    await chat_room.send(context, message="Hello, Peace of Mind!")

    response = await chat_room.messages(context)
    self.assertEqual(
        response.messages,
        [
            "Hello, World",
            "Hello, Reboot!",
            "Hello, Peace of Mind!",
        ],
    )
```

## External Context Can Initiate Transactions

External contexts can call `transaction` methods directly — no
in-app caller needed. This makes them suitable for testing
cross-actor flows like a transfer between two `Account` actors.

## Multiple Contexts for Multi-User Tests

To test that a different user cannot touch another user's state,
create a **second** context with a different `user_id`:

```python
other_context = self.rbt.create_external_context(
    name=f"other-{self.id()}",
    bearer_token=self.rbt.make_valid_oauth_access_token(
        user_id="other-user",
    ),
)
other_cart = Cart.ref(cart.state_id)

with self.assertRaises(Aborted):
    await other_cart.get_cart(other_context)
```

## Asserting on Aborted Methods

Reboot translates `errors_pb2.Aborted` + a typed error model into a
generated `<Service>.<Method>Aborted` exception whose `.error`
attribute is the original error model. Two equivalent shapes for
asserting on it:

**`try`/`except` (explicit error-model check):**

```python
try:
    await account.withdraw(context, amount=50.50)
    raise Exception("Expected `OverdraftError` to be thrown")
except Account.WithdrawAborted as aborted:
    assert isinstance(aborted.error, OverdraftError)
    self.assertEqual(aborted.error.amount, 50.50)
```

**`self.assertRaises` (cleaner, also asserts on the error model):**

```python
with self.assertRaises(Cart.CheckoutAborted) as cm:
    await cart.checkout(
        self.context,
        shipping_address=SHIPPING,
        coupon_code="definitely-not-a-real-code",
    )
self.assertIsInstance(cm.exception.error, InvalidCoupon)
```

For "anything goes wrong" assertions (e.g. authorization denied,
where you only care that the call failed), assert on
`reboot.aio.aborted.Aborted` instead:

```python
from reboot.aio.aborted import Aborted

with self.assertRaises(Aborted):
    await other_cart.get_cart(other_context)
```

## Waiting for Spawned Tasks and Workflows

When a method spawns a task (via `schedule(...).method(context)`
or by returning a `<Service>.<Method>Task`), the call returns
immediately with a `task_id`. Tests must explicitly **wait** for
that task to finish, using `<Service>.<Task>.retrieve`:

```python
# Speed the task up so the test doesn't sit through real delays.
hello_servicer.SECS_UNTIL_WARNING = 0
hello_servicer.ADDITIONAL_SECS_UNTIL_ERASE = 0

send_response = await hello.send(context, message="Hello, World!")

# Wait for the chain of spawned tasks to finish.
warning_response = await Hello.WarningTask.retrieve(
    context,
    task_id=send_response.task_id,
)
await Hello.EraseTask.retrieve(
    context,
    task_id=warning_response.task_id,
)

# Now the post-task state is visible.
messages_response = await hello.messages(context)
self.assertEqual(len(messages_response.messages), 1)
```

For workflows driven by an external service you've mocked (e.g. an
LLM that runs through a scripted sequence of tool calls), an
`asyncio.Event()` set by the mock when it reaches the terminal
step gives the test a clean synchronization point — see the
`ScriptedLibrarian` pattern in the next section.

## Mocking External Services and LLM Calls

Three techniques cover almost every external integration:

**1. Override a workflow or method on a Servicer subclass.** Best
when the external call lives behind a specific method you want
to no-op (e.g. don't actually fulfill an order through Printful):

```python
class NoFulfillOrderServicer(OrderServicer):
    """Override the `fulfill` workflow to skip the Printful
    call during tests."""

    @classmethod
    async def fulfill(
        cls,
        context: WorkflowContext,
        request: Order.FulfillRequest,
    ) -> None:
        return None
```

Then register `NoFulfillOrderServicer` in `Application(...)`
instead of `OrderServicer`. The rest of the system still uses
the production code. Subclassing to mock _behavior_ like this is
fine; overriding `authorizer()` is not — see "Test Against the
Real Authorizers" in [testing-harness.md](testing-harness.md).

**2. `unittest.mock.patch` for plain Python helpers.** Best when
the external call is a free function or async helper the
servicer calls directly:

```python
from unittest.mock import AsyncMock, patch

with patch(
    "servicers.store.fetch_products",
    new=AsyncMock(return_value=catalog),
):
    response = await User.ref(self.user_id).list_products(self.context)
```

The patch path is the **import location** in the consuming
module (`servicers.store.fetch_products`), not the definition
location. Same rule as any `unittest.mock.patch`.

**3. A scripted `FunctionModel` for pydantic-AI agents.** When a
servicer runs an LLM agent, replace the agent's model with a
deterministic `FunctionModel`. The pattern is a stateful
`ScriptedLibrarian` that walks the agent through a fixed
sequence of tool calls and uses `asyncio.Event` to signal
completion. Sketch:

```python
import asyncio
from pydantic_ai.models.function import AgentInfo, FunctionModel
from pydantic_ai.messages import ModelResponse, TextPart, ToolCallPart


class ScriptedAgent:
    def __init__(self) -> None:
        self.done = asyncio.Event()

    async def step(self, messages, info: AgentInfo) -> ModelResponse:
        # Inspect tool-returns in `messages`, pick the next
        # `ToolCallPart` to emit, and `self.done.set()` on the
        # terminal response.
        ...


# In asyncSetUp:
self.script = ScriptedAgent()
wiki_module.librarian.wrapped.model = FunctionModel(self.script.step)

# In the test:
await Wiki.ref(WIKI_ID).ingest(self.context, transcript_id=...)
await self.script.done.wait()  # Workflow has reached the end.
```

Always **restore** the original model in `asyncTearDown` so a
test failure doesn't bleed into the next test.

## Environment Variables in Tests

When servicer code reads from `os.environ` (e.g. an admin key for
authorizing a privileged operation), set the variable in
`asyncSetUp` and restore it in `asyncTearDown`:

```python
async def asyncSetUp(self) -> None:
    self._prev_admin_key = os.environ.get(STORE_ADMIN_KEY_ENV)
    os.environ[STORE_ADMIN_KEY_ENV] = ADMIN_KEY
    # ... rest of setup.

async def asyncTearDown(self) -> None:
    await self.rbt.stop()
    if self._prev_admin_key is None:
        os.environ.pop(STORE_ADMIN_KEY_ENV, None)
    else:
        os.environ[STORE_ADMIN_KEY_ENV] = self._prev_admin_key
```

For environment defaults that must be set **before any module is
imported** (e.g. an LLM SDK that constructs its client at import
time), use `conftest.py` instead — see
[testing-project-setup.md](testing-project-setup.md).

## One Test Method per User Story

The build flows in the `chat-app` and `web-app` skills require
backend unit tests covering each user-facing user story **before**
running the app for the user. The structure that works best is:

- **One test method per user story**, named after the story —
  `test_user_creates_a_room_and_sees_it_listed`,
  `test_user_sends_a_message_and_other_user_sees_it`,
  `test_overdraft_is_rejected_with_overdraft_error`.
- **One external context per test**, named `f"test-{self.id()}"`.
- **Test the contract through `Service.ref(id).method(context, ...)`** —
  never instantiate Servicers directly.
- **Assert on the user-observable outcome** (the response the UI
  would render, or the error message a user would see), not on
  internal state shape.

This matches how the app's user actually uses the app — a manual
click-through would exercise the same path. If a test passes, that
specific user story works end-to-end against the real RPC stack;
the user is unlikely to find a regression in it during their
session.

Anti-pattern: "one test per servicer method." Methods exist for
the framework's sake; user stories exist for the user's. Test the
ones the user notices.
