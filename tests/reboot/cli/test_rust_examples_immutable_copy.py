"""Exercise the real runner copy settings against immutable source files."""
import ast
from pathlib import Path
import shutil
import tempfile
import unittest


class ImmutableExampleCopyTest(unittest.TestCase):
    def test_each_public_runner_stages_writable_files_without_changing_source(self):
        root = Path(__file__).parent
        count = 0
        for name in ('rust_examples_constructor_e2e.py', 'rust_examples_tasks_e2e.py'):
            tree = ast.parse((root / name).read_text())
            calls = [node for node in ast.walk(tree) if isinstance(node, ast.Call)
                     and isinstance(node.func, ast.Attribute)
                     and isinstance(node.func.value, ast.Name)
                     and node.func.value.id == 'shutil' and node.func.attr == 'copytree']
            self.assertTrue(calls)
            for call in calls:
                with self.subTest(runner=name, line=call.lineno):
                    keyword = next(k for k in call.keywords if k.arg == 'copy_function')
                    copier = eval(compile(ast.Expression(keyword.value), name, 'eval'), {'shutil': shutil})
                    self.assertIs(copier, shutil.copyfile)
                    with tempfile.TemporaryDirectory() as td:
                        source = Path(td) / 'source'
                        source.mkdir()
                        original = source / 'Cargo.toml'
                        original.write_text('immutable input')
                        original.chmod(0o400)
                        destination = Path(td) / 'stage'
                        shutil.copytree(source, destination, copy_function=copier)
                        copied = destination / 'Cargo.toml'
                        self.assertTrue(copied.stat().st_mode & 0o200)
                        copied.write_text('edited task-owned copy')
                        self.assertEqual(original.read_text(), 'immutable input')
                        self.assertEqual(original.stat().st_mode & 0o777, 0o400)
                    count += 1
        self.assertEqual(count, 5)


if __name__ == '__main__':
    unittest.main()
