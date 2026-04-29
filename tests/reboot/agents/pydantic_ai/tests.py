"""Tests for `reboot.agents.pydantic_ai.Agent` -- specifically the
duplicate-call detection, name-required guard, empty-string
rejection, and `idempotency_seeds` propagation.

Stubs out `reboot.aio.contexts` / `reboot.aio.workflows` so the
tests don't need the full Reboot runtime; what they exercise is
the wrapper's logic against a mocked `at_least_once` that records
the alias strings it sees.
"""
import asyncio
import contextlib
# Stub `reboot.aio.contexts`, `reboot.aio.workflows`, and
# `reboot.aio.idempotency` BEFORE importing anything from
# `reboot.agents`.
import reboot.aio.contexts
import reboot.aio.workflows
import typing
import unittest
import uuid
from typing import Any

# Make mypy treat `FakeWorkflowContext` as a `WorkflowContext`
# subclass so calls like `agent.run(FakeWorkflowContext(), ...)`
# type-check. At runtime `FakeWorkflowContext` is a plain object
# (the stub setup below replaces `reboot.aio.contexts.WorkflowContext`
# with `FakeWorkflowContext` itself, so the inheritance never
# materializes).
if typing.TYPE_CHECKING:
    _WorkflowContextBase = reboot.aio.contexts.WorkflowContext
else:
    _WorkflowContextBase = object

# Each `context.idempotency_seeds(...)` block pushes its merged
# dict onto this stack and pops it on exit. `at_least_once`
# consults the top of the stack when composing its cache key, so
# two agent runs with different seeds get distinct memo slots
# even though their aliases are identical -- mirroring what
# `_idempotency_key` does in production.
_idempotency_seeds_stack: list[dict[str, Any]] = []
_idempotency_seeds_calls: list[dict[str, Any]] = []


class FakeWorkflowContext(_WorkflowContextBase):
    # Narrow `workflow_id` from the parent's `UUID | None` to `UUID`
    # so test sites that index `_agent_runs[ctx.workflow_id]` type-check
    # without an `assert ... is not None`. The override is a Liskov
    # widening (parent allows None, child rules it out for tests).
    workflow_id: uuid.UUID  # type: ignore[assignment]

    def __init__(  # type: ignore[override]
        self,
        workflow_id: uuid.UUID | None = None,
        workflow_iteration: int | None = None,
        within_loop: bool = False,
    ) -> None:
        # `workflow_id` is read-only on the real `Context`; on the
        # fake we assign directly via `__dict__` (the class-level
        # annotation above shadows the parent property for typing
        # purposes).
        self.workflow_id = workflow_id or uuid.uuid4()  # type: ignore[misc]
        self._workflow_iteration = workflow_iteration
        self._within_loop = within_loop
        # Mirror the real `WorkflowContext` callback registries
        # so tests can drive the lifecycle by firing manually.
        self._on_iteration_complete: list = []
        self._on_method_complete: list = []

    @property
    def workflow_iteration(self) -> int | None:
        return (self._workflow_iteration if self._within_loop else None)

    def within_loop(self) -> bool:
        return self._within_loop

    def on_iteration_complete(self, callback) -> None:
        self._on_iteration_complete.append(callback)

    def on_method_complete(self, callback) -> None:
        self._on_method_complete.append(callback)

    @contextlib.contextmanager
    def idempotency_seeds(self, entries: dict[str, Any]):
        _idempotency_seeds_calls.append(dict(entries))
        parent = (
            _idempotency_seeds_stack[-1] if _idempotency_seeds_stack else {}
        )
        _idempotency_seeds_stack.append({**parent, **entries})
        try:
            yield
        finally:
            _idempotency_seeds_stack.pop()

    async def fire_iteration_complete(self, completed_iteration: int) -> None:
        # Mirrors the real runtime: iterate without clearing,
        # await async callbacks.
        import inspect as _inspect
        for callback in self._on_iteration_complete:
            result = callback(iteration=completed_iteration)
            if _inspect.isawaitable(result):
                await result

    async def fire_method_complete(self, retrying: bool) -> None:
        # Mirrors the real runtime: fire then clear both lists,
        # await async callbacks.
        import inspect as _inspect
        method_callbacks = self._on_method_complete
        self._on_method_complete = []
        self._on_iteration_complete = []
        for callback in method_callbacks:
            result = callback(retrying=retrying)
            if _inspect.isawaitable(result):
                await result


reboot.aio.contexts.WorkflowContext = FakeWorkflowContext  # type: ignore[assignment, misc]

# Capture every alias string passed to `at_least_once` so tests
# can assert what the metadata splice produced. The cache keys
# off `(context.workflow_id, alias)` so replay-style same-context
# calls hit the same memo slot.
_recorded_aliases: list[str] = []
_memo_cache: dict[Any, Any] = {}


async def _stub_at_least_once(
    alias_or_tuple,
    context,
    callable,
    *,
    type=None,
    effect_validation=None,
):
    if isinstance(alias_or_tuple, tuple):
        alias = alias_or_tuple[0]
    else:
        alias = alias_or_tuple
    _recorded_aliases.append(alias)
    # Compose a cache key that mirrors what the real
    # `_make_alias` would produce: alias + active metadata +
    # current control-loop iteration.
    seeds = (
        tuple(
            sorted(
                (
                    (k, repr(v))
                    for k, v in _idempotency_seeds_stack[-1].items()
                ),
                key=lambda item: item[0],
            )
        ) if _idempotency_seeds_stack else ()
    )
    iteration = context.workflow_iteration
    key = (context.workflow_id, iteration, alias, seeds)
    if key not in _memo_cache:
        _memo_cache[key] = await callable()
    return _memo_cache[key]


reboot.aio.workflows.at_least_once = _stub_at_least_once  # type: ignore[assignment]

import pydantic_ai  # noqa: E402
from pydantic_ai import RunContext  # noqa: E402
from pydantic_ai.exceptions import UserError  # noqa: E402
from pydantic_ai.messages import (  # noqa: E402
    ModelRequest,
    ModelResponse,
    TextPart,
    ToolCallPart,
    UserPromptPart,
)
from pydantic_ai.models.function import FunctionModel  # noqa: E402
from pydantic_ai.toolsets.function import FunctionToolset  # noqa: E402
# Now real imports of `reboot.agents` will pick up the stubs.
from reboot.agents.pydantic_ai import Agent  # noqa: E402


def _reset_state() -> None:
    _recorded_aliases.clear()
    _memo_cache.clear()
    _idempotency_seeds_calls.clear()


def _make_function_model(call_counter: list[int]) -> FunctionModel:
    """Make a FunctionModel that counts how many times its
    underlying handler was invoked, returning a unique reply per
    call.
    """

    def fn(messages, info):
        call_counter[0] += 1
        return ModelResponse(parts=[TextPart(content=f"r{call_counter[0]}")])

    return FunctionModel(fn)


class NameRequiredTestCase(unittest.TestCase):

    def test_constructing_without_name_raises(self) -> None:
        with self.assertRaises(UserError) as ctx:
            Agent(_make_function_model([0]))  # no name=
        self.assertIn("unique `name`", str(ctx.exception))

    def test_wrap_of_nameless_pydantic_agent_raises(self) -> None:
        bare = pydantic_ai.Agent(_make_function_model([0]))  # no name=
        with self.assertRaises(UserError) as ctx:
            Agent.wrap(bare)
        self.assertIn("unique `name`", str(ctx.exception))

    def test_constructing_with_name_succeeds(self) -> None:
        Agent(_make_function_model([0]), name="my_agent")  # no raise

    def test_wrap_with_named_pydantic_agent_succeeds(self) -> None:
        bare = pydantic_ai.Agent(_make_function_model([0]), name="my_agent")
        Agent.wrap(bare)  # no raise


class EmptyStringRejectionTestCase(unittest.IsolatedAsyncioTestCase):

    async def test_empty_user_prompt_raises(self) -> None:
        _reset_state()
        agent = Agent(_make_function_model([0]), name="a")
        with self.assertRaises(UserError) as ctx:
            await agent.run(FakeWorkflowContext(), "")
        self.assertIn("must not be an empty string", str(ctx.exception))

    async def test_empty_variant_raises(self) -> None:
        _reset_state()
        agent = Agent(_make_function_model([0]), name="a")
        with self.assertRaises(UserError) as ctx:
            await agent.run(FakeWorkflowContext(), "hi", variant="")
        self.assertIn(
            "`variant` must not be an empty string", str(ctx.exception)
        )


class WorkflowContextRequiredTestCase(unittest.IsolatedAsyncioTestCase):
    """If a user calls our entry points through an
    `AbstractAgent`-typed reference (whose signature has no
    `context`), Python's positional binding will route their
    `user_prompt` into our `context` slot. Without the runtime
    isinstance check, that would crash deep in `_agent_run` with
    a confusing `AttributeError`. With the check, we raise
    `UserError` up front naming the fix.
    """

    async def test_run_with_non_context_first_arg_raises(self) -> None:
        agent = Agent(_make_function_model([0]), name="a")
        with self.assertRaises(UserError) as ctx:
            # Mimic what `AbstractAgent.run("hi")` would do:
            # `"hi"` lands in the `context` slot.
            await agent.run("hi")  # type: ignore[call-overload]
        self.assertIn("requires `context: ", str(ctx.exception))
        self.assertIn("WorkflowContext", str(ctx.exception))

    async def test_iter_with_non_context_first_arg_raises(self) -> None:
        agent = Agent(_make_function_model([0]), name="a")
        with self.assertRaises(UserError) as ctx:
            async with agent.iter("hi"):  # type: ignore[call-overload]
                pass
        self.assertIn("WorkflowContext", str(ctx.exception))

    async def test_run_stream_with_non_context_first_arg_raises(self) -> None:
        agent = Agent(_make_function_model([0]), name="a")
        with self.assertRaises(UserError) as ctx:
            async with agent.run_stream("hi"):  # type: ignore[call-overload]
                pass
        self.assertIn("WorkflowContext", str(ctx.exception))

    async def test_run_stream_events_with_non_context_first_arg_raises(
        self,
    ) -> None:
        agent = Agent(_make_function_model([0]), name="a")
        with self.assertRaises(UserError) as ctx:
            async for _ in agent.run_stream_events(
                "hi"  # type: ignore[call-overload]
            ):
                pass
        self.assertIn("WorkflowContext", str(ctx.exception))


class DuplicateCallDetectionTestCase(unittest.IsolatedAsyncioTestCase):

    async def test_sequential_same_args_raises(self) -> None:
        _reset_state()
        counter = [0]
        agent = Agent(_make_function_model(counter), name="a")
        ctx = FakeWorkflowContext()
        await agent.run(ctx, "hi")
        with self.assertRaises(UserError) as exc:
            await agent.run(ctx, "hi")
        self.assertIn("Duplicate agent run", str(exc.exception))
        self.assertEqual(counter[0], 1)

    async def test_sequential_distinct_variants_succeed(self) -> None:
        _reset_state()
        counter = [0]
        agent = Agent(_make_function_model(counter), name="a")
        ctx = FakeWorkflowContext()
        r1 = await agent.run(ctx, "hi", variant="first")
        r2 = await agent.run(ctx, "hi", variant="second")
        self.assertNotEqual(r1.output, r2.output)
        self.assertEqual(counter[0], 2)

    async def test_message_history_only_differentiation(self) -> None:
        _reset_state()
        counter = [0]
        agent = Agent(_make_function_model(counter), name="a")
        ctx = FakeWorkflowContext()
        history_a = [ModelRequest(parts=[UserPromptPart(content="prior A")])]
        history_b = [ModelRequest(parts=[UserPromptPart(content="prior B")])]
        # Same prompt, same variant (both None), but different
        # histories -- must succeed and produce distinct memos.
        r1 = await agent.run(ctx, "hi", message_history=history_a)
        r2 = await agent.run(ctx, "hi", message_history=history_b)
        self.assertNotEqual(r1.output, r2.output)
        self.assertEqual(counter[0], 2)

    async def test_parallel_gather_same_args_one_raises(self) -> None:
        _reset_state()
        counter = [0]
        agent = Agent(_make_function_model(counter), name="a")
        ctx = FakeWorkflowContext()
        results = await asyncio.gather(
            agent.run(ctx, "hi"),
            agent.run(ctx, "hi"),
            return_exceptions=True,
        )
        # Exactly one should be a UserError; the other a result.
        errors = [r for r in results if isinstance(r, UserError)]
        successes = [r for r in results if not isinstance(r, BaseException)]
        self.assertEqual(len(errors), 1)
        self.assertEqual(len(successes), 1)
        self.assertIn("Duplicate agent run", str(errors[0]))

    async def test_cross_iteration_same_args_succeed(self) -> None:
        _reset_state()
        counter = [0]
        agent = Agent(_make_function_model(counter), name="a")
        # Two contexts representing two iterations of a control
        # loop on the same workflow. The runtime fires
        # `on_iteration_complete` between iterations, which clears
        # the per-iteration tracking so the second iteration's
        # same-args call is allowed.
        ctx0 = FakeWorkflowContext(within_loop=True, workflow_iteration=0)
        ctx1 = FakeWorkflowContext(
            workflow_id=ctx0.workflow_id,
            within_loop=True,
            workflow_iteration=1,
        )
        await agent.run(ctx0, "hi")
        await ctx0.fire_iteration_complete(0)
        await agent.run(ctx1, "hi")  # same args, different iter
        self.assertEqual(counter[0], 2)

    async def test_method_complete_drops_workflow_entry(self) -> None:
        # When the workflow method finishes, the runtime fires
        # `on_method_complete` callbacks. The agent registers
        # one that drops `_active_calls[workflow_id]`.
        from reboot.agents.pydantic_ai._run import _agent_runs as _active_calls

        _reset_state()
        agent = Agent(_make_function_model([0]), name="a")
        ctx = FakeWorkflowContext()
        await agent.run(ctx, "hi")
        self.assertIn(ctx.workflow_id, _active_calls)

        # Simulate the runtime firing the method-complete
        # callbacks at attempt end.
        await ctx.fire_method_complete(retrying=False)
        self.assertNotIn(ctx.workflow_id, _active_calls)

    async def test_method_complete_failure_path_also_drops(self) -> None:
        # `on_method_complete` is called with `succeeded=False`
        # on the exception path; the agent's cleanup must run
        # uniformly.
        from reboot.agents.pydantic_ai._run import _agent_runs as _active_calls

        _reset_state()
        agent = Agent(_make_function_model([0]), name="a")
        ctx = FakeWorkflowContext()
        await agent.run(ctx, "hi")
        await ctx.fire_method_complete(retrying=True)
        self.assertNotIn(ctx.workflow_id, _active_calls)

    async def test_iteration_complete_clears_per_iteration(self) -> None:
        # Each iteration boundary fires the registered
        # `on_iteration_complete` callbacks; the agent's
        # callback clears the `per_iteration` set so long-
        # running loops don't accumulate state.
        from reboot.agents.pydantic_ai._run import _agent_runs

        _reset_state()
        agent = Agent(_make_function_model([0]), name="a")
        # Two iterations of a loop on the same context.
        ctx = FakeWorkflowContext(within_loop=True, workflow_iteration=0)
        await agent.run(ctx, "hi")
        self.assertEqual(len(_agent_runs[ctx.workflow_id].per_iteration), 1)

        await ctx.fire_iteration_complete(0)
        self.assertEqual(len(_agent_runs[ctx.workflow_id].per_iteration), 0)

        # Iteration 1 reuses the same context after advancing
        # iteration; the registered iteration callback is
        # persistent (NOT cleared by the iteration fire) so
        # firing the next boundary still works.
        ctx._workflow_iteration = 1
        await agent.run(ctx, "hi")
        self.assertEqual(len(_agent_runs[ctx.workflow_id].per_iteration), 1)
        await ctx.fire_iteration_complete(1)
        self.assertEqual(len(_agent_runs[ctx.workflow_id].per_iteration), 0)

    async def test_method_restart_after_complete_works(self) -> None:
        # After `on_method_complete` fires, the callback list
        # is cleared. A re-invocation of `agent.run` on the
        # same context (simulating a retry) must register
        # fresh callbacks and work correctly.
        from reboot.agents.pydantic_ai._run import _agent_runs as _active_calls

        _reset_state()
        agent = Agent(_make_function_model([0]), name="a")
        ctx = FakeWorkflowContext()
        await agent.run(ctx, "hi")
        await ctx.fire_method_complete(retrying=False)
        self.assertNotIn(ctx.workflow_id, _active_calls)

        # Same context, same args -- should succeed again
        # because tracking was reset.
        await agent.run(ctx, "hi")
        self.assertIn(ctx.workflow_id, _active_calls)


class AliasMetadataPropagationTestCase(unittest.IsolatedAsyncioTestCase):
    """Verify the `idempotency_seeds` block opened by
    `_agent_run` receives the agent run's identifying fields under
    namespaced keys -- with `None` preserved verbatim for omitted
    arguments. Composition of the metadata into actual alias
    strings is covered by `idempotency_seeds_tests.py`.
    """

    async def test_alias_carries_namespaced_metadata(self) -> None:
        _reset_state()
        counter = [0]
        agent = Agent(_make_function_model(counter), name="my_agent")
        ctx = FakeWorkflowContext()
        await agent.run(ctx, "hi", variant="v1")
        self.assertEqual(len(_idempotency_seeds_calls), 1)
        entries = _idempotency_seeds_calls[0]
        self.assertEqual(entries["agent_name"], "my_agent")
        self.assertEqual(entries["agent_run_user_prompt"], "hi")
        self.assertEqual(entries["agent_run_variant"], "v1")
        self.assertIsNone(entries["agent_run_message_history"])

    async def test_omitted_variant_passes_none_into_metadata(self) -> None:
        _reset_state()
        counter = [0]
        agent = Agent(_make_function_model(counter), name="my_agent")
        ctx = FakeWorkflowContext()
        # `pydantic_ai.Agent.run` itself requires *some* input
        # (prompt, history, or instructions), so we pass a prompt
        # but leave variant + message_history at their defaults
        # to verify `None` flows through unchanged.
        await agent.run(ctx, "hi")
        self.assertEqual(len(_idempotency_seeds_calls), 1)
        entries = _idempotency_seeds_calls[0]
        self.assertEqual(entries["agent_name"], "my_agent")
        self.assertEqual(entries["agent_run_user_prompt"], "hi")
        # `None` flows through as `None` -- not coerced to "" --
        # so downstream alias rendering can distinguish "caller
        # omitted" from any other value.
        self.assertIsNone(entries["agent_run_variant"])
        self.assertIsNone(entries["agent_run_message_history"])


# Module-level recorder + tool function for
# `test_per_run_toolsets_dispatch_through_at_least_once`. The tool
# has to be module-level (not a local closure inside the test) so
# `_digest()` can pickle it; that's how Reboot's `_Digests`
# snapshot stays stable across processes for replay-drift checks.
# Named `lookup` to match the `tool_name="lookup"` the test's
# model emits.
_per_run_toolsets_invocations: list[str] = []


async def lookup(run: RunContext[None], query: str) -> str:
    _per_run_toolsets_invocations.append(query)
    return f"r-{query}"


def _make_tool_call_then_text_model(
    tool_name: str,
    tool_args_list: list[dict[str, Any]],
    final_text: str = "done",
) -> FunctionModel:
    """A `FunctionModel` whose first response issues `len(tool_args_list)`
    tool calls (each with the given args) and whose second response is
    a plain text response that ends the run.
    """

    def fn(messages, info):
        # On the very first turn there's only a `ModelRequest` in
        # the history; we issue tool calls. On the next turn the
        # tool returns are appended and we close out the run.
        already_issued_tool_calls = any(
            isinstance(part, ToolCallPart) for message in messages
            if isinstance(message, ModelResponse) for part in message.parts
        )
        if already_issued_tool_calls:
            return ModelResponse(parts=[TextPart(content=final_text)])
        parts: list[Any] = []
        for index, args in enumerate(tool_args_list):
            parts.append(
                ToolCallPart(
                    tool_name=tool_name,
                    args=args,
                    tool_call_id=f"call-{index}",
                ),
            )
        return ModelResponse(parts=parts)

    return FunctionModel(fn)


class ToolCallWrappingTestCase(unittest.IsolatedAsyncioTestCase):
    """Tests that every tool call -- whether registered via
    `Agent.tool`, passed in `tools=`, or contributed by a
    user-supplied toolset -- flows through Reboot's
    `at_least_once` / `idempotency_seeds` envelope, and that the
    `Agent.tool` decorator's two-context signature is honoured.
    """

    async def test_decorated_tool_records_alias_and_seeds(self) -> None:
        _reset_state()
        tool_calls: list[tuple[Any, Any, str]] = []

        agent = Agent(
            _make_tool_call_then_text_model(
                "lookup",
                [{
                    "query": "hello"
                }],
            ),
            name="my_agent",
        )

        @agent.tool
        async def lookup(
            context,
            run: RunContext[None],
            query: str,
        ) -> str:
            tool_calls.append((context, run, query))
            return f"result-{query}"

        ctx = FakeWorkflowContext()
        await agent.run(ctx, "go")

        # The tool ran once, with the workflow context first and
        # the run context second.
        self.assertEqual(len(tool_calls), 1)
        captured_context, captured_run, captured_query = tool_calls[0]
        self.assertIs(captured_context, ctx)
        self.assertIsInstance(captured_run, RunContext)
        self.assertEqual(captured_query, "hello")

        # `at_least_once` was invoked with a `Tool call for step
        # #N` alias (in addition to the model-call aliases).
        tool_aliases = [
            alias for alias in _recorded_aliases
            if alias.startswith("Tool call for step #")
        ]
        self.assertEqual(len(tool_aliases), 1)

        # The tool was wrapped in `context.idempotency_seeds(...)`
        # carrying `tool_name`, `tool_call_id`, and `run_step`.
        tool_seed_calls = [
            entries for entries in _idempotency_seeds_calls
            if "tool_name" in entries
        ]
        self.assertEqual(len(tool_seed_calls), 1)
        seeds = tool_seed_calls[0]
        self.assertEqual(seeds["tool_name"], "lookup")
        self.assertEqual(seeds["tool_call_id"], "call-0")
        self.assertIsInstance(seeds["run_step"], int)

    async def test_tool_passed_via_tools_kwarg_is_wrapped(self) -> None:
        _reset_state()
        invocations = [0]

        async def lookup(run: RunContext[None], query: str) -> str:
            invocations[0] += 1
            return f"result-{query}"

        agent = Agent(
            _make_tool_call_then_text_model(
                "lookup",
                [{
                    "query": "via-tools-kwarg"
                }],
            ),
            name="my_agent",
            tools=[lookup],
        )

        ctx = FakeWorkflowContext()
        await agent.run(ctx, "go")

        self.assertEqual(invocations[0], 1)
        tool_aliases = [
            alias for alias in _recorded_aliases
            if alias.startswith("Tool call for step #")
        ]
        self.assertEqual(len(tool_aliases), 1)

    async def test_tool_via_user_toolset_is_wrapped(self) -> None:
        _reset_state()
        invocations = [0]

        async def lookup(run: RunContext[None], query: str) -> str:
            invocations[0] += 1
            return f"result-{query}"

        toolset: FunctionToolset[None] = FunctionToolset(tools=[lookup])
        agent = Agent(
            _make_tool_call_then_text_model(
                "lookup",
                [{
                    "query": "via-toolset"
                }],
            ),
            name="my_agent",
            toolsets=[toolset],
        )

        ctx = FakeWorkflowContext()
        await agent.run(ctx, "go")

        self.assertEqual(invocations[0], 1)
        tool_aliases = [
            alias for alias in _recorded_aliases
            if alias.startswith("Tool call for step #")
        ]
        self.assertEqual(len(tool_aliases), 1)

    async def test_parallel_tool_calls_get_distinct_seeds(self) -> None:
        _reset_state()
        invocations: list[str] = []

        async def lookup(run: RunContext[None], query: str) -> str:
            invocations.append(query)
            return f"result-{query}"

        # Same tool, two parallel calls with different args; the
        # model returns BOTH `ToolCallPart`s in one response so
        # pydantic_ai dispatches them concurrently.
        agent = Agent(
            _make_tool_call_then_text_model(
                "lookup",
                [{
                    "query": "first"
                }, {
                    "query": "second"
                }],
            ),
            name="my_agent",
            tools=[lookup],
        )

        ctx = FakeWorkflowContext()
        await agent.run(ctx, "go")

        # Both calls executed.
        self.assertEqual(sorted(invocations), ["first", "second"])

        # Each parallel call opened its own `idempotency_seeds`
        # block with a DISTINCT `tool_call_id`.
        tool_seed_calls = [
            entries for entries in _idempotency_seeds_calls
            if "tool_name" in entries
        ]
        self.assertEqual(len(tool_seed_calls), 2)
        tool_call_ids = {
            entries["tool_call_id"] for entries in tool_seed_calls
        }
        self.assertEqual(tool_call_ids, {"call-0", "call-1"})

    async def test_tool_replay_returns_cached_result(self) -> None:
        _reset_state()
        invocations = [0]

        async def lookup(run: RunContext[None], query: str) -> str:
            invocations[0] += 1
            return f"result-{query}"

        agent = Agent(
            _make_tool_call_then_text_model(
                "lookup",
                [{
                    "query": "replay"
                }],
            ),
            name="my_agent",
            tools=[lookup],
        )

        # First run executes the tool.
        ctx_first = FakeWorkflowContext()
        await agent.run(ctx_first, "go")
        self.assertEqual(invocations[0], 1)

        # Second run on a context that shares the same
        # `workflow_id` (replay scenario): the `_stub_at_least_once`
        # cache keys on `(workflow_id, iteration, alias, seeds)`,
        # so an identical alias + seeds should hit the cache and
        # NOT call the tool body again.
        #
        # Reuse the same context so the cache lookup hits.
        ctx_second = ctx_first
        # Need to re-allow the agent run on this context: clear
        # the per-attempt duplicate-call tracking by firing the
        # method-complete callback (mirrors what the runtime would
        # do at the end of the workflow attempt).
        await ctx_first.fire_method_complete(retrying=False)

        await agent.run(ctx_second, "go")
        # Tool body NOT re-invoked; the memoized return was used.
        self.assertEqual(invocations[0], 1)

    async def test_tool_added_after_wrap_is_wrapped(self) -> None:
        # `Agent.wrap()` walks the wrapped agent's toolsets to
        # apply our `_WrapperToolset` and exposes the underlying
        # `FunctionToolset` as `self._function_toolset`, so
        # `@agent.tool` decorations applied AFTER `wrap()`
        # participate in the same wrapping as decorations applied
        # to a directly-constructed `Agent(...)`.
        _reset_state()
        invocations = [0]

        bare = pydantic_ai.Agent(
            _make_tool_call_then_text_model(
                "lookup",
                [{
                    "query": "post-wrap"
                }],
            ),
            name="my_agent",
        )
        agent = Agent.wrap(bare)

        @agent.tool
        async def lookup(
            context,
            run: RunContext[None],
            query: str,
        ) -> str:
            invocations[0] += 1
            return f"result-{query}"

        ctx = FakeWorkflowContext()
        await agent.run(ctx, "go")

        self.assertEqual(invocations[0], 1)
        # The tool call went through `at_least_once`.
        tool_aliases = [
            alias for alias in _recorded_aliases
            if alias.startswith("Tool call for step #")
        ]
        self.assertEqual(len(tool_aliases), 1)


from pydantic_ai.tools import ToolDefinition  # noqa: E402
from pydantic_ai.toolsets.abstract import (  # noqa: E402
    AbstractToolset,
    ToolsetTool,
)
from reboot.agents.pydantic_ai import _toolset as _reboot_toolset  # noqa: E402
from reboot.agents.pydantic_ai._toolset import (  # noqa: E402
    _make_toolset_wrapper,
    _MCPWrapperToolset,
    _WrapperToolset,
)


class FakeMCPServer(AbstractToolset[None]):
    """Fake MCPServer-like toolset used to exercise the
    `_MCPWrapperToolset` IO-memoization path. Records every
    `get_tools` / `get_instructions` / `call_tool` invocation so
    tests can assert how often each was dispatched.
    """

    def __init__(
        self,
        name: str | None,
        *,
        cache_tools: bool = False,
        include_instructions: bool = False,
        instructions_text: str = "mcp-instructions",
    ) -> None:
        self._name = name
        self.cache_tools = cache_tools
        self.include_instructions = include_instructions
        self._instructions_text = instructions_text
        self.get_tools_calls = 0
        self.get_instructions_calls = 0
        self.call_tool_calls: list[tuple[str, dict[str, Any]]] = []

    @property
    def id(self) -> str | None:
        return self._name

    @property
    def label(self) -> str:
        # `_name` is `str | None`; pydantic_ai's `label` requires
        # a string, so fall back to a placeholder for the
        # nameless test fixtures.
        return self._name or "fake-mcp"

    async def get_tools(self, ctx) -> dict[str, ToolsetTool[None]]:
        self.get_tools_calls += 1
        return {
            "echo":
                self.tool_for_tool_def(
                    ToolDefinition(
                        name="echo",
                        description="Echoes its argument.",
                        parameters_json_schema={"type": "object"},
                    )
                ),
        }

    async def get_instructions(self, ctx):
        self.get_instructions_calls += 1
        return self._instructions_text

    async def call_tool(self, name, tool_args, ctx, tool):
        self.call_tool_calls.append((name, dict(tool_args)))
        return f"echoed:{tool_args.get('value')}"

    def tool_for_tool_def(self, tool_def: ToolDefinition) -> ToolsetTool[None]:
        # `ToolsetTool` requires a `SchemaValidator`; the wrapper
        # doesn't actually use it, so any sentinel non-None value
        # suffices for the tests that don't exercise call_tool's
        # arg validation path.
        return ToolsetTool(
            toolset=self,
            tool_def=tool_def,
            max_retries=0,
            args_validator=object(),  # type: ignore[arg-type]
        )

    def apply(self, visitor) -> None:
        visitor(self)

    def visit_and_replace(self, visitor):
        return visitor(self)


class _StubRunContext:
    """Minimal stand-in for `pydantic_ai.RunContext` -- the wrapper
    code only forwards it (and reads `run_step` for the step-keyed
    alias), so any sentinel object with `run_step` works.
    """

    def __init__(self, run_step: int = 0) -> None:
        self.tool_call_id = "stub-call"
        self.run_step = run_step


def _stub_run_context(run_step: int = 0) -> RunContext[None]:
    """Cast helper -- `_StubRunContext` is duck-compatible with
    `RunContext[None]` for the wrapper code we exercise, but
    isn't a subclass. Cast through `Any` so test call sites
    type-check without spamming `# type: ignore` everywhere.
    """
    from typing import cast as _cast
    return _cast(RunContext[None], _StubRunContext(run_step))


class MCPWrapperToolsetTestCase(unittest.IsolatedAsyncioTestCase):
    """Verifies `_MCPWrapperToolset` routes `get_tools`,
    `get_instructions`, and `call_tool` through `at_least_once`,
    skips `get_instructions` when `include_instructions=False`,
    and short-circuits `__aenter__` / `__aexit__`.
    """

    async def test_get_tools_goes_through_at_least_once(self) -> None:
        _reset_state()
        fake = FakeMCPServer("mcp-a")
        wrapper = _MCPWrapperToolset(fake)
        context = FakeWorkflowContext()
        from reboot.agents.pydantic_ai._run import _workflow_context
        token = _workflow_context.set(context)
        try:
            tools = await wrapper.get_tools(_stub_run_context(run_step=3))
        finally:
            _workflow_context.reset(token)
        self.assertEqual(set(tools.keys()), {"echo"})
        self.assertEqual(fake.get_tools_calls, 1)
        # Alias is step-keyed so different steps get distinct memo
        # entries (matters when `cache_tools=False`).
        self.assertIn(
            f"MCP get_tools for {fake.id} step #3",
            _recorded_aliases,
        )

    async def test_get_tools_cache_tools_true_skips_at_least_once(
        self,
    ) -> None:
        # With `cache_tools=True`, the first call populates the
        # wrapper-level cache and goes through `at_least_once`;
        # subsequent calls (any step) short-circuit before
        # `at_least_once`, so no new aliases are recorded and the
        # wrapped server is not re-hit.
        _reset_state()
        fake = FakeMCPServer("mcp-a", cache_tools=True)
        wrapper = _MCPWrapperToolset(fake)
        context = FakeWorkflowContext()
        from reboot.agents.pydantic_ai._run import _workflow_context
        token = _workflow_context.set(context)
        try:
            await wrapper.get_tools(_stub_run_context(run_step=0))
            await wrapper.get_tools(_stub_run_context(run_step=1))
            await wrapper.get_tools(_stub_run_context(run_step=2))
        finally:
            _workflow_context.reset(token)
        # Wrapped server hit exactly once thanks to the cache.
        self.assertEqual(fake.get_tools_calls, 1)
        # Only step #0's alias was ever recorded; steps 1+
        # short-circuited before `at_least_once`.
        get_tools_aliases = [
            alias for alias in _recorded_aliases
            if alias.startswith("MCP get_tools for")
        ]
        self.assertEqual(
            get_tools_aliases,
            [f"MCP get_tools for {fake.id} step #0"],
        )

    async def test_get_tools_cache_tools_false_refetches_per_step(
        self,
    ) -> None:
        # With `cache_tools=False`, every step issues a fresh
        # `at_least_once` with a step-keyed alias. The wrapped
        # server is hit once per step (no wrapper-level cache).
        _reset_state()
        fake = FakeMCPServer("mcp-a", cache_tools=False)
        wrapper = _MCPWrapperToolset(fake)
        context = FakeWorkflowContext()
        from reboot.agents.pydantic_ai._run import _workflow_context
        token = _workflow_context.set(context)
        try:
            await wrapper.get_tools(_stub_run_context(run_step=0))
            await wrapper.get_tools(_stub_run_context(run_step=1))
            await wrapper.get_tools(_stub_run_context(run_step=2))
        finally:
            _workflow_context.reset(token)
        self.assertEqual(fake.get_tools_calls, 3)
        get_tools_aliases = [
            alias for alias in _recorded_aliases
            if alias.startswith("MCP get_tools for")
        ]
        self.assertEqual(
            get_tools_aliases,
            [
                f"MCP get_tools for {fake.id} step #0",
                f"MCP get_tools for {fake.id} step #1",
                f"MCP get_tools for {fake.id} step #2",
            ],
        )

    async def test_get_instructions_skipped_when_disabled(self) -> None:
        _reset_state()
        fake = FakeMCPServer("mcp-a", include_instructions=False)
        wrapper = _MCPWrapperToolset(fake)
        context = FakeWorkflowContext()
        from reboot.agents.pydantic_ai._run import _workflow_context
        token = _workflow_context.set(context)
        try:
            result = await wrapper.get_instructions(_stub_run_context())
        finally:
            _workflow_context.reset(token)
        # Short-circuited, no IO and no `at_least_once` alias.
        self.assertIsNone(result)
        self.assertEqual(fake.get_instructions_calls, 0)
        self.assertFalse(
            any(
                alias.startswith("MCP get_instructions for")
                for alias in _recorded_aliases
            )
        )

    async def test_get_instructions_memoized_per_step(self) -> None:
        _reset_state()
        fake = FakeMCPServer("mcp-a", include_instructions=True)
        wrapper = _MCPWrapperToolset(fake)
        context = FakeWorkflowContext()
        from reboot.agents.pydantic_ai._run import _workflow_context
        token = _workflow_context.set(context)
        try:
            first_step5 = await wrapper.get_instructions(
                _stub_run_context(run_step=5)
            )
            second_step5 = await wrapper.get_instructions(
                _stub_run_context(run_step=5)
            )
            step6 = await wrapper.get_instructions(
                _stub_run_context(run_step=6)
            )
        finally:
            _workflow_context.reset(token)
        self.assertEqual(first_step5, "mcp-instructions")
        self.assertEqual(second_step5, "mcp-instructions")
        self.assertEqual(step6, "mcp-instructions")
        # Same step => same alias => same memo slot, so the
        # wrapped server is hit exactly once for step #5; step #6
        # has its own alias and hits the server once more.
        self.assertEqual(fake.get_instructions_calls, 2)
        # `_stub_at_least_once` records the alias on every
        # invocation (including cache hits), so dedupe before
        # comparing.
        get_instructions_aliases = sorted(
            {
                alias for alias in _recorded_aliases
                if alias.startswith("MCP get_instructions for")
            }
        )
        self.assertEqual(
            get_instructions_aliases,
            [
                f"MCP get_instructions for {fake.id} step #5",
                f"MCP get_instructions for {fake.id} step #6",
            ],
        )

    async def test_aenter_aexit_short_circuit(self) -> None:
        # The wrapper's `__aenter__` / `__aexit__` must NOT enter
        # the wrapped MCP server (the server self-manages its
        # connection lifecycle per call); the wrapper's lifecycle
        # methods are no-ops returning the wrapper itself.
        wrapper = _MCPWrapperToolset(FakeMCPServer("mcp-a"))
        async with wrapper as entered:
            self.assertIs(entered, wrapper)


class ToolsetWrapperDispatchTestCase(unittest.TestCase):
    """Verifies `_make_toolset_wrapper()` returns a callable that
    picks `_MCPWrapperToolset` when the leaf is an MCP toolset
    (detected by isinstance against the optionally-imported
    `MCPServer` / `FastMCPToolset`) and `_WrapperToolset`
    otherwise, and that the returned callable raises `UserError`
    on the second id-less MCP toolset.
    """

    def test_non_mcp_toolset_uses_plain_wrapper(self) -> None:
        wrap = _make_toolset_wrapper()
        wrapped = wrap(FunctionToolset())
        self.assertIsInstance(wrapped, _WrapperToolset)
        self.assertNotIsInstance(wrapped, _MCPWrapperToolset)

    def test_mcp_server_toolset_uses_mcp_wrapper(self) -> None:
        # Patch `MCPServer` to point at our fake so the dispatch's
        # isinstance check matches without depending on a real MCP
        # extra being installed.
        original = _reboot_toolset.MCPServer
        _reboot_toolset.MCPServer = FakeMCPServer  # type: ignore[misc,assignment]
        try:
            wrap = _make_toolset_wrapper()
            wrapped = wrap(FakeMCPServer("mcp-a"))
        finally:
            _reboot_toolset.MCPServer = original  # type: ignore[misc]
        self.assertIsInstance(wrapped, _MCPWrapperToolset)

    def test_single_id_less_mcp_toolset_is_allowed(self) -> None:
        original = _reboot_toolset.MCPServer
        _reboot_toolset.MCPServer = FakeMCPServer  # type: ignore[misc,assignment]
        try:
            wrap = _make_toolset_wrapper()
            wrapped = wrap(FakeMCPServer(None))  # No id -- ok on its own.
        finally:
            _reboot_toolset.MCPServer = original  # type: ignore[misc]
        self.assertIsInstance(wrapped, _MCPWrapperToolset)

    def test_two_id_less_mcp_toolsets_raises(self) -> None:
        original = _reboot_toolset.MCPServer
        _reboot_toolset.MCPServer = FakeMCPServer  # type: ignore[misc,assignment]
        try:
            wrap = _make_toolset_wrapper()
            wrap(FakeMCPServer(None))  # First id-less is ok.
            with self.assertRaises(UserError) as ctx:
                wrap(FakeMCPServer(None))
            self.assertIn(
                "Found more than one MCP toolset without an `id`",
                str(ctx.exception),
            )
        finally:
            _reboot_toolset.MCPServer = original  # type: ignore[misc]

    def test_id_less_plus_identified_mcp_toolset_is_allowed(self) -> None:
        # An id-less server plus any number of identified servers
        # is allowed -- their aliases don't collide.
        original = _reboot_toolset.MCPServer
        _reboot_toolset.MCPServer = FakeMCPServer  # type: ignore[misc,assignment]
        try:
            wrap = _make_toolset_wrapper()
            wrap(FakeMCPServer(None))
            wrap(FakeMCPServer("weather"))
            wrap(FakeMCPServer("calendar"))  # Should not raise.
        finally:
            _reboot_toolset.MCPServer = original  # type: ignore[misc]


class AgentSurfaceTestCase(unittest.TestCase):
    """Inspector properties (`name`, `model`, `toolsets`) and the
    enforced "name is immutable" setter.
    """

    def test_name_getter_returns_wrapped_name(self) -> None:
        agent = Agent(_make_function_model([0]), name="my_agent")
        self.assertEqual(agent.name, "my_agent")

    def test_name_setter_raises_after_creation(self) -> None:
        agent = Agent(_make_function_model([0]), name="my_agent")
        with self.assertRaises(UserError) as ctx:
            agent.name = "renamed"
        self.assertIn("cannot be changed after creation", str(ctx.exception))

    def test_model_getter_returns_user_configured_model(self) -> None:
        # Reboot wraps the model internally for memoization but the
        # public `model` getter intentionally surfaces the user's
        # configured model verbatim, not the `_Model` wrapper.
        model = _make_function_model([0])
        agent = Agent(model, name="my_agent")
        self.assertIs(agent.model, model)

    def test_toolsets_includes_reboot_function_toolset_first(self) -> None:
        # The first entry in `agent.toolsets` is Reboot's own
        # `FunctionToolset` -- where `@agent.tool` /
        # `@agent.tool_plain` registrations land. The wrapped
        # agent's own toolsets follow.
        agent = Agent(_make_function_model([0]), name="my_agent")
        toolsets = agent.toolsets
        self.assertIs(toolsets[0], agent._function_toolset)

    def test_toolsets_reflects_post_construction_tool_registration(
        self,
    ) -> None:
        # Adding a tool via `@agent.tool` after construction does
        # not change the identity of `_function_toolset`, but the
        # tool _is_ inside it.
        agent = Agent(_make_function_model([0]), name="my_agent")

        @agent.tool_plain
        async def add(x: int, y: int) -> int:
            return x + y

        # The toolset is still the same instance; tool was
        # added in place.
        first = agent.toolsets[0]
        self.assertIs(first, agent._function_toolset)


class ParallelExecutionModeTestCase(unittest.TestCase):
    """Reboot rejects `parallel_execution_mode='parallel'` (the
    pydantic_ai default) at construction time because its
    completion-order events are non-deterministic across replays.
    """

    def test_default_mode_succeeds(self) -> None:
        # Default is `parallel_ordered_events`, which IS replay-safe.
        Agent(_make_function_model([0]), name="a")  # no raise

    def test_sequential_mode_succeeds(self) -> None:
        Agent(
            _make_function_model([0]),
            name="a",
            parallel_execution_mode="sequential",
        )  # no raise

    def test_explicit_parallel_ordered_events_succeeds(self) -> None:
        Agent(
            _make_function_model([0]),
            name="a",
            parallel_execution_mode="parallel_ordered_events",
        )  # no raise

    def test_unsafe_parallel_mode_raises(self) -> None:
        with self.assertRaises(UserError) as ctx:
            Agent(
                _make_function_model([0]),
                name="a",
                parallel_execution_mode="parallel",  # type: ignore[arg-type]
            )
        self.assertIn("non-deterministic", str(ctx.exception))

    def test_typo_mode_raises(self) -> None:
        with self.assertRaises(UserError) as ctx:
            Agent(
                _make_function_model([0]),
                name="a",
                parallel_execution_mode="serial",  # type: ignore[arg-type]
            )
        self.assertIn("not supported", str(ctx.exception))


class SyncMethodsTestCase(unittest.TestCase):
    """`run_sync` / `run_stream_sync` are explicitly disabled --
    a Reboot workflow method is always async, so the sync
    variants don't fit. We raise a clear `UserError` naming the
    fix instead of silently delegating.
    """

    def test_run_sync_raises(self) -> None:
        agent = Agent(_make_function_model([0]), name="a")
        with self.assertRaises(UserError) as ctx:
            agent.run_sync(FakeWorkflowContext(), "hi")
        self.assertIn("not supported", str(ctx.exception))
        self.assertIn("await agent.run", str(ctx.exception))

    def test_run_stream_sync_raises(self) -> None:
        agent = Agent(_make_function_model([0]), name="a")
        with self.assertRaises(UserError) as ctx:
            agent.run_stream_sync(FakeWorkflowContext(), "hi")
        self.assertIn("not supported", str(ctx.exception))
        self.assertIn("agent.run_stream", str(ctx.exception))


class ToolPlainWrappingTestCase(unittest.IsolatedAsyncioTestCase):
    """`@agent.tool_plain` registrations -- tools that take no
    `WorkflowContext` and no `RunContext` -- still flow through
    Reboot's `at_least_once` envelope by virtue of toolset-level
    wrapping.
    """

    async def test_tool_plain_runs_and_records_alias(self) -> None:
        _reset_state()
        invocations = [0]
        agent = Agent(
            _make_tool_call_then_text_model(
                "add",
                [{
                    "x": 2,
                    "y": 3
                }],
            ),
            name="my_agent",
        )

        @agent.tool_plain
        async def add(x: int, y: int) -> int:
            invocations[0] += 1
            return x + y

        ctx = FakeWorkflowContext()
        await agent.run(ctx, "go")
        self.assertEqual(invocations[0], 1)
        tool_aliases = [
            alias for alias in _recorded_aliases
            if alias.startswith("Tool call for step #")
        ]
        self.assertEqual(len(tool_aliases), 1)


class OverrideTestCase(unittest.IsolatedAsyncioTestCase):
    """`Agent.override(...)` mirrors pydantic_ai's override surface
    with two tweaks: `model=` is auto-wrapped through `_wrap_model`,
    and `toolsets=` is rejected (our per-run toolset install would
    silently shadow it).
    """

    async def test_override_toolsets_raises(self) -> None:
        agent = Agent(_make_function_model([0]), name="a")
        toolset: FunctionToolset[None] = FunctionToolset()
        with self.assertRaises(UserError) as ctx:
            with agent.override(toolsets=[toolset]):
                pass
        self.assertIn("Overriding `toolsets`", str(ctx.exception))
        self.assertIn("not currently supported", str(ctx.exception))

    async def test_override_model_uses_inner_and_routes_through_alos(
        self,
    ) -> None:
        # Within an `override(model=...)` block, calls go to the
        # override -- not the agent's default -- and still flow
        # through `at_least_once` (a per-step "Model request" alias
        # is recorded).
        _reset_state()
        outer_count = [0]
        inner_count = [0]
        agent = Agent(_make_function_model(outer_count), name="a")
        ctx = FakeWorkflowContext()
        with agent.override(model=_make_function_model(inner_count)):
            await agent.run(ctx, "hi")
        self.assertEqual(inner_count[0], 1)
        self.assertEqual(outer_count[0], 0)
        model_aliases = [
            alias for alias in _recorded_aliases
            if alias.startswith("Model request for step #")
        ]
        self.assertEqual(len(model_aliases), 1)

    async def test_override_deps_propagates_to_tool(self) -> None:
        _reset_state()
        captured: list[int] = []
        agent = Agent(
            _make_tool_call_then_text_model("read_dep", [{}]),
            name="a",
            deps_type=int,
        )

        @agent.tool
        async def read_dep(context, run: RunContext[int]) -> str:
            captured.append(run.deps)
            return "ok"

        ctx = FakeWorkflowContext()
        with agent.override(deps=42):
            await agent.run(ctx, "go")
        self.assertEqual(captured, [42])


class PerRunKwargsTestCase(unittest.IsolatedAsyncioTestCase):
    """`agent.run(...)` accepts the same per-run kwargs as
    pydantic_ai's `Agent.run(...)`: `model=`, `toolsets=`, `deps=`,
    etc. We verify the most load-bearing ones still work after
    Reboot's per-run wrapping.
    """

    async def test_per_run_model_overrides_default(self) -> None:
        _reset_state()
        outer_count = [0]
        inner_count = [0]
        agent = Agent(_make_function_model(outer_count), name="a")
        ctx = FakeWorkflowContext()
        await agent.run(ctx, "hi", model=_make_function_model(inner_count))
        self.assertEqual(inner_count[0], 1)
        self.assertEqual(outer_count[0], 0)

    async def test_per_run_toolsets_dispatch_through_at_least_once(
        self,
    ) -> None:
        # Uses the module-level `lookup` so `_digest()` can pickle
        # the toolset. Local closures fail to pickle and would
        # break the cross-process stability that `_Digests` relies
        # on for replay-drift detection -- see
        # `test_unpicklable_per_run_toolset_raises_user_error`
        # for the corresponding failure mode.
        _reset_state()
        _per_run_toolsets_invocations.clear()

        toolset: FunctionToolset[None] = FunctionToolset(tools=[lookup])
        agent = Agent(
            _make_tool_call_then_text_model(
                "lookup",
                [{
                    "query": "via-run-toolsets"
                }],
            ),
            name="a",
        )
        ctx = FakeWorkflowContext()
        await agent.run(ctx, "go", toolsets=[toolset])
        self.assertEqual(_per_run_toolsets_invocations, ["via-run-toolsets"])
        tool_aliases = [
            alias for alias in _recorded_aliases
            if alias.startswith("Tool call for step #")
        ]
        self.assertEqual(len(tool_aliases), 1)

    async def test_unpicklable_per_run_toolset_raises_user_error(
        self,
    ) -> None:
        # When a caller passes a per-run `toolsets=` containing an
        # unpicklable value (here: a local closure), `_digest`
        # surfaces a `UserError` whose message names the offending
        # field and how to fix it -- not a bare
        # `AttributeError: Can't pickle local object`.
        _reset_state()

        async def closure_tool(
            run: RunContext[None],
            query: str,
        ) -> str:
            return f"r-{query}"

        toolset: FunctionToolset[None] = FunctionToolset(
            tools=[closure_tool],
        )
        agent = Agent(
            _make_function_model([0]),
            name="a",
        )
        ctx = FakeWorkflowContext()
        with self.assertRaises(UserError) as exception:
            await agent.run(ctx, "go", toolsets=[toolset])
        message = str(exception.exception)
        self.assertIn("per-run `toolsets=`", message)
        self.assertIn("module scope", message)

    async def test_per_run_deps_propagate_to_tool(self) -> None:
        _reset_state()
        captured: list[int] = []
        agent = Agent(
            _make_tool_call_then_text_model("read_dep", [{}]),
            name="a",
            deps_type=int,
        )

        @agent.tool
        async def read_dep(context, run: RunContext[int]) -> str:
            captured.append(run.deps)
            return "ok"

        ctx = FakeWorkflowContext()
        await agent.run(ctx, "go", deps=99)
        self.assertEqual(captured, [99])


class NestedRunTestCase(unittest.IsolatedAsyncioTestCase):
    """A second `agent.run` started while another is already
    active raises `UserError`. The detection lives in
    `_agent_run` and uses a `ContextVar` so the check works for
    any agent (not just the same instance).
    """

    async def test_run_inside_tool_raises_nested_run(self) -> None:
        _reset_state()
        outer = Agent(
            _make_tool_call_then_text_model("nest", [{}]),
            name="outer",
        )
        inner = Agent(_make_function_model([0]), name="inner")
        captured: list[str] = []

        @outer.tool
        async def nest(context, run: RunContext[None]) -> str:
            try:
                await inner.run(context, "inner-prompt")
            except UserError as exception:
                captured.append(str(exception))
                return "blocked"
            return "ok"

        ctx = FakeWorkflowContext()
        await outer.run(ctx, "go")
        self.assertEqual(len(captured), 1)
        self.assertIn("Nested agent runs are not supported", captured[0])


class MultimodalUserPromptTestCase(unittest.IsolatedAsyncioTestCase):
    """`user_prompt` accepts `Sequence[UserContent]` for multimodal
    inputs. Verify the empty-string check at the top of
    `_agent_run` doesn't trip on these (the `==''` comparison
    against a list returns `False`, so the check should pass).
    """

    async def test_list_user_content_runs_normally(self) -> None:
        from pydantic_ai.messages import TextContent

        _reset_state()
        agent = Agent(_make_function_model([0]), name="a")
        ctx = FakeWorkflowContext()
        # A list user_prompt -- not the empty string -- runs
        # without tripping the empty-string check.
        await agent.run(ctx, [TextContent(content="multimodal-hi")])

    async def test_empty_list_user_prompt_runs(self) -> None:
        # Even the empty list -- which is falsy but is NOT the
        # empty string -- passes the validation. Whether
        # pydantic_ai itself accepts `[]` is its concern.
        _reset_state()
        agent = Agent(_make_function_model([0]), name="a")
        ctx = FakeWorkflowContext()
        # `[] == ""` is False so we don't raise.
        await agent.run(ctx, [])


class EntryPointSmokeTestCase(unittest.IsolatedAsyncioTestCase):
    """Positive-path smoke tests for each of the four agent entry
    points. Verifies the basic happy path (a simple model call)
    completes and the model went through `at_least_once`.
    """

    async def test_run_smoke(self) -> None:
        _reset_state()
        agent = Agent(_make_function_model([0]), name="a")
        result = await agent.run(FakeWorkflowContext(), "hi")
        self.assertEqual(result.output, "r1")
        self.assertTrue(
            any(
                alias.startswith("Model request for step #")
                for alias in _recorded_aliases
            ),
        )

    async def test_iter_smoke(self) -> None:
        _reset_state()
        agent = Agent(_make_function_model([0]), name="a")
        ctx = FakeWorkflowContext()
        async with agent.iter(ctx, "hi") as run:
            async for _ in run:
                pass
        assert run.result is not None
        self.assertEqual(run.result.output, "r1")
        self.assertTrue(
            any(
                alias.startswith("Model request for step #")
                for alias in _recorded_aliases
            ),
        )

    async def test_run_stream_smoke(self) -> None:
        from pydantic_ai.models.test import TestModel

        _reset_state()
        # `TestModel` supports both `request` and `request_stream`,
        # while `FunctionModel` requires a separate `stream_function`.
        agent = Agent(TestModel(custom_output_text="streamed"), name="a")
        ctx = FakeWorkflowContext()
        async with agent.run_stream(ctx, "hi") as result:
            async for _ in result.stream_text():
                pass
        self.assertTrue(
            any(
                alias.startswith("Model request for step #")
                for alias in _recorded_aliases
            ),
        )

    async def test_run_stream_events_smoke(self) -> None:
        from pydantic_ai.models.test import TestModel

        _reset_state()
        agent = Agent(TestModel(custom_output_text="streamed"), name="a")
        ctx = FakeWorkflowContext()
        events_seen = 0
        async for _ in agent.run_stream_events(ctx, "hi"):
            events_seen += 1
        self.assertGreater(events_seen, 0)
        self.assertTrue(
            any(
                alias.startswith("Model request for step #")
                for alias in _recorded_aliases
            ),
        )


class ToolExceptionPropagationTestCase(unittest.IsolatedAsyncioTestCase):
    """Reboot's tool wrapper must not swallow user exceptions: a
    `RuntimeError` from a tool propagates out of `agent.run`.
    """

    async def test_runtime_error_from_tool_propagates(self) -> None:
        _reset_state()

        agent = Agent(
            _make_tool_call_then_text_model("breaker", [{}]),
            name="a",
            retries=0,  # Don't let pydantic_ai retry the call.
        )

        @agent.tool
        async def breaker(context, run: RunContext[None]) -> str:
            raise RuntimeError("kaboom")

        ctx = FakeWorkflowContext()
        # `pydantic_ai` may wrap the exception in its own type, but
        # the error message must surface.
        with self.assertRaises(BaseException) as exc:
            await agent.run(ctx, "go")
        self.assertIn("kaboom", str(exc.exception))


class SyncToolTestCase(unittest.IsolatedAsyncioTestCase):
    """Sync (non-async) tool functions registered via
    `@agent.tool_plain` should also flow through Reboot's
    `at_least_once` envelope.
    """

    async def test_sync_tool_plain_runs_through_at_least_once(self) -> None:
        _reset_state()
        invocations = [0]
        agent = Agent(
            _make_tool_call_then_text_model(
                "add",
                [{
                    "x": 4,
                    "y": 5
                }],
            ),
            name="my_agent",
        )

        @agent.tool_plain
        def add(x: int, y: int) -> int:  # NOTE: sync
            invocations[0] += 1
            return x + y

        await agent.run(FakeWorkflowContext(), "go")
        self.assertEqual(invocations[0], 1)
        self.assertEqual(
            len(
                [
                    a for a in _recorded_aliases
                    if a.startswith("Tool call for step #")
                ]
            ),
            1,
        )


class ToolReturnMetadataTestCase(unittest.IsolatedAsyncioTestCase):
    """A tool can return a `pydantic_ai.ToolReturn` carrying
    metadata; the metadata must survive Reboot's pickle-based
    memoization round-trip when the tool result is loaded back
    out of the memo store.
    """

    async def test_tool_return_metadata_survives_memoization(self) -> None:
        from pydantic_ai import ToolReturn

        _reset_state()
        agent = Agent(
            _make_tool_call_then_text_model("emit", [{}]),
            name="a",
        )

        @agent.tool
        async def emit(context, run: RunContext[None]) -> ToolReturn:
            return ToolReturn(
                return_value="payload",
                metadata={"trace_id": "abc-123"},
            )

        ctx = FakeWorkflowContext()
        await agent.run(ctx, "go")
        # The tool memo is keyed by alias; pull it back out and
        # confirm `metadata` survived.
        tool_keys = [
            key for key in _memo_cache if isinstance(key[2], str) and
            key[2].startswith("Tool call for step #")
        ]
        self.assertEqual(len(tool_keys), 1)
        cached = _memo_cache[tool_keys[0]]
        self.assertIsInstance(cached, ToolReturn)
        self.assertEqual(cached.return_value, "payload")
        self.assertEqual(cached.metadata, {"trace_id": "abc-123"})


class InstructionsPerRunTestCase(unittest.IsolatedAsyncioTestCase):
    """`instructions=` passed to `run()` should reach the wrapped
    agent so it is included in the model request. We verify the
    function model receives instructions in the messages.
    """

    async def test_instructions_per_run_reach_model(self) -> None:
        _reset_state()
        seen_instructions: list[str] = []

        def fn(messages, info):
            # `info.instructions` exposes the resolved
            # instructions string.
            if info.instructions is not None:
                seen_instructions.append(info.instructions)
            return ModelResponse(parts=[TextPart(content="ok")])

        agent = Agent(FunctionModel(fn), name="a")
        ctx = FakeWorkflowContext()
        await agent.run(ctx, "hi", instructions="Be terse.")
        self.assertEqual(seen_instructions, ["Be terse."])


class WrapPreservesParallelModeTestCase(unittest.TestCase):
    """`Agent.wrap(...)` accepts the same `parallel_execution_mode`
    kwarg as `Agent(...)` and rejects unsafe values just as
    construction does.
    """

    def test_wrap_default_succeeds(self) -> None:
        bare = pydantic_ai.Agent(_make_function_model([0]), name="my_agent")
        Agent.wrap(bare)  # default `parallel_ordered_events`, no raise

    def test_wrap_with_unsafe_parallel_raises(self) -> None:
        bare = pydantic_ai.Agent(_make_function_model([0]), name="my_agent")
        with self.assertRaises(UserError) as ctx:
            Agent.wrap(
                bare,
                parallel_execution_mode="parallel",  # type: ignore[arg-type]
            )
        self.assertIn("non-deterministic", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
