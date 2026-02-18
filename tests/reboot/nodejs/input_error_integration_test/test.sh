#!/bin/bash

set -e # Exit if a command exits with an error.
set -u # Treat expanding an unset variable as an error.
set -x # Echo executed commands to help debug failures.

old_pwd=$(pwd)
cd $TEST_TMPDIR

# We need to copy all files (including hidden files) from our test directory.
shopt -s dotglob
cp -rL "${old_pwd}"/tests/reboot/nodejs/input_error_integration_test/* .
shopt -u dotglob

export REBOOT_WHL_FILE=${old_pwd}/$REBOOT_WHL_FILE
npm install --no-save ${old_pwd}/$REBOOT_NPM_PACKAGE ${old_pwd}/$REBOOT_API_NPM_PACKAGE

# When running in a Bazel test, our `.rbtrc` file ends up in a very deep
# directory structure, which can result in "path too long" errors from RocksDB.
# Explicitly specify a shorter path.
RBT_FLAGS="--state-directory=$(mktemp -d)"

output_file=$(mktemp)

# Confirm that raising in `initialize` renders a useful error.
! npx rbt $RBT_FLAGS dev run --terminate-after-health-check --env=THROW_IN_INITIALIZE=1 > "$output_file" 2>&1
grep -q 'As requested!' "$output_file" || (cat "$output_file" ; exit 1)

# Confirm that raising during Servicer construction renders a useful error.
! npx rbt $RBT_FLAGS dev run --terminate-after-health-check --env=THROW_IN_AUTHORIZER=1 > "$output_file" 2>&1
grep -q 'As requested!' "$output_file" || (cat "$output_file" ; exit 1)
