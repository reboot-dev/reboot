import collections.abc
import functools
import operator
import sys
import types
import typing
from reboot.aio.contexts import EffectValidation, WorkflowContext  # noqa: F401
from reboot.aio.idempotency import (  # noqa: F401
    ALWAYS,
    PER_ITERATION,
    PER_WORKFLOW,
    How,
)
from typing import (
    Any,
    Awaitable,
    Callable,
    Literal,
    Optional,
    Protocol,
    TypeAlias,
    TypeVar,
)

T = TypeVar('T')


# Sentinel used as the default for `type=` on the public memoize-based
# primitives (`at_least_once` and friends) so we can tell "the caller
# passed `type=` explicitly" apart from "the caller omitted `type=`
# and we should infer it from the callable's return annotation".
class _Unset:
    pass


_UNSET = _Unset()

# Public alias used as the `type=` parameter on `at_least_once` /
# `at_most_once` / `until` / `until_changes` / `until_per_workflow` /
# `at_least_once_per_workflow` / `at_most_once_per_workflow` and the
# generated `write(...)` family. Aliased to `Any` because Python
# 3.10-3.13 has no public, stable spelling that covers everything we
# want to accept: plain classes (`int`, `Foo`), PEP 604 unions (`int |
# str`), `typing.Union[...]` + `typing.Optional[...]` (whose runtime
# type is the private `typing._UnionGenericAlias`), and parameterized
# generics (`list[int]`, `typing.List[int]`, `dict[str, X]`). Python
# 3.14 promotes `typing.Union` to a proper type that subsumes most of
# these -- once we move to 3.14 we can sharpen this to something like
# `type | types.UnionType | typing.Union | types.GenericAlias`.
# `_resolve_callable_return_type` (via `_normalize_type`) collapses
# whatever the caller passes down to `TypeT` before it reaches
# `memoize`, so internal code stays on the tight form.
Type: TypeAlias = Any

# Internal post-normalization alias: what `memoize` and the runtime
# helpers (`_isinstance_type`, `_format_type`) see after
# `_normalize_type` has collapsed `typing.Union[...]` to PEP 604 and
# stripped parameterized generics down to their origin.
TypeT: TypeAlias = type | types.UnionType


def _normalize_type(t: Type) -> TypeT:
    """Collapse whatever the caller passed as `type=` into the narrower
    `TypeT = type | types.UnionType` so downstream code can rely on it
    exclusively.
    """
    # Need to use `Any` annotation for `origin` otherwise mypy's
    # overload-driven narrowing of `typing.get_origin(t: Any)` picks
    # `ParamSpec`-returning overloads and produces spurious
    # `comparison-overlap` errors below.
    origin: Any = typing.get_origin(t)
    # `typing.Union[A, B, ...]` (and `typing.Optional[A]`, which
    # is just `Union[A, None]`) are converted to PEP 604 unions
    # via `functools.reduce(operator.or_, ...)`.
    if origin is typing.Union:
        return functools.reduce(operator.or_, typing.get_args(t))
    # Parameterized generics like `list[int]`, `typing.List[int]`,
    # `dict[str, X]` are stripped to their origin (`list`, `dict`)
    # since `isinstance` can't accept the parameterized form. We lose
    # the parameter information, but the parameter would have been
    # ignored by `isinstance` anyway.
    if origin is not None and origin is not types.UnionType:
        return origin
    # Anything else (plain classes, PEP 604 unions) passes through
    # unchanged.
    return t


def _format_type(t: TypeT) -> str:
    """Render a type for inclusion in an error message. Returns the
    bare class name for plain classes (`int` -> `'int'`,
    `app.foo.Foo` -> `'Foo'`) and recurses through PEP 604 unions
    so custom-class members don't keep their module prefix:
    `str(Foo | Bar)` is `'app.foo.Foo | app.bar.Bar'`, but
    recursing produces `'Foo | Bar'`.
    """
    if isinstance(t, type):
        return t.__name__

    # `TypeT` should otherwise only be a PEP 604 union type.
    assert isinstance(t, types.UnionType)
    return ' | '.join(_format_type(arg) for arg in typing.get_args(t))


def _isinstance_type(t: TypeT) -> Any:
    """Returns the "type" necessary for passing to `isinstance`. This is
    necessary to both convert PEP 604 unions into tuples which
    `isinstance` expects for "unions" as well as to remove
    parameterized generics like `tuple[str, int]` which `isinstance`
    rejects with "Subscripted generics cannot be used with class and
    instance checks". Plain classes pass through unchanged.
    """
    if isinstance(t, types.UnionType):
        return tuple(_isinstance_type(arg) for arg in typing.get_args(t))
    # Parameterized generics like `list[int]` / `tuple[str, X]` can't
    # be passed to `isinstance`. Strip down to the origin.
    origin = typing.get_origin(t)
    if origin is not None:
        return origin
    return t


def _resolve_callable_return_type(
    callable: Callable[..., Any],
    explicit: Type | _Unset,
    *,
    default: TypeT = type(None),
) -> tuple[TypeT, bool]:
    """Decide what "type" `memoize()` should pass use to validate the
    `callable`'s return value. If the caller passed `type=`
    explicitly, honor it (after `_normalize_type` collapses it into
    `TypeT`). Otherwise inspect `callable`'s return annotation and
    fall back to `default` (typically `type(None)`, or `bool` for the
    `until` family) if there isn't one.

    Returns `(resolved, inferred)` where `inferred=True` means we got
    the type from the annotation rather than from the caller.
    `memoize()` uses this flag to tailor the error message it raises
    if the runtime value disagrees.
    """
    if not isinstance(explicit, _Unset):
        return _normalize_type(explicit), False

    try:
        hints = typing.get_type_hints(callable)
    except Exception:
        # Forward references that don't resolve, builtins
        # without annotations, etc. Fall back to the default.
        return default, True

    annotation = hints.get("return", default)

    # `typing.Any` isn't a runtime type that `isinstance` can
    # accept; treat it as `object` (which is "anything goes").
    if annotation is typing.Any:
        return object, True

    # For an async function with signature `async def fn() -> T:`,
    # `typing.get_type_hints` already returns `T` (not `Coroutine[Any,
    # Any, T]`). But if a user *explicitly* annotated the return as
    # `Coroutine[Any, Any, T]` or `Awaitable[T]` (legal at runtime
    # even if mypy would reject it), `get_type_hints` returns the
    # wrapper verbatim, and we need to just get `T`.
    origin = typing.get_origin(annotation)
    if origin in (collections.abc.Coroutine, collections.abc.Awaitable):
        args = typing.get_args(annotation)
        annotation = args[-1] if args else default

    if annotation is None:
        return type(None), True

    return _normalize_type(annotation), True


class Memoize(Protocol[T]):

    async def __call__(
        self,
        idempotency_alias_or_tuple: str | tuple[
            str,
            Literal["ALWAYS"] | Literal["PER_WORKFLOW"] |
            Literal["PER_ITERATION"],
        ],
        context: WorkflowContext,
        callable: Callable[[], Awaitable[T]],
        *,
        type_t: TypeT,
        type_t_inferred: bool,
        at_most_once: bool,
        until: bool = False,
        retryable_exceptions: Optional[list[type[Exception]]] = None,
        effect_validation: EffectValidation | None = None,
    ) -> T:
        ...


# NOTE: to break a circular dependency where the `memoize` function
# depends on generated code, e.g., an `_rbt.py` file, but the
# generated code also depends on `at_least_once()` from this file we
# need an extra level of indirection where we set `memoize` when we
# initialize an `Application`.
memoize: Optional[Memoize] = None


class AtMostOnceFailedBeforeCompleting(Exception):
    """Raised for any repeat attempts at performing an "at most once"
    operation that was started but didn't complete.
    """
    pass


AtMostLeastOnceTupleType: TypeAlias = tuple[
    str,
    Literal["PER_WORKFLOW"] | Literal["PER_ITERATION"],
]


async def at_most_once(
    idempotency_alias_or_tuple: str | AtMostLeastOnceTupleType,
    context: WorkflowContext,
    callable: Callable[[], Awaitable[T]],
    *,
    type: Type | _Unset = _UNSET,
    retryable_exceptions: Optional[list[type[Exception]]] = None,
) -> T:
    """Attempts to run and memoize the result of calling `callable` but
    only once.

    `type=` is optional: when omitted, `callable`'s return
    annotation is used. Falls back to `type(None)` if there's
    no annotation -- the runtime check in `memoize` will raise
    a clear error if the callable actually returns a non-`None`
    value in that case.

    NOTE: this is the Python wrapper for `reboot.memoize.v1` and as
    such uses `pickle` to serialize the result of calling `callable`
    which therefore must be pickle-able.
    """
    assert memoize is not None
    type_t, type_t_inferred = _resolve_callable_return_type(callable, type)
    try:
        return await memoize(
            idempotency_alias_or_tuple,
            context,
            callable,
            type_t=type_t,
            type_t_inferred=type_t_inferred,
            at_most_once=True,
            retryable_exceptions=retryable_exceptions,
        )
    except AtMostOnceFailedBeforeCompleting:
        print(
            "An exception was raised within `at_most_once("
            f"'{idempotency_alias_or_tuple if isinstance(idempotency_alias_or_tuple, str) else idempotency_alias_or_tuple[0]}', ...)` which will now forever "
            "more raise `AtMostOnceFailedBeforeCompleting`; "
            "to propagate failures from within an `at_most_once` "
            "please return a value instead!",
            file=sys.stderr,
        )
        raise


async def at_most_once_per_workflow(
    idempotency_alias: str,
    context: WorkflowContext,
    callable: Callable[[], Awaitable[T]],
    *,
    type: Type | _Unset = _UNSET,
    retryable_exceptions: Optional[list[type[Exception]]] = None,
) -> T:
    """Syntactic sugar for calling without an idempotency tuple."""
    return await at_most_once(
        (idempotency_alias, PER_WORKFLOW),
        context,
        callable,
        type=type,
        retryable_exceptions=retryable_exceptions,
    )


async def at_least_once(
    idempotency_alias_or_tuple: str | AtMostLeastOnceTupleType,
    context: WorkflowContext,
    callable: Callable[[], Awaitable[T]],
    *,
    type: Type | _Unset = _UNSET,
    effect_validation: EffectValidation | None = None,
) -> T:
    """Attempts to run and memoize the result of calling `callable` while
    supporting retrying as many times as necessary until `callable`
    succeeds.

    `type=` is optional: when omitted, `callable`'s return
    annotation is used. Falls back to `type(None)` if there's
    no annotation -- the runtime check in `memoize` will raise
    a clear error if the callable actually returns a non-`None`
    value in that case.

    `effect_validation=EffectValidation.DISABLED` disables
    the per-call effect-validation re-run even when the context has
    effect validation enabled. Use this for callables that are
    intentionally non-deterministic or expensive to re-run (e.g., LLM
    model requests).

    NOTE: this is the Python wrapper for `reboot.memoize.v1` and as
    such uses `pickle` to serialize the result of calling `callable`
    which therefore must be pickle-able.
    """
    assert memoize is not None
    type_t, type_t_inferred = _resolve_callable_return_type(callable, type)
    return await memoize(
        idempotency_alias_or_tuple,
        context,
        callable,
        type_t=type_t,
        type_t_inferred=type_t_inferred,
        at_most_once=False,
        effect_validation=effect_validation,
    )


async def at_least_once_per_workflow(
    idempotency_alias: str,
    context: WorkflowContext,
    callable: Callable[[], Awaitable[T]],
    *,
    type: Type | _Unset = _UNSET,
    effect_validation: EffectValidation | None = None,
) -> T:
    """Syntactic sugar for calling without an idempotency tuple."""
    return await at_least_once(
        (idempotency_alias, PER_WORKFLOW),
        context,
        callable,
        type=type,
        effect_validation=effect_validation,
    )


UntilTupleType: TypeAlias = tuple[
    str,
    Literal["ALWAYS"] | Literal["PER_WORKFLOW"] | Literal["PER_ITERATION"],
]


async def until(
    idempotency_alias_or_tuple: str | UntilTupleType,
    context: WorkflowContext,
    callable: Callable[[], Awaitable[bool | T]],
    *,
    type: Type | _Unset = _UNSET,
) -> T:
    """Attempts to reactively run `callable` "until" it returns a non
    `False` result we memoize.

    `type=` is optional: when omitted, `callable`'s return
    annotation is used (with `bool` as the fallback when there
    isn't one, since the conventional shape for `until` is
    `Callable[[], Awaitable[bool]]`).
    """

    async def converge():
        return await context.retry_reactively_until(callable)

    type_t, type_t_inferred = _resolve_callable_return_type(
        callable, type, default=bool
    )

    assert memoize is not None
    return await memoize(
        idempotency_alias_or_tuple,
        context,
        converge,
        type_t=type_t,
        type_t_inferred=type_t_inferred,
        at_most_once=False,
        until=True,
    )


async def until_per_workflow(
    idempotency_alias: str,
    context: WorkflowContext,
    callable: Callable[[], Awaitable[bool | T]],
    *,
    type: Type | _Unset = _UNSET,
) -> T:
    return await until(
        (idempotency_alias, PER_WORKFLOW),
        context,
        callable,
        type=type,
    )


async def until_changes(
    idempotency_alias: str,
    context: WorkflowContext,
    callable: Callable[[], Awaitable[T]],
    *,
    type: Type | _Unset = _UNSET,
    equals: Callable[[T, T], bool] = lambda previous,
    current: previous == current,
) -> T:
    """Runs `callable` at each iteration, only returning if the result of
    running callable != the result from the previous iteration.

    `type=` is optional: when omitted, `callable`'s return
    annotation is used.
    """
    if not context.within_loop():
        raise RuntimeError(
            "Waiting for changes must be done _within_ a control loop"
        )

    # Resolve `type=` once at the top so the two `until_per_workflow`
    # calls below all use the same key, whether passed explicitly
    # by the caller or inferred from `callable`'s return annotation.
    type_t, _ = _resolve_callable_return_type(callable, type)

    iteration = context.task.iteration

    previous: Optional[T] = None

    if iteration > 0:
        # Get the previous memoized result!
        async def missing_memoized_value() -> T:
            raise RuntimeError(
                f"Missing memoized value for '{idempotency_alias}'"
            )

        previous = await until_per_workflow(
            f"{idempotency_alias} #{iteration - 1}",
            context,
            missing_memoized_value,
            type=type_t,
        )

    # Wait until previous result does not equal current result.
    async def previous_not_equals_current():
        current = await callable()
        if iteration == 0:
            return current
        assert previous is not None
        if not equals(previous, current):
            return current
        return False

    return await until_per_workflow(
        f"{idempotency_alias} #{iteration}",
        context,
        previous_not_equals_current,
        type=type_t,
    )
