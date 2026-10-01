import asyncio
import contextlib
import io
from pathlib import Path
import reboot.cli.common.cli as cli
import unittest


class SkillsTestCase(unittest.TestCase):

    def _run(self, command: list[str]) -> str:
        parser = cli.create_parser(argv=['rbt', *command])
        args, _ = parser.parse_args()
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            result = asyncio.run(cli.handle_skills_subcommand(args))
        self.assertEqual(result, 0)
        return output.getvalue()

    def test_list_includes_bundled_app_skill(self) -> None:
        output = self._run(['skills', 'list'])
        self.assertIn('app\tBuild a Reboot application', output)
        self.assertIn('python\t', output)

    def test_get_prints_exact_skill_content(self) -> None:
        output = self._run(['skills', 'get', 'app'])
        self.assertTrue(output.startswith('---\nname: app\n'))
        self.assertIn('# app — Build a Reboot Application', output)

    def test_runtime_bundle_matches_plugin_skills(self) -> None:
        root = Path(__file__).parents[3]
        source = root / 'reboot' / 'plugin' / 'skills'
        bundled = root / 'reboot' / 'cli' / 'skills'
        source_files = sorted(path.relative_to(source) for path in source.rglob('*') if path.is_file())
        bundled_files = sorted(path.relative_to(bundled) for path in bundled.rglob('*') if path.is_file())
        self.assertEqual(bundled_files, source_files)
        for relative_path in source_files:
            self.assertEqual(
                (bundled / relative_path).read_bytes(),
                (source / relative_path).read_bytes(),
                relative_path,
            )


if __name__ == '__main__':
    unittest.main(verbosity=2)
