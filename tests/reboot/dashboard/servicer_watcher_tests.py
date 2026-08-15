"""What the methods call follows the developer's source files.

The API watcher shows what has been declared; this shows what has been
implemented, and keeps showing it as the implementation changes.
"""
import asyncio
import os
import tempfile
import unittest
from pathlib import Path
from rbt.dashboard.v1.dashboard_rbt import API
from reboot.aio.tests import Reboot
from reboot.dashboard.constants import (
    API_ID,
    ENVVAR_RBT_API_DIRECTORY,
    ENVVAR_RBT_SOURCE_DIRECTORY,
)
from reboot.dashboard.main import application
from typing import Optional
from unittest.mock import patch

SERVICER = '''
from bank.v1.account_rbt import Account
from helpers import transfer


class AccountServicer(Account.Servicer):

    def authorizer(self):
        return allow()

    async def move(self, context, request):
        await transfer(context, request.amount)
'''

HELPERS = '''
from bank.v1.account_rbt import Account


async def transfer(context, amount):
    await Account.ref('a').{method}(context, amount=amount)
'''


class ServicerWatcherTest(unittest.IsolatedAsyncioTestCase):

    watcher: Optional[asyncio.Task] = None

    async def asyncSetUp(self) -> None:
        # Both directories are read when the application comes up, so
        # they have to exist and be named first.
        self._api = tempfile.TemporaryDirectory()
        self._source = tempfile.TemporaryDirectory()
        self.source = Path(self._source.name)

        self._environment = patch.dict(
            os.environ,
            {
                ENVVAR_RBT_API_DIRECTORY: self._api.name,
                ENVVAR_RBT_SOURCE_DIRECTORY: str(self.source),
            },
        )
        self._environment.start()

        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(application(), local_envoy=True)

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()
        self._environment.stop()
        self._source.cleanup()
        self._api.cleanup()

    def _write(self, name: str, source: str) -> None:
        (self.source / name).write_text(source)

    async def _wait_for(self, satisfied):
        while True:
            context = self.rbt.create_external_context(name=self.id())
            try:
                response = await API.ref(API_ID).Get(context)
                if satisfied(response):
                    return response
            except Exception:
                pass
            await asyncio.sleep(0.1)

    async def test_calls_follow_the_source(self) -> None:
        self._write('account_servicer.py', SERVICER)
        self._write('helpers.py', HELPERS.format(method='withdraw'))

        response = await self._wait_for(lambda api: len(api.method_calls) == 1)

        self.assertEqual(response.calls_error, '')
        self.assertEqual(
            [
                (one.state_type, one.method, one.calls[0].method)
                for one in response.method_calls
            ],
            [('bank.v1.Account', 'move', 'withdraw')],
        )

        # A change to the helper, in a file that is not the method's,
        # changes what the method is said to call.
        self._write('helpers.py', HELPERS.format(method='deposit'))

        response = await self._wait_for(
            lambda api: len(api.method_calls) == 1 and api.method_calls[0].
            calls[0].method == 'deposit'
        )

        self.assertEqual(
            [one.calls[0].method for one in response.method_calls],
            ['deposit'],
        )

    async def test_a_half_written_file_is_reported(self) -> None:
        self._write('account_servicer.py', SERVICER)
        self._write('helpers.py', HELPERS.format(method='withdraw'))

        await self._wait_for(lambda api: len(api.method_calls) == 1)

        self._write('halfway.py', 'async def transfer(context,')

        response = await self._wait_for(lambda api: api.calls_error != '')

        self.assertIn('halfway.py', response.calls_error)

        # What did parse is still shown; a file being typed into does
        # not empty the page.
        self.assertEqual(len(response.method_calls), 1)


if __name__ == '__main__':
    unittest.main()
