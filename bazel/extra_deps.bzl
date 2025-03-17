"""Stage two dependencies for Reboot."""

load("@com_github_grpc_grpc//bazel:grpc_extra_deps.bzl", "grpc_extra_deps")

def extra_deps():
    grpc_extra_deps()
