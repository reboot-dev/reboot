#!/usr/bin/env sh
#
# Ensure a pinned Envoy binary is cached in the plugin's data
# dir. On success, prints the absolute path of the directory
# containing the binary to stdout (binary is `$ENVOY_DIR/envoy`);
# status messages go to stderr. Sourced indirectly by the
# `bin/envoy` shim.
#
# Source mix mirrors the Reboot library's resolver:
# - Linux: official `envoyproxy/envoy` GitHub releases (single
#   binary, SHA-256 from `checksums.txt.asc`).
# - macOS arm64: Tetrate's archive at `archive.tetratelabs.io`
#   (`.tar.xz` containing the binary, SHA-256 from a `.sha256`
#   sibling). Tetrate is the de facto third-party distributor
#   of Envoy macOS builds — what `func-e` consumes — and is
#   the only practical source upstream Envoy doesn't publish
#   for macOS.

set -eu

# Pinned Envoy version. Keep in sync with
# `public/reboot/settings.py` (`ENVOY_VERSION`), which is the
# library's source of truth for the resolver.
ENVOY_VERSION="1.38.2"

# `PLUGIN_DATA` is hardcoded rather than read from `$CLAUDE_PLUGIN_DATA`.
# Claude Code only sets that env var when it runs something from a
# plugin entry point — e.g. a hook command. It is *not* set when the
# agent runs a binary directly via its Bash tool, even when that binary
# happens to be a shim we ship in `bin/`. Honoring it would mean shims
# invoked from a hook write to one cache and shims invoked directly by
# the agent write to another, double-downloading the tooling. Pinning
# a fixed path keeps one shared cache.
PLUGIN_DATA="$HOME/.claude/plugins/data/reboot"
ENVOY_DIR="$PLUGIN_DATA/bin/envoy-v$ENVOY_VERSION"

# Hot path: cached binary present.
if [ -x "$ENVOY_DIR/envoy" ]; then
    printf '%s\n' "$ENVOY_DIR"
    exit 0
fi

# Detect platform.
os_name="$(uname -s)"
arch_name="$(uname -m)"
case "$os_name-$arch_name" in
    Linux-x86_64 | Linux-amd64)
        ENVOY_SOURCE=github
        ENVOY_ARCH=x86_64
        ;;
    Linux-aarch64 | Linux-arm64)
        ENVOY_SOURCE=github
        ENVOY_ARCH=aarch_64
        ;;
    Darwin-arm64)
        ENVOY_SOURCE=tetrate
        ENVOY_ARCH=darwin-arm64
        ;;
    *)
        printf '\033[1;31m[reboot-plugin]\033[0m unsupported platform for Envoy: %s-%s\n' \
            "$os_name" "$arch_name" >&2
        exit 1
        ;;
esac

mkdir -p "$PLUGIN_DATA/bin"
STAGE="$PLUGIN_DATA/bin/.envoy-v$ENVOY_VERSION.$$"
rm -rf "$STAGE"
# shellcheck disable=SC2064
trap "rm -rf '$STAGE'" EXIT INT TERM
mkdir -p "$STAGE"

START_SECONDS=$(date +%s)
printf '\033[1;34m[reboot-plugin]\033[0m installing pinned Envoy %s into %s ...\n' \
    "$ENVOY_VERSION" "$ENVOY_DIR" >&2

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
        return 0
    fi
    if [ "$_expected" != "$_actual" ]; then
        printf '\033[1;31m[reboot-plugin]\033[0m Envoy SHA-256 mismatch (expected %s, got %s)\n' \
            "$_expected" "$_actual" >&2
        exit 1
    fi
}

case "$ENVOY_SOURCE" in
    github)
        binary_name="envoy-${ENVOY_VERSION}-linux-${ENVOY_ARCH}"
        base_url="https://github.com/envoyproxy/envoy/releases/download/v${ENVOY_VERSION}"
        curl -fsSL --output "$STAGE/envoy" "${base_url}/${binary_name}"
        # The PGP-signed manifest's lines look like
        # `<sha256>  /tmp/.../bin/envoy-<version>-linux-<arch>`.
        # We verify SHA-256 only — verifying the PGP signature
        # would require importing maintainer keys, out of scope.
        expected="$(
            curl -fsSL "${base_url}/checksums.txt.asc" 2>/dev/null |
                grep "/${binary_name}\$" |
                awk '{print $1}'
        )"
        _verify_sha256 "$STAGE/envoy" "$expected"
        chmod +x "$STAGE/envoy"
        ;;
    tetrate)
        tarball="envoy-v${ENVOY_VERSION}-${ENVOY_ARCH}.tar.xz"
        base_url="https://archive.tetratelabs.io/envoy/download/v${ENVOY_VERSION}"
        url="${base_url}/${tarball}"
        curl -fsSL --output "$STAGE/$tarball" "$url"
        # Tetrate publishes a `.sha256` sibling whose first
        # whitespace-separated field is the digest.
        expected="$(
            curl -fsSL "${url}.sha256" 2>/dev/null |
                awk 'NR==1 {print $1}'
        )"
        _verify_sha256 "$STAGE/$tarball" "$expected"
        tar -xJf "$STAGE/$tarball" -C "$STAGE"
        # Internal layout is `envoy-v<version>-<platform>/bin/envoy`,
        # but use `find` for tolerance across Tetrate releases.
        extracted="$(find "$STAGE" -type f -name envoy -perm -u+x | head -n 1)"
        if [ -z "$extracted" ]; then
            printf '\033[1;31m[reboot-plugin]\033[0m envoy binary not found inside %s\n' \
                "$tarball" >&2
            exit 1
        fi
        mv "$extracted" "$STAGE/envoy.bin"
        rm -rf "$STAGE/$tarball" "$STAGE/envoy-v${ENVOY_VERSION}-${ENVOY_ARCH}"
        mv "$STAGE/envoy.bin" "$STAGE/envoy"
        chmod +x "$STAGE/envoy"
        ;;
esac

# Same atomic-rename guard as `install_uv.sh`.
if [ ! -e "$ENVOY_DIR" ]; then
    mv "$STAGE" "$ENVOY_DIR" 2>/dev/null || :
fi

if [ ! -x "$ENVOY_DIR/envoy" ]; then
    printf '\033[1;31m[reboot-plugin]\033[0m failed to install Envoy %s\n' \
        "$ENVOY_VERSION" >&2
    exit 1
fi

printf '\033[1;34m[reboot-plugin]\033[0m installed pinned Envoy %s in %ds\n' \
    "$ENVOY_VERSION" "$(($(date +%s) - START_SECONDS))" >&2

printf '%s\n' "$ENVOY_DIR"
