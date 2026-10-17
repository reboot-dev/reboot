from reboot.cli.common.rc import SubcommandParser


def add_common_frontend_args(subcommand: SubcommandParser) -> None:
    """Add the frontend-serving flag shared by `dev run` and
    `serve run`: `--mcp-app-dist-path`.
    """
    subcommand.add_argument(
        '--mcp-app-dist-path',
        type=str,
        help=(
            'project-relative directory holding the built '
            'MCP Apps (e.g., `frontend/dist/mcp`), served from '
            'disk under `/__/frontend/mcp/`: each `UI(path=...)` '
            'is read from `<dir>/<path>/index.html`.'
        ),
    )
    subcommand.add_renamed_flag(
        '--frontend-dist-path',
        '--mcp-app-dist-path',
    )


def add_common_web_args(subcommand: SubcommandParser) -> None:
    """Add the web app serving flags shared by `dev run` and
    `serve run`: `--web-app-dist-path`.
    """
    subcommand.add_argument(
        '--web-app-dist-path',
        type=str,
        help=(
            'project-relative directory holding the built web '
            'app (e.g., `frontend/dist/web`), served from disk '
            'at `/`: its `index.html` answers `/` and any path '
            'the application has no route or file for, so the '
            'app\'s own routing works on reload. Without it, '
            '`/` is Reboot\'s page.'
        ),
    )
