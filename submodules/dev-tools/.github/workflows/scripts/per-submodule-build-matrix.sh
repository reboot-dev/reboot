#!/bin/bash

# We'll print some debug information along the way.
echo "Started in working directory '$(pwd)'..."

# Assumption: this script is being run from _inside_ a submodule, but is
# supposed to act on the repo that _contains_ that submodule. Change our working
# directory accordingly.
cd "$(git rev-parse --show-toplevel)/.."

gitmodules_path="$(git rev-parse --show-toplevel)/.gitmodules"
echo "Assumed relevant '.gitmodules' file is '$gitmodules_path'"

# Update references.
git submodule update --recursive --remote

# The following condition is needed to set required outputs.
# The step generates one output: `path_matrix`.
# `path_matrix` output contains list of all submodules within a repo.
# The flag is used by the main build job.
output=$( \
    echo "path_matrix=[$(git config --file "$gitmodules_path" --get-regexp path | \
      awk '{ print $2 }' | \
      awk '{ printf "%s\"%s\"", (NR==1?"":", "), $0 } END{ print "" }')]" \
)
echo "####"
echo $output
echo "####"
echo $output >> $GITHUB_OUTPUT
