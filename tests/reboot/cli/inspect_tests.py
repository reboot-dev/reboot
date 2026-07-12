import argparse
import asyncio
import io
import unittest
from contextlib import redirect_stdout
from rbt.v1alpha1.application import application_rbt
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot, temporary_environ
from reboot.cli.commands.inspect import handle_inspect_subcommand
from reboot.memoize.v1.memoize_rbt import Memoize
from reboot.settings import ENVVAR_SECRET_REBOOT_ADMIN_TOKEN
from tests.reboot.echo_rbt import Echo
from tests.reboot.echo_servicers import MyEchoServicer
from uuid import uuid4

TEST_SECRET_REBOOT_ADMIN_TOKEN = 'test-admin-secret'

ECHO_STATE_TYPE = 'tests.reboot.Echo'


class InspectCliTestCase(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        temporary_environ(
            self,
            {ENVVAR_SECRET_REBOOT_ADMIN_TOKEN: TEST_SECRET_REBOOT_ADMIN_TOKEN},
        )
        self.maxDiff = None
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(
            Application(servicers=[MyEchoServicer]),
            local_envoy=True,
            local_envoy_tls=True,
        )

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def _run(self, subcommand: str, **kwargs) -> str:
        """Run an `inspect` subcommand against the test application and
        return whatever it printed to stdout."""
        args = argparse.Namespace(
            subcommand=subcommand,
            application_url=self.rbt.https_localhost_direct_url(),
            admin_credential=TEST_SECRET_REBOOT_ADMIN_TOKEN,
            api_key=None,
            **kwargs,
        )
        output = io.StringIO()
        with redirect_stdout(output):
            result = await handle_inspect_subcommand(args)
        self.assertEqual(result, 0)
        return output.getvalue()

    async def test_type_list(self) -> None:
        types = (await self._run('inspect type list')).splitlines()
        self.assertIn(ECHO_STATE_TYPE, types)
        # Framework-internal state types are registered in every
        # application but must be filtered out of `inspect`.
        self.assertNotIn(Memoize.__state_type_name__, types)
        self.assertNotIn(
            application_rbt.Application.__state_type_name__, types
        )

    async def test_state_list(self) -> None:
        context = self.rbt.create_external_context(name=self.id())
        state_ids = {str(uuid4()) for _ in range(3)}
        for state_id in state_ids:
            await Echo.ref(state_id).Reply(context, message='hello')

        # `ListStates` returns a complete view on each fresh stream, but
        # the just-created states may take a moment to appear; poll until
        # they all show up (Bazel's test timeout is the backstop).
        while True:
            listed = set(
                (await self._run(
                    'inspect state list',
                    type=ECHO_STATE_TYPE,
                )).splitlines()
            )
            if state_ids <= listed:
                break
            await asyncio.sleep(0.1)

    async def test_state_get(self) -> None:
        context = self.rbt.create_external_context(name=self.id())
        state_id = str(uuid4())
        await Echo.ref(state_id).Reply(context, message='hello world')

        output = await self._run(
            'inspect state get',
            type=ECHO_STATE_TYPE,
            id=state_id,
        )
        # The state is printed as JSON; it should contain the message we
        # just stored.
        self.assertIn('hello world', output)
        self.assertIn('messages', output)


if __name__ == '__main__':
    unittest.main(verbosity=2)
