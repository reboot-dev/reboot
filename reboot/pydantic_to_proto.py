import argparse
import asyncio
import os
import shutil
import sys
from pathlib import Path
from reboot.pydantic_schema_to_proto import generate_proto_file_from_api

# Bazel runs actions with cwd set to the workspace root.
WORKSPACE_ROOT = os.getcwd()


async def create_proto_file(args):
    output_proto_path = Path(args.output_proto).absolute()
    relative_path = args.relative_path

    # Get the correct output folder in the `bazel-bin` directory,
    # respecting the structure of the input pydantic file to satisfy
    # Bazel's `declare_file` expectations.
    output_folder = Path(
        *output_proto_path.parts[:len(output_proto_path.parts) -
                                 len(Path(relative_path).parts)]
    )

    # Add workspace root to sys.path so we can import pydantic API files
    # from the current workspace.
    sys.path.insert(0, str(WORKSPACE_ROOT))

    # The generator always creates a proto file with the same name
    # as the pydantic file (e.g., `servicer_api.py` ->
    # `servicer_api.proto`).
    proto = await generate_proto_file_from_api(
        relative_path,
        str(output_folder),
    )

    assert proto is not None

    # Since the generator always writes the proto file to the same
    # directory as the pydantic file, we may need to move it to the
    # desired output location, where Bazel expects it.
    # We use it when generating protobuf files for `web`, to avoid
    # Bazel `declare_file` declares the same file twice (once for
    # the backend and once for the web).
    generated_proto_path = output_folder / relative_path.replace(
        '.py', '.proto'
    )
    if generated_proto_path != output_proto_path:
        shutil.move(str(generated_proto_path), str(output_proto_path))

    if args.zod:
        with open(output_proto_path, 'a') as f:
            f.write(f'option (rbt.v1alpha1.file).zod'
                    f' = "./{args.zod}";\n')


async def main():
    parser = argparse.ArgumentParser(
        description="Generate .proto file from Reboot Pydantic"
        " API definition."
    )
    parser.add_argument(
        "output_proto",
        type=str,
        help="Path where the output .proto file should be written."
        " Declared with Bazel `declare_file`",
    )
    parser.add_argument(
        "relative_path",
        type=str,
        help="Relative path of the pydantic file from the"
        " workspace root.",
    )
    parser.add_argument(
        "--zod",
        type=str,
        default=None,
        help="Zod types file basename (without .ts extension)"
        " to add as an option in the proto file for web code"
        " generation.",
    )
    args = parser.parse_args()

    await create_proto_file(args)


if __name__ == "__main__":
    asyncio.run(main())
