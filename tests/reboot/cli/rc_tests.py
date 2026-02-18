import reboot.cli.rc as rc
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


# Mock fail, because the original fail will exit the program.
def mock_raise_instead_fail(message):
    raise ValueError(message)


@patch('reboot.cli.terminal.fail', mock_raise_instead_fail)
class RcTestCase(unittest.IsolatedAsyncioTestCase):

    async def test_expand_flags_from_dot_rbtrc(self) -> None:
        with tempfile.NamedTemporaryFile() as file:
            file.write(
                (
                    '\n'
                    '...:amsterdam --env=AMSTERDAM_ENV=true\n'
                    '\n'
                    '... --env=ALWAYS_ENV=true\n'
                    '    \n'  # Random lines with arbitrary whitespace should be skipped.
                    '  # Comment! \n'  # Comments should be skipped.
                    'dev --always-dev=true  # Also comments here should be skipped!\n'
                    '\n'
                    'dev:fullstack --fullstack# This comment intentionally without a space.\n'
                    '\n'
                    'dev:amsterdam --config=fullstack\n'
                    'dev:amsterdam --name=demo\n'
                    'dev:amsterdam --python\n'
                    'dev:amsterdam ../bazel-bin/microservices_demo/backend/app.zip\n'
                ).encode()
            )
            file.flush()

            argv = ['rbt', 'dev', '--config=amsterdam']
            parser = rc.ArgumentParser(
                program='rbt',
                filename='.rbtrc',
                subcommands=['dev'],
                rc_file=file.name,
                argv=argv,
            )

            self.assertListEqual(
                parser._expand_dot_rc(argv),
                [
                    '--env=AMSTERDAM_ENV=true',
                    '--env=ALWAYS_ENV=true',
                    'dev',
                    '--config=amsterdam',
                    '--always-dev=true',
                    '--config=fullstack',
                    '--name=demo',
                    '--python',
                    '../bazel-bin/microservices_demo/backend/app.zip',
                    '--fullstack',
                ],
            )

    async def test_expand_flags_from_dot_rbtrc_with_nested_subcommands(
        self
    ) -> None:
        with tempfile.NamedTemporaryFile() as file:
            file.write(
                (
                    '...:amsterdam --env=AMSTERDAM_ENV=true\n'
                    'cloud up:amsterdam --test=fancy\n'
                    'cloud up ./easy\n'
                    'cloud up hard\n'
                    'cloud up harder hardest\n'
                ).encode()
            )
            file.flush()

            argv = ['rbt', 'cloud', 'up', '--config=amsterdam']
            parser = rc.ArgumentParser(
                program='rbt',
                filename='.rbtrc',
                subcommands=['cloud up', 'cloud down'],
                rc_file=file.name,
                argv=argv,
            )

            # Positional argument.
            parser.subcommand('cloud up').add_argument(
                'file',
                type=str,
                repeatable=True,
                help='test flag; not used.',
            )

            # Optional argument.
            parser.subcommand('cloud up').add_argument(
                '--test',
                type=str,
                repeatable=True,
                help='test flag; not used.',
            )

            parser.subcommand('cloud up').add_argument(
                '--env',
                type=str,
                repeatable=True,
                help='test flag; not used.',
            )

            self.assertListEqual(
                parser._expand_dot_rc(argv),
                [
                    '--env=AMSTERDAM_ENV=true',
                    'cloud',
                    'up',
                    '--config=amsterdam',
                    './easy',
                    'hard',
                    'harder',
                    'hardest',
                    '--test=fancy',
                ],
            )

    async def test_expand_flags_absolutize_filenames(self) -> None:
        with tempfile.NamedTemporaryFile() as file:
            file.write(('dev --file=fancy\n').encode())
            file.flush()

            argv = ['rbt', 'dev']
            parser = rc.ArgumentParser(
                program='rbt',
                filename='.rbtrc',
                subcommands=['dev'],
                rc_file=file.name,
                argv=argv,
            )

            parser.subcommand('dev').add_argument(
                '--file',
                type=Path,
                help='test flag.',
            )

            rc_file_dir = str(Path(file.name).parent)
            self.assertListEqual(
                parser._expand_dot_rc(argv),
                [
                    'dev',
                    f'--file={rc_file_dir}/fancy',
                ],
            )

    async def test_expand_flags_absolutize_default_filenames(self) -> None:
        """
        When a path argument has a relative default, it is expanded relative to
        the current working directory.
        """
        cwd = Path("/tmp/myapp")
        argv = ['rbt', 'dev']
        parser = rc.ArgumentParser(
            program='rbt',
            filename='.rbtrc',
            subcommands=['dev'],
            argv=argv,
            cwd=cwd,
        )

        parser.subcommand('dev').add_argument(
            '--file',
            type=Path,
            help='test flag.',
            default="./defaultfancy",
        )

        args, _ = parser.parse_args()
        self.assertEqual(f'{args.file}', f'{cwd}/defaultfancy')

    async def test_global_options(self) -> None:
        with tempfile.NamedTemporaryFile() as file:

            file.write(('... --global=something\n').encode())
            file.flush()

            argv = ['rbt', 'cloud', 'up', '--test=something']
            parser = rc.ArgumentParser(
                program='rbt',
                filename='.rbtrc',
                subcommands=['cloud up', 'cloud down'],
                rc_file=file.name,
                argv=argv,
            )

            parser.add_argument(
                '--global',
                type=str,
                help='test flag; not used',
            )

            parser.subcommand('cloud up').add_argument(
                '--test',
                type=str,
                help='test flag; not used.',
            )

            self.assertDictEqual(
                vars(parser.parse_args()[0]),
                {
                    'global': 'something',
                    'subcommand': 'cloud up',
                    'test': 'something',
                    'config': None,
                },
            )

    async def test_invalid_subcommand(self) -> None:
        with tempfile.NamedTemporaryFile() as file:
            file.write(('rbt dev command\n').encode())
            file.flush()

            argv = ['rbt', 'dev']
            parser = rc.ArgumentParser(
                program='rbt',
                filename='.rbtrc',
                subcommands=['dev'],
                rc_file=file.name,
                argv=argv,
            )

            with self.assertRaises(ValueError) as e:
                parser._expand_dot_rc(argv)

            self.assertEqual(
                str(e.exception),
                f"{file.name}:1: 'rbt dev command' is not a valid subcommand (available subcommands: dev)",
            )

    async def test_error_in_rc_file(self) -> None:
        with tempfile.NamedTemporaryFile() as file:
            file.write(('dev\n').encode())
            file.flush()

            argv = ['rbt', 'dev']
            parser = rc.ArgumentParser(
                program='rbt',
                filename='.rbtrc',
                subcommands=['dev'],
                rc_file=file.name,
                argv=argv,
            )

            # Mock fail, because the original fail will exit the program.
            def mock_raise_instead_fail(message):
                raise ValueError(message)

            with self.assertRaises(ValueError) as e:
                parser._expand_dot_rc(argv)

            self.assertEqual(
                str(e.exception),
                f"{file.name}:1: failed to parse '.rbtrc' file:\n'dev'",
            )


if __name__ == '__main__':
    unittest.main()
