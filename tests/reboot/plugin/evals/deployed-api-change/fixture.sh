#!/usr/bin/env bash
# A task tracker Reboot app, deployed to Reboot Cloud, with an API, a
# servicer and an entry point. The app's files are in `fixture/`.
set -euo pipefail
HERE="$(cd "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cp -R "$HERE/fixture/." .
git init -q -b main
git -c user.email=dev@example.com -c user.name=Dev add -A
git -c user.email=dev@example.com -c user.name=Dev commit -q -m "Task tracker, deployed"
