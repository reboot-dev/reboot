---
name: upgrade
description: Upgrade an existing Reboot application to the latest Reboot version. Use when `rbt` prints "A newer Reboot (X.Y.Z) is available", when an application refuses to start because its `reboot` version does not match the `rbt` CLI, or when the user asks to upgrade/update Reboot. First talks the developer through updating the plugin itself when it is out of date, then applies the migration steps each intermediate release needs, bumps every version pin to the exact version the plugin ships, regenerates code, and runs the tests.
argument-hint: [<project-directory>]
allowed-tools: Bash, Read, Write, Glob, Grep, Edit, AskUserQuestion
---

# upgrade — Upgrade a Reboot Application

Upgrade an existing Reboot application to the latest Reboot version.
This skill is the single authoritative upgrade procedure; follow it
whenever:

- `rbt` prints `A newer Reboot (X.Y.Z) is available; ...`, or
- an application refuses to start with `This application depends on reboot <X>, but it is being run by an rbt CLI at version <Y>`, or
- the user asks to upgrade or update Reboot.

How urgently to react depends on the trigger:

- A version mismatch is blocking: the application cannot run until
  the versions agree, so switch to this skill unconditionally.
- A `newer Reboot is available` notice is not: ask the developer at a
  convenient moment whether they'd like to upgrade, and don't block
  iteration on the application if they decline.

Either way, never start an upgrade without the developer's approval.

The upgrade has two halves, in a fixed order: first make sure the
**plugin** is current (steps 1–2), then bring the **application** up
to the plugin's version (steps 3–8).

## Step 1 — Is this plugin itself up to date?

This plugin's own version is the content of the `VERSION` file at
the root of this plugin: `${CLAUDE_PLUGIN_ROOT}/VERSION` in Claude
Code, or two directories above this `SKILL.md` file otherwise.

Determine whether a newer Reboot release exists by asking PyPI for
the latest released `reboot` version and comparing it to `VERSION`:

```bash
curl -fsSL --max-time 5 https://pypi.org/pypi/reboot/json |
    python3 -c 'import json, sys; print(json.load(sys.stdin)["info"]["version"])'
```

If PyPI is unreachable, note that and continue with step 3 — the
plugin's `VERSION` is still a valid (if possibly stale) target.

## Step 2 — If the plugin is out of date, update it first

If PyPI's latest version is newer than `VERSION`, the plugin must be
updated **before** the application is touched: the new release's
migration notes (and skills matching the new Reboot) only arrive
with the new plugin. Talk the developer through it — the update and
the restart are theirs to perform:

1. Re-run the installer:

   ```bash
   curl -fsSL https://reboot.dev/install.sh | bash
   ```

   (In Claude Code, `claude plugin update reboot@reboot-plugin` is
   equivalent.)

2. Restart the agent session so the updated plugin loads.
3. Run this skill again — it will now pass step 1 and proceed to
   upgrade the application.

Stop here if an update of the plugin is necessary.

## Step 3 — Determine the application's current version

Work in the directory the user named, or the current directory. The
project root is the directory containing `.rbtrc`. The current
version is the application's own pin:

- Python: the exact `reboot` pin in `pyproject.toml`.
- Node.js: the `@reboot-dev/reboot` version in `package.json`.

The **target** version is the plugin's `VERSION` — exactly that
version, never "the latest version on PyPI": step 1 already
established they agree, and if they had not, a newer release might
carry migration steps this plugin does not know about.

## Step 4 — Compare

- **Current == target:** nothing to do; report that the application
  is already up to date. Stop.
- **Current > target:** do NOT downgrade the application. The plugin
  is older than the application; update the plugin as in step 2.
  Stop.
- **Current < target:** proceed.

## Step 5 — Plan, and confirm with the developer

Read every fragment (`.md` file) in this skill's
`migrations/<version>/` directories whose `<version>` is greater
than the current version and at most the target version. Sort the
directories in ascending version order; that is the order their
steps apply in. A version without a directory needs no code
migrations.

Tell the developer what the upgrade involves (from which version to
which, and a one-line summary per fragment) and get their go-ahead
before changing anything. Never start the upgrade without their
approval.

## Step 6 — Apply the code migrations

Apply the fragments' steps to the application, in ascending version
order. These are code-only changes; do not bump version pins
or regenerate yet. (This ordering is deliberate: if the upgrade is
interrupted partway, the application still pins its old version, so
the version-mismatch check fires on the next run and this skill can
simply be run again.)

## Step 7 — Bump every pin, once, to the exact target version

- `pyproject.toml`: every exact `reboot` pin (including dev
  dependencies).
- `package.json`: every `@reboot-dev/*` dependency that has an exact
  version (leave `workspace:*` entries alone).
- `Dockerfile` (if present): the `ghcr.io/reboot-dev/reboot-base`
  image tag in the `FROM` line.

## Step 8 — Reinstall, regenerate, test

From the project root:

1. Reinstall dependencies: `uv sync` for Python, or the project's
   package manager for Node.js.
2. Regenerate code: `rbt generate`.
3. Run the application's tests. Fix any failures the upgrade caused,
   guided by the migration notes.

## Step 9 — Report

Summarize: the version change, which migration steps were applied
(if any), and the test results.
