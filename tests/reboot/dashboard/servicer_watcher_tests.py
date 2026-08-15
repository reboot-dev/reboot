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
from reboot.dashboard import servicer_reader
from reboot.dashboard.call_analysis import VERSION
from reboot.dashboard.constants import (
    API_ID,
    ENVVAR_RBT_API_DIRECTORY,
    ENVVAR_RBT_SOURCE_DIRECTORY,
)
from reboot.dashboard.main import application
from reboot.dashboard.servicer_reader import Sources, method_calls, read
from reboot.dashboard.servicer_watcher import _restored
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

    async def test_a_dashboard_starting_again_reads_nothing(self) -> None:
        """What one dashboard worked out is written down beside the
        answer, so the next one against an untouched tree has nothing
        to read, parse or analyze."""
        self._write('account_servicer.py', SERVICER)
        self._write('helpers.py', HELPERS.format(method='withdraw'))

        await self._wait_for(lambda api: len(api.method_calls) == 1)

        # What a dashboard starting again would find, taken from the
        # state the running one wrote.
        context = self.rbt.create_external_context(name=self.id())
        analysis = await API.ref(API_ID).Analysis(context)

        self.assertEqual(analysis.analyzer_version, VERSION)
        self.assertEqual(
            sorted(state.filename for state in analysis.file_states),
            ['account_servicer.py', 'helpers.py'],
        )

        restored = _restored(analysis)

        parsed: list[str] = []
        real = servicer_reader.parse

        def counted(name: str, source: str):
            parsed.append(name)
            return real(name, source)

        with patch.object(servicer_reader, 'parse', counted):
            sources, error = read(str(self.source), restored)

        self.assertEqual(parsed, [])
        self.assertEqual(error, '')
        self.assertEqual(
            [
                (one.state_type, one.method, one.calls[0].method)
                for one in method_calls(sources.analyses)
            ],
            [('bank.v1.Account', 'move', 'withdraw')],
        )

    async def test_an_analysis_that_has_changed_is_not_trusted(self) -> None:
        """Results are only worth keeping if the analysis that wrote
        them is the one about to use them."""
        self._write('account_servicer.py', SERVICER)
        self._write('helpers.py', HELPERS.format(method='withdraw'))

        await self._wait_for(lambda api: len(api.method_calls) == 1)

        context = self.rbt.create_external_context(name=self.id())
        analysis = await API.ref(API_ID).Analysis(context)

        analysis.analyzer_version = 'some other analysis'

        self.assertEqual(_restored(analysis), Sources())

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
