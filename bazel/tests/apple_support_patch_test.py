"""Validate the pinned Apple toolchain backport without requiring a Mac.

Run with an unmodified apple_support 1.17.1 release archive as the only argument.
This executes the Python-compatible helper body, not a native compiler or Bazel.
"""
import ast
import hashlib
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
from types import SimpleNamespace
from typing import Any
import unittest

ROOT = Path(__file__).resolve().parents[2]
ARCHIVE = None


class StarlarkEnv(dict):
    def get(self, key, default=None):
        return super().get(key, default)


def helper(source):
    tree = ast.parse(source)
    function = next(node for node in tree.body
                    if isinstance(node, ast.FunctionDef)
                    and node.name == '_compile_cc_file')
    namespace: dict[str, Any] = {
        'fail': lambda message: (_ for _ in ()).throw(RuntimeError(message)),
    }
    exec(compile(ast.Module(body=[function], type_ignores=[]), '<helper>', 'exec'), namespace)
    return namespace['_compile_cc_file']


class AppleSupportPatchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        tree = ast.parse((ROOT / 'WORKSPACE.bazel').read_text())
        declarations = [node.value for node in tree.body
                        if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call)]
        cls.declaration = next(call for call in declarations
                               if isinstance(call.func, ast.Name)
                               and call.func.id == 'http_archive'
                               and any(kw.arg == 'name' and ast.literal_eval(kw.value)
                                       == 'build_bazel_apple_support' for kw in call.keywords))
        cls.attributes = {kw.arg: ast.literal_eval(kw.value)
                          for kw in cls.declaration.keywords}
        cls.declarations = declarations
        assert ARCHIVE is not None
        data = ARCHIVE.read_bytes()
        if hashlib.sha256(data).hexdigest() != cls.attributes['sha256']:
            raise AssertionError('Archive does not match WORKSPACE SHA256')
        cls.directory = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls.directory.cleanup)
        directory = Path(cls.directory.name)
        with tarfile.open(ARCHIVE) as archive:
            # Extract only the source file this patch is allowed to modify.
            member = archive.extractfile('./crosstool/osx_cc_configure.bzl')
            assert member is not None
            cls.original = member.read().decode()
        source = directory / 'crosstool/osx_cc_configure.bzl'
        source.parent.mkdir()
        source.write_text(cls.original)
        for label in cls.attributes['patches']:
            patch = ROOT / label.removeprefix('//').replace(':', '/')
            result = subprocess.run(['patch', '--batch', '--fuzz=0',
                                     *cls.attributes['patch_args'], '-i', str(patch)],
                                    cwd=directory, capture_output=True, text=True, check=True)
            if 'offset' in result.stdout or 'fuzz' in result.stdout:
                raise AssertionError(result.stdout)
        cls.patched = source.read_text()

    def test_declaration_precedes_transitive_dependencies(self):
        self.assertEqual(self.attributes['sha256'],
                         'b53f6491e742549f13866628ddffcc75d1f3b2d6987dc4f14a16b242113c890b')
        self.assertTrue(all('/1.17.1/apple_support.1.17.1.tar.gz' in url
                            for url in self.attributes['urls']))
        for call in self.declarations:
            if isinstance(call.func, ast.Name) and call.func.id in ('repos', 'deps', 'extra_deps'):
                self.assertLess(self.declaration.lineno, call.lineno)

    def test_only_bootstrap_helper_changes(self):
        def without_helper(source):
            tree = ast.parse(source)
            tree.body = [node for node in tree.body
                         if not (isinstance(node, ast.FunctionDef)
                                 and node.name == '_compile_cc_file')]
            return ast.dump(tree)
        self.assertEqual(without_helper(self.original), without_helper(self.patched))
        self.assertNotIn('-no_uuid', self.patched)
        self.assertNotIn('-no_adhoc_codesign', self.patched)

    def test_linker_defaults_and_universal_architectures(self):
        for environment in ({}, {'DEVELOPER_DIR': '/Applications/Xcode.app/Contents/Developer'}):
            with self.subTest(environment=environment):
                commands = []
                context = SimpleNamespace(
                    os=SimpleNamespace(environ=StarlarkEnv(environment)),
                    execute=lambda argv: (commands.append(argv)
                                          or SimpleNamespace(return_code=0, stdout='', stderr='')))
                helper(self.patched)(context, 'wrapped_clang.cc', 'wrapped_clang')
                self.assertEqual(commands, [[
                    'env', '-i', 'DEVELOPER_DIR=' + environment.get('DEVELOPER_DIR', ''),
                    'xcrun', '--sdk', 'macosx', 'clang', '-mmacosx-version-min=10.15',
                    '-std=c++17', '-lc++', '-arch', 'arm64', '-arch', 'x86_64',
                    '-O3', '-o', 'wrapped_clang', 'wrapped_clang.cc',
                ]])

    def test_compiler_failure_still_reported(self):
        commands = []
        context = SimpleNamespace(
            os=SimpleNamespace(environ=StarlarkEnv()),
            execute=lambda argv: (commands.append(argv)
                                  or SimpleNamespace(return_code=42, stdout='', stderr='compiler failed')))
        with self.assertRaisesRegex(RuntimeError, 'return code 42.*compiler failed'):
            helper(self.patched)(context, 'wrapped_clang.cc', 'wrapped_clang')
        self.assertEqual(len(commands), 1)


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Usage: python bazel/tests/apple_support_patch_test.py ARCHIVE.tar.gz')
    ARCHIVE = Path(sys.argv.pop())
    unittest.main(verbosity=2)
