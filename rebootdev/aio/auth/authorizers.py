import inspect
import logging
import rbt.v1alpha1.errors_pb2
from abc import ABC, abstractmethod
from google.protobuf.message import Message
from log.log import get_logger, log_at_most_once_per
from rebootdev.aio.contexts import ReaderContext
from rebootdev.run_environments import (
    on_cloud,
    running_rbt_dev,
    running_rbt_serve,
)
from rebootdev.settings import DOCS_BASE_URL
from typing import (
    Awaitable,
    Generic,
    Optional,
    Protocol,
    Sequence,
    TypeAlias,
    TypeVar,
    overload,
)

logger = get_logger(__name__)

# TODO(rjh): some mechanism where developers can configure the Reboot log
# level per-module or globally. For now, default to `WARNING`: we have warnings
# in this file that we expect users to want to see.
logger.setLevel(logging.WARNING)

StateType = TypeVar('StateType', bound=Message)
RequestType = TypeVar('RequestType', bound=Message)
RequestTypes = TypeVar('RequestTypes', bound=Message)

ContravariantStateType = TypeVar(
    'ContravariantStateType', bound=Message, contravariant=True
)
ContravariantRequestType = TypeVar(
    'ContravariantRequestType', bound=Message, contravariant=True
)


class Authorizer(ABC, Generic[StateType, RequestTypes]):
    """Abstract base class for general Servicer Authorizers.

    A Servicer's authorizer is used to determine whether a given call to a
    Servicer's methods should be allowed or not.
    """

    # A value of `False` will be translated into a `PermissionDenied` error.
    Decision: TypeAlias = (
        rbt.v1alpha1.errors_pb2.Unauthenticated |
        rbt.v1alpha1.errors_pb2.PermissionDenied | rbt.v1alpha1.errors_pb2.Ok
    )

    @abstractmethod
    async def authorize(
        self,
        *,
        method_name: str,
        context: ReaderContext,
        state: Optional[StateType],
        request: Optional[RequestTypes],
        # NOTE: we are requiring `**kwargs` for backwards
        # compatibility reasons, i.e., so we can add more keyword args
        # in the future and not break any existing code!
        **kwargs,
    ) -> Decision:
        """Determine whether a call to a the method @method_name should be
        allowed.

        :param method_name: The name of the method being called.
        :param context: A reader context to enable calling other services.
        :param state: The state where and when available.
        :param request: The request object to the servicer method being called.

        Returns:
            `rbt.v1alpha1.errors_pb2.Ok()` if the call should be allowed,
            `rbt.v1alpha1.errors_pb2.Unauthenticated()` or
            `rbt.v1alpha1.errors_pb2.PermissionDenied()` otherwise.
        """
        raise NotImplementedError


class AuthorizerCallable(
    Protocol[ContravariantStateType, ContravariantRequestType],
):

    def __call__(
        self,
        *,
        context: ReaderContext,
        state: Optional[ContravariantStateType],
        request: Optional[ContravariantRequestType],
        # NOTE: we are requiring `**kwargs` for backwards
        # compatibility reasons, i.e., so we can add more keyword args
        # in the future and not break any existing code!
        **kwargs,
    ) -> Awaitable[Authorizer.Decision] | Authorizer.Decision:
        ...


class AuthorizerRule(
    ABC, Generic[ContravariantStateType, ContravariantRequestType]
):

    @abstractmethod
    async def execute(
        self,
        *,
        context: ReaderContext,
        state: Optional[ContravariantStateType],
        request: Optional[ContravariantRequestType],
        # NOTE: we are requiring `**kwargs` for backwards
        # compatibility reasons, i.e., so we can add more keyword args
        # in the future and not break any existing code!
        **kwargs,
    ) -> Authorizer.Decision:
        pass


def deny() -> AuthorizerRule[Message, Message]:

    class DenyAuthorizerRule(AuthorizerRule[Message, Message]):

        async def execute(
            self,
            *,
            context: ReaderContext,
            state: Optional[Message],
            request: Optional[Message],
            **kwargs,
        ) -> Authorizer.Decision:
            return rbt.v1alpha1.errors_pb2.PermissionDenied()

    return DenyAuthorizerRule()


def allow() -> AuthorizerRule[Message, Message]:

    class AllowAuthorizerRule(AuthorizerRule[Message, Message]):

        async def execute(
            self,
            *,
            context: ReaderContext,
            state: Optional[Message],
            request: Optional[Message],
            **kwargs,
        ) -> Authorizer.Decision:
            return rbt.v1alpha1.errors_pb2.Ok()

    return AllowAuthorizerRule()


@overload
def allow_if(
    *,
    all: Sequence[
        AuthorizerCallable[ContravariantStateType, ContravariantRequestType],
    ],
    any: None = None,
) -> AuthorizerRule[ContravariantStateType, ContravariantRequestType]:
    ...


@overload
def allow_if(
    *,
    all: None = None,
    any: Sequence[
        AuthorizerCallable[ContravariantStateType, ContravariantRequestType],
    ],
) -> AuthorizerRule[ContravariantStateType, ContravariantRequestType]:
    ...


def allow_if(
    *,
    all: Optional[Sequence[
        AuthorizerCallable[ContravariantStateType, ContravariantRequestType],
    ]] = None,
    any: Optional[Sequence[
        AuthorizerCallable[ContravariantStateType, ContravariantRequestType],
    ]] = None,
) -> AuthorizerRule[ContravariantStateType, ContravariantRequestType]:

    assert (
        (all is not None and any is None) or (all is None and any is not None)
    ), ("Exactly one of `all` or `any` must be passed")

    callables = all or any

    class AllowIfAuthorizerRule(
        AuthorizerRule[ContravariantStateType, ContravariantRequestType]
    ):

        async def execute(
            self,
            *,
            context: ReaderContext,
            state: Optional[ContravariantStateType],
            request: Optional[ContravariantRequestType],
            **kwargs,
        ) -> Authorizer.Decision:

            # NOTE: we invoke each authorizer callable **one at a time**
            # instead of concurrently so that:
            #
            # (1) We support dependency semantics for `all`, i.e.,
            #     later callable can assume earlier callables did not
            #     return `Unauthenticated` or `PermissionDenied`.
            #
            # (2) We support short-circuiting`, i.e., cheaper authorizer
            #     callables can be listed first so more expensive ones
            #     aren't executed unless necessary.
            #
            # PLEASE KEEP SEMANTICS IN SYNC WITH TYPESCRIPT.

            async def invoke(callable):
                decision = callable(
                    context=context, state=state, request=request
                )
                if inspect.isawaitable(decision):
                    return await decision
                return decision

            # Remember if we had any `PermissionDenied` for `any` so
            # that we return that instead of `Unauthenticated`.
            denied = False

            assert callables is not None

            for callable in callables:
                decision = await invoke(callable)

                if isinstance(decision, rbt.v1alpha1.errors_pb2.Ok):
                    if all is not None:
                        # All callables must return `Ok`, keep checking.
                        continue
                    else:
                        # Only needed one `Ok` and we got it, short-circuit.
                        return decision
                elif isinstance(
                    decision, rbt.v1alpha1.errors_pb2.Unauthenticated
                ):
                    if all is not None:
                        # All callables must return `Ok`, short-circuit.
                        return decision
                    else:
                        # Just need one `Ok`, keep checking.
                        continue
                elif isinstance(
                    decision, rbt.v1alpha1.errors_pb2.PermissionDenied
                ):
                    if all is not None:
                        # All callables must return `Ok`, short-circuit.
                        return decision
                    else:
                        # Remember that we got at least one
                        # `PermissionDenied` so we can return it
                        # later.
                        denied = True
                        # Only need one `Ok`, keep checking.
                        continue

            # If this was `all`, then they must have all been `Ok`!
            if all is not None:
                assert not denied
                return rbt.v1alpha1.errors_pb2.Ok()

            # Must be `any`, check if we got at least one
            # `PermissionDenied` otherwise return `Unauthenticated`.
            if denied:
                return rbt.v1alpha1.errors_pb2.PermissionDenied()
            else:
                return rbt.v1alpha1.errors_pb2.Unauthenticated()

    return AllowIfAuthorizerRule()


# NOTE: we're not calling this `is_authenticated` to account for
# the possible case that someone uses a `TokenVerifier` that just
# verifies the token but doesn't also check to see if the user
# associated with the token is in fact a user of this application.
def has_verified_token(*, context: ReaderContext, **kwargs):
    if context.auth is None:
        return rbt.v1alpha1.errors_pb2.Unauthenticated()

    return rbt.v1alpha1.errors_pb2.Ok()


def is_app_internal(*, context: ReaderContext, **kwargs):
    if context.app_internal:
        return rbt.v1alpha1.errors_pb2.Ok()

    return rbt.v1alpha1.errors_pb2.PermissionDenied()


class DefaultAuthorizer(Authorizer[Message, Message]):

    def __init__(self, state_name: str):
        self._state_name = state_name

    async def authorize(
        self,
        *,
        method_name: str,
        context: ReaderContext,
        state: Optional[Message],
        request: Optional[Message],
        **kwargs,
    ) -> Authorizer.Decision:
        # Allow if app internal.
        if context.app_internal:
            return rbt.v1alpha1.errors_pb2.Ok()

        if on_cloud() or running_rbt_serve() or not running_rbt_dev():
            # NOTE: returning `PermissionDenied` here because we don't
            # know whether or not the call is `Unauthenticated`
            # because no authorizer was provided, i.e., a
            # `TokenVerifier` may have successfully verified a token
            # and a user might indeed be "authenticated".
            return rbt.v1alpha1.errors_pb2.PermissionDenied()

        # Allow if in dev mode, but emit a log warning so users know
        # that otherwise the call would be denied.
        log_at_most_once_per(
            # Log warnings every 1 minute, a bit aggressive
            # because if users fail to act they may run with `rbt
            # serve` or in the cloud and have a bad time.
            seconds=60,
            log_method=logger.warning,
            message=(
                f"*** {self._state_name}.{method_name.split('.')[-1]} IS "
                "MISSING AUTHORIZATION *** Calls to this method are ONLY "
                "ALLOWED during development and will be DENIED in "
                f"production. See {DOCS_BASE_URL}/develop/auth#default-authorizer "
                "for more details. Will silence this message for the next 1 "
                "minute."
            )
        )

        return rbt.v1alpha1.errors_pb2.Ok()
