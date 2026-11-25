## Anthropic agents install `reboot[anthropic]`

The `reboot` package now ships the Anthropic SDK as the
`reboot[anthropic]` extra, at the version that works with the
`pydantic-ai-slim` release `reboot` pins. Pydantic AI 1.x hands the
SDK an `httpx` client; Anthropic SDK releases from 1.0 on are built
on `httpx2` and reject it, so a project that resolves the SDK itself
fails on its first model call with "Invalid `http_client` argument".

If the project's Python dependencies list `pydantic-ai-slim[anthropic]`
(any version) or `anthropic`, remove those entries and add the
`anthropic` extra to the project's `reboot` requirement, keeping its
version pin: `reboot==<version>` becomes `reboot[anthropic]==<version>`,
and a requirement that already has extras adds it to the list, e.g.
`reboot[anthropic,dev]==<version>`. Then run `uv lock` (or the
project's equivalent) so the lock file records the extra.
