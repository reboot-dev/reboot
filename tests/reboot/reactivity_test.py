import asyncio
import unittest
from reboot.aio.applications import Application
from reboot.aio.external import ExternalContext
from reboot.aio.tests import Reboot
from tests.reboot.greeter_rbt import Greeter
from tests.reboot.greeter_servicers import MyGreeterServicer
from typing import Optional


class ReactivityTestCase(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self._accumulate_task: Optional[asyncio.Task] = None
        self._accumulated_adjective = asyncio.Event()
        self._accumulated_adjectives: list[str] = []

        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        if self._accumulate_task is not None:
            await self._stop_accumulating_adjectives()
        await self.rbt.stop()

    async def start_accumulating_adjectives(
        self, greeter: Greeter.WeakReference, context: ExternalContext
    ):

        async def _do():
            async for greeter_state in greeter.reactively(
            ).GetWholeState(context):
                self._accumulated_adjectives.append(greeter_state.adjective)
                self._accumulated_adjective.set()

        self._accumulate_task = asyncio.create_task(_do())

    async def _stop_accumulating_adjectives(self):
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


if __name__ == '__main__':
    unittest.main()
