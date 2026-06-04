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

# Retag the wheel with a `+dev.<timestamp>` local-version suffix so that
# every rebuild produces a unique version. Without this, `uv` and other
# consumers would treat re-published wheels with the same version as a
# cache hit and skip reinstalling.
RETAG_WHEEL=$(find "$RUNFILES" -name "retag_wheel.py" -print -quit)
if [[ -z "$RETAG_WHEEL" ]]; then
  echo "ERROR: retag_wheel.py not found in runfiles at $RUNFILES" >&2
  exit 1
fi
DEV_VERSION_SUFFIX="+dev.$(date +%s)"

while IFS= read -r -d '' whl; do
  python3 "$RETAG_WHEEL" \
    --input-wheel "$whl" \
    --version-suffix "$DEV_VERSION_SUFFIX" \
    --output-directory "$STAGE_DIR/wheels" >/dev/null
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
echo "Set the following to use your local packages:"
echo
echo "  export NPM_CONFIG_REGISTRY='$VERDACCIO_URL'"
echo "  export UV_FIND_LINKS='$STAGE_DIR/wheels'"
echo
echo "Then update:"
echo
echo "  uv sync --upgrade-package=reboot"
