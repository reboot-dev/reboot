import io
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import Mock
from process_cleanup import ProcessCleanup

class CleanupTests(unittest.TestCase):
    def test_timeout_preserves_owner_and_continues_sibling_cleanup(self):
        cleanup = ProcessCleanup()
        first, second = Mock(pid=101, returncode=None), Mock(pid=102, returncode=0)
        first.poll.return_value = None
        first.wait.side_effect = subprocess.TimeoutExpired('host', 15)
        second.poll.return_value = 0
        marker = Mock()
        with self.assertRaises(subprocess.TimeoutExpired):
            cleanup.stop(first, marker)
        first.kill.assert_not_called()
        marker.touch.assert_called_once()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'log'
            path.write_text('retained evidence')
            records, errors = cleanup.collect([(first,io.BytesIO(),path,['host']),
                                               (second,io.BytesIO(),path,['database'])])
        self.assertEqual([r['pid'] for r in records], [101,102])
        self.assertEqual([e['pid'] for e in errors], [101])
        first.kill.assert_not_called()
        first.wait.assert_called_once()
        self.assertEqual(records[1]['exit'], 0)

    def test_initial_stop_timeout_does_not_abort_cleanup_loop(self):
        cleanup = ProcessCleanup()
        first, second = Mock(pid=101, returncode=None), Mock(pid=102, returncode=0)
        first.poll.return_value = None
        first.wait.side_effect = subprocess.TimeoutExpired('database',15)
        second.poll.return_value = 0
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'log'
            path.write_text('evidence')
            records, errors = cleanup.collect([(first,io.BytesIO(),path,['database']),
                                               (second,io.BytesIO(),path,['host'])])
        self.assertEqual(len(records),2)
        self.assertEqual(len(errors),1)
        self.assertIn(101,cleanup.timed_out)
        first.kill.assert_called_once()
        second.poll.assert_called()

if __name__ == '__main__':
    unittest.main()
