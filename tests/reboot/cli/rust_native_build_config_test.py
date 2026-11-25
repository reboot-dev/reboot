"""Source-contract checks; a real native build remains the acceptance gate."""
import ast
from pathlib import Path
import unittest


class RocksDbBuildConfigurationTest(unittest.TestCase):
    def setUp(self):
        root = Path(__file__).resolve().parents[3]
        source = (root / 'bazel/rocksdb/rocksdb.BUILD').read_text()
        tree = ast.parse(source)
        rule = next(node for node in ast.walk(tree)
                    if isinstance(node, ast.Call)
                    and isinstance(node.func, ast.Name) and node.func.id == 'cmake')
        self.options = {item.arg: item.value for item in rule.keywords}

    def test_nested_build_has_explicit_two_worker_bound(self):
        self.assertEqual(ast.literal_eval(self.options['build_args']), ['--', '-j 2'])

    def test_portability_is_the_upstream_cmake_boolean(self):
        entries = ast.literal_eval(self.options['cache_entries'])
        self.assertEqual(entries['PORTABLE'], 'ON')
        for name in ('FORCE_SSE42', 'FORCE_AVX', 'FORCE_AVX2'):
            self.assertNotIn(name, entries)


if __name__ == '__main__':
    unittest.main()
