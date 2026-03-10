#!/bin/bash

set -e # Exit if a command exits with an error.
set -u # Treat expanding an unset variable as an error.
set -x # Echo executed commands to help debug failures.

# If they are defined, force the Reboot nodejs packages to be used. This allows
# us to install unreleased versions of the packages during tests.
if [[ -n "$REBOOT_NPM_PACKAGE" ]]; then
  REBOOT_WHL_FILE="${SANDBOX_ROOT}${REBOOT_WHL_FILE}"
  cat > .jq_filter.txt <<EOF
  . + {
    "resolutions": {
      "@reboot-dev/reboot": "${SANDBOX_ROOT}$REBOOT_NPM_PACKAGE",
      "@reboot-dev/reboot-api": "${SANDBOX_ROOT}$REBOOT_API_NPM_PACKAGE",
      "@reboot-dev/reboot-react": "${SANDBOX_ROOT}$REBOOT_REACT_NPM_PACKAGE",
      "@reboot-dev/reboot-web": "${SANDBOX_ROOT}$REBOOT_WEB_NPM_PACKAGE",
    }
  }
EOF
  jq -f .jq_filter.txt package.json > package.json.tmp
  mv package.json.tmp package.json
fi

# Install the dependencies.
yarn install

# Ensure that the backend can start up.
pushd backend
  # When running in a Bazel test, our `.rbtrc` file ends up in a very deep
  # directory structure, which can result in "path too long" errors from RocksDB.
  # Explicitly specify a shorter path.
  RBT_FLAGS="--state-directory=$(mktemp -d)"

  yarn run rbt $RBT_FLAGS dev run --terminate-after-health-check
popd

# And build the frontend.
pushd web
  yarn run next build --no-lint --experimental-build-mode=compile
popd
