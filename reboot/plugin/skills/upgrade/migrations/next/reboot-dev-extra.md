## Development environments install `reboot[dev]`

The `reboot` package now ships what a development environment needs
beyond the runtime as the `reboot[dev]` extra: today, the packages
that `reboot.bdd` (Gherkin tests with pytest-bdd) and the dashboard's
Features page run on. `rbt dashboard` refuses to start without it,
and `rbt dev run` says so. An application packaged for `rbt serve`
keeps installing plain `reboot` and carries none of it.

Where the project declares its Python dependencies, add `reboot[dev]`
with the same version pin as `reboot`, in the development group when
the project has one. For a `pyproject.toml` managed by `uv`:

```toml
[project]
dependencies = [
    "reboot==<version>",
]

[dependency-groups]
dev = [
    "reboot[dev]==<version>",
]
```

Then run `uv lock` (or the project's equivalent) so the lock file
records the extra. A project with a single dependency list may put
`reboot[dev]==<version>` in place of `reboot==<version>`, at the cost
of shipping the extra's packages with the application.
