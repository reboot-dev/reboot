"""Dependency specific initialization."""

load("@com_google_protobuf//:protobuf_deps.bzl", "protobuf_deps")
load("@pyprotoc_plugin_pypi//:requirements.bzl", pypi_deps = "install_deps")

def deps(repo_mapping = {}):
    protobuf_deps()

    pypi_deps(repo_mapping = repo_mapping)
