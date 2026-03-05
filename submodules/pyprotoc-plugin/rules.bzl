"""Defines rules to create pyprotoc-based bazel rules."""

load("@rules_proto//proto:defs.bzl", "ProtoInfo")

def _get_proto_sources(context):
    proto_files = [
        src
        for src in context.files.srcs
    ]

    for dependency in context.attr.deps:
        proto_provider = dependency[ProtoInfo]
        proto_files += proto_provider.transitive_sources.to_list()

    return proto_files

def _generate_output_names(context, proto_file):
    file_path = proto_file.basename.removesuffix(".proto")

    output_file_names = [
        file_path + extension
        for extension in context.attr._extensions
    ]

    return output_file_names

def _declare_outputs(context):
    output_files = []

    for proto_file in context.files.srcs:
        # Applicable for non cpp builds.
        if context.attr._extensions:
            for output_file in _generate_output_names(context, proto_file):
                output_files.append(
                    context.actions.declare_file(
                        output_file,
                        sibling = proto_file,
                    ),
                )
        else:
            output_files.append(
                context.actions.declare_directory(proto_file.basename.removesuffix(".proto") + "_generated"),
            )

    return output_files

def _protoc_plugin_rule_implementation(context):
    proto_files = _get_proto_sources(context)
    output_files = _declare_outputs(context)

    output_directory = context.genfiles_dir.path

    if not context.attr._extensions:
        # Declare a directory on one level upper to generated ones, to be sure
        # it works with a couple proto files.
        output_directory = "/".join(output_files[0].path.split("/")[:-1])

    if len(context.label.workspace_root) != 0:
        output_directory += "/" + context.label.workspace_root

    plugin_path = context.executable._plugin.path
    plugin_name = plugin_path.split("/")[-1]

    if not plugin_name.startswith("protoc-gen-"):
        fail("Plugin name %s does not start with protoc-gen-" % plugin_name)
    plugin_short_name = plugin_name.removeprefix("protoc-gen-")

    # Args passed to 'create_protoc_plugin_rule' are not allowed to start with
    # '--plugin' or '--<plugin_short_name>_out'.
    for arg in context.attr._args:
        if arg.startswith("--plugin") or arg.startswith("--%s_out" % plugin_short_name):
            fail("Argument %s starts with --plugin or --%s_out, which is not allowed" % (arg, plugin_short_name))

    args = context.attr._args + [
        "--plugin=%s=%s" % (plugin_name, plugin_path),
        "--%s_out" % plugin_short_name,
        output_directory,
    ]

    _virtual_imports = "/_virtual_imports/"

    # Remove duplicate proto files, if the proto file location is the same
    # it won't break the `protoc` invocation, however we might have a
    # generated proto file (for example we have to generate proto files when
    # we have a Pydantic API) and if we have a `proto_library` which
    # depends on that proto, it will create a copy of the same proto file
    # inside `_virtual_imports` and that will break the build.
    seen = {}
    unique_proto_files = []
    for proto_file in proto_files:
        short_path = proto_file.short_path
        if _virtual_imports in proto_file.path:
            before, after = proto_file.path.split(_virtual_imports)
            import_path = before + _virtual_imports + after.split("/")[0] + "/"
            short_path = proto_file.path.replace(import_path, "")

        if short_path not in seen:
            seen[short_path] = True
            unique_proto_files.append(proto_file)

    proto_files = unique_proto_files

    for proto_file in proto_files:
        # If Bazel gives us a `_virtual_imports` path, that path is already the
        # canonical import view for `protoc` (import root + import-relative
        # filename). We must use it as-is and skip all other path handling.
        #
        # Important: do not fall through to local/external logic for these
        # files. That logic computes a different `-I` root from physical paths,
        # which can disagree with the virtual import view and break imports.
        # Local/external branches below are only for non-virtual paths.
        if _virtual_imports in proto_file.path:
            before, after = proto_file.path.split(_virtual_imports)
            import_path = before + _virtual_imports + after.split("/")[0] + "/"
            args += [
                "-I" + import_path,
                proto_file.path.replace(import_path, ""),
            ]
            continue

        # Handle generated files in external repositories where Bazel surfaces
        # short paths like "../<repo>/<repo-relative-path>.proto".
        if proto_file.short_path.startswith("../"):
            short_path = proto_file.short_path.removeprefix("../")
            if "/" in short_path:
                short_path = short_path.split("/", 1)[1]
                if proto_file.path.endswith(short_path):
                    import_path = proto_file.path[:-len(short_path)]
                    args.append("-I" + import_path)
                    args.append(short_path)
                    continue

        if len(proto_file.owner.workspace_root) == 0:
            # Handle case where `proto_file` is a local file.
            # This includes both source files in the workspace and files
            # generated by custom Bazel rules. Generated files will be
            # placed in the `bazel-out` directory, so we need to
            # determine the import path correctly for that case. For
            # files which are part of the workspace, the `import_path`
            # will be empty and we will set it to `./`.
            import_path = proto_file.path[:-len(proto_file.short_path)]

            if import_path == "":
                import_path = "./"
            args.append(
                "-I" + import_path,
            )
            args.append(
                proto_file.short_path,
            )
        elif proto_file.path.startswith("external"):
            # Handle case where `proto_file` is from an external
            # repository (i.e., from 'git_repository()' or
            # 'http_archive()' or 'local_repository()').
            elements = proto_file.path.split("/")
            import_path = "/".join(elements[:2]) + "/"
            args += [
                "-I" + import_path,
                proto_file.path.replace(import_path, ""),
            ]
        else:
            fail(
                "Handling this type of (generated?) .proto file " +
                "was not forseen and is not implemented. " +
                "Please create an issue at " +
                "https://github.com/reboot-dev/pyprotoc-plugin/issues " +
                "with your proto file and we will have a look!",
            )

    context.actions.run_shell(
        outputs = output_files,
        inputs = proto_files,
        tools = [
            context.executable._protoc,
            context.executable._plugin,
        ],
        command = context.executable._protoc.path + " $@",
        arguments = args,
        env = context.attr._env,
    )

    return [DefaultInfo(
        files = depset(output_files),
    )]

def create_protoc_plugin_rule(plugin_label, extensions = [], args = [], env = {}):
    return rule(
        attrs = {
            "deps": attr.label_list(
                mandatory = True,
                providers = [ProtoInfo],
            ),
            "srcs": attr.label_list(
                allow_files = True,
                mandatory = True,
            ),
            "_args": attr.string_list(
                mandatory = False,
                default = args,
            ),
            "_env": attr.string_dict(
                mandatory = False,
                default = env,
            ),
            "_extensions": attr.string_list(
                default = extensions,
            ),
            "_plugin": attr.label(
                cfg = "exec",
                default = Label(plugin_label),
                # allow_single_file=True,
                executable = True,
            ),
            "_protoc": attr.label(
                cfg = "exec",
                default = Label("@com_google_protobuf//:protoc"),
                executable = True,
                allow_single_file = True,
            ),
        },
        output_to_genfiles = True,
        implementation = _protoc_plugin_rule_implementation,
    )
