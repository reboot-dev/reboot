import sys
from rebootdev.aio.contexts import WorkflowContext, retry_reactively_until
from typing import (
    Awaitable,
    Callable,
    Literal,
    Optional,
    Protocol,
    TypeAlias,
    TypeVar,
    overload,
)

# NOTE: we're not using an enum because the values that can be used in
# `at_most_once` and `at_least_once` are different than `until`.
ALWAYS: Literal["ALWAYS"] = "ALWAYS"
PER_WORKFLOW: Literal["PER_WORKFLOW"] = "PER_WORKFLOW"
PER_ITERATION: Literal["PER_ITERATION"] = "PER_ITERATION"

How: TypeAlias = (
    Literal["ALWAYS"] | Literal["PER_WORKFLOW"] | Literal["PER_ITERATION"]
)

T = TypeVar('T')


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
        type_t: type[T],
        at_most_once: bool,
        until: bool = False,
        retryable_exceptions: Optional[list[type[Exception]]] = None,
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


@overload
async def at_most_once(
    idempotency_alias_or_tuple: str | AtMostLeastOnceTupleType,
    context: WorkflowContext,
    callable: Callable[[], Awaitable[None]],
    *,
    type: type = type(None),
    retryable_exceptions: Optional[list[type[Exception]]] = None,
) -> None:
    ...


@overload
async def at_most_once(
    idempotency_alias_or_tuple: str | AtMostLeastOnceTupleType,
    context: WorkflowContext,
    callable: Callable[[], Awaitable[T]],
    *,
    type: type[T],
    retryable_exceptions: Optional[list[type[Exception]]] = None,
) -> T:
    ...


async def at_most_once(
    idempotency_alias_or_tuple: str | AtMostLeastOnceTupleType,
    context: WorkflowContext,
    callable: Callable[[], Awaitable[T]],
    *,
    type: type = type(None),
    retryable_exceptions: Optional[list[type[Exception]]] = None,
) -> T:
    """Attempts to run and memoize the result of calling `callable` but
    only once.

    NOTE: this is the Python wrapper for `reboot.memoize.v1` and as
    such uses `pickle` to serialize the result of calling `callable`
    which therefore must be pickle-able.
    """
    assert memoize is not None
    try:
        return await memoize(
            idempotency_alias_or_tuple,
            context,
            callable,
            type_t=type,
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


@overload
async def at_most_once_per_workflow(
    idempotency_alias: str,
    context: WorkflowContext,
    callable: Callable[[], Awaitable[None]],
    *,
    type: type = type(None),
    retryable_exceptions: Optional[list[type[Exception]]] = None,
) -> None:
    ...


@overload
async def at_most_once_per_workflow(
    idempotency_alias: str,
    context: WorkflowContext,
    callable: Callable[[], Awaitable[T]],
    *,
    type: type[T],
    retryable_exceptions: Optional[list[type[Exception]]] = None,
) -> T:
    ...


async def at_most_once_per_workflow(
    idempotency_alias: str,
    context: WorkflowContext,
    callable: Callable[[], Awaitable[T]],
    *,
    type: type = type(None),
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


@overload
async def at_least_once(
    idempotency_alias_or_tuple: str | AtMostLeastOnceTupleType,
    context: WorkflowContext,
    callable: Callable[[], Awaitable[None]],
    *,
    type: type = type(None),
) -> None:
    ...


@overload
async def at_least_once(
    idempotency_alias_or_tuple: str | AtMostLeastOnceTupleType,
    context: WorkflowContext,
    callable: Callable[[], Awaitable[T]],
    *,
    type: type[T],
) -> T:
    ...


async def at_least_once(
    idempotency_alias_or_tuple: str | AtMostLeastOnceTupleType,
    context: WorkflowContext,
    callable: Callable[[], Awaitable[T]],
    *,
    type: type = type(None),
) -> T:
    """Attempts to run and memoize the result of calling `callable` while
    supporting retrying as many times as necessary until `callable`
    succeeds.

    NOTE: this is the Python wrapper for `reboot.memoize.v1` and as
    such uses `pickle` to serialize the result of calling `callable`
    which therefore must be pickle-able.
    """
    assert memoize is not None
    return await memoize(
        idempotency_alias_or_tuple,
        context,
        callable,
        type_t=type,
        at_most_once=False,
    )


@overload
async def at_least_once_per_workflow(
    idempotency_alias: str,
    context: WorkflowContext,
    callable: Callable[[], Awaitable[None]],
    *,
    type: type = type(None),
) -> None:
    ...


@overload
async def at_least_once_per_workflow(
    idempotency_alias: str,
    context: WorkflowContext,
    callable: Callable[[], Awaitable[T]],
    *,
    type: type[T],
) -> T:
    ...


async def at_least_once_per_workflow(
    idempotency_alias: str,
    context: WorkflowContext,
    callable: Callable[[], Awaitable[T]],
    *,
    type: type = type(None),
) -> T:
    """Syntactic sugar for calling without an idempotency tuple."""
    return await at_least_once(
        (idempotency_alias, PER_WORKFLOW),
        context,
        callable,
        type=type,
    )


UntilTupleType: TypeAlias = tuple[
    str,
    Literal["ALWAYS"] | Literal["PER_WORKFLOW"] | Literal["PER_ITERATION"],
]


@overload
async def until(
    idempotency_alias_or_tuple: str | UntilTupleType,
    context: WorkflowContext,
    callable: Callable[[], Awaitable[bool]],
    *,
    type: type = bool,
) -> bool:
    ...


@overload
async def until(
    idempotency_alias_or_tuple: str | UntilTupleType,
    context: WorkflowContext,
    callable: Callable[[], Awaitable[bool | T]],
    *,
    type: type[T],
) -> T:
    ...


async def until(
    idempotency_alias_or_tuple: str | UntilTupleType,
    context: WorkflowContext,
    callable: Callable[[], Awaitable[bool | T]],
    *,
    type: type = bool,
) -> bool | T:
    """Attempts to reactively run `callable` "until" it returns a non
    `False` result we memoize.
    """

    async def converge():
        return await retry_reactively_until(context, callable)

    assert memoize is not None
    return await memoize(
        idempotency_alias_or_tuple,
        context,
        converge,
        type_t=type,
        at_most_once=False,
        until=True,
    )


@overload
async def until_per_workflow(
    idempotency_alias: str,
    context: WorkflowContext,
    callable: Callable[[], Awaitable[bool]],
    *,
    type: type = bool,
) -> bool:
    ...


@overload
async def until_per_workflow(
    idempotency_alias: str,
    context: WorkflowContext,
    callable: Callable[[], Awaitable[bool | T]],
    *,
    type: type[T],
) -> T:
    ...


async def until_per_workflow(
    idempotency_alias: str,
    context: WorkflowContext,
    callable: Callable[[], Awaitable[bool | T]],
    *,
    type: type = bool,
) -> bool | T:
    return await until(
        (idempotency_alias, PER_WORKFLOW),
        context,
        callable,
        type=type,
    )
