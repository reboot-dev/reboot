import asyncio
import grpc.aio
import unittest
from rbt.v1alpha1 import react_pb2, react_pb2_grpc
from reboot.aio.contexts import React
from reboot.aio.internals.channel_manager import _ChannelManager
from reboot.aio.types import ServiceName, StateId, StateRef, StateTypeName
from tests.reboot import greeter_pb2
from typing import cast

STATE_TYPE_NAME = StateTypeName('greeter.v1.Greeter')
STATE_REF = StateRef.from_id(STATE_TYPE_NAME, StateId('the-greeter'))
SERVICE_NAME = ServiceName('greeter.v1.GreeterMethods')


class FeedableReactServicer(react_pb2_grpc.ReactServicer):
    """A `React.Query` that streams whatever the test feeds it, as fast
    as it is fed, and never ends."""

    def __init__(self):
        self.messages: asyncio.Queue[str] = asyncio.Queue()

    async def Query(self, request, grpc_context):
        while True:
            message = await self.messages.get()
            yield react_pb2.QueryResponse(
                response=greeter_pb2.GreetResponse(
                    message=message,
                ).SerializeToString(),
            )


class FixedChannelManager:
    """Hands out one channel for every state."""

    def __init__(self, channel: grpc.aio.Channel):
        self._channel = channel

    def get_channel_to_state(self, *args, **kwargs) -> grpc.aio.Channel:
        return self._channel


class ReactQuerierTest(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.servicer = FeedableReactServicer()
        self.server = grpc.aio.server()
        react_pb2_grpc.add_ReactServicer_to_server(self.servicer, self.server)
        port = self.server.add_insecure_port('127.0.0.1:0')
        await self.server.start()
        self.channel = grpc.aio.insecure_channel(f'127.0.0.1:{port}')
        self.react = React(
            cast(_ChannelManager, FixedChannelManager(self.channel))
        )

    async def asyncTearDown(self) -> None:
        await self.react.cancel()
        await self.channel.close()
        await self.server.stop(grace=None)

    async def greet(self) -> str:
        """Calls `Greet` the way a reactive reader's transitive call
        does, returning the latest response the querier holds."""
        _, response = await self.react.call(
            state_type_name=STATE_TYPE_NAME,
            state_ref=STATE_REF,
            service_name=SERVICE_NAME,
            method='Greet',
            request=greeter_pb2.GreetRequest(name='Reboot'),
            response_type=greeter_pb2.GreetResponse,
            metadata=(),
        )
        return (await response).message

    async def test_drains_responses_the_caller_has_not_asked_for(self):
        """The querier must keep reading responses off the stream, and
        only keep the latest, while its caller is busy, rather than
        leave them queued in the stream until the caller asks for the
        next one."""
        self.servicer.messages.put_nowait('first')
        self.assertEqual('first', await self.greet())

        # A response after the first wakes the caller up.
        iteration = self.react.iteration
        self.servicer.messages.put_nowait('second')
        iteration = await self.react.iterate(iteration)

        # So does the next one, even though the caller never asked for
        # 'second': the querier drained it regardless. Nothing is fed
        # until the previous `iterate()` has returned, so this one can
        # only return once 'third' has been read.
        self.servicer.messages.put_nowait('third')
        iteration = await self.react.iterate(iteration)

        # The caller catches up to the latest response in one step.
        self.assertEqual('third', await self.greet())


if __name__ == '__main__':
    unittest.main()
