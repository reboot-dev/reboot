#!/bin/bash

###
# Install all Reboot packages w/ `npm` into the local `package.json` and `node_modules`.
###

set -e # Exit if a command exits with an error.
set -u # Treat expanding an unset variable as an error.
set -x # Echo executed commands to help debug failures.

BASE_DIR="$(pwd)"

# Absolutize the NPM package names.
NPM_PACKAGES=""
for npm_package_file in $@; do
  NPM_PACKAGES="${NPM_PACKAGES} ${BASE_DIR}/${npm_package_file}"
done

cd $BUILD_WORKING_DIRECTORY

if [ ! -f ./package.json ]; then
  echo "This script must be run from the root of a node project (where the" \
       "'package.json' is)."
  pwd
  ls -la
  exit 1
fi

# Delete the old `node_modules` directory; if we don't, previous versions of the
# Reboot libraries we'd installed will not get overwritten.
rm -rf node_modules/

# Install the packages.
npm install --no-save $NPM_PACKAGES

# Then, run `npx rbt` once to trigger installation of our wheel.
REBOOT_WHL_FILE="${BASE_DIR}/${REBOOT_WHL_FILE}" REBOOT_FORCE_REINSTALL=TRUE \
  npx rbt dev --help > /dev/null
