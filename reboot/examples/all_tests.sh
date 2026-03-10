#!/bin/bash
#
# A script to run all the tests in all of the examples without using Bazel.
# This is useful for our CI system, which runs the examples inside multiple
# different Docker containers.

set -e # Exit if a command exits with an error.
set -u # Treat expanding an unset variable as an error.
set -x # Echo executed commands to help debug failures.

# Check that this script has been invoked with the right working directory, by
# checking that the expected subdirectories exist.
ls -l bank-pydantic/ bank-zod/ docubot/ bank-nodejs/ boutique/ chat-room/ chat-room-nodejs/ monorepo/ 2> /dev/null > /dev/null || {
  echo "ERROR: this script must be invoked from the 'reboot/examples' directory."
  echo "Current working directory is '$(pwd)'."
  ls
  exit 1
}

# In this environment, all paths are already absolute, and do not need a prefix.
export SANDBOX_ROOT=""

# Run all of the tests.
sh -c 'cd bank-pydantic && ./.tests/test.sh'
sh -c 'cd bank-zod && ./.tests/test.sh'
sh -c 'cd docubot && ./.tests/test.sh'
sh -c 'cd bank-nodejs && ./.tests/test.sh'
sh -c 'cd boutique && ./.tests/test.sh'
sh -c 'cd chat-room && ./.tests/test.sh'
sh -c 'cd chat-room-nodejs && ./.tests/test.sh'
sh -c 'cd monorepo && ./.tests/all_pytests.sh'
