## `reboot` requires `certifi>=2026.10.19`

Earlier certifi releases trust `emSign ECC Root CA - G3`, whose
intermediate CAs had their keys compromised (GHSA-6q48-6c7w-9gw2), so
`reboot` now requires a certifi without it.

If any `requirements*.txt`, `requirements*.in`, `pyproject.toml`, or
`constraints*.txt` in the app pins certifi below that (e.g.
`certifi==2024.8.30` or `certifi<2026`), raise the pin to
`certifi>=2026.10.19` (or `==` the latest release), or the install
will fail to resolve.

If a `Dockerfile` in the app upgrades or pins `pip` or `uv`, pin at
least `pip==26.2.2` and `uv==0.13.4` (or `ghcr.io/astral-sh/uv:0.13.4`),
the first releases whose own bundled CA certificates drop that root.
