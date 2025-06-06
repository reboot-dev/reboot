"""Adds repostories/archives."""

########################################################################
# DO NOT EDIT THIS FILE unless you are inside the
# https://github.com/reboot-dev/mono repository. If you
# encounter it anywhere else it is because it has been copied there in
# order to simplify adding transitive dependencies. If you want a
# different version of respect follow the Bazel build
# instructions at https://github.com/reboot-dev/mono.
########################################################################

load("@bazel_tools//tools/build_defs/repo:git.bzl", "git_repository")
load("@bazel_tools//tools/build_defs/repo:http.bzl", "http_archive")
load("@bazel_tools//tools/build_defs/repo:utils.bzl", "maybe")
load("@com_github_3rdparty_bazel_rules_jemalloc//bazel:repos.bzl", jemalloc_repos = "repos")
load("@com_github_3rdparty_stout//bazel:repos.bzl", stout_repos = "repos")
load("@com_github_reboot_dev_pyprotoc_plugin//bazel:repos.bzl", pyprotoc_plugin_repos = "repos")

def repos():
    """Adds external repositories/archives needed by Reboot (phase 1)."""

    # Pull specific version of the 'abseil', that doesn't contain code
    # which triggers 'deprecated-builtins' warnings on the modern Xcode.
    # Took the version from
    # https://github.com/grpc/grpc/blob/v1.55.0/bazel/grpc_deps.bzl#L339
    # Doing that we won't spam the CI runner logs.
    # TODO: remove and let the 'grpc' bring the 'abseil' library when the
    # 'grpc' library is updated.
    maybe(
        http_archive,
        name = "com_google_absl",
        sha256 = "5366d7e7fa7ba0d915014d387b66d0d002c03236448e1ba9ef98122c13b35c36",
        strip_prefix = "abseil-cpp-20230125.3",
        urls = [
            "https://storage.googleapis.com/grpc-bazel-mirror/github.com/abseil/abseil-cpp/archive/20230125.3.tar.gz",
            "https://github.com/abseil/abseil-cpp/archive/20230125.3.tar.gz",
        ],
    )

    # Declare the 'upb' dependency explicitly to apply a patch and ignore
    # the version of the 'upb' that is pulled by the 'grpc' dependency.
    # Took the commit from there:
    # https://github.com/grpc/grpc/blob/v1.45.0/bazel/grpc_deps.bzl#L340
    # We need that to avoid build error on the modern Xcode, see more:
    # https://github.com/reboot-dev/mono/issues/4280
    # TODO: Remove the patch once the 'grpc' library is upgraded.
    maybe(
        http_archive,
        name = "upb",
        sha256 = "1cd33bf607ebc83acf71b6078c1d4361ffa49d647a2ce792a557ae98f75500ad",
        strip_prefix = "upb-a02d92e0257a35f11d4a58b6a932506cbdbb2f29",
        urls = [
            "https://storage.googleapis.com/grpc-bazel-mirror/github.com/protocolbuffers/upb/archive/a02d92e0257a35f11d4a58b6a932506cbdbb2f29.tar.gz",
            "https://github.com/protocolbuffers/upb/archive/a02d92e0257a35f11d4a58b6a932506cbdbb2f29.tar.gz",
        ],
        # Before we update the version of the 'grpc', which pulls the old
        # version of the 'upb' which is causing the Reboot build error we
        # can apply the patch to ignore that errors to make the Reboot be able
        # to build with Xcode 16.
        patches = ["@com_github_reboot_dev_reboot//bazel/upb:upb-ignore-modern-xcode-errors.patch"],
        patch_args = ["-p1"],
    )

    # Official Python rules for Bazel.
    maybe(
        http_archive,
        name = "rules_python",
        sha256 = "9acc0944c94adb23fba1c9988b48768b1bacc6583b52a2586895c5b7491e2e31",
        url = "https://github.com/bazelbuild/rules_python/releases/download/0.27.0/rules_python-0.27.0.tar.gz",
        strip_prefix = "rules_python-0.27.0",
    )

    # Declare a specific gRPC version *first*, before another dependency has a chance
    # to define an alternative incompatible version.
    # TODO(Issue #644, Xander): Fix the compilation errors caused by combining newer
    # gRPC versions with `io_bazel_rules_go` repos (brought in via the
    # `io_bazel_rules_docker` repos).
    maybe(
        http_archive,
        name = "com_github_grpc_grpc",
        urls = ["https://github.com/grpc/grpc/archive/refs/tags/v1.45.0.tar.gz"],
        strip_prefix = "grpc-1.45.0",
        sha256 = "ec19657a677d49af59aa806ec299c070c882986c9fcc022b1c22c2a3caf01bcd",
    )

    stout_repos()

    pyprotoc_plugin_repos()

    jemalloc_repos()

    maybe(
        http_archive,
        name = "rules_oci",
        sha256 = "46ce9edcff4d3d7b3a550774b82396c0fa619cc9ce9da00c1b09a08b45ea5a14",
        strip_prefix = "rules_oci-1.8.0",
        url = "https://github.com/bazel-contrib/rules_oci/releases/download/v1.8.0/rules_oci-v1.8.0.tar.gz",
    )

    # Gazell and rules_go are not true dependencies, but they are needed by
    # another one of our transitive dependencies that does not properly load
    # its own dependencies.
    maybe(
        http_archive,
        name = "bazel_gazelle",
        sha256 = "cdb02a887a7187ea4d5a27452311a75ed8637379a1287d8eeb952138ea485f7d",
        urls = ["https://github.com/bazelbuild/bazel-gazelle/releases/download/v0.21.1/bazel-gazelle-v0.21.1.tar.gz"],
    )

    maybe(
        http_archive,
        name = "io_bazel_rules_go",
        sha256 = "08c3cd71857d58af3cda759112437d9e63339ac9c6e0042add43f4d94caf632d",
        urls = [
            "https://storage.googleapis.com/bazel-mirror/github.com/bazelbuild/rules_go/releases/download/v0.24.2/rules_go-v0.24.2.tar.gz",
            "https://github.com/bazelbuild/rules_go/releases/download/v0.24.2/rules_go-v0.24.2.tar.gz",
        ],
    )

    maybe(
        http_archive,
        name = "rules_pkg",
        urls = [
            "https://mirror.bazel.build/github.com/bazelbuild/rules_pkg/releases/download/1.0.1/rules_pkg-1.0.1.tar.gz",
            "https://github.com/bazelbuild/rules_pkg/releases/download/1.0.1/rules_pkg-1.0.1.tar.gz",
        ],
        sha256 = "d20c951960ed77cb7b341c2a59488534e494d5ad1d30c4818c736d57772a9fef",
    )

    maybe(
        git_repository,
        name = "googleapis",
        remote = "https://github.com/googleapis/googleapis",
        commit = "43c8e80a384841ec0f740e001f077d9af8a5eae8",
        shallow_since = "1668729854 -0800",
    )

    maybe(
        http_archive,
        name = "buildifier_prebuilt",
        sha256 = "ecef8f8c39eaf4f1c1604c677d232ade33818f898e35e7826e7564a648751350",
        strip_prefix = "buildifier-prebuilt-5.1.0.2",
        urls = [
            "http://github.com/keith/buildifier-prebuilt/archive/5.1.0.2.tar.gz",
        ],
    )

    maybe(
        http_archive,
        name = "mypy_integration",
        sha256 = "9d270fdb81e76fed1122a94c512b0930d70b837569dc488b58ab9c033641910d",
        strip_prefix = "bazel-mypy-integration-0.5.0",
        url = "https://github.com/bazel-contrib/bazel-mypy-integration/archive/refs/tags/0.5.0.tar.gz",
    )

    maybe(
        http_archive,
        name = "rules_proto",
        sha256 = "e017528fd1c91c5a33f15493e3a398181a9e821a804eb7ff5acdd1d2d6c2b18d",
        strip_prefix = "rules_proto-4.0.0-3.20.0",
        urls = [
            "https://github.com/bazelbuild/rules_proto/archive/refs/tags/4.0.0-3.20.0.tar.gz",
        ],
    )

    maybe(
        http_archive,
        name = "rules_buf",
        sha256 = "523a4e06f0746661e092d083757263a249fedca535bd6dd819a8c50de074731a",
        strip_prefix = "rules_buf-0.1.1",
        urls = [
            "https://github.com/bufbuild/rules_buf/archive/refs/tags/v0.1.1.zip",
        ],
    )

    maybe(
        http_archive,
        name = "com_github_facebook_rocksdb",
        url = "https://github.com/facebook/rocksdb/archive/refs/tags/v7.9.2.zip",
        sha256 = "ce7a498718df53b3a11f64578b283025c6cdd34bf7379a8e838b84eef212178c",
        strip_prefix = "rocksdb-7.9.2",
        # We apply a patch that removes the ability to use 'ccache'
        # because it may get found by cmake but not be usable within a
        # Bazel sandbox.
        patches = ["@com_github_reboot_dev_reboot//bazel/rocksdb:do-not-use-ccache.patch"],
        patch_args = ["-p1"],
        build_file = "@com_github_reboot_dev_reboot//bazel/rocksdb:rocksdb.BUILD",
    )

    maybe(
        http_archive,
        name = "io_bazel_rules_webtesting",
        sha256 = "db4ffb24f7846978307b0e3ee984c1bf7594de3013e4c0edb898a36e81dc8e86",
        urls = [
            "https://github.com/bazelbuild/rules_webtesting/archive/d8208bddac1e44b3327430cc422f952b3244536a.zip",
        ],
        strip_prefix = "rules_webtesting-d8208bddac1e44b3327430cc422f952b3244536a",
    )

    maybe(
        git_repository,
        name = "hermetic_cc_toolchain",
        remote = "https://github.com/uber/hermetic_cc_toolchain.git",
        commit = "0e98778e4e8b60c1c773199cfb340de66d62d485",
        shallow_since = "1726954863 +0000",
    )

    maybe(
        http_archive,
        name = "aspect_bazel_lib",
        sha256 = "04feedcd06f71d0497a81fdd3220140a373ff9d2bff94620fbd50b774f96d8e0",
        strip_prefix = "bazel-lib-1.40.2",
        url = "https://github.com/aspect-build/bazel-lib/releases/download/v1.40.2/bazel-lib-v1.40.2.tar.gz",
    )

    maybe(
        git_repository,
        name = "com_github_3rdparty_bazel_rules_tl_expected",
        remote = "https://github.com/3rdparty/bazel-rules-expected",
        commit = "c703632657bf4ec9177d9aea0447166d424b3b74",
        shallow_since = "1654243887 +0300",
    )
