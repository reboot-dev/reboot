import asyncio
import unittest
import uuid
import websockets
from google.protobuf.message import Message
from rbt.v1alpha1 import react_pb2
from reboot.aio.applications import Application
from reboot.aio.external import ExternalContext
from reboot.aio.headers import Headers
from reboot.aio.react import MUTATE_WEBSOCKET_PATH, ReactServicer
from reboot.aio.tests import Reboot
from reboot.aio.types import ApplicationId, StateTypeName
from tests.reboot.greeter_rbt import (
    Greeter,
    SetAdjectiveRequest,
    SetAdjectiveResponse,
)
from tests.reboot.greeter_servicers import MyGreeterServicer
from typing import Optional

STATE_TYPE_NAME = StateTypeName('tests.reboot.Greeter')

# More states than the servers that we have by default, so that some
# of them must be on a different server than the websocket is.
STATE_IDS = [f'greeter-{i}' for i in range(8)]

# How long we wait before we believe that we are not getting a
# response, rather than just being slow.
WAITING_SECONDS = 2


def state_ref(state_id: str) -> str:
    """Returns what a browser uses for the state, see `stateIdToRef()`."""
    return f'{STATE_TYPE_NAME}:{state_id}'


def mutate_request(
    *,
    state_ref: str,
    adjective: str,
    method: str = 'SetAdjective',
) -> bytes:
    return react_pb2.MutateRequest(
        method=method,
        request=SetAdjectiveRequest(adjective=adjective).SerializeToString(),
        idempotency_key=str(uuid.uuid4()),
        state_ref=state_ref,
    ).SerializeToString()


def mutate_response(response_bytes: bytes) -> react_pb2.MutateResponse:
    response = react_pb2.MutateResponse()
    response.ParseFromString(response_bytes)
    return response


class WebSocketMutateTestCase(unittest.IsolatedAsyncioTestCase):
    """Tests the websocket for the mutations of all states the way
    that a browser uses it, i.e., through Envoy."""

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()

        await self.rbt.up(
            Application(servicers=[MyGreeterServicer]),
            local_envoy=True,
        )

        self.context: ExternalContext = self.rbt.create_external_context(
            name=self.id()
        )

        for state_id in STATE_IDS + ['google-oauth2|123']:
            await Greeter.Create(
                self.context,
                state_id,
                title='Dr',
                name='Jonathan',
                adjective='initial',
            )

        self.websocket = await websockets.connect(
            f'ws://localhost:{self.rbt.envoy_port()}{MUTATE_WEBSOCKET_PATH}'
        )

    async def asyncTearDown(self) -> None:
        await self.websocket.close()
        await self.rbt.stop()

    async def receive(self) -> react_pb2.MutateResponse:
        return mutate_response(
            await asyncio.wait_for(
                self.websocket.recv(),
                timeout=30,
            )
        )

    async def adjective(self, state_id: str) -> str:
        state = await Greeter.ref(state_id).GetWholeState(self.context)
        return state.adjective

    async def test_states(self) -> None:
        """Tests mutating more than one state, wherever they are."""
        for state_id in STATE_IDS:
            await self.websocket.send(
                mutate_request(
                    state_ref=state_ref(state_id),
                    adjective=f'adjective of {state_id}',
                )
            )

        responses = [await self.receive() for _ in STATE_IDS]

        for response in responses:
            self.assertEqual(
                'response',
                response.WhichOneof('response_or_status'),
                response,
            )

        self.assertCountEqual(
            [state_ref(state_id) for state_id in STATE_IDS],
            [response.state_ref for response in responses],
        )

        for state_id in STATE_IDS:
            self.assertEqual(
                f'adjective of {state_id}',
                await self.adjective(state_id),
            )

    async def test_order(self) -> None:
        """Tests that the mutations of a state are performed in the
        order that they were sent."""
        adjectives = [f'adjective {i}' for i in range(10)]

        for adjective in adjectives:
            for state_id in STATE_IDS:
                await self.websocket.send(
                    mutate_request(
                        state_ref=state_ref(state_id),
                        adjective=adjective,
                    )
                )

        for _ in range(len(adjectives) * len(STATE_IDS)):
            response = await self.receive()
            self.assertEqual(
                'response',
                response.WhichOneof('response_or_status'),
                response,
            )

        for state_id in STATE_IDS:
            self.assertEqual(adjectives[-1], await self.adjective(state_id))

    async def test_state_id_that_needs_encoding(self) -> None:
        """Tests a state whose ID is percent-encoded by a browser."""
        await self.websocket.send(
            mutate_request(
                state_ref=state_ref('google-oauth2%7C123'),
                adjective='encoded',
            )
        )

        response = await self.receive()

        self.assertEqual(
            'response',
            response.WhichOneof('response_or_status'),
            response,
        )

        # The response has what the request had, since that is what a
        # browser is looking for.
        self.assertEqual(state_ref('google-oauth2%7C123'), response.state_ref)

        self.assertEqual('encoded', await self.adjective('google-oauth2|123'))

    async def test_status(self) -> None:
        """Tests that a mutation that fails has a status for a response,
        and that the websocket can still be used."""
        await self.websocket.send(
            mutate_request(
                state_ref='tests.reboot.Unknown:unknown',
                adjective='unknown',
            )
        )

        response = await self.receive()

        self.assertEqual(
            'status',
            response.WhichOneof('response_or_status'),
            response,
        )
        self.assertEqual('tests.reboot.Unknown:unknown', response.state_ref)

        await self.websocket.send(
            mutate_request(
                state_ref=state_ref(STATE_IDS[0]),
                adjective='unknown',
                method='TestLongRunningWriter',
            )
        )

        response = await self.receive()

        self.assertEqual(
            'status',
            response.WhichOneof('response_or_status'),
            response,
        )
        self.assertEqual(state_ref(STATE_IDS[0]), response.state_ref)

        await self.websocket.send(
            mutate_request(
                state_ref=state_ref(STATE_IDS[0]),
                adjective='friendly',
            )
        )

        response = await self.receive()

        self.assertEqual(
            'response',
            response.WhichOneof('response_or_status'),
            response,
        )

        self.assertEqual('friendly', await self.adjective(STATE_IDS[0]))


class FakeMiddleware:
    """A `Middleware` whose mutations are performed once the test says
    so."""

    def __init__(self) -> None:
        # The adjectives of the mutations that have been performed,
        # in the order that they were.
        self.performed: list[str] = []

        self._events: dict[str, asyncio.Event] = {}

    def event(self, adjective: str) -> asyncio.Event:
        return self._events.setdefault(adjective, asyncio.Event())

    async def react_mutate(
        self,
        headers: Headers,
        method: str,
        request_bytes: bytes,
    ) -> Message:
        request = SetAdjectiveRequest()
        request.ParseFromString(request_bytes)
        await self.event(request.adjective).wait()
        self.performed.append(request.adjective)
        return SetAdjectiveResponse()


class FakeWebSocket:
    """A websocket that receives what the test says it does."""

    def __init__(self) -> None:
        self.received: asyncio.Queue[Optional[bytes]] = asyncio.Queue()
        self.sent: asyncio.Queue[bytes] = asyncio.Queue()

    def __aiter__(self):
        return self

    async def __anext__(self) -> bytes:
        request_bytes = await self.received.get()
        if request_bytes is None:
            raise StopAsyncIteration
        return request_bytes

    async def send(self, response_bytes: bytes) -> None:
        self.sent.put_nowait(response_bytes)


class ConcurrentlyTestCase(unittest.IsolatedAsyncioTestCase):
    """Tests which mutations wait for which, which needs mutations
    that take as long as the test wants them to."""

    async def asyncSetUp(self) -> None:
        self.middleware = FakeMiddleware()

        self.websocket = FakeWebSocket()

        self.task = asyncio.create_task(
            ReactServicer(
                ApplicationId('application'),
                {
                    STATE_TYPE_NAME:
                        self.middleware,  # type: ignore[dict-item]
                },
            )._websocket_mutate_states(
                self.websocket,
                application_id=ApplicationId('application'),
            )
        )

    async def asyncTearDown(self) -> None:
        self.task.cancel()
        await asyncio.wait([self.task])

    def receive(self, *, state_id: str, adjective: str) -> None:
        self.websocket.received.put_nowait(
            mutate_request(
                state_ref=state_ref(state_id),
                adjective=adjective,
            )
        )

    async def sent(self) -> str:
        """Returns the state of the next response."""
        response = mutate_response(
            await asyncio.wait_for(
                self.websocket.sent.get(),
                timeout=WAITING_SECONDS,
            )
        )
        return response.state_ref

    async def test_different_states(self) -> None:
        """Tests that a mutation does not wait for a mutation of a
        different state."""
        self.receive(state_id='slow', adjective='slow')
        self.receive(state_id='fast', adjective='fast')

        self.middleware.event('fast').set()

        self.assertEqual(state_ref('fast'), await self.sent())

        self.assertEqual(['fast'], self.middleware.performed)

        self.middleware.event('slow').set()

        self.assertEqual(state_ref('slow'), await self.sent())

        self.assertEqual(['fast', 'slow'], self.middleware.performed)

    async def test_same_state(self) -> None:
        """Tests that a mutation waits for the mutations of the same
        state that were sent before it."""
        self.receive(state_id='state', adjective='first')
        self.receive(state_id='state', adjective='second')
        self.receive(state_id='state', adjective='third')

        # Even though the mutations after it could be performed.
        self.middleware.event('third').set()
        self.middleware.event('second').set()

        with self.assertRaises(asyncio.TimeoutError):
            await self.sent()

        self.assertEqual([], self.middleware.performed)

        self.middleware.event('first').set()

        for _ in range(3):
            self.assertEqual(state_ref('state'), await self.sent())

        self.assertEqual(
            ['first', 'second', 'third'],
            self.middleware.performed,
        )

    async def test_closed(self) -> None:
        """Tests that mutations are cancelled once the websocket is
        closed, just like for a websocket for a single state."""
        self.receive(state_id='state', adjective='never')

        # Wait for the mutation to be waiting.
        while 'never' not in self.middleware._events:
            await asyncio.sleep(0.01)

        self.websocket.received.put_nowait(None)

        await asyncio.wait_for(self.task, timeout=WAITING_SECONDS)

        self.middleware.event('never').set()

        await asyncio.sleep(0.1)

        self.assertEqual([], self.middleware.performed)


if __name__ == '__main__':
    unittest.main()
