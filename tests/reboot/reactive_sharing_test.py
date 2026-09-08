"""Tests that subscriptions asking the identical reactive question
share a single execution of the reader.

Lives in its own module, and thus its own process, so that the only
`Greeter` servicer ever registered is the counting one below.
"""

import asyncio
import unittest
from reboot.aio.applications import Application
from reboot.aio.contexts import EffectValidation, ReaderContext
from reboot.aio.tests import Reboot
from tests.reboot import greeter_rbt
from tests.reboot.greeter_rbt import Greeter
from tests.reboot.greeter_servicers import MyGreeterServicer


class CountingGreeterServicer(MyGreeterServicer):
    """A `Greeter` that counts how many times its `Greet` reader body
    actually runs."""

    executions = 0

    @classmethod
    def reset(cls):
        cls.executions = 0

    async def Greet(
        self,
        context: ReaderContext,
        request: greeter_rbt.GreetRequest,
    ) -> greeter_rbt.GreetResponse:
        type(self).executions += 1
        return await super().Greet(context, request)


class SharedReactiveQueriesTestCase(unittest.IsolatedAsyncioTestCase):
    """Tests that subscriptions asking the identical question share a
    single execution of the reader, and that subscriptions asking
    different questions do not."""

    async def asyncSetUp(self) -> None:
        CountingGreeterServicer.reset()
        self.rbt = Reboot()
        await self.rbt.start()
        # Effect validation runs every reader body twice, which would
        # double every count below without saying anything about
        # whether subscriptions shared an execution.
        await self.rbt.up(
            Application(servicers=[CountingGreeterServicer]),
            effect_validation=EffectValidation.DISABLED,
        )
        self.context = self.rbt.create_external_context(
            name=f"test-{self.id()}"
        )
        self.greeter, _ = await Greeter.Create(
            self.context,
            "my-greeter",
            title="Mr.",
            name="Robot",
            adjective="reactive",
        )

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def _subscribe(
        self,
        responses: list[str],
        progress: asyncio.Event,
        *,
        name: str = "caller",
    ) -> asyncio.Task:
        """Start a reactive `Greet` and record every response it sees."""

        async def read():
            async for response in self.greeter.reactively().Greet(
                self.context, name=name
            ):
                responses.append(response.message)
                progress.set()

        task = asyncio.create_task(read())

        # Don't return until the subscription has produced its first
        # response, so that a caller can tell "attached" apart from
        # "attached and caught up".
        while len(responses) == 0:
            await progress.wait()
            progress.clear()

        return task

    async def _wait_for_all(
        self,
        responses: list[list[str]],
        progress: asyncio.Event,
        suffix: str,
    ) -> None:
        while any(
            len(seen) == 0 or not seen[-1].endswith(suffix)
            for seen in responses
        ):
            await progress.wait()
            progress.clear()

    async def test_identical_subscriptions_share_one_execution(self) -> None:
        progress = asyncio.Event()
        responses: list[list[str]] = [[] for _ in range(5)]

        tasks = [await self._subscribe(seen, progress) for seen in responses]

        try:
            CountingGreeterServicer.reset()

            await self.greeter.SetAdjective(self.context, adjective="shared")

            await self._wait_for_all(responses, progress, "the shared")

            # One state change, one execution, five subscribers told.
            self.assertEqual(1, CountingGreeterServicer.executions)

            for seen in responses:
                self.assertEqual(
                    "Hi caller, I am Mr. Robot the shared", seen[-1]
                )
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)

    async def test_different_requests_do_not_share(self) -> None:
        progress = asyncio.Event()
        responses: list[list[str]] = [[], [], []]

        tasks = [
            await self._subscribe(responses[0], progress, name="alice"),
            await self._subscribe(responses[1], progress, name="alice"),
            await self._subscribe(responses[2], progress, name="bob"),
        ]

        try:
            CountingGreeterServicer.reset()

            await self.greeter.SetAdjective(self.context, adjective="distinct")

            await self._wait_for_all(responses, progress, "the distinct")

            # "alice" is asked once for its two subscribers, "bob" once
            # for its own; a different request is a different question.
            self.assertEqual(2, CountingGreeterServicer.executions)

            self.assertTrue(responses[0][-1].startswith("Hi alice,"))
            self.assertTrue(responses[1][-1].startswith("Hi alice,"))
            self.assertTrue(responses[2][-1].startswith("Hi bob,"))
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)

    async def test_late_subscriber_gets_current_response(self) -> None:
        progress = asyncio.Event()
        first: list[str] = []
        second: list[str] = []

        tasks = [await self._subscribe(first, progress)]

        try:
            await self.greeter.SetAdjective(self.context, adjective="early")

            await self._wait_for_all([first], progress, "the early")

            CountingGreeterServicer.reset()

            # A subscriber attaching to a query that is already running
            # must get an answer straight away rather than waiting for
            # the next state change, and must not re-run the reader.
            tasks.append(await self._subscribe(second, progress))

            self.assertEqual("Hi caller, I am Mr. Robot the early", second[-1])
            self.assertEqual(0, CountingGreeterServicer.executions)
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)

    async def test_subscriber_leaving_does_not_disturb_the_rest(self) -> None:
        progress = asyncio.Event()
        staying: list[str] = []
        leaving: list[str] = []

        staying_task = await self._subscribe(staying, progress)
        leaving_task = await self._subscribe(leaving, progress)

        try:
            leaving_task.cancel()
            await asyncio.gather(leaving_task, return_exceptions=True)

            await self.greeter.SetAdjective(self.context, adjective="alone")

            await self._wait_for_all([staying], progress, "the alone")

            self.assertEqual(
                "Hi caller, I am Mr. Robot the alone", staying[-1]
            )
        finally:
            staying_task.cancel()
            await asyncio.gather(staying_task, return_exceptions=True)


if __name__ == '__main__':
    unittest.main()
