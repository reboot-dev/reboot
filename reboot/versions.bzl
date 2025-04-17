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
#  * reboot/benchmarks/package.json
#  * reboot/cli/init/templates/package.json.j2
#  * reboot/cli/init/templates/backend_package.json.j2
#  * reboot/cloud/web/package.json
#  * reboot/cloud/web/src/gen/rbt/v1alpha1/package.json
#  * reboot/demos/fig/package.json
#  * reboot/examples/bank/pyproject.toml
#  * reboot/examples/bank/web/package.json
#  * reboot/examples/bank-nodejs/package.json
#  * reboot/examples/boutique/Dockerfile
#  * reboot/examples/boutique/pyproject.toml
#  * reboot/examples/boutique/web/package.json
#  * reboot/examples/counter/package.json
#  * reboot/examples/docubot/package.json
#  * reboot/examples/docubot/api/package.json
#  * reboot/examples/docubot/docubot/package.json
#  * reboot/examples/hello/pyproject.toml
#  * reboot/examples/hello/web/package.json
#  * reboot/examples/hello-nodejs/package.json
#  * reboot/examples/monorepo/pyproject.toml
#  * reboot/examples/hello/Dockerfile
#  * reboot/examples/hello-nodejs/Dockerfile
#  * reboot/examples/prosemirror/web/package.json
#  * reboot/examples/prosemirror/backend/package.json
#  * reboot/nodejs/package.json
#  * reboot/std/package.json
#  * reboot/std/react/package.json
#  * reboot/web/package.json
#  * rbt/std/package.json
#  * rbt/v1alpha1/package.json
#  * charts/reboot/Chart.yaml
#  * tests/reboot/nodejs/input_error_integration_test/package.json
#  * tests/reboot/nodejs/auth_integration_test/package.json
#  * tests/reboot/greeter_rbt.golden.py
#  * tests/reboot/echo_rbt.golden.py
#  (And possibly others)
#
# NOTE: if this variable name is ever changed, it must also be updated in
# tests/reboot/versions_test.py.
REBOOT_VERSION = "0.25.1"
