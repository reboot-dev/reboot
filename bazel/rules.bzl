"""
Reboot-built Bazel rules and macros to help us work with, especially,
generated code.
"""

load("@bazel_skylib//rules:run_binary.bzl", "run_binary")
load("@rules_python//python:defs.bzl", "py_binary")

def py_generated_file(name, main, outfile, srcs = None, deps = None, data = None, visibility = None):
    """Produce the `outfile` by running `main`.

    This macro produces a target with the given `name` that will invoke the
    Python file given as `main` to generate the given `outfile`.

    Args:
        name: the name of the target that will be created.
        main: the name of the Python file that will be invoked.
        outfile: the name of the file that will be generated.
        srcs: as in `py_binary`.
        deps: as in `py_binary`.
        data: as in `py_binary`.
        visibility: as in `py_binary`.
    """
    if srcs == None:
        srcs = [main]

    # This macro works in two steps:
    # 1. It defines a private `py_binary` target that, when invoked, runs the
    #    user's supplied `main`.
    # 2. It defines the primary (public) target that, when invoked as a build
    #    target, invokes the `py_binary` from step 1 and declares the expected
    #    output of that binary.
    py_binary(
        name = name + "-generator",
        main = main,
        srcs = srcs,
        deps = deps,
        data = data,
        # For reasons discovered in
        # https://github.com/reboot-dev/mono/issues/1545 (TL;DR: Python
        # namespace packages) it is very important that we do not create empty
        # `__init__.py` files in our output directories; this would cause
        # namespace packages (e.g. protobuf/grpc generated code) to break. The
        # global flag set in https://github.com/reboot-dev/mono/pull/1593
        # seems to not apply to `run_binary`, so we set the necessary flag here.
        legacy_create_init = False,
        visibility = ["//visibility:private"],
    )
    run_binary(
        name = name,
        outs = [outfile],
        args = [
            "$(location " + outfile + ")",
        ],
        tool = ":" + name + "-generator",
        visibility = visibility,
    )
