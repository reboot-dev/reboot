"""Creates a custom rule for exposing the workspace directory root path to a
py_test.
"""

load("@rules_python//python:defs.bzl", "py_test")

def _write_workspace_dir_impl(ctx):
    src = ctx.files._src[0]
    out = ctx.actions.declare_file(ctx.label.name)
    ctx.actions.run_shell(
        inputs = ctx.files._src,
        outputs = [out],
        # Use `readlink` to find the absolute path of the BUILD.bazel where this
        # rule is defined.
        # Then, subtract the short path, i.e. the path relative to the workspace
        # dir, from the full path to isolate just the workspace dir.
        # Finally, set that to a python constant.
        command = """
          absolute_path="$(readlink -f -- "{src_path}")"
          echo "WORKSPACE_DIR = '${{absolute_path%/{src_short_path}}}'" >> {out_path}
        """.format(
            src_path = src.path,
            src_short_path = src.short_path,
            out_path = out.path,
        ),
        execution_requirements = {
            "local": "1",
            "no-remote": "1",
            "no-sandbox": "1",
        },
    )
    return [DefaultInfo(files = depset([out]))]

_write_workspace_dir = rule(
    implementation = _write_workspace_dir_impl,
    attrs = {
        "_src": attr.label(allow_files = True, default = "BUILD.bazel"),
    },
    doc = "Writes the absolute path of the current workspace dir to a file.",
)

def py_test_with_workspace_dir(
        name,
        main,
        tags = [],
        srcs = [],
        data = [],
        deps = [],
        visibility = None,
        workspace_dir_py_file_name = "workspace_dir.py"):
    # Helper macro that allows a test runner to import the workspace directory
    # root path from a file called [workspace_dir_py_file_name].
    _write_workspace_dir(name = workspace_dir_py_file_name)

    py_test(
        name = name,
        srcs = srcs + [workspace_dir_py_file_name],
        data = data,
        deps = deps,
        visibility = visibility,
        main = main,
        tags = tags + [
            # Force test to be executed unconditionally. Cached results
            # may be old since this test tests things on the filesystem
            # that aren't expressable as a Bazel dependency.
            "external",
        ],
    )
