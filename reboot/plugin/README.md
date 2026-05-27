# Reboot Plugin

A plugin for building on [Reboot](https://reboot.dev) from your coding
agent. The same skills work in both **Claude Code** and **Codex**.

## Included Skills

| Skill                          | Description                                                                                                            |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| [`app`](skills/app/)           | Build a Reboot app from a description — routes to `chat-app` or `web-app`                                              |
| [`chat-app`](skills/chat-app/) | Build AI Chat Apps (MCP Apps) for ChatGPT, Claude, VSCode, Goose, and others — layers on top of `python`               |
| [`web-app`](skills/web-app/)   | Build standalone Reboot Web Apps — a Reboot backend behind a browser-facing React frontend — layers on top of `python` |
| [`run`](skills/run/)           | Run an existing Reboot app — detects MCP Chat App vs. Web App and starts every process it needs                        |
| [`python`](skills/python/)     | Reboot Python framework reference: proto- or pydantic-defined APIs, Servicers, contexts, refs, scheduling, and testing |

The skill files are tool-agnostic. Claude Code invokes skills by name
(e.g. `/chat-app`); Codex selects a skill automatically from its
`description`. Both read the same `SKILL.md` files and `references/`.

## Installation

The quickest path installs for whichever of Claude Code / Codex you
have — having only one is fine, the installer skips the other:

```bash
curl -fsSL https://reboot.dev/install.sh | bash
```

Restart your agent afterward so the new skills and configuration load.

### Claude Code (manual)

Add the Reboot skills marketplace and install the plugin:

```bash
# 1. Add the Reboot skills marketplace (one-time).
claude plugin marketplace add reboot-dev/reboot-plugin

# 2. Install the plugin.
claude plugin install reboot@reboot-plugin
```

To auto-enable for your team, add to your project's
`.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "reboot-plugin": {
      "source": {
        "source": "github",
        "repo": "reboot-dev/reboot-plugin"
      }
    }
  },
  "enabledPlugins": {
    "reboot@reboot-plugin": true
  }
}
```

Or run from a checkout without installing:

```bash
git clone https://github.com/reboot-dev/reboot-plugin.git
claude --plugin-dir ./reboot-plugin
```

### Codex (manual)

`install.sh` uses Codex's native plugin system. Equivalent to:

```bash
# Register the marketplace (a local checkout, or the GitHub repo).
codex plugin marketplace add ./reboot-plugin   # or: reboot-dev/reboot-plugin

# Install the plugin (skills and hooks are picked up from the bundled
# .codex-plugin/plugin.json + .agents/plugins/marketplace.json).
codex plugin add reboot@reboot-plugin
```

`install.sh` then merges a small marked region into `~/.codex/config.toml`
that:

- enables hooks (`features.codex_hooks = true` — off by default), and
- prepends the plugin's pinned tool shims (`uv`, `node`, `rbt`, …) to
  PATH for every subprocess via `shell_environment_policy.set.PATH`.
  Codex SessionStart hooks can't modify PATH the way Claude Code's can,
  so this is how the bin/ prepend is wired. `set` replaces PATH
  wholesale, so the install-time PATH is baked in after the plugin's
  bin/ — re-run `install.sh` to refresh it.

If you check out the plugin and work inside it, the bundled
`.agents/skills` directory makes Codex discover the **skills** with no
install at all (skills only — hooks and the PATH prepend still need the
full install).

## Differences in Codex vs. Claude Code

The skills behave identically; two pieces of lifecycle automation differ
because of Codex hook limitations:

- **No PreToolUse auto-approval.** Claude Code auto-approves the
  plugin's own dev commands to cut down on prompts. Codex PreToolUse
  hooks can only _deny_ a tool, never approve one, so there is no
  equivalent — reduce prompts with Codex's own `approval_policy` /
  `sandbox_mode` (e.g. `workspace-write` with network access) instead.
- **Tunnel cleanup.** Claude Code reaps the cloudflared tunnel (and the
  MCPJam inspector) from a `SessionEnd` hook. Codex has no session-end
  event, so the SessionStart handler instead starts a watchdog that
  kills the tunnel when the owning `codex` process exits. If anything is
  left behind, find the plugin's install path with `codex plugin list`
  and run its `hooks/codex/reap.sh`, e.g.:

  ```bash
  bash "$(codex plugin list \
      | awk '/^reboot@/ {for(i=NF;i>=1;i--) if($i~"^/") {print $i; exit}}')/hooks/codex/reap.sh"
  ```

## Usage

Once installed, just describe what you want to build:

```
Build a todo list chat app with drag-to-reorder
```

In Claude Code you can also invoke a skill directly, e.g.
`/chat-app Build a todo list app`. Either way the builder skills plan
first — they analyze your description, propose a state model and method
map, and wait for your approval before writing any code.

## Repository Structure

```
plugin/
├── .agents/
│   ├── plugins/
│   │   └── marketplace.json  # Codex marketplace catalog (single-plugin)
│   └── skills -> ../skills   # Codex repo-bundled skill discovery
├── .claude-plugin/
│   └── marketplace.json      # Claude Code marketplace + plugin defs
├── .codex-plugin/
│   └── plugin.json           # Codex plugin manifest (skills + hooks)
├── README.md
├── install.sh                # installs for Claude Code and/or Codex
├── bin/                      # pinned tool shims (uv, node, rbt, …)
├── lib/                      # shim install scripts
├── hooks/
│   ├── hooks.json            # Claude Code hook registrations
│   ├── auto-approve.sh       # Claude Code PreToolUse auto-approval
│   └── codex/                # Codex hook port
│       ├── hooks.json        # referenced by .codex-plugin/plugin.json
│       ├── session-start.sh  # cloudflared tunnel + watchdog
│       └── reap.sh           # manual cleanup fallback
├── hooks-handlers/           # Claude Code SessionStart/SessionEnd
└── skills/
    └── <name>/
        ├── SKILL.md          # skill definition (YAML frontmatter)
        ├── agents/
        │   └── openai.yaml   # Codex skill-selector metadata
        └── references/       # progressive-disclosure docs
```

## License

Apache-2.0
