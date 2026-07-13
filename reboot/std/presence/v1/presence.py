import asyncio
from rbt.std.presence.mouse_tracker.v1.mouse_position_rbt import (
    MousePosition,
    PositionRequest,
    PositionResponse,
    UpdateRequest,
    UpdateResponse,
)
from rbt.std.presence.subscriber.v1.subscriber_rbt import (
    ConnectRequest,
    ConnectResponse,
    CreateRequest,
    CreateResponse,
    StatusRequest,
    StatusResponse,
    Subscriber,
    ToggleRequest,
    ToggleResponse,
    WaitForDisconnectRequest,
    WaitForDisconnectResponse,
)
from rbt.std.presence.v1.presence_rbt import (
    ListRequest,
    ListResponse,
    Presence,
    SubscribeRequest,
    SubscribeResponse,
    WatchRequest,
    WatchResponse,
)
from rbt.v1alpha1.errors_pb2 import AlreadyExists, FailedPrecondition, NotFound
from reboot.aio.applications import Library
from reboot.aio.auth.authorizers import (
    AuthorizerRule,
    allow_if,
    has_verified_token,
    is_app_internal,
)
from reboot.aio.contexts import ReaderContext, WorkflowContext, WriterContext
from reboot.aio.workflows import until
from typing import Optional


class Event:

    def __init__(self):
        """
        We need to manage the number of waiters so the `Connect` and
        `WaitForDisconnect` functions can determine if they can delete the key
        from the map of disconnect events.
        If waiters > 0, `WaitForDisconnect` will eventually delete the key.
        If waiters == 0, `Connect` will delete the key after it receives the
        cancellation signal.
        """
        self._waiters = 0
        self._event = asyncio.Event()

    async def wait(self):
        delete = False
        # If `set` has not yet been called, we increment the number of waiters.
        if not self._event.is_set():
            self._waiters += 1
            delete = True
        await self._event.wait()
        return delete

    def set(self):
        self._event.set()
        return self._waiters


class PresenceServicer(Presence.singleton.Servicer):

    # Singleton authorizer as class variable.
    _authorizer: Optional[Presence.Authorizer | AuthorizerRule] = None

    def authorizer(self):
        if self._authorizer:
            return self._authorizer
        else:
            return allow_if(any=[is_app_internal, has_verified_token])

    async def Subscribe(
        self,
        context: WriterContext,
        state: Presence.State,
        request: SubscribeRequest,
    ) -> SubscribeResponse:
        # If this subscriber has already been added, then there is nothing to do!
        if request.subscriber_id in state.subscriber_ids:
            return SubscribeResponse()

        status = await Subscriber.ref(request.subscriber_id).Status(context)

        if not status.present:
            raise Presence.SubscribeAborted(FailedPrecondition())

        state.subscriber_ids.append(request.subscriber_id)

        await self.ref().schedule().Watch(
            context,
            subscriber_id=request.subscriber_id,
        )

        return SubscribeResponse()

    @classmethod
    async def Watch(
        cls,
        context: WorkflowContext,
        request: WatchRequest,
    ) -> WatchResponse:
        # We *atomically* wait until no longer present and remove.
        async def no_longer_present():

            async def check_presence(state: Presence.State):
                subscriber = Subscriber.ref(request.subscriber_id)
                status = await subscriber.Status(context)
                if not status.present:
                    if request.subscriber_id in state.subscriber_ids:
                        state.subscriber_ids.remove(request.subscriber_id)
                    return True
                return False

            return await Presence.ref().always().write(
                context,
                check_presence,
            )

        await until("No longer present", context, lambda: no_longer_present())

        return WatchResponse()

    async def List(
        self,
        context: ReaderContext,
        state: Presence.State,
        request: ListRequest,
    ) -> ListResponse:
        return ListResponse(subscriber_ids=state.subscriber_ids)


class SubscriberServicer(Subscriber.singleton.Servicer):

    _disconnect_events: dict[str, Event] = {}

    # Singleton authorizer as class variable.
    _authorizer: Optional[Subscriber.Authorizer | AuthorizerRule] = None

    def authorizer(self):
        if self._authorizer:
            return self._authorizer
        else:
            return allow_if(any=[is_app_internal, has_verified_token])

    async def Create(
        self,
        context: WriterContext,
        state: Subscriber.State,
        request: CreateRequest,
    ) -> CreateResponse:
        return CreateResponse()

    async def Connect(
        self,
        context: ReaderContext,
        state: Subscriber.State,
        request: ConnectRequest,
    ) -> ConnectResponse:
        key = f"{context.state_id}/{request.nonce}"

        if key in self._disconnect_events:
            raise Subscriber.ConnectAborted(AlreadyExists())

        event = Event()
        self._disconnect_events[key] = event

        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            # If we receive a cancelled error, we want to raise so we don't
            # rerun `connect` due to effect validation when we are running in dev mode.
            raise
        finally:
            # Delete key only after all waiters are finished.
            if event.set() == 0:
                del self._disconnect_events[key]

        return ConnectResponse()

    async def Toggle(
        self,
        context: WriterContext,
        state: Subscriber.State,
        request: ToggleRequest,
    ) -> ToggleResponse:
        key = f"{context.state_id}/{request.nonce}"

        # There's a chance `Toggle` will be called before `Connect` because
        # `Connect` never returns so we have to call them "concurrently".
        if key not in self._disconnect_events:
            raise Subscriber.ToggleAborted(NotFound())

        state.toggles += 1

        await self.ref().schedule().WaitForDisconnect(
            context, nonce=request.nonce
        )

        return ToggleResponse()

    @classmethod
    async def WaitForDisconnect(
        cls,
        context: WorkflowContext,
        request: WaitForDisconnectRequest,
    ) -> WaitForDisconnectResponse:
        key = f"{context.state_id}/{request.nonce}"

        # We only want to wait and delete the key once. This avoids incorrectly
        # modifying disconnect events on effect validation.
        async def not_present():
            if key in cls._disconnect_events:
                if await cls._disconnect_events[key].wait():
                    del cls._disconnect_events[key]
            return True

        await until("Not present", context, not_present)

        async def untoggle(state: Subscriber.State):
            # `Untoggle` should always have a corresponding `Toggle`.
            assert state.toggles > 0
            state.toggles -= 1

        await Subscriber.ref().idempotently("Untoggle").write(
            context,
            untoggle,
        )

        return WaitForDisconnectResponse()

    async def Status(
        self,
        context: ReaderContext,
        state: Subscriber.State,
        request: StatusRequest,
    ) -> StatusResponse:
        return StatusResponse(present=state.toggles > 0)


class MousePositionServicer(MousePosition.singleton.Servicer):

    # Singleton authorizer as class variable.
    _authorizer: Optional[MousePosition.Authorizer | AuthorizerRule] = None

    def authorizer(self):
        if self._authorizer:
            return self._authorizer
        else:
            return allow_if(any=[is_app_internal, has_verified_token])

    async def Update(
        self,
        context: WriterContext,
        state: MousePosition.State,
        request: UpdateRequest,
    ) -> UpdateResponse:
        # Trade off the guarantee of the updated position being persisted
        # to disk with better performance.
        context.sync = False

        state.left = request.left
        state.top = request.top

        return UpdateResponse()

    async def Position(
        self,
        context: ReaderContext,
        state: MousePosition.State,
        request: PositionRequest,
    ) -> PositionResponse:
        return PositionResponse(left=state.left, top=state.top)


PRESENCE_LIBRARY_NAME = "reboot.std.presence.v1.presence"


class PresenceLibrary(Library):
    name = PRESENCE_LIBRARY_NAME

    def __init__(
        self,
        presence_authorizer: Optional[Presence.Authorizer |
                                      AuthorizerRule] = None,
        subscriber_authorizer: Optional[Subscriber.Authorizer |
                                        AuthorizerRule] = None,
        mouse_position_authorizer: Optional[MousePosition.Authorizer |
                                            AuthorizerRule] = None,
        authorizer: Optional[AuthorizerRule] = None,
    ):
        if authorizer is not None:
            assert (
                presence_authorizer is None and
                subscriber_authorizer is None and
                mouse_position_authorizer is None
            ), (
                "If `authorizer` as an `AuthorizerRule` is supplied, it will "
                "be applied to all three servicers. To specify a specific "
                "authorizers for each servicer, please use pass in "
                "`presence_authorizer`, `subscriber_authorizer` and "
                "`mouse_position_authorizer`."
            )
            PresenceServicer._authorizer = authorizer
            SubscriberServicer._authorizer = authorizer
            MousePositionServicer._authorizer = authorizer
        else:
            PresenceServicer._authorizer = presence_authorizer
            SubscriberServicer._authorizer = subscriber_authorizer
            MousePositionServicer._authorizer = mouse_position_authorizer

    def servicers(self):
        return [PresenceServicer, SubscriberServicer, MousePositionServicer]


def servicers():
    return [
        PresenceServicer,
        SubscriberServicer,
        MousePositionServicer,
    ]


def presence_library(
    presence_authorizer: Optional[Presence.Authorizer | AuthorizerRule] = None,
    subscriber_authorizer: Optional[Subscriber.Authorizer |
                                    AuthorizerRule] = None,
    mouse_position_authorizer: Optional[MousePosition.Authorizer |
                                        AuthorizerRule] = None,
    authorizer: Optional[AuthorizerRule] = None,
):

    return PresenceLibrary(
        presence_authorizer,
        subscriber_authorizer,
        mouse_position_authorizer,
        authorizer,
    )
