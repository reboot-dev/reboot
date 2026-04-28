from __future__ import annotations

import functools
import inspect
import pydantic_ai.tools
import typing
from ._run import _require_workflow_context
from ._typing import AgentDepsT, ToolParams
from collections.abc import Callable, Sequence
from pydantic_ai._run_context import RunContext
from pydantic_ai.exceptions import UserError
from pydantic_ai.messages import InstructionPart
from pydantic_ai.tools import ToolDefinition
from pydantic_ai.toolsets.abstract import AbstractToolset, ToolsetTool
from pydantic_ai.toolsets.wrapper import WrapperToolset
from reboot.aio.contexts import WorkflowContext
from reboot.aio.workflows import at_least_once
from typing import Any, Concatenate, Optional, TypeAlias, cast, get_origin

# NOTE: this file is using the `T | None` style for optional types
# instead of `Optional[T]` because that is how pydantic_ai does it and
# a lot of the code here is copied from their repository and we'd like
# to keep it consistent as we update it and keep it in sync with the
# upstream pydantic_ai library.

# Mirrors `pydantic_ai.tools.ToolFuncContext` but with a leading
# `WorkflowContext` parameter, matching the signature accepted by
# `Agent.tool`.
ToolFuncContext: TypeAlias = Callable[
    Concatenate[WorkflowContext, RunContext[AgentDepsT], ToolParams],
    Any,
]

# `Agent.tool_plain` accepts the same shape as
# `pydantic_ai.Agent.tool_plain`, so we just point at pydantic_ai's
# alias rather than maintaining our own copy.
ToolFuncPlain = pydantic_ai.tools.ToolFuncPlain


class _WrapperToolset(WrapperToolset[AgentDepsT]):
    """An `AbstractToolset` wrapper that intercepts every tool invocation
    and runs it inside a Reboot `at_least_once(...)` and
    `context.idempotency_seeds(...)` so that completed tools aren't
    re-run on workflow replay (but ARE re-run during effect
    validation, to expose non-determinism / undeclared side effects).

    All three pydantic_ai tool registration paths (`@agent.tool`,
    `tools=`, `toolsets=`) converge at
    `AbstractToolset.call_tool`, so wrapping every leaf toolset
    intercepts every tool call -- including parallel ones
    dispatched via `asyncio.create_task`.

    Per-call disambiguation uses
    `(tool_name, tool_call_id, run_step)` from the active
    `RunContext`. `tool_call_id` is effectively deterministic on
    replay because the upstream `Model.request` already memoizes
    the entire `ModelResponse`, so the cached response carries the
    same `tool_call_id` even when pydantic_ai's
    `guard_tool_call_id` had to fill one in.
    """

    async def call_tool(
        self,
        name: str,
        tool_args: dict[str, Any],
        run: RunContext[AgentDepsT],
        tool: ToolsetTool[AgentDepsT],
    ) -> Any:
        context = _require_workflow_context()
        with context.idempotency_seeds(
            {
                "tool_name": name,
                "tool_call_id": run.tool_call_id,
                "run_step": run.run_step,
            }
        ):

            async def call() -> Any:
                return await self.wrapped.call_tool(name, tool_args, run, tool)

            # `at_least_once` infers `type` from `call`'s return
            # annotation. `Any` becomes `object` at the runtime
            # check, which is what we want -- a tool can return
            # anything pickle-able.
            return await at_least_once(
                f"Tool call for step #{run.run_step}",
                context,
                call,
            )

    def visit_and_replace(
        self,
        visitor: Callable[[AbstractToolset[AgentDepsT]],
                          AbstractToolset[AgentDepsT]],
    ) -> AbstractToolset[AgentDepsT]:
        # We never expose our internal `_WrapperToolset` and we don't
        # expect it to be wrapped further, so for now we just treat
        # any subsequent calls to visit and replace as a no-op.
        return self


# Lazily-imported MCP toolset classes. Both `pydantic_ai.mcp` and
# `pydantic_ai.toolsets.fastmcp` are optional pydantic_ai extras, so
# we can't depend on them being importable. We pin the import to
# module load time and let the dispatch below skip detection when
# either is absent.
try:
    from pydantic_ai.mcp import MCPServer
except ImportError:
    MCPServer = None  # type: ignore[assignment, misc]
try:
    from pydantic_ai.toolsets.fastmcp import FastMCPToolset
except ImportError:
    FastMCPToolset = None  # type: ignore[assignment, misc]


class _MCPWrapperToolset(_WrapperToolset[AgentDepsT]):
    """Variant of `_WrapperToolset` for MCP-typed toolsets
    (`pydantic_ai.mcp.MCPServer`,
    `pydantic_ai.toolsets.fastmcp.FastMCPToolset`). On top of the
    `call_tool` wrapping that `_WrapperToolset` already does, also
    routes `get_tools` and `get_instructions` through `at_least_once`.
    """

    def __init__(self, wrapped: AbstractToolset[AgentDepsT]) -> None:
        super().__init__(wrapped)
        # Wrapper-level cache for `get_tools` results; populated
        # on first fetch when `wrapped.cache_tools` is true.
        #
        # We do our own caching because `MCPServer` only caches
        # _within_ an `async with ...` block and we don't use those,
        # see comments for `__aenter__` and `__aexit__`.
        #
        # Technically we don't need to do this for correctness but the
        # other durable execution implementations do so we followed suit.
        self._cached_tool_defs: Optional[dict[str, ToolDefinition]] = None

    @property
    def id(self) -> str | None:
        # `WrapperToolset.id` returns `None` by default; surface
        # the wrapped MCP toolset's `id` so the `at_least_once`
        # aliases below disambiguate per MCP server.
        return self.wrapped.id

    # No-op (vs. `WrapperToolset.__aenter__` which forwards to
    # `wrapped`) so the run-level `async with toolset:` doesn't
    # open a connection that has to span replays/retries.
    async def __aenter__(self) -> "_MCPWrapperToolset[AgentDepsT]":
        return self

    # Paired with `__aenter__` above: keep the wrapped
    # connection lifecycle out of the run-level scope.
    async def __aexit__(self, *args: Any) -> Optional[bool]:
        return None

    def _tool_for_tool_def(
        self,
        tool_def: ToolDefinition,
    ) -> ToolsetTool[AgentDepsT]:
        # `tool_for_tool_def` is declared on `MCPServer` (`mcp.py`)
        # and `FastMCPToolset` (`toolsets/fastmcp.py`) but NOT on the
        # `AbstractToolset` base type which is the type of
        # `self.wrapped`, so we need a `cast` to call it. Cast the
        # return too: `MCPServer.tool_for_tool_def` is typed
        # `ToolsetTool[Any]` and `FastMCPToolset`'s is
        # `ToolsetTool[AgentDepsT]`, so the union (over both
        # branches) doesn't unify with our wrapper's
        # `ToolsetTool[AgentDepsT]` return type.
        wrapped = cast("MCPServer | FastMCPToolset", self.wrapped)
        return cast(
            "ToolsetTool[AgentDepsT]",
            wrapped.tool_for_tool_def(tool_def),
        )

    async def get_tools(
        self,
        run: RunContext[AgentDepsT],
    ) -> dict[str, ToolsetTool[AgentDepsT]]:
        wrapped = self.wrapped
        # When the user wants tool-list caching, short-circuit before
        # `at_least_once`: pydantic_ai documents `cache_tools=True`
        # (the default) in durable execution as "fetched once and
        # cached for the duration of the workflow run, not invalidated
        # by `tools/list_changed` notifications" (see
        # `pydantic_ai.mcp.MCPServer`'s `cache_tools` docstring). The
        # wrapped MCP server's own `_cached_tools` doesn't survive
        # across our memoized fetches because it is only valid within
        # an `async with ...` block and we short-circuit `__aenter__`
        # / `__aexit__`.
        #
        # We use `getattr(wrapped, "cache_tools", False)` rather than
        # reading `wrapped.cache_tools` directly because only
        # `MCPServer` defines `cache_tools`, `FastMCPToolset` doesn't.
        cache_tools = getattr(wrapped, "cache_tools", False)

        if cache_tools and self._cached_tool_defs is not None:
            return {
                name: self._tool_for_tool_def(tool_def)
                for name, tool_def in self._cached_tool_defs.items()
            }

        context = _require_workflow_context()

        async def fetch() -> dict[str, ToolDefinition]:
            tools = await wrapped.get_tools(run)
            # Strip down to bare `ToolDefinition`s before
            # `at_least_once` memoizes the result because a
            # `ToolsetTool` includes a `SchemaValidator` (the same one
            # for every MCP tool) which is not pickleable. The
            # `ToolsetTool`s are reconstructed below via
            # `tool_for_tool_def`.
            return {name: tool.tool_def for name, tool in tools.items()}

        tool_defs = await at_least_once(
            f"MCP get_tools for {self.id} step #{run.run_step}",
            context,
            fetch,
        )

        if cache_tools:
            self._cached_tool_defs = tool_defs

        # Reconstruct the `ToolsetTool`s outside the `at_least_once`
        # because `fetch()` stripped them to bare `ToolDefinition`s so
        # that we could pickle.  The wrapped toolset's
        # `tool_for_tool_def` re-attaches the `SchemaValidator` that
        # callers downstream of `get_tools` expect.
        return {
            name: self._tool_for_tool_def(tool_def)
            for name, tool_def in tool_defs.items()
        }

    async def get_instructions(
        self,
        run: RunContext[AgentDepsT],
    ) -> str | InstructionPart | Sequence[str | InstructionPart] | None:
        wrapped = self.wrapped

        # `MCPServer` and `FastMCPToolset` both short-circuit to
        # `None` when `include_instructions=False`, so skip the
        # `at_least_once` in that case.
        #
        # Other durable execution implementations do this so we are as
        # well.
        if not getattr(wrapped, "include_instructions", False):
            return None

        context = _require_workflow_context()

        # pydantic_ai considers instructions "dynamic since they may
        # change between connections" and there's no
        # `cache_instructions` toggle (so no wrapper-level cache like
        # for `get_tools`) so we need to fetch each time!
        async def fetch(
        ) -> str | InstructionPart | Sequence[str | InstructionPart] | None:
            # NOTE: most methods on `MCPServer` and `FastMCPToolset`
            # do not need to be entered but `get_instructions` is an
            # exception hence the `async with wrapped` here!
            async with wrapped:
                return await wrapped.get_instructions(run)

        return await at_least_once(
            f"MCP get_instructions for {self.id} step #{run.run_step}",
            context,
            fetch,
        )


def _make_toolset_wrapper(
) -> Callable[[AbstractToolset[AgentDepsT]], AbstractToolset[AgentDepsT]]:
    """Build a `visit_and_replace`-compatible callback that wraps each
    toolset in the right Reboot wrapper: `_MCPWrapperToolset` for MCP
    toolsets (so `get_tools` / `get_instructions` / `call_tool` all
    flow through `at_least_once`) and the plain `_WrapperToolset` for
    everything else (where only `call_tool` needs memoization since
    `get_tools` / `get_instructions` are pure local lookups).

    Returns a callable that remembers across each invocation whether
    there has been more than one MCP toolset whose `id` is `None` and
    raises `UserError` if so. The `at_least_once` aliases for
    `get_tools` / `get_instructions` embed `self.id` to disambiguate
    per MCP toolset, so two toolsets without an `id` in the same agent
    run would silently clobber each other on replay. A single server
    without an `id` is fine.
    """
    seen_mcp_toolset_without_id: bool = False

    def wrap(
        toolset: AbstractToolset[AgentDepsT],
    ) -> AbstractToolset[AgentDepsT]:
        nonlocal seen_mcp_toolset_without_id
        is_mcp = (
            (MCPServer is not None and isinstance(toolset, MCPServer)) or (
                FastMCPToolset is not None and
                isinstance(toolset, FastMCPToolset)
            )
        )
        if is_mcp:
            if toolset.id is None:
                if seen_mcp_toolset_without_id:
                    raise UserError(
                        "Found more than one MCP toolset without an `id`. "
                        "Reboot uses each MCP toolset's `id` to "
                        "disambiguate `get_tools` / "
                        "`get_instructions` / `call_tool` results "
                        "across workflow replays. Pass `id=...` to all "
                        "but at most one of your MCP toolsets (or "
                        "for `MCPServer`, `tool_prefix=...`, which "
                        "doubles as the id when `id=` isn't set)."
                    )
                seen_mcp_toolset_without_id = True
            return _MCPWrapperToolset(toolset)
        return _WrapperToolset(toolset)

    return wrap


def _wrap_tool_function(function: Any) -> Any:
    """Build a pydantic_ai-compatible wrapper around a Reboot tool
    function whose first two parameters are a `WorkflowContext` and a
    `RunContext`.

    The wrapper exposes a signature with the leading `WorkflowContext`
    parameter dropped, so pydantic_ai's `RunContext`-detection and
    JSON-schema generation see the user's intended pydantic_ai surface
    (`(run: RunContext[Deps], …)`). At call time the wrapper retrieves
    the active `WorkflowContext` from `_require_workflow_context()`
    and forwards `(workflow_context, *args, **kwargs)` to the original
    function.

    The Reboot type system (`ToolFuncContext`) already enforces the
    full `(WorkflowContext, RunContext[Deps], ...)` type signature
    statically, but here we ensure at runtime that this is the case:
    parameter count first, then annotations on the first two
    parameters whenever the user supplied them. Unannotated
    parameters are accepted on faith.
    """
    signature = inspect.signature(function)
    parameters = list(signature.parameters.values())
    if len(parameters) < 2:
        raise TypeError(
            f"`{function.__name__}` must accept "
            "`context: WorkflowContext` and `run: RunContext[Deps]` "
            "as its first two parameters when registered via "
            "`Agent.tool`; for tools that don't need a "
            "`RunContext`, use `Agent.tool_plain` instead."
        )

    # Resolve annotations once via `typing.get_type_hints` so
    # string forward references (`from __future__ import
    # annotations` style) are evaluated. If resolution fails for
    # any reason, fall back to the raw annotation values.
    try:
        type_hints = typing.get_type_hints(function)
    except Exception:
        type_hints = {}

    first_annotation = type_hints.get(
        parameters[0].name, parameters[0].annotation
    )
    if first_annotation is not inspect.Parameter.empty and not (
        first_annotation is WorkflowContext or (
            isinstance(first_annotation, type) and
            issubclass(first_annotation, WorkflowContext)
        )
    ):
        raise TypeError(
            f"`{function.__name__}`'s first parameter is annotated "
            f"as '{first_annotation}', but `Agent.tool` requires "
            "it to be `context: WorkflowContext`."
        )

    second_annotation = type_hints.get(
        parameters[1].name, parameters[1].annotation
    )
    if second_annotation is not inspect.Parameter.empty and not (
        second_annotation is RunContext or
        get_origin(second_annotation) is RunContext
    ):
        raise TypeError(
            f"`{function.__name__}`'s second parameter is "
            f"annotated as '{second_annotation}', but `Agent.tool` "
            "requires it to be `run: RunContext[Deps]`. For tools "
            "that don't need a `RunContext`, use "
            "`Agent.tool_plain` instead."
        )

    @functools.wraps(function)
    async def wrapper(*args: Any, **kwargs: Any) -> Any:
        return await function(_require_workflow_context(), *args, **kwargs)

    wrapper.__signature__ = signature.replace(  # type: ignore[attr-defined]
        parameters=parameters[1:]
    )

    return wrapper
