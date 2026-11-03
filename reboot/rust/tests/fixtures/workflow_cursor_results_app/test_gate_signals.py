"""Real Linux gate/child signals, not a native Database acceptance run."""
import fcntl
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest

HERE = Path(__file__).resolve().parent


def until(predicate, timeout=10):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(.01)
    raise AssertionError('test milestone timed out')


class GateSignalTests(unittest.TestCase):
    def test_sigterm_stopped_child_retains_original_lock_until_reconciled(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            stage = base / 'gate'
            ready = base / 'ready'
            release = base / 'release'
            child_code = (
                'import os,pathlib,signal,time\n'
                f'pathlib.Path({str(ready)!r}).write_text(str(os.getpid()))\n'
                'os.kill(os.getpid(), signal.SIGSTOP)\n'
                f'while not pathlib.Path({str(release)!r}).exists(): time.sleep(.01)\n')
            code = f'''import sys
sys.path.insert(0, {str(HERE)!r})
import run_native_gate as gate

def owned_body(*args, **kwargs):
    child = gate.cursor_custody.spawn([sys.executable, '-c', {child_code!r}])
    child.join(60)
    raise AssertionError('test child should require external reconciliation')

gate.runpy.run_path = owned_body
gate.main()
'''
            env = dict(os.environ, CURSOR_GATE_DIR=str(stage),
                       CURSOR_APP_BIN=sys.executable,
                       REBOOT_NATIVE2PC_CXX_DATABASE=sys.executable)
            for key in ('CURSOR_STAGE', 'CURSOR_EVIDENCE'):
                env.pop(key, None)
            process = subprocess.Popen([sys.executable, '-c', code], env=env,
                                       stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            child_fd = None
            try:
                until(ready.exists)
                child_pid = int(ready.read_text())
                child_fd = os.pidfd_open(child_pid)
                def stopped():
                    stat = Path(f'/proc/{child_pid}/stat').read_text().rsplit(') ', 1)[1].split()
                    return stat[0] == 'T' and stat[1] == str(process.pid)
                until(stopped)
                process.send_signal(signal.SIGTERM)
                until((stage / 'retained-owners.json').exists)
                for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGTERM):
                    process.send_signal(sig)  # Repeated signals cannot unwind retention.
                    time.sleep(.05)
                    self.assertIsNone(process.poll())
                    self.assertTrue(stopped())
                    with (stage / 'owner.lock').open() as lock:
                        with self.assertRaises(BlockingIOError):
                            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                report = json.loads((stage / 'gate.json').read_text())
                self.assertFalse(report['complete'])
                self.assertIn('signal 15', report['failure'])
                # Resume exactly this child, but keep it alive: CONT alone must
                # not release ownership, nor may the runner send it SIGTERM.
                signal.pidfd_send_signal(child_fd, signal.SIGCONT)
                time.sleep(.1)
                self.assertIsNone(process.poll())
                with (stage / 'owner.lock').open() as lock:
                    with self.assertRaises(BlockingIOError):
                        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            finally:
                if child_fd is not None:
                    signal.pidfd_send_signal(child_fd, signal.SIGCONT)
                release.touch()
                stdout, stderr = process.communicate(timeout=10)
                if child_fd is not None:
                    os.close(child_fd)
            self.assertNotEqual(process.returncode, 0, stderr)
            self.assertNotIn('CURSOR_NATIVE_ACCEPTED', stdout)
            final = json.loads((stage / 'gate.json').read_text())
            self.assertFalse(final['complete'])
            self.assertIsNotNone(final['custody_failure'])
            self.assertEqual(final['signals'], [15, 15, 2, 15])
            self.assertFalse(Path(f'/proc/{child_pid}').exists())
            with (stage / 'owner.lock').open() as lock:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)


if __name__ == '__main__':
    unittest.main()
