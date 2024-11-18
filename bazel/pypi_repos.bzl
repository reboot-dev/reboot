"""Defines local PyPI-based repositories. Their deps
should be installed later in WORKSPACE file to be accessible."""

load("@com_github_reboot_dev_pyprotoc_plugin//bazel:pypi_repos.bzl", pyprotoc_plugin_pypi_repos = "pypi_repos")
load("@python3_10_12//:defs.bzl", "interpreter")
load("@rules_python//python:pip.bzl", "pip_parse")

def pypi_repos():
    """Defines local PyPI-based repositories."""
    pip_parse(
        name = "mypy_integration_pip_deps",
        python_interpreter_target = interpreter,
        requirements_lock = "//:mypy-requirements_lock.txt",
    )

    pyprotoc_plugin_pypi_repos()

    pip_parse(
        name = "rbt_pypi",
        python_interpreter_target = interpreter,
        requirements_lock = "//reboot:requirements_lock.txt",
    )
