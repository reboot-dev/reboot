"""Dependency specific initialization."""

load("@aspect_bazel_lib//lib:repositories.bzl", "aspect_bazel_lib_dependencies")
load("@bazel_skylib//:workspace.bzl", "bazel_skylib_workspace")
load("@bazel_tools//tools/build_defs/repo:utils.bzl", "maybe")
load("@buildifier_prebuilt//:defs.bzl", "buildifier_prebuilt_register_toolchains")
load("@buildifier_prebuilt//:deps.bzl", "buildifier_prebuilt_deps")
load("@com_github_3rdparty_bazel_rules_jemalloc//bazel:deps.bzl", jemalloc_deps = "deps")
load("@com_github_3rdparty_bazel_rules_tl_expected//bazel:deps.bzl", expected_deps = "deps")
load("@com_github_3rdparty_stout//bazel:deps.bzl", stout_deps = "deps")
load("@com_github_grpc_grpc//bazel:grpc_deps.bzl", "grpc_deps")
load("@com_github_reboot_dev_pyprotoc_plugin//bazel:deps.bzl", pyprotoc_plugin_deps = "deps")
load("@com_google_protobuf//:protobuf_deps.bzl", "protobuf_deps")
load("@hermetic_cc_toolchain//toolchain:defs.bzl", zig_toolchains = "toolchains")
load("@io_bazel_rules_webtesting//web:py_repositories.bzl", web_test_py_repositories = "py_repositories")
load("@io_bazel_rules_webtesting//web:repositories.bzl", "web_test_repositories")
load("@io_bazel_rules_webtesting//web/versioned:browsers-0.3.3.bzl", "browser_repositories")
load("@mypy_integration//repositories:repositories.bzl", mypy_integration_repositories = "repositories")
load("@mypy_integration_pip_deps//:requirements.bzl", mypy_integration_pypi_deps = "install_deps")
load("@rbt_pypi//:requirements.bzl", rbt_pypi_deps = "install_deps")
load("@rules_buf//buf:repositories.bzl", "rules_buf_dependencies", "rules_buf_toolchains")
load("@rules_foreign_cc//foreign_cc:repositories.bzl", "rules_foreign_cc_dependencies")
load("@rules_oci//oci:dependencies.bzl", "rules_oci_dependencies")
load("@rules_pkg//:deps.bzl", "rules_pkg_dependencies")
load("@rules_proto//proto:repositories.bzl", "rules_proto_dependencies")
load("@rules_proto//proto:toolchains.bzl", "rules_proto_toolchains")
load("//bazel:detect_host_arch.bzl", "detect_host_arch")
load("//bazel:dockerfile_oci_image.bzl", "dockerfile_oci_image")

def deps():
    """Adds external repositories/archives needed by Reboot (phase 2)."""

    # TODO: This has to happen first, for obscure Google dependency reasons.
    # This should hopefully be resolved once we move to Bazel modules.
    grpc_deps()

    protobuf_deps()

    expected_deps()

    stout_deps()

    pyprotoc_plugin_deps()

    rules_oci_dependencies()

    rules_pkg_dependencies()

    jemalloc_deps()

    dockerfile_oci_image(
        name = "respect_base_image",
        # Refer to the Dockerfile file we'll use by its bazel label. Note that
        # this a bazel path to a file, not a bazel target. See
        # https://bazel.build/concepts/labels for details.
        dockerfile = "//:Dockerfile",
        target = "respect-base-image",
    )

    dockerfile_oci_image(
        name = "envoy_base_image",
        # Refer to the Dockerfile file we'll use by its bazel label. Note that
        # this a bazel path to a file, not a bazel target. See
        # https://bazel.build/concepts/labels for details.
        dockerfile = "//:Dockerfile",
        target = "reboot-envoy",
    )

    # Buildifier prebuilt is a prerequisite for using the mypy integration.
    buildifier_prebuilt_deps()
    bazel_skylib_workspace()
    buildifier_prebuilt_register_toolchains()

    # Setup mypy integration, adapted from instructions on their releases page:
    # https://github.com/bazel-contrib/bazel-mypy-integration/releases/tag/0.4.0
    mypy_integration_repositories()
    mypy_integration_pypi_deps()

    rbt_pypi_deps()

    rules_buf_dependencies()
    rules_buf_toolchains(
        version = "v1.5.0",
        sha256 = "2e53b6cbff35121058ecd447b37d484f1ca4da88a3e8a771c1e868be3bb8fdca",
    )

    rules_proto_dependencies()
    rules_proto_toolchains()

    # Dependencies for WebDriver.
    web_test_repositories()
    web_test_py_repositories()

    # For Chromium to work, a local version must be found on the workstation.
    # This is likely true for other browsers as well.
    # https://github.com/bazelbuild/rules_webtesting/issues/322
    browser_repositories(chromium = True)

    # Dependency to use write_source_files.
    aspect_bazel_lib_dependencies()

    rules_foreign_cc_dependencies()

    # Plain zig_toolchains() will pick reasonable defaults. See
    # toolchain/defs.bzl:toolchains on how to change the Zig SDK version and
    # download URL.
    zig_toolchains()

    # Can't use the 'select' in repository rules, so we have to determine the
    # host architecture here.
    detect_host_arch(
        name = "host_arch_detector",
    )
