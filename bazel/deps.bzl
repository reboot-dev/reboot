"""Dependency specific initialization."""

load("@aspect_bazel_lib//lib:repositories.bzl", "aspect_bazel_lib_dependencies")
load("@bazel_skylib//:workspace.bzl", "bazel_skylib_workspace")
load("@buildifier_prebuilt//:defs.bzl", "buildifier_prebuilt_register_toolchains")
load("@buildifier_prebuilt//:deps.bzl", "buildifier_prebuilt_deps")
load("@com_github_3rdparty_eventuals//bazel:deps.bzl", eventuals_deps = "deps")
load("@com_github_grpc_grpc//bazel:grpc_deps.bzl", "grpc_deps")
load("@com_github_reboot_dev_pyprotoc_plugin//bazel:deps.bzl", pyprotoc_plugin_deps = "deps")
load("@hermetic_cc_toolchain//toolchain:defs.bzl", zig_toolchains = "toolchains")
load("@io_bazel_rules_docker//cc:image.bzl", _cc_image_repos = "repositories")
load("@io_bazel_rules_docker//contrib:dockerfile_build.bzl", "dockerfile_image")
load("@io_bazel_rules_docker//python3:image.bzl", _py_image_repos = "repositories")
load("@io_bazel_rules_docker//repositories:deps.bzl", container_deps = "deps")
load("@io_bazel_rules_webtesting//web:py_repositories.bzl", web_test_py_respositories = "py_repositories")
load("@io_bazel_rules_webtesting//web:repositories.bzl", "web_test_repositories")
load("@io_bazel_rules_webtesting//web/versioned:browsers-0.3.3.bzl", "browser_repositories")
load("@mypy_integration//repositories:repositories.bzl", mypy_integration_repositories = "repositories")
load("@mypy_integration_pip_deps//:requirements.bzl", mypy_integration_pypi_deps = "install_deps")
load("@rules_buf//buf:defs.bzl", "buf_dependencies")
load("@rules_buf//buf:repositories.bzl", "rules_buf_dependencies", "rules_buf_toolchains")
load("@rules_pkg//:deps.bzl", "rules_pkg_dependencies")
load("@rules_proto//proto:repositories.bzl", "rules_proto_dependencies", "rules_proto_toolchains")
load("//bazel:detect_host_arch.bzl", "detect_host_arch")

def deps(repo_mapping = {}):
    """Adds external repositories/archives needed by respect (phase 2).

    Args:
        repo_mapping: passed through to all other functions that expect/use
            repo_mapping, e.g., 'eventuals_deps'
    """
    pyprotoc_plugin_deps(
        repo_mapping = repo_mapping,
    )

    eventuals_deps(
        repo_mapping = repo_mapping,
    )

    _cc_image_repos()

    container_deps()

    _py_image_repos()

    rules_pkg_dependencies()

    grpc_deps()

    dockerfile_image(
        name = "respect_base_image",
        # Refer to the Dockerfile file we'll use by its bazel label. Note that
        # this a bazel path to a file, not a bazel target. See
        # https://bazel.build/concepts/labels for details.
        dockerfile = "//:Dockerfile",
        target = "respect-base-image",
    )

    dockerfile_image(
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

    # Buf related dependencies:
    # https://github.com/bufbuild/rules_buf
    rules_buf_dependencies()
    rules_buf_toolchains(version = "v1.5.0")
    rules_proto_dependencies()
    rules_proto_toolchains()

    buf_dependencies(
        name = "buf_deps_envoy",
        modules = [
            "buf.build/envoyproxy/envoy:a244c7c7e6f745a18c18c15e996b1101",
            "buf.build/envoyproxy/protoc-gen-validate:dc09a417d27241f7b069feae2cd74a0e",
            "buf.build/cncf/xds:46e39c7b9b4321731ebe247f2e176fdf0518d76e",
            "buf.build/opencensus/opencensus:c099df6008e041be95f2bfbfc7a20c3a",
        ],
    )

    # Dependencies for WebDriver.
    web_test_repositories()
    web_test_py_respositories()

    # For Chromium to work, a local version must be found on the workstation.
    # This is likely true for other browsers as well.
    # https://github.com/bazelbuild/rules_webtesting/issues/322
    browser_repositories(chromium = True)

    # Dependency to use write_source_files.
    aspect_bazel_lib_dependencies()

    # Plain zig_toolchains() will pick reasonable defaults. See
    # toolchain/defs.bzl:toolchains on how to change the Zig SDK version and
    # download URL.
    zig_toolchains()

    # Can't use the 'select' in repository rules, so we have to determine the
    # host architecture here.
    detect_host_arch(
        name = "host_arch_detector",
    )
