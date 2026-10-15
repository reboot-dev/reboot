## `mypy` was skipping the API definition; the Vite dev server binds IPv6-only

Two configuration files that earlier project templates generated are
subtly wrong. Neither failure is visible: the first reports success
while checking nothing, the second starts a server the browser cannot
reach.

### 1. Make `mypy` actually check the API definition

Look at the project-root `.mypy.ini`. Two things need to be true, and
in older projects neither is:

- `mypy_path` must include the project-root `api/` directory — the
  one holding the hand-written pydantic API definition, not just the
  generated `backend/api/`. Append `:api` to the existing value, e.g.
  `mypy_path = backend/tests:backend/src:backend/api:api`.
- The "don't check generated code" stanza must name the generated
  module only. If the file has a blanket
  `[mypy-<pkg>.v1.*]`, narrow it to `[mypy-<pkg>.v1.<name>_rbt]`,
  where `<name>` is the API definition's module name (the file under
  `api/<pkg>/v1/`). Repeat per API package.

Together these two mistakes made every import of a state or request
model — `from <pkg>.v1.<name> import <X>State` — resolve to `Any`.
Any annotation mentioning one checked nothing, and a misspelled field
on `state` passed a green `mypy` run.

To confirm the fix is live, temporarily add a bogus attribute access
on a state model (e.g. `state.no_such_field_xyz` in a servicer or
authorizer predicate) and run `mypy` from the project root: it must
report `has no attribute`. Remove the bogus line afterwards.

**Expect newly-reported errors.** Code that was never type-checked is
now checked for the first time, so this can surface real mistakes.
Fix them rather than re-widening the ignore stanza.

### 2. Let the browser reach the Vite dev server

Applies to apps with a standalone web frontend (a `web/`, or whatever
directory `generate --react=` points into, served by Vite).

If `vite.config.ts` has no `server.host`, add one:

```ts
export default defineConfig({
  // ...existing plugins/resolve config...
  server: {
    // Listen on every interface. Vite's default is `localhost`,
    // which on modern Node resolves to IPv6 `[::1]` only; a
    // forwarded port (Codespaces, VS Code remote, a dev VM, a
    // tunnel) connects over IPv4 `127.0.0.1` and gets connection
    // refused.
    host: true,
    port: parseInt(process.env.PORT || "5173", 10),
  },
});
```

Without it `npm run dev` prints a URL and logs no error, but the page
is unreachable from a browser on the other side of a forwarded port.
