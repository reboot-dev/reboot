import asyncio
import unittest
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot
from reboot.aio.types import StateRef
from tests.reboot import echo_rbt
from tests.reboot.echo_rbt import Echo, EchoWriterStub
from tests.reboot.echo_servicers import MyEchoServicer
from unittest import mock

_ECHO_REF = StateRef.from_id(Echo.__state_type_name__, 'test-1234')


class StreamingReadersTestCase(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_reader_unary_state_streaming(self) -> None:
        await self.rbt.up(Application(servicers=[MyEchoServicer]))

        context = self.rbt.create_external_context(name=self.id())

        stub = EchoWriterStub(context, state_ref=_ECHO_REF)

        message_first = 'Hello, first'
        message_second = 'Hello, second'
        message_third = 'Hello, third'

        async def echo(message: str):
            response = await stub.Reply(echo_rbt.ReplyRequest(message=message))
            self.assertEqual(message, response.message)

        await echo(message_first)

        wait_for_response_task = asyncio.create_task(
            stub.WaitFor(echo_rbt.WaitForRequest(message=message_third))
        )

        self.assertFalse(wait_for_response_task.done())

        await echo(message_second)

        self.assertFalse(wait_for_response_task.done())

        await echo(message_third)

        await wait_for_response_task

    async def test_reader_server_streaming(self) -> None:
        await self.rbt.up(Application(servicers=[MyEchoServicer]))

        context = self.rbt.create_external_context(name=self.id())

        echoer = Echo.ref(_ECHO_REF.id)

        message_first = 'Hello, first'
        message_second = 'Hello, second'
        message_third = 'Hello, third'

        async def echo(message: str):
            response = await echoer.Reply(context, message=message)
            self.assertEqual(message, response.message)

        await echo(message_first)

        responses: asyncio.Queue[echo_rbt.StreamResponse] = asyncio.Queue()

        async def stream_to_responses():
            async for response in echoer.Stream(context):
                await responses.put(response)

        stream_to_responses_task = asyncio.create_task(stream_to_responses())

        response_first = await responses.get()
        self.assertEqual(message_first, response_first.message)

        await echo(message_second)

        response_second = await responses.get()
        self.assertEqual(message_second, response_second.message)

        await echo(message_third)

        response_third = await responses.get()
        self.assertEqual(message_third, response_third.message)

        stream_to_responses_task.cancel()

    async def test_reader_bidi_streaming(self) -> None:
        await self.rbt.up(
            Application(servicers=[MyEchoServicer]),
        )

        # This test needs to know when a RegexStreamRequest has been
        # received by the actor in order to be deterministic. We use
        # an asyncio.Event and a mock to be able to determine when
        # that RegexStreamRequest has been received and processed.
        regex_updated = asyncio.Event()

        def mock_regex_update(regex: MyEchoServicer.Regex, value: str):
            regex.value = value
            regex_updated.set()

        with mock.patch(
            'tests.reboot.echo_servicers.MyEchoServicer.Regex.update',
            side_effect=mock_regex_update,
            autospec=True,
        ):
            context = self.rbt.create_external_context(name=self.id())

            stub = EchoWriterStub(context, state_ref=_ECHO_REF)

            message_first = 'Hello, first'
            message_second = 'Hello, second'
            message_third = 'Hello, third'
            message_email = 'Hello, benh@reboot.dev'

            async def echo(message: str):
                response = await stub.Reply(
                    echo_rbt.ReplyRequest(message=message)
                )
                self.assertEqual(message, response.message)

            await echo(message_first)

            requests: asyncio.Queue[echo_rbt.RegexStreamRequest
                                   ] = asyncio.Queue()
            responses: asyncio.Queue[echo_rbt.RegexStreamResponse
                                    ] = asyncio.Queue()

            async def stream_from_requests():
                while True:
                    yield await requests.get()

            async def stream_to_responses():
                async for response in stub.RegexStream(stream_from_requests()):
                    await responses.put(response)

            stream_to_responses_task = asyncio.create_task(
                stream_to_responses()
            )

            response_first = await responses.get()
            self.assertEqual(message_first, response_first.message)

            await requests.put(
                echo_rbt.RegexStreamRequest(
                    regex=r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
                )
            )

            await regex_updated.wait()

            await echo(message_second)
            await echo(message_third)
            await echo(message_email)

            response_email = await responses.get()
            self.assertEqual(message_email, response_email.message)

            stream_to_responses_task.cancel()


if __name__ == '__main__':
    unittest.main()
