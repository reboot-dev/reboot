"""The dashboard reads a directory of servicers off disk.

Nothing is imported and nothing is generated: `rbt generate` has not
run, there is no application, and the files are read as they are.
"""
import tempfile
import unittest
from pathlib import Path
from rbt.dashboard.v1.dashboard_pb2 import Call
from reboot.dashboard.servicer_reader import method_calls, read

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

    def _write(self, name: str, source: str) -> None:
        (self.directory / name).write_text(source)

    def test_describes_what_a_method_calls(self) -> None:
        self._write('account_servicer.py', SERVICER)
        self._write('helpers.py', HELPERS)

        analyses, error = read(str(self.directory))

        self.assertEqual(error, '')

        described = method_calls(analyses)

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

        analyses, _ = read(str(self.directory))

        self.assertNotIn(
            'quiet',
            [one.method for one in method_calls(analyses)],
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

        analyses, error = read(str(self.directory))

        self.assertIn('halfway.py', error)
        self.assertEqual(
            [one.method for one in method_calls(analyses)],
            ['move'],
        )

    def test_a_directory_that_is_not_there_is_said_so(self) -> None:
        analyses, error = read(str(self.directory / 'nowhere'))

        self.assertEqual(analyses, {})
        self.assertIn('no such directory', error)

    def test_reading_twice_says_the_same_thing(self) -> None:
        self._write('account_servicer.py', SERVICER)
        self._write('helpers.py', HELPERS)

        first, _ = read(str(self.directory))
        second, _ = read(str(self.directory), first)

        self.assertEqual(method_calls(first), method_calls(second))


if __name__ == '__main__':
    unittest.main()
