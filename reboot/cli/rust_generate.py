from typing import Optional

RUST_PLUGIN_OUT_FLAG = '--reboot_rust_out'
RUST_PLUGIN_NAME = 'protoc-gen-reboot_rust'


def rust_options_validation_error(
    rust_output: Optional[str], rust_module: Optional[str]
) -> Optional[str]:
    if rust_output is None and rust_module is not None:
        return '`--rust-module` requires `--rust`.'
    if rust_output is not None and rust_module is None:
        return '`--rust-module` is required when `--rust` is specified.'
    return None


def rust_plugin_args(rust_output: str, rust_module: str) -> list[str]:
    return [
        f'{RUST_PLUGIN_OUT_FLAG}={rust_output}',
        f'--reboot_rust_opt=module={rust_module}',
    ]


def missing_rust_plugin_message() -> str:
    return (
        f"Failed to find '{RUST_PLUGIN_NAME}'. It must be installed and on PATH."
    )
