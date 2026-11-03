"""Offline byte-for-byte verification of the immutable Python reference bundle.

This checks provenance, NOT application/runtime conformance. It needs only Python's
standard library and never imports the upstream application or generated bindings.
"""
import hashlib
import json
from pathlib import Path
import unittest

HERE = Path(__file__).resolve().parent
FIXTURES = HERE.parent
REVISION = '5c332a2910122d6035799bfaf2a314bf1de830b8'
PATHS = {
    'api/hello_constructors/v1/hello.proto',
    'hello-constructors/backend/src/hello_servicer.py',
    'hello-constructors/backend/src/main.py',
    'hello-constructors/backend/tests/hello.feature',
    'hello-constructors/backend/tests/hello_servicer_test.py',
    'hello-constructors/.rbtrc',
}


class ReferenceBundle(unittest.TestCase):
    def test_all_pinned_reference_bytes(self):
        manifest = json.loads((FIXTURES / 'upstream.json').read_text())
        self.assertEqual(manifest['repository'], 'reboot-dev/reboot-examples')
        self.assertEqual(manifest['revision'], REVISION)
        entries = [entry for entry in manifest['files'] if entry['upstream_path'] in PATHS]
        self.assertEqual(len(entries), len(PATHS))
        self.assertEqual({entry['upstream_path'] for entry in entries}, PATHS)
        for entry in entries:
            with self.subTest(path=entry['upstream_path']):
                path = FIXTURES / entry['reference_path']
                self.assertEqual(path, HERE / 'upstream' / entry['upstream_path'])
                self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), entry['sha256'])

    def test_rust_build_schema_is_identical_to_reference(self):
        relative = Path('api/hello_constructors/v1/hello.proto')
        self.assertEqual((FIXTURES / relative).read_bytes(), (HERE / 'upstream' / relative).read_bytes())


if __name__ == '__main__':
    unittest.main(verbosity=2)
