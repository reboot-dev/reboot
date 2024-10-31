"""
Creates a custom rule for ingesting proto information from pyprotoc_plugin.
"""

load("@aspect_bazel_lib//lib:write_source_files.bzl", "write_source_files")
load("@aspect_rules_js//js:defs.bzl", "js_library")
load("@aspect_rules_ts//ts:defs.bzl", "ts_project")
load("@com_github_grpc_grpc//bazel:python_rules.bzl", "py_grpc_library", "py_proto_library")
load("@com_github_reboot_dev_pyprotoc_plugin//:rules.bzl", "create_protoc_plugin_rule")
load("@com_github_reboot_dev_reboot//reboot:versions.bzl", "REBOOT_VERSION")
load("@rbt_pypi//:requirements.bzl", "requirement")
load("@rules_python//python:defs.bzl", "py_library")

def _wrapped_pyi_impl(ctx):
    # This rule returns `PyInfo` for all `pyi` files in `deps`.

    pyi_files = []

    # Collect .pyi files from the mypy_files target.
    for dep in ctx.attr.deps:
        if hasattr(dep, "files"):
            pyi_files += [f for f in dep.files.to_list() if f.path.endswith(".pyi")]

    # Provide PyInfo with the .pyi files as the sources.
    py_info = PyInfo(
        transitive_sources = depset(pyi_files),
    )

    return [DefaultInfo(files = depset(pyi_files)), py_info]

# The generated pyi files created by `_mypy_files` do not have any file type
# information attached to them. In order to be able to use the pyi files in a
# `py_library`, we must first wrap the pyi files in a `PyInfo` object. This has
# to happen through a seperate rule.
wrapped_pyi = rule(
    implementation = _wrapped_pyi_impl,
    attrs = {
        "deps": attr.label_list(
            allow_files = True,
            mandatory = True,
        ),
    },
)

_py_reboot_files = create_protoc_plugin_rule(
    "@com_github_reboot_dev_respect//reboot:protoc-gen-reboot_python",
    extensions = ("_rbt.py",),
)

_mypy_files = create_protoc_plugin_rule(
    "@com_github_reboot_dev_respect//reboot:protoc-gen-mypy",
    extensions = ("_pb2.pyi",),
)

def py_proto_with_grpc_library_typed(
        name,
        proto,
        deps = [],
        visibility = None):
    """Helper for generating better proto libraries.

    Args:
        name: target name.
        proto: '.proto' file.
        deps: `proto_library` dependencies.
        visibility: bazel visibility.
    """

    py_proto_library(
        name = name + "_pb2_py",
        deps = deps,
    )

    _mypy_files(
        name = name + "_pb2_pyi_files",
        srcs = [proto],
        deps = deps,
    )

    wrapped_pyi(
        name = name + "_pb2_pyi",
        deps = [":" + name + "_pb2_pyi_files"],
        visibility = visibility,
    )

    py_grpc_library(
        name = name + "_pb2_grpc_py",
        srcs = deps,
        deps = [
            ":" + name + "_pb2_py",
        ],
    )

    py_library(
        name = name,
        visibility = visibility,
        srcs = [],
        deps = [
            ":" + name + "_pb2_py",
            ":" + name + "_pb2_grpc_py",
        ],
        data = [
            ":" + name + "_pb2_pyi",
        ],
    )

def py_reboot_library(
        name,
        proto,
        deps,
        visibility = None):
    """
    Helper macro for invoking 'protoc' using the 'protoc-gen-reboot_python' plugin.
    """
    _py_reboot_files(
        name = name + "_files",
        srcs = [proto],
        deps = deps,
    )

    py_proto_with_grpc_library_typed(
        name = name + "_library",
        proto = proto,
        deps = deps,
        visibility = visibility,
    )

    py_library(
        name = name,
        srcs = [":" + name + "_files"],
        visibility = visibility,
        # We should add user defined deps after the 'grpcio' requirement, to
        # make sure 'grpcio' path will be before any other dependency on a
        # PYTHONPATH, while generating a bootstrap python for the 'py_binary'.
        # We had an issue about using two versions of the 'cygrpc.so' which
        # are coming from 'grpcio' and the 'com_github_grpc_grpc' repo.
        # See https://github.com/reboot-dev/respect/issues/2347
        # TODO: Make this match the imports in reboot.py.j2.
        deps = [
            requirement("grpcio"),
            requirement("grpcio-status"),
            requirement("googleapis-common-protos"),
            requirement("protobuf"),
            "@com_github_reboot_dev_reboot//backoff:python",
            "@com_github_reboot_dev_reboot//reboot:log_py",
            "//reboot/aio:call_py",
            "//reboot/aio:contexts_py",
            "//reboot/aio:headers_py",
            "//reboot/aio:idempotency_py",
            "//reboot/aio:placement_py",
            "//reboot/aio:servicers_py",
            "//reboot/aio:state_managers_py",
            "//reboot/aio:stubs_py",
            "//reboot/aio:tasks_py",
            "//reboot/aio:types_py",
            "//reboot/aio:external_py",
            ":" + name + "_library",
        ],
    )

_ts_reboot_react_files = create_protoc_plugin_rule(
    "@com_github_reboot_dev_respect//reboot:protoc-gen-reboot_react",
    extensions = ("_rbt_react.ts",),
)

def js_reboot_react_library(
        name,
        proto,
        srcs = [],
        proto_deps = [],
        deps = [],
        declaration = True,
        visibility = None):
    """
    Macro that wraps the necessary '_ts_reboot_react_files', and 'ts_project' targets.
    """
    _ts_reboot_react_files(
        name = name + "_ts_reboot_react_files",
        srcs = [proto],
        deps = proto_deps,
    )

    ts_project(
        name = name,
        srcs = srcs + [
            ":" + name + "_ts_reboot_react_files",
        ],
        declaration = declaration,
        tsconfig = {
            "compilerOptions": {
                "declaration": True,
                "module": "es2015",
                "moduleResolution": "node",
                "target": "es2018",
            },
        },
        deps = deps + [
            "//:node_modules/react",
            "//:node_modules/react-dom",
            "//:node_modules/uuid",
            "//:node_modules/@bufbuild/protobuf",
            "//:node_modules/@reboot-dev/reboot-react",
            "//:node_modules/@reboot-dev/reboot-api",
        ],
        visibility = visibility,
    )

_ts_reboot_files = create_protoc_plugin_rule(
    "@com_github_reboot_dev_respect//reboot:protoc-gen-reboot_nodejs",
    extensions = ("_rbt.ts",),
)

def js_reboot_library(
        name,
        proto,
        srcs = [],
        deps = [],
        declaration = True,
        visibility = None):
    """
    Macro that wraps the necessary '_ts_reboot_files', and 'ts_project' targets.
    """
    _ts_reboot_files(
        name = name + "_ts_reboot_files",
        srcs = [proto],
        deps = srcs,
    )

    ts_project(
        name = name,
        srcs = srcs + [
            ":" + name + "_ts_reboot_files",
        ],
        declaration = declaration,
        tsconfig = {
            "compilerOptions": {
                "declaration": True,
                "module": "nodenext",
                "moduleResolution": "nodenext",
                "target": "es2020",
            },
        },
        deps = deps + [
            "//:node_modules/@bufbuild/protobuf",
            "//:node_modules/@reboot-dev/reboot",
            "//:node_modules/@reboot-dev/reboot-api",
            "//:node_modules/@types/node",
            "//:node_modules/@types/uuid",
            "//:node_modules/uuid",
        ],
        visibility = visibility,
    )

def _isolate_filegroup_to_directory_impl(ctx):
    outdir = ctx.actions.declare_directory("{}.dir".format(ctx.attr.name))
    args = ctx.actions.args()
    args.add(outdir.path)
    for src in ctx.files.srcs:
        args.add(src.path + " " + src.short_path)
    ctx.actions.run_shell(
        outputs = [outdir],
        inputs = ctx.files.srcs,
        arguments = [args],
        command = """
outdir="$1";
shift;
for file_tuple in "$@"; do
  read -r file short_path  <<< "$file_tuple"
  dest_path="${outdir}/${short_path}"
  mkdir -p "$(dirname "${dest_path}")"
  cp "${file}" "${dest_path}"
done
                """,
    )
    return [
        DefaultInfo(files = depset([outdir])),
    ]

_isolate_filegroup_to_directory = rule(
    _isolate_filegroup_to_directory_impl,
    attrs = {
        "srcs": attr.label_list(
            allow_files = True,
            mandatory = True,
        ),
    },
)

def _js_proto_files(
        name,
        proto,
        proto_deps = [],
        visibility = None):
    """
    Helper macro for invoking 'protoc' using the 'protoc-gen-es' plugin.
    """
    if proto.startswith("//") or not proto.endswith(".proto"):
        fail(
            "Expecting '.proto' file in the current directory " +
            "for 'proto = ' (without a using absolute path '//' prefix)",
        )

    if proto.startswith(":"):
        proto = proto.lstrip(":")

    proto_pb_js = proto[:-6] + "_pb.js"
    proto_pb_d_ts = proto[:-6] + "_pb.d.ts"

    descriptor_set_in = ""

    if len(proto_deps) > 0:
        descriptor_set_in = "--descriptor_set_in=" + "$(locations {})".format(
            proto_deps[0],
        )

    for proto_dep in proto_deps[1:]:
        descriptor_set_in += ":" + "$(locations {})".format(proto_dep)

    native.genrule(
        name = name,
        srcs = [proto] + proto_deps + [
            "@com_github_reboot_dev_reboot//:node_modules/@bufbuild/protobuf",
            "@com_github_reboot_dev_reboot//:node_modules/@bufbuild/protoplugin",
            "@com_github_reboot_dev_reboot//:node_modules/@typescript/vfs",
            "@com_github_reboot_dev_reboot//:node_modules/typescript",
        ],
        outs = [
            proto_pb_js,
            proto_pb_d_ts,
        ],
        # NOTE NOTE NOTE: we are generating `.d.ts` and `.js` files
        # here even though when someone does `rbt protoc` they'll just
        # get `.ts`. We could consider passing `--es_target=ts` below
        # and then wrapping all of this in a `ts_project(...)`
        # instead.
        #
        # NOTE NOTE NOTE: when this rule is invoked from a different repo than
        # where it is defined, the `$(location {proto})` will resolve to a path
        # prefixed by `external/name_of_the_repo_this_rule_is_used_in/` - for
        # example `external/foo/path/to/my.proto`. The descriptor set (and
        # therefore the `protoc` compiler) knows the file as simply
        # `path/to/my.proto`, so this prefix must be removed, if present.
        cmd_bash = """
            proto_path=$(location {proto})
            if [[ "$$proto_path" == external/* ]]; then
              # Remove any `external/[...]/` prefixes. See comment above for why
              # this is necessary.
              proto_path=$$(echo $$proto_path | sed 's|external/[^/]*/\\(.*\\)|\\1|')
            fi

            node_binary_path=$(execpath @node//:node)
            PATH=$$PATH:$$(dirname "$$node_binary_path"):$(locations @com_github_reboot_dev_reboot//:node_modules/@bufbuild/protoc-gen-es)/bin NODE_PATH=$$(dirname $$(dirname $(locations @com_github_reboot_dev_reboot//:node_modules/@bufbuild/protobuf))) $(locations @com_google_protobuf//:protoc) \
              --plugin=protoc-gen-es=$(execpath @com_github_reboot_dev_reboot//reboot:protoc-gen-es_with_deps) \
              --es_out=. \
              {descriptor_set_in} \
              $$proto_path
            cp {package_name}/*.js $$(dirname $(locations {proto_pb_js}))
            cp {package_name}/*.d.ts $$(dirname $(locations {proto_pb_d_ts}))
        """.format(
            descriptor_set_in = descriptor_set_in,
            proto = proto,
            package_name = native.package_name(),
            proto_pb_js = proto_pb_js,
            proto_pb_d_ts = proto_pb_d_ts,
        ),
        tools = [
            "@com_github_reboot_dev_reboot//reboot:protoc-gen-es_with_deps",
            "@com_google_protobuf//:protoc",
            "@com_github_reboot_dev_reboot//:node_modules/@bufbuild/protoc-gen-es",
            "@node//:node",
        ],
        visibility = visibility,
    )

def js_proto_library(
        name,
        proto,
        package_json,
        proto_deps = [],
        js_deps = [],
        visibility = None):
    """
    Macro that wraps the necessary '_js_proto_files' and 'js_library' targets.

    Use this macro if you _only_ want the 'protoc-gen-es' generated
    code. If you need 'protoc-gen-reboot_react' output use
    'js_reboot_react_library'.

    Args:
        name: target name.
        proto: '.proto' file.
        proto_deps: proto dependencies.
        js_deps: JavaScript dependencies.
        package_json: package.json to include as a src "asset".
        visibility: bazel visiility.
    """
    _js_proto_files(
        name = name + "_js_proto_files",
        proto = proto,
        proto_deps = proto_deps,
    )

    srcs = [":" + name + "_js_proto_files"]

    if package_json != None:
        srcs.append(package_json)

    native.filegroup(
        name = name + ".files",
        srcs = srcs,
        visibility = visibility,
    )

    js_library(
        name = name,
        srcs = srcs,
        declarations = srcs,
        deps = js_deps + [
            "//:node_modules/@bufbuild/protobuf",
        ],
        visibility = visibility,
    )

def write_merged_source_files(name, write_path, srcs = None, output_groups = [""], diff_test = True):
    """
    Writes a series of input target srcs into a merged output directory.

    Args:
      name: Target name.
      write_path: The output directory to write all sources to.
      srcs: Source labels that should be written.
      output_groups: The output groups of the `srcs` that should be included.
      diff_test: True to fail the build if the files do not exist.
    """

    # Collect all of the relevant output groups from the sources.
    output_group_srcs = []
    for output_group in output_groups:
        group_name = name + "_inputs_" + output_group
        native.filegroup(
            name = group_name,
            srcs = srcs,
            output_group = output_group,
        )
        output_group_srcs.append(":" + group_name)

    # Then copy them into a single directory.
    _isolate_filegroup_to_directory(
        name = name + "_inputs",
        srcs = output_group_srcs,
    )

    # And write out that directory.
    write_source_files(
        name = name,
        files = {
            write_path: ":" + name + "_inputs",
        },
        diff_test = diff_test,
    )

_py_boilerplate_reboot_files = create_protoc_plugin_rule(
    "@com_github_reboot_dev_respect//reboot:protoc-gen-reboot_python_boilerplate",
    extensions = ("_servicer.py",),
)

def py_boilerplate_reboot_library(
        name,
        proto,
        deps,
        visibility = None):
    """
    Helper macro for invoking 'protoc' using the 'protoc-gen-reboot_python' plugin.
    """
    _py_boilerplate_reboot_files(
        name = name + "_py_boilerplate_reboot_files",
        srcs = [proto],
        deps = deps,
    )

    py_reboot_library(
        name = name + "_py_reboot",
        proto = proto,
        deps = deps,
        visibility = visibility,
    )

    py_library(
        name = name,
        srcs = [":" + name + "_py_boilerplate_reboot_files"],
        visibility = visibility,
        deps = [
            ":" + name + "_py_reboot",
        ],
    )

_ts_boilerplate_reboot_files = create_protoc_plugin_rule(
    "@com_github_reboot_dev_respect//reboot:protoc-gen-reboot_nodejs_boilerplate",
    extensions = ("_servicer.ts",),
)

def ts_reboot_boilerplate_files(
        name,
        proto,
        deps,
        visibility = None):
    """
    Helper macro for invoking 'protoc' using the 'protoc-gen-reboot_nodejs_boilerplate' plugin.
    """
    _ts_boilerplate_reboot_files(
        name = name + "_ts_boilerplate_reboot_files",
        srcs = [proto],
        deps = deps,
    )

    native.filegroup(
        name = name,
        srcs = [":" + name + "_ts_boilerplate_reboot_files"],
        visibility = visibility,
    )

def generate_version_py(name):
    # Creates a custom rule for generating a version.py file,
    # which contains the version of the Reboot library.
    native.genrule(
        name = name,
        outs = ["version.py"],
        cmd = "echo 'REBOOT_VERSION = \"{version}\"' > $@".format(version = REBOOT_VERSION),
        visibility = ["//visibility:public"],
    )

def generate_version_ts(name):
    # Creates a custom rule for generating a version.js file,
    # which contains the version of the Reboot library.
    native.genrule(
        name = name,
        outs = ["version.ts"],
        cmd = "echo 'export const REBOOT_VERSION = \"{version}\"' > $@".format(version = REBOOT_VERSION),
        visibility = ["//visibility:public"],
    )