import hello_servicer
import unittest
from hello_servicer import HelloServicer
from hello_tasks.v1.hello_rbt import Hello
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot


class TestHello(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_hello_tasks(self) -> None:
        # To make our test run quickly, remove delays before erasing the
        # message.
        hello_servicer.SECS_UNTIL_WARNING = 0
        hello_servicer.ADDITIONAL_SECS_UNTIL_ERASE = 0
        await self.rbt.up(
            Application(servicers=[HelloServicer]),
        )

        context = self.rbt.create_external_context(name=f"test-{self.id()}")

        hello = Hello.ref("testing-hello")

        # Send a message.
        send_response = await hello.send(context, message="Hello, World!")

        # Wait for the message to be erased.
        warning_response = await Hello.WarningTask.retrieve(
            context,
            task_id=send_response.task_id,
        )
        await Hello.EraseTask.retrieve(
            context,
            task_id=warning_response.task_id,
        )

        # Check that the current list of messages reflects the erasure.
        messages_response = await hello.messages(context)
        self.assertEqual(len(messages_response.messages), 1)
        self.assertEqual(
            messages_response.messages[0],
            "Number of messages erased so far: 1",
        )
