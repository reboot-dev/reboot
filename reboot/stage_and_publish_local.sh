#!/bin/bash
#
# Stage locally-built Reboot artifacts (wheel + npm tarballs) into
# `$STAGE_DIR` and publish the tarballs to Verdaccio.
#
# Intended to be invoked via `bazel run` or `ibazel run`. Bazel
# supplies the artifacts as data deps, so they live in this script's
# runfiles tree.
#
# Required environment variables (set by `local-reboot.sh`):
#   STAGE_DIR          Staging directory for wheels/ and npm/
#   VERDACCIO_URL      Verdaccio registry URL
#   VERDACCIO_STORAGE  Verdaccio storage directory (wiped + recreated)
#   PUBLISH_NPMRC      .npmrc with auth token for publishing

set -euo pipefail

: "${STAGE_DIR:?STAGE_DIR must be set}"
: "${VERDACCIO_URL:?VERDACCIO_URL must be set}"
: "${VERDACCIO_STORAGE:?VERDACCIO_STORAGE must be set}"
: "${PUBLISH_NPMRC:?PUBLISH_NPMRC must be set}"

# Runfiles root: Bazel exposes data deps here.
RUNFILES="${RUNFILES_DIR:-${0}.runfiles}"

rm -rf "$STAGE_DIR/wheels" "$STAGE_DIR/npm"
mkdir -p "$STAGE_DIR/wheels" "$STAGE_DIR/npm"

# Copy the wheel and all tarballs from runfiles into staging.
while IFS= read -r -d '' whl; do
  cp "$whl" "$STAGE_DIR/wheels/"
done < <(find "$RUNFILES" -name "reboot-*.whl" -print0)

while IFS= read -r -d '' tgz; do
  cp "$tgz" "$STAGE_DIR/npm/"
done < <(find "$RUNFILES" -name "reboot-dev-*.tgz" -print0)

if ! ls "$STAGE_DIR/wheels/"*.whl >/dev/null 2>&1; then
  echo "ERROR: No wheel found in runfiles at $RUNFILES" >&2
  exit 1
fi

# Wipe Verdaccio storage so republishing the same version works.
rm -rf "$VERDACCIO_STORAGE"
mkdir -p "$VERDACCIO_STORAGE"

for tgz in "$STAGE_DIR/npm/"*.tgz; do
  npm publish "$tgz" --registry "$VERDACCIO_URL" \
    --userconfig "$PUBLISH_NPMRC" 2>&1 \
    || echo "    WARNING: Failed to publish $(basename "$tgz")"
done

# Clear cached @reboot-dev npx packages so consumers
# fetch the fresh version from Verdaccio.
find ~/.npm/_npx -path '*/@reboot-dev' -type d -exec rm -rf {} + 2>/dev/null || true

echo "==> Published to local registry."
