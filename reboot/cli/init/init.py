import aiofiles.os
import importlib
import os
import re
from jinja2 import Environment, FileSystemLoader, select_autoescape
from reboot.cli import terminal
from reboot.cli.rc import ArgumentParser

DEFAULT_PROTO_DIRECTORY = 'api'
DEFAULT_BACKEND_DIRECTORY = 'backend'
DEFAULT_BACKEND_SRC_DIRECTORY = f'{DEFAULT_BACKEND_DIRECTORY}/src'
DEFAULT_WEB_DIRECTORY = 'web'
DEFAULT_WEB_SRC_DIRECTORY = f'{DEFAULT_WEB_DIRECTORY}/src'
DEFAULT_ASSETS_DIRECTORY = f'{DEFAULT_WEB_SRC_DIRECTORY}/assets'
DEFAULT_WEB_PUBLIC_DIRECTORY = f'{DEFAULT_WEB_DIRECTORY}/public'

CLI_TEMPLATE = "cli.py.j2"
RBTRC_TEMPLATE = ".rbtrc.j2"
PROTO_TEMPLATE = "hello_world.proto.j2"
SERVICER_TEMPLATE = "hello_world_servicer.py.j2"
NODEJS_SERVICER_TEMPLATE = "hello_world_servicer.ts.j2"
MAIN_TEMPLATE = "main.py.j2"
NODEJS_MAIN_TEMPLATE = "main.ts.j2"
ENV_TEMPLATE = ".env.j2"
PACKAGE_JSON_TEMPLATE = "package.json.j2"
BACKEND_PACKAGE_JSON_TEMPLATE = "backend_package.json.j2"
TS_CONFIG_TEMPLATE = "tsconfig.json.j2"
BACKEND_TS_CONFIG_TEMPLATE = "backend_tsconfig.json.j2"
INDEX_HTML_TEMPLATE = "index.html.j2"
REACT_APP_ENV_TEMPLATE = "react-app-env.d.ts.j2"
CSS_TEMPLATE = "App.module.css.j2"
REACT_APP_TEMPLATE = "App.tsx.j2"
INDEX_TSX_TEMPLATE = "index.tsx.j2"
REBOOT_LOGO_TEMPLATE = "reboot-logo.svg.j2"

BACKEND = ['python', 'nodejs']
FRONTEND = ['react', "none"]

DEFAULT_BACKEND = BACKEND[0]
DEFAULT_FRONTEND = FRONTEND[0]


def register_init(parser: ArgumentParser):
    parser.subcommand('init').add_argument(
        '--backend',
        type=str,
        default=DEFAULT_BACKEND,
        help="Reboot backend; choose from: "
        f"{', '.join(BACKEND)}. Default: '{DEFAULT_BACKEND}'.",
    )

    parser.subcommand('init').add_argument(
        '--frontend',
        type=str,
        default=DEFAULT_FRONTEND,
        help="platform for Reboot frontend; choose from: "
        f"{', '.join(FRONTEND)}. Default: '{DEFAULT_FRONTEND}'.",
    )

    parser.subcommand('init').add_argument(
        '--name',
        type=str,
        help="name of application; should be in lower_snake_case",
        required=True,
    )


async def _write_templated_file(
    env: Environment,
    template_name: str,
    destination_folder: str,
    filename: str,
    template_data={},
):
    await aiofiles.os.makedirs(destination_folder, exist_ok=True)

    template = env.get_template(template_name)

    async with aiofiles.open(f"{destination_folder}/{filename}", "w") as out:
        await out.write(template.render(**template_data))
        await out.flush()


async def _initialize_python(env: Environment, directory: str, args):
    template_data = {
        'name': args.name,
    }

    await _write_templated_file(
        env,
        SERVICER_TEMPLATE,
        f'{directory}/{DEFAULT_BACKEND_SRC_DIRECTORY}',
        SERVICER_TEMPLATE.replace('.j2', ''),
        template_data,
    )

    await _write_templated_file(
        env,
        MAIN_TEMPLATE,
        f'{directory}/{DEFAULT_BACKEND_SRC_DIRECTORY}',
        MAIN_TEMPLATE.replace('.j2', ''),
        template_data,
    )

    await _write_templated_file(
        env,
        CLI_TEMPLATE,
        f'{directory}/{DEFAULT_BACKEND_SRC_DIRECTORY}',
        CLI_TEMPLATE.replace('.j2', ''),
        template_data,
    )

    terminal.info(
        "Run 'rbt dev run' to start the Reboot server.\n"
        f"Run 'PYTHONPATH={DEFAULT_BACKEND_DIRECTORY}/{DEFAULT_PROTO_DIRECTORY} python {DEFAULT_BACKEND_SRC_DIRECTORY}/cli.py' to send a message to the server."
    )


async def _initialize_nodejs(env: Environment, directory: str, args):
    if not await aiofiles.os.path.exists(f'{directory}/package.json'):
        await _write_templated_file(
            env,
            BACKEND_PACKAGE_JSON_TEMPLATE,
            directory,
            'package.json',
            template_data={
                'name': args.name,
            },
        )

    if not await aiofiles.os.path.exists(f'{directory}/tsconfig.json'):
        await _write_templated_file(
            env,
            BACKEND_TS_CONFIG_TEMPLATE,
            directory,
            'tsconfig.json',
        )

    await _write_templated_file(
        env,
        NODEJS_MAIN_TEMPLATE,
        f'{directory}/{DEFAULT_BACKEND_SRC_DIRECTORY}',
        NODEJS_MAIN_TEMPLATE.replace('.j2', ''),
        template_data={
            'name': args.name,
            'api_directory': DEFAULT_PROTO_DIRECTORY,
        },
    )

    await _write_templated_file(
        env,
        NODEJS_SERVICER_TEMPLATE,
        f'{directory}/{DEFAULT_BACKEND_SRC_DIRECTORY}',
        NODEJS_SERVICER_TEMPLATE.replace('.j2', ''),
        template_data={
            'name': args.name,
            'api_directory': DEFAULT_PROTO_DIRECTORY,
        },
    )

    terminal.info(
        "Run 'npm install' to install the backend dependencies.\n"
        "Then run 'npx rbt dev run' to start the Reboot server."
    )


async def _initialize_react(env: Environment, directory: str, args):
    await _write_templated_file(
        env,
        ENV_TEMPLATE,
        f'{directory}/{DEFAULT_WEB_DIRECTORY}',
        ENV_TEMPLATE.replace('.j2', ''),
    )

    await _write_templated_file(
        env,
        PACKAGE_JSON_TEMPLATE,
        f'{directory}/{DEFAULT_WEB_DIRECTORY}',
        PACKAGE_JSON_TEMPLATE.replace('.j2', ''),
    )

    await _write_templated_file(
        env,
        TS_CONFIG_TEMPLATE,
        f'{directory}/{DEFAULT_WEB_DIRECTORY}',
        TS_CONFIG_TEMPLATE.replace('.j2', ''),
    )

    await _write_templated_file(
        env,
        INDEX_HTML_TEMPLATE,
        f'{directory}/{DEFAULT_WEB_PUBLIC_DIRECTORY}',
        INDEX_HTML_TEMPLATE.replace('.j2', ''),
    )

    await _write_templated_file(
        env,
        REACT_APP_ENV_TEMPLATE,
        f'{directory}/{DEFAULT_WEB_SRC_DIRECTORY}',
        REACT_APP_ENV_TEMPLATE.replace('.j2', ''),
    )

    await _write_templated_file(
        env,
        CSS_TEMPLATE,
        f'{directory}/{DEFAULT_WEB_SRC_DIRECTORY}',
        CSS_TEMPLATE.replace('.j2', ''),
    )

    await _write_templated_file(
        env,
        INDEX_TSX_TEMPLATE,
        f'{directory}/{DEFAULT_WEB_SRC_DIRECTORY}',
        INDEX_TSX_TEMPLATE.replace('.j2', ''),
    )

    await _write_templated_file(
        env,
        REBOOT_LOGO_TEMPLATE,
        f'{directory}/{DEFAULT_ASSETS_DIRECTORY}',
        REBOOT_LOGO_TEMPLATE.replace('.j2', ''),
    )

    template_data = {
        'reboot_react_path':
            f"./{DEFAULT_PROTO_DIRECTORY}/{args.name}/v1/{PROTO_TEMPLATE.replace('.j2', '').replace('.proto', '_rbt_react')}",
    }

    await _write_templated_file(
        env,
        REACT_APP_TEMPLATE,
        f'{directory}/{DEFAULT_WEB_SRC_DIRECTORY}',
        REACT_APP_TEMPLATE.replace('.j2', ''),
        template_data,
    )

    terminal.info(
        f"Run 'npm install --prefix=./{DEFAULT_WEB_DIRECTORY}' to install the "
        "frontend dependencies.\n"
        f"Then run 'npm start --prefix=./{DEFAULT_WEB_DIRECTORY}' to start the "
        "frontend."
    )


async def _initialize_proto_directory(env: Environment, directory: str, args):
    template_data = {
        'name': args.name,
    }

    await _write_templated_file(
        env,
        PROTO_TEMPLATE,
        f'{directory}/{DEFAULT_PROTO_DIRECTORY}/{args.name}/v1',
        PROTO_TEMPLATE.replace('.j2', ''),
        template_data,
    )


async def _create_rbtrc(env: Environment, directory: str, args):
    template_data = {
        'api_directory':
            DEFAULT_PROTO_DIRECTORY,
        'backend_directory':
            DEFAULT_BACKEND_DIRECTORY,
        'backend_src_directory':
            DEFAULT_BACKEND_SRC_DIRECTORY,
        'web_directory':
            DEFAULT_WEB_SRC_DIRECTORY if args.frontend == 'react' else None,
        'name':
            args.name,
        'backend':
            args.backend,
    }

    await _write_templated_file(
        env,
        RBTRC_TEMPLATE,
        directory,
        RBTRC_TEMPLATE.replace('.j2', ''),
        template_data,
    )


def validate_name(name: str):
    # We require the name to be a valid proto package name.
    # See more https://protobuf.dev/programming-guides/style/#packages
    pattern = re.compile(r'^[a-z][a-z0-9_]*$')
    if not pattern.match(name):
        terminal.fail(
            f"Invalid name: '{name}'. The name of the application should start "
            "with a letter and contain only lowercase letters, numbers and "
            "underscores."
        )


async def init_run(args):
    validate_name(args.name)

    directory = os.getcwd()

    if args.backend == 'python':
        try:
            # Try to import the module with the same name, if it exists,
            # it will clash with the project name, since we don't provide
            # '__init__.py' files in the generated code, so we force users to pick
            # a different name.
            module = importlib.import_module(args.name)  # noqa: F841

            terminal.fail(
                f"Can't initialize your Python backend: the name '{args.name}' "
                f"would clash with the Python standard library '{args.name}' "
                "module. Try a different name."
            )
        except ModuleNotFoundError:
            pass

    if await aiofiles.os.path.exists(f'{directory}/.rbtrc'):
        terminal.fail("Reboot project is already initialized.")

    if args.backend not in BACKEND:
        terminal.fail(f"Unsupported backend: {args.backend}")

    if args.frontend not in FRONTEND:
        terminal.fail(f"Unsupported frontend: {args.frontend}")

    terminal.info(f"Initializing project in '{directory}'.")

    # Use templates in the 'templates' folder.
    env = Environment(
        loader=FileSystemLoader(
            os.path.join(os.path.dirname(__file__), 'templates')
        ),
        autoescape=select_autoescape(default=True),
    )

    await _create_rbtrc(env, directory, args)

    await _initialize_proto_directory(env, directory, args)

    if args.backend == 'python':
        await _initialize_python(env, directory, args)
    elif args.backend == 'nodejs':
        await _initialize_nodejs(env, directory, args)

    if args.frontend == 'react':
        await _initialize_react(env, directory, args)
