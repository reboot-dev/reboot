from reboot.cli.common.rc import SubcommandParser


def add_common_frontend_args(subcommand: SubcommandParser) -> None:
    """Add the frontend-serving flags shared by `dev run` and
    `serve run`: `--frontend-root-path` and `--frontend-dist-path`.
    """
    subcommand.add_argument(
        '--frontend-root-path',
        type=str,
        help=(
            'project-relative directory that is the frontend '
            'root (e.g., `frontend`), stripped off each '
            '`UI(path=...)` to form its served URL under '
            '`/__/frontend/`. Required with, and only valid '
            'alongside, `--frontend-dist-path` or (in `dev run`) '
            '`--frontend-host`.'
        ),
    )
    subcommand.add_argument(
        '--frontend-dist-path',
        type=str,
        help=(
            'project-relative directory holding the built '
            'frontend assets (e.g., `frontend/dist`), served '
            'from disk under `/__/frontend/`. Requires '
            '`--frontend-root-path`.'
        ),
    )
