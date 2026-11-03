import asyncio
import os
from pathlib import Path
import tempfile
import unittest
from reboot.aio.tests import temporary_environ
from tests.reboot.cli.generate.tests_helper import (
    DEFAULT_API_DIR,
    TEST_PACKAGE,
    RbtGenerateBaseTestCase,
    proto_file,
)


class RbtGenerateRustTestCase(RbtGenerateBaseTestCase):

    async def test_generate_rust_invokes_prebuilt_plugin_with_module(self):
        with tempfile.TemporaryDirectory() as root, tempfile.TemporaryDirectory(
        ) as plugin_directory:
            await proto_file(
                f'{root}/{DEFAULT_API_DIR}/{TEST_PACKAGE}', TEST_PACKAGE
            )
            request_log = f'{root}/rust-plugin-request.txt'
            plugin = Path(plugin_directory) / 'protoc-gen-reboot_rust'
            plugin.write_text(
                "#!/usr/bin/env python3\n"
                "import os\n"
                "import sys\n"
                "from google.protobuf.compiler import plugin_pb2\n"
                "request = plugin_pb2.CodeGeneratorRequest()\n"
                "request.ParseFromString(sys.stdin.buffer.read())\n"
                "with open(os.environ['RUST_PLUGIN_REQUEST'], 'w') as log:\n"
                "    log.write(request.parameter)\n"
                "sys.stdout.buffer.write(plugin_pb2.CodeGeneratorResponse().SerializeToString())\n"
            )
            plugin.chmod(0o755)
            temporary_environ(
                self,
                {
                    'PATH': plugin_directory + os.pathsep + os.environ['PATH'],
                    'RUST_PLUGIN_REQUEST': request_log,
                },
            )

            process = await asyncio.create_subprocess_exec(
                'rbt',
                f'--state-directory={root}/.rbt',
                'generate',
                '--verbose',
                f'--working-directory={root}',
                '--rust=generated',
                '--rust-module=reboot_rust_schema::proto',
                DEFAULT_API_DIR,
                cwd=root,
                stderr=asyncio.subprocess.PIPE,
            )
            _, stderr = await process.communicate()

            self.assertEqual(process.returncode, 0, stderr.decode())
            self.assertIn('--reboot_rust_out=generated', stderr.decode())
            self.assertIn(
                '--reboot_rust_opt=module=reboot_rust_schema::proto',
                stderr.decode(),
            )
            self.assertEqual(
                Path(request_log).read_text(), 'module=reboot_rust_schema::proto'
            )

    async def test_generate_rust_missing_plugin_explains_installation(self):
        with tempfile.TemporaryDirectory() as root, tempfile.TemporaryDirectory(
        ) as plugin_directory:
            await proto_file(
                f'{root}/{DEFAULT_API_DIR}/{TEST_PACKAGE}', TEST_PACKAGE
            )
            temporary_environ(
                self,
                {'PATH': plugin_directory + os.pathsep + os.environ['PATH']},
            )
            await self.run_generate(
                '--rust=generated',
                '--rust-module=reboot_rust_schema::proto',
                DEFAULT_API_DIR,
                working_directory=root,
                error_message=(
                    "Failed to find 'protoc-gen-reboot_rust'. It must be "
                    'installed and on PATH.\n'
                ),
            )

    async def test_generate_rust_requires_module(self):
        with tempfile.TemporaryDirectory() as root:
            await self.run_generate(
                '--rust=generated',
                DEFAULT_API_DIR,
                working_directory=root,
                error_message='`--rust-module` is required when `--rust` is specified.\n',
            )

    async def test_rust_module_requires_rust(self):
        with tempfile.TemporaryDirectory() as root:
            await self.run_generate(
                '--rust-module=reboot_rust_schema::proto',
                DEFAULT_API_DIR,
                working_directory=root,
                error_message='`--rust-module` requires `--rust`.\n',
            )


if __name__ == '__main__':
    unittest.main(verbosity=2)
