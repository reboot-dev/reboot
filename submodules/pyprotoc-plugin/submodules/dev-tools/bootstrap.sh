#!/bin/bash

# Check for existence of git.
which git >/dev/null
if [[ $? != 0 ]]; then
  printf "Failed to find 'git' (please install or update your path)\n"
  exit 1
fi

# Get the path to the dev-tools directory.
dev_tools=$(dirname $0)

# We're expected to be used as a submodule and thus need to find the
# "superproject" top-level directory. In order to check for that we
# first need to change into the submodule directory itself.
cd ${dev_tools}

superproject=$(git rev-parse --show-superproject-working-tree)

# Now we can also get the absolute path to the dev-tools submodule.
directory=$(git rev-parse --show-toplevel)

if [[ -z "${superproject}" ]]; then
  printf "Expecting 'dev-tools' to be a submodule\n"
  exit 1
fi

if [[ ! -f "./pre-commit" ]]; then
  printf "You seem to be missing the 'pre-commit' file, " \
    "try pulling the latest version of 'dev-tools'\n"
  exit 1
fi

# NOTE: this symbolic link uses absolute paths which means if the
# "superproject" directory is moved then the link will fail to
# work. While a relative path will solve that problem, it won't solve
# the problem of if the 'dev-tools' submodule directory is moved
# itself, and having the absolute path be used for symbolic link will
# likely make it easier to debug that situation and realize the
# 'pre-commit' hook needs to be updated by calling this script again.
ln -s -f ${directory}/pre-commit ${superproject}/.git/hooks/pre-commit
