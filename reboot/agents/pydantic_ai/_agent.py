from __future__ import annotations

import pydantic_ai
from ._model import _Model
from ._run import _agent_run
from ._toolset import (
    ToolFuncContext,
    ToolFuncPlain,
    _make_toolset_wrapper,
    _wrap_tool_function,
    _WrapperToolset,
)
from ._typing import AgentDepsT, OutputDataT, RunOutputDataT, ToolParams
from collections.abc import AsyncIterator, Callable, Iterator, Sequence
from contextlib import (
    AbstractAsyncContextManager,
    asynccontextmanager,
    contextmanager,
)
from pydantic.json_schema import GenerateJsonSchema
from pydantic_ai import _utils
from pydantic_ai._agent_graph import EndStrategy, HistoryProcessor
from pydantic_ai._instructions import AgentInstructions
from pydantic_ai._template import TemplateStr
from pydantic_ai.agent.abstract import (
    AbstractAgent,
    AgentMetadata,
    AgentModelSettings,
    EventStreamHandler,
)
from pydantic_ai.agent.wrapper import WrapperAgent
from pydantic_ai.capabilities import AbstractCapability
from pydantic_ai.exceptions import UserError
from pydantic_ai.models.instrumented import InstrumentationSettings
from pydantic_ai.output import OutputSpec
from pydantic_ai.result import StreamedRunResult
from pydantic_ai.run import AgentRun, AgentRunResult, AgentRunResultEvent
from pydantic_ai.tools import (
    AgentBuiltinTool,
    ArgsValidatorFunc,
    DeferredToolResults,
    DocstringFormat,
    GenerateToolJsonSchema,
    RunContext,
    Tool,
    ToolFuncEither,
    ToolPrepareFunc,
    ToolsPrepareFunc,
)
from pydantic_ai.toolsets import AbstractToolset, AgentToolset
from pydantic_ai.toolsets.function import FunctionToolset
from reboot.aio.contexts import WorkflowContext
from typing import Any, Literal, TypeAlias, TypeVar, overload

# Bounded TypeVar for the "no-real-model-was-passed" sentinels `None`
# and `_utils.Unset` which pydantic_ai uses annoyingly in different
# places.
_NoneOrUnset = TypeVar("_NoneOrUnset", None, _utils.Unset)

# NOTE: this file is using the `T | None` style for optional types
# instead of `Optional[T]` because that is how pydantic_ai does it and
# a lot of the code here is copied from their repository and we'd like
# to keep it consistent as we update it and keep it in sync with the
# upstream pydantic_ai library.

# Reboot-allowed values for pydantic_ai's
# `parallel_tool_call_execution_mode`. Excludes pydantic_ai's
# default `'parallel'` because it yields tool-result events in
# *completion* order, which depends on asyncio scheduling and is
# therefore non-deterministic across replays -- on replay every
# memoized tool returns effectively instantly, so consumers
# (`event_stream_handler`, `agent.run_stream_events()`) can see
# events in different orders between the original run and a
# replay. Both `'sequential'` (one tool at a time, in original
# order) and `'parallel_ordered_events'` (concurrent execution,
# events emitted in original order after all tools complete) are
# replay-safe.
ParallelExecutionMode: TypeAlias = Literal[
    "sequential",
    "parallel_ordered_events",
]


class Agent(WrapperAgent[AgentDepsT, OutputDataT]):
    """A durable Pydantic AI `Agent` for use in Reboot workflows.

    Each model call is memoized via `at_least_once` so previously-
    completed model calls return their cached `ModelResponse` on
    workflow replay instead of re-hitting the provider.

    At the start of every agent run we snapshot the agent's static
    `instructions` / `system_prompt` and memoize the snapshot via
    `at_least_once`. On replay we log a warning if the current
    snapshot differs -- a sign that the agent's static
    configuration has changed since the run was first executed and
    the memoized model responses may no longer reflect the current
    configuration.

    `run_stream` and `run_stream_events` are supported, but the
    underlying model call is drained and memoized, so events arrive in
    a single batch once the model finishes -- token-by-token streaming
    is fundamentally incompatible with deterministic replay, unless
    the caller was comfortable with a stream being possibly
    interrupted and then restarted (which might be worth the tradeoff
    for some applications).

    There are two ways to construct an agent:

    * Directly, passing the same arguments you'd pass to
      `pydantic_ai.Agent`:

      ```python
      from reboot.agents.pydantic_ai import Agent

      agent = Agent(
          "anthropic:claude-sonnet-4-5",
          instructions="...",
      )
      ```

    * From an already-constructed `pydantic_ai.Agent` via
      `Agent.wrap(existing)`:

      ```python
      import pydantic_ai
      from reboot.agents.pydantic_ai import Agent

      pydantic_agent = pydantic_ai.Agent(...)
      agent = Agent.wrap(pydantic_agent)
      ```
    """

    def __init__(
        self,
        model: pydantic_ai.models.Model | pydantic_ai.models.KnownModelName | str | None = None,
        *,
        output_type: OutputSpec[OutputDataT] = str,  # type: ignore[assignment]
        instructions: AgentInstructions[AgentDepsT] = None,
        system_prompt: str | Sequence[str] = (),
        deps_type: type[AgentDepsT] = type(None),  # type: ignore[assignment]
        name: str | None = None,
        description: TemplateStr[AgentDepsT] | str | None = None,
        model_settings: AgentModelSettings[AgentDepsT] | None = None,
        retries: int = 1,
        validation_context: (
            Any | Callable[[RunContext[AgentDepsT]], Any]
        ) = None,
        output_retries: int | None = None,
        tools: Sequence[
            Tool[AgentDepsT] | ToolFuncEither[AgentDepsT, ...]
        ] = (),
        builtin_tools: Sequence[AgentBuiltinTool[AgentDepsT]] = (),
        prepare_tools: ToolsPrepareFunc[AgentDepsT] | None = None,
        prepare_output_tools: ToolsPrepareFunc[AgentDepsT] | None = None,
        toolsets: Sequence[AgentToolset[AgentDepsT]] | None = None,
        defer_model_check: bool = False,
        end_strategy: EndStrategy = "early",
        instrument: InstrumentationSettings | bool | None = None,
        metadata: AgentMetadata[AgentDepsT] | None = None,
        history_processors: (
            Sequence[HistoryProcessor[AgentDepsT]] | None
        ) = None,
        event_stream_handler: EventStreamHandler[AgentDepsT] | None = None,
        tool_timeout: float | None = None,
        max_concurrency: pydantic_ai.concurrency.AnyConcurrencyLimit = None,
        capabilities: Sequence[AbstractCapability[AgentDepsT]] | None = None,
        parallel_execution_mode: ParallelExecutionMode = (
            "parallel_ordered_events"
        ),
        **kwargs: Any,
    ) -> None:
        # Forward every argument to `pydantic_ai.Agent`. The explicit
        # signature here gives IDEs and type checkers the full surface
        # area; the `**kwargs` catch-all mirrors upstream, so any
        # parameter added to `pydantic_ai.Agent.__init__` in a future
        # release still passes through transparently.
        wrapped: AbstractAgent[AgentDepsT, OutputDataT] = pydantic_ai.Agent(
            model,
            output_type=output_type,
            instructions=instructions,
            system_prompt=system_prompt,
            deps_type=deps_type,
            name=name,
            description=description,
            model_settings=model_settings,
            retries=retries,
            validation_context=validation_context,
            output_retries=output_retries,
            tools=tools,
            builtin_tools=builtin_tools,
            prepare_tools=prepare_tools,
            prepare_output_tools=prepare_output_tools,
            toolsets=toolsets,
            defer_model_check=defer_model_check,
            end_strategy=end_strategy,
            instrument=instrument,
            metadata=metadata,
            history_processors=history_processors,
            event_stream_handler=event_stream_handler,
            tool_timeout=tool_timeout,
            max_concurrency=max_concurrency,
            capabilities=capabilities,
            **kwargs,
        )
        self._init_from_wrapped(
            wrapped,
            parallel_execution_mode=parallel_execution_mode,
        )

    @classmethod
    def wrap(
        cls,
        wrapped: AbstractAgent[AgentDepsT, OutputDataT],
        *,
        parallel_execution_mode: ParallelExecutionMode = (
            "parallel_ordered_events"
        ),
    ) -> "Agent[AgentDepsT, OutputDataT]":
        """Adopt an already-constructed `pydantic_ai.Agent` (or any
        `AbstractAgent`) as a Reboot `Agent`.

        Walks the wrapped agent's toolset tree and replaces every
        leaf toolset with a `_WrapperToolset` so existing tool
        calls flow through our `at_least_once` /
        `idempotency_seeds` envelope. Tools registered on this
        Reboot `Agent` after `wrap()` via `@agent.tool` /
        `@agent.tool_plain` are added to a separate Reboot-owned
        `FunctionToolset` (NOT to the underlying agent), and also
        participate in the wrapping.

        The wrapped agent itself is left untouched -- we don't
        mutate any of its private state. Toolsets are swapped in
        per run via `pydantic_ai.Agent.override(...)`.

        Useful when the upstream agent comes from code you don't
        control -- e.g. a factory function or third-party library.
        For the common case of constructing an agent from scratch,
        call `Agent(...)` directly with the same arguments you'd
        pass to `pydantic_ai.Agent`.
        """
        instance = cls.__new__(cls)
        instance._init_from_wrapped(
            wrapped,
            parallel_execution_mode=parallel_execution_mode,
        )
        return instance

    def _init_from_wrapped(
        self,
        wrapped: AbstractAgent[AgentDepsT, OutputDataT],
        *,
        parallel_execution_mode: ParallelExecutionMode,
    ) -> None:
        WrapperAgent.__init__(self, wrapped)
        if wrapped.name is None:
            raise UserError(
                "An agent needs to have a unique `name` in order "
                "to be used with Reboot. The name is used to "
                "scope the agent's memoized calls."
            )
        self._name: str = wrapped.name

        # Reject pydantic_ai's `'parallel'` mode at construction
        # since it produces non-deterministic event ordering on
        # replay. Accept only the two replay-safe modes; anything
        # else (typo, bare `'parallel'`, etc.) gets a clear error.
        if parallel_execution_mode not in (
            "sequential",
            "parallel_ordered_events",
        ):
            raise UserError(
                f"`parallel_execution_mode='{parallel_execution_mode}'` "
                "is not supported on a Reboot `Agent`: only "
                "`'sequential'` and `'parallel_ordered_events'` are "
                "replay-safe. Pydantic_ai's default `'parallel'` "
                "yields tool-result events in completion order, "
                "which depends on asyncio scheduling and is "
                "therefore non-deterministic across replays."
            )
        self._parallel_execution_mode: ParallelExecutionMode = (
            parallel_execution_mode
        )

        # Reboot-owned `FunctionToolset` for tools registered via
        # `@agent.tool` / `@agent.tool_plain` AFTER construction.
        # Distinct from the wrapped agent's own `_function_toolset`
        # so we never mutate the wrapped agent's state.
        self._function_toolset: FunctionToolset[AgentDepsT] = (
            FunctionToolset()
        )

    @property
    def name(self) -> str | None:
        return self._name

    @name.setter
    def name(self, value: str | None) -> None:
        raise UserError(
            "The agent's name cannot be changed after creation; it "
            "is part of the memoization key for every model and "
            "tool call in this agent's runs, so changing it would "
            "silently shift those keys and break replay. To use a "
            "different name, construct a new Reboot `Agent` "
            "instead."
        )

    @property
    def model(
        self
    ) -> pydantic_ai.models.Model | pydantic_ai.models.KnownModelName | str | None:
        # Surface the user's configured model verbatim. Reboot's
        # internal `_Model` wrapping happens at run time inside
        # the four entry points; this property is for inspection
        # of "what did the user configure?" and intentionally does
        # not expose our internal wrapper.
        return self.wrapped.model

    @property
    def toolsets(self) -> Sequence[AbstractToolset[AgentDepsT]]:
        # Surface the user's toolsets verbatim, in the same order an
        # actual run dispatches through: our Reboot-owned
        # `FunctionToolset` (for `@agent.tool` / `@agent.tool_plain`
        # registrations) first, then the wrapped agent's combined
        # `toolsets` (its own `_function_toolset` + any
        # user-supplied `toolsets=`). Reboot's `_WrapperToolset`
        # wrapping happens lazily inside the four entry points;
        # this property is for inspection ("what tools does this
        # agent have?") and intentionally does not expose our
        # internal wrappers.
        return [self._function_toolset, *self.wrapped.toolsets]

    @overload
    def tool(
        self,
        function: ToolFuncContext[AgentDepsT, ToolParams],
        /,
    ) -> ToolFuncContext[AgentDepsT, ToolParams]:
        ...

    @overload
    def tool(
        self,
        /,
        *,
        name: str | None = None,
        description: str | None = None,
        retries: int | None = None,
        prepare: ToolPrepareFunc[AgentDepsT] | None = None,
        args_validator: ArgsValidatorFunc[AgentDepsT, ToolParams] |
        None = None,
        docstring_format: DocstringFormat = "auto",
        require_parameter_descriptions: bool = False,
        schema_generator: type[GenerateJsonSchema] = GenerateToolJsonSchema,
        strict: bool | None = None,
        sequential: bool = False,
        requires_approval: bool = False,
        metadata: dict[str, Any] | None = None,
        timeout: float | None = None,
        defer_loading: bool = False,
        include_return_schema: bool | None = None,
    ) -> Callable[
        [ToolFuncContext[AgentDepsT, ToolParams]],
        ToolFuncContext[AgentDepsT, ToolParams],
    ]:
        ...

    def tool(
        self,
        function: Any = None,
        /,
        **kwargs: Any,
    ) -> Any:
        """Register a tool whose first parameter is a Reboot
        `WorkflowContext` and whose second parameter is a
        pydantic_ai `RunContext[Deps]`.

        Mirrors the signature of `pydantic_ai.Agent.tool` -- both
        the bare `@agent.tool` and parametrized
        `@agent.tool(retries=2)` forms are supported.

        Example:
        ```python
        from reboot.agents.pydantic_ai import Agent
        from pydantic_ai import RunContext
        from reboot.aio.contexts import WorkflowContext

        agent = Agent("test", deps_type=int, name="my_agent")

        @agent.tool
        async def lookup(
            context: WorkflowContext,
            run: RunContext[int],
            query: str,
        ) -> str:
            ...
        ```
        """

        def decorator(
            function_: ToolFuncContext[AgentDepsT, ToolParams],
        ) -> ToolFuncContext[AgentDepsT, ToolParams]:
            self._function_toolset.add_function(
                _wrap_tool_function(function_),
                takes_ctx=True,
                **kwargs,
            )
            return function_

        return decorator if function is None else decorator(function)

    @overload
    def tool_plain(
        self,
        function: ToolFuncPlain[ToolParams],  # type: ignore[type-arg]
        /,
    ) -> ToolFuncPlain[ToolParams]:  # type: ignore[type-arg]
        ...

    @overload
    def tool_plain(
        self,
        /,
        *,
        name: str | None = None,
        description: str | None = None,
        retries: int | None = None,
        prepare: ToolPrepareFunc[AgentDepsT] | None = None,
        args_validator: ArgsValidatorFunc[AgentDepsT, ToolParams] |
        None = None,
        docstring_format: DocstringFormat = "auto",
        require_parameter_descriptions: bool = False,
        schema_generator: type[GenerateJsonSchema] = GenerateToolJsonSchema,
        strict: bool | None = None,
        sequential: bool = False,
        requires_approval: bool = False,
        metadata: dict[str, Any] | None = None,
        timeout: float | None = None,
        defer_loading: bool = False,
        include_return_schema: bool | None = None,
    ) -> Callable[  # type: ignore[type-arg]
        [ToolFuncPlain[ToolParams]],
        ToolFuncPlain[ToolParams],
    ]:
        ...

    def tool_plain(
        self,
        function: Any = None,
        /,
        **kwargs: Any,
    ) -> Any:
        """Register a tool that takes neither a Reboot
        `WorkflowContext` nor a pydantic_ai `RunContext`.

        Mirrors the signature of `pydantic_ai.Agent.tool_plain` --
        both the bare `@agent.tool_plain` and parametrized
        `@agent.tool_plain(retries=2)` forms are supported.

        Example:
        ```python
        from reboot.agents.pydantic_ai import Agent

        agent = Agent("test", name="my_agent")

        @agent.tool_plain
        async def add(x: int, y: int) -> int:
            return x + y
        ```

        Tool calls still flow through Reboot's `at_least_once` /
        `idempotency_seeds` envelope by virtue of the toolset-level
        wrapping; the function itself runs unchanged.
        """

        def decorator(
            function_: ToolFuncPlain[ToolParams],  # type: ignore[type-arg]
        ) -> ToolFuncPlain[ToolParams]:  # type: ignore[type-arg]
            self._function_toolset.add_function(
                function_,
                takes_ctx=False,
                **kwargs,
            )
            return function_

        return decorator if function is None else decorator(function)

    @staticmethod
    def _validate_context(
        context: WorkflowContext | str |
        Sequence[pydantic_ai.messages.UserContent] | None,
        *,
        method: Literal["run", "iter", "run_stream", "run_stream_events"],
    ) -> WorkflowContext:
        """Validate the first positional argument of `run` / `iter` /
        `run_stream` / `run_stream_events` is actually a
        `WorkflowContext`. `method` is the name of the calling
        entry point so the raised `UserError` can name it for
        the caller. Raises `UserError` naming the fix; on success
        returns the context narrowed to `WorkflowContext` so
        callers can use it directly.
        """
        if not isinstance(context, WorkflowContext):
            raise UserError(
                f"`Agent.{method}` requires `context: "
                f"WorkflowContext` as its first positional "
                f"argument; got `{type(context).__name__}`. If "
                f"you're calling through a reference typed as "
                f"`pydantic_ai.AbstractAgent` (whose signature "
                f"has no `context` parameter), you likely passed "
                f"`user_prompt` first by mistake -- the Reboot "
                f"`Agent` requires a `WorkflowContext` first."
            )
        return context

    @overload
    @staticmethod
    def _wrap_model(
        model: pydantic_ai.models.Model | pydantic_ai.models.KnownModelName |
        str,
    ) -> pydantic_ai.models.Model:
        ...

    @overload
    @staticmethod
    def _wrap_model(
        model: pydantic_ai.models.Model | pydantic_ai.models.KnownModelName |
        str | _NoneOrUnset,
    ) -> pydantic_ai.models.Model | _NoneOrUnset:
        ...

    @staticmethod
    def _wrap_model(
        model: pydantic_ai.models.Model | pydantic_ai.models.KnownModelName |
        str | None | _utils.Unset,
    ) -> pydantic_ai.models.Model | None | _utils.Unset:
        """Convert a user-supplied model into a Reboot `_Model`
        so every `request` / `request_stream` flows through
        `at_least_once`. No-op for already-wrapped Reboot
        models, and pass-through for the sentinel forms `None`
        (the agent's default-model resolution / pydantic_ai's
        own no-model error remain in play) and `_utils.Unset`
        (used by callers like `Agent.override(...)` that want
        to hand pydantic_ai's "user didn't pass anything"
        sentinel through unchanged).

        Strings (the `KnownModelName` shortcut form, e.g.,
        `"anthropic:claude-sonnet-4-5"`) are resolved to a
        concrete `pydantic_ai.models.Model` via
        `pydantic_ai.models.infer_model(...)` before wrapping --
        without that step we'd end up with a `_Model` holding a
        string instead of a real model, and `request(...)` would
        explode at runtime.

        The two overloads above let callers pass either a
        concrete model (returns `Model`) or the union including
        a sentinel (returns `Model | <whichever sentinel was
        passed>`). The `_NoneOrUnset` constrained TypeVar
        preserves the specific sentinel through the call so
        callers don't need to narrow before calling.
        """
        if model is None or isinstance(model, _utils.Unset):
            return model
        if isinstance(model, _Model):
            return model
        return _Model(pydantic_ai.models.infer_model(model))

    def _wrap_model_or_default(
        self,
        model: pydantic_ai.models.Model | pydantic_ai.models.KnownModelName |
        str | None,
    ) -> pydantic_ai.models.Model | None:
        """Wrap a per-run `model` argument; fall back to the
        wrapped agent's default `model` (also wrapped, to cover
        the `Agent.wrap(bare)` case where `bare.model` is not
        already a Reboot `Model`). Either is ignored at run time
        when the user has set up an `override(model=...)`, since
        pydantic_ai's `_get_model` consults `_override_model`
        first.
        """
        return self._wrap_model(model or self.wrapped.model)

    def _wrap_toolsets(
        self,
        additional_toolsets: Sequence[AbstractToolset[AgentDepsT]] |
        None = None,
    ) -> list[AbstractToolset[AgentDepsT]]:
        """Build the run-time toolset list with a Reboot wrapper
        applied to each leaf (`_MCPWrapperToolset` for MCP leaves,
        `_WrapperToolset` otherwise -- see `_make_toolset_wrapper`),
        so every tool call -- and every MCP `get_tools` /
        `get_instructions` -- flows through Reboot's
        `at_least_once` / `idempotency_seeds` envelope. Includes
        our Reboot-owned `FunctionToolset` (for `@agent.tool` /
        `@agent.tool_plain` registrations) plus the wrapped
        agent's currently-configured toolsets. Re-walked per run
        so post-construction additions on either side surface at
        the next run.

        `additional_toolsets` accepts the user's per-run `toolsets=`
        kwarg from the entry points; pydantic_ai treats those as
        additive (`additional_toolsets` in `_build_toolset_list`)
        but only when no `_override_toolsets` is active -- since
        we always install one, we fold the user's run-time
        toolsets in here so they aren't silently dropped.

        A single `_make_toolset_wrapper()` callable is reused
        across every `visit_and_replace` call below so its
        "at most one id-less MCP toolset" check spans the entire
        toolset tree -- including any per-run `additional_toolsets`.
        """
        wrap = _make_toolset_wrapper()
        wrapped = [
            _WrapperToolset(self._function_toolset),
            *(
                toolset.visit_and_replace(wrap)
                for toolset in self.wrapped.toolsets
            ),
        ]
        if additional_toolsets:
            wrapped.extend(
                toolset.visit_and_replace(wrap)
                for toolset in additional_toolsets
            )
        return wrapped

    @contextmanager
    def override(
        self,
        *,
        name: str | _utils.Unset = _utils.UNSET,
        deps: AgentDepsT | _utils.Unset = _utils.UNSET,
        model: pydantic_ai.models.Model | pydantic_ai.models.KnownModelName |
        str | _utils.Unset = _utils.UNSET,
        toolsets: Sequence[AbstractToolset[AgentDepsT]] |
        _utils.Unset = _utils.UNSET,
        tools: Sequence[Tool[AgentDepsT] | ToolFuncEither[AgentDepsT, ...]] |
        _utils.Unset = _utils.UNSET,
        instructions: AgentInstructions[AgentDepsT] |
        _utils.Unset = _utils.UNSET,
        model_settings: AgentModelSettings[AgentDepsT] |
        _utils.Unset = _utils.UNSET,
        spec: dict[str, Any] | Any = None,
    ) -> Iterator[None]:
        """Context manager mirroring `pydantic_ai.Agent.override`,
        with one Reboot-specific tweak: any `model` override is
        passed through `_wrap_model` so it stays memoized via
        `at_least_once`. Pass a `pydantic_ai.models.Model` instance
        or a `KnownModelName` string -- both are auto-wrapped.

        Overriding `toolsets=` is currently NOT supported on a
        Reboot `Agent`. The four entry points install their own
        per-run override of `toolsets` (so every tool call flows
        through Reboot's `_WrapperToolset`), and pydantic_ai's
        ContextVar-based override stack means that inner override
        would silently shadow whatever the user supplied here.
        """
        if _utils.is_set(toolsets):
            raise UserError(
                "Overriding `toolsets` on a Reboot `Agent` is not "
                "currently supported: the per-run wrapping that "
                "memoizes tool calls would shadow the override "
                "and your toolsets would be silently dropped. If "
                "this is important for your use case, please "
                "reach out to the maintainers."
            )
        with self.wrapped.override(
            name=name,
            deps=deps,
            model=self._wrap_model(model),
            toolsets=toolsets,
            tools=tools,
            instructions=instructions,
            model_settings=model_settings,
            spec=spec,
        ):
            yield

    # `# type: ignore[override]` needed on the first `@overload`:
    # because we've added `context: WorkflowContext` as the first
    # argument which is incompatible with the supertype's
    # `user_prompt` first argument, even though our concrete
    # implemntation below correctly widens `context` to be type safe,
    # mypy still needs this type supression.
    @overload  # type: ignore[override]
    async def run(
        self,
        context: WorkflowContext,
        user_prompt: str | Sequence[pydantic_ai.messages.UserContent] |
        None = None,
        *,
        output_type: None = None,
        message_history: Sequence[pydantic_ai.messages.ModelMessage] |
        None = None,
        deferred_tool_results: DeferredToolResults | None = None,
        model: pydantic_ai.models.Model | pydantic_ai.models.KnownModelName |
        str | None = None,
        instructions: AgentInstructions[AgentDepsT] = None,
        deps: AgentDepsT = None,  # type: ignore[assignment]
        model_settings: AgentModelSettings[AgentDepsT] | None = None,
        usage_limits: pydantic_ai.usage.UsageLimits | None = None,
        usage: pydantic_ai.usage.RunUsage | None = None,
        metadata: AgentMetadata[AgentDepsT] | None = None,
        infer_name: bool = True,
        toolsets: Sequence[AbstractToolset[AgentDepsT]] | None = None,
        builtin_tools: Sequence[AgentBuiltinTool[AgentDepsT]] | None = None,
        event_stream_handler: EventStreamHandler[AgentDepsT] | None = None,
        spec: dict[str, Any] | Any = None,
        variant: str | None = None,
    ) -> AgentRunResult[OutputDataT]:
        ...

    @overload
    async def run(
        self,
        context: WorkflowContext,
        user_prompt: str | Sequence[pydantic_ai.messages.UserContent] |
        None = None,
        *,
        output_type: OutputSpec[RunOutputDataT],
        message_history: Sequence[pydantic_ai.messages.ModelMessage] |
        None = None,
        deferred_tool_results: DeferredToolResults | None = None,
        model: pydantic_ai.models.Model | pydantic_ai.models.KnownModelName |
        str | None = None,
        instructions: AgentInstructions[AgentDepsT] = None,
        deps: AgentDepsT = None,  # type: ignore[assignment]
        model_settings: AgentModelSettings[AgentDepsT] | None = None,
        usage_limits: pydantic_ai.usage.UsageLimits | None = None,
        usage: pydantic_ai.usage.RunUsage | None = None,
        metadata: AgentMetadata[AgentDepsT] | None = None,
        infer_name: bool = True,
        toolsets: Sequence[AbstractToolset[AgentDepsT]] | None = None,
        builtin_tools: Sequence[AgentBuiltinTool[AgentDepsT]] | None = None,
        event_stream_handler: EventStreamHandler[AgentDepsT] | None = None,
        spec: dict[str, Any] | Any = None,
        variant: str | None = None,
    ) -> AgentRunResult[RunOutputDataT]:
        ...

    async def run(
        self,
        # We always require a `WorkflowContext` here, but to
        # override the supertype's signature (which has
        # `user_prompt` as the first positional) we have to
        # type this permissively. We raise a clear `UserError`
        # at runtime if the caller passes something other than
        # a `WorkflowContext`.
        context: WorkflowContext | str |
        Sequence[pydantic_ai.messages.UserContent] | None = None,
        user_prompt: str | Sequence[pydantic_ai.messages.UserContent] |
        None = None,
        *,
        output_type: OutputSpec[RunOutputDataT] | None = None,
        message_history: Sequence[pydantic_ai.messages.ModelMessage] |
        None = None,
        deferred_tool_results: DeferredToolResults | None = None,
        model: pydantic_ai.models.Model | pydantic_ai.models.KnownModelName |
        str | None = None,
        instructions: AgentInstructions[AgentDepsT] = None,
        deps: AgentDepsT = None,  # type: ignore[assignment]
        model_settings: AgentModelSettings[AgentDepsT] | None = None,
        usage_limits: pydantic_ai.usage.UsageLimits | None = None,
        usage: pydantic_ai.usage.RunUsage | None = None,
        metadata: AgentMetadata[AgentDepsT] | None = None,
        infer_name: bool = True,
        toolsets: Sequence[AbstractToolset[AgentDepsT]] | None = None,
        builtin_tools: Sequence[AgentBuiltinTool[AgentDepsT]] | None = None,
        event_stream_handler: EventStreamHandler[AgentDepsT] | None = None,
        spec: dict[str, Any] | Any = None,
        variant: str | None = None,
    ) -> AgentRunResult[Any]:
        context = self._validate_context(context, method="run")
        wrapped_model = self._wrap_model_or_default(model)
        async with _agent_run(
            context,
            agent_name=self._name,
            user_prompt=user_prompt,
            variant=variant,
            message_history=message_history,
            instructions=getattr(self.wrapped, "_instructions", ()),
            system_prompts=getattr(self.wrapped, "_system_prompts", ()),
            model_id=wrapped_model.model_id if wrapped_model else None,
            run_instructions=instructions,
            run_toolsets=toolsets,
            run_builtin_tools=builtin_tools,
            run_model_settings=model_settings,
            run_output_type=output_type,
            run_deferred_tool_results=deferred_tool_results,
        ):
            with self.wrapped.override(
                # Need to override `toolsets` vs passing them along
                # below because passing them along below is treated as
                # additive whereas we need a full replacement so every
                # tool call dispatches through `_WrapperToolset`.
                toolsets=self._wrap_toolsets(additional_toolsets=toolsets),
                tools=[],
            ), self.wrapped.parallel_tool_call_execution_mode(
                self._parallel_execution_mode,
            ):
                return await self.wrapped.run(
                    user_prompt,
                    output_type=output_type,
                    message_history=message_history,
                    deferred_tool_results=deferred_tool_results,
                    # Need to pass `wrapped_model` here vs in
                    # `self.wrapped.override` above so that if a
                    # caller has an outer `agent.override(model=...)`
                    # it will still win (and we'll have already
                    # wrapped it there).
                    model=wrapped_model,
                    instructions=instructions,
                    deps=deps,
                    model_settings=model_settings,
                    usage_limits=usage_limits,
                    usage=usage,
                    metadata=metadata,
                    infer_name=infer_name,
                    builtin_tools=builtin_tools,
                    event_stream_handler=event_stream_handler,
                    spec=spec,
                )

    # See `run`'s @overload above for why the `[override]`
    # suppression is needed here.
    @overload  # type: ignore[override]
    def iter(
        self,
        context: WorkflowContext,
        user_prompt: str | Sequence[pydantic_ai.messages.UserContent] |
        None = None,
        *,
        output_type: None = None,
        message_history: Sequence[pydantic_ai.messages.ModelMessage] |
        None = None,
        deferred_tool_results: DeferredToolResults | None = None,
        model: pydantic_ai.models.Model | pydantic_ai.models.KnownModelName |
        str | None = None,
        instructions: AgentInstructions[AgentDepsT] = None,
        deps: AgentDepsT = None,  # type: ignore[assignment]
        model_settings: AgentModelSettings[AgentDepsT] | None = None,
        usage_limits: pydantic_ai.usage.UsageLimits | None = None,
        usage: pydantic_ai.usage.RunUsage | None = None,
        metadata: AgentMetadata[AgentDepsT] | None = None,
        infer_name: bool = True,
        toolsets: Sequence[AbstractToolset[AgentDepsT]] | None = None,
        builtin_tools: Sequence[AgentBuiltinTool[AgentDepsT]] | None = None,
        spec: dict[str, Any] | Any = None,
        variant: str | None = None,
    ) -> AbstractAsyncContextManager[AgentRun[AgentDepsT, OutputDataT]]:
        ...

    @overload
    def iter(
        self,
        context: WorkflowContext,
        user_prompt: str | Sequence[pydantic_ai.messages.UserContent] |
        None = None,
        *,
        output_type: OutputSpec[RunOutputDataT],
        message_history: Sequence[pydantic_ai.messages.ModelMessage] |
        None = None,
        deferred_tool_results: DeferredToolResults | None = None,
        model: pydantic_ai.models.Model | pydantic_ai.models.KnownModelName |
        str | None = None,
        instructions: AgentInstructions[AgentDepsT] = None,
        deps: AgentDepsT = None,  # type: ignore[assignment]
        model_settings: AgentModelSettings[AgentDepsT] | None = None,
        usage_limits: pydantic_ai.usage.UsageLimits | None = None,
        usage: pydantic_ai.usage.RunUsage | None = None,
        metadata: AgentMetadata[AgentDepsT] | None = None,
        infer_name: bool = True,
        toolsets: Sequence[AbstractToolset[AgentDepsT]] | None = None,
        builtin_tools: Sequence[AgentBuiltinTool[AgentDepsT]] | None = None,
        spec: dict[str, Any] | Any = None,
        variant: str | None = None,
    ) -> AbstractAsyncContextManager[AgentRun[AgentDepsT, RunOutputDataT]]:
        ...

    @asynccontextmanager
    async def iter(
        self,
        # We always require a `WorkflowContext` here, but to
        # override the supertype's signature (which has
        # `user_prompt` as the first positional) we have to
        # type this permissively. We raise a clear `UserError`
        # at runtime if the caller passes something other than
        # a `WorkflowContext`.
        context: WorkflowContext | str |
        Sequence[pydantic_ai.messages.UserContent] | None = None,
        user_prompt: str | Sequence[pydantic_ai.messages.UserContent] | None = None,
        *,
        output_type: OutputSpec[RunOutputDataT] | None = None,
        message_history: Sequence[pydantic_ai.messages.ModelMessage] | None = None,
        deferred_tool_results: DeferredToolResults | None = None,
        model: pydantic_ai.models.Model | pydantic_ai.models.KnownModelName | str | None = None,
        instructions: AgentInstructions[AgentDepsT] = None,
        deps: AgentDepsT = None,  # type: ignore[assignment]
        model_settings: AgentModelSettings[AgentDepsT] | None = None,
        usage_limits: pydantic_ai.usage.UsageLimits | None = None,
        usage: pydantic_ai.usage.RunUsage | None = None,
        metadata: AgentMetadata[AgentDepsT] | None = None,
        infer_name: bool = True,
        toolsets: Sequence[AbstractToolset[AgentDepsT]] | None = None,
        builtin_tools: Sequence[AgentBuiltinTool[AgentDepsT]] | None = None,
        spec: dict[str, Any] | Any = None,
        variant: str | None = None,
    ) -> AsyncIterator[AgentRun[AgentDepsT, Any]]:
        context = self._validate_context(context, method="iter")
        wrapped_model = self._wrap_model_or_default(model)
        async with _agent_run(
            context,
            agent_name=self._name,
            user_prompt=user_prompt,
            variant=variant,
            message_history=message_history,
            instructions=getattr(self.wrapped, "_instructions", ()),
            system_prompts=getattr(self.wrapped, "_system_prompts", ()),
            model_id=wrapped_model.model_id if wrapped_model else None,
            run_instructions=instructions,
            run_toolsets=toolsets,
            run_builtin_tools=builtin_tools,
            run_model_settings=model_settings,
            run_output_type=output_type,
            run_deferred_tool_results=deferred_tool_results,
        ):
            with self.wrapped.override(
                # Need to override `toolsets` vs passing them along
                # below because passing them along below is treated as
                # additive whereas we need a full replacement so every
                # tool call dispatches through `_WrapperToolset`.
                toolsets=self._wrap_toolsets(additional_toolsets=toolsets),
                tools=[],
            ), self.wrapped.parallel_tool_call_execution_mode(
                self._parallel_execution_mode,
            ):
                async with self.wrapped.iter(
                    user_prompt,
                    output_type=output_type,
                    message_history=message_history,
                    deferred_tool_results=deferred_tool_results,
                    # Need to pass `wrapped_model` here vs in
                    # `self.wrapped.override` above so that if a
                    # caller has an outer `agent.override(model=...)`
                    # it will still win (and we'll have already
                    # wrapped it there).
                    model=wrapped_model,
                    instructions=instructions,
                    deps=deps,
                    model_settings=model_settings,
                    usage_limits=usage_limits,
                    usage=usage,
                    metadata=metadata,
                    infer_name=infer_name,
                    builtin_tools=builtin_tools,
                    spec=spec,
                ) as run:
                    yield run

    # See `run`'s @overload above for why the `[override]`
    # suppression is needed here.
    @overload  # type: ignore[override]
    def run_stream(
        self,
        context: WorkflowContext,
        user_prompt: str | Sequence[pydantic_ai.messages.UserContent] |
        None = None,
        *,
        output_type: None = None,
        message_history: Sequence[pydantic_ai.messages.ModelMessage] |
        None = None,
        deferred_tool_results: DeferredToolResults | None = None,
        model: pydantic_ai.models.Model | pydantic_ai.models.KnownModelName |
        str | None = None,
        instructions: AgentInstructions[AgentDepsT] = None,
        deps: AgentDepsT = None,  # type: ignore[assignment]
        model_settings: AgentModelSettings[AgentDepsT] | None = None,
        usage_limits: pydantic_ai.usage.UsageLimits | None = None,
        usage: pydantic_ai.usage.RunUsage | None = None,
        metadata: AgentMetadata[AgentDepsT] | None = None,
        infer_name: bool = True,
        toolsets: Sequence[AbstractToolset[AgentDepsT]] | None = None,
        builtin_tools: Sequence[AgentBuiltinTool[AgentDepsT]] | None = None,
        event_stream_handler: EventStreamHandler[AgentDepsT] | None = None,
        spec: dict[str, Any] | Any = None,
        variant: str | None = None,
    ) -> AbstractAsyncContextManager[StreamedRunResult[AgentDepsT, OutputDataT]
                                    ]:
        ...

    @overload
    def run_stream(
        self,
        context: WorkflowContext,
        user_prompt: str | Sequence[pydantic_ai.messages.UserContent] |
        None = None,
        *,
        output_type: OutputSpec[RunOutputDataT],
        message_history: Sequence[pydantic_ai.messages.ModelMessage] |
        None = None,
        deferred_tool_results: DeferredToolResults | None = None,
        model: pydantic_ai.models.Model | pydantic_ai.models.KnownModelName |
        str | None = None,
        instructions: AgentInstructions[AgentDepsT] = None,
        deps: AgentDepsT = None,  # type: ignore[assignment]
        model_settings: AgentModelSettings[AgentDepsT] | None = None,
        usage_limits: pydantic_ai.usage.UsageLimits | None = None,
        usage: pydantic_ai.usage.RunUsage | None = None,
        metadata: AgentMetadata[AgentDepsT] | None = None,
        infer_name: bool = True,
        toolsets: Sequence[AbstractToolset[AgentDepsT]] | None = None,
        builtin_tools: Sequence[AgentBuiltinTool[AgentDepsT]] | None = None,
        event_stream_handler: EventStreamHandler[AgentDepsT] | None = None,
        spec: dict[str, Any] | Any = None,
        variant: str | None = None,
    ) -> AbstractAsyncContextManager[StreamedRunResult[AgentDepsT,
                                                       RunOutputDataT]]:
        ...

    @asynccontextmanager
    async def run_stream(
        self,
        # We always require a `WorkflowContext` here, but to
        # override the supertype's signature (which has
        # `user_prompt` as the first positional) we have to
        # type this permissively. We raise a clear `UserError`
        # at runtime if the caller passes something other than
        # a `WorkflowContext`.
        context: WorkflowContext | str |
        Sequence[pydantic_ai.messages.UserContent] | None = None,
        user_prompt: str | Sequence[pydantic_ai.messages.UserContent] | None = None,
        *,
        output_type: OutputSpec[RunOutputDataT] | None = None,
        message_history: Sequence[pydantic_ai.messages.ModelMessage] | None = None,
        deferred_tool_results: DeferredToolResults | None = None,
        model: pydantic_ai.models.Model | pydantic_ai.models.KnownModelName | str | None = None,
        instructions: AgentInstructions[AgentDepsT] = None,
        deps: AgentDepsT = None,  # type: ignore[assignment]
        model_settings: AgentModelSettings[AgentDepsT] | None = None,
        usage_limits: pydantic_ai.usage.UsageLimits | None = None,
        usage: pydantic_ai.usage.RunUsage | None = None,
        metadata: AgentMetadata[AgentDepsT] | None = None,
        infer_name: bool = True,
        toolsets: Sequence[AbstractToolset[AgentDepsT]] | None = None,
        builtin_tools: Sequence[AgentBuiltinTool[AgentDepsT]] | None = None,
        event_stream_handler: EventStreamHandler[AgentDepsT] | None = None,
        spec: dict[str, Any] | Any = None,
        variant: str | None = None,
    ) -> AsyncIterator[StreamedRunResult[AgentDepsT, Any]]:
        context = self._validate_context(context, method="run_stream")
        wrapped_model = self._wrap_model_or_default(model)
        async with _agent_run(
            context,
            agent_name=self._name,
            user_prompt=user_prompt,
            variant=variant,
            message_history=message_history,
            instructions=getattr(self.wrapped, "_instructions", ()),
            system_prompts=getattr(self.wrapped, "_system_prompts", ()),
            model_id=wrapped_model.model_id if wrapped_model else None,
            run_instructions=instructions,
            run_toolsets=toolsets,
            run_builtin_tools=builtin_tools,
            run_model_settings=model_settings,
            run_output_type=output_type,
            run_deferred_tool_results=deferred_tool_results,
        ):
            with self.wrapped.override(
                # Need to override `toolsets` vs passing them along
                # below because passing them along below is treated as
                # additive whereas we need a full replacement so every
                # tool call dispatches through `_WrapperToolset`.
                toolsets=self._wrap_toolsets(additional_toolsets=toolsets),
                tools=[],
            ), self.wrapped.parallel_tool_call_execution_mode(
                self._parallel_execution_mode,
            ):
                async with self.wrapped.run_stream(
                    user_prompt,
                    output_type=output_type,
                    message_history=message_history,
                    deferred_tool_results=deferred_tool_results,
                    # Need to pass `wrapped_model` here vs in
                    # `self.wrapped.override` above so that if a
                    # caller has an outer `agent.override(model=...)`
                    # it will still win (and we'll have already
                    # wrapped it there).
                    model=wrapped_model,
                    instructions=instructions,
                    deps=deps,
                    model_settings=model_settings,
                    usage_limits=usage_limits,
                    usage=usage,
                    metadata=metadata,
                    infer_name=infer_name,
                    builtin_tools=builtin_tools,
                    event_stream_handler=event_stream_handler,
                    spec=spec,
                ) as stream_result:
                    # The underlying model call goes through
                    # `Model.request_stream`, so the live stream is fully
                    # drained inside an `at_least_once` block and the
                    # final `ModelResponse` is memoized. The
                    # `StreamedRunResult` yielded here is backed by a
                    # `CompletedStreamedResponse`: iterating it returns
                    # the cached response all at once instead of
                    # token-by-token.
                    yield stream_result

    # See `run`'s @overload above for why the `[override]`
    # suppression is needed here.
    @overload  # type: ignore[override]
    def run_stream_events(
        self,
        context: WorkflowContext,
        user_prompt: str | Sequence[pydantic_ai.messages.UserContent] |
        None = None,
        *,
        output_type: None = None,
        message_history: Sequence[pydantic_ai.messages.ModelMessage] |
        None = None,
        deferred_tool_results: DeferredToolResults | None = None,
        model: pydantic_ai.models.Model | pydantic_ai.models.KnownModelName |
        str | None = None,
        instructions: AgentInstructions[AgentDepsT] = None,
        deps: AgentDepsT = None,  # type: ignore[assignment]
        model_settings: AgentModelSettings[AgentDepsT] | None = None,
        usage_limits: pydantic_ai.usage.UsageLimits | None = None,
        usage: pydantic_ai.usage.RunUsage | None = None,
        metadata: AgentMetadata[AgentDepsT] | None = None,
        infer_name: bool = True,
        toolsets: Sequence[AbstractToolset[AgentDepsT]] | None = None,
        builtin_tools: Sequence[AgentBuiltinTool[AgentDepsT]] | None = None,
        spec: dict[str, Any] | Any = None,
        variant: str | None = None,
    ) -> AsyncIterator[pydantic_ai.messages.AgentStreamEvent |
                       AgentRunResultEvent[OutputDataT]]:
        ...

    @overload
    def run_stream_events(
        self,
        context: WorkflowContext,
        user_prompt: str | Sequence[pydantic_ai.messages.UserContent] |
        None = None,
        *,
        output_type: OutputSpec[RunOutputDataT],
        message_history: Sequence[pydantic_ai.messages.ModelMessage] |
        None = None,
        deferred_tool_results: DeferredToolResults | None = None,
        model: pydantic_ai.models.Model | pydantic_ai.models.KnownModelName |
        str | None = None,
        instructions: AgentInstructions[AgentDepsT] = None,
        deps: AgentDepsT = None,  # type: ignore[assignment]
        model_settings: AgentModelSettings[AgentDepsT] | None = None,
        usage_limits: pydantic_ai.usage.UsageLimits | None = None,
        usage: pydantic_ai.usage.RunUsage | None = None,
        metadata: AgentMetadata[AgentDepsT] | None = None,
        infer_name: bool = True,
        toolsets: Sequence[AbstractToolset[AgentDepsT]] | None = None,
        builtin_tools: Sequence[AgentBuiltinTool[AgentDepsT]] | None = None,
        spec: dict[str, Any] | Any = None,
        variant: str | None = None,
    ) -> AsyncIterator[pydantic_ai.messages.AgentStreamEvent |
                       AgentRunResultEvent[RunOutputDataT]]:
        ...

    async def run_stream_events(
        self,
        # We always require a `WorkflowContext` here, but to
        # override the supertype's signature (which has
        # `user_prompt` as the first positional) we have to
        # type this permissively. We raise a clear `UserError`
        # at runtime if the caller passes something other than
        # a `WorkflowContext`.
        context: WorkflowContext | str |
        Sequence[pydantic_ai.messages.UserContent] | None = None,
        user_prompt: str | Sequence[pydantic_ai.messages.UserContent] | None = None,
        *,
        output_type: OutputSpec[RunOutputDataT] | None = None,
        message_history: Sequence[pydantic_ai.messages.ModelMessage] | None = None,
        deferred_tool_results: DeferredToolResults | None = None,
        model: pydantic_ai.models.Model | pydantic_ai.models.KnownModelName | str | None = None,
        instructions: AgentInstructions[AgentDepsT] = None,
        deps: AgentDepsT = None,  # type: ignore[assignment]
        model_settings: AgentModelSettings[AgentDepsT] | None = None,
        usage_limits: pydantic_ai.usage.UsageLimits | None = None,
        usage: pydantic_ai.usage.RunUsage | None = None,
        metadata: AgentMetadata[AgentDepsT] | None = None,
        infer_name: bool = True,
        toolsets: Sequence[AbstractToolset[AgentDepsT]] | None = None,
        builtin_tools: Sequence[AgentBuiltinTool[AgentDepsT]] | None = None,
        spec: dict[str, Any] | Any = None,
        variant: str | None = None,
    ) -> AsyncIterator[pydantic_ai.messages.AgentStreamEvent | AgentRunResultEvent[Any]]:
        context = self._validate_context(context, method="run_stream_events")
        wrapped_model = self._wrap_model_or_default(model)
        async with _agent_run(
            context,
            agent_name=self._name,
            user_prompt=user_prompt,
            variant=variant,
            message_history=message_history,
            instructions=getattr(self.wrapped, "_instructions", ()),
            system_prompts=getattr(self.wrapped, "_system_prompts", ()),
            model_id=wrapped_model.model_id if wrapped_model else None,
            run_instructions=instructions,
            run_toolsets=toolsets,
            run_builtin_tools=builtin_tools,
            run_model_settings=model_settings,
            run_output_type=output_type,
            run_deferred_tool_results=deferred_tool_results,
        ):
            with self.wrapped.override(
                # Need to override `toolsets` vs passing them along
                # below because passing them along below is treated as
                # additive whereas we need a full replacement so every
                # tool call dispatches through `_WrapperToolset`.
                toolsets=self._wrap_toolsets(additional_toolsets=toolsets),
                tools=[],
            ), self.wrapped.parallel_tool_call_execution_mode(
                self._parallel_execution_mode,
            ):
                async for event in self.wrapped.run_stream_events(
                    user_prompt,
                    output_type=output_type,
                    message_history=message_history,
                    deferred_tool_results=deferred_tool_results,
                    # Need to pass `wrapped_model` here vs in
                    # `self.wrapped.override` above so that if a
                    # caller has an outer `agent.override(model=...)`
                    # it will still win (and we'll have already
                    # wrapped it there).
                    model=wrapped_model,
                    instructions=instructions,
                    deps=deps,
                    model_settings=model_settings,
                    usage_limits=usage_limits,
                    usage=usage,
                    metadata=metadata,
                    infer_name=infer_name,
                    builtin_tools=builtin_tools,
                    spec=spec,
                ):
                    yield event

    # We're not bothering to keep all of args and kwargs in sync so we
    # need this type supression.
    def run_sync(  # type: ignore[override]
        self,
        *args: Any,
        **kwargs: Any,
    ) -> AgentRunResult[Any]:
        raise UserError(
            "`Agent.run_sync` is not supported: a "
            "Reboot workflow method is always async, so call "
            "`await agent.run(context, ...)` instead."
        )

    # We're not bothering to keep all of args and kwargs in sync so we
    # need this type supression.
    def run_stream_sync(  # type: ignore[override]
        self,
        *args: Any,
        **kwargs: Any,
    ) -> Any:
        raise UserError(
            "`Agent.run_stream_sync` is not "
            "supported: a Reboot workflow method is always async, "
            "so use `async with agent.run_stream(context, ...) as "
            "result:` instead."
        )
