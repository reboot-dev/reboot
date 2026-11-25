"""Preflight regressions only; these are NOT native writer/waiter proof."""
import os
from pathlib import Path
import runpy
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch


DRIVER = Path(__file__).with_name('prove_control_flow.py')


class RevisionPreflight(unittest.TestCase):
    def test_missing_original_runtime_blocks_before_legacy_subprocess_driver(self):
        with patch.dict(os.environ, {'WORKFLOW_CONTROL_SCENARIO': 'revision'}, clear=True):
            with self.assertRaisesRegex(RuntimeError, 'parent must supply its already loaded exact-child runtime'):
                runpy.run_path(str(DRIVER), run_name='__main__')

    def test_importable_but_not_already_loaded_runtime_is_not_accepted(self):
        with patch.dict(os.environ, {'WORKFLOW_CONTROL_SCENARIO': 'revision',
                                   'WORKFLOW_CUSTODY_MODULE': 'not_preloaded_q2_runtime'}, clear=True):
            with self.assertRaisesRegex(RuntimeError, 'already loaded exact-child runtime'):
                runpy.run_path(str(DRIVER), run_name='__main__')

    def test_inactive_original_gate_blocks_without_launch(self):
        runtime = SimpleNamespace(CONTRACT='cursor-exact-child-v2',
                                  _owner=SimpleNamespace(active_gate=False))
        with patch.dict(sys.modules, {'q2_test_runtime': runtime}):
            with patch.dict(os.environ, {'WORKFLOW_CONTROL_SCENARIO': 'revision',
                                       'WORKFLOW_CUSTODY_MODULE': 'q2_test_runtime'}, clear=True):
                with self.assertRaisesRegex(RuntimeError, 'original exact-child runtime gate is not active'):
                    runpy.run_path(str(DRIVER), run_name='__main__')


if __name__ == '__main__':
    unittest.main()
