import asyncio
import pydantic_ai
import unittest
import uuid
from pydantic_ai import AgentRunResult, RunContext
from pydantic_ai._run_context import get_current_run_context
from pydantic_ai.exceptions import UserError
from pydantic_ai.mcp import MCPServer
from pydantic_ai.messages import (
    ModelRequest,
    ModelResponse,
    TextPart,
    ToolCallPart,
    UserPromptPart,
)
from pydantic_ai.models.function import FunctionModel
from pydantic_ai.tools import ToolDefinition
from pydantic_ai.toolsets.abstract import ToolsetTool
from pydantic_ai.toolsets.function import FunctionToolset
from reboot.agents.pydantic_ai import Agent
from reboot.agents.pydantic_ai._toolset import (
    _make_toolset_wrapper,
    _MCPWrapperToolset,
    _WrapperToolset,
)
from reboot.aio.applications import Application
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import (
    EffectValidation,
    WorkflowContext,
    WriterContext,
)
from reboot.aio.tests import Reboot
from tests.reboot.general_rbt import General, GeneralRequest, GeneralResponse
from tests.reboot.general_servicer import GeneralServicer
from typing import Any, Awaitable, Callable, ClassVar, Optional
from unittest import mock


# Model used wherever a test doesn't care about its responses.
def noop_model_fn(messages, info):
    return ModelResponse(parts=[TextPart(content="ok")])


NOOP_MODEL = FunctionModel(noop_model_fn)


class CountingModel(FunctionModel):
    """A `FunctionModel` subclass that counts every `request` and
    `request_stream` invocation. Each `request` returns a unique
    response (`r1`, `r2`, ...) so tests asserting distinct outputs
    across calls can use a single instance. The
    `request_count` and `request_stream_count` properties expose
    the totals.
    """

    def __init__(self) -> None:
        super().__init__(
            function=self._function,
            stream_function=self._stream_function,
        )
        self._request_count = 0
        self._request_stream_count = 0

    @property
    def request_count(self) -> int:
        return self._request_count

    @property
    def request_stream_count(self) -> int:
        return self._request_stream_count

    def _function(self, messages, info):
        self._request_count += 1
        return ModelResponse(
            parts=[TextPart(content=f"r{self._request_count}")]
        )

    async def _stream_function(self, messages, info):
        self._request_stream_count += 1
        yield f"r{self._request_stream_count}"


class ToolCallingModel(FunctionModel):
    """A `FunctionModel` subclass whose response at each step is driven
    by `tool_calls`: a list of steps, each step a list of `(tool_name,
    args)` tuples. At each step the model emits one `ModelResponse`
    containing that step's tool calls; once we run out of steps the
    next response is a plain text response to end the agent run.
    """

    def __init__(
        self,
        tool_calls: list[list[tuple[str, dict[str, Any]]]],
    ) -> None:
        super().__init__(function=self._function)
        self._tool_calls = tool_calls

    def _function(self, messages, info):
        # `run_step` is 1-indexed and `pydantic_ai` increments it
        # before the first model request so we need to subtract 1 to
        # map to our 0-indexed `tool_calls` slot.
        run = get_current_run_context()
        assert run is not None, "Expected to be inside an agent run."

        step_index = run.run_step - 1

        if step_index >= len(self._tool_calls):
            # Once we've issued tool calls for every step we return
            # some text to complete the agent run.
            return ModelResponse(parts=[TextPart(content="Done")])

        return ModelResponse(
            parts=[
                ToolCallPart(
                    tool_name=tool_name,
                    args=args,
                    tool_call_id=f"tool-call-{step_index}-{index}",
                ) for index, (tool_name,
                              args) in enumerate(self._tool_calls[step_index])
            ],
        )


def _make_mcp_server_mock(
    *,
    id: str | None,
    cache_tools: bool = False,
    include_instructions: bool = False,
    instructions_text: str = "mcp-instructions",
) -> mock.MagicMock:
    """Build a `MCPServer`-spec'd mock."""
    mcp = mock.MagicMock(spec=MCPServer)
    mcp.id = id
    mcp.cache_tools = cache_tools
    mcp.include_instructions = include_instructions

    def tool_for_tool_def(tool_def: ToolDefinition) -> ToolsetTool[None]:
        # `args_validator` is called by pydantic_ai's tool-call
        # dispatch path (`validate_python(args)`) to validate the
        # model's emitted args before invoking the tool. We use a
        # `MagicMock` with a `validate_python`that returns the
        # incoming args unchanged since none of the tests try and pass
        # args that are invalid.
        args_validator = mock.MagicMock()
        args_validator.validate_python.side_effect = (
            lambda args, *_args, **_kwargs: args
        )
        return ToolsetTool(
            toolset=mcp,
            tool_def=tool_def,
            max_retries=0,
            args_validator=args_validator,
        )

    # Need to override all the required methods.
    mcp.tool_for_tool_def.side_effect = tool_for_tool_def
    mcp.visit_and_replace.side_effect = lambda visitor: visitor(mcp)
    mcp.apply.side_effect = lambda visitor: visitor(mcp)
    mcp.get_tools = mock.AsyncMock(
        return_value={
            "echo":
                tool_for_tool_def(
                    ToolDefinition(
                        name="echo",
                        description="Echoes its argument.",
                        parameters_json_schema={"type": "object"},
                    )
                ),
        },
    )
    mcp.get_instructions = mock.AsyncMock(return_value=instructions_text)
    mcp.call_tool = mock.AsyncMock(return_value="echoed")
    # `for_run` / `for_run_step` are pydantic_ai's toolset-
    # traversal hooks; default behaviour is "return self" (no
    # transformation).
    mcp.for_run = mock.AsyncMock(return_value=mcp)
    mcp.for_run_step = mock.AsyncMock(return_value=mcp)
    # Connection-lifecycle hooks. The Reboot wrapper's
    # `_MCPWrapperToolset.__aenter__` short-circuits to a
    # no-op, so we do here too.
    mcp.__aenter__ = mock.AsyncMock(return_value=mcp)
    mcp.__aexit__ = mock.AsyncMock(return_value=None)
    return mcp


# ---------------------------------------------------------------------------
# Tests that don't need a `WorkflowContext`.
# ---------------------------------------------------------------------------


class BasicUsageTestCase(unittest.IsolatedAsyncioTestCase):

    async def test_constructing_without_name_raises(self) -> None:
        """Constructing `Agent` without `name=` raises `UserError`."""
        with self.assertRaises(UserError) as raised:
            Agent(NOOP_MODEL)
        self.assertIn("unique `name`", str(raised.exception))

    async def test_wrap_of_nameless_pydantic_agent_raises(self) -> None:
        """`Agent.wrap(...)` of a nameless `pydantic_ai.Agent` raises
        `UserError`.
        """
        with self.assertRaises(UserError) as raised:
            Agent.wrap(pydantic_ai.Agent(NOOP_MODEL))
        self.assertIn("unique `name`", str(raised.exception))

    async def test_constructing_with_name_succeeds(self) -> None:
        """Constructing `Agent` with `name=` succeeds."""
        Agent(NOOP_MODEL, name="Agent")
        Agent.wrap(pydantic_ai.Agent(NOOP_MODEL, name="Agent"))

    async def test_run_with_non_context_first_arg_raises(self) -> None:
        """When `agent.run("Some prompt")` is called with no `context` a
        `UserError` is raised.
        """
        agent = Agent(NOOP_MODEL, name="Agent")
        with self.assertRaises(UserError) as raised:
            await agent.run("Some prompt")  # type: ignore[call-overload]
        self.assertIn("requires `context: ", str(raised.exception))
        self.assertIn("WorkflowContext", str(raised.exception))

    async def test_iter_with_non_context_first_arg_raises(self) -> None:
        """When `agent.iter("Some prompt")` is called with no `context` a
        `UserError` is raised.
        """
        agent = Agent(NOOP_MODEL, name="Agent")
        with self.assertRaises(UserError) as raised:
            async with agent.iter(
                "Some prompt"
            ):  # type: ignore[call-overload]
                pass
        self.assertIn("WorkflowContext", str(raised.exception))

    async def test_run_stream_with_non_context_first_arg_raises(self) -> None:
        """When `agent.run_stream("Some prompt")` is called with no `context`
        a `UserError` is raised.
        """
        agent = Agent(NOOP_MODEL, name="Agent")
        with self.assertRaises(UserError) as raised:
            async with agent.run_stream(
                "Some prompt"
            ):  # type: ignore[call-overload]
                pass
        self.assertIn("WorkflowContext", str(raised.exception))

    async def test_run_stream_events_with_non_context_first_arg_raises(
        self,
    ) -> None:
        """When `agent.run_stream_events("Some prompt")` is called with no
        `context`) a `UserError` is raised.
        """
        agent = Agent(NOOP_MODEL, name="Agent")
        with self.assertRaises(UserError) as raised:
            async for _ in agent.run_stream_events(
                "Some prompt"  # type: ignore[call-overload]
            ):
                pass
        self.assertIn("WorkflowContext", str(raised.exception))

    async def test_name_getter_returns_wrapped_name(self) -> None:
        """Validates `agent.name` reads back the `name` passed at
        construction.
        """
        agent = Agent(NOOP_MODEL, name="Agent")
        self.assertEqual(agent.name, "Agent")

    async def test_name_setter_raises_after_creation(self) -> None:
        """Validates assigning to `agent.name` after creation raises
        `UserError`.
        """
        agent = Agent(NOOP_MODEL, name="Agent")
        with self.assertRaises(UserError) as raised:
            agent.name = "renamed"
        self.assertIn(
            "cannot be changed after creation", str(raised.exception)
        )

    async def test_model_getter_returns_user_configured_model(self) -> None:
        """`agent.model` returns the user's configured model, not
        the internal `_Model` memoization wrapper. We wrap the model
        to route every request through `at_least_once`, but the
        public getter intentionally surfaces the user's instance so
        callers can introspect it without seeing our plumbing.
        """
        model = NOOP_MODEL
        agent = Agent(model, name="Agent")
        self.assertIs(agent.model, model)

    async def test_toolsets_includes_reboot_function_toolset_first(
        self
    ) -> None:
        """`agent.toolsets[0]` is Reboot's own `FunctionToolset`,
        the home of `@agent.tool` / `@agent.tool_plain`
        registrations. The wrapped agent's user-supplied toolsets
        follow it in the list.
        """
        agent = Agent(NOOP_MODEL, name="Agent")
        toolsets = agent.toolsets
        self.assertIs(toolsets[0], agent._function_toolset)

    async def test_toolsets_reflects_post_construction_tool_registration(
        self,
    ) -> None:
        """A `@agent.tool_plain` registered after construction is
        added to the existing `_function_toolset` in place; the
        identity of that toolset is preserved across registrations
        so per-run wrapping stays stable.
        """
        agent = Agent(NOOP_MODEL, name="Agent")

        @agent.tool_plain
        async def add(x: int, y: int) -> int:
            return x + y

        # The toolset is still the same instance; tool was added
        # in place.
        first = agent.toolsets[0]
        self.assertIs(first, agent._function_toolset)


class EmptyStringRejectionTestCase(unittest.IsolatedAsyncioTestCase):

    async def test_empty_user_prompt_raises(self) -> None:
        """Validates that an `user_prompt` raises a `UserError`."""
        agent = Agent(NOOP_MODEL, name="Agent")
        with self.assertRaises(UserError) as raised:
            await agent.run(mock.Mock(spec=WorkflowContext), "")
        self.assertIn("must not be an empty string", str(raised.exception))

    async def test_empty_variant_raises(self) -> None:
        """Validates an empty-string `variant` is raises a `UserError`."""
        agent = Agent(NOOP_MODEL, name="Agent")
        with self.assertRaises(UserError) as raised:
            await agent.run(
                mock.Mock(spec=WorkflowContext),
                "Some prompt",
                variant="",
            )
        self.assertIn(
            "`variant` must not be an empty string", str(raised.exception)
        )


class SyncMethodsTestCase(unittest.TestCase):

    def test_run_sync_raises(self) -> None:
        """`run_sync(...)` raises `UserError` because Reboot is only async."""
        agent = Agent(NOOP_MODEL, name="Agent")
        with self.assertRaises(UserError) as raised:
            agent.run_sync(mock.Mock(spec=WorkflowContext), "Some prompt")
        self.assertIn("not supported", str(raised.exception))
        self.assertIn("await agent.run", str(raised.exception))

    def test_run_stream_sync_raises(self) -> None:
        """`run_stream_sync(...)` raises `UserError` because Reboot is only
        async.
        """
        agent = Agent(NOOP_MODEL, name="Agent")
        with self.assertRaises(UserError) as raised:
            agent.run_stream_sync(
                mock.Mock(spec=WorkflowContext), "Some prompt"
            )
        self.assertIn("not supported", str(raised.exception))
        self.assertIn("agent.run_stream", str(raised.exception))


class ParallelExecutionModeTestCase(unittest.TestCase):
    """Reboot rejects `parallel_execution_mode='parallel'` (the
    pydantic_ai default) at construction time because its
    completion-order events are non-deterministic across replays.
    """

    def test_default_mode_succeeds(self) -> None:
        """Constructing an `Agent` with no `parallel_execution_mode=`
        uses `parallel_ordered_events`, which IS replay-safe. This
        verifies the default is the safe value.
        """
        Agent(NOOP_MODEL, name="Agent")

    def test_sequential_mode_succeeds(self) -> None:
        """`parallel_execution_mode='sequential'` is explicitly
        allowed: completion order is fully deterministic, so replay
        produces identical event streams.
        """
        Agent(
            NOOP_MODEL,
            name="Agent",
            parallel_execution_mode="sequential",
        )

    def test_explicit_parallel_ordered_events_succeeds(self) -> None:
        """Explicitly passing the default mode
        (`parallel_ordered_events`) is accepted. Useful for
        documenting intent in user code.
        """
        Agent(
            NOOP_MODEL,
            name="Agent",
            parallel_execution_mode="parallel_ordered_events",
        )

    def test_unsafe_parallel_mode_raises(self) -> None:
        """`parallel_execution_mode='parallel'` (the pydantic_ai
        default) raises `UserError`: its completion-order events are
        non-deterministic across replays, which would break
        memoized event streams.
        """
        with self.assertRaises(UserError) as raised:
            Agent(
                NOOP_MODEL,
                name="Agent",
                # Need `type: ignore[arg-type]` here because
                # "parallel" is not supported for Reboot!
                parallel_execution_mode="parallel",  # type: ignore[arg-type]
            )
        self.assertIn("non-deterministic", str(raised.exception))

    def test_typo_mode_raises(self) -> None:
        """An unknown / typo'd mode value raises `UserError` instead
        of silently falling through to a pydantic_ai default.
        """
        with self.assertRaises(UserError) as raised:
            Agent(
                NOOP_MODEL,
                name="Agent",
                # Need `type: ignore[arg-type]` here because
                # "serial" is not supported for Reboot!
                parallel_execution_mode="serial",  # type: ignore[arg-type]
            )
        self.assertIn("not supported", str(raised.exception))


class ToolsetWrapperTestCase(unittest.TestCase):
    """Verifies `_make_toolset_wrapper()` works as expected."""

    def test_function_toolset_uses_plain_wrapper(self) -> None:
        """A non-MCP toolset (here a plain `FunctionToolset`) gets
        wrapped in the plain `_WrapperToolset`.
        """
        wrap = _make_toolset_wrapper()
        wrapped = wrap(FunctionToolset())
        self.assertIsInstance(wrapped, _WrapperToolset)
        self.assertNotIsInstance(wrapped, _MCPWrapperToolset)

    def test_mcp_server_toolset_uses_mcp_wrapper(self) -> None:
        """A toolset that's an instance of `MCPServer` gets the
        `_MCPWrapperToolset`.
        """
        wrap = _make_toolset_wrapper()
        wrapped = wrap(_make_mcp_server_mock(id="mcp-a"))
        self.assertIsInstance(wrapped, _MCPWrapperToolset)

    def test_single_id_less_mcp_toolset_is_allowed(self) -> None:
        """A single MCP toolset without an `id` is allowed: there's
        no ambiguity in the alias namespace yet, so the dispatcher
        wraps it normally.
        """
        wrap = _make_toolset_wrapper()
        wrapped = wrap(_make_mcp_server_mock(id=None))
        self.assertIsInstance(wrapped, _MCPWrapperToolset)

    def test_two_id_less_mcp_toolsets_raises(self) -> None:
        """Two id-less MCP toolsets would collide aliases, so
        the dispatcher raises `UserError` on the second one.
        """
        wrap = _make_toolset_wrapper()
        wrap(_make_mcp_server_mock(id=None))
        # Second id-less `MCPServer` raises.
        with self.assertRaises(UserError) as raised:
            wrap(_make_mcp_server_mock(id=None))
        self.assertIn(
            "Found more than one MCP toolset without an `id`",
            str(raised.exception),
        )

    def test_id_less_plus_identified_mcp_toolset_is_allowed(self) -> None:
        """One id-less MCP toolset plus any number of *named* MCP
        toolsets coexist fine: the named ones get id-suffixed
        aliases, so they don't collide with the id-less one or each
        other.
        """
        wrap = _make_toolset_wrapper()
        wrap(_make_mcp_server_mock(id=None))
        wrap(_make_mcp_server_mock(id="weather"))
        wrap(_make_mcp_server_mock(id="calendar"))  # Should not raise.


class WrapPreservesParallelModeTestCase(unittest.TestCase):

    def test_wrap_default_succeeds(self) -> None:
        """`Agent.wrap(...)` with no `parallel_execution_mode=`
        accepts the safe default, just like direct construction.
        """
        # Default `parallel_ordered_events`, no raise.
        Agent.wrap(pydantic_ai.Agent(NOOP_MODEL, name="Agent"))

    def test_wrap_with_unsafe_parallel_raises(self) -> None:
        """`Agent.wrap(..., parallel_execution_mode='parallel')`
        raises `UserError` exactly the same way direct construction
        does. The wrap path must apply the same guard so users can't
        smuggle in an unsafe mode via the wrapping entry point.
        """
        with self.assertRaises(UserError) as raised:
            Agent.wrap(
                pydantic_ai.Agent(NOOP_MODEL, name="Agent"),
                parallel_execution_mode="parallel",  # type: ignore[arg-type]
            )
        self.assertIn("non-deterministic", str(raised.exception))


# ---------------------------------------------------------------------------
# Helpers for testing agents running within an actual Reboot workflow.
# ---------------------------------------------------------------------------


class WorkflowAgentRunTestServicer(GeneralServicer):
    """A `GeneralServicer` whose `Workflow` method runs an
    arbitrary test-supplied callable inside a live
    `WorkflowContext`. Tests install their body on the
    `_current_workflow` class slot before invoking the workflow.
    """

    # Each test installs its workflow here before invoking the
    # workflow. Tests that need to count attempts (for the
    # retry / replay path) keep their own local counter inside
    # the workflow callable.
    _workflow: ClassVar[Optional[Callable[[WorkflowContext],
                                          Awaitable[None]]]] = None

    def authorizer(self):
        return allow()

    async def constructor_writer(
        self,
        context: WriterContext,
        state: General.State,
        request: GeneralRequest,
    ) -> GeneralResponse:
        return GeneralResponse()

    @classmethod
    async def workflow(
        cls,
        context: WorkflowContext,
        request: GeneralRequest,
    ) -> GeneralResponse:
        workflow = WorkflowAgentRunTestServicer._workflow
        assert workflow is not None, "Tests must do `self.call(workflow)`"
        await workflow(context)
        return GeneralResponse()


class WorkflowAgentRunTestCase(unittest.IsolatedAsyncioTestCase):
    """Test case that uses `WorkflowAgentRunTestServicer` to allow
    overriding the `workflow` method in each test easily without
    needing to create an entire `GeneralServicer` subclass.
    """

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(
            Application(servicers=[WorkflowAgentRunTestServicer]),
            # Disabling effect validation to make counting easier,
            # e.g., counting number of times we've tried to call into
            # a model or tools.
            effect_validation=EffectValidation.DISABLED,
        )

        self.context = self.rbt.create_external_context(name=self.id())
        self.general, _ = await General.factory.constructor_writer(
            self.context
        )

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def call(
        self,
        workflow: Callable[[WorkflowContext], Awaitable[None]],
    ) -> None:
        """Install `workflow` on the test servicer and invoke the workflow,
        awaiting its task to completion.
        """
        assert WorkflowAgentRunTestServicer._workflow is None
        WorkflowAgentRunTestServicer._workflow = workflow
        try:
            await self.general.workflow(self.context)
        finally:
            WorkflowAgentRunTestServicer._workflow = None


# ---------------------------------------------------------------------------
# Test cases that perform an actual agent run within a workflow.
# ---------------------------------------------------------------------------


class UniqueCallDetectionTestCase(WorkflowAgentRunTestCase):

    async def test_sequential_same_args_raises(self) -> None:
        """Any subsequent `agent.run()` calls in a workflow that can not be
        uniquely distinguished (e.g., same prompt, not variant) should
        raise `UserError`.
        """
        model = CountingModel()
        agent = Agent(model, name="Agent")

        captured_user_error: UserError | None = None

        async def workflow(context: WorkflowContext) -> None:
            nonlocal captured_user_error
            await agent.run(context, "Some prompt")
            # Another agent run that is not uniquely distinguishable
            # should fail.
            try:
                await agent.run(context, "Some prompt")
            except UserError as error:
                captured_user_error = error

        await self.call(workflow)

        # We should have a `UserError`.
        assert captured_user_error is not None
        self.assertIn("Duplicate agent run", str(captured_user_error))

        # And we should have only made one model call since the second
        # `agent.run()` call should raise `UserError` before calling
        # the model.
        self.assertEqual(model.request_count, 1)

    async def test_sequential_distinct_variants_succeed(self) -> None:
        """Any subsequent `agent.run()` calls in a workflow can be uniquely
        distinguished by passing unique `variant=` values.
        """
        model = CountingModel()
        agent = Agent(model, name="Agent")

        result: AgentRunResult[str] | None = None
        variant_result: AgentRunResult[str] | None = None

        async def workflow(context: WorkflowContext) -> None:
            nonlocal result, variant_result
            result = await agent.run(context, "Some prompt")
            variant_result = await agent.run(
                context, "Some prompt", variant="Variant"
            )

        await self.call(workflow)

        assert result is not None and variant_result is not None
        self.assertNotEqual(result.output, variant_result.output)

        # Expecting two model calls since both agent runs should have
        # been performed.
        self.assertEqual(model.request_count, 2)

    async def test_message_history_only_differentiation(self) -> None:
        """Multiple `agent.run` calls with the same prompt, no variant, but
        different `message_history` succeed and produce distinct
        results.
        """
        model = CountingModel()
        agent = Agent(model, name="Agent")

        history_a = [ModelRequest(parts=[UserPromptPart(content="Prior A")])]
        history_b = [ModelRequest(parts=[UserPromptPart(content="Prior B")])]

        history_a_result: AgentRunResult[str] | None = None
        history_b_result: AgentRunResult[str] | None = None

        async def workflow(context: WorkflowContext) -> None:
            nonlocal history_a_result, history_b_result
            history_a_result = await agent.run(
                context, "Some prompt", message_history=history_a
            )
            history_b_result = await agent.run(
                context, "Some prompt", message_history=history_b
            )

        await self.call(workflow)

        assert history_a_result is not None and history_b_result is not None
        self.assertNotEqual(history_a_result.output, history_b_result.output)

        # Expecting two model calls since both agent runs should have
        # been performed.
        self.assertEqual(model.request_count, 2)

    async def test_parallel_gather_same_args_one_raises(self) -> None:
        """Two `agent.run()` calls that are not uniquely distinguishable
        dispatched concurrently via `asyncio.gather()` should cause
        one to succeed and one to raise `UserError`.
        """
        model = CountingModel()
        agent = Agent(model, name="Agent")

        captured_results: tuple[
            AgentRunResult[str] | BaseException,
            AgentRunResult[str] | BaseException,
        ] | None = None

        async def workflow(context: WorkflowContext) -> None:
            nonlocal captured_results
            captured_results = await asyncio.gather(
                agent.run(context, "Some prompt"),
                agent.run(context, "Some prompt"),
                return_exceptions=True,
            )

        await self.call(workflow)

        assert captured_results is not None

        # Exactly one should be a `UserError`; the other a result.
        errors: list[UserError] = []
        successes: list[AgentRunResult[str]] = []
        others: list[Any] = []

        for result in captured_results:
            if isinstance(result, UserError):
                errors.append(result)
            elif isinstance(result, AgentRunResult):
                successes.append(result)
            else:
                others.append(result)

        self.assertEqual(len(errors), 1)
        self.assertIn("Duplicate agent run", str(errors[0]))
        self.assertEqual(len(successes), 1)
        self.assertEqual(len(others), 0)

    async def test_cross_iteration_same_args_succeed(self) -> None:
        """Two different iterations of a control loop should each be able to
        call `agent.run()` with identical args.
        """
        model = CountingModel()
        agent = Agent(model, name="Agent")

        async def workflow(context: WorkflowContext) -> None:
            async for iteration in context.loop("Test"):
                await agent.run(context, "Some prompt")
                if iteration == 0:
                    continue
                return

        await self.call(workflow)

        # One model request for each iteration.
        self.assertEqual(model.request_count, 2)

    async def test_method_complete_drops_workflow_entry(self) -> None:
        """Reboot should keep track of an `agent.run()` within a workflow (via
        the global `_agent_runs`) but after the workflow completes
        (either because it needs to be retried or because it
        succeeded) Reboot should have correctly cleaned up its
        tracking state.
        """
        from reboot.agents.pydantic_ai._run import _agent_runs

        agent = Agent(NOOP_MODEL, name="Agent")

        attempts = 0
        captured_workflow_id: uuid.UUID | None = None

        async def workflow(context: WorkflowContext) -> None:
            nonlocal attempts, captured_workflow_id
            attempts += 1
            captured_workflow_id = context.workflow_id
            assert captured_workflow_id not in _agent_runs
            await agent.run(context, "Some prompt")
            assert captured_workflow_id in _agent_runs
            if attempts == 1:
                raise RuntimeError("Trigger retry")

        await self.call(workflow)

        # Should have made two attempts due to the retry.
        self.assertEqual(attempts, 2)

        # After the workflow returned Reboot should have cleaned up.
        self.assertNotIn(captured_workflow_id, _agent_runs)

    async def test_iteration_complete_clears_per_iteration(self) -> None:
        """Reboot shoud also properly clean up tracking state in `_agent_runs`
        for control loops.
        """
        from reboot.agents.pydantic_ai._run import _agent_runs

        agent = Agent(NOOP_MODEL, name="Agent")

        per_iteration_count_after_run_iteration_0: int | None = None
        per_iteration_count_before_run_iteration_1: int | None = None
        per_iteration_count_after_run_iteration_1: int | None = None

        async def workflow(context: WorkflowContext) -> None:
            nonlocal per_iteration_count_after_run_iteration_0
            nonlocal per_iteration_count_before_run_iteration_1
            nonlocal per_iteration_count_after_run_iteration_1
            workflow_id = context.workflow_id
            assert workflow_id is not None
            async for iteration in context.loop("Test"):
                if iteration == 0:
                    await agent.run(context, "Some prompt")
                    per_iteration_count_after_run_iteration_0 = len(
                        _agent_runs[workflow_id].per_iteration
                    )
                    continue
                # iteration == 1
                per_iteration_count_before_run_iteration_1 = len(
                    _agent_runs[workflow_id].per_iteration
                )
                await agent.run(context, "Some prompt")
                per_iteration_count_after_run_iteration_1 = len(
                    _agent_runs[workflow_id].per_iteration
                )
                return

        await self.call(workflow)

        self.assertEqual(per_iteration_count_after_run_iteration_0, 1)
        self.assertEqual(per_iteration_count_before_run_iteration_1, 0)
        self.assertEqual(per_iteration_count_after_run_iteration_1, 1)


class ToolCallingTestCase(WorkflowAgentRunTestCase):

    async def test_decorated_tool_passes_workflow_and_run_contexts(
        self,
    ) -> None:
        """Ensures an `@agent.tool` decorated function receives the
        `WorkflowContext` passed to `agent.run()` as its first
        argument and a `RunContext` as its second.
        """
        model = ToolCallingModel([[("tool", {"query": "hello"})]])
        agent = Agent(model, name="Agent")

        # Track the tool calls.
        tool_calls: list[tuple[Any, Any, str]] = []

        @agent.tool
        async def tool(
            context: WorkflowContext,
            run: RunContext[None],
            query: str,
        ) -> str:
            tool_calls.append((context, run, query))
            return "Unimportant"

        captured_workflow_context: WorkflowContext | None = None

        async def workflow(context: WorkflowContext) -> None:
            nonlocal captured_workflow_context
            await agent.run(context, "Some prompt")
            captured_workflow_context = context

        await self.call(workflow)

        self.assertEqual(len(tool_calls), 1)

        tool_workflow_context, tool_run_context, tool_query = tool_calls[0]

        self.assertIs(tool_workflow_context, captured_workflow_context)
        self.assertIsInstance(tool_run_context, RunContext)
        self.assertEqual(tool_query, "hello")

    async def test_tool_passed_via_tools_kwarg_is_invoked(self) -> None:
        """Ensures a tool registered via `Agent(..., tools=[tool])` (not the
        `@agent.tool` decorator) is callable from `agent.run()`.
        """
        invocations = 0

        async def tool(run: RunContext[None], query: str) -> str:
            nonlocal invocations
            invocations += 1
            return "Unimportant"

        model = ToolCallingModel([[("tool", {"query": "hello"})]])
        agent = Agent(model, name="Agent", tools=[tool])

        async def workflow(context: WorkflowContext) -> None:
            await agent.run(context, "Some prompt")

        await self.call(workflow)

        self.assertEqual(invocations, 1)

    async def test_tool_via_user_toolset_is_invoked(self) -> None:
        """Ensures a tool contributed by a user-supplied `FunctionToolset`
        passed via `toolsets=[...]` is reachable and gets its body
        invoked.
        """
        invocations = 0

        async def tool(run: RunContext[None], query: str) -> str:
            nonlocal invocations
            invocations += 1
            return "Unimportant"

        toolset: FunctionToolset[None] = FunctionToolset(tools=[tool])

        model = ToolCallingModel([[("tool", {"query": "hello"})]])
        agent = Agent(model, name="Agent", toolsets=[toolset])

        async def workflow(context: WorkflowContext) -> None:
            await agent.run(context, "Some prompt")

        await self.call(workflow)

        self.assertEqual(invocations, 1)

    async def test_parallel_tool_calls_each_run_their_body(self) -> None:
        """Ensures multiple tool calls to the same tool (which get executed by
        default in parallel) with different args (the model emits both
        `ToolCallPart`s in one response) each get their body
        invoked.
        """
        invocations: list[str] = []

        async def tool(run: RunContext[None], query: str) -> str:
            invocations.append(query)
            return "Unimportant"

        # Model returns BOTH `ToolCallPart`s in one response so
        # `pydantic_ai` dispatches them concurrently.
        model = ToolCallingModel(
            [
                [
                    ("tool", {
                        "query": "first"
                    }),
                    ("tool", {
                        "query": "second"
                    }),
                ],
            ]
        )
        agent = Agent(model, name="Agent", tools=[tool])

        async def workflow(context: WorkflowContext) -> None:
            await agent.run(context, "Some prompt")

        await self.call(workflow)

        self.assertEqual(sorted(invocations), ["first", "second"])

    async def test_tool_replay_returns_cached_result(self) -> None:
        """Ensures on workflow retry we won't re-execute the tool because the
        `at_least_once` will instead return the memoized tool result.
        """
        invocations = 0

        async def tool(run: RunContext[None], query: str) -> str:
            nonlocal invocations
            invocations += 1
            return "Unimportant"

        model = ToolCallingModel([[("tool", {"query": "hello"})]])
        agent = Agent(model, name="Agent", tools=[tool])

        attempts = 0

        async def workflow(context: WorkflowContext) -> None:
            nonlocal attempts
            attempts += 1
            await agent.run(context, "Some prompt")
            if attempts == 1:
                raise RuntimeError("Trigger retry")

        await self.call(workflow)

        self.assertEqual(attempts, 2)
        # Tool SHOULD NOT be re-invoked on the retry!
        self.assertEqual(invocations, 1)

    async def test_tool_added_after_wrap_is_invoked(self) -> None:
        """Ensures an `@agent.tool` registered AFTER `Agent.wrap(...)` also
        runs through Reboot's per-run wrapping.
        """
        invocations = 0

        model = ToolCallingModel([[("tool", {"query": "post-wrap"})]])
        agent = Agent.wrap(pydantic_ai.Agent(model, name="Agent"))

        @agent.tool
        async def tool(
            context,
            run: RunContext[None],
            query: str,
        ) -> str:
            nonlocal invocations
            invocations += 1
            return "Unimportant"

        async def workflow(context: WorkflowContext) -> None:
            await agent.run(context, "Some prompt")

        await self.call(workflow)

        self.assertEqual(invocations, 1)

    async def test_tool_plain_runs_and_records_alias(self) -> None:
        """A `@agent.tool_plain` (no context args at all) gets
        invoked exactly once when the model emits a matching
        `ToolCallPart`. Verifies that the toolset-level wrapping
        applies even to the simplest tool shape.
        """
        invocations = 0

        model = ToolCallingModel([[("add", {"x": 2, "y": 3})]])
        agent = Agent(model, name="Agent")

        @agent.tool_plain
        async def add(x: int, y: int) -> int:
            nonlocal invocations
            invocations += 1
            return x + y

        async def workflow(context: WorkflowContext) -> None:
            await agent.run(context, "Some prompt")

        await self.call(workflow)

        self.assertEqual(invocations, 1)

    async def test_runtime_error_from_tool_propagates(self) -> None:
        """A `RuntimeError("kaboom")` raised inside a tool body
        propagates out of `agent.run()` -- our wrapper does not
        swallow it. pydantic_ai may rewrap the exception in its
        own type, so we just assert the original message
        ("kaboom") survives.
        """
        model = ToolCallingModel([[("tool", {})]])
        agent = Agent(
            model,
            name="Agent",
            retries=0,  # Don't let pydantic_ai retry the call.
        )

        @agent.tool
        async def tool(context: WorkflowContext, run: RunContext[None]) -> str:
            raise RuntimeError("Boom!")

        captured_exceptions: list[BaseException] = []

        async def workflow(context: WorkflowContext) -> None:
            try:
                await agent.run(context, "Some prompt")
            except BaseException as exception:
                # `pydantic_ai` may wrap the exception in its own
                # type, but we expect the original message at least.
                captured_exceptions.append(exception)

        await self.call(workflow)

        self.assertEqual(len(captured_exceptions), 1)
        self.assertIn("Boom!", str(captured_exceptions[0]))

    async def test_tool_return_metadata_survives_memoization(self) -> None:
        """A tool returning a `ToolReturn` with `metadata=...`
        survives a forced workflow retry.
        """
        from pydantic_ai import ToolReturn

        model = ToolCallingModel([[("tool", {})]])
        agent = Agent(model, name="Agent")

        # The agent's text response (final turn) carries no
        # metadata, so we observe survival via the tool's
        # *invocation count*: on retry the body must NOT be
        # re-invoked (the cached `ToolReturn` is reused).
        invocations = 0

        @agent.tool
        async def tool(
            context: WorkflowContext,
            run: RunContext[None],
        ) -> ToolReturn:
            nonlocal invocations
            invocations += 1
            return ToolReturn(
                return_value="payload",
                metadata={"trace_id": "abc-123"},
            )

        attempts = 0

        async def workflow(context: WorkflowContext) -> None:
            nonlocal attempts
            attempts += 1
            await agent.run(context, "Some prompt")
            if attempts == 1:
                # Force a retry so `at_least_once` has to
                # re-hydrate the memoized `ToolReturn` from its
                # pickle round-trip.
                raise RuntimeError("Trigger retry")

        await self.call(workflow)

        self.assertEqual(attempts, 2)

        # Tool body ran once across both attempts: the retry
        # received the pickled-and-unpickled `ToolReturn`. If
        # the metadata round-trip had broken, `at_least_once`
        # would have raised when comparing the cached return's
        # type against its expected type and the test would not
        # have completed.
        self.assertEqual(invocations, 1)


class MCPWrapperToolsetTestCase(WorkflowAgentRunTestCase):
    """End-to-end coverage that an `MCPServer`-typed toolset
    passed to `Agent(toolsets=[...])` works as expected.
    """

    async def test_get_tools_returns_wrapped_servers_tools(self) -> None:
        """A 1-step agent run with an `MCPServer`-typed toolset
        dispatches the wrapped server's `echo` tool exactly once
        and hits `get_tools` at least once. Confirms the
        dispatcher plumbed the call through `_MCPWrapperToolset`.
        """
        mcp = _make_mcp_server_mock(id="mcp-a")
        model = ToolCallingModel([[("echo", {})]])
        agent = Agent(model, name="Agent", toolsets=[mcp])

        async def workflow(context: WorkflowContext) -> None:
            await agent.run(context, "Some prompt")

        await self.call(workflow)

        self.assertGreaterEqual(mcp.get_tools.call_count, 1)
        self.assertEqual(mcp.call_tool.call_count, 1)

    async def test_get_tools_cache_tools_true_hits_server_once(
        self,
    ) -> None:
        """A 3-step agent run with `cache_tools=True` hits the
        wrapped MCP server's `get_tools` exactly once: the
        wrapper-level cache short-circuits subsequent calls
        regardless of `run_step`.
        """
        mcp = _make_mcp_server_mock(id="mcp-a", cache_tools=True)
        model = ToolCallingModel([[("echo", {})]] * 3)
        agent = Agent(model, name="Agent", toolsets=[mcp])

        async def workflow(context: WorkflowContext) -> None:
            await agent.run(context, "Some prompt")

        await self.call(workflow)

        self.assertEqual(mcp.get_tools.call_count, 1)
        self.assertEqual(mcp.call_tool.call_count, 3)

    async def test_get_tools_cache_tools_false_refetches_per_step(
        self,
    ) -> None:
        """A 3-step agent run with `cache_tools=False` hits the
        wrapped server's `get_tools` once per turn. The model
        emits 3 tool-calling turns plus a final text-only turn
        to end the run -- 4 turns total -- and each lands on a
        fresh `at_least_once` slot keyed on `run_step`, so the
        server is re-queried each turn.
        """
        mcp = _make_mcp_server_mock(id="mcp-a", cache_tools=False)
        model = ToolCallingModel([[("echo", {})]] * 3)
        agent = Agent(model, name="Agent", toolsets=[mcp])

        async def workflow(context: WorkflowContext) -> None:
            await agent.run(context, "Some prompt")

        await self.call(workflow)

        # 3 tool-emitting turns + 1 final text turn = 4 model
        # requests, each calling `get_tools`.
        self.assertEqual(mcp.get_tools.call_count, 4)

    async def test_get_instructions_skipped_when_disabled(self) -> None:
        """With `include_instructions=False`, the wrapper
        short-circuits `get_instructions` to `None` without
        dispatching to the wrapped server.
        """
        mcp = _make_mcp_server_mock(id="mcp-a", include_instructions=False)
        model = ToolCallingModel([[("echo", {})]])
        agent = Agent(model, name="Agent", toolsets=[mcp])

        async def workflow(context: WorkflowContext) -> None:
            await agent.run(context, "Some prompt")

        await self.call(workflow)

        self.assertEqual(mcp.get_instructions.call_count, 0)

    async def test_get_instructions_memoized_per_step(self) -> None:
        """Validate that workflow retry does what we expect when
        `include_instructions=True`.
        """
        mcp = _make_mcp_server_mock(id="mcp-a", include_instructions=True)
        model = ToolCallingModel([[("echo", {})]])
        agent = Agent(model, name="Agent", toolsets=[mcp])
        attempts = 0

        async def workflow(context: WorkflowContext) -> None:
            nonlocal attempts
            attempts += 1
            await agent.run(context, "Some prompt")
            if attempts == 1:
                raise RuntimeError("Trigger retry")

        await self.call(workflow)

        self.assertEqual(attempts, 2)
        # 2 turns per attempt * 2 attempts would mean 4 calls but due
        # to `at_least_once` memoization we'll only have 2 calls to
        # `get_instructions()`.
        self.assertEqual(mcp.get_instructions.call_count, 2)


class OverrideTestCase(WorkflowAgentRunTestCase):

    async def test_override_toolsets_raises(self) -> None:
        """Validates `agent.override(toolsets=[...])` raises `UserError`
        immediately.
        """
        agent = Agent(NOOP_MODEL, name="Agent")

        toolset: FunctionToolset[None] = FunctionToolset()

        with self.assertRaises(UserError) as raised:
            with agent.override(toolsets=[toolset]):
                pass

        self.assertIn("Overriding `toolsets`", str(raised.exception))
        self.assertIn("not currently supported", str(raised.exception))

    async def test_override_model_uses_inner(self) -> None:
        """Inside `agent.override(model=inner)`, an `agent.run()`
        dispatches to the override, not to the agent's default
        outer model.
        """
        outer_model = CountingModel()
        inner_model = CountingModel()
        agent = Agent(outer_model, name="Agent")

        async def workflow(context: WorkflowContext) -> None:
            with agent.override(model=inner_model):
                await agent.run(context, "Some prompt")

        await self.call(workflow)

        self.assertEqual(inner_model.request_count, 1)
        self.assertEqual(outer_model.request_count, 0)

    async def test_override_deps_propagates_to_tool(self) -> None:
        """`agent.override(deps=42)` propagates the deps into the
        `RunContext` seen by tools; the tool sees `run.deps == 42`.
        """
        model = ToolCallingModel([[("tool", {})]])
        agent = Agent(model, name="Agent", deps_type=int)

        captured_deps: list[int] = []

        @agent.tool
        async def tool(context: WorkflowContext, run: RunContext[int]) -> str:
            captured_deps.append(run.deps)
            return "ok"

        async def workflow(context: WorkflowContext) -> None:
            with agent.override(deps=42):
                await agent.run(context, "Some prompt")

        await self.call(workflow)

        self.assertEqual(captured_deps, [42])


class PerRunKwargsTestCase(WorkflowAgentRunTestCase):
    """`agent.run(...)` accepts the same per-run kwargs as
    pydantic_ai's `Agent.run(...)`: `model=`, `toolsets=`,
    `deps=`, etc. We verify the most load-bearing ones still
    work after Reboot's per-run wrapping.
    """

    # Used to track tool call invocations for
    # `test_per_run_toolsets_dispatch_through_at_least_once`.
    _per_run_toolsets_invocations: int = 0

    @staticmethod
    async def tool(run: RunContext[None], query: str) -> str:
        PerRunKwargsTestCase._per_run_toolsets_invocations += 1
        return "Unimportant"

    async def test_per_run_model_overrides_default(self) -> None:
        """`agent.run(context, ..., model=inner)` (per-run override)
        dispatches to the override instead of the agent's default
        model. Counter on the inner model is 1; on the outer is 0.
        """
        outer_model = CountingModel()
        inner_model = CountingModel()
        agent = Agent(outer_model, name="Agent")

        async def workflow(context: WorkflowContext) -> None:
            await agent.run(context, "Some prompt", model=inner_model)

        await self.call(workflow)

        self.assertEqual(inner_model.request_count, 1)
        self.assertEqual(outer_model.request_count, 0)

    async def test_per_run_toolsets_dispatch_through_at_least_once(
        self,
    ) -> None:
        """`agent.run(context, ..., toolsets=[...])` (per-run toolset)
        dispatches the tool call to the per-run toolset. The
        class-level `tool` is used so `_digest()` can pickle the
        toolset -- local closures fail pickling, which is what
        `test_unpicklable_per_run_toolset_raises_user_error` covers.
        """
        PerRunKwargsTestCase._per_run_toolsets_invocations = 0

        toolset: FunctionToolset[None] = FunctionToolset(
            tools=[PerRunKwargsTestCase.tool],
        )
        model = ToolCallingModel([[("tool", {"query": "hello"})]])
        agent = Agent(model, name="Agent")

        async def workflow(context: WorkflowContext) -> None:
            await agent.run(context, "Some prompt", toolsets=[toolset])

        await self.call(workflow)

        self.assertEqual(
            PerRunKwargsTestCase._per_run_toolsets_invocations,
            1,
        )

    async def test_unpicklable_per_run_toolset_raises_user_error(
        self,
    ) -> None:
        """Validates that a per-run `toolsets=[...]` containing a local
        closure raises `UserError` because it can't be pickled.
        """

        async def tool(run: RunContext[None], query: str) -> str:
            return "Unimportant"

        toolset: FunctionToolset[None] = FunctionToolset(tools=[tool])

        agent = Agent(NOOP_MODEL, name="Agent")

        captured_user_error: UserError | None = None

        async def workflow(context: WorkflowContext) -> None:
            nonlocal captured_user_error
            try:
                await agent.run(context, "Some prompt", toolsets=[toolset])
            except UserError as error:
                captured_user_error = error

        await self.call(workflow)

        assert captured_user_error is not None
        message = str(captured_user_error)
        self.assertIn("per-run `toolsets=`", message)
        self.assertIn("module scope", message)

    async def test_per_run_deps_propagate_to_tool(self) -> None:
        """Validates that we propagate deps correctly."""
        model = ToolCallingModel([[("tool", {})]])
        agent = Agent(model, name="Agent", deps_type=int)

        captured_deps: int | None = None

        @agent.tool
        async def tool(context: WorkflowContext, run: RunContext[int]) -> str:
            nonlocal captured_deps
            captured_deps = run.deps
            return "ok"

        async def workflow(context: WorkflowContext) -> None:
            await agent.run(context, "Some prompt", deps=99)

        await self.call(workflow)

        self.assertEqual(captured_deps, 99)

    async def test_per_run_instructions_reach_model(self) -> None:
        """Ensures `agent.run(context, ..., instructions="Be terse.")` reaches
        the wrapped model.
        """
        seen_instructions: str | None = None

        def function(messages, info):
            nonlocal seen_instructions
            if info.instructions is not None:
                seen_instructions = info.instructions
            return ModelResponse(parts=[TextPart(content="ok")])

        agent = Agent(FunctionModel(function=function), name="Agent")

        async def workflow(context: WorkflowContext) -> None:
            await agent.run(context, "Some prompt", instructions="Be terse.")

        await self.call(workflow)

        self.assertEqual(seen_instructions, "Be terse.")


class NestedRunTestCase(WorkflowAgentRunTestCase):

    async def test_run_inside_tool_raises_nested_run(self) -> None:
        """Validates running an agent within another agent, e.g., in a tool,
        is not allowed.
        """
        model = ToolCallingModel([[("tool", {})]])
        outer = Agent(model, name="OuterAgent")

        inner = Agent(NOOP_MODEL, name="InnerAgent")

        captured_error_messages: list[str] = []

        @outer.tool
        async def tool(context, run: RunContext[None]) -> str:
            try:
                await inner.run(context, "Inner prompt")
            except UserError as error:
                captured_error_messages.append(str(error))
            return "Unimportant"

        async def workflow(context: WorkflowContext) -> None:
            await outer.run(context, "Outer prompt")

        await self.call(workflow)

        self.assertEqual(len(captured_error_messages), 1)
        self.assertIn(
            "Nested agent runs are not supported",
            captured_error_messages[0],
        )


class MultimodalUserPromptTestCase(WorkflowAgentRunTestCase):

    async def test_list_user_content_runs_normally(self) -> None:
        """Tests a `list[UserContent]` `user_prompt` (multimodal input) is
        supported.
        """
        from pydantic_ai.messages import TextContent

        agent = Agent(NOOP_MODEL, name="Agent")

        async def workflow(context: WorkflowContext) -> None:
            # A list `user_prompt` -- not the empty string -- runs
            # without tripping the empty-string check.
            await agent.run(context, [TextContent(content="multimodal-hi")])

        await self.call(workflow)

    async def test_empty_list_user_prompt_runs(self) -> None:
        """Tests an empty list `[]` for `user_prompt` is supported."""
        agent = Agent(NOOP_MODEL, name="Agent")

        async def workflow(context: WorkflowContext) -> None:
            # `[] == ""` is False so we don't raise.
            await agent.run(context, [])

        await self.call(workflow)


class AlternateRunEntryPointTestCase(WorkflowAgentRunTestCase):

    async def test_iter(self) -> None:
        """Validates `agent.iter(context, "Some prompt")` completes
        successfully.
        """
        model = CountingModel()
        agent = Agent(model, name="Agent")

        captured_result: AgentRunResult[str] | None = None

        async def workflow(context: WorkflowContext) -> None:
            nonlocal captured_result
            async with agent.iter(context, "Some prompt") as run:
                async for _ in run:
                    pass
            captured_result = run.result

        await self.call(workflow)

        assert captured_result is not None
        self.assertEqual(captured_result.output, "r1")
        self.assertEqual(model.request_count, 1)

    async def test_run_stream(self) -> None:
        """Validate `agent.run_stream(context, "Some prompt")` completes
        successfully.
        """
        model = CountingModel()
        agent = Agent(model, name="Agent")

        captured_chunks: list[str] = []

        async def workflow(context: WorkflowContext) -> None:
            async with agent.run_stream(context, "Some prompt") as result:
                async for chunk in result.stream_text():
                    captured_chunks.append(chunk)

        await self.call(workflow)

        self.assertTrue(captured_chunks)
        self.assertEqual(model.request_stream_count, 1)

    async def test_run_stream_events(self) -> None:
        """Validates `agent.run_stream_events(context, "Some prompt")`
        completes successfully.
        """
        model = CountingModel()
        agent = Agent(model, name="Agent")

        captured_events_seen: int = 0

        async def workflow(context: WorkflowContext) -> None:
            nonlocal captured_events_seen
            async for _ in agent.run_stream_events(context, "Some prompt"):
                captured_events_seen += 1

        await self.call(workflow)

        self.assertGreater(captured_events_seen, 0)
        self.assertEqual(model.request_stream_count, 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
