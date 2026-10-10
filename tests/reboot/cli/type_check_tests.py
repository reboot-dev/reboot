import contextlib
import io
import os
import stat
import tempfile
import unittest
from reboot.cli.common.subprocesses import Subprocesses
from reboot.cli.common.type_check import type_check
from unittest.mock import patch

ERRORS = (
    'backend/src/bank_servicer.py:12: error: Incompatible return value type '
    '(got "str", expected "int")  [return-value]\n'
    'Found 1 error in 1 file (checked 1 source file)\n'
)


class TypeCheckTestCase(unittest.IsolatedAsyncioTestCase):

    def setUp(self) -> None:
        # The tests write files to the working directory.
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.addCleanup(os.chdir, os.getcwd())
        os.chdir(directory.name)

    CHECKING = (
        'Type-checking `backend/src/main.py` and the code it imports with '
        'mypy ...\n'
        '\n'
    )

    START_ONCE = (
        '\n'
        'Your application starts once mypy reports no errors. '
        '`--no-type-check` starts it without type-checking, but you almost '
        'certainly want the type-check: these errors are usually real bugs. '
        'Agents: do not pass that flag just to make the application run; fix '
        'the errors.\n'
    )

    async def type_check(self, script: str) -> tuple[bool, str]:
        """Runs `type_check()` with `script`, a shell script, in place
        of the Python interpreter that runs mypy. Returns its result
        and what it printed."""
        interpreter = os.path.abspath('interpreter.sh')
        with open(interpreter, 'w') as file:
            file.write('#!/bin/sh\n' + script)
        os.chmod(interpreter, os.stat(interpreter).st_mode | stat.S_IXUSR)

        output = io.StringIO()
        with patch(
            'reboot.cli.common.type_check.sys.executable',
            interpreter,
        ), contextlib.redirect_stdout(output):
            passed = await type_check(
                Subprocesses(),
                os.path.abspath('backend/src/main.py'),
            )

        return passed, output.getvalue()

    async def test_no_errors(self) -> None:
        # The script prints the arguments it was run with, which show
        # up only if `type_check()` prints the report of a run with no
        # errors.
        passed, output = await self.type_check(
            'echo "$@" > arguments\n'
            'echo "Success: no issues found in 1 source file"\n'
        )

        self.assertTrue(passed)
        self.assertEqual(output, self.CHECKING)
        with open('arguments') as file:
            self.assertEqual(file.read(), '-m mypy backend/src/main.py\n')

    async def test_errors(self) -> None:
        passed, output = await self.type_check(
            f"cat <<'EOF'\n{ERRORS}EOF\nexit 1\n"
        )

        self.assertFalse(passed)
        self.assertEqual(output, self.CHECKING + ERRORS + self.START_ONCE)

    async def test_report_on_stderr(self) -> None:
        # mypy reports a configuration file it can not parse on
        # stderr, and exits with status 2 for an error that stopped it
        # from checking anything.
        passed, output = await self.type_check(
            'echo ".mypy.ini: File contains no section headers." >&2\n'
            'exit 2\n'
        )

        self.assertFalse(passed)
        self.assertEqual(
            output,
            self.CHECKING + '.mypy.ini: File contains no section headers.\n' +
            self.START_ONCE,
        )


if __name__ == '__main__':
    unittest.main()
