import aiofiles.os
import asyncio
import os
import reboot.cli.cli as cli
import reboot.cli.generate as generate
import unittest
from reboot.cli.rc import ArgumentParser
from tests.reboot.cli.mock_exit import (
    MockExitException,
    mock_raise_instead_of_exit,
)
from typing import Optional
from unittest.mock import patch

DEFAULT_API_DIR = 'api'
TEST_PACKAGE = 'testpackage'


async def proto_file(
    directory: str,
    package: str,
    *,
    state_name: Optional[str] = "Greeter",
    service_name: Optional[str] = "GreeterMethods",
    has_method_annotations: bool = True,
    has_state_annotation: bool = True,
):
    # We create a proto file in a temporary directory, which is removed at
    # the end of the test, so no need to clean up the file explicitly.
    await aiofiles.os.makedirs(f'{directory}', exist_ok=True)
    proto = open(f'{directory}/test.proto', 'w')
    proto_content = (
        f"""
        syntax = "proto3";
        package {package};
        import "rbt/v1alpha1/options.proto";
        """
    )

    if service_name is not None:
        proto_content += (
            f"""
            service {service_name} {{
                rpc Greet(GreetRequest) returns (GreetResponse) {{
            """
        )

        if has_method_annotations:
            proto_content += (
                """
                    option (rbt.v1alpha1.method).reader = {
                    };
                """
            )

        proto_content += ("""
                }
            }
            """)

    proto_content += (
        """
        message GreetRequest {
            string name = 1;
        }
        message GreetResponse {
            string message = 1;
        }
        """
    )

    if state_name is not None:
        proto_content += (
            f"""
            message {state_name} {{
            """
        )

        if has_state_annotation:
            proto_content += (
                """
                    option (rbt.v1alpha1.state) = {
                    };
                """
            )

        proto_content += (
            """
                string greeting = 1;
            }"""
        )

    proto.write(proto_content)

    proto.close()
    return proto


async def proto_file_includes_another_proto_in_the_same_directory(
    directory: str, package: str
):
    await aiofiles.os.makedirs(f'{directory}', exist_ok=True)

    proto = open(f'{directory}/test.proto', 'w')
    proto.write(
        f"""
        syntax = "proto3";
        package {package};
        import "rbt/v1alpha1/options.proto";
        import "{package.replace('.', '/')}/another.proto";
        service GreeterMethods {{
            rpc Greet({package}.AnotherGreetRequest) returns ({package}.AnotherGreetResponse) {{
                option (rbt.v1alpha1.method).reader = {{
                }};
            }}
        }}
        message Greeter {{
            option (rbt.v1alpha1.state) = {{
            }};
            string greeting = 1;
        }}
        """
    )
    proto.close()

    another_proto = open(f'{directory}/another.proto', 'w')
    another_proto.write(
        f"""
        syntax = "proto3";
        package {package};
        message AnotherGreetRequest {{
            string name = 1;
        }}
        message AnotherGreetResponse {{
            string message = 1;
        }}
        """
    )
    another_proto.close()

    return proto, another_proto


class RbtGenerateBaseTestCase(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        # Add `reboot` directories to the path so that we can import the
        # `protoc-gen-reboot_react`, `protoc-gen-reboot_python`, `protoc-gen-mypy` and
        # `rbt` binaries. # Applicable only for bazel tests.
        os.environ['PATH'] = os.path.abspath(
            os.path.join(os.getcwd(), 'reboot')
        ) + os.pathsep + os.path.join(
            os.getcwd(),
            'reboot',
        ) + os.pathsep + os.path.join(
            os.getcwd(),
            'protoc_gen_mypy_plugin',
        ) + os.pathsep + os.path.abspath(
            os.path.join(os.getcwd(), 'reboot', 'cli')
        ) + os.pathsep + os.environ['PATH']

        patch_exit = patch(
            'argparse.ArgumentParser.exit',
            mock_raise_instead_of_exit,
        )
        patch_exit.start()
        self.addCleanup(patch_exit.stop)

    async def expect_files(
        self,
        *,
        directory: str,
        expected_files: list[str],
    ):
        """Compare the list of files in the directory with the expected list."""
        actual_files = [
            file for file in await aiofiles.os.listdir(directory)
            if await aiofiles.os.path.isfile(os.path.join(directory, file))
        ]

        missing_files = [
            file for file in expected_files if file not in actual_files
        ]

        self.assertEqual(missing_files, [])

    async def expect_no_files(
        self,
        *,
        directory: str,
        not_expected_files: list[str],
    ):
        """Check that 'not_expected_files' are not in the directory."""
        for file in await aiofiles.os.listdir(directory):
            self.assertNotIn(file, not_expected_files)

    async def run_generate(
        self,
        *args,
        working_directory: str,
        error_message: Optional[str] = None,
        error_exit_code: int = 1,
    ):
        process = await asyncio.create_subprocess_exec(
            'rbt',
            f'--state-directory={working_directory}/.rbt',
            'generate',
            '--verbose',
            f'--working-directory={working_directory}',
            *args,
            cwd=working_directory,
            stderr=asyncio.subprocess.PIPE,
        )

        _, error = await process.communicate()

        if error_message is None:
            self.assertEqual(
                process.returncode, 0, f"Output:\n{error.decode()}"
            )
        else:
            self.assertEqual(process.returncode, error_exit_code)
            # The error message that we receive from the protoc command
            # may contain some extra information, like which protoc generator
            # failed or the exit code, so we just check if the error message is
            # in the error.
            self.assertIn(error_message, error.decode())

    async def get_error_from(
        self,
        command: list[str],
    ):
        parser: ArgumentParser = cli.create_parser(argv=command)
        args, argv_after_dash_dash = parser.parse_args()

        # Mock fail, because the original fail will exit the program.
        def mock_raise_instead_fail(message):
            raise MockExitException(2, message)

        with patch(
            'reboot.cli.generate.fail',
            mock_raise_instead_fail,
        ), self.assertRaises(MockExitException) as e:
            await generate.generate(args, argv_after_dash_dash, parser=parser)

        self.assertEqual(e.exception.status, 2)
        print(e.exception.message)
        return e.exception.message
