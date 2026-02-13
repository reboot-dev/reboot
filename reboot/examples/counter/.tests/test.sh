#!/bin/bash

set -e # Exit if a command exits with an error.
set -u # Treat expanding an unset variable as an error.
set -x # Echo executed commands to help debug failures.

# Manually install the Reboot nodejs packages. This allows us to
# install unreleased versions of the packages during tests.
if [[ -n "$REBOOT_NPM_PACKAGE" ]]; then
  REBOOT_WHL_FILE="${SANDBOX_ROOT}${REBOOT_WHL_FILE}"
  npm install --no-save \
    ${SANDBOX_ROOT}$REBOOT_NPM_PACKAGE \
    ${SANDBOX_ROOT}$REBOOT_API_NPM_PACKAGE \
    ${SANDBOX_ROOT}$REBOOT_REACT_NPM_PACKAGE \
    ${SANDBOX_ROOT}$REBOOT_WEB_NPM_PACKAGE
else
  npm install
fi

# When running in a Bazel test, our `.rbtrc` file ends up in a very deep
# directory structure, which can result in "path too long" errors from RocksDB.
# Explicitly specify a shorter path.
RBT_FLAGS="--state-directory=$(mktemp -d)"

# Ensure that the backend can start up.
npx rbt $RBT_FLAGS dev run --terminate-after-health-check

# And build the frontends.
npx vite build ./web-vite
npx next build --no-lint --experimental-build-mode=compile ./web-next
