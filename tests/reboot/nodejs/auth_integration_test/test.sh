#!/bin/bash

set -e # Exit if a command exits with an error.
set -u # Treat expanding an unset variable as an error.
set -x # Echo executed commands to help debug failures.

old_pwd=$(pwd)
cd $TEST_TMPDIR

# We need to copy all files (including hidden files) from our test directory.
shopt -s dotglob
cp -r "${old_pwd}"/tests/reboot/nodejs/auth_integration_test/* .
shopt -u dotglob

export REBOOT_WHL_FILE=${old_pwd}/$REBOOT_WHL_FILE
npm install --no-save ${old_pwd}/$REBOOT_NPM_PACKAGE ${old_pwd}/$REBOOT_API_NPM_PACKAGE

# When running in a Bazel test, our `.rbtrc` file ends up in a very deep
# directory structure, which can result in "path too long" errors from RocksDB.
# Explicitly specify a shorter path.
RBT_FLAGS="--state-directory=$(mktemp -d)"

# First confirm that we initialize successfully with the correct bearer token.
npx rbt $RBT_FLAGS dev run --terminate-after-health-check --env=TEST_BEARER_TOKEN=a_secret

# TODO: TODO: Test that we cannot run an application without a bearer token. We
# can't accurately test this as the moment because now drop the InputError
# error as we are not sure how to make it work both for Node.js and Python.
# Uncomment this code when we can properly handle that kind of error.
# See more https://github.com/reboot-dev/mono/issues/4453

# Then expunge and validate that we fail without it.
# npx rbt $RBT_FLAGS dev expunge --yes
# ! npx rbt $RBT_FLAGS dev run --terminate-after-health-check || exit 1
