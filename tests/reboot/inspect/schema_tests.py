"""`Inspect.GetSchema` describes the running application.

`GetStateTypes` answers which state types exist; this answers what
they are, so a dashboard can render an application it was not built
against.
"""
import os
import unittest
from rbt.v1alpha1.inspect import inspect_pb2, inspect_pb2_grpc
from reboot.aio.applications import Application
from reboot.aio.headers import AUTHORIZATION_HEADER
from reboot.aio.tests import Reboot
from reboot.inspect.companion_app.servicers import servicers
from reboot.settings import ENVVAR_SECRET_REBOOT_ADMIN_TOKEN
from unittest.mock import patch

# `GetSchema` is admin-authenticated like every other `Inspect` method,
# so the test has to present the secret the application was given.
ADMIN_TOKEN = 'test-admin-token'


class GetSchemaTest(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self._admin_token = patch.dict(
            os.environ,
            {ENVVAR_SECRET_REBOOT_ADMIN_TOKEN: ADMIN_TOKEN},
        )
        self._admin_token.start()
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(Application(servicers=servicers()))

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()
        self._admin_token.stop()

    async def _state_types(self) -> dict:
        context = self.rbt.create_external_context(name=self.id())
        # Bind the stub to a local so the channel outlives the call;
        # see the note on `_stub` in `reboot/cli/commands/inspect.py`.
        stub = inspect_pb2_grpc.InspectStub(context.legacy_grpc_channel())
        async for response in stub.GetSchema(
            inspect_pb2.GetSchemaRequest(),
            metadata=((AUTHORIZATION_HEADER, f'Bearer {ADMIN_TOKEN}'),),
        ):
            # The server describes the application once and then holds
            # the stream open to signal restarts.
            return {s.name: s for s in response.state_types}
        raise AssertionError("GetSchema returned nothing")

    async def test_describes_state_types_and_their_fields(self) -> None:
        state_types = await self._state_types()

        dashboard = state_types['rbt.inspect.companion_app.v1.Dashboard']

        # The file maps back to the source the developer wrote.
        self.assertEqual(
            dashboard.file,
            'rbt/inspect/companion_app/v1/dashboard.proto',
        )

        fields = {f.name: f.type for f in dashboard.fields}
        self.assertEqual(fields, {'opened': 'bool'})

    async def test_describes_methods(self) -> None:
        state_types = await self._state_types()

        methods = {
            m.name: m for m in
            state_types['rbt.inspect.companion_app.v1.Dashboard'].methods
        }

        self.assertEqual(methods['Opened'].kind, 'reader')
        self.assertEqual(methods['RecordOpened'].kind, 'writer')

        # A response the caller reads is named; one that returns
        # nothing is left empty rather than exposing `Empty`.
        self.assertEqual(methods['Opened'].returns, 'OpenedResponse')
        self.assertEqual(
            methods['RecordOpened'].returns, 'RecordOpenedResponse'
        )

    async def test_describes_arguments_and_errors(self) -> None:
        state_types = await self._state_types()

        presence = state_types['rbt.std.presence.v1.Presence']
        methods = {m.name: m for m in presence.methods}

        # Arguments are the request message's fields, flattened --
        # what a reader expects to pass, not a wrapper type.
        subscribe = methods['Subscribe']
        self.assertEqual(
            [(a.name, a.type) for a in subscribe.arguments],
            [('subscriber_id', 'str')],
        )

        # Declared errors are read from `MethodOptions.errors`, but no
        # method in this application declares any -- `presence.py`
        # raises `NotFound` without listing it in its API definition.
        # So this pins only that we report the field as empty rather
        # than inventing entries; a state type that declares errors
        # would exercise it properly.
        subscriber = state_types['rbt.std.presence.subscriber.v1.Subscriber']
        toggle = {m.name: m for m in subscriber.methods}['Toggle']
        self.assertEqual(list(toggle.errors), [])

    async def test_omits_state_types_internal_to_the_framework(self) -> None:
        state_types = await self._state_types()

        for name in state_types:
            self.assertNotIn('rbt.v1alpha1', name)


if __name__ == '__main__':
    unittest.main()
