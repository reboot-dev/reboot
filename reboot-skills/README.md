# Reboot Skills

Claude Code plugins for building on [Reboot](https://reboot.dev).

## Available Skills

| Skill                                        | Description                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [`reboot-chat-app`](skills/reboot-chat-app/) | Use Reboot to build AI Chat Apps (MCP Apps) for ChatGPT, Claude, VSCode, Goose, and others |

## Prerequisites

AI Chat App features (`UI()`, `Tool()`) require the Reboot monorepo.
The published `reboot` package does not include them yet. Do NOT
try to use `uv sync` alone — it will install `reboot==0.44.0`
which lacks these features.

You need access to the Reboot monorepo to run the bazel commands
that install the dev packages.

## Installation

### From GitHub

In Claude Code, add the marketplace and install:

```bash
# 1. Add the Reboot skills marketplace (one-time).
/plugin marketplace add github:reboot-dev/reboot-skills

# 2. Install a skill.
/plugin install reboot-chat-app@reboot-skills
```

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

### Local (Reboot monorepo dev container)

```bash
claude --plugin-dir /workspaces/mono/public/reboot-skills
```

### Local (reboot-skills repo)

```bash
git clone https://github.com/reboot-dev/reboot-skills.git
claude --plugin-dir ./reboot-skills
```

## Dev Bootstrap (required)

After creating a project with `.python-version` and
`pyproject.toml`, run these commands **in order from the
application directory** (where `pyproject.toml` lives):

```bash
# Install base dependencies.
uv sync

# Install local React packages into web/.
mkdir -p web && cd web && bazel run //reboot:npm_install_local_reboot_react && cd ..

# Re-sync after npm install.
rm uv.lock && uv sync

# Install dev Python wheel. This MODIFIES pyproject.toml by
# appending [tool.uv.sources] pointing to the local wheel.
bazel run //reboot:force_reinstall_dev_reboot
```

Both bazel commands are required. After this, `pyproject.toml`
will have a `[tool.uv.sources]` section added automatically.

Use `uv run --no-sync rbt generate` for all subsequent generate
commands to avoid overwriting the dev install.

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
│   └── plugin.json
├── README.md
└── skills/
    └── reboot-chat-app/
        └── SKILL.md
```

The repository root is the plugin directory. It contains:

- `.claude-plugin/plugin.json` — plugin metadata
- `skills/<name>/SKILL.md` — skill definition with YAML frontmatter

## License

Apache-2.0
