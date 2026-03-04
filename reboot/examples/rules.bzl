"""
Defines rules used for maintenance of Reboot's examples.
"""

load("@aspect_bazel_lib//lib:write_source_files.bzl", "write_source_files")
load("@rbt_pypi//:requirements.bzl", "requirement")
load("@rules_python//python:defs.bzl", "py_binary")

def write_templated_source_file(name, dest, src, input_yaml, diff_test = True):
    """
    Renders a Jinja2 template into a destination file.

    Args:
      name: Target name.
      dest: A relative file path to generate.
      src: A source label representing a Jinja2 file that should be templated.
      input_yaml: A source label pointing to a YAML file containing template inputs.
      diff_test: True to fail the build if the files do not match their generated content.
    """

    # Define the templater.
    py_binary(
        name = name + "_templater",
        srcs = [
            "//ci:templater.py",
        ],
        main = "//ci:templater.py",
        deps = [
            requirement("pyyaml"),
            "//reboot/templates:tools_py",
        ],
    )

    # Invoke it.
    native.genrule(
        name = name + "_templater_invoke",
        srcs = [
            src,
            input_yaml,
        ],
        tools = [
            ":" + name + "_templater",
        ],
        outs = [
            dest + "_templated",
        ],
        cmd_bash = """
        $(location :{name}_templater) $(location {dest}_templated) $(location {src}) $(location {input_yaml})
        """.format(name = name, dest = dest, src = src, input_yaml = input_yaml),
    )

    # And write out its outputs.
    #
    # When this package is consumed via a cross-repo label (i.e. using
    # `@com_github_reboot_dev_reboot`), we must export the destination file
    # to keep the source-file visibility check from failing in that context.
    native.exports_files(
        [dest],
        visibility = ["//visibility:public"],
    )

    write_source_files(
        name = name,
        files = {
            dest: ":" + name + "_templater_invoke",
        },
        diff_test = diff_test,
    )
