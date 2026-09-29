import asyncio
import unittest
from rbt.v1alpha1.errors_pb2 import StateNotConstructed
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot
from tests.reboot.greeter_rbt import ErrorWithValue, Greeter
from tests.reboot.greeter_servicers import MyGreeterServicer

# A reactive read is a live stream of answers: a response, or the
# error the reader answered with. An error is a value in that stream,
# not the end of it; the read keeps going and is answered again once
# the state changes.


class ReactiveReaderTest(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(Application(servicers=[MyGreeterServicer]))

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_state_not_constructed_then_response(self) -> None:
        """A read of a state that is not constructed yet is answered
        with `StateNotConstructed`, and with a response once the state
        is constructed by someone else."""
        context = self.rbt.create_external_context(name=self.id())

        responses = Greeter.ref('greeter').reactively().Greet(context)

        response, aborted = await asyncio.wait_for(
            anext(responses), timeout=10
        )
        self.assertIsNone(response)
        assert aborted is not None
        self.assertIsInstance(aborted.error, StateNotConstructed)

        # Construct the state from another context, as another client
        # would.
        await Greeter.Create(
            self.rbt.create_external_context(name=f'{self.id()}-other'),
            'greeter',
            title='Dr',
            name='Jonathan',
            adjective='best',
        )

        # The read is still open: it may be answered with
        # `StateNotConstructed` a few more times until the construction
        # is observed, and then with a response.
        while True:
            response, aborted = await asyncio.wait_for(
                anext(responses), timeout=30
            )
            if response is not None:
                break
            assert aborted is not None
            self.assertIsInstance(aborted.error, StateNotConstructed)

        self.assertIsNone(aborted)
        self.assertEqual(response.message, 'Hi ??, I am Dr Jonathan the best')

        await responses.aclose()

    async def test_declared_error_is_yielded_and_read_again(self) -> None:
        """A declared error raised by the reader is yielded, more than
        once: it does not end the read."""
        context = self.rbt.create_external_context(name=self.id())

        greeter, _ = await Greeter.Create(
            context,
            title='Dr',
            name='Jonathan',
            adjective='best',
        )

        responses = greeter.reactively().FailWithAborted(context)

        for _ in range(2):
            response, aborted = await asyncio.wait_for(
                anext(responses), timeout=30
            )
            self.assertIsNone(response)
            assert aborted is not None
            self.assertIsInstance(aborted.error, ErrorWithValue)
            self.assertEqual(aborted.error.value, 'Hi!')

        await responses.aclose()


if __name__ == '__main__':
    unittest.main()
