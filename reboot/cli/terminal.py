"""Tooling to interact with a command-line terminal"""

import colorama
import sys
from colorama import Fore, Style
from rebootdev.aio.once import Once
from typing import NoReturn

_VERBOSE: bool = False


def init(*, verbose: bool):
    colorama_init_once = Once(colorama.init)
    colorama_init_once()
    global _VERBOSE
    _VERBOSE = verbose


def is_verbose() -> bool:
    return _VERBOSE


# TODO(benh): move these helpers into a generic "CLI" module.
def verbose(message: str):
    if not _VERBOSE:
        return
    if sys.stdout.isatty():
        print(
            Fore.WHITE + message + Style.RESET_ALL,
            file=sys.stdout,
        )
    else:
        print(message, file=sys.stdout)


def info(
    message: str,
    end: str = '\n',
    *,
    color: colorama.Fore = Fore.GREEN,
    style: colorama.Style = Style.BRIGHT,
):
    if sys.stdout.isatty():
        print(
            color + style + message + Style.RESET_ALL,
            file=sys.stdout,
            end=end,
            flush=True,
        )
    else:
        print(
            message,
            file=sys.stdout,
            end=end,
            flush=True,
        )


def warn(message: str):
    if sys.stdout.isatty():
        print(
            Fore.YELLOW + Style.BRIGHT + message + Style.RESET_ALL,
            file=sys.stdout,
        )
    else:
        print(message, file=sys.stdout)


def error(message: str):
    if sys.stderr.isatty():
        print(
            Fore.RED + Style.BRIGHT + message + Style.RESET_ALL,
            file=sys.stderr,
        )
    else:
        print(message, file=sys.stderr)


def fail(message: str) -> NoReturn:
    error(message)
    sys.exit(1)
