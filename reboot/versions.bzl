"""
This file contains a version number that will be referred to by multiple
packages in multiple BUILD.bazel files.
"""
# This shared version number must be declared in a `*.bzl` file for other
# Bazel files (notably `BUILD.bazel` files) to be able to import it.

# Unlike Python's PyPI, the NPM version number has a source of truth in
# a package.json file. We still use the version number here for testing
# purposes.

# This NPM version number _must be exactly_ the same as what is in the
# package.json files listed below.

# PyPI will enforce that each version number is only used once; if the
# package changes (or the way we build the package changes), we must
# increment the version number before we publish.
#
# ATTENTION: if you change this version number, you must also change it in:
#  * reboot/cli/init/templates/package.json.j2
#  * reboot/cli/init/templates/backend_package.json.j2
#  * reboot/demos/bank/pyproject.toml
#  * reboot/demos/bank/web/package.json
#  * reboot/examples/boutique/pyproject.toml
#  * reboot/examples/boutique/web/package.json
#  * reboot/examples/hello-nodejs/package.json
#  * reboot/examples/hello/pyproject.toml
#  * reboot/examples/hello/web/package.json
#  * reboot/examples/monorepo/pyproject.toml
#  * reboot/nodejs/package.json
#  * rbt/v1alpha1/package.json
#  * charts/reboot/Chart.yaml
#  (And possibly others)
#
# NOTE: if this variable name is ever changed, it must also be updated in
# tests/reboot/versions_test.py.
REBOOT_VERSION = "0.18.0"
