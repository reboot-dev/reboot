import asyncio
import unittest
from rbt.v1alpha1.errors_pb2 import NotFound, StateNotConstructed
from reboot.aio.applications import Application
from reboot.aio.external import ExternalContext
from reboot.aio.tests import Reboot
from reboot.inspect.companion_app.servicers import servicers
from reboot.std.presence.v1.presence import Presence, Subscriber


class TestCompanionApp(unittest.IsolatedAsyncioTestCase):
    """Checks that the companion application stands up on its own and
    that presence works against it, which is the whole reason it
    exists."""

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(Application(servicers=servicers()))

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def make_connection(
        self,
        presence_ref: Presence.WeakReference,
        subscriber_ref: Subscriber.WeakReference,
        context: ExternalContext,
        nonce: str,
    ) -> asyncio.Task:
        """Connects `subscriber_ref` and subscribes it to `presence_ref`.

        `Toggle` is retried because it races `Connect`, which is what
        registers the connection; until that has happened `Toggle`
        reports `NotFound`. Returns the task running `Connect`, which
        stays pending for as long as the subscriber is present.
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

        attempt = 0
        while not connect_failed:
            try:
                await subscriber_ref.idempotently(
                    f"Attempt {attempt}",
                ).Toggle(context, nonce=nonce)
            except Subscriber.ToggleAborted as aborted:
                if isinstance(aborted.error, NotFound):
                    attempt += 1
                    continue
                raise

            await presence_ref.Subscribe(
                context, subscriber_id=subscriber_ref.state_id
            )
            break

        return connect_task

    async def test_presence_reports_a_connected_subscriber(self) -> None:
        context = self.rbt.create_external_context(name=f"test-{self.id()}")

        presence = Presence.ref("dashboard")
        subscriber = Subscriber.ref("a-dashboard-tab")

        # Before anyone has ever subscribed the `Presence` state does
        # not exist, so `List` aborts rather than reporting an empty
        # list. Anything deciding "is a dashboard open?" has to read
        # that abort as "no", because it is exactly the state a
        # freshly started companion is in.
        with self.assertRaises(Presence.ListAborted) as aborted:
            await presence.List(context)
        self.assertIsInstance(aborted.exception.error, StateNotConstructed)

        connect_task = await self.make_connection(
            presence, subscriber, context, nonce="nonce"
        )

        response = await presence.List(context)
        self.assertEqual(list(response.subscriber_ids), [subscriber.state_id])

        # Cancelling `Connect` is what a closing browser tab does, and
        # the subscriber must drain back out again.
        connect_task.cancel()

        async for response in presence.reactively().List(context):
            if list(response.subscriber_ids) == []:
                break


if __name__ == '__main__':
    unittest.main()
