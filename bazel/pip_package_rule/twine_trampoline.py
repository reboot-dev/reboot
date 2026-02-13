"""A trampoline for the `twine` package.

This exists to give Bazel a `py_binary` target for the `twine` package.

TODO(rjh): replace this with a `py_console_script_binary` once our
           `rules_python` has been updated to a version that includes it.
           https://github.com/bazelbuild/rules_python/blob/main/docs/py_console_script_binary.md
"""

import sys
from twine.__main__ import main

if __name__ == "__main__":
    sys.exit(main())
