import asyncio
import unittest
from reboot.aio.applications import Application
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext, WriterContext
from reboot.aio.tests import Reboot
from tests.reboot.general_rbt import General, GeneralRequest, GeneralResponse
from tests.reboot.general_servicer import GeneralServicer
from typing import AsyncIterable


class CancellationTestCase(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_cancelled_error_propagation(self) -> None:
        """
        Tests that a cancelled task properly propagates a cancelled error to
        the rpc.
        """

        cancelled_error_caught_in_unary = False
        cancelled_error_caught_in_streaming = False

        # Initialize ready events to track when we can cancel the tasks and when
        # we can assert that the cancelled error was caught.
        unary_ready_to_cancel = asyncio.Event()
        unary_ready_to_assert = asyncio.Event()
        streaming_ready_to_cancel = asyncio.Event()
        streaming_ready_to_assert = asyncio.Event()

        class ReaderServicer(GeneralServicer):

            def authorizer(self):
                return allow()

            async def ConstructorWriter(
                self,
                context: WriterContext,
                state: General.State,
                request: GeneralRequest,
            ) -> GeneralResponse:
                return GeneralResponse()

            async def Reader(
                self,
                context: ReaderContext,
                state: General.State,
                request: GeneralRequest,
            ) -> GeneralResponse:
                try:
                    unary_ready_to_cancel.set()
                    await asyncio.Event().wait()
                except asyncio.CancelledError:
                    nonlocal cancelled_error_caught_in_unary
                    cancelled_error_caught_in_unary = True
                    unary_ready_to_assert.set()
                    raise

                return GeneralResponse()

            async def ClientStreamingReader(
                self,
                context: ReaderContext,
                states: AsyncIterable[General.State],
                requests: AsyncIterable[GeneralRequest],
            ) -> GeneralResponse:
                try:
                    streaming_ready_to_cancel.set()
                    await asyncio.Event().wait()
                except asyncio.CancelledError:
                    nonlocal cancelled_error_caught_in_streaming
                    cancelled_error_caught_in_streaming = True
                    streaming_ready_to_assert.set()
                    raise

                return GeneralResponse()

        await self.rbt.up(
            Application(servicers=[ReaderServicer]),
        )

        context = self.rbt.create_external_context(name=self.id())

        # Construct.
        g, _ = await General.ConstructorWriter(context)

        # Start task to Reader to test the unary case.
        reader_task = asyncio.create_task(g.Reader(context))

        # Wait for Reader to start running.
        await unary_ready_to_cancel.wait()

        # Cancel the task to propagate a cancelled error to Reader.
        reader_task.cancel()

        # Wait until Reader finishes running.
        try:
            await asyncio.wait_for(unary_ready_to_assert.wait(), timeout=20)
        except asyncio.TimeoutError:
            self.fail("Reader task did not finish running after cancellation")

        # Assert that the cancelled error was caught in the unary Reader.
        self.assertTrue(cancelled_error_caught_in_unary)

        async def async_iter(iterable):
            for item in iterable:
                yield item

        # Start task to ClientStreamingReader to test the streaming case.
        client_streaming_reader_task = asyncio.create_task(
            g.ClientStreamingReader(context, __requests__=async_iter([]))
        )

        # Wait for streaming reader to start running.
        await streaming_ready_to_cancel.wait()

        # Cancel the task to propagate a cancelled error to ClientStreamingReader.
        client_streaming_reader_task.cancel()

        # Wait until streaming reader finishes running.
        try:
            await asyncio.wait_for(
                streaming_ready_to_assert.wait(), timeout=20
            )
        except asyncio.TimeoutError:
            self.fail(
                "ClientStreamingReader task did not finish running after cancellation"
            )

        # Assert that the cancelled error was caught in the streaming Reader.
        self.assertTrue(cancelled_error_caught_in_streaming)


if __name__ == '__main__':
    unittest.main()
