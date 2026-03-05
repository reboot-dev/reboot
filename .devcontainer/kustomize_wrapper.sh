#!/bin/bash
#
# When Skaffold runs:
#   ```
#   kustomize build ...
#   ```
# We'd like it to actually invoke:
#   ```
#   kubectl kustomize ...
#   ```
# This script is a wrapper that does that.
# This extra step lets us avoid installing `kustomize` on our workstations; see
# https://github.com/reboot-dev/mono/issues/1772 for background on why that's
# a thing we want to avoid.

FIRST_ARG=$1
if [ "$FIRST_ARG" != "build" ]; then
  echo "ERROR: kustomize_wrapper.sh only supports 'build' as the first argument"
  exit 1
fi

REMAINING_ARGS=${@:2}
kubectl kustomize ${REMAINING_ARGS}
