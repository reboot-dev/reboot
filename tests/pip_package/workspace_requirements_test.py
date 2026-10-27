import os
import sys
import unittest
import zipfile


class WorkspaceRequirementsTest(unittest.TestCase):
    """Inspects the wheel that `:app-with-workspace-requirement.dev` builds
    with the `pyprotoc_plugin` workspace mapped to a requirement."""

    def setUp(self) -> None:
        self.wheel_path = sys.argv[1]
        with zipfile.ZipFile(self.wheel_path) as wheel:
            self.names = wheel.namelist()
            metadata_names = [
                name for name in self.names if name.endswith('/METADATA')
            ]
            self.assertEqual(len(metadata_names), 1, metadata_names)
            self.metadata = wheel.read(metadata_names[0]).decode()

    def test_bundles_the_application(self) -> None:
        self.assertIn('tests/pip_package/app.py', self.names)

    def test_leaves_out_the_workspace(self) -> None:
        self.assertEqual(
            [name for name in self.names if 'pyprotoc_plugin' in name],
            [],
        )

    def test_requires_the_workspace_distribution(self) -> None:
        self.assertIn('Requires-Dist: pyprotoc-plugin==1.2.3', self.metadata)

    def test_does_not_require_the_workspace_dependencies(self) -> None:
        # `pyprotoc_plugin` depends on Jinja2; that is its distribution's
        # business, not this package's.
        self.assertNotIn('Jinja2', self.metadata)
        self.assertNotIn('jinja2', self.metadata)

    def test_is_pure_python(self) -> None:
        self.assertTrue(
            os.path.basename(self.wheel_path).endswith('-py3-none-any.whl'),
            self.wheel_path,
        )


if __name__ == '__main__':
    unittest.main(argv=sys.argv[:1])
