# Reboot Plugin

A plugin for building on [Reboot](https://reboot.dev) from your coding
agent. The same skills work in both **Claude Code** and **Codex**.

## Included Skills

| Skill                          | Description                                                                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [`app`](skills/app/)           | Build a Reboot app from a description — routes to `chat-app` or `web-app`                                                                 |
| [`chat-app`](skills/chat-app/) | Build AI Chat Apps (MCP Apps) for ChatGPT, Claude, VSCode, Goose, and others — layers on top of `python`                                  |
| [`web-app`](skills/web-app/)   | Build standalone Reboot Web Apps — a Reboot backend behind a browser-facing React frontend — layers on top of `python`                    |
| [`run`](skills/run/)           | Run an existing Reboot app — detects MCP Chat App vs. Web App and starts every process it needs                                           |
| [`inspect`](skills/inspect/)   | Inspect a running Reboot app's persisted state from the CLI with `rbt inspect` — list state types, list state IDs, dump one actor as JSON |
| [`python`](skills/python/)     | Reboot Python framework reference: proto- or pydantic-defined APIs, Servicers, contexts, refs, scheduling, and testing                    |
| [`upgrade`](skills/upgrade/)   | Upgrade an existing Reboot app to this plugin's Reboot version — applies migration steps, bumps pins, regenerates                         |

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

If Codex is detected, the installer pauses to ask whether to disable
Codex's sandbox globally — a requirement to work around
[openai/codex#24933](https://github.com/openai/codex/issues/24933).
Decline (`n`) and the Codex install is skipped entirely; accept (`Y`,
the default) and the installer writes the opt-out into
`~/.codex/config.toml`. See [Differences in Codex vs. Claude Code](#differences-in-codex-vs-claude-code)
for the full rationale. For non-interactive installs (CI/CD), set
`REBOOT_PLUGIN_DISABLE_CODEX_SANDBOX=yes` (or `no`) to pre-answer
the prompt.

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

- enables hooks (`features.hooks = true` — off by default),
- prepends the plugin's pinned tool shims (`uv`, `node`, `rbt`, …) to
  PATH for every subprocess via `shell_environment_policy.set.PATH`.
  Codex SessionStart hooks can't modify PATH the way Claude Code's can,
  so this is how the bin/ prepend is wired. `set` replaces PATH
  wholesale, so the install-time PATH is baked in after the plugin's
  bin/ — re-run `install.sh` to refresh it, and
- disables Codex's sandbox (`sandbox_mode = "danger-full-access"`)
  to work around
  [openai/codex#24933](https://github.com/openai/codex/issues/24933);
  see the [Differences](#differences-in-codex-vs-claude-code) section
  for context. `install.sh` asks for explicit consent before writing
  this; if you install manually you must add it yourself.

If you check out the plugin and work inside it, the bundled
`.agents/skills` directory makes Codex discover the **skills** with no
install at all (skills only — hooks and the PATH prepend still need the
full install).

## Differences in Codex vs. Claude Code

The skills behave identically; three pieces of lifecycle automation
differ because of Codex limitations:

- **Codex sandbox must be disabled.** The plugin's main commands
  (`rbt dev run`, `rbt generate`, …) hang silently inside Codex's
  default sandbox because of an upstream Codex bug that breaks Python
  asyncio cross-thread wakeups —
  [openai/codex#24933](https://github.com/openai/codex/issues/24933).
  Until that is fixed, the only way to make the plugin work under
  Codex is to set `sandbox_mode = "danger-full-access"` in
  `~/.codex/config.toml`. `install.sh` writes this for you after
  asking for explicit consent, because the setting is **global**:
  it affects every Codex session on the machine, not just sessions
  using the Reboot plugin. If you decline at the prompt, the Codex
  install is skipped entirely (a Codex install without this opt-out
  cannot run the plugin's main commands). You can undo the change
  any time by deleting the `# >>> reboot-plugin (managed) >>>` …
  `# <<< reboot-plugin (managed) <<<` region from
  `~/.codex/config.toml`.
- **No PreToolUse auto-approval.** Claude Code auto-approves the
  plugin's own dev commands to cut down on prompts. Codex PreToolUse
  hooks can only _deny_ a tool, never approve one, so there is no
  equivalent — reduce prompts with Codex's own `approval_policy` /
  `sandbox_mode` (e.g. `workspace-write` with network access) instead.

## Usage

Once installed, just describe what you want to build:

```
Build a todo list chat app with drag-to-reorder
```

In Claude Code you can also invoke a skill directly, e.g.
`/chat-app Build a todo list app`. Either way the builder skills plan
first — they analyze your description, propose a state model and method
map, and wait for your approval before writing any code.

## Skill reminders

In sessions running inside a Reboot project (the working directory, or
an ancestor, holds a `.rbtrc`), the plugin injects a short reminder
into the agent's context — at session start, after compaction, and
again whenever it has scrolled out of the transcript's recent tail —
to read the plugin's skill references (including Reboot's standard
library) instead of inferring Reboot behavior from trial and error.
See [`hooks-handlers/remind.sh`](hooks-handlers/remind.sh); it works
identically in Claude Code and Codex.

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
│   └── plugin.json           # Codex plugin manifest (skills); see
│                             # "Differences in Codex vs. Claude Code"
│                             # above for how PATH is wired under Codex
├── README.md
├── install.sh                # installs for Claude Code and/or Codex
├── bin/                      # pinned tool shims (uv, node, rbt,
│                             # cloudflared, …)
├── lib/                      # shim install scripts
├── hooks/
│   ├── hooks.json            # hook registrations (Claude Code + Codex)
│   └── auto-approve.sh       # Claude Code PreToolUse auto-approval
├── hooks-handlers/           # SessionStart PATH prepend (Claude Code)
│                             # and the skill reminder (both CLIs)
└── skills/
    └── <name>/
        ├── SKILL.md          # skill definition (YAML frontmatter)
        ├── agents/
        │   └── openai.yaml   # Codex skill-selector metadata
        └── references/       # progressive-disclosure docs
```

## License

Apache-2.0
