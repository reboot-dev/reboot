"""Bazel rules for generating Reboot code from Pydantic API definitions."""

load("@rules_proto//proto:defs.bzl", "proto_library")
load(
    "//reboot:rules.bzl",
    "js_proto_library",
    "js_reboot_react_library",
    "py_reboot_library",
)

def _collect_transitive_sources(deps):
    """Collect transitive Python sources from `py_library` deps."""
    transitive = []
    for dep in deps:
        if PyInfo in dep:
            transitive.append(dep[PyInfo].transitive_sources)
    return depset(transitive = transitive)

def _pydantic_to_proto_impl(ctx):
    """Implementation of the `pydantic_to_proto` rule."""
    pydantic_file = ctx.file.pydantic

    output_proto_filename = pydantic_file.basename.removesuffix(".py") + ".proto"

    output_proto = ctx.actions.declare_file(output_proto_filename, sibling = pydantic_file)

    args = ctx.actions.args()

    # Get the full path to where Bazel wants the output.
    args.add(output_proto.path)

    # Relative path for package name (e.g., `tests/reboot/<pydantic_api_file>.py`).
    args.add(pydantic_file.short_path)

    # Include transitive Python sources so that imports within
    # the pydantic file resolve inside the Bazel sandbox.
    transitive_sources = _collect_transitive_sources(ctx.attr.py_deps)

    ctx.actions.run(
        executable = ctx.executable._pydantic_to_proto_binary,
        arguments = [args],
        inputs = depset([pydantic_file], transitive = [transitive_sources]),
        outputs = [output_proto],
        mnemonic = "PydanticToProto",
        progress_message = "Generating Protobuf file from %s" % pydantic_file.short_path,
    )

    return [
        DefaultInfo(files = depset([output_proto])),
    ]

pydantic_to_proto = rule(
    implementation = _pydantic_to_proto_impl,
    attrs = {
        "py_deps": attr.label_list(
            default = [],
            providers = [PyInfo],
            doc = "Python dependencies whose transitive sources must be " +
                  "available when importing the pydantic file",
        ),
        "pydantic": attr.label(
            allow_single_file = [".py"],
            mandatory = True,
            doc = "The Pydantic API definition file to convert to proto",
        ),
        "_pydantic_to_proto_binary": attr.label(
            default = Label("//reboot:pydantic_to_proto"),
            executable = True,
            cfg = "exec",
        ),
    },
    doc = "Generates a `*.proto` file from a Pydantic API definition file",
)

def py_reboot_library_from_pydantic(
        name,
        pydantic,
        py_deps,
        visibility = ["//visibility:public"]):
    """Generates a py_reboot_library from a Pydantic API definition.

    Args:
        name: Name of the target.
        pydantic: The Pydantic API definition file.
        py_deps: Python dependencies, expecting at least a `py_library`
                 of the `pydantic` file.
        visibility: Bazel visibility.
    """

    # Generate proto file from the Pydantic API definition.
    pydantic_to_proto(
        name = name + "_proto_file",
        pydantic = pydantic,
        py_deps = py_deps,
    )

    # Generate the corresponding proto_library for the generated proto.
    proto_library(
        name = name + "_proto",
        srcs = [
            ":" + name + "_proto_file",
        ],
        visibility = visibility,
        deps = [
            # Add all default Reboot proto dependencies which are used
            # while converting Pydantic models to Protobuf messages.
            "@com_github_reboot_dev_reboot//rbt/v1alpha1:options_proto",
            "@com_github_reboot_dev_reboot//rbt/v1alpha1:tasks_proto",
            "@com_google_protobuf//:empty_proto",
            "@com_google_protobuf//:struct_proto",
        ],
    )

    py_reboot_library(
        name = name,
        proto = ":" + name + "_proto_file",
        proto_library = ":" + name + "_proto",
        py_deps = py_deps,
        visibility = visibility,
    )

def _pydantic_to_zod_impl(ctx):
    """Implementation of the `pydantic_to_zod` rule."""
    pydantic_file = ctx.file.pydantic

    output_zod_filename = pydantic_file.basename.removesuffix(".py") + "_rbt_types.ts"

    output_zod = ctx.actions.declare_file(
        output_zod_filename,
        sibling = pydantic_file,
    )

    args = ctx.actions.args()

    # Get the full path to where Bazel wants the output.
    args.add(output_zod.path)

    # Relative path for module import (e.g., `tests/reboot/<pydantic_api_file>.py`).
    args.add(pydantic_file.short_path)

    # Add additional pydantic files to scan for error models.
    inputs = [pydantic_file]
    for scan_file in ctx.files.scan_pydantic:
        args.add("--scan", scan_file.short_path)
        inputs.append(scan_file)

    # Include transitive Python sources so that imports within
    # the pydantic file resolve inside the Bazel sandbox.
    transitive_sources = _collect_transitive_sources(ctx.attr.py_deps)

    ctx.actions.run(
        executable = ctx.executable._pydantic_to_zod_binary,
        arguments = [args],
        inputs = depset(inputs, transitive = [transitive_sources]),
        outputs = [output_zod],
        mnemonic = "PydanticToZod",
        progress_message = "Generating Zod types from %s" % pydantic_file.short_path,
    )

    return [
        DefaultInfo(files = depset([output_zod])),
    ]

pydantic_to_zod = rule(
    implementation = _pydantic_to_zod_impl,
    attrs = {
        "py_deps": attr.label_list(
            default = [],
            providers = [PyInfo],
            doc = "Python dependencies whose transitive sources must be " +
                  "available when importing the pydantic file",
        ),
        "pydantic": attr.label(
            allow_single_file = [".py"],
            mandatory = True,
            doc = "The Pydantic API definition file to convert to Zod types",
        ),
        "scan_pydantic": attr.label_list(
            allow_files = [".py"],
            default = [],
            doc = "Additional pydantic files to scan for error models",
        ),
        "_pydantic_to_zod_binary": attr.label(
            default = Label("//reboot:pydantic_to_zod"),
            executable = True,
            cfg = "exec",
        ),
    },
    doc = "Generates a `*_rbt_types.ts` Zod file from a Pydantic API definition file",
)

def _pydantic_to_proto_with_zod_impl(ctx):
    """Generates a proto file from Pydantic with the Zod option included.

    The output file uses a `_zod.proto` suffix to avoid conflicts with the
    backend proto file generated by `pydantic_to_proto`. The React generator
    will produce files like `servicer_api_zod_rbt_react.ts`.
    """
    pydantic_file = ctx.file.pydantic

    # Use a `_zod` suffix to distinguish from the backend proto file.
    output_proto_filename = pydantic_file.basename.removesuffix(".py") + "_zod.proto"
    output_proto = ctx.actions.declare_file(
        output_proto_filename,
        sibling = pydantic_file,
    )

    args = ctx.actions.args()

    # Get the full path to where Bazel wants the output.
    args.add(output_proto.path)

    # Relative path for package name (e.g., `tests/reboot/<pydantic_api_file>.py`).
    args.add(pydantic_file.short_path)

    # Add the Zod file option to inject in the generated code.
    args.add("--zod=" + pydantic_file.basename.removesuffix(".py") + "_rbt_types")

    # Include transitive Python sources so that imports within
    # the pydantic file resolve inside the Bazel sandbox.
    transitive_sources = _collect_transitive_sources(ctx.attr.py_deps)

    ctx.actions.run(
        executable = ctx.executable._pydantic_to_proto_binary,
        arguments = [args],
        inputs = depset([pydantic_file], transitive = [transitive_sources]),
        outputs = [output_proto],
        mnemonic = "PydanticToProtoWithZod",
        progress_message = "Generating Protobuf file with Zod option from %s" % pydantic_file.short_path,
    )

    return [
        DefaultInfo(files = depset([output_proto])),
    ]

pydantic_to_proto_with_zod = rule(
    implementation = _pydantic_to_proto_with_zod_impl,
    attrs = {
        "py_deps": attr.label_list(
            default = [],
            providers = [PyInfo],
            doc = "Python dependencies whose transitive sources must be " +
                  "available when importing the pydantic file",
        ),
        "pydantic": attr.label(
            allow_single_file = [".py"],
            mandatory = True,
            doc = "The Pydantic API definition file to convert to proto with Zod option",
        ),
        "_pydantic_to_proto_binary": attr.label(
            default = Label("//reboot:pydantic_to_proto"),
            executable = True,
            cfg = "exec",
        ),
    },
    doc = "Generates a `*_zod.proto` file with Zod option from a Pydantic API definition file",
)

def js_reboot_react_library_from_pydantic(
        name,
        pydantic,
        package_json,
        js_deps = [],
        py_deps = [],
        zod_srcs = [],
        visibility = ["//visibility:public"]):
    """Generates a js_reboot_react_library from a Pydantic API definition.

    This macro generates both the Zod types file and the React library from
    a Pydantic API definition, allowing React frontends to use Pydantic-based
    backends with full type safety.

    Args:
        name: Name of the target.
        pydantic: The Pydantic API definition file.
        package_json: The package.json file for the `js_proto_library`.
        js_deps: Additional JavaScript dependencies.
        py_deps: Python dependencies whose transitive sources must be
                 available when importing the pydantic file.
        zod_srcs: Additional Zod source files to include in the compilation.
        visibility: Bazel visibility.
    """

    # Extract the proto filename from the pydantic filename and add
    # the `_zod` suffix to avoid conflicts with the backend proto file
    # e.g., `:servicer_api.py` -> `servicer_api_zod.proto`
    pydantic_basename = pydantic
    if pydantic_basename.startswith(":"):
        pydantic_basename = pydantic_basename[1:]

    zod_proto_filename = pydantic_basename.removesuffix(".py") + "_zod.proto"

    # Generate Zod types from the Pydantic API definition.
    pydantic_to_zod(
        name = name + "_zod_file",
        pydantic = pydantic,
        py_deps = py_deps,
    )

    # Generate proto file with Zod option directly from Pydantic.
    # This produces `servicer_api_zod.proto` with the Zod option included.
    pydantic_to_proto_with_zod(
        name = name + "_zod_proto_file",
        pydantic = pydantic,
        py_deps = py_deps,
    )

    proto_library(
        name = name + "_zod_proto",
        srcs = [
            ":" + name + "_zod_proto_file",
        ],
        visibility = visibility,
        deps = [
            # Add all default Reboot proto dependencies which are used
            # while converting Pydantic models to Protobuf messages.
            "@com_github_reboot_dev_reboot//rbt/v1alpha1:options_proto",
            "@com_github_reboot_dev_reboot//rbt/v1alpha1:tasks_proto",
            "@com_google_protobuf//:empty_proto",
            "@com_google_protobuf//:struct_proto",
        ],
    )

    # Create a filegroup alias so the proto file can be referenced by its
    # filename (e.g., `:servicer_api_zod.proto`) as expected by `js_proto_library`.
    native.filegroup(
        name = zod_proto_filename,
        srcs = [":" + name + "_zod_proto_file"],
    )

    js_proto_library(
        name = name + "_js_zod_proto",
        package_json = package_json,
        proto = ":" + zod_proto_filename,
        proto_deps = [
            ":" + name + "_zod_proto",
            "@com_github_reboot_dev_reboot//rbt/v1alpha1:options_proto",
            "@com_github_reboot_dev_reboot//rbt/v1alpha1:tasks_proto",
            "@com_google_protobuf//:any_proto",
            "@com_google_protobuf//:descriptor_proto",
            "@com_google_protobuf//:empty_proto",
            "@com_google_protobuf//:struct_proto",
            "@com_google_protobuf//:timestamp_proto",
        ],
        visibility = visibility,
    )

    js_reboot_react_library(
        name = name,
        srcs = [
            ":" + name + "_js_zod_proto",
            ":" + name + "_zod_file",
        ] + zod_srcs,
        proto = ":" + zod_proto_filename,
        proto_deps = [
            ":" + name + "_zod_proto",
        ],
        deps = js_deps + [
            # Zod is required for the generated Zod types file.
            "//:node_modules/zod",
        ],
        visibility = visibility,
    )
