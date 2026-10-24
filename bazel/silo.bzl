"""Silo, the S3-compatible server that tests keep blob bytes in.

Fetched by Bazel once per release, into its repository cache, and
reused from there by every build and test on the machine; never
redistributed. The release is pinned, so that a test runs against the
same Silo wherever it runs, and each platform's archive is named with
its digest.
"""

load("@bazel_tools//tools/build_defs/repo:http.bzl", "http_archive")
load("@bazel_tools//tools/build_defs/repo:utils.bzl", "maybe")

SILO_RELEASE = "RELEASE.2026-10-26T00-00-00Z"

# The release's archives are named by its version: the release's
# digits, as `20261026000000.0.0` for `RELEASE.2026-10-26T00-00-00Z`.
_SILO_VERSION = "".join([c for c in SILO_RELEASE.elems() if c.isdigit()]) + ".0.0"

# The platforms Silo is fetched for, keyed by the name under which
# `//bazel/silo` selects them, with the `os_arch` of Silo's archive
# name and the archive's SHA-256.
_SILO_ARCHIVES = {
    "linux_aarch64": ("linux_arm64", "2b70f568cc36fe7d4d83d10cbbf27d9bcfae0fba20ec96621225fce2e63054da"),
    "linux_x86_64": ("linux_amd64", "4119e6da79be4f1b9ec9c619f72752f2e26e7447191dba969c02e4795fed8f92"),
    "macos_aarch64": ("darwin_arm64", "8478bdf9209962ea82a40f386785c5d0cadc09b0d04d5a58e160bfca7adfc59e"),
    "macos_x86_64": ("darwin_amd64", "6082d3df4e38f879a6ab00575da1becda8953095968f93f0243faa64c657dab1"),
}

def silo_repos():
    """Declares one `http_archive` repository per platform's Silo."""
    for name, (platform, sha256) in _SILO_ARCHIVES.items():
        maybe(
            http_archive,
            name = "silo_" + name,
            urls = [
                "https://github.com/pgsty/silo/releases/download/" +
                SILO_RELEASE + "/silo_" + _SILO_VERSION + "_" + platform +
                ".tar.gz",
            ],
            sha256 = sha256,
            # The archive holds the `silo` binary at its root, beside
            # its license and readme.
            build_file_content = 'exports_files(["silo"])',
        )
