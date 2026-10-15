from reboot.cli.common.rc import SubcommandParser


def add_common_frontend_args(subcommand: SubcommandParser) -> None:
    """Add the frontend-serving flags shared by `dev run` and
    `serve run`: `--frontend-root-path` and `--mcp-app-dist-path`.
    """
    subcommand.add_argument(
        '--frontend-root-path',
        type=str,
        help=(
            'project-relative directory that is the frontend '
            'root (e.g., `frontend`), stripped off each '
            '`UI(path=...)` to form its served URL under '
            '`/__/frontend/`. Required with, and only valid '
            'alongside, `--mcp-app-dist-path` or (in `dev run`) '
            '`--frontend-url`.'
        ),
    )
    subcommand.add_argument(
        '--mcp-app-dist-path',
        type=str,
        help=(
            'project-relative directory holding the built '
            'MCP Apps (e.g., `frontend/dist`), served from '
            'disk under `/__/frontend/`. Requires '
            '`--frontend-root-path`.'
        ),
    )
    subcommand.add_renamed_flag(
        '--frontend-dist-path',
        '--mcp-app-dist-path',
    )
