import contextlib
import io
import os
import stat
import tempfile
import unittest
from reboot.cli.common.subprocesses import Subprocesses
from reboot.cli.common.type_check import developers_report, type_check
from unittest.mock import patch

GENERATED_ERROR = (
    'backend/api/bank/v1/bank_rbt.py:9134: error: "API" has no attribute '
    '"Bank"  [attr-defined]\n'
)

SERVICER_ERROR = (
    'backend/src/bank_servicer.py:12: error: Incompatible return value type '
    '(got "str", expected "int")  [return-value]\n'
)


class DevelopersReportTestCase(unittest.TestCase):

    def test_errors_in_generated_code_are_left_out(self) -> None:
        self.assertEqual(
            developers_report(
                GENERATED_ERROR + SERVICER_ERROR + GENERATED_ERROR +
                # A note is left out with the errors of its file.
                'backend/api/bank/v1/bank_rbt.py:9134: note: See '
                'https://mypy.readthedocs.io/\n',
                generated_directory='backend/api/',
            ),
            (SERVICER_ERROR, 1, 2),
        )

    def test_lines_below_an_error_go_where_the_error_goes(self) -> None:
        # With `--pretty`, mypy prints the source below each error.
        generated_source = '    API.Bank\n    ^~~~~~~~\n'
        servicer_source = '    return "nope"\n           ^~~~~~\n'

        self.assertEqual(
            developers_report(
                GENERATED_ERROR + generated_source + SERVICER_ERROR +
                servicer_source,
                generated_directory='backend/api',
            ),
            (SERVICER_ERROR + servicer_source, 1, 1),
        )

    def test_without_rbt_generate(self) -> None:
        # With `--no-generate-watch`, `rbt dev run` does not know
        # where the generated code is.
        self.assertEqual(
            developers_report(
                GENERATED_ERROR + SERVICER_ERROR,
                generated_directory=None,
            ),
            (GENERATED_ERROR + SERVICER_ERROR, 2, 0),
        )

    def test_report_that_is_not_errors(self) -> None:
        report = '.mypy.ini: File contains no section headers.\n'

        self.assertEqual(
            developers_report(report, generated_directory='backend/api'),
            (report, 0, 0),
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
        ' Your application starts once mypy reports no errors. '
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
                generated_directory='backend/api',
            )

        return passed, output.getvalue()

    async def report(self, report: str, status: int) -> tuple[bool, str]:
        """Runs `type_check()` with a mypy that prints `report` and
        exits with `status`."""
        return await self.type_check(
            f"cat <<'EOF'\n{report}EOF\nexit {status}\n"
        )

    async def test_no_errors(self) -> None:
        # The script prints the arguments it was run with, which show
        # up only if `type_check()` prints the report of a run with no
        # errors.
        passed, output = await self.type_check('echo "$@" > arguments\n')

        self.assertTrue(passed)
        self.assertEqual(output, self.CHECKING)
        with open('arguments') as file:
            self.assertEqual(
                file.read(),
                '-m mypy --no-error-summary backend/src/main.py\n',
            )

    async def test_errors(self) -> None:
        passed, output = await self.report(
            GENERATED_ERROR + SERVICER_ERROR + SERVICER_ERROR, 1
        )

        self.assertFalse(passed)
        self.assertEqual(
            output,
            self.CHECKING + SERVICER_ERROR + SERVICER_ERROR + '\n'
            'mypy reports 2 errors in your code.' + self.START_ONCE,
        )

    async def test_errors_only_in_generated_code(self) -> None:
        passed, output = await self.report(GENERATED_ERROR, 1)

        self.assertTrue(passed)
        self.assertEqual(output, self.CHECKING)

    async def test_syntax_error(self) -> None:
        # mypy exits with status 2 for an error that stopped it from
        # checking the rest.
        report = 'backend/src/main.py:4: error: Invalid syntax  [syntax]\n'

        passed, output = await self.report(report, 2)

        self.assertFalse(passed)
        self.assertEqual(
            output,
            self.CHECKING + report + '\n'
            'mypy reports 1 error in your code.' + self.START_ONCE,
        )

    async def test_report_on_stderr(self) -> None:
        # mypy reports a configuration file it can not parse on
        # stderr.
        passed, output = await self.type_check(
            'echo ".mypy.ini: File contains no section headers." >&2\n'
            'exit 2\n'
        )

        self.assertFalse(passed)
        self.assertEqual(
            output,
            self.CHECKING + '.mypy.ini: File contains no section headers.\n'
            '\n'
            'mypy exited with status 2.' + self.START_ONCE,
        )


if __name__ == '__main__':
    unittest.main()
