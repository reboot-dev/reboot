import aiofiles.os
import asyncio
import glob
import os
import reboot.aio.tracing
import shutil
import sys
import tempfile
from collections import defaultdict
from importlib import resources
from pathlib import Path
from reboot.cli import terminal
from reboot.cli.directories import (
    add_working_directory_options,
    chdir,
    compute_working_directory,
    dot_rbt_directory,
    get_absolute_path_from_path,
    is_on_path,
    use_working_directory,
)
from reboot.cli.rc import ArgumentParser
from reboot.cli.subprocesses import Subprocesses
from reboot.pydantic_schema_to_proto import generate_proto_file_from_api
from reboot.pydantic_schema_to_zod import (
    collect_all_error_models,
    generate_zod_file_from_api,
)
from reboot.settings import (
    DOCS_BASE_URL,
    ENVVAR_RBT_FROM_NODEJS,
    ENVVAR_REBOOT_NODEJS_EXTENSIONS,
    ENVVAR_REBOOT_REACT_EXTENSIONS,
    ENVVAR_REBOOT_WEB_EXTENSIONS,
)
from typing import Optional, Tuple

REBOOT_SPECIFIC_PLUGINS = ['python', 'react', 'nodejs', 'web']
REBOOT_EXPERIMENTAL_PLUGINS: list[str] = []

# Dictionary from out path to list of sufficient plugins (it's a list
# since in some cases more than one plugin may be sufficient).
PLUGINS_SUFFICIENT_FOR_EXPLICIT_OUT_FLAGS = {
    '--python_out': ['python'],
    '--grpc_python_out': ['python'],
    '--reboot_python_out': ['python'],
    '--mypy_out': ['python'],
    '--es_out': ['react', 'nodejs', 'web'],
    '--reboot_react_out': ['react'],
    '--reboot_nodejs_out': ['nodejs'],
    '--reboot_web_out': ['web'],
}

# Specify all possible flags for supported languages, in a priority order.
OUTPUT_FLAGS_BY_LANGUAGE = {
    "python":
        [
            "--reboot_python_out",
            "--python_out",
            "--grpc_python_out",
            "--mypy_out",
        ],
    "react": [
        "--reboot_react_out",
        "--es_out",
    ],
    "nodejs": [
        "--reboot_nodejs_out",
        "--es_out",
    ],
    "web": [
        "--reboot_web_out",
        "--es_out",
    ],
}

PROTOC_PLUGIN_BY_LANGUAGE = {
    "python": "protoc-gen-reboot_python",
    "react": "protoc-gen-reboot_react",
    "nodejs": "protoc-gen-reboot_nodejs",
    "web": "protoc-gen-reboot_web",
}

BOILERPLATE_SUPPORTED_LANGUAGES = ['python', 'nodejs']

BOILERPLATE_PLUGIN_BY_LANGUAGE = {
    "python": "protoc-gen-reboot_python_boilerplate",
    "nodejs": "protoc-gen-reboot_nodejs_boilerplate"
}

OUTPUT_BOILERPLATE_FLAG_BY_LANGUAGE = {
    "python": "--reboot_python_boilerplate_out",
    "nodejs": "--reboot_nodejs_boilerplate_out"
}

rbt_from_nodejs = os.environ.get(
    ENVVAR_RBT_FROM_NODEJS,
    "false",
).lower() == "true"


def register_generate(parser: ArgumentParser):
    add_working_directory_options(parser.subcommand('generate'))

    parser.subcommand('generate').add_argument(
        '--python',
        type=str,
        default=None,
        help="output directory in which Python files will be generated",
    )

    parser.subcommand('generate').add_argument(
        '--react',
        type=str,
        default=None,
        help="output directory in which React files will be generated",
    )

    parser.subcommand('generate').add_argument(
        '--react-extensions',
        type=bool,
        default=False,
        help="generate .js extensions for imports in React files",
    )

    parser.subcommand('generate').add_argument(
        '--web',
        type=str,
        default=None,
        help="output directory in which web files will be generated",
    )

    parser.subcommand('generate').add_argument(
        '--web-extensions',
        type=bool,
        default=False,
        help="generate .js extensions for imports in web files",
    )

    parser.subcommand('generate').add_argument(
        '--nodejs',
        type=str,
        default=None,
        help="output directory in which Node.js files will be generated",
    )

    parser.subcommand('generate').add_argument(
        '--nodejs-extensions',
        type=bool,
        default=False,
        help="generate .js extensions for imports in Node.js files",
    )

    parser.subcommand('generate').add_argument(
        '--boilerplate',
        type=str,
        help="generate a fill-in-the-blanks boilerplate at the specified path.",
    )

    parser.subcommand('generate').add_argument(
        'proto_directories',
        type=str,
        help="proto directory(s) which will (1) be included as import paths "
        "and (2) be recursively searched for '.proto' files to compile",
        repeatable=True,
        required=True,
    )


IsFile = bool


async def _check_or_install_npm_packages(
    subprocesses: Subprocesses,
    package_names: list[Tuple[str, IsFile]],
):
    # Check and see if we've already installed a package and if not install it,
    # unless we are not installing the package from a file, in that case we
    # assume that we are installing a 'dev' version and we install it.
    #
    # We redirect stdout/stderr to a pipe and only print it out if any of our
    # commands fail.

    # With Node.js 20 the return code of 'npm list' is 0 even if the package is
    # not found, so we have to check the output for '(empty)'.
    def package_found(stdout: bytes) -> bool:
        return b'(empty)' not in stdout

    for package_name, is_file in package_names:
        async with subprocesses.shell(
            f'npm list {package_name}',
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        ) as process:
            stdout, _ = await process.communicate()

            if not package_found(stdout) or is_file:
                async with subprocesses.shell(
                    f'npm install {package_name}',
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.STDOUT,
                ) as process:
                    stdout, _ = await process.communicate()

                    if process.returncode != 0:
                        terminal.fail(
                            "\n"
                            f"Failed to install '{package_name}':\n"
                            f"{stdout.decode() if stdout is not None else '<no output>'}"
                            "\n"
                            "Please report this bug to the maintainers."
                        )


def _dot_rbt_node_modules_bin_directory(args, parser: ArgumentParser) -> str:
    return os.path.join(
        dot_rbt_directory(args, parser),
        'node_modules',
        '.bin',
    )


def add_protoc_gen_es_to_path(
    args,
    parser: ArgumentParser,
):
    env_path = os.environ.get("PATH", "")

    if env_path != "":
        env_path += os.pathsep

    env_path += _dot_rbt_node_modules_bin_directory(args, parser)

    os.environ["PATH"] = env_path

    env_node_path = os.environ.get("NODE_PATH", "")

    if env_node_path != "":
        env_node_path += os.pathsep

    env_node_path += os.path.join(
        dot_rbt_directory(args, parser),
        'node_modules',
    )

    os.environ["NODE_PATH"] = env_node_path


@reboot.aio.tracing.function_span()
async def ensure_protoc_gen_es(
    args,
    parser: ArgumentParser,
    subprocesses: Subprocesses,
):
    """Helper to ensure we have 'protoc-gen-es' and its dependencies
    installed.

    We install these in the '.rbt' directory, by placing an empty
    'package.json' file and then running 'npm install' as
    necessary. This approach makes it so that we don't have to bundle
    'protoc-gen-es' as part of our pip package.
    """
    if not is_on_path('npm'):
        terminal.fail(
            "We require 'npm' and couldn't find it on your PATH. "
            "Is it installed?"
        )

    if not is_on_path('node'):
        terminal.fail(
            "We require 'node' and couldn't find it on your PATH. "
            "Is it installed?"
        )

    dot_rbt = dot_rbt_directory(args, parser)
    await aiofiles.os.makedirs(dot_rbt, exist_ok=True)
    # Add 'protoc-gen-es' expected folder to the PATH before installing and
    # check if it's actually there, if not we'll install it. That will speed up
    # the individual calls of 'rbt generate' as well as 'rbt dev run' dev loop.
    add_protoc_gen_es_to_path(args, parser)

    async def is_on_dot_rbt_path(file):
        return await aiofiles.os.path.isfile(
            os.path.join(
                _dot_rbt_node_modules_bin_directory(args, parser), file
            )
        )

    # Check if 'protoc-gen-es' exists specifically in the '.rbt' directory,
    # rather than relying on its presence in the PATH. This ensures that
    # we avoid using a globally installed version.
    # In the unlikely event a user manually deletes a folder from
    # '.rbt/node_modules', they may encounter a stack trace with the error:
    # "Error: Cannot find module '@bufbuild/protobuf'".
    # To resolve this issue, the user should delete the entire '.rbt' directory
    # and rerun 'rbt generate'.
    if await is_on_dot_rbt_path('protoc-gen-es'):
        return

    # On a fresh environment the installation may take a while, so we'll
    # print a message to the user to avoid a 'hang' feeling.
    terminal.info("Setting up environment...")

    dot_rbt = dot_rbt_directory(args, parser)

    # TODO: Changing directory like this is not concurrency safe.
    with chdir(dot_rbt):
        if (
            not await aiofiles.os.path.isfile('package.json') or
            await aiofiles.os.path.getsize('package.json') == 0
        ):
            with open('package.json', 'w') as file:
                file.write('{ "type": "module" }')

        await _check_or_install_npm_packages(
            subprocesses,
            [
                # NOTE: these versions should match with what we're
                # using in all of our 'package.json' files!
                ('@bufbuild/protoplugin@1.10.1', False),
                ('@bufbuild/protoc-gen-es@1.10.1', False),
                ('@bufbuild/protobuf@1.10.1', False),
            ]
        )


LanguageName = str
OutputPath = str
FlagName = str


async def get_output_paths_and_languages(
    args,
) -> dict[LanguageName, OutputPath]:
    """Get the output paths for each language that we are generating code for.
    We'll return a dictionary where the key is the language and the value is
    an output path.
    """

    output_by_language: dict[LanguageName, OutputPath] = {}

    if args.python is not None:
        output_by_language['python'] = args.python
    if args.react is not None:
        output_by_language['react'] = args.react
    if args.nodejs is not None:
        output_by_language['nodejs'] = args.nodejs
    if args.web is not None:
        output_by_language['web'] = args.web

    return output_by_language


async def generate(
    args,
    argv_after_dash_dash: list[str],
    parser: ArgumentParser,
) -> int:
    """Invokes `protoc` with the arguments passed to 'rbt generate'."""
    # Determine the working directory and move into it.
    with use_working_directory(args, parser):
        # Use `Subprocesses` to manage all of our subprocesses for us.
        subprocesses = Subprocesses()

        return await generate_direct(
            args, argv_after_dash_dash, parser, subprocesses
        )


@reboot.aio.tracing.function_span()
async def generate_direct(
    args,
    argv_after_dash_dash: list[str],
    parser: ArgumentParser,
    subprocesses: Subprocesses,
) -> int:
    """Invokes `protoc` with the arguments passed to 'rbt generate', while asserting that
    the working directory is already correct."""

    if Path(os.getcwd()).resolve() != compute_working_directory(args, parser):
        # TODO: Move to a global flag using #3845.
        terminal.fail(
            "The `--working-directory` for `rbt generate` must match the "
            "`--working-directory` for the current command."
        )

    # As part of `rbt generate` we invoke `protoc` a number of times with
    # different plugins, some of them may have specific arguments, but at the
    # same time they all share some common arguments. We'll build up the
    # arguments for each plugin separately and then combine them all together at
    # the end to invoke `protoc`.
    common_args: list[str] = ["grpc_tools.protoc"]

    # This list contains a list of specific arguments for each plugin, for
    # example:
    #
    # [
    #   ['--python_out=python_out'],
    #   ['--es_out=es_out', '--es_opt=target=ts]',
    #   ...
    # ]
    all_plugins_args: list[list[str]] = []

    def add_args_to_plugin(plugin_out_flag: str, args: list[str]):
        # Find the list which contains the 'plugin_out_flag' flag, and add
        # 'args' to it.
        for i, plugin_args in enumerate(all_plugins_args):
            if any(arg.startswith(plugin_out_flag) for arg in plugin_args):
                all_plugins_args[i] += args
                return

    # We want to find all Python `site-packages`/`dist-packages` directories
    # that (may) contain a 'rbt/v1alpha1' directory, which is where we'll find
    # our protos.
    #
    # We can look for Python packages like a 'rbt' folder via the `resources`
    # module; the resulting path is a `MultiplexedPath`, since there may be
    # multiple.
    #
    # HOWEVER, the `resources` module does NOT work well when all subpaths of
    # one `rbt/` folder are ALSO present in another `rbt/` folder - e.g. if we
    # have two `rbt/v1alpha1` folders in two separate locations (in two Bazel
    # repos, say), we will get just one of those `rbt/v1alpha1` folders, and
    # thereby maybe only ever see one of the `rbt/` folders too (if there's
    # nothing unique inside it). So instead of looking for `rbt/` (which only
    # contains `v1alpha1/`, which is not unique) we look for its sibling paths
    # `reboot/` and `reboot/`, which contains a lot of unique names in every
    # place it is present.
    #
    # The paths we get don't contain a `parent` attribute, since there isn't one
    # answer. Instead we use `iterdir()` to get all of the children of all
    # 'reboot' folders, and then dedupe parents-of-the-parents-of-those-children
    # (via the `set`), which gives us the 'rbt' folders' parents' paths.
    reboot_parent_paths: set[str] = set()
    for resource in resources.files('reboot').iterdir():
        with resources.as_file(resource) as path:
            reboot_parent_paths.add(str(path.parent.parent))
    for resource in resources.files('reboot').iterdir():
        with resources.as_file(resource) as path:
            reboot_parent_paths.add(str(path.parent.parent))

    if len(reboot_parent_paths) == 0:
        raise FileNotFoundError(
            "Failed to find 'rbt' resource path. "
            "Please report this bug to the maintainers."
        )

    # Now add these to '--proto_path', so that users don't need to provide
    # their own Reboot protos.
    for reboot_parent_path in reboot_parent_paths:
        common_args.append(f"--proto_path={reboot_parent_path}")

    # User protos may rely on `google.protobuf.*` protos. We
    # conveniently have those files packaged in our Python
    # package; make them available to users, so that users don't
    # need to provide them.
    common_args.append(
        f"--proto_path={resources.files('grpc_tools').joinpath('_proto')}"
    )

    for flag, languages in PLUGINS_SUFFICIENT_FOR_EXPLICIT_OUT_FLAGS.items():
        if any(arg.startswith(flag) for arg in argv_after_dash_dash):
            suggestions = ' or '.join(
                [
                    f"'--{language}'" for language in languages
                    if language not in REBOOT_EXPERIMENTAL_PLUGINS
                ]
            )
            terminal.fail(
                f"{flag} was specified after '--'. Instead, use {suggestions} "
                "to specify the output directory."
            )

    ts_targets = {
        "react": (args.react, args.react_extensions),
        "nodejs": (args.nodejs, args.nodejs_extensions),
        "web": (args.web, args.web_extensions),
    }

    directory_to_ts_targets: defaultdict[str, list[Tuple[
        str, bool]]] = defaultdict(list)

    for target, (directory, extensions_flag) in ts_targets.items():
        if directory is not None:
            # The dictionary contains the directory as a key and a list of
            # tuples of (target, extensions_flag) as values. Example:
            #
            # {
            #     'output': [('react', True), ('web', True)],
            #     'output2': [('nodejs', False)],
            # }
            #
            # If the config is broken, the list will contain multiple
            # targets with different `--*-extensions` flags.
            #
            # {
            #     'output': [('react', False), ('web', True)],
            #     'output2': [('nodejs', True)],
            # }
            directory_to_ts_targets[directory].append(
                (target, extensions_flag)
            )

    for directory, ts_target_config in directory_to_ts_targets.items():
        extensions = {flag for _, flag in ts_target_config}

        if len(extensions) > 1:
            # Fail if there are different `--*-extensions` flags
            # for the same directory.
            targets_str = ', '.join(
                [f'`--{name}`' for name, _ in ts_target_config]
            )
            terminal.fail(
                "You are generating code for multiple targets "
                f"({targets_str}) in the same directory (`{directory}`), "
                "but with different values for their `--*-extensions` "
                "flags. Either use the same extensions setting or "
                "separate output directories."
            )

    output_path_by_language = await get_output_paths_and_languages(args)

    if len(output_path_by_language) == 0:
        official_supported_plugins = [
            plugin for plugin in REBOOT_SPECIFIC_PLUGINS
            if plugin not in REBOOT_EXPERIMENTAL_PLUGINS
        ]

        terminal.fail(
            f"At least one of '{', '.join(official_supported_plugins)}' must be specified."
        )

    languages_to_generate = list(output_path_by_language.keys())

    protoc_plugin_out_flags: dict[FlagName, OutputPath] = {}

    skip_next: bool = False
    for i, arg in enumerate(argv_after_dash_dash):
        if skip_next is True:
            skip_next = False
            continue
        if '=' in arg:
            arg_name, arg_value = arg.split('=')

            if arg_name.endswith('_out'):
                # This means that a user has specified an output path for a
                # some arbitrary plugin and we will invoke it only once and in
                # parallel with the other plugins.

                protoc_plugin_out_flags[arg_name] = arg_value
            else:
                common_args.append(f'{arg_name}={arg_value}')
        else:
            if len(argv_after_dash_dash) - 1 == i:
                terminal.fail(f'Missing value for {arg}, try {arg}=VALUE')

            if arg.endswith('_out'):
                # This means that a user has specified an output path for a
                # some arbitrary plugin and we will invoke it only once and in
                # parallel with the other plugins.

                protoc_plugin_out_flags[arg] = argv_after_dash_dash[i + 1]
            else:
                common_args.append(f'{arg}={argv_after_dash_dash[i + 1]}')

            skip_next = True

    # If `args.react` and `args.nodejs` point to different directories
    # then we have to call `protoc` twice, each with different
    # `--es_out=` arguments (one for the `args.react` directory and
    # one for the `args.nodejs` directory.
    es_out_language: Optional[str] = None

    for language in languages_to_generate:
        if language in BOILERPLATE_SUPPORTED_LANGUAGES and args.boilerplate is not None:
            if await aiofiles.os.path.isfile(args.boilerplate):
                terminal.fail(
                    f"Expecting a directory for '--boilerplate={args.boilerplate}'"
                )
            if not await aiofiles.os.path.isdir(args.boilerplate):
                await aiofiles.os.makedirs(
                    args.boilerplate,
                )
            if not is_on_path(BOILERPLATE_PLUGIN_BY_LANGUAGE[language]):
                raise FileNotFoundError(
                    f"Failed to find '{BOILERPLATE_PLUGIN_BY_LANGUAGE[language]}'. "
                    "Please report this bug to the maintainers."
                )

            all_plugins_args.append(
                [
                    f"{OUTPUT_BOILERPLATE_FLAG_BY_LANGUAGE[language]}={args.boilerplate}"
                ]
            )

        if not is_on_path(PROTOC_PLUGIN_BY_LANGUAGE[language]):
            raise FileNotFoundError(
                f"Failed to find '{PROTOC_PLUGIN_BY_LANGUAGE[language]}'. "
                "Please report this bug to the maintainers."
            )

        # If the directory doesn't exist create it (we checked in
        # `_check_explicitly_specified_out_paths()` that none of
        # the specified out paths were files).
        #
        # This is a _much_ better experience than the error message
        # that `protoc` gives if the directory does not exist.
        if not await aiofiles.os.path.isdir(output_path_by_language[language]):
            await aiofiles.os.makedirs(
                output_path_by_language[language],
                exist_ok=True,
            )

        # This is safe even when multiple languages share one protoc plugin,
        # because in those cases their output path is guaranteed to be the
        # same.
        for flag_name in OUTPUT_FLAGS_BY_LANGUAGE[language]:
            if flag_name == '--es_out':
                if es_out_language is not None:
                    continue
                es_out_language = language

            protoc_plugin_out_flags[flag_name] = output_path_by_language[
                language]

    for flag_name, out in protoc_plugin_out_flags.items():
        all_plugins_args.append([f"{flag_name}={out}"])

    if args.react is not None or args.nodejs is not None or args.web is not None:
        if not rbt_from_nodejs:
            await ensure_protoc_gen_es(
                args,
                parser,
                subprocesses,
            )

        # If a Python backend, protoc-gen-es should already be on the PATH.
        # The check below should only fail if a Node dev failed to see a
        # missing peerDependency when installing @reboot-dev/reboot.
        if not is_on_path('protoc-gen-es'):
            raise FileNotFoundError(
                "Failed to find binary for 'protoc-gen-es' on PATH. "
                "This is likely because you need to explicitly add "
                "@bufbuild/protoc-gen-es as a dependency of your project."
            )

        protoc_gen_es_with_deps_path: Optional[str] = (
            get_absolute_path_from_path("protoc-gen-es_with_deps")
        )

        if protoc_gen_es_with_deps_path is None:
            raise FileNotFoundError(
                "Failed to find 'protoc-gen-es_with_deps'. "
                "Please report this bug to the maintainers."
            )

        def add_es_opts(
            protoc_gen_es_with_deps_path: str,
            import_extension: str,
            is_first_invocation: bool,
            output_path: Optional[str] = None,
        ):
            common_es_opts = [
                # We always want to generate TypeScript so that end users can
                # decide how to convert that to JavaScript.
                "--es_opt=target=ts",
                f"--plugin=protoc-gen-es={protoc_gen_es_with_deps_path}",
                f'--es_opt=import_extension={import_extension}'
            ]

            if not is_first_invocation:
                # If this is not the first invocation of `protoc gen es` with
                # different arguments, we have to store the whole list
                # specific arguments as a separate list.
                common_es_opts = [
                    f'--es_out={output_path}',
                ] + common_es_opts

                all_plugins_args.append(common_es_opts)
            else:
                add_args_to_plugin('--es_out', common_es_opts)

        is_first_invocation = True
        for out_directory, ts_target in directory_to_ts_targets.items():
            extensions_flag = {ext for _, ext in ts_target}.pop()

            add_es_opts(
                protoc_gen_es_with_deps_path,
                ".js" if extensions_flag else "none",
                is_first_invocation,
                out_directory,
            )
            is_first_invocation = False

    if args.nodejs_extensions:
        os.environ[ENVVAR_REBOOT_NODEJS_EXTENSIONS] = "true"

    if args.react_extensions:
        os.environ[ENVVAR_REBOOT_REACT_EXTENSIONS] = "true"

    if args.web_extensions:
        os.environ[ENVVAR_REBOOT_WEB_EXTENSIONS] = "true"

    # The `mypy` plugin is by default being a little loud for our liking.
    # This can be suppressed by passing the parameter `quiet` to the plugin.
    # https://github.com/nipunn1313/mypy-protobuf/blob/7f4a558c00faf8fac0cd6d7a6d1332d1643cc08c/mypy_protobuf/main.py#L1082
    # Check if we are going to invoke `mypy` and if so, make sure we are
    # also passing `quiet`.

    quiet_arg = '--mypy_opt=quiet'
    if quiet_arg not in common_args:
        add_args_to_plugin('--mypy_out', [quiet_arg])

    # Grab all of the positional '.proto' arguments.
    proto_directories: list[str] = args.proto_directories or []

    protos_by_directory: defaultdict[str, list[str]] = defaultdict(list)
    zod_schemas_by_directory: defaultdict[str, list[str]] = defaultdict(list)
    pydantic_schemas_by_directory: defaultdict[str,
                                               list[str]] = defaultdict(list)

    for proto_directory in proto_directories:
        if not proto_directory.endswith(os.path.sep):
            proto_directory += os.path.sep
        # Expand any directories to be short-form for 'directory/**/*.proto'.
        if not await aiofiles.os.path.isdir(proto_directory):
            terminal.fail(f"Failed to find directory '{proto_directory}'")
        else:
            # Also add any directories given to us as part of the import path.
            common_args.append(f'--proto_path={proto_directory}')

            found_protos = False
            for file in glob.iglob(
                os.path.join(proto_directory, '**', '*.proto'),
                recursive=True,
            ):
                _, extension = os.path.splitext(file)
                if extension == '.proto':
                    found_protos = True
                    protos_by_directory[proto_directory].append(file)

            found_schemas = False
            for file in glob.iglob(
                os.path.join(proto_directory, '**', '*.ts'),
                recursive=True,
            ):
                prefix, extension = os.path.splitext(file)
                if (
                    # 'protoc-gen-es' generated files.
                    prefix.endswith('_pb') or
                    # Reboot TypeScript generated files.
                    prefix.endswith('_rbt') or prefix.endswith('_rbt_react') or
                    prefix.endswith('_rbt_web') or
                    # TypeScript declaration files.
                    file.endswith('.d.ts')
                ):
                    continue

                if extension == '.ts':
                    found_schemas = True
                    zod_schemas_by_directory[proto_directory].append(file)

            for file in glob.iglob(
                os.path.join(proto_directory, '**', '*.py'),
                recursive=True,
            ):
                prefix, extension = os.path.splitext(file)
                if (
                    # gRPC Python generated files.
                    prefix.endswith('_pb2') or prefix.endswith('_pb2_grpc') or
                    # Reboot Python generated files.
                    prefix.endswith('_rbt')
                ):
                    continue

                if extension == '.py':
                    found_schemas = True
                    pydantic_schemas_by_directory[proto_directory].append(file)

            if not found_protos and not found_schemas:
                terminal.fail(
                    f"'{proto_directory}' did not match any '.ts', '.py' files containing schemas or '.proto' files"
                )

    proto_files: list[str] = []

    for protos in protos_by_directory.values():
        for file in protos:
            if os.stat(file).st_size == 0:
                terminal.error(
                    f"'{file}' is empty. "
                    f"See {DOCS_BASE_URL}/develop/schema for "
                    "more information on filling out your proto file."
                )
                # Return an error status here to not break the 'rbt dev' loop.
                return 1

        proto_files.extend(protos)

    # Convert schemas into a file descriptor set and add to command.
    if len(zod_schemas_by_directory) > 0:
        # TODO: do a better job ensuring that the `.ts` file actually
        # has a schema in it.
        if not args.nodejs and not args.web and not args.react:
            terminal.fail(
                "Not expecting to find '.ts' schemas when not generating for a nodejs backend or web frontend."
            )

        # Ensure we're being called from nodejs.
        if not rbt_from_nodejs:
            terminal.fail(
                "Expecting to be invoked from Node.js in order to use '.ts' schemas."
            )

        # For each proto directory check that the files are not empty
        # and invoke `zod-to-proto`.
        #
        # TODO: do this in parallel for each proto directory.
        generated_proto_from_schema = False
        for (proto_directory, schemas) in zod_schemas_by_directory.items():
            files: list[str] = []
            for file in schemas:
                if os.stat(file).st_size == 0:
                    terminal.error(
                        f"'{file}' is empty. "
                        f"See {DOCS_BASE_URL}/develop/schema for "
                        "more information on filling out your schema in a '.ts' file."
                    )
                    # Return an error status here to not break the 'rbt dev' loop.
                    return 1

                # Transform the paths into paths relative to the
                # `proto_directory` because that's what
                # `zod-to-proto` requires.
                files.append(str(Path(file).relative_to(proto_directory)))

            if not is_on_path('zod-to-proto'):
                terminal.fail(
                    "Failed to find 'zod-to-proto' on PATH. "
                    "Please report this bug to the maintainers."
                )

            # We require 'npx' to run the 'zod-to-proto' command,
            # but users who use 'yarn' might not have 'npx' on their PATH.
            if not is_on_path('npx'):
                terminal.fail(
                    "Failed to find 'npx' on PATH. "
                    "Please install Node.js and ensure that 'npx' is on your PATH."
                )

            # To be able to import '*.ts' files dynamically, we need to
            # run the 'zod-to-proto' with a TS loader. The
            # 'zod-to-proto' itself has the '#!/usr/bin/env tsx'
            # shebang, so we have to run the binary with 'npx' to ensure
            # that the 'tsx' loader is used.
            async with subprocesses.shell(
                f"npx zod-to-proto {proto_directory} {' '.join(files)}",
                stdout=asyncio.subprocess.PIPE,
            ) as process:
                stdout, _ = await process.communicate()

                if process.returncode != 0:
                    terminal.fail(
                        "Failed to generate code from schema in '.ts'"
                    )

                # Expecting 'path/to/generated/protos/directory'
                generated_protos_directory = stdout.decode().strip()

                if generated_protos_directory == '':
                    # Try to generate proto files from the rest of the
                    # available directories.
                    continue

                generated_proto_from_schema = True
                common_args.append(
                    f'--proto_path={generated_protos_directory}'
                )

                # Glob on the generated protos directory to find all
                # generated `.proto` files.
                generated_protos = glob.glob(
                    os.path.join(generated_protos_directory, '**', '*.proto'),
                    recursive=True,
                )

                # Strip the directory from the file names to make them
                # relative to the `generated_protos_directory`, so 'protoc'
                # can find them.
                generated_protos = [
                    os.path.relpath(file, generated_protos_directory)
                    for file in generated_protos
                ]

                proto_files.extend(generated_protos)

        if not generated_proto_from_schema:
            terminal.fail(
                "No '.ts' schemas found in the specified proto directories. "
                "Please add a '.ts' file with a schema to your proto directory "
                "which exports 'api'"
            )

        # We have to propagate the output directory of each of 'nodejs',
        # 'web', and 'react' to the 'Protoc*' plugin, so we can infer
        # the relative output path from the generated file to the schema
        # file.
        if args.nodejs is not None:
            add_args_to_plugin(
                '--reboot_nodejs_out',
                [f'--reboot_nodejs_opt={args.nodejs}'],
            )

        if args.react is not None:
            add_args_to_plugin(
                '--reboot_react_out',
                [f'--reboot_react_opt={args.react}'],
            )

        if args.web is not None:
            add_args_to_plugin(
                '--reboot_web_out',
                [f'--reboot_web_opt={args.web}'],
            )

    generated_proto_from_schema = False

    if len(pydantic_schemas_by_directory) > 0:
        for directory in proto_directories:
            # Add all proto directories to the 'PYTHONPATH' so that
            # 'pydantic_schema_to_proto' and 'pydantic_schema_to_zod' can
            # import schema files correctly.
            sys.path.insert(0, directory)

        # Evict cached modules for each pydantic schema file so that
        # re-imports pick up any changes the user made to source files.
        # Without this, hot reload keeps using a stale module because
        # `importlib.import_module` returns the `sys.modules` entry
        # from the previous dev loop iteration rather than re-reading
        # the file.
        for proto_directory, schemas in pydantic_schemas_by_directory.items():
            for file in schemas:
                relative = str(Path(file).relative_to(proto_directory))
                module_path = relative.rsplit('.py', 1)[0].replace(os.sep, '.')
                sys.modules.pop(module_path, None)

        # Pre-scan all pydantic files to collect error models across all
        # APIs. This allows error models defined in separate files to get
        # the proper `type` discriminator field.
        all_pydantic_files: list[str] = []
        for proto_directory, schemas in pydantic_schemas_by_directory.items():
            for file in schemas:
                all_pydantic_files.append(
                    str(Path(file).relative_to(proto_directory))
                )
        global_error_models = collect_all_error_models(all_pydantic_files)

        for (proto_directory,
             schemas) in pydantic_schemas_by_directory.items():
            pydantic_files: list[str] = []
            for file in schemas:
                if os.stat(file).st_size == 0:
                    terminal.error(
                        f"'{file}' is empty. "
                        f"See {DOCS_BASE_URL}/develop/schema for "
                        "more information on filling out your schema in a '.py' file."
                    )
                    # Return an error status here to not break the 'rbt dev' loop.
                    return 1

                # Transform the paths into paths relative to the
                # `proto_directory` because that's what
                # `pydantic_schema_to_proto` requires.
                pydantic_files.append(
                    str(Path(file).relative_to(proto_directory))
                )

            output_proto_temp_directory_python = tempfile.mkdtemp()
            output_proto_temp_directory_react = tempfile.mkdtemp()
            output_proto_temp_directory_web = tempfile.mkdtemp()

            output_proto_temp_directory_by_plugin = {
                'python': output_proto_temp_directory_python,
                'react': output_proto_temp_directory_react,
                'web': output_proto_temp_directory_web,
            }
            for plugin, output_directory in output_proto_temp_directory_by_plugin.items(
            ):
                if output_path_by_language.get(plugin, None) is None:
                    # Means that we're not generating Reboot code for this
                    # plugin, so no need to generate proto files for it.
                    continue
                for plugin_out_flag in OUTPUT_FLAGS_BY_LANGUAGE[plugin]:
                    add_args_to_plugin(
                        # If we have different frontend output directories,
                        # we will have multiple inclusions of '--es_out',
                        # so to find the correct one we have to match the
                        # flag and output directory both.
                        f'{plugin_out_flag}={output_path_by_language[plugin]}',
                        # Every 'protoc' invocation finds the proto files
                        # by relative path of proto file. We don't want to
                        # mix Pydantic-based proto file with the Pydantic-based
                        # proto for 'react' or 'web'. The proto file relative
                        # path keeps the same, so it is safe to add it to the
                        # proto files pool and we can control the location
                        # by adding '--proto_path' directly to the specific
                        # plugin args.
                        [f'--proto_path={output_directory}'],
                    )

            for file_path in pydantic_files:
                proto_file = await generate_proto_file_from_api(
                    file_path,
                    output_proto_temp_directory_by_plugin['python'],
                )
                if proto_file is None:
                    continue

                # We add the relative path of the generated proto file,
                # but for different plugins it will be located in
                # different temporary directories and we control that
                # via '--proto_path' argument added above.
                proto_files.append(proto_file)

                frontend_args_by_type = {
                    'react': (args.react, args.react_extensions),
                    'web': (args.web, args.web_extensions),
                }

                # Track which `(output_directory, js_extension)` pairs we've
                # already generated Zod files for to avoid duplicates.
                generated_zod_files: dict[tuple[str, bool], str] = {}

                for frontend_type, (
                    output_directory,
                    js_extension,
                ) in frontend_args_by_type.items():
                    if output_directory is None:
                        continue

                    # Specify `Optional` type for mypy compatibility.
                    zod_file: Optional[str]

                    key = (output_directory, js_extension)
                    if key in generated_zod_files:
                        zod_file = generated_zod_files[key]
                    else:
                        # Generate Zod types file directly to the specified
                        # output directory there, so later we can import it
                        # relatively in the Reboot generated code.
                        zod_file = await generate_zod_file_from_api(
                            file_path,
                            output_directory,
                            js_extension,
                            global_error_models,
                        )
                        generated_zod_files[key] = zod_file

                    # Copy and modify proto file to the frontend output
                    # directory.
                    proto_file_frontend = os.path.join(
                        output_proto_temp_directory_by_plugin[frontend_type],
                        proto_file,
                    )
                    await aiofiles.os.makedirs(
                        os.path.dirname(proto_file_frontend),
                        exist_ok=True,
                    )
                    shutil.copyfile(
                        # We copy the same proto file as we already have
                        # for Python, but we will add 'zod' option to it,
                        # so we can know where to find the Zod types file
                        # when generating Reboot code for frontend.
                        os.path.join(
                            output_proto_temp_directory_by_plugin['python'],
                            proto_file,
                        ),
                        proto_file_frontend,
                    )

                    # Zod types file should be in the same directory as
                    # Reboot generated code, so we can import it relatively
                    # as './<zod_file>'.
                    zod_file_relative_path = zod_file.rsplit(
                        os.path.sep,
                        1,
                    )[-1]
                    # Remove the file extension, so we can determine
                    # if we want to use it depending on the provided
                    # '*_extensions' argument.
                    zod_file_relative_path = zod_file_relative_path[:-3]

                    async with aiofiles.open(
                        proto_file_frontend, 'a'
                    ) as proto:
                        await proto.write(
                            f'option (rbt.v1alpha1.file).zod = "./{zod_file_relative_path}";\n'
                        )

                generated_proto_from_schema = True

        if not generated_proto_from_schema:
            terminal.fail(
                "No '.py' schemas found in the specified proto directories. "
                "Please add a '.py' file with a schema to your proto directory "
                "which defines 'api'"
            )

    if not terminal.is_verbose():
        terminal.info(
            'Running `generate ...` (use --verbose to see full command)',
            end=' ',
        )

    @reboot.aio.tracing.function_span()
    async def _invoke_protoc(
        common_args,
        all_plugins_args,
        proto_files,
        subprocesses,
    ) -> int:
        command_list = [
            # Ignore the deprecation warning from `grpc_tools.protoc`.
            'PYTHONWARNINGS=ignore::DeprecationWarning:',
            f'{sys.executable}',
            '-m',
        ]

        protoc_tasks = []

        # Run protoc plugins in parallel.
        for args in all_plugins_args:
            command_list_for_plugin = command_list + common_args + args + proto_files

            if terminal.is_verbose():
                terminal.verbose('protoc')
                # Skip the args from 'command_list' and change
                # 'grpc_tools.protoc' to 'protoc'.
                for arg in command_list_for_plugin[4:]:
                    terminal.verbose(f'  {arg}')

            command = ' '.join(command_list_for_plugin)

            async def __invoke_protoc(command, env):
                async with subprocesses.shell(
                    command=command,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.STDOUT,
                    env=env,
                ) as process:
                    stdout, _ = await process.communicate()

                    # Print if we failed.
                    if process.returncode != 0:
                        # Print the output in the white color.
                        print(
                            f'{stdout.decode() if stdout is not None else "<no output>"}',
                            file=sys.stderr,
                        )
                        terminal.error(
                            f"`protoc` failed with exit status {process.returncode}"
                        )

                    return process.returncode

            env = os.environ.copy()

            # When generating Reboot Python code we might need to get
            # access to the Pydantic schema. To make it available to
            # import these files we set the 'PYTHONPATH' to include
            # all of the proto directories, where the schema files are
            # located.
            if 'PYTHONPATH' not in env and '--reboot_python_out' in command:
                env['PYTHONPATH'] = os.pathsep.join(proto_directories)

            protoc_tasks.append(
                asyncio.create_task(__invoke_protoc(command, env))
            )

        result = await asyncio.gather(*protoc_tasks)

        for returncode in result:
            if returncode != 0:
                return returncode

        if not terminal.is_verbose():
            terminal.info('✅'
                          '\n')

        return 0

    returncode = await _invoke_protoc(
        common_args,
        all_plugins_args,
        proto_files,
        subprocesses,
    )

    return returncode
