#!/bin/bash
#
# This script is run after a devcontainer has been created. It performs
# post-creation initialization.

set -e # Exit if a command exits with an error.
set -u # Treat expanding an unset variable as an error.
set -x # Echo executed commands to help debug failures.

# Make sure all of the submodules are here.
git submodule update --init --recursive

# Set up ease-of-use environmental preferences.
.devcontainer/git_config.sh

# Ensure local git hooks match the current repository layout.
.devcontainer/install_precommit_hook.sh

# `/dev/kvm` is mapped into the container from the host (see the
# `runArgs` in `devcontainer.json`) so the Android emulator used by the
# React Native example tests can use hardware acceleration. A `--device`
# mount keeps the host's group ownership on the node, so on hosts whose
# `kvm` group GID differs from the container's (notably GitHub-hosted CI
# runners), `vscode`'s membership in the container `kvm` group does not
# grant access and the emulator aborts with a KVM permission error. Open
# up the device so any container user can use it; this is an ephemeral
# CI/dev container, so loosening the device permissions is fine.
if [ -e /dev/kvm ]; then
  sudo chmod 666 /dev/kvm
fi

# Point Bazel at a shared on-disk action cache. Our dev workflow spins
# up many git worktrees -- one per parallel agent or session -- and
# each is a separate Bazel workspace with its own output base, so a
# worktree's first build otherwise reruns every action from cold. One
# content-addressed `--disk_cache` lets a worktree reuse actions that
# another worktree already built. It lives in the home Bazel rc, which
# Bazel reads for every workspace, rather than a checked-in `.bazelrc`,
# because the cache path must be absolute and machine-specific.
#
# TODO: once we migrate to Bazel 7+, cap this cache's size with
# `--experimental_disk_cache_gc_max_size` (and let Bazel's built-in
# garbage collector evict old entries). Bazel 6.5.0 has no cache GC, so
# until then prune `~/.cache/bazel/disk` by hand if it grows too large.
disk_cache_line="build --disk_cache=$HOME/.cache/bazel/disk"
if ! grep -qxF "$disk_cache_line" "$HOME/.bazelrc" 2>/dev/null; then
  echo "$disk_cache_line" >>"$HOME/.bazelrc"
fi
