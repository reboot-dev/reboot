#!/bin/bash

set -e # Exit if a command exits with an error.
set -u # Treat expanding an unset variable as an error.
set -x # Echo executed commands to help debug failures.

# Use the published Reboot npm package by default, but allow the
# test system to override them with a different value.
if [ -n "$REBOOT_NPM_PACKAGE" ]; then
  REBOOT_WHL_FILE="${SANDBOX_ROOT}$REBOOT_WHL_FILE"
  npm install --no-save \
    ${SANDBOX_ROOT}$REBOOT_NPM_PACKAGE \
    ${SANDBOX_ROOT}$REBOOT_API_NPM_PACKAGE
else
  npm install
fi

npx rbt generate

# Run the type check only.
npx tsc

npx tsx backend/tests/test.ts
