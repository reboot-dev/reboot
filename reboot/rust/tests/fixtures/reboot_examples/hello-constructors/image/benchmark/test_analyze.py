import json
from pathlib import Path
import tempfile
import unittest
from analyze import analyze, percentile


class EvidenceTests(unittest.TestCase):
    def test_nearest_rank(self):
        self.assertEqual(percentile([4, 1, 3, 2], .5), 2)
        self.assertEqual(percentile(list(range(100)), .95), 94)
        self.assertEqual(percentile(list(range(100)), .99), 98)

    def test_empty_rejected(self):
        with self.assertRaises(AssertionError):
            percentile([], .5)

    def test_incomplete_owner_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d)/'owner.json').write_text(json.dumps({'complete': False}))
            with self.assertRaises(AssertionError):
                analyze(d)

    def test_unjoined_owner_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d)/'owner.json').write_text(json.dumps({'complete': True, 'terminal': True, 'all_waits_joined': False}))
            with self.assertRaises(AssertionError):
                analyze(d)


if __name__ == '__main__':
    unittest.main()
