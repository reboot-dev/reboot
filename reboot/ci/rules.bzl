"""
Defines rules for generating and validating CI workflow files from
Jinja2 templates.
"""

load("@aspect_bazel_lib//lib:write_source_files.bzl", "write_source_files")
load("@rbt_pypi//:requirements.bzl", "requirement")
load("@rules_python//python:defs.bzl", "py_binary")

def write_ci_template_source_file(name, templates):
    """Renders CI Jinja2 templates (using `<< >>` variable delimiters).

    Uses `<< >>` instead of `{{ }}` as the Jinja2 variable delimiter
    to avoid conflicts with GitHub Actions' `${{ }}` expression syntax.
    Block tags use the standard Jinja2 `{% %}` delimiters.

    Args:
      name: Target name (also the name of the `write_source_files` target).
      templates: Dict mapping destination path to [template, input_yaml].
    """

    py_binary(
        name = name + "_templater",
        srcs = [
            "//reboot/examples:templater.py",
        ],
        main = "//reboot/examples:templater.py",
        deps = [
            requirement("pyyaml"),
            "//reboot/templates:tools_py",
        ],
    )

    generated = {}
    i = 0
    for dest, src_and_yaml in templates.items():
        src = src_and_yaml[0]
        input_yaml = src_and_yaml[1]
        gen_name = name + "_genrule_" + str(i)
        gen_out = name + "_generated_" + str(i)
        native.genrule(
            name = gen_name,
            srcs = [src, input_yaml],
            tools = [":" + name + "_templater"],
            outs = [gen_out],
            cmd_bash = (
                "$(location :{name}_templater) $@ " +
                "$(location {src}) " +
                "$(location {input_yaml}) ci"
            ).format(
                name = name,
                src = src,
                input_yaml = input_yaml,
            ),
        )
        native.exports_files(
            [dest],
            visibility = ["//visibility:public"],
        )
        generated[dest] = ":" + gen_name
        i += 1

    write_source_files(
        name = name,
        files = generated,
        diff_test = True,
    )
