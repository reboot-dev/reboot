#!/usr/bin/env bash
# A Reboot app with its Profile API written and nothing else: no
# servicer and no entry point yet. A profile's state id is its owner's
# user id. The app's files are in `fixture/`.
set -euo pipefail
HERE="$(cd "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cp -R "$HERE/fixture/." .
git init -q -b main
git -c user.email=dev@example.com -c user.name=Dev add -A
git -c user.email=dev@example.com -c user.name=Dev commit -q -m "Profile API"
