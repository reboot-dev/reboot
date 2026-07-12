"""Tests for `install.sh`'s `merge_codex_config`.

The function is exercised the way the installer runs it: sourced into
a real `bash` and invoked against a real `config.toml` on disk. Each
merged config is then parsed as TOML, which is the property the merge
must uphold -- Codex refuses to start on a config that defines a key
or table twice, so a bad merge takes down every Codex session on the
machine.

The merge runs its Python through a real `uv` (the devcontainer image
puts one on Bazel's PATH), standing in for the plugin's bundled shim.
Only the `codex` binary used for validation is faked, with a stub
that parses the config as TOML -- the same acceptance criterion real
Codex applies.
"""

import os
import shutil
import subprocess
import sys
import tempfile
import tomlkit
import unittest

# Path to the script under test, injected by Bazel via the `env` attr
# in `BUILD.bazel` as a runfiles-relative path. Absolutized so tests
# can source the script from any working directory.
INSTALL_SH = os.path.abspath(os.environ["INSTALL_SH"])

# The PATH the merge subprocess runs with (and therefore the PATH it
# bakes into the config). Must contain `bash`, the coreutils the
# function calls, and a Python for `uv run` to pick up.
BASE_PATH = "/usr/bin:/bin"

# The import path Python subprocesses started by the `codex` stub run
# with, so that they find `tomlkit` in this test's runfiles.
PYTHONPATH = os.pathsep.join(sys.path)

# A home directory shared by every merge subprocess, so that `uv`
# resolves `tomlkit` from the network once and from its cache after.
UV_HOME = tempfile.mkdtemp()


class MergeCodexConfigTest(unittest.TestCase):

    def setUp(self):
        self.home = tempfile.TemporaryDirectory()
        self.config = os.path.join(self.home.name, "config.toml")
        self.root = os.path.join(self.home.name, "plugin-root")
        # `merge_codex_config` runs the plugin's bundled `uv` shim at
        # `<root>/bin/uv`; the real `uv` stands in for it.
        bin_dir = os.path.join(self.root, "bin")
        os.makedirs(bin_dir)
        uv = shutil.which("uv")
        assert uv is not None, "`uv` must be on PATH to run this test"
        os.symlink(uv, os.path.join(bin_dir, "uv"))
        self.addCleanup(self.home.cleanup)

    def make_codex_stub(self, validating: bool) -> str:
        """Create a fake `codex` on disk and return its directory. A
        validating stub succeeds exactly when the config parses as
        TOML; a non-validating stub always fails, like a machine
        where `codex plugin list` does not work."""
        stub_dir = os.path.join(self.home.name, "bin")
        os.makedirs(stub_dir, exist_ok=True)
        stub = os.path.join(stub_dir, "codex")
        if validating:
            validator = os.path.join(self.home.name, "validate.py")
            with open(validator, "w") as f:
                f.write(
                    "import sys\n"
                    "import tomlkit\n"
                    "with open(sys.argv[1]) as f:\n"
                    "    tomlkit.parse(f.read())\n"
                )
            with open(stub, "w") as f:
                f.write(
                    "#!/bin/sh\n"
                    f"PYTHONPATH='{PYTHONPATH}' "
                    f"exec '{sys.executable}' '{validator}' "
                    f"'{self.config}'\n"
                )
        else:
            with open(stub, "w") as f:
                f.write("#!/bin/sh\nexit 1\n")
        os.chmod(stub, 0o755)
        return stub_dir

    def merge(
        self,
        initial: str,
        disable_sandbox: bool = True,
        validating_codex: bool = True,
    ) -> subprocess.CompletedProcess:
        """Write `initial` to config.toml and run `merge_codex_config`
        over it the way `install_codex` does."""
        with open(self.config, "w") as f:
            f.write(initial)
        stub_dir = self.make_codex_stub(validating_codex)
        return subprocess.run(
            [
                "bash",
                "-c",
                'source "$INSTALL_SH" && merge_codex_config "$@"',
                "bash",
                self.config,
                self.root,
                "true" if disable_sandbox else "false",
            ],
            env={
                "INSTALL_SH": INSTALL_SH,
                "PATH": f"{stub_dir}:{BASE_PATH}",
                "HOME": UV_HOME,
            },
            capture_output=True,
            text=True,
        )

    def merged(self) -> str:
        with open(self.config) as f:
            return f.read()

    def parsed(self) -> dict:
        """The merged config, parsed as TOML. Raises on a config that
        Codex would refuse to load."""
        return tomlkit.parse(self.merged()).unwrap()

    def expected_path(self) -> str:
        return f"{self.root}/bin:{self.home.name}/bin:{BASE_PATH}"

    def assert_plugin_settings(self, data: dict, sandbox: bool = True):
        self.assertIs(data["features"]["hooks"], True)
        self.assertEqual(
            data["shell_environment_policy"]["set"]["PATH"],
            self.expected_path(),
        )
        if sandbox:
            self.assertEqual(data["sandbox_mode"], "danger-full-access")

    def test_empty_config(self):
        result = self.merge("")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assert_plugin_settings(self.parsed())
        # Every key the installer sets is tagged for discoverability.
        self.assertIn("# reboot-plugin (managed)", self.merged())

    def test_existing_features_table(self):
        # A config with a `[features]` table, the shape that made a
        # prepended dotted `features.hooks` key a duplicate-key error
        # and Codex refuse to start.
        result = self.merge(
            'model = "gpt-5.1-codex"\n'
            "\n"
            "[features]\n"
            "web_search_request = true\n"
            "\n"
            '[projects."/Users/example/myapp"]\n'
            'trust_level = "trusted"\n'
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        data = self.parsed()
        self.assert_plugin_settings(data)
        self.assertEqual(
            data["features"],
            {
                "hooks": True,
                "web_search_request": True
            },
        )
        self.assertEqual(data["model"], "gpt-5.1-codex")
        self.assertEqual(
            data["projects"]["/Users/example/myapp"]["trust_level"],
            "trusted",
        )

    def test_existing_features_inline_table(self):
        # An inline `features` table gets extended in place.
        result = self.merge("features = { web_search_request = true }\n")
        self.assertEqual(result.returncode, 0, result.stderr)
        data = self.parsed()
        self.assert_plugin_settings(data)
        self.assertEqual(
            data["features"],
            {
                "hooks": True,
                "web_search_request": True
            },
        )

    def test_existing_shell_environment_policy_table(self):
        result = self.merge(
            "[shell_environment_policy]\n"
            'inherit = "all"\n'
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        data = self.parsed()
        self.assert_plugin_settings(data)
        self.assertEqual(data["shell_environment_policy"]["inherit"], "all")

    def test_existing_shell_environment_policy_set_table(self):
        result = self.merge(
            "[shell_environment_policy]\n"
            'inherit = "all"\n'
            "\n"
            "[shell_environment_policy.set]\n"
            'FOO = "bar"\n'
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        data = self.parsed()
        self.assert_plugin_settings(data)
        self.assertEqual(data["shell_environment_policy"]["set"]["FOO"], "bar")

    def test_user_assignments_of_managed_keys_are_replaced(self):
        result = self.merge(
            'sandbox_mode = "workspace-write"\n'
            "features.hooks = false\n"
            'model = "gpt-5.1-codex"\n'
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        data = self.parsed()
        self.assert_plugin_settings(data)
        self.assertEqual(data["model"], "gpt-5.1-codex")

    def test_sandbox_opt_out_preserves_user_sandbox_mode(self):
        result = self.merge(
            'sandbox_mode = "workspace-write"\n',
            disable_sandbox=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        data = self.parsed()
        self.assert_plugin_settings(data, sandbox=False)
        self.assertEqual(data["sandbox_mode"], "workspace-write")

    def test_rerun_is_idempotent(self):
        initial = (
            'model = "gpt-5.1-codex"\n'
            "\n"
            "[features]\n"
            "web_search_request = true\n"
        )
        result = self.merge(initial)
        self.assertEqual(result.returncode, 0, result.stderr)
        first = self.merged()
        result = self.merge(first)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.merged(), first)
        self.assert_plugin_settings(self.parsed())

    def test_old_region_format_is_upgraded(self):
        # The managed-region format written by earlier installer
        # versions, with a stale PATH bake from an old install root.
        result = self.merge(
            "# >>> reboot-plugin (managed) >>>\n"
            "features.hooks = true\n"
            'shell_environment_policy.set.PATH = "/OLD/ROOT/bin:/usr/bin"\n'
            "# Disabled because Codex sandbox breaks Python asyncio "
            "cross-thread\n"
            "# wakeup; see "
            "https://github.com/openai/codex/issues/24933.\n"
            'sandbox_mode = "danger-full-access"\n'
            "# <<< reboot-plugin (managed) <<<\n"
            "\n"
            'model = "gpt-5.1-codex"\n'
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        data = self.parsed()
        self.assert_plugin_settings(data)
        self.assertEqual(data["model"], "gpt-5.1-codex")
        self.assertNotIn("/OLD/ROOT", self.merged())
        self.assertNotIn(">>> reboot-plugin", self.merged())

    def test_unmergeable_config_is_restored(self):
        # `features` holding a non-table value cannot receive the
        # `hooks` key; the merge must fail and leave the config as it
        # was.
        initial = "features = 5\n"
        result = self.merge(initial)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.merged(), initial)
        self.assertIn("manually", result.stderr)

    def test_merge_without_working_codex(self):
        # When `codex plugin list` fails before the merge too, its
        # failure afterwards is meaningless; the merge must be kept.
        result = self.merge(
            'model = "gpt-5.1-codex"\n',
            validating_codex=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assert_plugin_settings(self.parsed())

    def test_executing_install_sh_runs_the_install(self):
        # The source-guard must still run the install on a direct
        # execution: with an empty PATH neither CLI is found, which
        # is the installer's "install an agent first" exit.
        bash = shutil.which("bash")
        assert bash is not None
        result = subprocess.run(
            [bash, INSTALL_SH],
            env={"PATH": ""},
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn(
            "Neither Claude Code nor Codex was found.", result.stderr
        )


if __name__ == "__main__":
    unittest.main()
