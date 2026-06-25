## `generate --react-extensions` is no longer needed for Vite frontends

Reboot's React frontends — including AI Chat App UIs — build with
Vite (or are type-checked by `tsc` under `moduleResolution: "bundler"`
/ `"node"`), all of which resolve the generated client's relative
imports without explicit `.js` file extensions. The
`generate --react-extensions` flag, which adds those extensions, is
now only relevant to webpack + `ts-loader` setups, and `rbt generate`
rejects it outright when a `--mobile` (React Native) client is also
requested — Metro cannot resolve the `.js`-suffixed imports back to
their `.ts` sources.

If your `.rbtrc` contains a `generate --react-extensions` line and
your web frontend builds with Vite (the default for Reboot React and
AI Chat Apps), remove that line:

```
generate --react-extensions
```

Do **not** remove it in either of these cases:

- You bundle the React client with webpack/`ts-loader`, which needs
  the extensions.
- Your `--react` target writes to the **same output directory** as a
  `--nodejs` (or `--web`) target that uses extensions — e.g.
  `generate --react=api` and `generate --nodejs=api` both into `api/`.
  Reboot requires every target sharing a directory to agree on their
  `--*-extensions` setting, so the React client must keep extensions
  to match the Node.js one. (Generate the React client into its own
  directory if you want to drop them.)

Leave any `generate --nodejs-extensions` line untouched: Node.js
clients run directly under Node's ESM loader and still require it.
