import unittest
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot
from reboot.std.collections.queue.v1.queue import Queue
from reboot.std.pubsub.v1.pubsub import Topic, servicers


class TestPubsub(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_basic(self) -> None:
        """
        Test that we can subscribe and publish to a `Topic`.
        """

        await self.rbt.up(Application(servicers=servicers()))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        test_topic = Topic.ref("test-topic")
        test_queue = Queue.ref("receiving-queue")

        # Subscribe to the topic with the queue.
        await test_topic.Subscribe(context, queue_id=test_queue.state_id)

        # Publish to the topic.
        await test_topic.Publish(context, bytes=b"a message")

        # Wait to get the message on the queue.
        message = await test_queue.Dequeue(context)
        self.assertEqual(message.bytes, b"a message")


if __name__ == '__main__':
    unittest.main()
