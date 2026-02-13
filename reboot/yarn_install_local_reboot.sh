#!/bin/bash

###
# Install all Reboot packages w/ `yarn` into the local `package.json` and `node_modules`.
###

set -e # Exit if a command exits with an error.
set -u # Treat expanding an unset variable as an error.
set -x # Echo executed commands to help debug failures.

BASE_DIR="$(pwd)"

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

RESOLUTIONS=""
for arg in $@; do
  IFS="," read -r descriptor resolution <<< "${arg}"
  RESOLUTIONS=$(echo -e "${RESOLUTIONS}\n\"${descriptor}\": \"${BASE_DIR}/${resolution}\",")
done

cat > .jq_filter.txt <<EOF
  . + {
    "resolutions": {${RESOLUTIONS}
    }
  }
EOF
jq -f .jq_filter.txt package.json > package.json.tmp
mv package.json.tmp package.json
rm .jq_filter.txt

# Install the packages.
yarn

# Then, run `yarn rbt` once to trigger installation of our wheel.
#
# We do this in the `backend` directory in order to support directory
# structures where backend has its own `package.json` where
# @reboot-dev/reboot is installed.
cd backend

REBOOT_WHL_FILE="${BASE_DIR}/${REBOOT_WHL_FILE}" REBOOT_FORCE_REINSTALL=TRUE \
  yarn rbt dev --help
