---
name: reboot
description: Use when building, running, deploying, or inspecting Reboot applications. Load version-matched guidance from the installed rbt CLI.
---

# Reboot

This is a thin discovery skill. The installed `rbt` binary owns the complete,
version-matched Reboot workflow; do not rely on a copied command reference.

## Start Here

Use the `rbt` matching the project. Install the Reboot CLI only when it is not
already available:

```sh
command -v rbt >/dev/null 2>&1 || uv tool install reboot
rbt --version
rbt skills list
```

Load only the skill needed for the task:

```sh
rbt skills get app       # route a new application to MCP UI, web app, or both
rbt skills get feature   # specify a capability before implementing it
rbt skills get python    # Reboot Python API and framework reference
rbt skills get run       # run an existing app
rbt skills get deploy    # deploy an app
rbt skills get inspect   # inspect persisted application state
rbt skills get upgrade   # migrate an existing app
```

The `rbt skills` output is part of the installed release, so it remains aligned
with the framework version that will actually run the application.

## Common Pitfalls

- Do not install the legacy Reboot plugin just to obtain workflow guidance; use
  `rbt skills` instead.
- Do not fetch skill content from GitHub at runtime. It may not match the
  installed `rbt` version.
- Do not load every skill by default. Start with `app`, then follow its routing
  instructions and load only the relevant specialist skill.
