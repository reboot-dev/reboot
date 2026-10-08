"""Cargo-native scaffold for the experimental local Rust app runtime."""
import json
from pathlib import Path
import sys
if sys.version_info >= (3, 11):
    import tomllib
else:  # Python 3.10 remains supported, including type checking.
    import tomli as tomllib
from jinja2 import Environment, FileSystemLoader


RUST_KEYWORDS = set('as break const continue crate else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while async await dyn abstract become box do final macro override priv typeof unsized virtual yield try gen'.split())


RUST_DEPENDENCY_NAMES = {'reboot', 'prost', 'prost_types', 'tonic', 'tonic_health', 'uuid', 'tokio', 'std', 'core', 'alloc'}


def initialize_rust(directory: Path, name: str, sdk: str | None, frontend: str) -> None:
    # Validate every prerequisite/collision before publishing any scaffold file.
    if frontend != 'none':
        raise ValueError("Rust apps currently require '--frontend=none' (direct gRPC only)")
    if name in RUST_KEYWORDS:
        raise ValueError(f"Rust application name '{name}' is a reserved Rust keyword")
    if name in RUST_DEPENDENCY_NAMES:
        raise ValueError(f"Rust application name '{name}' conflicts with a scaffold dependency crate")
    if not sdk:
        raise ValueError("Rust apps require '--rust-sdk=/path/to/reboot/rust' (the SDK is not published)")
    sdk_path = Path(sdk).expanduser().resolve()
    try:
        manifest = tomllib.loads((sdk_path / 'Cargo.toml').read_text())
    except (OSError, tomllib.TOMLDecodeError) as error:
        raise ValueError(f"Invalid Rust SDK directory '{sdk_path}': {error}") from error
    if manifest.get('package', {}).get('name') != 'reboot-rust-schema' or 'build' not in manifest.get('features', {}):
        raise ValueError('Rust SDK must be the reboot-rust-schema crate with its build feature')
    if not (sdk_path / 'src/build.rs').is_file() or not (sdk_path.parent.parent / 'rbt/v1alpha1/options.proto').is_file():
        raise ValueError('Rust SDK requires build helper sources and repository protobuf annotations')
    outputs = {
        'rust_Cargo.toml.j2': 'backend/Cargo.toml',
        'rust_build.rs.j2': 'backend/build.rs',
        'rust_lib.rs.j2': 'backend/src/lib.rs',
        'rust_main.rs.j2': 'backend/src/main.rs',
        'rust_client.rs.j2': 'backend/src/bin/client.rs',
        'rust_hello_world.proto.j2': f'api/{name}/v1/hello_world.proto',
        'rust_rbtrc.j2': '.rbtrc',
        'rust_README.md.j2': 'README.md',
    }
    for relative in outputs.values():
        path = directory / relative
        if path.exists() or path.is_symlink():
            raise ValueError(f"Refusing to overwrite existing project file '{path}'")
        for parent in path.parents:
            if parent == directory:
                break
            if parent.is_symlink() or (parent.exists() and not parent.is_dir()):
                raise ValueError(f"Invalid scaffold parent '{parent}'")
    env = Environment(loader=FileSystemLoader(Path(__file__).parent / 'templates'), autoescape=False, keep_trailing_newline=True)
    rendered = {relative: env.get_template(template).render(name=name, sdk_path=json.dumps(str(sdk_path)))
                for template, relative in outputs.items()}
    # Publish rc last: rendering failures never leave an initialized project.
    for relative, content in sorted(rendered.items(), key=lambda item: item[0] == '.rbtrc'):
        path = directory / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open('x') as output:
            output.write(content)
