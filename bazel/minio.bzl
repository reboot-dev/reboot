"""MinIO, the S3-compatible object store that tests keep blob bytes in.

Fetched by Bazel once per release, into its repository cache, and
reused from there by every build and test on the machine; never
redistributed. The release is pinned, so that a test runs against the
same MinIO wherever it runs, and each platform's binary is named with
its digest.
"""

load("@bazel_tools//tools/build_defs/repo:http.bzl", "http_file")
load("@bazel_tools//tools/build_defs/repo:utils.bzl", "maybe")

MINIO_RELEASE = "RELEASE.2025-09-07T16-13-09Z"

# The platforms MinIO is fetched for, keyed by the name under which
# `//bazel/minio` selects them, with the `os-arch` of MinIO's download
# path and the binary's SHA-256.
_MINIO_BINARIES = {
    "linux_x86_64": ("linux-amd64", "TODO"),
    "linux_aarch64": ("linux-arm64", "TODO"),
    "macos_x86_64": ("darwin-amd64", "TODO"),
    "macos_aarch64": ("darwin-arm64", "TODO"),
}

def minio_repos():
    """Declares one `http_file` repository per platform's MinIO."""
    for name, (platform, sha256) in _MINIO_BINARIES.items():
        maybe(
            http_file,
            name = "minio_" + name,
            urls = [
                "https://dl.min.io/server/minio/release/" + platform +
                "/archive/minio." + MINIO_RELEASE,
            ],
            sha256 = sha256,
            executable = True,
        )
