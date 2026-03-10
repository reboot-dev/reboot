#!/bin/bash
#
# This script is run when new content is available in the source tree after a
# devcontainer has been created.
#
# See documentation of lifecycle scripts like updateContent:
# https://containers.dev/implementors/json_reference/#lifecycle-scripts

set -e # Exit if a command exits with an error.
set -u # Treat expanding an unset variable as an error.
set -x # Echo executed commands to help debug failures.

# Prepare credentials that the build uses to access our bazel remote cache.
# GCP credentials are provided via a Codespaces secret:
# https://github.com/reboot-dev/mono/settings/secrets/codespaces
echo "${GCP_REMOTE_CACHE_CREDENTIALS_BASE64}" | base64 -d > "${GOOGLE_APPLICATION_CREDENTIALS}"

# Re-install local git hooks in case paths changed across updates.
.devcontainer/install_precommit_hook.sh

# When prebuilding codespaces, do some extra work to warm the cache and
# prebuild various build artifacts.
if [[ "${CODESPACE_PREBUILD:-}" == "true" ]]; then
  # Pull all submodule contents: we need this in order to build.
  git submodule update --init --recursive
  git pull --recurse-submodules

  # Run a build and test so that Codespace users start with a warm cache and
  # pre-built artifacts.
  make cache-warm
fi
