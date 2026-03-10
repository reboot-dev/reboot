# Reboot Skills

Claude Code plugins for building on [Reboot](https://reboot.dev).

## Available Skills

| Skill                                        | Description                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [`reboot-chat-app`](skills/reboot-chat-app/) | Use Reboot to build AI Chat Apps (MCP Apps) for ChatGPT, Claude, VSCode, Goose, and others |

## Installation

### From GitHub

Add the Reboot skills marketplace and install the plugin:

```bash
# 1. Add the Reboot skills marketplace (one-time).
claude plugin marketplace add reboot-dev/reboot-skills

# 2. Install a skill.
claude plugin install reboot-chat-app@reboot-skills
```

If you install the plugin within `claude` with `/plugin` you need to restart for
the configuration and skill to load correctly.

To auto-enable for your team, add to your project's
`.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "reboot-skills": {
      "source": {
        "source": "github",
        "repo": "reboot-dev/reboot-skills"
      }
    }
  },
  "enabledPlugins": {
    "reboot-chat-app@reboot-skills": true
  }
}
```

### Local (repo checked out)

```bash
git clone https://github.com/reboot-dev/reboot-skills.git
claude --plugin-dir ./reboot-skills
```

## Usage

Once installed, use the skill by name:

```
/reboot-chat-app Build a todo list app with drag-to-reorder
```

The skill enters plan mode first — it analyzes your description,
proposes a state model and method map, and waits for your approval
before writing any code.

## Repository Structure

```
reboot-skills/
├── .claude-plugin/
│   └── marketplace.json
├── README.md
└── skills/
    └── reboot-chat-app/
        └── SKILL.md
```

The repository root is the plugin directory. It contains:

- `.claude-plugin/marketplace.json` — marketplace and plugin definitions
- `skills/<name>/SKILL.md` — skill definition with YAML frontmatter

## License

Apache-2.0
