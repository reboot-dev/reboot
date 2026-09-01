"""Runs pytest on the paths given as arguments.

The entry point for `py_test` targets whose tests need pytest to be
the importer of their test modules, e.g. pytest-bdd's `scenarios()`
only works in a module that pytest imports, so running such a module
directly as `__main__` would fail before pytest is configured. List
the test files in the target's `args`.
"""

import pytest
import sys

if __name__ == '__main__':
    sys.exit(pytest.main(sys.argv[1:] + ['-p', 'no:cacheprovider']))
