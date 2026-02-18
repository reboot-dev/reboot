import unittest
from reboot.aio.applications import Application
from reboot.aio.contexts import EffectValidation, ReaderContext
from reboot.aio.headers import STATE_REF_HEADER, Headers
from reboot.aio.internals.channel_manager import _ChannelManager
from reboot.aio.resolvers import NoResolver
from reboot.aio.tests import Reboot
from reboot.aio.types import ApplicationId, StateRef
from tests.reboot.greeter_rbt import Greeter
from tests.reboot.greeter_servicers import MyGreeterServicer
from unittest import mock


class ContextTestCase(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_context_not_constructible(self) -> None:
        with self.assertRaises(RuntimeError) as error:
            ReaderContext(
                channel_manager=_ChannelManager(NoResolver(), secure=False),
                headers=Headers(
                    application_id=ApplicationId('application_id'),
                    state_ref=StateRef.from_id(
                        Greeter.__state_type_name__, 'state_ref'
                    ),
                ),
                state_type_name=MyGreeterServicer.__state_type_name__,
                method='unused',
                effect_validation=EffectValidation.ENABLED,
            )

        self.assertIn(
            'Context should only be constructed by middleware',
            str(error.exception)
        )

    async def test_context_not_constructible_in_actor(self) -> None:
        await self.rbt.up(Application(servicers=[MyGreeterServicer]))

        context = self.rbt.create_external_context(name=self.id())

        greeter, response = await Greeter.Create(
            context,
            title='Dr',
            name='Jonathan',
            adjective='best',
        )

        with self.assertRaises(
            Greeter.TryToConstructContextAborted
        ) as aborted:
            await greeter.TryToConstructContext(context)

        self.assertIn(
            'Context should only be constructed by middleware',
            str(aborted.exception)
        )

    async def test_no_crash_if_bad_headers(self) -> None:
        """Tests that the generated code that constructs the context fails
        gracefully if the headers for the context are not set correctly."""
        await self.rbt.up(Application(servicers=[MyGreeterServicer]))
        context = self.rbt.create_external_context(name=self.id())

        # Create a fake version of `Headers.to_grpc_metadata` that removes the
        # state ref header, which is required.
        real_to_grpc_metadata = Headers.to_grpc_metadata

        def fake_to_grpc_metadata(self):
            grpc_metadata = real_to_grpc_metadata(self)
            # Remove the required state ref header.
            grpc_metadata = tuple(
                header_pair for header_pair in grpc_metadata
                if header_pair[0] != STATE_REF_HEADER
            )
            return grpc_metadata

        # On the next call, fail to set the state ref header. The server
        # should fail gracefully.
        with mock.patch(
            'reboot.aio.headers.Headers.to_grpc_metadata',
            fake_to_grpc_metadata
        ):
            with self.assertRaises(Greeter.CreateAborted) as aborted:
                await Greeter.Create(
                    context,
                    title='Dr',
                    name='Jonathan',
                    adjective='best',
                )

            self.assertIn('gRPC metadata missing', str(aborted.exception))


if __name__ == '__main__':
    unittest.main()
