#!/usr/bin/env sh
#
# Ensure a pinned `cloudflared` binary is cached in the plugin's
# data dir. On success, prints the absolute path of the directory
# containing the binary to stdout (binary is
# `$CLOUDFLARED_DIR/cloudflared`); status messages go to stderr.
# Sourced indirectly by the `bin/cloudflared` shim.
#
# Source: official `cloudflare/cloudflared` GitHub releases. Linux
# builds publish bare binaries; macOS arm64 ships as a `.tgz`
# tarball containing the binary. SHA-256 digests are taken from
# the per-release notes body (cloudflared does not publish a
# sidecar checksum file).

set -eu

# Pinned cloudflared version. To bump, change here, refresh the
# SHA-256 digests below from the release notes at
# `https://github.com/cloudflare/cloudflared/releases`.
CLOUDFLARED_VERSION="2026.5.0"

# Per-asset SHA-256 digests for `$CLOUDFLARED_VERSION`. We verify
# the downloaded artifact (i.e. the bare binary for Linux, the
# `.tgz` for macOS), so each digest must be of the artifact itself.
#
# Heads up: Cloudflare's release notes mislabel the macOS digest.
# The notes list a SHA next to `cloudflared-darwin-arm64.tgz`, but
# that value is actually the digest of the binary *inside* the
# tarball — not of the `.tgz` artifact GitHub serves. The Linux
# entries are correct because those artifacts are bare binaries.
SHA256_DARWIN_ARM64="116ef11a59fc4f31e7f1bcc4378070cd7ca053fa37b4484b1432bb150b358219"
SHA256_LINUX_AMD64="0095e46fdc88855d801c4d304cb1f5dd4bd656116c47ab94c2ad0ae7cda1c7ec"
SHA256_LINUX_ARM64="2dc0945345677d27de3ae390a31c3b168866b48766da5f4cfd3fc473ce572303"

# `PLUGIN_DATA` is hardcoded rather than read from `$CLAUDE_PLUGIN_DATA`.
# Claude Code only sets that env var when it runs something from a
# plugin entry point — e.g. a hook command. It is *not* set when the
# agent runs a binary directly via its Bash tool, even when that binary
# happens to be a shim we ship in `bin/`. Honoring it would mean shims
# invoked from a hook write to one cache and shims invoked directly by
# the agent write to another, double-downloading the tooling. Pinning
# a fixed path keeps one shared cache.
PLUGIN_DATA="$HOME/.claude/plugins/data/reboot"
CLOUDFLARED_DIR="$PLUGIN_DATA/bin/cloudflared-v$CLOUDFLARED_VERSION"

# Hot path: cached binary present.
if [ -x "$CLOUDFLARED_DIR/cloudflared" ]; then
    printf '%s\n' "$CLOUDFLARED_DIR"
    exit 0
fi

# Detect platform and pick the matching asset + digest.
os_name="$(uname -s)"
arch_name="$(uname -m)"
case "$os_name-$arch_name" in
    Linux-x86_64 | Linux-amd64)
        ASSET="cloudflared-linux-amd64"
        EXPECTED_SHA256="$SHA256_LINUX_AMD64"
        ASSET_KIND=binary
        ;;
    Linux-aarch64 | Linux-arm64)
        ASSET="cloudflared-linux-arm64"
        EXPECTED_SHA256="$SHA256_LINUX_ARM64"
        ASSET_KIND=binary
        ;;
    Darwin-arm64)
        ASSET="cloudflared-darwin-arm64.tgz"
        EXPECTED_SHA256="$SHA256_DARWIN_ARM64"
        ASSET_KIND=tarball
        ;;
    *)
        printf '\033[1;31m[reboot-plugin]\033[0m unsupported platform for cloudflared: %s-%s\n' \
            "$os_name" "$arch_name" >&2
        exit 1
        ;;
esac

mkdir -p "$PLUGIN_DATA/bin"
STAGE="$PLUGIN_DATA/bin/.cloudflared-v$CLOUDFLARED_VERSION.$$"
rm -rf "$STAGE"
# shellcheck disable=SC2064
trap "rm -rf '$STAGE'" EXIT INT TERM
mkdir -p "$STAGE"

START_SECONDS=$(date +%s)
printf '\033[1;34m[reboot-plugin]\033[0m installing pinned cloudflared %s into %s ...\n' \
    "$CLOUDFLARED_VERSION" "$CLOUDFLARED_DIR" >&2

# Verify a downloaded file's SHA-256 against an expected string.
# Best-effort: if neither `sha256sum` nor `shasum` is available
# we log a warning and skip rather than block the install.
_verify_sha256() {
    _file="$1"
    _expected="$2"
    if [ -z "$_expected" ]; then
        return 0
    fi
    if command -v sha256sum >/dev/null 2>&1; then
        _actual="$(sha256sum "$_file" | awk '{print $1}')"
    elif command -v shasum >/dev/null 2>&1; then
        _actual="$(shasum -a 256 "$_file" | awk '{print $1}')"
    else
        printf '\033[1;33m[reboot-plugin]\033[0m no sha256sum/shasum found; skipping cloudflared SHA-256 verification\n' >&2
        return 0
    fi
    if [ "$_expected" != "$_actual" ]; then
        printf '\033[1;31m[reboot-plugin]\033[0m cloudflared SHA-256 mismatch (expected %s, got %s)\n' \
            "$_expected" "$_actual" >&2
        exit 1
    fi
}

base_url="https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}"
url="${base_url}/${ASSET}"

case "$ASSET_KIND" in
    binary)
        curl -fsSL --output "$STAGE/cloudflared" "$url"
        _verify_sha256 "$STAGE/cloudflared" "$EXPECTED_SHA256"
        chmod +x "$STAGE/cloudflared"
        ;;
    tarball)
        curl -fsSL --output "$STAGE/$ASSET" "$url"
        _verify_sha256 "$STAGE/$ASSET" "$EXPECTED_SHA256"
        tar -xzf "$STAGE/$ASSET" -C "$STAGE"
        # The macOS tarball contains a single `cloudflared`
        # binary at the root, but use `find` for tolerance
        # across future layouts.
        extracted="$(find "$STAGE" -type f -name cloudflared | head -n 1)"
        if [ -z "$extracted" ]; then
            printf '\033[1;31m[reboot-plugin]\033[0m cloudflared binary not found inside %s\n' \
                "$ASSET" >&2
            exit 1
        fi
        if [ "$extracted" != "$STAGE/cloudflared" ]; then
            mv "$extracted" "$STAGE/cloudflared"
        fi
        rm -f "$STAGE/$ASSET"
        chmod +x "$STAGE/cloudflared"
        ;;
esac

# Atomically place the staged dir at `$CLOUDFLARED_DIR`. If it
# already exists, `mv` to a directory would move-INTO rather than
# rename, so guard with an explicit existence check. The tiny
# race window between check and `mv` could leave a stray
# `.cloudflared-v<version>.<pid>` subdir inside `$CLOUDFLARED_DIR`;
# that's cosmetic and doesn't affect correctness, since the cached
# binary is still at the expected path either way.
if [ ! -e "$CLOUDFLARED_DIR" ]; then
    mv "$STAGE" "$CLOUDFLARED_DIR" 2>/dev/null || :
fi

if [ ! -x "$CLOUDFLARED_DIR/cloudflared" ]; then
    printf '\033[1;31m[reboot-plugin]\033[0m failed to install cloudflared %s\n' \
        "$CLOUDFLARED_VERSION" >&2
    exit 1
fi

printf '\033[1;34m[reboot-plugin]\033[0m installed pinned cloudflared %s in %ds\n' \
    "$CLOUDFLARED_VERSION" "$(($(date +%s) - START_SECONDS))" >&2

printf '%s\n' "$CLOUDFLARED_DIR"
