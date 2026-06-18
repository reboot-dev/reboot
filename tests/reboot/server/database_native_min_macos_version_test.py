"""Verifies the MacOS minimum-version floor of the native extension we
ship in the wheel.

`libdatabase_native.dylib` is the only substantial native binary the
`reboot` wheel carries, so its Mach-O `minos` is the wheel's effective
runtime floor: `dyld` refuses to load it on a MacOS older than `minos`,
regardless of what the wheel's platform tag advertises. We pin that
floor via `build:macos --action_env=MACOSX_DEPLOYMENT_TARGET` in
`.bazelrc` so the wheel stays installable and loadable on older MacOS
no matter which MacOS/Xcode the build host ships. This test reads back
the actual `minos` with `otool` and fails if it ever differs from the
pinned version.
"""

import subprocess
import sys
import unittest
from typing import Optional

# Must match the `MACOSX_DEPLOYMENT_TARGET` pin in `.bazelrc` and the
# `MACOS_PLATFORM_TAG` constant in
# `bazel/pip_package_rule/pip_package.bzl`.
EXPECTED_MIN_MACOS_VERSION = "14.0"

# `LC_BUILD_VERSION` reports its target OS as a numeric `platform`; 1 is
# `PLATFORM_MACOS` (from `<mach-o/loader.h>`).
_PLATFORM_MACOS = "1"

# The path to `libdatabase_native.dylib`, passed by the Bazel rule via
# `$(rootpath ...)` so we don't have to hardcode the output filename.
_DYLIB_PATH = sys.argv[1]


def _macos_minimums(otool_output: str) -> list[str]:
    """Return every MacOS minimum-version string declared by the binary.

    Modern binaries declare `LC_BUILD_VERSION` (with a `minos` field,
    qualified by a numeric `platform`); older ones declare
    `LC_VERSION_MIN_MACOSX` (with a `version` field). We collect the
    MacOS minimum from whichever form is present.
    """
    minimums: list[str] = []
    current_command: Optional[str] = None
    platform_is_macos = False
    for line in otool_output.splitlines():
        fields = line.split()
        if len(fields) == 2 and fields[0] == "cmd":
            current_command = fields[1]
            platform_is_macos = False
        elif current_command == "LC_BUILD_VERSION" and fields[:1] == [
            "platform"
        ]:
            platform_is_macos = fields[1:2] == [_PLATFORM_MACOS]
        elif (
            current_command == "LC_BUILD_VERSION" and platform_is_macos and
            fields[:1] == ["minos"]
        ):
            minimums.append(fields[1])
        elif current_command == "LC_VERSION_MIN_MACOSX" and fields[:1] == [
            "version"
        ]:
            minimums.append(fields[1])
    return minimums


class DatabaseNativeMinMacosVersionTest(unittest.TestCase):

    def test_min_macos_version_matches_pin(self) -> None:
        otool_output = subprocess.run(
            ["otool", "-l", _DYLIB_PATH],
            check=True,
            capture_output=True,
            text=True,
        ).stdout
        minimums = _macos_minimums(otool_output)
        self.assertTrue(
            minimums,
            "Found no MacOS minimum-version load command in "
            f"{_DYLIB_PATH!r}; `otool -l` output was:\n{otool_output}",
        )
        for minimum in minimums:
            self.assertEqual(
                minimum,
                EXPECTED_MIN_MACOS_VERSION,
                f"{_DYLIB_PATH!r} was built with MacOS minimum {minimum}, "
                f"but expected {EXPECTED_MIN_MACOS_VERSION} (the "
                "`MACOSX_DEPLOYMENT_TARGET` pin in `.bazelrc`). A newer "
                "floor narrows the MacOS versions our wheel can load on.",
            )


if __name__ == "__main__":
    # Drop the dylib path argument which was passed by Bazel so
    # `unittest`'s own argument parser doesn't try to interpret it as an
    # argument for itself.
    del sys.argv[1]
    unittest.main()
