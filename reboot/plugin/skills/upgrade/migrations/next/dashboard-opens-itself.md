## `rbt dev run` no longer opens the dashboard

The developer dashboard is started by `rbt dashboard`, which now
opens the browser itself once it is serving — unless somebody is
already looking at one, or the page's "Don't reopen automatically"
notice said not to. `rbt dev run`'s `--open-dashboard` and
`--dashboard-port` flags are gone. Passing either is now an
unknown-flag error, so a `.rbtrc` carrying one makes every
`rbt dev run` fail.

Grep the project's `.rbtrc` (and any script or CI step that runs
`rbt dev run`) for `--open-dashboard`, `--no-open-dashboard` and
`--dashboard-port`, and delete those flags. A line that is nothing
but one of them goes away entirely; a `dev run` line that carries
one alongside other flags keeps the rest.

To get a dashboard, run `rbt dashboard` in its own terminal — it
needs no flags, watches the API directory named by the
`generate <dir>` line in `.rbtrc`, and serves on port 9871
(`--port=<port>` to move it).
