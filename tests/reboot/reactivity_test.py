import asyncio
import unittest
from reboot.aio.applications import Application
from reboot.aio.contexts import ReaderContext
from reboot.aio.external import ExternalContext
from reboot.aio.tests import Reboot
from tests.reboot import greeter_rbt
from tests.reboot.greeter_rbt import Greeter
from tests.reboot.greeter_servicers import MyGreeterServicer
from typing import Optional

# `title` that marks a `Greeter` as one whose `Greet` reads another
# `Greeter`, named by its own `name`, rather than its own state.
PROXY_TITLE = 'proxy'


class ProxyingGreeterServicer(MyGreeterServicer):
    """A `Greeter` whose `Greet` returns the greeting of the `Greeter`
    named by its own `name` when its `title` is `PROXY_TITLE`. Reading
    such a `Greeter` reactively therefore transitively reads the other
    `Greeter` reactively."""

    async def Greet(
        self,
        context: ReaderContext,
        request: greeter_rbt.GreetRequest,
    ) -> greeter_rbt.GreetResponse:
        if self.state.title != PROXY_TITLE:
            return await super().Greet(context, request)

        return await Greeter.ref(self.state.name).Greet(
            context,
            name=request.name,
        )


class ReactivityTestCase(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self._accumulate_task: Optional[asyncio.Task] = None
        self._can_accumulate_next_adjective = asyncio.Event()
        self._accumulated_adjective = asyncio.Event()
        self._accumulated_adjectives: list[str] = []

        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        if self._accumulate_task is not None:
            await self._stop_accumulating()
        await self.rbt.stop()

    async def start_accumulating_adjectives(
        self, greeter: Greeter.WeakReference, context: ExternalContext
    ):

        async def _do():
            async for greeter_state in greeter.reactively(
            ).GetWholeState(context):
                self._accumulated_adjectives.append(greeter_state.adjective)
                self._accumulated_adjective.set()
                # Hold up the reactive reader until the test says we
                # may consume a next response.
                await self._can_accumulate_next_adjective.wait()

        self._accumulate_task = asyncio.create_task(_do())

    async def _stop_accumulating(self):
        assert self._accumulate_task is not None
        self._accumulate_task.cancel()
        try:
            await self._accumulate_task
        except asyncio.CancelledError:
            pass

    async def get_adjectives(self, expected_number: int) -> list[str]:
        while len(self._accumulated_adjectives) < expected_number:
            await self._accumulated_adjective.wait()
            self._accumulated_adjective.clear()

        return self._accumulated_adjectives

    async def test_reactive_get_all_state(self) -> None:
        """
        Regression test for https://github.com/reboot-dev/mono/issues/3135
        """
        self._can_accumulate_next_adjective.set()

        await self.rbt.up(Application(servicers=[MyGreeterServicer]))
        context = self.rbt.create_external_context(name=f"test-{self.id()}")
        greeter, _ = await Greeter.Create(
            context,
            "my-greeter",
            title="Mr.",
            name="Robot",
            adjective="reactive",
        )
        await self.start_accumulating_adjectives(greeter, context)
        self.assertEqual(["reactive"], await self.get_adjectives(1))

        # Changing the state should trigger another iteration of the reactive
        # reader.
        await greeter.SetAdjective(context, adjective="realistic")
        self.assertEqual(
            ["reactive", "realistic"],
            await self.get_adjectives(2),
        )

        # An operation that doesn't change the response should not trigger
        # another iteration of the reactive reader.
        await greeter.SetAdjective(context, adjective="realistic")
        await asyncio.sleep(0.1)  # Give bad race conditions a chance to show.
        self.assertEqual(
            ["reactive", "realistic"],
            await self.get_adjectives(2),
        )

    async def test_skip_to_latest(self) -> None:
        """
        Tests that a reactive reader that can't keep up with the rate of
        state changes skips straight to the latest state, instead of
        working its way through every state that it missed.
        """
        await self.rbt.up(Application(servicers=[MyGreeterServicer]))
        context = self.rbt.create_external_context(name=f"test-{self.id()}")
        greeter, _ = await Greeter.Create(
            context,
            "my-greeter",
            title="Mr.",
            name="Robot",
            adjective="reactive",
        )

        # Get the first response, then leave the reactive reader
        # blocked; it hasn't asked for a next response yet.
        await self.start_accumulating_adjectives(greeter, context)
        self.assertEqual(["reactive"], await self.get_adjectives(1))

        # Change the state several times while the reader is blocked.
        await greeter.SetAdjective(context, adjective="realistic")
        await greeter.SetAdjective(context, adjective="impressive")
        await greeter.SetAdjective(context, adjective="marvelous")
        await greeter.SetAdjective(context, adjective="fantastic")

        # Now let the reactive reader consume a next response. It must
        # be the latest state, not the oldest state it missed.
        self._can_accumulate_next_adjective.set()
        self.assertEqual(
            ["reactive", "fantastic"],
            await self.get_adjectives(2),
        )

    async def test_transitive_skip_to_latest(self) -> None:
        """
        Tests that a reactive reader that reads through another reactive
        reader also doesn't work its way through every state that it
        missed while it couldn't keep up.
        """
        await self.rbt.up(Application(servicers=[ProxyingGreeterServicer]))
        context = self.rbt.create_external_context(name=f"test-{self.id()}")

        greeter, _ = await Greeter.Create(
            context,
            "my-greeter",
            title="Mr.",
            name="Robot",
            adjective="reactive",
        )

        proxy, _ = await Greeter.Create(
            context,
            "my-proxy",
            title=PROXY_TITLE,
            name="my-greeter",
            adjective="unused",
        )

        greetings: list[str] = []
        greeted = asyncio.Event()
        can_greet_again = asyncio.Event()

        async def accumulate_greetings():
            async for response in proxy.reactively().Greet(
                context,
                name="Alice",
            ):
                greetings.append(response.message)
                greeted.set()
                await can_greet_again.wait()

        self._accumulate_task = asyncio.create_task(accumulate_greetings())

        async def get_greetings(expected_number: int) -> list[str]:
            while len(greetings) < expected_number:
                await greeted.wait()
                greeted.clear()
            return greetings

        # Get the first greeting, then leave the reader blocked.
        self.assertEqual(
            ["Hi Alice, I am Mr. Robot the reactive"],
            await get_greetings(1),
        )

        adjectives = [f"adjective-{index}" for index in range(10)]
        for adjective in adjectives:
            await greeter.SetAdjective(context, adjective=adjective)

        # Now let the reader consume responses again. It must arrive at
        # the latest state without seeing every state it missed; the
        # transitive read costs it at most one extra response, since the
        # response it already had in hand for the underlying `Greeter`
        # was produced before the last of the changes above.
        can_greet_again.set()

        latest = f"Hi Alice, I am Mr. Robot the {adjectives[-1]}"
        while greetings[-1] != latest:
            await greeted.wait()
            greeted.clear()

        self.assertLessEqual(len(greetings), 3, greetings)


if __name__ == '__main__':
    unittest.main()
