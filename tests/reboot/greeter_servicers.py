import asyncio
import grpc
from google.protobuf import empty_pb2
from google.protobuf.empty_pb2 import Empty
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import (
    EffectValidation,
    ReaderContext,
    TransactionContext,
    WorkflowContext,
    WriterContext,
)
from reboot.aio.external import ExternalContext
from reboot.aio.headers import Headers
from reboot.aio.internals.channel_manager import _ChannelManager
from reboot.aio.resolvers import NoResolver
from reboot.aio.types import ApplicationId, StateTypeName
from tests.reboot import greeter_pb2, greeter_pb2_grpc, greeter_rbt
from tests.reboot.greeter_rbt import Greeter
from typing import AsyncIterable, Optional


class MyGreeterServicer(Greeter.Servicer):
    """Implementation of GreeterServicer for use in tests."""

    # This class level attribute is present so that tests can detect when this
    # servicer is instantiated.
    instantiated_at_least_once = False

    def __init__(self):
        super().__init__()
        type(self).instantiated_at_least_once = True

    def authorizer(self):
        return allow()

    async def Create(
        self,
        context: WriterContext,
        request: greeter_rbt.CreateRequest,
    ) -> greeter_rbt.CreateResponse:
        """Create a new Greeter."""
        self.state.title = request.title
        self.state.name = request.name
        self.state.adjective = request.adjective

        return greeter_rbt.CreateResponse()

    def _proper_name(self) -> str:
        """Return the Proper name of the actor."""
        return f'{self.state.title} {self.state.name} the {self.state.adjective}'

    async def SetAdjective(
        self,
        context: WriterContext,
        request: greeter_rbt.SetAdjectiveRequest,
    ) -> greeter_rbt.SetAdjectiveResponse:
        """Set the adjective that this Greeter will use."""
        self.state.adjective = request.adjective

        return greeter_rbt.SetAdjectiveResponse()

    async def TransactionSetAdjective(
        self,
        context: TransactionContext,
        request: greeter_rbt.SetAdjectiveRequest,
    ) -> greeter_rbt.SetAdjectiveResponse:
        """Set the adjective that this Greeter will use."""
        self.state.adjective = request.adjective

        return greeter_rbt.SetAdjectiveResponse()

    async def Greet(
        self,
        context: ReaderContext,
        request: greeter_rbt.GreetRequest,
    ) -> greeter_rbt.GreetResponse:
        """Return a greeting based on the Proper name of the actor and the
        request name.
        """
        message = f'Hi {request.name or "??"}, I am {self._proper_name()}'
        return greeter_rbt.GreetResponse(message=message)

    async def TryToConstructContext(
        self,
        context: ReaderContext,
        request: empty_pb2.Empty,
    ) -> empty_pb2.Empty:
        # Attempting to construct a Context should fail because we are
        # currently servicing an RPC!
        ReaderContext(
            channel_manager=_ChannelManager(NoResolver(), secure=False),
            headers=Headers(
                application_id=ApplicationId('should-raise-error'),
                state_ref=context._state_ref,
            ),
            state_type_name=StateTypeName(
                'unimportant-since-we-will-error-out'
            ),
            method='unimportant-since-we-will-error-out',
            effect_validation=EffectValidation.ENABLED,
        )
        return empty_pb2.Empty()

    async def TryToConstructExternalContext(
        self,
        context: ReaderContext,
        request: empty_pb2.Empty,
    ) -> empty_pb2.Empty:
        # Attempting to construct an `ExternalContext` should fail
        # because we are currently servicing an RPC!
        ExternalContext(
            name='should-raise-error',
            channel_manager=_ChannelManager(NoResolver(), secure=False)
        )
        return empty_pb2.Empty()

    async def TestLongRunningFetch(
        self,
        context: ReaderContext,
        request: greeter_rbt.TestLongRunningFetchRequest,
    ) -> empty_pb2.Empty:
        await asyncio.sleep(request.sleep_time_seconds)
        return empty_pb2.Empty()

    async def TestLongRunningWriter(
        self,
        context: WriterContext,
        request: empty_pb2.Empty,
    ) -> empty_pb2.Empty:
        raise NotImplementedError()

    async def GetWholeState(
        self,
        context: ReaderContext,
        request: empty_pb2.Empty,
    ) -> greeter_rbt.Greeter.State:
        return self.state

    async def FailWithException(
        self,
        context: ReaderContext,
        request: empty_pb2.Empty,
    ) -> empty_pb2.Empty:
        raise Exception('Hi!')

    async def FailWithAborted(
        self,
        context: ReaderContext,
        request: empty_pb2.Empty,
    ) -> empty_pb2.Empty:
        raise greeter_rbt.Greeter.FailWithAbortedAborted(
            greeter_rbt.ErrorWithValue(value='Hi!')
        )

    @classmethod
    async def Workflow(
        cls,
        context: WorkflowContext,
        request: empty_pb2.Empty,
    ) -> greeter_rbt.WorkflowResponse:
        # Check that we can do inline reads and writes.
        state_from_read = await Greeter.ref().read(context)

        async def write(state):
            assert state == state_from_read

        await Greeter.ref().write(context, write)

        try:
            await Greeter.ref().write(context, write)
        except ValueError as error:
            assert (
                "To call inline writer of 'tests.reboot.Greeter' "
                f"of '{context.state_id}' more than once using the same context an "
                "idempotency alias or key must be specified" in str(error)
            )
        else:
            raise Exception('Expecting exception!')

        return greeter_rbt.WorkflowResponse()

    async def DangerousFields(
        self,
        context: WriterContext,
        request: greeter_rbt.DangerousFieldsRequest,
    ) -> empty_pb2.Empty:
        return empty_pb2.Empty()

    async def store_recursive_message(
        self,
        context: WriterContext,
        request: greeter_rbt.StoreRecursiveMessageRequest,
    ) -> greeter_rbt.StoreRecursiveMessageResponse:
        """Stores a recursive message."""
        self.state.recursive_message.CopyFrom(request.message)
        return greeter_rbt.StoreRecursiveMessageResponse()

    async def read_recursive_message(
        self,
        context: ReaderContext,
        request: greeter_rbt.ReadRecursiveMessageRequest,
    ) -> greeter_rbt.ReadRecursiveMessageResponse:
        """Reads a recursive message."""
        return greeter_rbt.ReadRecursiveMessageResponse(
            message=self.state.recursive_message
        )

    async def construct_and_store_recursive_message(
        self,
        context: TransactionContext,
        request: greeter_rbt.ConstructAndStoreRecursiveMessageRequest,
    ) -> greeter_rbt.ConstructAndStoreRecursiveMessageResponse:
        """Constructs and stores a recursive message."""
        deep_message: Optional[greeter_rbt.RecursiveMessage] = None
        for i in range(request.depth):
            message = greeter_rbt.RecursiveMessage(
                message=f'Level {i}',
                next=deep_message,
            )
            deep_message = message

        await self.ref().store_recursive_message(context, message=deep_message)

        return greeter_rbt.ConstructAndStoreRecursiveMessageResponse()


# -------------- Legacy gRPC servicers -----------------
class MyClockServicer(greeter_pb2_grpc.ClockServicer):

    START_TIME_MICROS = 1234567890
    TIME_INCREMENT_MICROS = 1000  # Tick every millisecond.
    MICROS_PER_SECOND = 1_000_000

    async def CurrentTime(
        self, request: Empty, context: grpc.ServicerContext
    ) -> greeter_pb2.Time:
        return greeter_pb2.Time(micros=self.START_TIME_MICROS)

    async def StreamCurrentTime(
        self, request: Empty, context: grpc.ServicerContext
    ) -> AsyncIterable[greeter_pb2.Time]:
        micros_since_start = 0
        while True:
            yield greeter_pb2.Time(
                micros=self.START_TIME_MICROS + micros_since_start
            )
            # A normal clock would tick once per `TIME_INCREMENT_MICROS`, but
            # this clock ticks just a _little_ bit faster to make the tests run
            # faster.
            await asyncio.sleep(0)
            micros_since_start += self.TIME_INCREMENT_MICROS

    async def Stopwatch(
        self,
        requests: AsyncIterable[greeter_pb2.StopwatchRequest],
        grpc_context: grpc.aio.ServicerContext,
    ) -> greeter_pb2.StopwatchResponse:
        times: list[greeter_pb2.Time] = []
        micros_since_start = 0
        async for request in requests:
            times.append(
                greeter_pb2.Time(
                    micros=self.START_TIME_MICROS + micros_since_start
                )
            )
            micros_since_start += self.TIME_INCREMENT_MICROS
            if request.stop:
                break
        return greeter_pb2.StopwatchResponse(times=times)

    async def StreamStopwatch(
        self,
        requests: AsyncIterable[greeter_pb2.StopwatchRequest],
        grpc_context: grpc.aio.ServicerContext,
    ) -> AsyncIterable[greeter_pb2.StopwatchResponse]:
        times: list[greeter_pb2.Time] = []
        micros_since_start = 0
        async for request in requests:
            times.append(
                greeter_pb2.Time(
                    micros=self.START_TIME_MICROS + micros_since_start
                )
            )
            micros_since_start += self.TIME_INCREMENT_MICROS
            yield greeter_pb2.StopwatchResponse(times=times)
            if request.stop:
                break


class MyColorMatcherServicer(greeter_pb2_grpc.ColorMatcherServicer):

    async def MatchColor(
        self, request: greeter_pb2.MatchColorRequest,
        context: grpc.ServicerContext
    ) -> greeter_pb2.MatchColorResponse:
        # Everything goes GREAT with blue.
        return greeter_pb2.MatchColorResponse(
            # Demonstrate that the `_rbt` library re-exports the enums from `_pb2`.
            matching_color=greeter_rbt.Color.BLUE
        )
