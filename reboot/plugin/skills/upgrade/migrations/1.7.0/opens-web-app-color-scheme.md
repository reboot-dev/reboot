## `opens the web app` now says the color scheme

The built-in step `"<user>" opens the web app`, optionally with
`at "/path"`, now ends in ` in light mode` or ` in dark mode`, and a
step without that suffix no longer matches. In every `.feature` file
under `tests/`, append ` in light mode` to each such step, after the
`at "..."` when there is one:

- `When "alice" opens the web app` -> `When "alice" opens the web app in light mode`
- `When "alice" opens the web app at "/accounts"` -> `When "alice" opens the web app at "/accounts" in light mode`

Light mode is what the browser was in before, so this keeps every
recording as it was. If a test module overrides pytest-playwright's
`browser_context_args` fixture only to set `color_scheme`, drop the
override and say ` in dark mode` in the steps that want it instead.
