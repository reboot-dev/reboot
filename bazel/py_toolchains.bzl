"""Defines a local python toolchain for use in rules_python."""

load("@com_github_reboot_dev_pyprotoc_plugin//bazel:py_toolchains.bzl", pyprotoc_plugin_py_toolchains = "py_toolchains")
load("@rules_python//python:repositories.bzl", "py_repositories", "python_register_toolchains")

def py_toolchains():
    py_repositories()

    python_register_toolchains(
        name = "python3_10_12",
        python_version = "3.10.12",
    )

    pyprotoc_plugin_py_toolchains()
