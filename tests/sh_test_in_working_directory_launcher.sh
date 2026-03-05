#!/bin/bash
#
# See `sh_test_in_working_directory.bzl` for documentation about the purpose of
# this script. This script should only be invoked from that file.
#
# First argument: desired working directory.
# Second argument: test script to run.
set -e
set -u

# If `sh_test_in_working_directory.bzl` has not passed either the working
# directory or the script, we'll error out here due to an undefined variable;
# that would be a bug in `sh_test_in_working_directory.bzl`.
DIR=$1
SCRIPT=$2

# Check if SETUP_SCRIPT is passed as an argument.
if [ $# -ge 3 ]; then
    SETUP_SCRIPT=$3
else
    SETUP_SCRIPT=""
fi

# Execute the setup script if it exists, in a subshell to prevent 'exit' from
# terminating the main script.
if [ -n "$SETUP_SCRIPT" ]; then
    ( exec $SETUP_SCRIPT )
fi

# Execute inside the test tempdir, and copy all files (including hidden files)
# from our test directory, while breaking symlinks. We do this to prevent
# mutations of lockfiles or state, and to prevent node.js or build tools like
# esbuild/swc/etc from executing module lookups outside of the test sandbox.
#   see https://nodejs.org/api/cli.html#cli_preserve_symlinks
export SANDBOX_ROOT="$(pwd)/"

RESOLVED_DIR="${SANDBOX_ROOT}${DIR}"

cd $TEST_TMPDIR
shopt -s dotglob
cp -rL "${RESOLVED_DIR}/"* .
shopt -u dotglob

exec "${RESOLVED_DIR}/${SCRIPT}"
