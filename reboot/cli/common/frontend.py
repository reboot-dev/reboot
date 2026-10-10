from reboot.cli.common.rc import SubcommandParser


def add_common_frontend_args(subcommand: SubcommandParser) -> None:
    """Add the frontend-serving flags shared by `dev run` and
    `serve run`: `--mcp-ui-path-prefix` and `--frontend-dist-path`.
    """
    subcommand.add_argument(
        '--mcp-ui-path-prefix',
        type=str,
        help=(
            'prefix of each MCP `UI(path=...)` that names the '
            'frontend directory (e.g., `frontend` for '
            '`UI(path="frontend/mcp/counter")`). The prefix is '
            'stripped and the rest is served under '
            '`/__/frontend/`, or looked up under '
            '`--frontend-dist-path`. Required with, and only '
            'valid alongside, `--frontend-dist-path` or (in '
            '`dev run`) `--frontend-host`.'
        ),
    )
    subcommand.add_renamed_flag(
        '--frontend-root-path',
        '--mcp-ui-path-prefix',
    )
    subcommand.add_argument(
        '--frontend-dist-path',
        type=str,
        help=(
            'project-relative directory holding the built '
            'frontend assets (e.g., `frontend/dist`), served '
            'from disk under `/__/frontend/`. Requires '
            '`--mcp-ui-path-prefix`.'
        ),
    )
