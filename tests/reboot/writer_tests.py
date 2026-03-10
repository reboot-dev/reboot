import unittest
from rbt.v1alpha1.errors_pb2 import (
    StateAlreadyConstructed,
    StateNotConstructed,
)
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot
from reboot.aio.tracing import function_span
from reboot.aio.types import StateRef
from tests.reboot import echo_rbt, greeter_rbt
from tests.reboot.echo_rbt import Echo, EchoWriterStub
from tests.reboot.echo_servicers import MyEchoServicer
from tests.reboot.greeter_rbt import Greeter, GreeterWriterStub
from tests.reboot.greeter_servicers import MyGreeterServicer

_GREETER_REF = StateRef.from_id(Greeter.__state_type_name__, 'test-1234')
_ECHO_REF = StateRef.from_id(Echo.__state_type_name__, 'test-1234')


class WriterTestCase(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    @function_span()
    async def test_reader_before_construction(self) -> None:
        await self.rbt.up(Application(servicers=[MyGreeterServicer]))

        context = self.rbt.create_external_context(name=self.id())

        stub = GreeterWriterStub(context, state_ref=_GREETER_REF)

        with self.assertRaises(Greeter.GreetAborted) as aborted:
            await stub.Greet(greeter_rbt.GreetRequest(name='tester'))

        self.assertEqual(type(aborted.exception.error), StateNotConstructed)

    @function_span()
    async def test_writer_before_construction(self) -> None:
        await self.rbt.up(Application(servicers=[MyGreeterServicer]))

        context = self.rbt.create_external_context(name=self.id())

        stub = GreeterWriterStub(context, state_ref=_GREETER_REF)

        with self.assertRaises(Greeter.SetAdjectiveAborted) as aborted:
            await stub.SetAdjective(
                greeter_rbt.SetAdjectiveRequest(adjective='only')
            )

        self.assertEqual(type(aborted.exception.error), StateNotConstructed)

        self.assertTrue(aborted.exception.error.requires_constructor)

    @function_span()
    async def test_no_constructors_makes_writer_a_constructor(self) -> None:
        await self.rbt.up(Application(servicers=[MyEchoServicer]))

        context = self.rbt.create_external_context(name=self.id())

        stub = EchoWriterStub(context, state_ref=_ECHO_REF)

        message = 'Hello World!'

        echo_response: echo_rbt.ReplyResponse = await stub.Reply(
            echo_rbt.ReplyRequest(message=message)
        )

        self.assertEqual(echo_response.message, message)

    @function_span()
    async def test_reader_after_a_writer(self) -> None:
        await self.rbt.up(Application(servicers=[MyEchoServicer]))

        context = self.rbt.create_external_context(name=self.id())

        stub = EchoWriterStub(context, state_ref=_ECHO_REF)

        message = 'Hello World!'

        echo_response: echo_rbt.ReplyResponse = await stub.Reply(
            echo_rbt.ReplyRequest(message=message)
        )
        self.assertEqual(echo_response.message, message)

        replay_response = await stub.Replay(echo_rbt.ReplayRequest())
        self.assertEqual([message], replay_response.messages)

    @function_span()
    async def test_constructor_after_constructor(self) -> None:
        await self.rbt.up(Application(servicers=[MyGreeterServicer]))

        context = self.rbt.create_external_context(name=self.id())

        stub = GreeterWriterStub(context, state_ref=_GREETER_REF)

        await stub.Create(
            greeter_rbt.CreateRequest(
                title='Dr', name='Jonathan', adjective='best'
            )
        )

        with self.assertRaises(Greeter.CreateAborted) as aborted:
            await stub.Create(
                greeter_rbt.CreateRequest(
                    title='Dr', name='Jonathan', adjective='best'
                )
            )

        self.assertEqual(
            type(aborted.exception.error), StateAlreadyConstructed
        )

    @function_span()
    async def test_reader_writer_after_constructor(self) -> None:
        await self.rbt.up(Application(servicers=[MyGreeterServicer]))

        context = self.rbt.create_external_context(name=self.id())

        stub = GreeterWriterStub(context, state_ref=_GREETER_REF)

        await stub.Create(
            greeter_rbt.CreateRequest(
                title='Dr', name='Jonathan', adjective='best'
            )
        )

        greet_response: greeter_rbt.GreetResponse = await stub.Greet(
            greeter_rbt.GreetRequest(name='tester')
        )
        self.assertEqual(
            'Hi tester, I am Dr Jonathan the best', greet_response.message
        )

        await stub.SetAdjective(
            greeter_rbt.SetAdjectiveRequest(adjective='only')
        )

        greet_response = await stub.Greet(
            greeter_rbt.GreetRequest(name='tester')
        )
        self.assertEqual(
            'Hi tester, I am Dr Jonathan the only', greet_response.message
        )


if __name__ == '__main__':
    unittest.main()
