import asyncio
import unittest
from rbt.v1alpha1.errors_pb2 import (
    AlreadyExists,
    FailedPrecondition,
    NotFound,
    PermissionDenied,
)
from reboot.aio.applications import Application
from reboot.aio.auth import Auth
from reboot.aio.auth.authorizers import allow
from reboot.aio.auth.token_verifiers import TokenVerifier, VerifyTokenResult
from reboot.aio.contexts import ReaderContext
from reboot.aio.external import ExternalContext
from reboot.aio.memoize import MemoizeServicer
from reboot.aio.tests import Reboot

# Import used in Presence documentation, so we want to keep them separate.
# isort: off
from reboot.std.presence.v1.presence import (
    MousePosition,
    Presence,
    Subscriber,
)
# isort: on
from reboot.std.presence.v1.presence import (
    ListResponse,
    PositionResponse,
    StatusResponse,
    presence_library,
)
from typing import Optional


class EmptyTokenVerifier(TokenVerifier):
    """Test token verifier that always returns that this is a valid Auth token."""

    async def verify_token(
        self,
        context: ReaderContext,
        token: Optional[str],
    ) -> VerifyTokenResult:
        return Auth(user_id=token or "default-user")


class TestPresence(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()

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
        await self.rbt.up(
            Application(
                servicers=[MemoizeServicer],
                libraries=[presence_library()],
                token_verifier=EmptyTokenVerifier(),
            )
        )

        context = self.rbt.create_external_context(name=f"test-{self.id()}")

        mouse_position = MousePosition.ref("id")

        await mouse_position.Update(context, left=1, top=2)

        response: PositionResponse = await mouse_position.Position(context)
        self.assertEqual(response.left, 1)
        self.assertEqual(response.top, 2)

    async def test_fail_toggle(self) -> None:
        await self.rbt.up(
            Application(
                servicers=[MemoizeServicer],
                libraries=[presence_library()],
                token_verifier=EmptyTokenVerifier(),
            )
        )

        context = self.rbt.create_external_context(name=f"test-{self.id()}")

        subscriber = Subscriber.ref("testing-toggle-fail")

        await subscriber.Create(context)

        # `Toggle` should fail because we have not yet called `Connect`.
        with self.assertRaises(Subscriber.ToggleAborted) as aborted:
            await subscriber.Toggle(context, nonce="1")
        self.assertTrue(isinstance(aborted.exception.error, NotFound))

    async def test_fail_connect(self) -> None:
        await self.rbt.up(
            Application(
                servicers=[MemoizeServicer],
                libraries=[presence_library()],
                token_verifier=EmptyTokenVerifier(),
            )
        )

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
        await self.rbt.up(
            Application(
                servicers=[MemoizeServicer],
                libraries=[presence_library()],
                token_verifier=EmptyTokenVerifier(),
            )
        )

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
        await self.rbt.up(
            Application(
                servicers=[MemoizeServicer],
                libraries=[presence_library()],
                token_verifier=EmptyTokenVerifier(),
            )
        )

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
        await self.rbt.up(
            Application(
                servicers=[MemoizeServicer],
                libraries=[presence_library()],
                token_verifier=EmptyTokenVerifier(),
            )
        )

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

    async def test_no_token_verifier_fails_default_auth(self) -> None:
        """
        Test that not using a TokenVerifier fails default authorization for
        Presence.
        """
        await self.rbt.up(
            Application(
                servicers=[MemoizeServicer],
                libraries=[presence_library()],
            )
        )

        # Assert that Subscriber calls cannot be made.
        context = self.rbt.create_external_context(name=f"test-{self.id()}-1")
        with self.assertRaises(Subscriber.CreateAborted) as subscriber_aborted:
            await Subscriber.ref("subscriber").idempotently().create(context)
        self.assertTrue(
            isinstance(subscriber_aborted.exception.error, PermissionDenied)
        )

        # Assert that Presence calls cannot be made.
        # Needs own context due to idempotency logic given earlier call fails.
        context = self.rbt.create_external_context(name=f"test-{self.id()}-2")
        with self.assertRaises(Presence.SubscribeAborted) as presence_aborted:
            await Presence.ref("presence"
                              ).subscribe(context, subscriber_id="subscriber")
        self.assertTrue(
            isinstance(presence_aborted.exception.error, PermissionDenied)
        )

        # Assert that MousePosition calls cannot be made.
        # Needs own context due to idempotency logic given earlier calls fail.
        context = self.rbt.create_external_context(name=f"test-{self.id()}-3")
        with self.assertRaises(
            MousePosition.UpdateAborted
        ) as mouse_position_aborted:
            await MousePosition.ref("subscriber").update(
                context,
                left=1,
                top=1,
            )
        self.assertTrue(
            isinstance(
                mouse_position_aborted.exception.error, PermissionDenied
            )
        )

    async def test_override_auth_allows(self) -> None:
        """
        Test that overriding auth allows you to call into the library with a
        token.
        """
        await self.rbt.up(
            Application(
                servicers=[MemoizeServicer],
                libraries=[presence_library(authorizer=allow())],
            )
        )

        context = self.rbt.create_external_context(name=f"test-{self.id()}")

        presence = Presence.ref("presence-testing-connect-fail")
        subscriber = Subscriber.ref("subscriber-testing-connect-fail")

        nonce = "1"

        # This will test calling into Subscriber and Presence servicers.
        connect_task = await self.make_connection(
            presence, subscriber, context, nonce
        )

        # Check that calls into Mouse Position can be made.
        await MousePosition.ref(subscriber.state_id).update(
            context,
            left=1,
            top=1,
        )

        connect_task.cancel()

    async def test_pass_too_many_authorizers_assert(self) -> None:
        """
        Test if you pass in authorizer and specific authorizers into
        `presence_library` that it fails with an assert.
        """
        with self.assertRaises(AssertionError):
            await self.rbt.up(
                Application(
                    servicers=[MemoizeServicer],
                    libraries=[
                        presence_library(
                            authorizer=allow(),
                            presence_authorizer=Presence.Authorizer(
                                subscribe=allow()
                            ),
                        )
                    ],
                )
            )


if __name__ == '__main__':
    unittest.main()
