# Pending migration fragments

This directory collects **migration fragments**: instructions for
upgrading an existing Reboot application past a not-yet-released
change. If your PR changes something that existing applications must
react to — an API rename, a changed default, a new required file, a
`.rbtrc` change, anything a `reboot==<old>` app would have to do
beyond bumping its pin and regenerating — add a fragment **in the
same PR**.

One file per PR, named `<short-slug>.md` (e.g. `rename-foo-option.md`;
separate files avoid merge conflicts between concurrent PRs). Write
the fragment for a coding agent to execute: imperative steps, with
grep-able before/after patterns. For example:

```markdown
## `Foo.bar()` was renamed to `Foo.baz()`

If any file under `backend/` calls `.bar(` on a `Foo` reference,
rename the call to `.baz(`. Arguments are unchanged.
```

Do NOT include "bump the version pin", "run `rbt generate`", or "run
the tests" steps — the `upgrade` skill always does those once at the
end of an upgrade.

At release time, `make versions` (via
`bazel run //bazel/release_scripts:roll_migrations`) moves the
fragments here into `../<REBOOT_VERSION>/`. When a release has no
fragments, no directory is created. This `README.md` stays in place.
