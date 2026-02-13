import unittest
from hello_constructors.v1.hello_rbt import Hello
from hello_servicer import HelloServicer
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot


class TestHello(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_hello_constructors(self) -> None:
        await self.rbt.up(Application(servicers=[HelloServicer]))

        context = self.rbt.create_external_context(name=f"test-{self.id()}")

        # Create the state machine by calling its constructor. The fact that the
        # state machine _has_ a constructor means that this step is required
        # before other methods can be called on it.
        hello, _ = await Hello.create(context, initial_message="first message")

        # Send another message.
        await hello.send(context, message="second message")

        messages_response = await hello.messages(context)
        self.assertEqual(
            messages_response.messages, [
                "first message",
                "second message",
            ]
        )
