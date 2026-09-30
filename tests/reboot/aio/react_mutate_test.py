import aiohttp
import asyncio
import unittest
import uuid
from google.protobuf.json_format import MessageToDict, ParseDict
from rbt.v1alpha1 import react_pb2
from reboot.aio.applications import Application
from reboot.aio.external import ExternalContext
from reboot.aio.tests import Reboot
from reboot.aio.types import StateRef, StateTypeName
from tests.reboot.greeter_rbt import Greeter, SetAdjectiveRequest
from tests.reboot.greeter_servicers import MyGreeterServicer
from typing import Optional

STATE_ID = 'greeter'

STATE_REF = StateRef.from_id(StateTypeName('tests.reboot.Greeter'), STATE_ID)

# How long we wait before we believe that a mutation is waiting for
# the mutations before it, rather than just being slow.
WAITING_SECONDS = 2


class ReactMutateTestCase(unittest.IsolatedAsyncioTestCase):

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

        await Greeter.Create(
            self.context,
            STATE_ID,
            title='Dr',
            name='Jonathan',
            adjective='initial',
        )

        self.session = aiohttp.ClientSession()

    async def asyncTearDown(self) -> None:
        await self.session.close()
        await self.rbt.stop()

    async def mutate(
        self,
        *,
        adjective: str,
        sequence: Optional[react_pb2.MutateRequest.Sequence] = None,
        idempotency_key: Optional[uuid.UUID] = None,
    ) -> react_pb2.MutateResponse:
        """Calls `React.Mutate` the same way a browser does."""
        async with self.session.post(
            self.rbt.url(
                f'/__/reboot/rpc/{STATE_REF.to_str()}/rbt.v1alpha1.React/Mutate'
            ),
            json=MessageToDict(
                react_pb2.MutateRequest(
                    method='SetAdjective',
                    request=SetAdjectiveRequest(
                        adjective=adjective,
                    ).SerializeToString(),
                    idempotency_key=str(idempotency_key or uuid.uuid4()),
                    sequence=sequence,
                )
            ),
        ) as response:
            self.assertEqual(200, response.status, await response.text())
            return ParseDict(
                await response.json(),
                react_pb2.MutateResponse(),
            )

    async def adjective(self) -> str:
        state = await Greeter.ref(STATE_ID).GetWholeState(self.context)
        return state.adjective

    async def test_without_sequence(self) -> None:
        response = await self.mutate(adjective='friendly')

        self.assertEqual('response', response.WhichOneof('response_or_status'))
        self.assertEqual('friendly', await self.adjective())

    async def test_status(self) -> None:
        """Tests that a mutation that fails has a status for a response."""
        async with self.session.post(
            self.rbt.url(
                f'/__/reboot/rpc/{STATE_REF.to_str()}/rbt.v1alpha1.React/Mutate'
            ),
            json=MessageToDict(
                react_pb2.MutateRequest(
                    method='TestLongRunningWriter',
                    idempotency_key=str(uuid.uuid4()),
                )
            ),
        ) as response:
            self.assertEqual(200, response.status, await response.text())
            mutate_response = ParseDict(
                await response.json(),
                react_pb2.MutateResponse(),
            )

        self.assertEqual(
            'status',
            mutate_response.WhichOneof('response_or_status'),
        )

    async def test_out_of_order(self) -> None:
        """Tests that mutations are performed in the order of their numbers
        even though that is not the order that they arrive in."""
        sequence_id = str(uuid.uuid4())

        third = asyncio.create_task(
            self.mutate(
                adjective='third',
                sequence=react_pb2.MutateRequest.Sequence(
                    id=sequence_id,
                    number=2,
                    first_outstanding_number=0,
                ),
            )
        )

        second = asyncio.create_task(
            self.mutate(
                adjective='second',
                sequence=react_pb2.MutateRequest.Sequence(
                    id=sequence_id,
                    number=1,
                    first_outstanding_number=0,
                ),
            )
        )

        done, _ = await asyncio.wait(
            [second, third],
            timeout=WAITING_SECONDS,
        )

        self.assertEqual(0, len(done))
        self.assertEqual('initial', await self.adjective())

        await self.mutate(
            adjective='first',
            sequence=react_pb2.MutateRequest.Sequence(
                id=sequence_id,
                number=0,
                first_outstanding_number=0,
            ),
        )

        await second
        await third

        # If the mutations had been performed in the order they
        # arrived in then this would be 'first'.
        self.assertEqual('third', await self.adjective())

    async def test_retry(self) -> None:
        """Tests that retrying a mutation that has already been performed
        does not wait for anything."""
        sequence_id = str(uuid.uuid4())
        idempotency_key = uuid.uuid4()

        for _ in range(2):
            await asyncio.wait_for(
                self.mutate(
                    adjective='first',
                    sequence=react_pb2.MutateRequest.Sequence(
                        id=sequence_id,
                        number=0,
                        first_outstanding_number=0,
                    ),
                    idempotency_key=idempotency_key,
                ),
                timeout=WAITING_SECONDS,
            )

        self.assertEqual('first', await self.adjective())

    async def test_unknown_sequence(self) -> None:
        """Tests that a server that has not heard of a sequence, e.g.,
        because it restarted, picks it up at the first mutation that
        is outstanding."""
        sequence_id = str(uuid.uuid4())

        second = asyncio.create_task(
            self.mutate(
                adjective='second',
                sequence=react_pb2.MutateRequest.Sequence(
                    id=sequence_id,
                    number=8,
                    first_outstanding_number=7,
                ),
            )
        )

        done, _ = await asyncio.wait([second], timeout=WAITING_SECONDS)

        self.assertEqual(0, len(done))

        await asyncio.wait_for(
            self.mutate(
                adjective='first',
                sequence=react_pb2.MutateRequest.Sequence(
                    id=sequence_id,
                    number=7,
                    first_outstanding_number=7,
                ),
            ),
            timeout=WAITING_SECONDS,
        )

        await second

        self.assertEqual('second', await self.adjective())

    async def test_cancelled(self) -> None:
        """Tests that mutations keep waiting for a mutation that was
        cancelled, because it will be retried."""
        sequence_id = str(uuid.uuid4())

        # Sending the second mutation first means the first mutation
        # has not been performed yet when we cancel the second one.
        second = asyncio.create_task(
            self.mutate(
                adjective='second',
                sequence=react_pb2.MutateRequest.Sequence(
                    id=sequence_id,
                    number=1,
                    first_outstanding_number=0,
                ),
            )
        )

        third = asyncio.create_task(
            self.mutate(
                adjective='third',
                sequence=react_pb2.MutateRequest.Sequence(
                    id=sequence_id,
                    number=2,
                    first_outstanding_number=0,
                ),
            )
        )

        done, _ = await asyncio.wait(
            [second, third],
            timeout=WAITING_SECONDS,
        )

        self.assertEqual(0, len(done))

        second.cancel()

        with self.assertRaises(asyncio.CancelledError):
            await second

        await self.mutate(
            adjective='first',
            sequence=react_pb2.MutateRequest.Sequence(
                id=sequence_id,
                number=0,
                first_outstanding_number=0,
            ),
        )

        done, _ = await asyncio.wait([third], timeout=WAITING_SECONDS)

        self.assertEqual(0, len(done))
        self.assertEqual('first', await self.adjective())

        # Now retry the mutation that was cancelled.
        await self.mutate(
            adjective='second',
            sequence=react_pb2.MutateRequest.Sequence(
                id=sequence_id,
                number=1,
                first_outstanding_number=1,
            ),
        )

        await third

        self.assertEqual('third', await self.adjective())


if __name__ == '__main__':
    unittest.main()
