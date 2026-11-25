import unittest

from reboot.cli.rust_generate import (
    missing_rust_plugin_message,
    rust_options_validation_error,
    rust_plugin_args,
)


class RustGenerateTestCase(unittest.TestCase):

    def test_rust_output_requires_module(self) -> None:
        self.assertEqual(
            rust_options_validation_error('generated', None),
            '`--rust-module` is required when `--rust` is specified.',
        )

    def test_module_requires_rust_output(self) -> None:
        self.assertEqual(
            rust_options_validation_error(None, 'reboot_rust_schema::proto'),
            '`--rust-module` requires `--rust`.',
        )

    def test_plugin_args(self) -> None:
        self.assertEqual(
            rust_plugin_args('generated', 'reboot_rust_schema::proto'),
            [
                '--reboot_rust_out=generated',
                '--reboot_rust_opt=module=reboot_rust_schema::proto',
            ],
        )

    def test_missing_plugin_message(self) -> None:
        self.assertEqual(
            missing_rust_plugin_message(),
            "Failed to find 'protoc-gen-reboot_rust'. It must be installed and on PATH.",
        )


if __name__ == '__main__':
    unittest.main(verbosity=2)
