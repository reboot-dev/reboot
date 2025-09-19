"""Stage two dependencies for Reboot."""

load("@com_github_grpc_grpc//bazel:grpc_extra_deps.bzl", "grpc_extra_deps")
load(
    "@io_bazel_rules_webtesting//web:go_repositories.bzl",
    web_test_go_internal_repos = "go_internal_repositories",
)
load("@rules_oci//oci:repositories.bzl", "LATEST_CRANE_VERSION", "oci_register_toolchains")

def extra_deps():
    grpc_extra_deps()

    oci_register_toolchains(
        name = "oci",
        crane_version = LATEST_CRANE_VERSION,
    )

    web_test_go_internal_repos()
