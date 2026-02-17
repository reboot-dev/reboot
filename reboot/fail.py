import sys
from typing import NoReturn


def fail(message: str) -> NoReturn:
    """Print an error message to stderr and exit."""
    print(message, file=sys.stderr)
    sys.exit(1)
