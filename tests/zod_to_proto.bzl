"""
Bazel rule for generating proto files from TypeScript Zod schema files.
"""

load("@com_google_protobuf//bazel:proto_library.bzl", "proto_library")
load("//reboot:rules.bzl", "js_proto_library", "js_reboot_library")

# The dependencies of 'zod-to-proto.ts'.
PACKAGE_JSON = """
{
  "name": "zod_to_proto",
  "type": "module",
  "dependencies": {
    "zod": "^3.25.51",
    "chalk": "^4.1.2",
    "tsx": "^4.19.2"
  }
}
"""

def zod_to_proto(
        name,
        zod,
        visibility = None):
    """Generates a proto file from TypeScript files containing Zod schemas.

    Args:
        name: Name of the target.
        zod: The TypeScript source file containing the Zod schema.
        visibility: Bazel visibility for the generated target.
    """

    zod_basename = zod.split("/")[-1]
    output_proto_filename = zod_basename.removesuffix(".ts") + ".proto"

    native.genrule(
        name = name,
        srcs = [zod],
        outs = [output_proto_filename],
        cmd = """
            # Set the REBOOT_BAZEL_GENERATED environment variable to avoid
            # setting absolute Zod schema path in the generated proto.
            export REBOOT_BAZEL_GENERATED=true

            zod_file_relative_path=$(execpath {zod})
            zod_file_absolute_path=$$(realpath $$zod_file_relative_path)
            zod_file_relative_directory=$$(dirname $$zod_file_relative_path)
            zod_to_proto_absolute_path=$$(realpath $(execpath //reboot/nodejs:zod-to-proto.ts))

            reboot_api_tarball=$$(realpath $(location //rbt/v1alpha1:reboot-dev-reboot-api))

            npm_binary_path=$$(realpath $(execpath @node//:npm))

            output_file=$$PWD/$@

            TMPDIR=$$(mktemp -d)
            cd $$TMPDIR
            cat > package.json << 'EOFPKG'
{PACKAGE_JSON}
EOFPKG

            mkdir -p $$zod_file_relative_directory
            cp $$zod_file_absolute_path $$zod_file_relative_path

            cp -r $$zod_to_proto_absolute_path zod-to-proto.ts

            $$npm_binary_path install

            # Install the `reboot-dev/reboot-api` package from the
            # tarball so we can install a "dev" version of that package.
            $$npm_binary_path install $$reboot_api_tarball

            output_directory=$$(npx tsx zod-to-proto.ts ./ $$zod_file_relative_path)

            proto_file_relative_path=$$(echo $$zod_file_relative_path | sed 's/\\.ts$$/.proto/')

            # Copy the generated proto to the expected output location.
            mkdir -p $$(dirname $$output_file)

            cp $$output_directory/$$proto_file_relative_path $$output_file
        """.format(
            zod = zod,
            PACKAGE_JSON = PACKAGE_JSON,
        ),
        tools = [
            "@node//:npm",
            "//reboot/nodejs:zod-to-proto.ts",
            "//rbt/v1alpha1:reboot-dev-reboot-api",
        ],
        visibility = visibility,
    )

def js_reboot_library_from_zod(
        name,
        zod,
        package_json,
        js_deps = [],
        visibility = None):
    """Generates a `js_reboot_library` from a TypeScript Zod schema.

    Args:
        name: Name of the target. This will be the name of the `js_reboot_library`.
        zod: The TypeScript source file (must include file that exports 'api').
        package_json: `package.json` to include in `js_proto_library`.
        js_deps: Additional JavaScript/TypeScript dependencies for the generated
                 `js_reboot_library` (beyond the default Reboot dependencies).
        visibility: Bazel visibility for the generated targets.
    """

    zod_to_proto(
        name = name + "_proto_file",
        zod = zod,
    )

    proto_library(
        name = name + "_proto",
        srcs = [":" + name + "_proto_file"],
        visibility = visibility,
        deps = [
            "//rbt/v1alpha1:options_proto",
            "//rbt/v1alpha1:tasks_proto",
            "@com_google_protobuf//:empty_proto",
            "@com_google_protobuf//:struct_proto",
        ],
    )

    # Generate JavaScript protobuf files (_pb.js and _pb.d.ts) from the
    # generated proto file.
    js_proto_library(
        name = name + "_js_proto",
        proto = zod.split("/")[-1].removesuffix(".ts") + ".proto",
        package_json = package_json,
        proto_deps = [
            "//rbt/v1alpha1:options_proto",
            "//rbt/v1alpha1:tasks_proto",
            "@com_google_protobuf//:any_proto",
            "@com_google_protobuf//:descriptor_proto",
            "@com_google_protobuf//:empty_proto",
            "@com_google_protobuf//:struct_proto",
            "@com_google_protobuf//:timestamp_proto",
        ],
        visibility = visibility,
    )

    js_reboot_library(
        name = name,
        srcs = [
            ":" + name + "_proto",
        ],
        proto = ":" + name + "_proto_file",
        visibility = visibility,
        deps = js_deps + [
            ":" + name + "_js_proto",
        ],
    )
