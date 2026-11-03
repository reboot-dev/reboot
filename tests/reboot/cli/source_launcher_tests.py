"""Source launcher regression: Bazel cwd differs from the application cwd."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


class SourceLauncherTests(unittest.TestCase):
    def test_external_application_and_build_fallback(self):
        source = Path(__file__).resolve().parents[3] / 'rbt.sh'
        for fallback in (False, True):
            with self.subTest(fallback=fallback), tempfile.TemporaryDirectory() as root:
                root = Path(root)
                workspace = root / 'reboot source'
                app = root / 'user application'
                tools = root / 'tools'
                for path in (workspace, app, tools):
                    path.mkdir()
                shutil.copy2(source, workspace / 'rbt.sh')
                (workspace / 'MODULE.bazel').touch()
                bazel = tools / 'bazel'
                bazel.write_text('''#!/usr/bin/env python3
import json, os, pathlib, sys
assert pathlib.Path('MODULE.bazel').exists(), 'Bazel outside workspace'
with open(os.environ['BUILD_LOG'], 'a') as f:
    f.write(json.dumps({'cwd': os.getcwd(), 'args': sys.argv[1:]}) + '\\n')
if '--check_up_to_date' in sys.argv and os.environ['FALLBACK'] == '1':
    sys.exit(1)
''')
                bazel.chmod(0o755)
                cli = workspace / 'bazel-bin/reboot/cli/rbt'
                cli.parent.mkdir(parents=True)
                cli.write_text('''#!/usr/bin/env python3
import json, os, sys
print(json.dumps({'cwd': os.getcwd(), 'args': sys.argv[1:]}))
''')
                cli.chmod(0o755)
                env = dict(os.environ, PATH=str(tools) + os.pathsep + os.environ['PATH'],
                           BUILD_LOG=str(root / 'build.jsonl'), FALLBACK=str(int(fallback)))
                args = ['dashboard', '--agent-config=/config with spaces/agents.json', '--port=9871']
                run = subprocess.run(['bash', str(workspace / 'rbt.sh'), *args], cwd=app,
                                     env=env, capture_output=True, text=True, check=True)
                receipt = json.loads(run.stdout.strip())
                self.assertEqual(receipt, {'cwd': str(app), 'args': args})
                builds = [json.loads(line) for line in (root / 'build.jsonl').read_text().splitlines()]
                self.assertEqual(len(builds), 2 if fallback else 1)
                self.assertTrue(all(item['cwd'] == str(workspace) for item in builds))


if __name__ == '__main__':
    unittest.main()
