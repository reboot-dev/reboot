"""
Custom rules for building reboot JS tests.
"""

load("@aspect_rules_js//js:defs.bzl", "js_test")

_REBOOT_DEV_WHL = "@com_github_reboot_dev_reboot//reboot:reboot.dev"

def js_reboot_test(name, data, entry_point, visibility, size = "medium", env = {}, tags = []):
    """
    This macro ensures that PYTHONPATH is correctly set when calling JS Reboot binaries.

    Args:
        name: target name.
        data: TS and PY target dependencies.
        entry_point: name of entry point file.
        visibility: bazel visiility.
        size: bazel size.
        env: additional environment variables to set on the test.
        tags: bazel tags.
    """

    # TODO: This `sh_library` is a necessary indirection until Bazel 6, because a `sh_binary`
    # does not actually force a `data` attribute to build, but a `sh_library` does. We can
    # remove the indirection once we upgrade. See https://github.com/bazelbuild/bazel/issues/12348
    native.sh_library(
        name = "_" + name + "_test_packages",
        data = [
            _REBOOT_DEV_WHL,
        ],
        tags = tags,
    )

    additional_env = {"REBOOT_WHL_FILE": "$(rootpath " + _REBOOT_DEV_WHL + ")"}

    # Dictionary concatenation using the only available operator (`+`) is
    # deprecated and emits a warning in Bazel 5.4.1, so we have to do it
    # manually... :(
    env = dict(env)  # Make immutable dict mutable.
    env.update(additional_env.items())

    js_test(
        name = name,
        data = data + [
            "//:node_modules/@reboot-dev/reboot",
            _REBOOT_DEV_WHL,
            ":_" + name + "_test_packages",
        ],
        node_options = [
            "--test",
            "--trace-warnings",
        ],
        entry_point = entry_point,
        tags = tags,
        env = env,
        size = size,
        visibility = visibility,
    )
