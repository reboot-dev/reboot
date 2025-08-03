import log.log
import pickle
import uuid
from rebootdev.aio.auth.authorizers import allow_if, is_app_internal
from rebootdev.aio.contexts import (
    EffectValidation,
    ReaderContext,
    WorkflowContext,
    WriterContext,
    _log_message_for_effect_validation,
)
from rebootdev.aio.types import assert_type
from rebootdev.aio.workflows import (
    ALWAYS,
    PER_ITERATION,
    AtMostOnceFailedBeforeCompleting,
)
from rebootdev.memoize.v1.memoize_rbt import (
    FailRequest,
    FailResponse,
    Memoize,
    ResetRequest,
    ResetResponse,
    StartRequest,
    StartResponse,
    StatusRequest,
    StatusResponse,
    StoreRequest,
    StoreResponse,
)
from rebootdev.settings import DOCS_BASE_URL
from rebootdev.time import DateTimeWithTimeZone
from typing import Awaitable, Callable, Literal, Optional, TypeVar

logger = log.log.get_logger(__name__)

# Dictionary 'idempotency alias': 'timestamp' to keep track of when we
# last explained effect validation for a memoized block given the
# specified idempotency alias. By using the helper
# `_log_message_for_effect_validation` we'll log a message on the
# first invocation of 'idempotency alias' as well as after some time
# so that the user is not inundated with log messages.
_has_ever_explained_effect_validation: dict[str, DateTimeWithTimeZone] = {}

T = TypeVar('T')


async def memoize(
    idempotency_alias_or_tuple: str | tuple[
        str,
        Literal["ALWAYS"] | Literal["PER_WORKFLOW"] | Literal["PER_ITERATION"],
    ],
    context: WorkflowContext,
    callable: Callable[[], Awaitable[T]],
    *,
    type_t: type[T],
    at_most_once: bool,
    until: bool = False,
    retryable_exceptions: Optional[list[type[Exception]]] = None,
) -> T:
    """Memoizes the result of running `callable`, only attempting to do so
    once if `at_most_once=True`.

    NOTE: this is the Python wrapper for `reboot.memoize.v1` and as
    such uses `pickle` to serialize the result of calling `callable`
    which therefore must be pickle-able.
    """
    assert_type(context, [WorkflowContext])

    assert context.task_id is not None

    # Use `Context.idempotency()` to properly create an `Idempotency`
    # that handles `PER_ITERATION` correctly.
    idempotency = context.idempotency(
        alias=idempotency_alias_or_tuple,
        each_iteration=context.within_loop(),
    ) if isinstance(idempotency_alias_or_tuple, str) else (
        context.idempotency(
            alias=f"{idempotency_alias_or_tuple[0]} - {uuid.uuid4()}",
        ) if idempotency_alias_or_tuple[1] == ALWAYS else (
            context.idempotency(
                alias=idempotency_alias_or_tuple[0],
                each_iteration=idempotency_alias_or_tuple[1] == PER_ITERATION,
            )
        )
    )

    assert idempotency.alias is not None

    # First make sure we've constructed the state by calling the
    # writer `Reset`, but idempotently so we only do it the first
    # time.
    #
    # TODO(benh): colocate with `context.state_ref` for performance.
    memoize = Memoize.ref(
        str(uuid.uuid5(context.task_id, idempotency.alias)),
    )

    await memoize.idempotently(
        f'{idempotency.alias} initial reset',
        # Don't mangle idempotency alias; any loop iterations should
        # already be accounted for in `idempotency`.
        each_iteration=False,
    ).Reset(context)

    status = await memoize.always().Status(context)

    if at_most_once and status.started and not status.stored:
        raise AtMostOnceFailedBeforeCompleting(
            status.failure if status.failed else (
                '... it looks like an external failure occurred (e.g., '
                'the machine failed, your container was rescheduled, etc) '
                'while your code was executing'
            )
        )
    elif status.stored:
        t = pickle.loads(status.data)
        if type(t) is not type_t:
            raise TypeError(
                f"Stored result of type '{type(t).__name__}' from 'callable' "
                f"is not of expected type '{type_t.__name__}'; have you changed "
                "the 'type' that you expect after having stored a result?"
            )
        return t

    # Only need to call `Start` for "at most once" semantics.
    if at_most_once:
        assert not status.started
        await memoize.always().Start(context)

    try:

        async def callable_validating_effects():
            """Helper to re-run `callable` if this is not "at most once" and we
            are validating effects.
            """
            # Checkpoint the context since it is the `IdempotencyManager`.
            checkpoint = context.checkpoint()

            t = await callable()

            if (
                at_most_once or until or
                context._effect_validation == EffectValidation.DISABLED
            ):
                return t

            # Effect validation is enabled, and this callable needs to
            # retry: compose a message, log it, and then raise.
            message = (
                f"Re-running block with idempotency {'alias' if idempotency.alias is not None else 'key'} '{idempotency.alias if idempotency.alias is not None else str(idempotency.key)}' "
                f"to validate effects. See {DOCS_BASE_URL}/develop/side_effects "
                "for more information."
            )

            assert idempotency.alias is not None

            _log_message_for_effect_validation(
                effect_validation=context._effect_validation,
                identifier=idempotency.alias,
                timestamps=_has_ever_explained_effect_validation,
                logger=logger,
                message=message,
            )

            # Restore the context to the checkpoint we took above so
            # we can re-execute `callable` as though it is being
            # retried from scratch.
            context.restore(checkpoint)

            # TODO: check if `t` is different (we don't do this for
            # other effect validation so we're also not doing it now).

            return await callable()

        t = await callable_validating_effects()

    except BaseException as exception:
        if at_most_once and retryable_exceptions is not None and any(
            isinstance(exception, retryable_exception)
            for retryable_exception in retryable_exceptions
        ):
            # Only need to reset for "at most once" semantics.
            #
            # NOTE: it's possible that we won't be able to call
            # `Reset` before we fail and even though this "at most
            # once" could be retried it won't be. But the same is true
            # if we failed before we even called `callable` above!
            # While we're eliminating the possibility of trying to
            # call `callable` more than once, we are not ensuring it
            # is called at least once.
            await memoize.always().Reset(context)
        elif at_most_once:
            # Attempt to store information about the failure for
            # easier debugging in the future.
            failure = f'{type(exception).__name__}'

            message = f'{exception}'

            if len(message) > 0:
                failure += f': {message}'

            await memoize.idempotently(
                f'{idempotency.alias} fail',
                # Don't mangle idempotency alias; any loop iterations
                # should already be accounted for in `idempotency`.
                each_iteration=False,
            ).Fail(
                context,
                failure=failure,
            )

        raise
    else:
        # Validate _before_ storing to help find bugs sooner.
        #
        # NOTE: we used to validate _after_ storing which was a poor
        # developer experience because they never saw this error, they
        # saw all the errors raised when re-executing due to effect
        # validation and were confused. See
        # https://github.com/reboot-dev/mono/issues/4616 for more
        # details.
        if type(t) is not type_t:
            # NOTE: this error will only apply to Python developers
            # and hence we use Python names, e.g., `at_least_once`,
            # because we know that the Node.js code will always pass
            # the correct `type_t` (or else we have an internal bug).
            raise TypeError(
                f"Result of type '{type(t).__name__}' from callable passed to "
                f"'{'at_most_once' if at_most_once else ('until' if until else 'at_least_once')}' "
                f"is not of expected type '{type_t.__name__}'; "
                "did you specify an incorrect 'type' or _forget_ to specify "
                "the keyword argument 'type' all together?"
            )

        # TODO(benh): retry just this part in the event of retryable
        # errors so that we aren't the cause of raising
        # `AtMostOnceFailedBeforeCompleting`.
        await memoize.idempotently(
            f'{idempotency.alias} store',
            # Don't mangle idempotency alias; any loop iterations
            # should already be accounted for in `idempotency`.
            each_iteration=False,
        ).Store(
            context,
            data=pickle.dumps(t),
        )

        return t


class MemoizeServicer(Memoize.Servicer):

    def authorizer(self):
        return allow_if(all=[is_app_internal])

    async def Reset(
        self,
        context: WriterContext,
        state: Memoize.State,
        request: ResetRequest,
    ) -> ResetResponse:
        assert not state.stored
        state.CopyFrom(Memoize.State())
        return ResetResponse()

    async def Status(
        self,
        context: ReaderContext,
        state: Memoize.State,
        request: StatusRequest,
    ) -> StatusResponse:
        return StatusResponse(
            started=state.started,
            stored=state.stored,
            failed=state.failed,
            data=state.data,
            failure=state.failure,
        )

    async def Start(
        self,
        context: WriterContext,
        state: Memoize.State,
        request: StartRequest,
    ) -> StartResponse:
        assert not state.started
        state.started = True
        return StartResponse()

    async def Store(
        self,
        context: WriterContext,
        state: Memoize.State,
        request: StoreRequest,
    ) -> StoreResponse:
        assert not state.stored
        state.stored = True
        state.data = request.data
        return StoreResponse()

    async def Fail(
        self,
        context: WriterContext,
        state: Memoize.State,
        request: FailRequest,
    ) -> FailResponse:
        assert not state.stored
        state.failed = True
        state.failure = request.failure
        return FailResponse()


def servicers():
    return [MemoizeServicer]
