import fcntl
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import Mock

import os
helper = Path(os.environ.get('RUST_OWNERSHIP_HELPER', str(Path(__file__).with_name('rust_process_ownership.py'))))
spec = importlib.util.spec_from_file_location('ownership', helper)
assert spec is not None and spec.loader is not None
ownership = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ownership)


class OwnershipTests(unittest.TestCase):
    def test_unexpected_exit_is_recorded_and_rejected(self):
        for status in (0, 7):
            process = Mock(pid=123, **{'poll.return_value': status})
            log = io.StringIO()
            record = {}
            close = ownership.RequestedShutdown(process, log, record)
            with self.assertRaisesRegex(RuntimeError, 'before requested shutdown'):
                close.close()
            self.assertTrue(log.closed)
            self.assertEqual(record, {'exit': status, 'unexpected_exit': True})
            process.send_signal.assert_not_called()

    def test_real_unexpected_exit_is_not_shutdown_proof(self):
        process = subprocess.Popen([sys.executable, '-c', 'raise SystemExit(7)'])
        self.assertEqual(process.wait(timeout=5), 7)
        log = io.StringIO()
        record = {}
        close = ownership.RequestedShutdown(process, log, record)
        with self.assertRaisesRegex(RuntimeError, 'before requested shutdown: 7'):
            close.close()
        self.assertTrue(record['unexpected_exit'])
        self.assertTrue(log.closed)

    def test_intentional_close_is_idempotent(self):
        process = Mock(pid=123, **{'poll.return_value': None, 'wait.return_value': 0})
        log = io.StringIO()
        record = {}
        close = ownership.RequestedShutdown(process, log, record)
        close.close()
        close.close()
        self.assertEqual(process.send_signal.call_count, 1)
        self.assertEqual(process.wait.call_count, 1)
        self.assertTrue(log.closed)
        self.assertTrue(record['requested_shutdown'])

    def test_requested_failure_is_not_success(self):
        process = Mock(pid=123, **{'poll.return_value': None, 'wait.return_value': 7})
        close = ownership.RequestedShutdown(process, io.StringIO(), {})
        with self.assertRaisesRegex(RuntimeError, 'returned 7'):
            close.close()

    def test_timeout_never_resignals_or_rewaits(self):
        process = Mock(pid=123, **{'poll.return_value': None})
        process.wait.side_effect = subprocess.TimeoutExpired('test-owner', 1)
        record = {}
        close = ownership.RequestedShutdown(process, io.StringIO(), record)
        with self.assertRaises(subprocess.TimeoutExpired):
            close.close()
        with self.assertRaisesRegex(RuntimeError, 'preserved'):
            close.close()
        self.assertEqual(process.send_signal.call_count, 1)
        self.assertEqual(process.wait.call_count, 1)
        self.assertTrue(record['timeout'])

    def runner_failure_probe(self, mode):
        runner = Path(os.environ.get('RUST_OWNERSHIP_RUNNER', str(Path(__file__).with_name('rust_user_acceptance_runner.py'))))
        with tempfile.TemporaryDirectory(prefix='reboot-runner-failure-regression-') as directory:
            root = Path(directory)
            with (root/'stdout.log').open('w') as out, (root/'stderr.log').open('w') as err:
                worker = subprocess.Popen([sys.executable,str(runner),'--ownership-failure-probe',
                                           directory,str(helper),mode],stdout=out,stderr=err)
                deadline = time.monotonic()+8
                while not (root/'retained-owners.json').exists():
                    self.assertIsNone(worker.poll(), (root/'stderr.log').read_text())
                    self.assertLess(time.monotonic(),deadline)
                    time.sleep(.01)
                with (root/'owner.lock').open('a') as lock:
                    with self.assertRaises(BlockingIOError):
                        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
                    self.assertFalse((root/'accepted.json').exists())
                    held=json.loads((root/'retained-owners.json').read_text())
                    for pid,start in held['live_owned_process_starttimes'].items():
                        info=ownership.process_info(pid)
                        self.assertIsNotNone(info)
                        self.assertEqual(info[0],start)
                        self.assertEqual(info[1],str(worker.pid))
                    (root/'release-child').write_text('release')
                    self.assertEqual(worker.wait(timeout=8),0 if mode=='success' else 1)
                    fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
                    fcntl.flock(lock,fcntl.LOCK_UN)
            evidence=json.loads((root/'retained-owners.json').read_text())
            self.assertTrue(evidence['live_owned_process_starttimes'])
            for pid,start in evidence['live_owned_process_starttimes'].items():
                self.assertNotEqual(ownership.process_start(pid),start)
            self.assertEqual((root/'accepted.json').exists(),mode=='success')
            if mode in ('observe','evidence'):
                self.assertIn('OWNERSHIP_RECONCILIATION_ERROR',(root/'stderr.log').read_text())

    def test_actual_runner_failure_adopts_unsampled_orphan(self):
        self.runner_failure_probe('none')

    def test_actual_runner_observation_error_retains_lock(self):
        self.runner_failure_probe('observe')

    def test_actual_runner_torn_snapshot_keeps_adopted_child(self):
        self.runner_failure_probe('snapshot')

    def test_actual_runner_closed_stderr_retains_lock(self):
        self.runner_failure_probe('stderr')

    def test_actual_runner_success_publishes_after_reaping(self):
        self.runner_failure_probe('success')

    def test_actual_runner_evidence_error_retains_lock(self):
        self.runner_failure_probe('evidence')

    def standalone_failure_probe(self, mode):
        harness = Path(__file__).with_name('rust_examples_tasks_e2e.py')
        with tempfile.TemporaryDirectory(prefix='reboot-tasks-retention-') as directory:
            root = Path(directory)
            with (root / 'stderr.log').open('w') as err:
                worker = subprocess.Popen([sys.executable, str(harness), '--ownership-failure-probe', directory, mode], stderr=err)
                try:
                    deadline = time.monotonic() + 8
                    while not (root / 'retained-owners.json').exists():
                        self.assertIsNone(worker.poll(), (root / 'stderr.log').read_text())
                        self.assertLess(time.monotonic(), deadline)
                        time.sleep(.01)
                    held = json.loads((root / 'retained-owners.json').read_text())
                    self.assertTrue(held['publication_blocked'])
                    self.assertTrue(held['live_owned_process_starttimes'])
                    with (root / 'owner.lock').open('a') as lock:
                        with self.assertRaises(BlockingIOError):
                            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                        for pid, start in held['live_owned_process_starttimes'].items():
                            self.assertEqual(ownership.process_info(pid)[:2], (start, str(worker.pid)))
                        self.assertFalse((root / 'accepted.json').exists())
                        (root / 'release-child').write_text('release')
                        self.assertEqual(worker.wait(timeout=8), 1)
                        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                        fcntl.flock(lock, fcntl.LOCK_UN)
                    for pid, start in held['live_owned_process_starttimes'].items():
                        self.assertNotEqual(ownership.process_start(pid), start)
                    self.assertIn('injected', (root / 'stderr.log').read_text())
                finally:
                    # Release only this probe's exact child. Never broad-kill.
                    (root / 'release-child').write_text('release')
                    worker.wait(timeout=8)

    def test_standalone_tasks_receipt_failure_retains_unsampled_orphan(self):
        self.standalone_failure_probe('receipt')

    def test_standalone_tasks_discovery_failure_retains_unsampled_orphan(self):
        self.standalone_failure_probe('discover')

    def test_standalone_tasks_assertion_failure_retains_unsampled_orphan(self):
        self.standalone_failure_probe('none')

    def test_real_lock_retained_until_child_natural_exit(self):
        with tempfile.TemporaryDirectory(prefix='reboot-owner-regression-') as directory:
            root = Path(directory)
            worker = subprocess.Popen([sys.executable, __file__, '--lock-worker', directory])
            deadline = time.monotonic() + 5
            while not (root / 'retained.json').exists():
                self.assertIsNone(worker.poll())
                self.assertLess(time.monotonic(), deadline)
                time.sleep(.01)
            evidence = json.loads((root / 'retained.json').read_text())
            self.assertTrue(evidence['publication_blocked'])
            self.assertTrue(evidence['live_owned_process_starttimes'])
            with (root / 'owner.lock').open('a') as lock:
                with self.assertRaises(BlockingIOError):
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                self.assertEqual(worker.wait(timeout=5), 0)
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                fcntl.flock(lock, fcntl.LOCK_UN)
            self.assertTrue((root / 'reconciled.json').exists())


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--lock-worker':
        root = Path(sys.argv[2])
        ownership.enable_subreaper()
        with (root / 'owner.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(1)'])
            owned = {str(child.pid): ownership.process_start(child.pid)}
            # Natural exit is reaped, never killed, so PID identity disappears.
            reaper = threading.Thread(target=child.wait)
            reaper.start()
            ownership.retain_until_owned_exit(owned, root / 'retained.json', .01, root_pid=os.getpid())
            reaper.join()
            (root / 'reconciled.json').write_text(json.dumps({'exit': child.returncode}))
    else:
        unittest.main(verbosity=2)
