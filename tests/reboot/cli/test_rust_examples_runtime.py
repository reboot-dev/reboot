"""Finite source-only tests: task-owned files only; no executables are launched."""
import ast
import contextlib
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import rust_examples_runtime as runtime


class RuntimeSelectionTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='runner396-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.database = self.executable('database')
        self.rbt = self.executable('rbt')
        self.env = {'RBT_RUST_DATABASE_BINARY': str(self.database),
                    'RBT': str(self.rbt), 'UNRELATED': 'preserved'}

    def executable(self, name):
        path = self.root / name
        path.write_bytes(b'#!/bin/sh\nexit 0\n')
        path.chmod(0o700)
        return path

    def test_explicit_selection_and_env_precedence(self):
        original = dict(self.env)
        with patch.dict('os.environ', {'RBT': '/not/selected'}, clear=True):
            rbt, env, provenance = runtime.select_runtime(self.env)
        self.assertEqual(self.env, original)
        self.assertEqual(rbt, self.rbt)
        self.assertEqual(env, self.env)
        self.assertEqual(provenance['database']['sha256'],
                         hashlib.sha256(self.database.read_bytes()).hexdigest())
        self.assertIn('not established', provenance['compatibility'])

    def test_missing_native_has_no_fallback(self):
        del self.env['RBT_RUST_DATABASE_BINARY']
        with self.assertRaisesRegex(ValueError, 'RBT_RUST_DATABASE_BINARY'):
            runtime.select_runtime(self.env)

    def test_invalid_native_paths(self):
        not_executable = self.root / 'not-executable'
        not_executable.write_text('no')
        not_executable.chmod(0o600)
        for value in ['', 'relative/path', str(self.root / 'absent'),
                      str(self.root), str(not_executable), 'bad\0path']:
            with self.subTest(value=value):
                self.env['RBT_RUST_DATABASE_BINARY'] = value
                with self.assertRaisesRegex(ValueError, 'RBT_RUST_DATABASE_BINARY'):
                    runtime.select_runtime(self.env)

    def test_invalid_explicit_rbt_never_uses_default(self):
        for value in ['', 'relative', str(self.root / 'absent'), str(self.root)]:
            with self.subTest(value=value):
                self.env['RBT'] = value
                with patch.object(runtime, 'DEFAULT_RBT', str(self.rbt)):
                    with self.assertRaisesRegex(ValueError, 'RBT'):
                        runtime.select_runtime(self.env)

    def test_nonexecutable_rbt(self):
        self.rbt.chmod(0o600)
        with self.assertRaisesRegex(ValueError, 'RBT is not an executable'):
            runtime.select_runtime(self.env)

    def test_default_rbt_only_when_unset(self):
        del self.env['RBT']
        with patch.object(runtime, 'DEFAULT_RBT', str(self.rbt)):
            rbt, _, _ = runtime.select_runtime(self.env)
        self.assertEqual(rbt, self.rbt)
        self.assertEqual(runtime.DEFAULT_RBT,
                         '/tmp/reboot-rust-app-dx-loop2-venv310/bin/rbt')

    def test_missing_default_rbt_fails(self):
        del self.env['RBT']
        with patch.object(runtime, 'DEFAULT_RBT', str(self.root / 'absent')):
            with self.assertRaisesRegex(ValueError, 'RBT'):
                runtime.select_runtime(self.env)

    def test_symlinks_are_pinned_to_resolved_files(self):
        link = self.root / 'selected'
        link.symlink_to(self.database)
        self.env['RBT_RUST_DATABASE_BINARY'] = str(link)
        _, env, provenance = runtime.select_runtime(self.env)
        self.assertEqual(env['RBT_RUST_DATABASE_BINARY'], str(self.database))
        self.assertEqual(provenance['database']['requested_path'], str(link))

    def test_dangling_symlink_rejected(self):
        link = self.root / 'dangling'
        link.symlink_to(self.root / 'absent')
        self.env['RBT_RUST_DATABASE_BINARY'] = str(link)
        with self.assertRaisesRegex(ValueError, 'RBT_RUST_DATABASE_BINARY'):
            runtime.select_runtime(self.env)

    def test_symlink_loop_rejected(self):
        link = self.root / 'loop'
        link.symlink_to(link)
        self.env['RBT_RUST_DATABASE_BINARY'] = str(link)
        with self.assertRaisesRegex(ValueError, 'RBT_RUST_DATABASE_BINARY'):
            runtime.select_runtime(self.env)

    def selected(self):
        rbt, env, provenance = runtime.select_runtime(self.env)
        return rbt, env, {'passed': False, 'runtime': provenance}

    def test_receipt_and_log_before_caller_launch(self):
        rbt, env, evidence = self.selected()
        result = self.root / 'result.json'
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            runtime.record_runtime_launch(result, evidence, env, rbt, 'initial')
        receipt = json.loads(result.read_text())
        self.assertFalse(receipt['passed'])
        record = receipt['runtime_launches'][0]
        self.assertEqual(record['database']['sha256'],
                         hashlib.sha256(self.database.read_bytes()).hexdigest())
        self.assertIn(record['database']['sha256'], output.getvalue())
        self.assertEqual(record['rbt']['path'], str(self.rbt))

    def test_drift_rejected_before_receipt(self):
        for name in ['database', 'rbt']:
            with self.subTest(name=name):
                rbt, env, evidence = self.selected()
                path = self.database if name == 'database' else self.rbt
                path.write_bytes(path.read_bytes() + b'# changed\n')
                result = self.root / 'result.json'
                with self.assertRaisesRegex(ValueError, 'changed since selection'):
                    runtime.record_runtime_launch(result, evidence, env, rbt, 'restart')
                self.assertFalse(result.exists())
                self.assertNotIn('runtime_launches', evidence)

    def test_removed_executable_rejected_at_launch(self):
        rbt, env, evidence = self.selected()
        self.database.unlink()
        with self.assertRaisesRegex(ValueError, 'RBT_RUST_DATABASE_BINARY'):
            runtime.record_runtime_launch(self.root / 'result.json', evidence,
                                          env, rbt, 'restart')

    def test_unwritable_receipt_prevents_return_to_launch(self):
        rbt, env, evidence = self.selected()
        with self.assertRaises(OSError):
            runtime.record_runtime_launch(self.root / 'absent/result.json', evidence,
                                          env, rbt, 'initial')

    def test_aggregate_runner_uses_one_explicit_database(self):
        tree = ast.parse(Path(__file__).with_name('rust_user_acceptance_runner.py').read_text())
        branch = next(node for node in ast.walk(tree)
                      if isinstance(node, ast.ImportFrom) and node.module == 'rust_examples_runtime')
        # Execute only the actual selection statements, never the acceptance runner.
        parent = next(node for node in ast.walk(tree)
                      if isinstance(node, ast.If) and branch in node.orelse)
        start = parent.orelse.index(branch)
        selection = ast.Module(body=parent.orelse[start:start + 4], type_ignores=[])
        code = compile(ast.fix_missing_locations(selection), '<actual-selection>', 'exec')
        import os
        import pathlib
        for env, succeeds in [(self.env, True), ({}, False),
                              ({**self.env, 'REBOOT_NATIVE2PC_CXX_DATABASE': str(self.rbt)}, False),
                              ({**self.env, 'REBOOT_NATIVE2PC_CXX_DATABASE': str(self.database)}, True)]:
            with self.subTest(env=env), patch.dict(os.environ, env, clear=True):
                namespace = {'os': os, 'pathlib': pathlib}
                if succeeds:
                    exec(code, namespace)
                    self.assertEqual(namespace['database'], self.database)
                else:
                    with self.assertRaises(ValueError):
                        exec(code, namespace)
        text = Path(__file__).with_name('rust_user_acceptance_runner.py').read_text()
        self.assertNotIn('reboot-rust-rich-errors', text)
        self.assertIn('RBT_RUST_DATABASE_BINARY=str(database)', text)

    def test_runner_wiring_without_import_or_execution(self):
        for name in ['constructor', 'tasks']:
            with self.subTest(name=name):
                text = Path(__file__).with_name(
                    f'rust_examples_{name}_e2e.py').read_text()
                tree = ast.parse(text)
                self.assertNotIn('reboot-rust-rich-errors', text)
                selection = [node for node in tree.body if isinstance(node, ast.Assign)
                             and isinstance(node.value, ast.Call)
                             and isinstance(node.value.func, ast.Name)
                             and node.value.func.id == 'select_runtime']
                self.assertEqual(len(selection), 1)
                self.assertEqual(ast.unparse(selection[0].value),
                                 'select_runtime(os.environ)')
                functions = {node.name: node for node in tree.body
                             if isinstance(node, ast.FunctionDef)}
                for function in ['start'] + (['inspect_shutdown'] if name == 'tasks' else []):
                    body = functions[function].body
                    self.assertEqual(body[0].value.func.id, 'record_runtime_launch')
                    self.assertTrue(any(isinstance(node, ast.Call)
                                        and ast.unparse(node.func) == 'subprocess.Popen'
                                        for node in ast.walk(functions[function])))


if __name__ == '__main__':
    unittest.main()
