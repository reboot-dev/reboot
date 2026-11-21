import asyncio
import unittest
from google.protobuf.empty_pb2 import Empty
from rbt.v1alpha1 import errors_pb2
from rbt.v1alpha1.statecharts import statechart_pb2
from reboot.aio.applications import Application
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext, WorkflowContext, WriterContext
from reboot.aio.tests import Reboot
from reboot.statecharts.events import status_event_from_message
from tests.reboot.statecharts import turnstile_pb2
from tests.reboot.statecharts.turnstile_rbt import Turnstile


class TurnstileServicer(Turnstile.Servicer):
    """A turnstile whose statechart, which is in `turnstile.proto`,
    starts in `LOCKED`. A `Coin` of at least 25 cents, which it counts,
    makes it `UNLOCKED`, where it is rotating until a test lets it
    finish, and a `Pushed` then makes it `LOCKED` again.

    It has `insert` for a `Coin` and `push` for a `Pushed`, which are
    the event methods of the statechart, and implements neither."""

    # Set by a test to let `rotate` finish.
    rotated: asyncio.Event

    def authorizer(self):
        return allow()

    async def create(
        self,
        context: WriterContext,
        request: Empty,
    ) -> Empty:
        return Empty()

    async def get(
        self,
        context: ReaderContext,
        request: Empty,
    ) -> Turnstile.State:
        return self.state

    async def status(
        self,
        context: ReaderContext,
        request: Empty,
    ) -> statechart_pb2.Status:
        return self.statechart(context).status()

    def is_enough(
        self,
        state: Turnstile.State,
        event: turnstile_pb2.Coin,
    ) -> bool:
        return event.cents >= 25

    def count(self, state: Turnstile.State, event: turnstile_pb2.Coin) -> None:
        state.coins += 1

    @classmethod
    async def rotate(cls, context: WorkflowContext) -> None:
        await TurnstileServicer.rotated.wait()


class EventMethodTest(unittest.IsolatedAsyncioTestCase):
    """Tests the event methods of a statechart in an application, with
    the turnstile of `TurnstileServicer`."""

    async def asyncSetUp(self) -> None:
        TurnstileServicer.rotated = asyncio.Event()

        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(Application(servicers=[TurnstileServicer]))
        self.context = self.rbt.create_external_context(name=self.id())
        self.turnstile, _ = await Turnstile.Create(self.context, "turnstile")

    async def asyncTearDown(self) -> None:
        # Let `rotate` finish, so that its task is not left running.
        TurnstileServicer.rotated.set()
        await self.rbt.stop()

    async def status_once(self, holds) -> statechart_pb2.Status:
        """Returns the status of the turnstile once `holds` returns
        true for it."""
        async for status, _ in self.turnstile.reactively().Status(
            self.context,
        ):
            if holds(status):
                return status
        raise AssertionError("Unreachable")

    async def test_event_method_has_statechart_handle_its_event(self) -> None:
        await self.turnstile.Insert(self.context, cents=25)

        status = await self.turnstile.Status(self.context)

        self.assertEqual("UNLOCKED", status.active)
        # The action of the transition was given the `Coin`.
        self.assertEqual(1, (await self.turnstile.Get(self.context)).coins)

    async def test_event_method_fails_if_no_transition_is_for_its_event(
        self,
    ) -> None:
        # `LOCKED` has no transition on a `Pushed`.
        with self.assertRaises(Turnstile.PushAborted) as raised:
            await self.turnstile.Push(self.context)

        self.assertIsInstance(
            raised.exception.error,
            errors_pb2.FailedPrecondition,
        )
        self.assertIn(
            "No transition of the statechart of "
            "'tests.reboot.statecharts.Turnstile' fires for the event "
            "'tests.reboot.statecharts.Pushed' in the state 'LOCKED'",
            str(raised.exception),
        )

        # Nothing was enqueued.
        self.assertEqual(
            statechart_pb2.Status(active="LOCKED"),
            await self.turnstile.Status(self.context),
        )

    async def test_event_method_fails_if_guard_does_not_hold(self) -> None:
        with self.assertRaises(Turnstile.InsertAborted) as raised:
            await self.turnstile.Insert(self.context, cents=5)

        self.assertIsInstance(
            raised.exception.error,
            errors_pb2.FailedPrecondition,
        )
        self.assertEqual(
            statechart_pb2.Status(active="LOCKED"),
            await self.turnstile.Status(self.context),
        )
        self.assertEqual(0, (await self.turnstile.Get(self.context)).coins)

    async def test_event_of_event_method_waits_for_schedule(self) -> None:
        await self.turnstile.Insert(self.context, cents=25)

        await self.status_once(lambda status: len(status.activities) == 1)

        # The transition for the `Pushed` would exit `UNLOCKED`, which
        # `rotate` is still running in, so the event waits, and the
        # method does not fail.
        await self.turnstile.Push(self.context)

        status = await self.turnstile.Status(self.context)

        self.assertEqual("UNLOCKED", status.active)
        self.assertEqual(
            [status_event_from_message(turnstile_pb2.Pushed())],
            list(status.queue),
        )

        # An event that is behind one that waits is not looked at
        # yet, so its method does not fail either, though no
        # transition of `UNLOCKED` is for a `Coin`.
        await self.turnstile.Insert(self.context, cents=25)

        TurnstileServicer.rotated.set()

        # The `Pushed` makes the turnstile `LOCKED`, and then the
        # `Coin` makes it `UNLOCKED` again.
        await self.status_once(
            lambda status: status.active == "UNLOCKED" and len(status.queue) ==
            0,
        )

        self.assertEqual(2, (await self.turnstile.Get(self.context)).coins)


if __name__ == "__main__":
    unittest.main()
