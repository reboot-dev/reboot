"""Real task-owned child tests and labelled synthetic inspector regressions.

These are not native Database/GC runtime acceptance.
"""
import fcntl
import importlib.util
import time
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from gc_assertions import roots, assert_gc

HERE = Path(__file__).resolve().parent


class CustodyTests(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location('test_custody', HERE / 'cursor_custody.py')
        assert spec is not None and spec.loader is not None
        self.custody = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.custody)

    def test_client_exact_receipt_and_output(self):
        result = self.custody.run([sys.executable, '-c', 'print("actual-child")'])
        self.assertEqual(result.stdout.strip(), 'actual-child')
        self.assertEqual(result.returncode, 0)
        child, = self.custody.children
        child.assert_joined()
        self.assertIsNotNone(child.receipt['wait_status'])
        self.assertIsNone(child.fd)

    def test_natural_failure_not_shutdown(self):
        child = self.custody.spawn([sys.executable, '-c', 'raise SystemExit(7)'])
        receipt = child.join_failure()
        self.assertEqual(receipt.returncode, 7)
        self.assertTrue(receipt.natural_exit)
        child.retire()  # Idempotent, no signal to the now-reaped PID.
        child.assert_joined()

    def test_unexpected_zero_exit_is_not_requested_shutdown(self):
        child = self.custody.spawn([sys.executable, '-c', 'pass'])
        deadline = time.monotonic() + 5
        while child._ready() is None and time.monotonic() < deadline:
            time.sleep(.01)
        with self.assertRaisesRegex(RuntimeError, 'exited before requested shutdown: 0'):
            child.retire()
        self.assertTrue(child.joined_exact)
        self.assertEqual(child.returncode, 0)
        self.assertIsNotNone(child.receipt)
        self.assertFalse(child.requested_shutdown)
        self.assertIsNotNone(self.custody._owner.failure)
        child.retire()  # Idempotence cannot clear the original sticky failure.
        with self.assertRaisesRegex(RuntimeError, 'obligation retained'):
            child.assert_joined()

    def test_expected_failure_cannot_accept_zero(self):
        child = self.custody.spawn([sys.executable, '-c', 'pass'])
        with self.assertRaisesRegex(RuntimeError, 'expected nonzero natural child failure'):
            child.join_failure()
        self.assertTrue(child.joined_exact)
        self.assertIsNotNone(self.custody._owner.failure)

    def test_cooperative_file_shutdown_joins(self):
        with tempfile.TemporaryDirectory() as directory:
            shutdown = Path(directory) / 'shutdown'
            child = self.custody.spawn([sys.executable, '-c',
                'import pathlib,sys,time\np=pathlib.Path(sys.argv[1])\nwhile not p.exists(): time.sleep(.01)', str(shutdown)])
            child.retire(shutdown=shutdown)
            self.assertEqual(child.returncode, 0)
            self.assertTrue(child.requested_shutdown)
            child.assert_joined()

    def test_timeout_preserves_without_shutdown_escalation(self):
        with tempfile.TemporaryDirectory() as directory:
            release = Path(directory) / 'release'
            child = self.custody.spawn([sys.executable, '-c',
                'import pathlib,sys,time\np=pathlib.Path(sys.argv[1])\nwhile not p.exists(): time.sleep(.01)', str(release)])
            try:
                with self.assertRaises(TimeoutError):
                    child.join(.02)
                self.assertFalse(child.joined_exact)
                self.assertIsNotNone(child.fd)
                child.require_owned_alive()
                with self.assertRaisesRegex(RuntimeError, 'timed-out live owner retained'):
                    child.retire(shutdown=release)
                self.assertFalse(release.exists())
                self.assertFalse(child.requested_shutdown)
            finally:
                release.touch()  # External reconciliation; owner sent no signal.
                child.join(5)
            self.assertEqual(child.returncode, 0)
            child.assert_joined()

    def test_pidfd_only_shutdown(self):
        child = self.custody.spawn([sys.executable, '-c', 'import time;time.sleep(60)'])
        with patch('os.kill', side_effect=AssertionError('PID-only signal forbidden')):
            child.retire()
        self.assertEqual(child.returncode, -15)
        child.assert_joined()

    def test_echild_never_synthesizes_success(self):
        child = self.custody.spawn([sys.executable, '-c', 'pass'])
        with patch('os.waitid', side_effect=ChildProcessError('injected ECHILD')):
            with self.assertRaises(ChildProcessError):
                child.join(1)
        self.assertFalse(child.joined_exact)
        self.assertIsNone(child.receipt)
        self.assertIsNotNone(self.custody._owner.failure)
        # Test-only genuine cleanup of exactly this child, not a success receipt.
        _, raw = os.waitpid(child.process.pid, 0)
        child.process.returncode = os.waitstatus_to_exitcode(raw)
        os.close(child.fd)

    def test_failed_acquisition_remains_in_ledger(self):
        with patch('os.pidfd_open', side_effect=OSError('injected acquire failure')):
            with self.assertRaises(OSError):
                self.custody.spawn([sys.executable, '-c', 'pass'])
        child, = self.custody.children
        self.assertIs(self.custody._owner.direct[0], child.row)
        self.assertFalse(child.row['joined'])
        self.assertIsNotNone(self.custody._owner.failure)
        _, raw = os.waitpid(child.process.pid, 0)
        child.process.returncode = os.waitstatus_to_exitcode(raw)


class GCAssertionTests(unittest.TestCase):
    def test_synthetic_scope_regressions(self):
        root = {'scope_iteration': None, 'record': 'UNIT-root'}
        current = {'scope_iteration': 9999, 'record': 'UNIT-current'}
        def inventory(records):
            return {'records': records, 'inventory_through': 9999,
                    'inventory_count': len(records)}
        snapshot = inventory([root, current])
        initial = roots(snapshot)
        assert_gc(snapshot, initial, 9999)
        for records in ([current], [root, dict(current, scope_iteration=0)],
                        [root, dict(current, scope_iteration=7341), current],
                        [root] + [dict(current, record=str(i)) for i in range(9)]):
            with self.subTest(records=records), self.assertRaises(AssertionError):
                assert_gc(inventory(records), initial, 9999)
        with self.assertRaisesRegex(AssertionError, 'missing complete iteration inventory'):
            assert_gc({'records': [root]}, initial, 9999)
        with self.assertRaisesRegex(AssertionError, 'inventory count mismatch'):
            assert_gc(dict(snapshot, inventory_count=1), initial, 9999)

    def test_actual_gate_retains_lock_until_owned_child_natural_exit(self):
        with tempfile.TemporaryDirectory() as directory:
            stage = Path(directory) / 'gate'
            release = Path(directory) / 'release'
            child_code = ('import pathlib,time\n'
                          f'p=pathlib.Path({str(release)!r})\n'
                          'while not p.exists(): time.sleep(.01)')
            code = f'''import sys
sys.path.insert(0, {str(HERE)!r})
import run_native_gate as gate

def failing_body(*args, **kwargs):
    gate.cursor_custody.spawn([sys.executable, '-c', {child_code!r}])
    raise RuntimeError('UNIT injected body failure, not native execution')

gate.runpy.run_path = failing_body
gate.main()
'''
            env = dict(os.environ, CURSOR_GATE_DIR=str(stage),
                       CURSOR_APP_BIN=sys.executable,
                       REBOOT_NATIVE2PC_CXX_DATABASE=sys.executable)
            for key in ('CURSOR_STAGE', 'CURSOR_EVIDENCE'):
                env.pop(key, None)
            process = subprocess.Popen([sys.executable, '-c', code], env=env,
                                       stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            try:
                deadline = time.monotonic() + 5
                while time.monotonic() < deadline:
                    try:
                        report = json.loads((stage / 'gate.json').read_text())
                        if 'failure' in report:
                            break
                    except (FileNotFoundError, json.JSONDecodeError):
                        pass
                    time.sleep(.01)
                else:
                    self.fail('gate did not reach injected failure')
                self.assertFalse(report['complete'])
                with (stage / 'owner.lock').open() as lock:
                    with self.assertRaises(BlockingIOError):
                        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            finally:
                release.touch()
                process.communicate(timeout=10)
            self.assertNotEqual(process.returncode, 0)
            final = json.loads((stage / 'gate.json').read_text())
            self.assertFalse(final['complete'])
            self.assertEqual(len(final['children']), 2)  # Exact git preflight + owned child.
            self.assertTrue(final['children'][0]['joined'])
            self.assertFalse(final['children'][1]['joined'])  # No synthesized receipt.
            with (stage / 'owner.lock').open() as lock:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)

    def test_revision_dispatch_uses_original_active_runtime(self):
        # Labelled dispatch unit test, not native acceptance.
        with tempfile.TemporaryDirectory() as directory:
            stage = Path(directory) / 'gate'
            code = f'''import sys, os, json
from pathlib import Path
sys.path.insert(0, {str(HERE)!r})
import run_native_gate as gate

def body(path, run_name):
    assert path.endswith('/workflow_app/prove_revision.py')
    assert sys.modules[os.environ['WORKFLOW_CUSTODY_MODULE']] is gate.cursor_custody
    assert gate.cursor_custody._owner.active_gate
    assert os.environ['WORKFLOW_REVISION_STAGE'] == {str(stage / 'work')!r}
    Path(os.environ['WORKFLOW_CONTROL_EVIDENCE']).write_text(json.dumps(
        {{'complete': True, 'native_proof': True, 'label': 'UNIT dispatch only'}}))

gate.runpy.run_path = body
gate.main()
'''
            env = dict(os.environ, CURSOR_GATE_DIR=str(stage),
                       CURSOR_APP_BIN=sys.executable,
                       REBOOT_NATIVE2PC_CXX_DATABASE=sys.executable,
                       NATIVE_GATE_SCENARIO='revision')
            for key in ('WORKFLOW_REVISION_STAGE', 'WORKFLOW_CONTROL_EVIDENCE'):
                env.pop(key, None)
            result = subprocess.run([sys.executable, '-c', code], env=env,
                                    capture_output=True, text=True, timeout=10)
            self.assertEqual(result.returncode, 0, result.stderr)
            report = json.loads((stage / 'gate.json').read_text())
            self.assertEqual(report['scenario'], 'revision')
            self.assertTrue(report['complete'])
            self.assertEqual(len(report['children']), 1)  # Only genuine git child.

    def test_gate_missing_input_persists_real_preflight_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            env = dict(os.environ, CURSOR_GATE_DIR=str(Path(directory) / 'gate'))
            env.pop('CURSOR_APP_BIN', None)
            result = subprocess.run([sys.executable, str(HERE / 'run_native_gate.py')],
                                    env=env, capture_output=True, text=True, timeout=10)
            self.assertNotEqual(result.returncode, 0)
            report = json.loads((Path(env['CURSOR_GATE_DIR']) / 'gate.json').read_text())
            self.assertFalse(report['complete'])
            self.assertIn('CURSOR_APP_BIN', report['failure'])
            self.assertEqual(report['children'], [])


if __name__ == '__main__':
    unittest.main()
