import asyncio
import reboot.std.presence.v1.presence
import unittest
from rbt.v1alpha1.errors_pb2 import AlreadyExists, FailedPrecondition, NotFound
from reboot.aio.applications import Application
from reboot.aio.external import ExternalContext
from reboot.aio.memoize import MemoizeServicer
from reboot.aio.tests import Reboot
from reboot.std.presence.v1.presence import (
    ListResponse,
    MousePosition,
    PositionResponse,
    Presence,
    StatusResponse,
    Subscriber,
)


class TestPresence(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(
            Application(
                servicers=reboot.std.presence.v1.presence.servicers() +
                [MemoizeServicer]
            )
        )

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def make_connection(
        self,
        presence_ref: Presence.WeakReference,
        subscriber_ref: Subscriber.WeakReference,
        context: ExternalContext,
        nonce: str,
    ) -> asyncio.Task:
        """
        Helper function to start a successful connection with the subscriber.
        We will continue to retry the `Toggle` call as it's run concurrently with
        the `Connect` call. We need to ensure that the `Connect` call is successful
        before making a successful `Toggle` call.
        """

        await subscriber_ref.idempotently().Create(context)

        connect_failed = False

        async def connect():
            nonlocal connect_failed
            try:
                await subscriber_ref.Connect(context, nonce=nonce)
            except:
                connect_failed = True

        connect_task = asyncio.create_task(connect())

        # Retry `Toggle` and `Subscribe` as long as connection hasn't failed.
        attempt_num = 0
        while not connect_failed:
            try:
                print(f"Testing attempt: {attempt_num}")
                await subscriber_ref.idempotently(
                    f"Attempt {attempt_num}",
                ).Toggle(context, nonce=nonce)
            except Subscriber.ToggleAborted as aborted:
                if isinstance(aborted.error, NotFound):
                    print("Retrying Toggle")
                    attempt_num += 1
                    continue
                raise

            await presence_ref.Subscribe(
                context, subscriber_id=subscriber_ref.state_id
            )

            # We've successfully subscribed and don't need to retry!
            break

        return connect_task

    async def test_mouse_position_basic(self) -> None:
        context = self.rbt.create_external_context(name=f"test-{self.id()}")

        mouse_position = MousePosition.ref("id")

        await mouse_position.Update(context, left=1, top=2)

        response: PositionResponse = await mouse_position.Position(context)
        self.assertEqual(response.left, 1)
        self.assertEqual(response.top, 2)

    async def test_fail_toggle(self) -> None:
        context = self.rbt.create_external_context(name=f"test-{self.id()}")

        subscriber = Subscriber.ref("testing-toggle-fail")

        await subscriber.Create(context)

        # `Toggle` should fail because we have not yet called `Connect`.
        with self.assertRaises(Subscriber.ToggleAborted) as aborted:
            await subscriber.Toggle(context, nonce="1")
        self.assertTrue(isinstance(aborted.exception.error, NotFound))

    async def test_fail_connect(self) -> None:
        context = self.rbt.create_external_context(name=f"test-{self.id()}")

        presence = Presence.ref("presence-testing-connect-fail")
        subscriber = Subscriber.ref("subscriber-testing-connect-fail")

        nonce = "1"

        connect_task = await self.make_connection(
            presence, subscriber, context, nonce
        )

        # `Connect` should fail because we have already made the connection with
        # the same `nonce`.
        with self.assertRaises(Subscriber.ConnectAborted) as aborted:
            await subscriber.Connect(context, nonce=nonce)
        self.assertTrue(isinstance(aborted.exception.error, AlreadyExists))

        connect_task.cancel()

    async def test_fail_subscribe(self) -> None:
        context = self.rbt.create_external_context(name=f"test-{self.id()}")

        presence = Presence.ref("presence-testing-subscribe-fail")
        subscriber = Subscriber.ref("subscriber-testing-subscribe-fail")

        await subscriber.Create(context)

        # `Subscribe` should fail because we have not yet made the connection and toggled.
        with self.assertRaises(Presence.SubscribeAborted) as aborted:
            await presence.Subscribe(
                context, subscriber_id=subscriber.state_id
            )
        self.assertTrue(
            isinstance(aborted.exception.error, FailedPrecondition)
        )

    async def test_redundant_subscribe(self) -> None:
        """
        Test that calling `Subscribe` multiple times with the same subscriber ID
        does not result in multiple subscribers being added to the list.
        """
        context = self.rbt.create_external_context(name=f"test-{self.id()}")

        presence = Presence.ref("presence-testing-redundant-subscribe")
        subscriber = Subscriber.ref("subscriber-testing-redundant-subscribe")

        nonce = "1"
        connect_task = await self.make_connection(
            presence, subscriber, context, nonce
        )

        status_response_after_first_subscribe: StatusResponse = await subscriber.Status(
            context
        )
        self.assertTrue(status_response_after_first_subscribe.present)

        list_response_after_first_subscribe: ListResponse = await presence.List(
            context
        )
        self.assertEqual(
            list_response_after_first_subscribe.subscriber_ids,
            [subscriber.state_id]
        )

        await presence.Subscribe(context, subscriber_id=subscriber.state_id)

        status_response_after_second_subscribe: StatusResponse = await subscriber.Status(
            context
        )
        self.assertTrue(status_response_after_second_subscribe.present)

        list_response_after_second_subscribe: ListResponse = await presence.List(
            context
        )
        self.assertEqual(
            list_response_after_second_subscribe.subscriber_ids,
            [subscriber.state_id]
        )

        connect_task.cancel()

    async def test_single_subscriber(self) -> None:
        """
        Test that we can successfully connect a single subscriber and verify
        that the state is updated correctly.
        """
        context = self.rbt.create_external_context(name=f"test-{self.id()}")

        presence = Presence.ref("presence-testing-single-subscriber")
        subscriber = Subscriber.ref("subscriber-testing-single-subscriber")

        nonce = "1"
        connect_task = await self.make_connection(
            presence, subscriber, context, nonce
        )

        status_response_before_cancel: StatusResponse = await subscriber.Status(
            context
        )
        self.assertTrue(status_response_before_cancel.present)

        list_response_before_cancel: ListResponse = await presence.List(
            context
        )
        self.assertEqual(
            list_response_before_cancel.subscriber_ids, [subscriber.state_id]
        )

        connect_task.cancel()

        # We need to wait until the tasks scheduled in the background
        # update things based on the cancelled connection. We use reactively
        # to do so, and let the test timeout if we never get the response we
        # are expecting.
        async for response in subscriber.reactively().Status(context):
            if not response.present:
                break

        async for response in presence.reactively().List(context):
            if response.subscriber_ids == []:
                break


if __name__ == '__main__':
    unittest.main()