import asyncio
import unittest
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot
from reboot.protobuf import as_int, as_str, from_int, from_str, pack, unpack
from reboot.std.collections.queue.v1.queue import (
    DEFAULT_BULK_COUNT,
    DequeueResponse,
    Queue,
    servicers,
)
from reboot.std.item.v1.item import Item
from tests.reboot.greeter_rbt import CreateRequest


class TestQueue(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_single_value(self) -> None:
        """
        Test that we can do a simple enqueue and a dequeue with a `Value`.
        """
        await self.rbt.up(Application(
            servicers=servicers(),
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        queue = Queue.ref("test-queue")

        # Enqueue single `Value`.
        await queue.enqueue(context, value=from_str("tree"))

        # Dequeue single `Value`.
        item = await queue.dequeue(context)

        # Test which field is set.
        self.assertFalse(item.HasField("any"))
        self.assertFalse(item.HasField("bytes"))
        self.assertTrue(item.HasField("value"))

        # Test expected values.
        self.assertEqual(as_str(item.value), "tree")

    async def test_single_bytes(self) -> None:
        """
        Test that we can do a simple enqueue and a dequeue with a `bytes`.
        """
        await self.rbt.up(Application(
            servicers=servicers(),
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        queue = Queue.ref("test-queue")

        # Enqueue single `bytes`.
        await queue.enqueue(context, bytes=b"brownies")

        # Dequeue single `bytes`.
        item = await queue.dequeue(context)

        # Test which field is set.
        self.assertFalse(item.HasField("any"))
        self.assertTrue(item.HasField("bytes"))
        self.assertFalse(item.HasField("value"))

        # Test expected values.
        self.assertEqual(item.bytes, b"brownies")

    async def test_single_any(self) -> None:
        await self.rbt.up(Application(
            servicers=servicers(),
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        queue = Queue.ref("test-queue")

        # Enqueue single `Any`.
        # Any proto will work here.
        message = CreateRequest(
            title="king",
            name="nemo",
            adjective="fishy",
        )
        await queue.enqueue(context, any=pack(message))

        # Dequeue single `Any`.
        item = await queue.dequeue(context)
        unpacked_item = unpack(item.any, CreateRequest)

        self.assertEqual(unpacked_item.title, "king")
        self.assertEqual(unpacked_item.name, "nemo")
        self.assertEqual(unpacked_item.adjective, "fishy")

    async def test_bulk_enqueue_items(self) -> None:
        """
        Test that we can do a bulk enqueue and a dequeue.
        """
        await self.rbt.up(Application(
            servicers=servicers(),
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        queue = Queue.ref("test-queue")

        # Enqueue multiple `Item`s.
        await queue.enqueue(
            context, items=[
                Item(value=from_str("apple")),
                Item(value=from_str("gum")),
                Item(value=from_str("ice")),
            ]
        )
        await queue.enqueue(
            context, items=[
                Item(value=from_str("watch")),
                Item(value=from_str("lemon")),
            ]
        )

        # Dequeue two.
        bulk_items = await queue.dequeue(context, bulk=True, at_most=2)
        self.assertEqual(len(bulk_items.items), 2)
        self.assertEqual(as_str(bulk_items.items[0].value), "apple")
        self.assertEqual(as_str(bulk_items.items[1].value), "gum")

        # Dequeue two.
        bulk_items = await queue.dequeue(context, bulk=True, at_most=2)
        self.assertEqual(len(bulk_items.items), 2)
        self.assertEqual(as_str(bulk_items.items[0].value), "ice")
        self.assertEqual(as_str(bulk_items.items[1].value), "watch")

    async def test_dequeue_more_items_than_enqueued(self) -> None:
        """
        Test that we can dequeue fewer items than `at_most`.
        """
        await self.rbt.up(Application(
            servicers=servicers(),
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        queue = Queue.ref("test-queue")

        # Enqueue multiple `Item`s.
        await queue.enqueue(
            context, items=[
                Item(value=from_str("apple")),
                Item(value=from_str("gum")),
            ]
        )

        # Try to dequeue three.
        bulk_items = await queue.dequeue(context, bulk=True, at_most=3)
        self.assertEqual(len(bulk_items.items), 2)
        self.assertEqual(as_str(bulk_items.items[0].value), "apple")
        self.assertEqual(as_str(bulk_items.items[1].value), "gum")

    async def test_try_dequeue_before_enqueue(self) -> None:
        """
        Test that we can dequeue (non-blocking) before we enqueue.
        """
        await self.rbt.up(Application(
            servicers=servicers(),
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        queue = Queue.ref("test-queue")

        # Attempt to dequeue.
        response = await queue.try_dequeue(context, bulk=True)
        self.assertEquals(response, DequeueResponse())

    async def test_dequeue_bulk_default_at_most(self) -> None:
        """
        Test that when we bulk dequeue, a default value gets set for `at_most`.
        """
        await self.rbt.up(Application(
            servicers=servicers(),
        ))

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        queue = Queue.ref("test-queue")

        # Enqueue twice the default number of items to dequeue.
        items = [
            Item(value=from_int(n)) for n in range(DEFAULT_BULK_COUNT * 2)
        ]
        await queue.enqueue(context, items=items)

        response = await queue.dequeue(context, bulk=True)
        self.assertEqual(
            len(response.items), DEFAULT_BULK_COUNT,
            "Get a default number of items back when not setting `at_most`"
        )
        for i in range(DEFAULT_BULK_COUNT):
            self.assertEqual(as_int(response.items[i].value), i)

    async def test_dequeue_waits_for_item(self) -> None:
        await self.rbt.up(Application(
            servicers=servicers(),
        ))
        queue_name = "test-queue"
        has_dequeued = False

        async def dequeue():
            nonlocal has_dequeued
            context = self.rbt.create_external_context(
                name=f"test-{self.id()}-dequeue",
                app_internal=True,
            )
            response = await Queue.ref(queue_name).dequeue(
                context,
                bulk=True,
                at_most=10,
            )
            self.assertEqual(len(response.items), 3)
            self.assertEqual(as_str(response.items[0].value), "apple")
            self.assertEqual(as_str(response.items[1].value), "gum")
            self.assertEqual(as_str(response.items[2].value), "ice")
            has_dequeued = True

        dequeue_task: asyncio.Task = asyncio.create_task(dequeue())

        # Check that the dequeue is still waiting.
        self.assertFalse(
            has_dequeued,
            "Should not have managed to dequeue items before there are items."
        )

        # Enqueue items.
        context = self.rbt.create_external_context(
            name=f"test-{self.id()}-enqueue",
            app_internal=True,
        )
        await Queue.ref(queue_name).enqueue(
            context, items=[
                Item(value=from_str("apple")),
                Item(value=from_str("gum")),
                Item(value=from_str("ice")),
            ]
        )

        # Wait for the dequeue to finish.
        await dequeue_task

        self.assertTrue(
            has_dequeued, "Should have dequeued after items were enqueued."
        )


if __name__ == '__main__':
    unittest.main()
