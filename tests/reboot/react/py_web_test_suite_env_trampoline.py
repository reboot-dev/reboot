import glob
import os
import sys

# Add all the environment variables included in any generated files
# and then execute the _actual_ main specified in the Bazel target.
for path in glob.iglob(
    '**/*_py_web_test_suite_env',
    recursive=True,
):
    with open(path) as file:
        # NOTE: using `read().splitlines()` instead of
        # `readlines()` so that we drop newlines.
        for line in file.read().splitlines():
            key, value = line.split('=', 1)
            os.environ[key] = value

os.execv(
    sys.executable,
    [sys.executable, os.environ['PY_WEB_TEST_SUITE_ENV_MAIN']] + sys.argv[1:],
)
