"""Fetches workstation secrets from Google Secret Manager.

Reads PROJECT and TOKEN (a service-account access token) from the
environment and prints a ready-to-source `export NAME='value'` line for
every secret labelled `workstation-env=true`.
"""

import base64
import json
import os
import re
import sys
import urllib.error
import urllib.request
from typing import Any

_API = "https://secretmanager.googleapis.com/v1"
_VALID_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _get(url: str, token: str) -> Any:
    request = urllib.request.Request(
        url,
        headers={"Authorization": "Bearer " + token},
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.load(response)


def main() -> int:
    project = os.environ["PROJECT"]
    token = os.environ["TOKEN"]

    try:
        listing = _get(
            f"{_API}/projects/{project}/secrets"
            "?filter=labels.workstation-env%3Dtrue&pageSize=500",
            token,
        )
    except urllib.error.URLError as error:
        print(f"# listing secrets failed: {error}", file=sys.stderr)
        return 1

    lines = []
    for secret in listing.get("secrets", []):
        name = secret["name"].rsplit("/", 1)[1]
        if not _VALID_NAME.match(name):
            print(
                f"# skipped '{name}': not a valid env var name",
                file=sys.stderr,
            )
            continue
        try:
            version = _get(
                f"{_API}/projects/{project}/secrets/{name}"
                "/versions/latest:access",
                token,
            )
            value = base64.b64decode(version["payload"]["data"]).decode()
        except Exception as error:  # noqa: BLE001 (skip unreadable secret)
            print(f"# skipped '{name}': {error}", file=sys.stderr)
            continue
        # Single-quote the value, escaping any embedded single quotes.
        escaped = value.replace("'", "'\\''")
        lines.append(f"export {name}='{escaped}'")

    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    sys.exit(main())
