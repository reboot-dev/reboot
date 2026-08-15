"""The dashboard reads a directory of servicers off disk.

Nothing is imported and nothing is generated: `rbt generate` has not
run, there is no application, and the files are read as they are.
"""
import os
import tempfile
import unittest
from pathlib import Path
from rbt.dashboard.v1.dashboard_pb2 import Call
from reboot.dashboard import servicer_reader
from reboot.dashboard.servicer_reader import method_calls, read
from typing import Optional
from unittest.mock import patch

SERVICER = '''
from bank.v1.account_rbt import Account
from helpers import transfer
from reboot.aio.contexts import WriterContext


class AccountServicer(Account.Servicer):

    def authorizer(self):
        return allow()

    async def move(self, context: WriterContext, request):
        await transfer(context, request.amount)

    async def quiet(self, context: WriterContext):
        self.state.balance = 0
'''

HELPERS = '''
from bank.v1.account_rbt import Account


async def transfer(context, amount):
    await Account.ref('a').withdraw(context, amount=amount)
'''


class ServicerReaderTest(unittest.TestCase):

    def setUp(self) -> None:
        self._directory = tempfile.TemporaryDirectory()
        self.directory = Path(self._directory.name)

    def tearDown(self) -> None:
        self._directory.cleanup()

    def _write(
        self,
        name: str,
        source: str,
        modified_ns: Optional[int] = None,
    ) -> None:
        path = self.directory / name
        path.write_text(source)
        if modified_ns is not None:
            # Said outright, so that what a timestamp catches is not
            # left to how fast the test happens to run.
            os.utime(path, ns=(modified_ns, modified_ns))

    def test_describes_what_a_method_calls(self) -> None:
        self._write('account_servicer.py', SERVICER)
        self._write('helpers.py', HELPERS)

        sources, error = read(str(self.directory))

        self.assertEqual(error, '')

        described = method_calls(sources.analyses)

        self.assertEqual(
            [(one.state_type, one.method) for one in described],
            [('bank.v1.Account', 'move')],
        )
        self.assertEqual(
            [
                (call.state_type, call.method, Call.How.Name(call.how))
                for call in described[0].calls
            ],
            [('bank.v1.Account', 'withdraw', 'CALL')],
        )

    def test_a_method_that_calls_nothing_is_left_out(self) -> None:
        """A row saying a method calls nothing is a row saying
        nothing."""
        self._write('account_servicer.py', SERVICER)
        self._write('helpers.py', HELPERS)

        sources, _ = read(str(self.directory))

        self.assertNotIn(
            'quiet',
            [one.method for one in method_calls(sources.analyses)],
        )

    def test_generated_files_are_not_read(self) -> None:
        self._write('account_servicer.py', SERVICER)
        self._write('helpers.py', HELPERS)
        self._write('account_rbt.py', 'this is not Python at all')

        _, error = read(str(self.directory))

        self.assertEqual(error, '')

    def test_a_half_written_file_is_reported_and_the_rest_still_read(
        self
    ) -> None:
        self._write('account_servicer.py', SERVICER)
        self._write('helpers.py', HELPERS)
        self._write('halfway.py', 'async def transfer(context,')

        sources, error = read(str(self.directory))

        self.assertIn('halfway.py', error)
        self.assertEqual(
            [one.method for one in method_calls(sources.analyses)],
            ['move'],
        )

    def test_a_directory_that_is_not_there_is_said_so(self) -> None:
        sources, error = read(str(self.directory / 'nowhere'))

        self.assertEqual(sources.analyses, {})
        self.assertIn('no such directory', error)

    ###################################################################
    # Reading again only what changed.

    def _counting_parse(self):
        """Records the name of every file actually parsed."""
        parsed: list[str] = []
        real = servicer_reader.parse

        def counted(name: str, source: str):
            parsed.append(name)
            return real(name, source)

        return parsed, patch.object(servicer_reader, 'parse', counted)

    def test_an_untouched_tree_is_not_read_again(self) -> None:
        self._write('account_servicer.py', SERVICER)
        self._write('helpers.py', HELPERS)

        first, _ = read(str(self.directory))

        parsed, counting = self._counting_parse()
        with counting:
            second, _ = read(str(self.directory), first)

        self.assertEqual(parsed, [])
        self.assertEqual(
            method_calls(second.analyses), method_calls(first.analyses)
        )

    def test_only_the_file_that_changed_is_read_again(self) -> None:
        self._write('account_servicer.py', SERVICER)
        self._write('helpers.py', HELPERS)

        first, _ = read(str(self.directory))

        self._write('helpers.py', HELPERS.replace('withdraw', 'pay'))

        parsed, counting = self._counting_parse()
        with counting:
            second, _ = read(str(self.directory), first)

        self.assertEqual(parsed, ['helpers'])
        self.assertEqual(
            [call.method for call in method_calls(second.analyses)[0].calls],
            ['pay'],
        )

    def test_an_edit_of_the_same_size_is_noticed(self) -> None:
        """Two file names of a length are what a timestamp is for."""
        self._write('account_servicer.py', SERVICER)
        self._write('helpers.py', HELPERS, modified_ns=1_000_000_000)

        first, _ = read(str(self.directory))

        self._write(
            'helpers.py',
            HELPERS.replace('withdraw', 'deposit'),
            modified_ns=2_000_000_000,
        )

        parsed, counting = self._counting_parse()
        with counting:
            second, _ = read(str(self.directory), first)

        self.assertEqual(parsed, ['helpers'])
        self.assertEqual(
            [call.method for call in method_calls(second.analyses)[0].calls],
            ['deposit'],
        )

    def test_a_file_whose_time_went_backwards_is_noticed(self) -> None:
        """Checking out an older branch moves a file's time backwards,
        which is as much an edit as any other."""
        self._write('account_servicer.py', SERVICER)
        self._write('helpers.py', HELPERS, modified_ns=2_000_000_000)

        first, _ = read(str(self.directory))

        self._write(
            'helpers.py',
            HELPERS.replace('withdraw', 'deposit'),
            modified_ns=1_000_000_000,
        )

        parsed, counting = self._counting_parse()
        with counting:
            second, _ = read(str(self.directory), first)

        self.assertEqual(parsed, ['helpers'])
        self.assertEqual(
            [call.method for call in method_calls(second.analyses)[0].calls],
            ['deposit'],
        )

    def test_reading_twice_says_the_same_thing(self) -> None:
        self._write('account_servicer.py', SERVICER)
        self._write('helpers.py', HELPERS)

        first, _ = read(str(self.directory))
        second, _ = read(str(self.directory), first)

        self.assertEqual(
            method_calls(first.analyses), method_calls(second.analyses)
        )


if __name__ == '__main__':
    unittest.main()
