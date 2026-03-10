"""Custom Python gRPC generation helpers for Envoy discovery protos.

Why this file exists:

When the top-level Bazel workspace builds a target in `public/` through
`@com_github_reboot_dev_reboot//...`, grpc's stock `py_grpc_library` stages
proto files under the external repo path, for example:

  external/com_github_reboot_dev_reboot/envoy/service/discovery/v3/ads.proto

At the same time, imports are resolved from `@buf_deps_envoy`, which uses the
canonical import path root:

  envoy/service/discovery/v3/discovery.proto

This can cause protoc to treat the same schema as two different files
(`external/.../discovery.proto` vs `envoy/.../discovery.proto`), producing
duplicate symbol errors.

This helper avoids that by:
1) generating gRPC stubs from only the requested direct proto(s) (for this
   package, `ads.proto`), and
2) passing canonical `@buf_deps_envoy` file paths directly to protoc instead of
   staging a copy under `external/com_github_reboot_dev_reboot/...`.

Result: imports resolve under one canonical root in both local and external
workspace builds, and duplicate-definition conflicts are avoided.
"""

load("@com_github_grpc_grpc//bazel:protobuf.bzl", "declare_out_files", "get_include_directory", "get_out_dir", "get_plugin_args", "get_proto_arguments", "includes_from_deps")
load("@rules_proto//proto:defs.bzl", "ProtoInfo")
load("@rules_python//python:py_info.bzl", "PyInfo")

_GENERATED_GRPC_PROTO_FORMAT = "{}_pb2_grpc.py"

def _merge_pyinfos(pyinfos):
    # Mirror grpc's py rule behavior: merge transitive source/import providers
    # so downstream python targets see generated stubs and runtime deps.
    return PyInfo(
        transitive_sources = depset(transitive = [p.transitive_sources for p in pyinfos]),
        imports = depset(transitive = [p.imports for p in pyinfos]),
    )

def _generate_filtered_pb2_grpc_src_impl(ctx):
    # Keep parity with grpc's own rule shape: exactly one proto_library input.
    if len(ctx.attr.srcs) != 1:
        fail("Can only compile a single proto_library target at a time.")

    # Select only the direct source protos requested by the caller.
    #
    # Important: we intentionally keep each selected File object as-is (its
    # canonical path in @buf_deps_envoy). We do NOT stage/copy it into the
    # current workspace path, because that is what creates mixed-path identity
    # issues in external-repo builds.
    wanted = {name: True for name in ctx.attr.proto_filenames}
    protos = []
    for file in ctx.attr.srcs[0][ProtoInfo].direct_sources:
        if file.basename in wanted:
            # Keep the canonical external path (e.g. external/buf_deps_envoy/...)
            # so protoc resolves imports under a single root in both local and
            # external-repo builds.
            protos.append(file)

    # Fail fast with a clear message if configuration and proto_library content
    # drift apart.
    if not protos:
        fail("No matching proto files found in srcs for %s" % ctx.label)

    # Include dirs come from the proto library's transitive imports, same as the
    # grpc upstream rule.
    includes = includes_from_deps(ctx.attr.srcs)

    # Output file declaration and plugin wiring mirror grpc's upstream python
    # rule so generated filenames/layout are unchanged for consumers.
    out_files = declare_out_files(protos, ctx, _GENERATED_GRPC_PROTO_FORMAT)

    plugin_flags = ["grpc_2_0"] + ctx.attr.strip_prefixes
    arguments = []
    tools = [ctx.executable._protoc, ctx.executable._grpc_plugin]
    out_dir = get_out_dir(protos, ctx)
    arguments += get_plugin_args(
        ctx.executable._grpc_plugin,
        plugin_flags,
        out_dir.path,
        False,
    )

    # Build proto search paths exactly like grpc's rule, then append explicit
    # proto inputs from `protos`.
    arguments += [
        "--proto_path={}".format(get_include_directory(include))
        for include in includes
    ]
    arguments.append("--proto_path={}".format(ctx.genfiles_dir.path))
    arguments += get_proto_arguments(protos, ctx.genfiles_dir.path)

    # Generate *_pb2_grpc.py files.
    ctx.actions.run(
        inputs = protos + includes,
        tools = tools,
        outputs = out_files,
        executable = ctx.executable._protoc,
        arguments = arguments,
        mnemonic = "ProtocInvocation",
    )

    # Expose generated stubs together with grpc runtime + dependency PyInfo.
    py_info = _merge_pyinfos(
        [PyInfo(transitive_sources = depset(direct = out_files)), ctx.attr.grpc_library[PyInfo]] +
        [dep[PyInfo] for dep in ctx.attr.py_deps],
    )

    # Standard runfiles wiring used by grpc python rules.
    runfiles = ctx.runfiles(files = out_files, transitive_files = py_info.transitive_sources).merge(ctx.attr.grpc_library[DefaultInfo].data_runfiles)

    return [
        DefaultInfo(
            files = depset(direct = out_files),
            runfiles = runfiles,
        ),
        py_info,
    ]

_generate_filtered_pb2_grpc_src = rule(
    implementation = _generate_filtered_pb2_grpc_src_impl,
    attrs = {
        "grpc_library": attr.label(
            default = Label("@com_github_grpc_grpc//src/python/grpcio/grpc:grpcio"),
            providers = [PyInfo],
        ),
        # Basename filter applied to direct proto sources in `srcs`.
        "proto_filenames": attr.string_list(
            mandatory = True,
            allow_empty = False,
        ),
        # py_proto_library dependency supplying *_pb2.py and related imports.
        "py_deps": attr.label_list(
            mandatory = True,
            allow_empty = False,
            providers = [PyInfo],
        ),
        # proto_library input(s); this rule expects exactly one.
        "srcs": attr.label_list(
            mandatory = True,
            allow_empty = False,
            providers = [ProtoInfo],
        ),
        "strip_prefixes": attr.string_list(),
        "_grpc_plugin": attr.label(
            executable = True,
            providers = ["files_to_run"],
            cfg = "exec",
            default = Label("@com_github_grpc_grpc//src/compiler:grpc_python_plugin"),
        ),
        "_protoc": attr.label(
            executable = True,
            providers = ["files_to_run"],
            cfg = "exec",
            default = Label("@com_google_protobuf//:protoc"),
        ),
    },
)

def py_grpc_library_filtered(name, srcs, deps, proto_filenames, strip_prefixes = [], grpc_library = Label("@com_github_grpc_grpc//src/python/grpcio/grpc:grpcio"), **kwargs):
    """Like py_grpc_library, but compile only selected direct proto filenames.

    This exists specifically to keep protoc input paths canonical when these
    targets are built via the external repo label
    `@com_github_reboot_dev_reboot//...`.

    Args:
      name: Target name.
      srcs: One proto_library target containing candidate direct source protos.
      deps: One py_proto_library target corresponding to `srcs`.
      proto_filenames: Basenames of direct source proto files to compile.
      strip_prefixes: Optional grpc python import strip prefixes.
      grpc_library: Python grpc runtime dependency target.
      **kwargs: Extra attributes forwarded to the underlying generated rule.
    """
    if len(srcs) != 1:
        fail("Can only compile a single proto_library target at a time.")

    if len(deps) != 1:
        fail("Deps must have length 1.")

    _generate_filtered_pb2_grpc_src(
        name = name,
        srcs = srcs,
        py_deps = deps,
        proto_filenames = proto_filenames,
        strip_prefixes = strip_prefixes,
        grpc_library = grpc_library,
        **kwargs
    )
