#!/bin/bash -eu
#
# Update a Rye project's lockfiles to match the dependencies of the latest
# (unreleased) version of the 'reboot' Python package.

wheel_path="$(pwd)/$1"
cd $BUILD_WORKING_DIRECTORY

reboot_version="$2"

if [[ ! -f "pyproject.toml" ]]; then
  echo "Please run this command in a Rye project directory." >&2
  exit 1
fi

mutated_files="requirements.lock requirements-dev.lock pyproject.toml"
if ! git diff --quiet -- $mutated_files; then
  echo "This command will overwrite [$mutated_files], but they are currently dirty." >&2
  exit 1
fi

rye remove --no-sync reboot || true
rye add reboot --absolute --path="$wheel_path"
rye remove --no-sync --dev reboot || true
rye add --dev reboot --absolute --path="$wheel_path"

# The various files have been updated and are now correct, EXCEPT that they are
# now pointing at an unreleased `.whl` file instead of the desired plain version
# number. Update just the lines pointing at the `.whl` file to instead use the
# version number.
sed -i "s|reboot @ .*|reboot==$reboot_version|" requirements.lock
sed -i "s|reboot @ .*|reboot==$reboot_version|" requirements-dev.lock
sed -i "s|\"reboot @ .*\"|\"reboot==$reboot_version\"|" pyproject.toml
