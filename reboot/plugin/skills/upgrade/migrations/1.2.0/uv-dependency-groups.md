## Python apps: declare dev dependencies for `uv`

Reboot's Python examples now declare dev dependencies in a PEP 735
`[dependency-groups]` table in `pyproject.toml`, which `uv sync`
installs by default so that `uv run pytest` works out of the box.
If the app's `pyproject.toml` has dev dependencies only under
`[tool.rye]`'s `dev-dependencies`, add a mirroring table:

```toml
[dependency-groups]
dev = [
    "pytest>=7.4",
]
```
