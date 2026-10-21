"""Exercise standalone/aggregate budget guards without starting their CLI gates."""
import ast
import os
from pathlib import Path
import shutil
import subprocess
from types import SimpleNamespace
from typing import Any
import unittest
from unittest.mock import patch

HERE = Path(__file__).parent
FLOOR = 8 * 1024**3


def guard(filename):
    tree = ast.parse((HERE / filename).read_text())
    function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'budget')
    namespace: dict[str, Any] = dict(os=os, shutil=shutil, subprocess=subprocess, TARGET=HERE,
                                      target=HERE, probe=False, evidence={})
    exec(compile(ast.Module(body=[function], type_ignores=[]), str(HERE / filename), 'exec'), namespace)
    return namespace


class BudgetTests(unittest.TestCase):
    scripts = ('rust_examples_tasks_e2e.py', 'rust_user_acceptance_runner.py')

    def invoke(self, filename, size, free=FLOOR, limit=None):
        namespace = guard(filename)
        with patch.dict(os.environ, {}, clear=True), \
             patch.object(subprocess, 'check_output', return_value=f'{size}\towned-target\n'.encode()), \
             patch.object(shutil, 'disk_usage', return_value=SimpleNamespace(free=free)):
            if limit is not None:
                os.environ['RUST_DX_TARGET_CEILING_BYTES'] = str(limit)
            namespace['budget']()
        return namespace

    def test_original_default_is_not_silently_relaxed(self):
        for filename in self.scripts:
            with self.subTest(filename=filename):
                self.invoke(filename, 10_000_000_000)
                with self.assertRaises(AssertionError):
                    self.invoke(filename, 10_000_000_001)

    def test_explicit_approved_ceiling_is_applied(self):
        for filename in self.scripts:
            with self.subTest(filename=filename):
                self.invoke(filename, 10_000_000_001, limit=12_000_000_000)
                self.invoke(filename, 12_000_000_000, limit=12_000_000_000)
                with self.assertRaises(AssertionError):
                    self.invoke(filename, 12_000_000_001, limit=12_000_000_000)

    def test_free_space_floor_stays_independent(self):
        for filename in self.scripts:
            with self.subTest(filename=filename):
                with self.assertRaises(AssertionError):
                    self.invoke(filename, 1, free=FLOOR - 1, limit=12_000_000_000)
                self.invoke(filename, 1, free=FLOOR, limit=12_000_000_000)

    def test_nonpositive_or_malformed_ceiling_fails_closed(self):
        for filename in self.scripts:
            for limit in ('0', '-1', 'invalid'):
                with self.subTest(filename=filename, limit=limit):
                    with self.assertRaises((AssertionError, ValueError)):
                        self.invoke(filename, 1, limit=limit)

    def test_public_receipt_records_actual_ceiling(self):
        namespace = self.invoke('rust_examples_tasks_e2e.py', 11_000_000_000, limit=12_000_000_000)
        self.assertEqual(namespace['evidence']['budgets'], [dict(
            target_bytes=11_000_000_000, free_bytes=FLOOR, target_ceiling_bytes=12_000_000_000)])


if __name__ == '__main__':
    unittest.main()
