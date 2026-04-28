from __future__ import annotations

import dataclasses
import hashlib
import logging
import pickle
import uuid
from collections.abc import AsyncIterator, Sequence
from contextlib import asynccontextmanager
from contextvars import ContextVar
from pydantic_ai._run_context import get_current_run_context
from pydantic_ai.exceptions import UserError
from pydantic_ai.messages import ModelMessage, UserContent
from reboot.aio.contexts import WorkflowContext
from reboot.aio.workflows import at_least_once
from typing import Any, Optional

# NOTE: this file is using the `T | None` style for optional types
# instead of `Optional[T]` because that is how pydantic_ai does it and
# a lot of the code here is copied from their repository and we'd like
# to keep it consistent as we update it and keep it in sync with the
# upstream pydantic_ai library.

logger = logging.getLogger(__name__)

# The active `WorkflowContext` for the current agent run. Stored in
# a `ContextVar` so the wrapped pydantic_ai stack can pick it up
# from inside `Model.request` without explicit plumbing through
# every model call. The model-call sequence number ("step") is
# read directly from `pydantic_ai.get_current_run_context().run_step`,
# which pydantic_ai bumps once per turn before each model request,
# so we don't keep our own counter.
_workflow_context: ContextVar[Optional[WorkflowContext]] = ContextVar(
    "`WorkflowContext` for the current agent run",
    default=None,
)


def _require_workflow_context() -> WorkflowContext:
    context = _workflow_context.get()
    if context is None:
        raise UserError(
            "Did you forget to call `Agent.run(context, ...)`, "
            "`Agent.iter(context, ...)`, `Agent.run_stream(context, "
            "...)`, or `Agent.run_stream_events(context, ...)`?"
        )
    return context


def _current_run_step() -> int:
    """Return the `run_step` of the active pydantic_ai `RunContext`.

    pydantic_ai installs the active `RunContext` via a `ContextVar`
    before every `Model.request` / `Model.request_stream` call (see
    `pydantic_ai._agent_graph.ModelRequestNode._make_request`), and
    bumps `run_step` exactly once per turn inside
    `_prepare_request`. Use it as the per-turn sequence number for
    memoization aliases so successive operations in a single agent
    run memoize under distinct keys.
    """
    run = get_current_run_context()
    if run is None:
        raise UserError(
            "No active pydantic_ai `RunContext`: this helper must "
            "be called from within an agent run (e.g., `Model.request`, "
            "a tool function, or a dynamic instruction callable)."
        )
    return run.run_step


@dataclasses.dataclass
class _AgentRuns:
    """The set of `(name, user_prompt, variant, message_history)`
    tuples we've already invoked in a single workflow attempt, split
    by scope. Used to refuse duplicate `Agent.run` calls (sequential
    or concurrent).

    `per_workflow` covers calls made directly in the workflow method
    body, outside any control loop. Entries live until the workflow
    method completes.

    `per_iteration` covers calls made inside the current control-
    loop iteration. Only one iteration is ever executing at a time
    on a given workflow context, so a single set is sufficient --
    when an iteration completes, we just clear the set.
    """
    per_workflow: set[tuple[Any, ...]] = dataclasses.field(
        default_factory=set,
    )
    per_iteration: set[tuple[Any, ...]] = dataclasses.field(
        default_factory=set,
    )


# Per-workflow tracking dict, populated lazily on first
# `_agent_run` entry for a given `WorkflowContext`. Cleaned up via
# two callbacks registered on the `WorkflowContext` the first time
# `_agent_run` is entered for it:
#
# - `on_iteration_complete`: clears the `per_iteration` set so a
#   long-running loop's per-iteration tracking doesn't accumulate.
#
# - `on_method_complete`: drops the entire workflow entry when the
#   workflow method finishes (succeeded or raised).
_agent_runs: dict[uuid.UUID, _AgentRuns] = {}


@dataclasses.dataclass(kw_only=True)
class _Digests:
    """Snapshot of an agent run's configuration captured at the
    start of the run, memoized via `at_least_once` so we can warn
    on replay when any field has changed. Each field is an opaque
    digest string except `model_id`, which is the human-readable
    identifier (e.g. `"anthropic:claude-sonnet-4-5"`) so warnings
    can name both the original and current models.

    Stored as a dataclass rather than a tuple so we can add or
    remove fields in the future without breaking the
    `at_least_once` slot's pickle compatibility:

    - **Adding a field** is safe. `pickle` restores instances by
      writing the saved `__dict__` directly, so an old memoized
      `_Digests` deserializes without the new attribute. The
      comparison loop reads via
      `getattr(memoized, field, None)`, so a missing field
      surfaces as `None` and is skipped (no false-positive
      warning).
    - **Removing a field** is safe. The dropped attribute is
      restored onto the instance from the pickle payload but is
      simply ignored: the comparison loop iterates
      `_DIGEST_FIELD_LABELS`, which we keep in sync with the
      class definition, so absent labels mean absent checks.

    `kw_only=True` keeps construction call-sites stable as fields
    come and go: every site uses keyword arguments, so adding /
    reordering fields can never silently shift positional
    bindings.
    """
    # Captured from the agent's static configuration.
    instructions: str
    system_prompts: str
    model_id: str
    # Captured from the per-call kwargs to `Agent.run` / `iter` /
    # `run_stream` / `run_stream_events`.
    run_instructions: str
    run_toolsets: str
    run_builtin_tools: str
    run_model_settings: str
    run_output_type: str
    run_deferred_tool_results: str


# `(field_name, human-readable label)` pairs used by
# `_agent_run` to produce targeted warnings when individual
# `_Digests` fields diverge between the original run and a
# replay. New fields added to `_Digests` should also be added
# here.
_DIGEST_FIELD_LABELS: tuple[tuple[str, str], ...] = (
    ("instructions", "static instructions"),
    ("system_prompts", "static system prompts"),
    ("model_id", "model"),
    ("run_instructions", "the `instructions=` argument"),
    ("run_toolsets", "the `toolsets=` argument"),
    ("run_builtin_tools", "the `builtin_tools=` argument"),
    ("run_model_settings", "the `model_settings=` argument"),
    ("run_output_type", "the `output_type=` argument"),
    ("run_deferred_tool_results", "the `deferred_tool_results=` argument"),
)


def _digest(value: Any, *, hint: str) -> str:
    """Return a stable digest of `value`. We use `pickle` not `repr`
    because the digest needs to be stable across processes (so replays
    in a different process can match the original run) and `repr` of
    arbitrary objects may embed memory addresses.

    This is best-effort only: we're expecting to only see values that
    don't change how they pickle from one run to the next. If pickling
    fails we re-raise as `UserError` with `hint` -- a caller-supplied,
    field-specific sentence pointing the user at the most likely fix
    -- so the runtime error names the problematic field rather than
    surfacing a bare `AttributeError: Can't pickle local object`.
    """
    try:
        # Pinned `protocol=4` so the digest is stable across Python
        # upgrades that might change `pickle.DEFAULT_PROTOCOL`.
        data = pickle.dumps(value, protocol=4)
    except Exception as exception:
        raise UserError(
            f"Could not compute a stable digest for the agent run: {hint} "
            f"(from {type(exception).__name__}: {exception})"
        ) from exception
    return hashlib.blake2b(data).hexdigest()


def _as_hashable(value: Any) -> Any:
    """Normalise a value to something usable as a `set` key.

    Lists and pydantic-ai message dataclasses aren't hashable; we
    fall back to `repr(...)` for those. Strings, scalars, and
    `None` pass through unchanged so the key preserves the
    distinction between "caller omitted" (`None`) and any actual
    value.

    This only needs to be deterministically hashable through the
    lifetime of a single process, which `repr(...)` satisifes.
    """
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return repr(value)


@asynccontextmanager
async def _agent_run(
    context: WorkflowContext,
    *,
    agent_name: str,
    user_prompt: str | Sequence[UserContent] | None,
    variant: str | None,
    message_history: Sequence[ModelMessage] | None,
    instructions: Any,
    system_prompts: Any,
    model_id: str | None,
    run_instructions: Any,
    run_toolsets: Any,
    run_builtin_tools: Any,
    run_model_settings: Any,
    run_output_type: Any,
    run_deferred_tool_results: Any,
) -> AsyncIterator[None]:
    """Install the active `WorkflowContext` for the duration of an
    `Agent.run` / `iter` / `run_stream` / `run_stream_events` call.

    Validates `user_prompt` and `variant` are not the empty string
    (which is almost always a programming error and is confusingly
    indistinguishable from a deliberately-empty alias slot in logs
    and traces).

    Allocates the per-workflow bucket in `_agent_runs` (and
    registers lifecycle callbacks on the `WorkflowContext` so the
    bucket gets cleaned up at iteration / method boundaries) on
    first encounter of a given workflow, then refuses duplicate
    `(agent_name, user_prompt, variant, message_history)` tuples in
    the same workflow / iteration -- both sequential and concurrent
    via `asyncio.gather`. The check-and-add is performed before any
    `await` so it is atomic under asyncio's cooperative scheduling.

    Opens a `context.idempotency_seeds(...)` block so every
    `Idempotency`-keyed call inside the agent run -- our own model
    requests *and* any `at_least_once` / idempotent method calls
    inside tools or dynamic instruction functions -- picks up the
    agent run's scope on its alias.

    Snapshots the agent's static `instructions` and `system_prompts`
    once at the start of the run via `at_least_once`. On replay we
    compare the memoized snapshot to the current one and log a
    warning if they differ -- a sign that the agent's static
    configuration has changed since the run was first executed and
    any previously memoized model responses may no longer reflect
    the current configuration.
    """
    if user_prompt == "":
        raise UserError(
            "`user_prompt` must not be an empty string; pass "
            "`None` (or omit the argument) if you want no user "
            "prompt."
        )
    if variant == "":
        raise UserError(
            "`variant` must not be an empty string; pass `None` "
            "(or omit the argument) instead."
        )

    if _workflow_context.get() is not None:
        raise UserError(
            "Nested agent runs are not supported: "
            "an `Agent.run` / `iter` / `run_stream` / "
            "`run_stream_events` call is already active."
        )

    workflow_id = context.workflow_id
    assert workflow_id is not None

    # Get or create the `_agent_runs` entry for this `workflow_id`.
    runs = _agent_runs.get(workflow_id)
    if runs is None:
        runs = _AgentRuns()
        _agent_runs[workflow_id] = runs

        def clear_per_iteration(*, iteration: int) -> None:
            runs = _agent_runs.get(workflow_id)
            assert runs is not None
            runs.per_iteration.clear()

        def delete(*, retrying: bool) -> None:
            # Using `del` to assert the invariant that we should have
            # an entry in `_agent_runs`.
            del _agent_runs[workflow_id]

        context.on_iteration_complete(clear_per_iteration)
        context.on_method_complete(delete)

    # Now ensure this run is unique.
    if context.workflow_iteration is not None:
        scope = runs.per_iteration
        scope_description = "control-loop iteration"
    else:
        scope = runs.per_workflow
        scope_description = "workflow method"

    run = (
        agent_name,
        _as_hashable(user_prompt),
        _as_hashable(variant),
        _as_hashable(message_history),
    )

    if run in scope:
        raise UserError(
            f"Duplicate agent run: `{agent_name}` has already been "
            "invoked with this `user_prompt`, `variant`, and "
            f"`message_history` in the current {scope_description}. "
            "Pass a distinct `variant=` to differentiate parallel or "
            "repeated calls, or change the `user_prompt` / "
            "`message_history`."
        )

    scope.add(run)

    _workflow_context.set(context)

    try:
        with context.idempotency_seeds(
            {
                "agent_name": agent_name,
                "agent_run_user_prompt": user_prompt,
                "agent_run_variant": variant,
                "agent_run_message_history": message_history,
            }
        ):
            # Take a single snapshot of the agent's configuration
            # at the start of the run -- both the agent's static
            # config and the per-call kwargs the user passed to
            # `Agent.run` / `iter` / `run_stream` /
            # `run_stream_events`. On replay any divergent field
            # produces a targeted warning identifying exactly what
            # changed.
            #
            # Each warning reflects a possible source of
            # non-determinism on replay. We've chosen to emit
            # warnings rather than raise so users can iterate on
            # their agents without breaking in-flight workflows;
            # if stricter behavior is wanted later we can hide
            # this behind a flag.
            digests = _Digests(
                # `instructions` and `run_instructions` mix strings
                # and callables in a single list, so we filter to
                # strings before digesting.
                instructions=_digest(
                    tuple(
                        instruction for instruction in (instructions or ())
                        if isinstance(instruction, str)
                    ),
                    hint=(
                        "the static `instructions=` you passed to "
                        "`Agent(...)` must be picklable -- only "
                        "string entries are digested, but at least "
                        "one string contained an unpicklable value."
                    ),
                ),
                # `system_prompts` is already strings-only
                # (pydantic_ai keeps callables in
                # `_system_prompt_functions` /
                # `_system_prompt_dynamic_functions`).
                system_prompts=_digest(
                    tuple(system_prompts or ()),
                    hint=(
                        "the `system_prompt=` you passed to "
                        "`Agent(...)` must be picklable strings."
                    ),
                ),
                model_id=model_id or "",
                run_instructions=_digest(
                    tuple(
                        instruction
                        for instruction in (run_instructions or ())
                        if isinstance(instruction, str)
                    ),
                    hint=(
                        "the per-run `instructions=` you passed to "
                        "`Agent.run` (or `iter` / `run_stream` / "
                        "`run_stream_events`) must be picklable -- "
                        "only string entries are digested, but at "
                        "least one string contained an unpicklable "
                        "value."
                    ),
                ),
                run_toolsets=_digest(
                    run_toolsets,
                    hint=(
                        "the per-run `toolsets=` you passed to "
                        "`Agent.run` (or `iter` / `run_stream` / "
                        "`run_stream_events`) must be picklable. "
                        "If you passed a `FunctionToolset(tools="
                        "[fn])`, define `fn` at module scope -- "
                        "local functions / closures can't be "
                        "pickled and would break cross-process "
                        "digest stability."
                    ),
                ),
                run_builtin_tools=_digest(
                    run_builtin_tools,
                    hint=(
                        "the per-run `builtin_tools=` you passed "
                        "to `Agent.run` (or `iter` / `run_stream` "
                        "/ `run_stream_events`) must be picklable."
                    ),
                ),
                run_model_settings=_digest(
                    run_model_settings,
                    hint=(
                        "the per-run `model_settings=` you passed "
                        "to `Agent.run` (or `iter` / `run_stream` "
                        "/ `run_stream_events`) must be picklable."
                    ),
                ),
                run_output_type=_digest(
                    run_output_type,
                    hint=(
                        "the per-run `output_type=` you passed to "
                        "`Agent.run` (or `iter` / `run_stream` / "
                        "`run_stream_events`) must be picklable. "
                        "Use a class defined at module scope."
                    ),
                ),
                run_deferred_tool_results=_digest(
                    run_deferred_tool_results,
                    hint=(
                        "the per-run `deferred_tool_results=` you "
                        "passed to `Agent.run` (or `iter` / "
                        "`run_stream` / `run_stream_events`) must "
                        "be picklable."
                    ),
                ),
            )

            async def snapshot() -> _Digests:
                return digests

            memoized_digests = await at_least_once(
                "Snapshot of the agent run configuration",
                context,
                snapshot,
                type=_Digests,
            )

            # Compare field-by-field. `getattr()` tolerates a memoized
            # snapshot that pre-dates a newly-added field (forward
            # compatibility): a missing field reads as `None`, which
            # we skip.
            for field_name, label in _DIGEST_FIELD_LABELS:
                digest = getattr(digests, field_name)
                memoized_digest = getattr(memoized_digests, field_name, None)
                if memoized_digest is None or memoized_digest == digest:
                    continue
                if field_name == "model_id":
                    logger.warning(
                        "*** POSSIBLE NON-DETERMINISM! *** "
                        f"Agent '{agent_name}': configured model "
                        f"'{digest}' differs from the model "
                        f"'{memoized_digest}' used when this agent "
                        "run was first executed; previously "
                        "memoized model responses came from a "
                        "different model and may not reflect what "
                        "the current model would produce."
                    )
                else:
                    logger.warning(
                        "*** POSSIBLE NON-DETERMINISM! *** "
                        f"Agent '{agent_name}': {label} differs "
                        "from the snapshot taken when this agent "
                        "run was first executed; previously "
                        "memoized model responses may no longer "
                        "reflect the current configuration."
                    )

            yield
    finally:
        _workflow_context.set(None)
