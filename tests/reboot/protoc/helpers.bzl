"""
Helpers that aid in testing various features of our protoc plugins.
"""

load("@aspect_rules_esbuild//esbuild:defs.bzl", "esbuild")
load("@aspect_rules_ts//ts:defs.bzl", "ts_project")
load("@com_google_protobuf//bazel:proto_library.bzl", "proto_library")
load("@rules_python//python:defs.bzl", "py_library", "py_test")
load("//bazel:proto_descriptor_set.bzl", "proto_descriptor_set")
load(
    "//reboot:rules.bzl",
    "js_proto_library",
    "js_reboot_library",
    "js_reboot_react_library",
    "py_reboot_library",
)
load("//reboot/nodejs:rules.bzl", "js_reboot_test")
load("//tests/reboot/react:py_web_test_suite_env.bzl", "py_web_test_suite_env")

def _template_impl(ctx):
    ctx.actions.expand_template(
        template = ctx.file.template_file,
        output = ctx.outputs.output_file,
        substitutions = ctx.attr.substitutions,
    )

_template = rule(
    implementation = _template_impl,
    attrs = {
        "output_file": attr.output(mandatory = True),
        "substitutions": attr.string_dict(mandatory = True),
        "template_file": attr.label(
            allow_single_file = True,
        ),
    },
)

def success_echo_test(
        name,
        deps = [],
        tags = [],
        reply_client_rbt_module = None,
        last_message_client_rbt_module = None):
    """
    Checks that a proto with the given name contains a working Echo state type.

    Args:
      name: the name of the proto file that contains the Echo state type, without the ".proto".
      deps: list of `reboot_libraries_for_proto` targets that the proto named by `name` depends on.
      tags: list of tags to propagate to testing targets.
      reply_client_rbt_module: name of the module to use as the client for `Echo.Reply()`.
      last_message_client_rbt_module: name of the module to use as the client for `Echo.LastMessage()`.
    """
    proto = name + ".proto"

    proto_deps = [dep + "_proto" for dep in deps]
    py_deps = [dep + "_py_reboot" for dep in deps]
    js_deps = [dep + "_js_reboot" for dep in deps]
    react_deps = [dep + "_js_reboot_react" for dep in deps]

    reboot_libraries_for_proto(
        proto = proto,
        proto_deps = proto_deps,
        py_deps = py_deps,
        js_deps = js_deps,
        react_deps = react_deps,
    )

    echo_state_rbt_module = "tests.reboot.protoc." + name + "_rbt"
    reply_client_rbt_module = reply_client_rbt_module or echo_state_rbt_module
    last_message_client_rbt_module = last_message_client_rbt_module or echo_state_rbt_module

    py_test(
        name = name + "_test_py",
        srcs = [":echo_test.py"],
        main = "echo_test.py",
        size = "medium",
        args = [
            "--echo_state_rbt_module=" + echo_state_rbt_module,
            "--reply_client_rbt_module=" + reply_client_rbt_module,
            "--last_message_client_rbt_module=" + last_message_client_rbt_module,
        ],
        tags = tags + ["py"],
        deps = [
            ":" + name + "_py_reboot",
            "//reboot/aio:tests_py",
            "//tests/reboot/protoc:shared_py_proto",
        ],
    )

    def module_to_js_path(module):
        return "../../../" + module.replace(".", "/") + ".js"

    js_reboot_test(
        name = name + "_test_ts",
        data = [
            ":test_ts",
            ":" + name + "_js_reboot",
        ],
        size = "medium",
        env = {
            "ECHO_STATE_RBT_MODULE_PATH": module_to_js_path(echo_state_rbt_module),
            "LAST_MESSAGE_CLIENT_RBT_MODULE_PATH": module_to_js_path(last_message_client_rbt_module),
            "REPLY_CLIENT_RBT_MODULE_PATH": module_to_js_path(reply_client_rbt_module),
        },
        tags = tags + ["js", "ts"],
        entry_point = "test.js",
        visibility = ["//visibility:public"],
    )

    ### React tests.

    _template(
        name = name + "_react_test_generated_main",
        template_file = ":main.py.template",
        output_file = name + "_react_test_generated_main.py",
        substitutions = {
            "{BUNDLE_JS_FILENAME}": name + "_bundle.js",
            "{ECHO_STATE_RBT_MODULE}": echo_state_rbt_module,
        },
    )

    _template(
        name = name,
        template_file = ":index.tsx.template",
        output_file = name + "_index.tsx",
        substitutions = {
            "{REACT_RBT_MODULE}": name + "_rbt_react",
        },
    )

    ts_project(
        name = name + "_index_ts",
        srcs = [
            name + "_index.tsx",
        ],
        tsconfig = ":tsconfig",
        deps = [
            ":" + name + "_js_reboot_react",
            "//tests/reboot/protoc:shared_js_proto",
            "//:node_modules/@reboot-dev/reboot-react",
            "//:node_modules/react",
            "//:node_modules/react-dom",
            "//rbt/v1alpha1:tasks_js_proto",
        ],
    )

    esbuild(
        name = name + "_bundle",
        srcs = [
            ":" + name + "_index_ts",
        ],
        entry_point = name + "_index.js",
        format = "esm",
        platform = "browser",
    )

    py_library(
        name = name + "_test_against_local_envoy_py",
        testonly = True,
        srcs = ["test_against_local_envoy.py"],
        data = [":" + name + "_bundle"],
        deps = [
            "//tests/reboot/protoc:shared_py_proto",
            "//reboot/aio:external_py",
            "//tests/reboot/react:web_driver_runner",
            "//tests/reboot/react:test_against_local_envoy_py",
        ],
    )

    py_web_test_suite_env(
        name = name + "_test_react",
        srcs = [
            name + "_react_test_generated_main.py",
            "test_against_local_envoy.py",
        ],
        browsers = [
            "@io_bazel_rules_webtesting//browsers:chromium-local",
        ],
        main = name + "_react_test_generated_main.py",
        py_test_tags = [
            "requires-docker",
            "requires-linux-x86",
        ],
        tags = tags + [
            "requires-linux-x86",
            "requires-docker",
            "react",
        ],
        size = "medium",
        deps = [
            ":" + name + "_py_reboot",
            ":" + name + "_test_against_local_envoy_py",
        ],
    )

def failure_test(name, expected_error):
    """
    Checks that a proto with the given name fails to pass our checks.

    Args:
      name: the name of the proto file that contains the error, not including the ".proto".
      expected_error: the error message that's expected to be generated
    """
    proto = name + ".proto"

    proto_library(
        name = name + "_proto",
        srcs = [
            proto,
        ],
        deps = [
            "//tests/reboot/protoc:shared_proto",
            "//rbt/v1alpha1:options_proto",
        ],
    )

    proto_descriptor_set(
        name = name + "_descriptor_set",
        deps = [
            ":" + name + "_proto",
        ],
    )

    py_test(
        name = name + "_test_py",
        srcs = [":failure_test.py"],
        main = "failure_test.py",
        args = [
            # descriptor_set_file=...
            "tests/reboot/protoc/" + name + "_descriptor_set.pb",
            # expected_error=...
            "\"" + expected_error + "\"",
        ],
        data = [
            ":" + name + "_descriptor_set",
        ],
        deps = [
            "//reboot/aio:tests_py",
            "//reboot:protoc_gen_reboot_python_py",
            "//tests/reboot/protoc:shared_py_proto",
        ],
    )

def reboot_libraries_for_proto(
        proto,
        name = None,
        proto_deps = [],
        py_deps = [],
        js_deps = [],
        react_deps = []):
    """
    Collects all of the language-dependent Reboot libraries for a given proto.

    Args:
        proto: the filename of the proto.
        name: shouldn't be passed, specified only to pass the
            `buildifier` check.
        proto_deps: additional deps for Proto library.
        py_deps: additional deps for Python library.
        js_deps: additional deps for JS library.
        react_deps: additional deps for React library.
    """
    if name != None:
        fail("Don't pass `name` to `reboot_libraries_for_proto`.")
    name = proto.removesuffix(".proto")
    proto_library(
        name = name + "_proto",
        srcs = [proto],
        visibility = ["//visibility:public"],
        deps = [
            "//tests/reboot/protoc:shared_proto",
            "//rbt/v1alpha1:options_proto",
        ] + proto_deps,
    )

    py_reboot_library(
        name = name + "_py_reboot",
        proto = proto,
        proto_library = ":" + name + "_proto",
        visibility = ["//visibility:public"],
        py_deps = py_deps,
    )

    js_proto_library(
        name = name + "_js_proto",
        package_json = ":package.json",
        proto = ":" + name + ".proto",
        proto_deps = [
            ":" + name + "_proto",
            # ISSUE(https://github.com/reboot-dev/mono/issues/3218): Until we can
            # use `create_protoc_plugin_rule` we need to repeat the dependencies of
            # the `proto_libraries` here.
            "//tests/reboot/protoc:shared_proto",
            "//rbt/v1alpha1:options_proto",
            "@com_google_protobuf//:descriptor_proto",
        ] + proto_deps,
        visibility = ["//visibility:public"],
    )

    js_reboot_library(
        name = name + "_js_reboot",
        srcs = [":" + name + "_proto"],
        proto = proto,
        visibility = ["//visibility:public"],
        deps = [
            ":" + name + "_js_proto",
            "//tests/reboot/protoc:shared_js_reboot",
        ] + js_deps,
    )

    js_reboot_react_library(
        name = name + "_js_reboot_react",
        srcs = [":" + name + "_js_proto"],
        proto = name + ".proto",
        proto_deps = [
            ":" + name + "_proto",
            "//tests/reboot/protoc:shared_proto",
        ],
        visibility = ["//tests:__subpackages__"],
        deps = [
            "//tests/reboot/protoc:shared_js_proto",
        ] + react_deps,
    )
