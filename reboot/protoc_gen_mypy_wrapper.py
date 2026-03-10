#!/usr/bin/env python3
"""
This file exists because Bazel does not support creating a `py_binary`
directly from a thirdparty dep.
"""

import sys
from mypy_protobuf.main import main

if __name__ == '__main__':
    sys.exit(main())
