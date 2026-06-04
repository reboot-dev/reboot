import unittest
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot
from reboot.protobuf import as_dict, as_str
from reboot.std.collections.queue.v1.queue import queue_library
from reboot.std.collections.v1.sorted_map import sorted_map_library
from reboot.std.pubsub.v1.pubsub import pubsub_library

# Import used in PubSub documentation.
# isort: off
from reboot.std.collections.queue.v1.queue import Queue
from reboot.std.pubsub.v1.pubsub import Topic
# isort: on
from tests.reboot.greeter_rbt import CreateRequest


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

        await self.rbt.up(
            Application(
                libraries=[
                    pubsub_library(),
                    queue_library(),
                    sorted_map_library(),
                ]
            )
        )

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        test_topic = Topic.ref("test-topic")
        test_queue = Queue.ref("receiving-queue")

        # Subscribe to the topic with the queue.
        await test_topic.subscribe(context, queue_id=test_queue.state_id)

        # Publish to the topic.
        await test_topic.publish(context, bytes=b"a message")

        # Wait to get the message on the queue.
        message = await test_queue.dequeue(context)
        self.assertEqual(message.bytes, b"a message")

    async def test_multiple_publishes(self) -> None:
        """
        Test that if we publish multiple times on a topic,
        we can pick them up from the receiving queue.
        """

        await self.rbt.up(
            Application(
                libraries=[
                    pubsub_library(),
                    queue_library(),
                    sorted_map_library(),
                ]
            )
        )

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        test_topic = Topic.ref("test-topic")
        test_queue = Queue.ref("receiving-queue")

        # Subscribe to the topic with the queue.
        await test_topic.subscribe(context, queue_id=test_queue.state_id)

        # Publish to the topic.
        await test_topic.publish(context, bytes=b"first message")
        await test_topic.publish(context, bytes=b"second message")

        # Wait to get both messages in order.
        message1 = await test_queue.dequeue(context)
        message2 = await test_queue.dequeue(context)
        self.assertEqual(message1.bytes, b"first message")
        self.assertEqual(message2.bytes, b"second message")

    async def test_multiple_subscribers(self) -> None:
        """
        Test that we can publish to multiple subscribers.
        """

        await self.rbt.up(
            Application(
                libraries=[
                    pubsub_library(),
                    queue_library(),
                    sorted_map_library(),
                ]
            )
        )

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        test_topic = Topic.ref("test-topic")
        test_queue1 = Queue.ref("receiving-queue1")
        test_queue2 = Queue.ref("receiving-queue2")

        # Subscribe to the topic with the queue.
        await test_topic.subscribe(context, queue_id=test_queue1.state_id)
        await test_topic.subscribe(context, queue_id=test_queue2.state_id)

        # Publish to the topic.
        await test_topic.publish(context, bytes=b"a message")

        # Wait to get the message on the both queues.
        message1 = await test_queue1.dequeue(context)
        self.assertEqual(message1.bytes, b"a message")

        message2 = await test_queue2.dequeue(context)
        self.assertEqual(message2.bytes, b"a message")

    async def test_example_code_for_documentation(self) -> None:
        """
        Examples used in documentation for referencing, publish, and
        subscribe.
        """
        await self.rbt.up(
            Application(
                libraries=[
                    pubsub_library(),
                    queue_library(),
                    sorted_map_library(),
                ]
            )
        )

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        first_topic = Topic.ref("my-first-topic")
        second_topic = Topic.ref("my-second-topic")
        third_topic = Topic.ref("my-third-topic")

        # `any` needs to be defined for documentation. It won't actually
        # be shown. Any proto will do.
        any = CreateRequest(
            title="king",
            name="nemo",
            adjective="fishy",
        )

        # `first_queue` named differently for better readability when pulled
        # into doc examples.
        first_queue = Queue.ref("receiving-queue")
        second_queue = Queue.ref("queue2")
        third_queue = Queue.ref("queue3")

        await first_topic.subscribe(context, queue_id=first_queue.state_id)
        await second_topic.subscribe(context, queue_id=second_queue.state_id)
        await third_topic.subscribe(context, queue_id=third_queue.state_id)

        # Import used for documentation.
        from reboot.protobuf import from_dict, pack

        await first_topic.publish(
            context,
            value=from_dict({"details": "details-go-here"}),
        )

        await second_topic.publish(context, bytes=b"my-bytes")

        await third_topic.publish(context, any=pack(any))

        # This subscribe is repeated and the Queue is referenced by string
        # for example code in documentation.
        await first_topic.subscribe(context, queue_id="receiving-queue")

        response = await Queue.ref("receiving-queue").dequeue(context)

        # Check response
        self.assertTrue(response.HasField("value"))
        self.assertEqual(as_dict(response.value)["details"], "details-go-here")

    async def test_example_bulk_code_for_documentation(self) -> None:
        """
        Examples used in documentation for bulk publish.
        """
        await self.rbt.up(
            Application(
                libraries=[
                    pubsub_library(),
                    queue_library(),
                    sorted_map_library(),
                ]
            )
        )

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        first_topic = Topic.ref("my-first-topic")
        second_topic = Topic.ref("my-second-topic")
        third_topic = Topic.ref("my-third-topic")

        # `any` needs to be defined for documentation. It won't actually
        # be shown. Any proto will do.
        any = CreateRequest(
            title="king",
            name="nemo",
            adjective="fishy",
        )

        await first_topic.subscribe(context, queue_id="receiving-queue")

        # Import used in example.
        from reboot.protobuf import (
            from_bool,
            from_dict,
            from_int,
            from_list,
            from_str,
            pack,
        )
        from reboot.std.item.v1.item import Item

        await first_topic.publish(
            context,
            items=[
                Item(value=from_bool(True)),
                Item(value=from_int(3)),
                Item(value=from_str("apple")),
                Item(value=from_list(["a", "b", "c"])),
                Item(value=from_dict({"details": "details-go-here"})),
            ],
        )

        await second_topic.publish(
            context,
            items=[
                Item(bytes=b"some-bytes"),
                Item(bytes=b"some-more-bytes"),
            ],
        )

        await third_topic.publish(
            context,
            items=[
                Item(any=pack(any)),
                Item(any=pack(any)),
            ],
        )

        # Dequeue to consume messages.
        items = await Queue.ref("receiving-queue"
                               ).dequeue(context, bulk=True, at_most=5)
        self.assertEqual(len(items.items), 5)
        self.assertEqual(as_str(items.items[2].value), "apple")


if __name__ == '__main__':
    unittest.main()
