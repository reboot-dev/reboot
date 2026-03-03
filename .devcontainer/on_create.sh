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
