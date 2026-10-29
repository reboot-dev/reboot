"""Host-independent selection/argv regressions; no system Python changes."""

import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[3]
SELECTOR = ROOT / 'reboot/nodejs/select_build_python.py'
spec = importlib.util.spec_from_file_location('select_build_python', SELECTOR)
assert spec is not None and spec.loader is not None
selector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(selector)


class BuildPythonTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='node python ')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.old_path = os.environ.get('PATH', '')
        self.addCleanup(os.environ.__setitem__, 'PATH', self.old_path)
        os.environ['PATH'] = str(self.root)

    def runtime(self, name, version, header=True, config=True):
        base = self.root / name
        base.mkdir()
        py = base / 'python3'
        h = base / 'Python.h'
        c = base / 'python3.10-config'
        if header:
            h.touch()
        if config:
            c.write_text('#!/bin/sh\nexit 0\n')
            c.chmod(0o755)
        data = dict(version=version, executable=str(py), header=str(h), config=str(c))
        py.write_text('#!/bin/sh\nprintf \'%s\\n\' ' + "'" + json.dumps(data) + "'\n")
        py.chmod(0o755)
        return py

    def ambient(self, py):
        (self.root / 'python3').symlink_to(py)

    def test_newer_ambient_uses_explicit_310_with_spaces(self):
        self.ambient(self.runtime('ambient 3.13', [3, 13]))
        fallback = self.runtime('hermetic 3.10', [3, 10])
        self.assertEqual(selector.select(str(fallback)), str(fallback))

    def test_keep_compatible_runner_installation(self):
        ambient = self.runtime('runner 3.10', [3, 10])
        self.ambient(ambient)
        self.assertEqual(selector.select('/not-used'), str(ambient))

    def test_no_ambient_uses_fallback(self):
        fallback = self.runtime('hermetic', [3, 10])
        self.assertEqual(selector.select(str(fallback)), str(fallback))

    def test_wrong_fallback_version_is_rejected(self):
        fallback = self.runtime('wrong', [3, 13])
        with self.assertRaisesRegex(ValueError, 'requires Python 3.10'):
            selector.select(str(fallback))

    def test_missing_header_has_actionable_error(self):
        fallback = self.runtime('incomplete', [3, 10], header=False)
        with self.assertRaisesRegex(ValueError, 'development header missing'):
            selector.select(str(fallback))

    def test_missing_config_does_not_silently_change_runner(self):
        self.ambient(self.runtime('runner', [3, 10], config=False))
        with self.assertRaisesRegex(ValueError, 'development config missing'):
            selector.select('/not-used')

    def test_install_preserves_python_argument_with_spaces(self):
        node = __import__('shutil').which('node', path=self.old_path)
        if not node:
            self.skipTest('node unavailable')
        # Real install.cjs, fake node-gyp records its argv/environment.
        gyp = self.root / 'node-gyp'
        receipt = self.root / 'receipt.json'
        gyp.write_text('#!' + node + '\nrequire("fs").writeFileSync(' +
                       json.dumps(str(receipt)) + ', JSON.stringify({args:process.argv.slice(2), python:process.env.RBT_PYTHON3_USE}));\n')
        gyp.chmod(0o755)
        python = str(self.root / 'Python Framework/bin/python3.10')
        (self.root / '.reboot_python_env').write_text('/downloaded/python')
        subprocess.run([node, str(ROOT / 'reboot/nodejs/install.cjs')],
                       cwd=self.root, env={**os.environ, 'CC': 'cc', 'CXX': 'c++',
                                          'RBT_PYTHON3_USE': python}, check=True)
        self.assertEqual(json.loads(receipt.read_text()), {
            'args': ['rebuild', '--python=' + python], 'python': python})


if __name__ == '__main__':
    unittest.main()
