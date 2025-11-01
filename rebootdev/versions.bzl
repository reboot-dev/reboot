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
# ATTENTION: if you change this version number, you must run 'make versions'.
#
# NOTE: if this variable name is ever changed, it must also be updated in
# tests/reboot/versions_test.py and in bazel/release_scripts/update_versions.py.
REBOOT_VERSION = "0.39.0"
