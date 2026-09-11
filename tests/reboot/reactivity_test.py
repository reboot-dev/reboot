import asyncio
import contextlib
import unittest
from rbt.v1alpha1 import react_pb2, react_pb2_grpc
from reboot.aio.applications import Application
from reboot.aio.contexts import ReaderContext
from reboot.aio.external import ExternalContext
from reboot.aio.react import (
    QUERY_RESPONSE_WINDOW,
    REPORTABLE_STALL_MILLISECONDS,
)
from reboot.aio.tests import Reboot
from tests.reboot import greeter_rbt
from tests.reboot.greeter_rbt import Greeter
from tests.reboot.greeter_servicers import MyGreeterServicer
from typing import Optional
from unittest.mock import patch

# `title` that marks a `Greeter` as one whose `Greet` reads another
# `Greeter`, named by its own `name`, rather than its own state.
PROXY_TITLE = 'proxy'

# The real `QueryRequest` and `ReactStub`, captured here so that the
# shims below reach them through a name that patching the module does
# not; going back through the module would make a shim call itself.
QUERY_REQUEST = react_pb2.QueryRequest
REACT_STUB = react_pb2_grpc.ReactStub


class QueryRequestWithoutContinuations:
    """Constructs a `QueryRequest` the way a client from before
    `ContinueQuery` existed did, i.e. without
    `client_continues_query`.

    The generated gRPC stub reads `QueryRequest.SerializeToString` off
    the class when it is constructed, and the servicer registration
    reads `FromString`, so both stay reachable here.
    """

    SerializeToString = QUERY_REQUEST.SerializeToString
    FromString = QUERY_REQUEST.FromString

    def __new__(cls, **kwargs):
        kwargs.pop('client_continues_query', None)
        return QUERY_REQUEST(**kwargs)


@contextlib.contextmanager
def query_requests_without_continuations():
    """Makes every reactive reader send a `QueryRequest` the way a
    client from before `ContinueQuery` existed did. Both the generated
    clients and `reboot.aio.contexts` look `QueryRequest` and
    `ReactStub` up on their modules at call time, so patching here
    covers both.

    Yields the IDs of the queries this client was driven to continue,
    which must stay empty: a client from before `ContinueQuery` existed
    had no such RPC to call, so a backend that kept the responses
    coming only because this one called it would strand a real old
    client."""
    continued: list[str] = []

    class ReactStub:

        def __init__(self, channel):
            self._stub = REACT_STUB(channel)

        def __getattr__(self, name):
            return getattr(self._stub, name)

        def ContinueQuery(self, request, **kwargs):
            continued.append(request.query_id)
            return self._stub.ContinueQuery(request, **kwargs)

    with patch.object(
        react_pb2,
        'QueryRequest',
        QueryRequestWithoutContinuations,
    ), patch.object(react_pb2_grpc, 'ReactStub', ReactStub):
        yield continued


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

    async def accumulate_until_adjective(self, adjective: str) -> list[str]:
        while self._accumulated_adjectives[-1] != adjective:
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
        state changes falls no further behind than its window, and then
        skips straight to the latest state instead of working its way
        through every state that it missed.
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

        # Change the state many more times than the window gives the
        # backend room to send without hearing back.
        adjectives = [
            f"adjective-{index}" for index in range(3 * QUERY_RESPONSE_WINDOW)
        ]

        for adjective in adjectives:
            await greeter.SetAdjective(context, adjective=adjective)

        # Now let the reactive reader consume responses again. It must
        # arrive at the latest state...
        self._can_accumulate_next_adjective.set()
        accumulated = await self.accumulate_until_adjective(adjectives[-1])

        # ... having seen at most a window's worth of responses on the
        # way there rather than one per state change, since the backend
        # stopped producing once it had a window's worth outstanding,
        # and the states that changed while it waited were skipped. The
        # window covers the first response too, and one more response
        # carries the skip to the latest state.
        self.assertLessEqual(
            len(accumulated),
            QUERY_RESPONSE_WINDOW + 1,
            accumulated,
        )

    async def test_reports_a_stalled_client(self) -> None:
        """
        Tests that a backend holding a response for a client too slow
        to take it says so, once it has held it for long enough that
        the client's user could see the delay.
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

        with self.assertLogs(
            'respect.reboot.aio.react',
            level='INFO',
        ) as logs:
            # More changes than the window has room for, so that the
            # backend ends up holding one it cannot send.
            adjectives = [
                f"adjective-{index}"
                for index in range(2 * QUERY_RESPONSE_WINDOW)
            ]

            for adjective in adjectives:
                await greeter.SetAdjective(context, adjective=adjective)

            # Hold it there for longer than a user would fail to
            # notice.
            await asyncio.sleep(2 * REPORTABLE_STALL_MILLISECONDS / 1000)

            self._can_accumulate_next_adjective.set()
            await self.accumulate_until_adjective(adjectives[-1])

        reported = "A client of a reactive query to `GetWholeState` skipped "

        self.assertTrue(
            any(
                reported in line and "updates because it fell" in line
                for line in logs.output
            ),
            logs.output,
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

        adjectives = [
            f"adjective-{index}" for index in range(3 * QUERY_RESPONSE_WINDOW)
        ]

        for adjective in adjectives:
            await greeter.SetAdjective(context, adjective=adjective)

        # Now let the reader consume responses again. It must arrive at
        # the latest state without seeing every state it missed. Only
        # the hop to this reader has a window; the `Greeter` read that
        # the proxy does behind it keeps just the latest state it was
        # sent. So this reader is a single window behind, plus the one
        # response that carries the skip to the latest state.
        can_greet_again.set()

        latest = f"Hi Alice, I am Mr. Robot the {adjectives[-1]}"
        while greetings[-1] != latest:
            await greeted.wait()
            greeted.clear()

        self.assertLessEqual(
            len(greetings),
            QUERY_RESPONSE_WINDOW + 1,
            greetings,
        )

    async def test_client_that_never_continues(self) -> None:
        """
        Tests that a client from before `ContinueQuery` existed, which
        never asks for the query to continue, keeps getting new
        responses instead of being stalled waiting for a request that
        will never come.
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

        with query_requests_without_continuations() as continued:
            await self.start_accumulating_adjectives(greeter, context)
            self.assertEqual(["reactive"], await self.get_adjectives(1))

            await greeter.SetAdjective(context, adjective="realistic")

            # Unlike the tests above, this one never sets
            # `_can_accumulate_next_adjective` a second time, so
            # nothing here ever tells the backend to carry on. A
            # backend that waited to be asked would still be
            # holding the second response; getting it is what shows
            # that this backend is not waiting for one.
            self.assertEqual(
                ["reactive", "realistic"],
                await self.get_adjectives(2),
            )

            # Getting both responses is only evidence of what an old
            # client sees if this one really behaved like one. Had the
            # backend stamped IDs on those responses regardless of what
            # the client asked for, this client would have continued
            # past them and sailed on where a real old client, which
            # has no `ContinueQuery` to call, would have stalled.
            self.assertEqual([], continued)


if __name__ == '__main__':
    unittest.main()
