#!/bin/bash -eu
#
# Update a uv project's `uv.lock` to match the dependencies of the
# latest (just released) version of the 'reboot' Python package.
#
# This must run after the new 'reboot' version has been published to
# PyPI, since `uv` resolves the new version from there.

cd $BUILD_WORKING_DIRECTORY

reboot_version="$1"

if [[ ! -f "pyproject.toml" ]]; then
  echo "Please run this command in a uv project directory." >&2
  exit 1
fi

if [[ ! -f "uv.lock" ]] || ! grep -q '"reboot' pyproject.toml; then
  echo "Skipping: not a uv project that depends on 'reboot'."
  exit 0
fi

mutated_files="uv.lock pyproject.toml"
if ! git diff --quiet -- $mutated_files; then
  echo "This command will overwrite [$mutated_files], but they are currently dirty." >&2
  exit 1
fi

# Point the project at the just-released version of 'reboot' and
# re-resolve the lockfile.
uv add --no-sync "reboot==$reboot_version"
uv lock
