"""Stage two dependencies for Reboot."""

load("@com_github_grpc_grpc//bazel:grpc_extra_deps.bzl", "grpc_extra_deps")
load(
    "@io_bazel_rules_webtesting//web:go_repositories.bzl",
    web_test_go_internal_repos = "go_internal_repositories",
)
load("@rules_buf//buf:defs.bzl", "buf_dependencies")
load("@rules_oci//oci:repositories.bzl", "oci_register_toolchains")

def extra_deps():
    grpc_extra_deps()

    buf_dependencies(
        name = "buf_deps_envoy",
        modules = [
            "buf.build/envoyproxy/envoy:a244c7c7e6f745a18c18c15e996b1101",
            "buf.build/envoyproxy/protoc-gen-validate:dc09a417d27241f7b069feae2cd74a0e",
            "buf.build/cncf/xds:46e39c7b9b4321731ebe247f2e176fdf0518d76e",
            "buf.build/opencensus/opencensus:c099df6008e041be95f2bfbfc7a20c3a",
        ],
    )

    oci_register_toolchains(
        name = "oci",
    )

    web_test_go_internal_repos()
