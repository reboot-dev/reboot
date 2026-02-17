import argparse
import asyncio
import os
import sys
from pathlib import Path
from reboot.pydantic_schema_to_zod import (
    collect_all_error_models,
    generate_zod_file_from_api,
)

# Bazel runs actions with cwd set to the workspace root.
WORKSPACE_ROOT = os.getcwd()


async def create_zod_file(args):
    output_zod_path = Path(args.output_zod).absolute()
    relative_path = args.relative_path

    # Get the correct output folder in the `bazel-bin` directory,
    # respecting the structure of the input pydantic file to satisfy
    # Bazel's `declare_file` expectations.
    output_folder = Path(
        *output_zod_path.parts[:len(output_zod_path.parts) -
                               len(Path(relative_path).parts)]
    )

    # Add workspace root to sys.path so we can import pydantic API files
    # from the current workspace.
    sys.path.insert(0, str(WORKSPACE_ROOT))

    # Collect error models from all specified pydantic files.
    all_pydantic_files = [relative_path]
    if args.scan_files:
        all_pydantic_files.extend(args.scan_files)
    global_error_models = collect_all_error_models(all_pydantic_files)

    await generate_zod_file_from_api(
        relative_path,
        str(output_folder),
        # We don't use extensions in tests.
        js_extension=False,
        global_error_models=global_error_models,
    )


async def main():
    parser = argparse.ArgumentParser(
        description="Generate Zod types from Reboot Pydantic"
        " API definition."
    )
    parser.add_argument(
        "output_zod",
        type=str,
        help="Path where the output Zod file should be written."
        " Declared with Bazel `declare_file`",
    )
    parser.add_argument(
        "relative_path",
        type=str,
        help="Relative path of the pydantic file from the"
        " workspace root.",
    )
    parser.add_argument(
        "--scan",
        dest="scan_files",
        action="append",
        help="Additional pydantic files to scan for error"
        " models. Can be specified multiple times.",
    )
    args = parser.parse_args()

    await create_zod_file(args)


if __name__ == "__main__":
    asyncio.run(main())
