# Reboot Plugin

The `reboot` Claude Code plugin for building on [Reboot](https://reboot.dev).

## Included Skills

| Skill                          | Description                                                                                                            |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| [`chat-app`](skills/chat-app/) | (Original, monolithic.) Build AI Chat Apps (MCP Apps) for ChatGPT, Claude, VSCode, Goose, and others                   |
| [`python`](skills/python/)     | Reboot Python framework reference: proto- or pydantic-defined APIs, Servicers, contexts, refs, scheduling, and testing |
| [`chat`](skills/chat/)         | (Newer.) MCP Chat Apps layered on top of `python` — chat-app structure + React/MCP-UI scaffolding only                 |

## Installation

### From GitHub

Add the Reboot skills marketplace and install the plugin:

```bash
# 1. Add the Reboot skills marketplace (one-time).
claude plugin marketplace add reboot-dev/reboot-plugin

# 2. Install the plugin.
claude plugin install reboot@reboot-plugin
```

If you install the plugin within `claude` with `/plugin` you need to restart for
the configuration and skill to load correctly.

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

### Local (repo checked out)

```bash
git clone https://github.com/reboot-dev/reboot-plugin.git
claude --plugin-dir ./reboot-plugin
```

## Usage

Once installed, use a skill by name:

```
/chat-app Build a todo list app with drag-to-reorder
```

The `chat-app` skill enters plan mode first — it analyzes your
description, proposes a state model and method map, and waits for
your approval before writing any code.

## Repository Structure

```
plugin/
├── .claude-plugin/
│   └── marketplace.json
├── README.md
└── skills/
    ├── chat-app/
    │   └── SKILL.md
    ├── python/
    │   ├── SKILL.md
    │   ├── AGENTS.md
    │   ├── CLAUDE.md
    │   └── references/
    └── chat/
        ├── SKILL.md
        └── references/
```

The plugin directory contains:

- `.claude-plugin/marketplace.json` — marketplace and plugin definitions
- `skills/<name>/SKILL.md` — skill definition with YAML frontmatter

## License

Apache-2.0
