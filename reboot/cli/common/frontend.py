from reboot.cli.common.rc import SubcommandParser


def add_common_frontend_args(subcommand: SubcommandParser) -> None:
    """Add the MCP App serving flags shared by `dev run` and
    `serve run`: `--mcp-app-path-prefix` and `--mcp-app-dist-path`.
    """
    subcommand.add_argument(
        '--mcp-app-path-prefix',
        type=str,
        help=(
            'prefix of each MCP `UI(path=...)` that names the '
            'frontend directory (e.g., `frontend` for '
            '`UI(path="frontend/mcp/counter")`). The prefix is '
            'stripped and the rest is served under '
            '`/__/frontend/`, or looked up under '
            '`--mcp-app-dist-path`. Required with, and only '
            'valid alongside, `--mcp-app-dist-path` or (in '
            '`dev run`) `--mcp-app-url`.'
        ),
    )
    subcommand.add_renamed_flag(
        '--frontend-root-path',
        '--mcp-app-path-prefix',
    )
    subcommand.add_argument(
        '--mcp-app-dist-path',
        type=str,
        help=(
            'project-relative directory holding the built '
            'MCP Apps (e.g., `frontend/dist`), served from '
            'disk under `/__/frontend/`. Requires '
            '`--mcp-app-path-prefix`.'
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
