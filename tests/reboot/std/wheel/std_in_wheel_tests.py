"""The `reboot` wheel ships each standard library whole.

A standard library has two halves: the code `rbt generate` makes from
its proto (`rbt/std/<library>/v1/<name>_rbt.py`) and the Python that
wraps it (`reboot/std/<library>/v1/<name>.py`: `oauth_library()`,
`ciphertext_library()`, ...). The wrapper reaches the wheel only when
its target is listed in `//reboot:python_std`; one left out still
imports under Bazel, where every module in the tree is on the path, so
only the built wheel shows it. `reboot.std.oauth` was missing that way.
"""

import os
import re
import unittest
import zipfile

GENERATED = re.compile(r"^rbt/std/(?P<library>.+?)/v1/[^/]+_rbt\.py$")
WRAPPER = re.compile(r"^reboot/std/(?P<library>.+?)/v1/[^/]+\.py$")

# Generated libraries whose wrapper is TypeScript only: there is no
# `reboot/std/<library>/v1/*.py` in the tree to ship.
NO_PYTHON_WRAPPER = {
    "presence/mouse_tracker",
    "presence/subscriber",
}


def libraries(names: list[str], pattern: re.Pattern[str]) -> set[str]:
    return {
        match.group("library")
        for match in map(pattern.match, names)
        if match is not None
    }


class StdInWheelTestCase(unittest.TestCase):

    def setUp(self) -> None:
        with zipfile.ZipFile(os.environ["REBOOT_WHL_FILE"]) as wheel:
            self.names = wheel.namelist()

    def test_every_generated_library_ships_its_wrapper(self) -> None:
        generated = libraries(self.names, GENERATED)
        wrapped = libraries(self.names, WRAPPER)
        self.assertEqual(
            sorted(generated - wrapped - NO_PYTHON_WRAPPER),
            [],
            "generated in the wheel, but its `reboot/std` wrapper is not: "
            "add its `py_library` to `python_std` in `reboot/BUILD.bazel`",
        )

    def test_the_exceptions_are_still_exceptions(self) -> None:
        # A library listed above that gains a Python wrapper is no
        # longer an exception, and the list should say so.
        wrapped = libraries(self.names, WRAPPER)
        self.assertEqual(sorted(NO_PYTHON_WRAPPER & wrapped), [])

    def test_oauth_ships(self) -> None:
        self.assertIn("reboot/std/oauth/v1/oauth.py", self.names)


if __name__ == "__main__":
    unittest.main()
