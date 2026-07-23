# Upgrade Reboot

Reboot ships as a set of artifacts that all share a single version
number: the `reboot` Python package on PyPI, the `@reboot-dev/reboot`
npm package, the `rbt` CLI (part of the Python package), and the
[Reboot coding-agent plugin](https://github.com/reboot-dev/reboot-plugin)
for Claude Code and Codex. An application, the `rbt` CLI that runs
it, and (if you use one) the agent plugin must all be on the **same**
version.

## How you'll know an upgrade is available

- `rbt` checks PyPI (at most once per day) and prints a notice when a
  newer Reboot release exists:

  ```
  A newer Reboot (X.Y.Z) is available; this `rbt` is A.B.C. Coding
  agents: run the Reboot `upgrade` skill to upgrade this application.
  Humans: see https://docs.reboot.dev/upgrade.
  ```

  Set `REBOOT_NO_VERSION_CHECK=true` to disable this check; it is
  also disabled automatically when the `CI` environment variable is
  set.

- If your `rbt` CLI and your application's `reboot` dependency ever
  diverge (for example, a teammate upgraded the app but you still
  have an older plugin or CLI), the application refuses to start and
  the error tells you which side is behind.

## Upgrading with a coding agent (recommended)

If you build with the Reboot plugin for Claude Code or Codex:

1. Update the plugin, so that its skills and migration notes match
   the new release. Re-run the installer:

   ```bash
   curl -fsSL https://reboot.dev/install.sh | bash
   ```

   (For Claude Code, `claude plugin update reboot@reboot-plugin` is
   equivalent.) Then restart your agent session so the updated plugin
   loads.

2. Ask the agent to upgrade the application — for example, "upgrade
   this app to the latest Reboot". The plugin's `upgrade` skill
   applies any migration steps the new release needs, bumps your
   dependency pins, regenerates code, and runs your tests.

## Upgrading by hand

1. Read the migration notes for every version newer than the one
   your application currently pins, up to and including the one you
   are upgrading to:
   [reboot-plugin/skills/upgrade/migrations](https://github.com/reboot-dev/reboot-plugin/tree/main/skills/upgrade/migrations).
   Apply the code changes they describe, in version order. Many
   releases need no code changes at all.

2. Bump your dependency pins to the new version — all of them:

   - `pyproject.toml`: `reboot==X.Y.Z`
   - `package.json`: `@reboot-dev/reboot` (and any other
     `@reboot-dev/*` packages)
   - `Dockerfile`: `FROM ghcr.io/reboot-dev/reboot-base:X.Y.Z`

3. Reinstall dependencies (e.g. `uv sync` or `npm install`), then
   regenerate code:

   ```bash
   rbt generate
   ```

4. Run your tests.
