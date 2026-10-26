# Local coding agents in the developer dashboard

`rbt dashboard --agent-config=/absolute/path/to/agents.json` opts in to a
local coding-agent panel. Without that flag no agent process is launched and
no panel is shown. This feature does not use a relay or any external service
between the browser and the adapter. Model providers still receive prompts
and the context their local agent sends them.

Install adapters explicitly in a trusted directory; the dashboard never runs
an installer. The integration targets stable **ACP v1**, not draft v2. The
following adapter versions negotiate ACP v1: `@agentclientprotocol/claude-agent-acp@0.95.0`
and `@agentclientprotocol/codex-acp@2.2.2`. Real Codex application editing,
one-time read/edit approvals, native application reload and cancellation were
exercised using the production panel/backend with a test authentication harness
and a local Codex CLI selected through `CODEX_PATH`. The combined native
dashboard OAuth/browser flow remains unqualified. After the successful edit
and reload, the model reported capacity during its final continuation. Claude
session initialization succeeded, but editing remains unqualified because the
available Claude login expired. Deterministic wire-fixture coverage is separate
from these real-provider checks:

```sh
npm install --prefix "$HOME/local-acp" \
  @agentclientprotocol/claude-agent-acp@0.95.0 \
  @agentclientprotocol/codex-acp@2.2.2
```

Create a trusted JSON file (replace `/home/developer` with your actual home):

```json
{
  "providers": {
    "claude": ["/home/developer/local-acp/node_modules/.bin/claude-agent-acp"],
    "codex": ["/home/developer/local-acp/node_modules/.bin/codex-acp"]
  }
}
```

Only configured providers appear in the selector. Commands are argv arrays,
not shell strings, and the executable must be an absolute executable path.
The [configuration JSON Schema](https://github.com/reboot-dev/reboot/blob/main/reboot/dashboard/backend/acp_config.schema.json)
describes the file structure; runtime validation also checks executable access
and that the application directory exists. The schema is shipped beside
`reboot.dashboard.backend.acp` as `acp_config.schema.json`.
The CLI flag may also be placed on a `dashboard --agent-config=...` line in
`.rbtrc`. Review that configuration before running it: it is executable local
configuration. No browser request can supply argv, environment, a filesystem
path, MCP servers, or an arbitrary provider session ID.

## Model selection and trusted defaults

Connect to discover the agent's **current model and advertised choices**. The
panel does not maintain a model catalog or guess a provider default. It uses
ACP v1 `configOptions` (`category: "model"`, or uncategorized `id: "model"`)
and `session/set_config_option`, including grouped choices and complete
`config_option_update` notifications. Choices are rediscovered on new/load;
changes are disabled during a turn, pending approval or another model change.
The backend accepts only a value in its current advertised model selector;
the browser cannot set arbitrary config IDs, permission modes or commands.

The original argv-array form remains supported. To set a default for **new**
sessions, use a provider object with `command` and optional `default_model`:

```json
{
  "providers": {
    "codex": {
      "command": ["/home/developer/local-acp/node_modules/.bin/codex-acp"],
      "default_model": "<exact value shown by your connected agent>"
    },
    "claude": ["/home/developer/local-acp/node_modules/.bin/claude-agent-acp"]
  }
}
```

Replace the placeholder with an exact advertised value, not a display name.
No `CODEX_CONFIG` encoding is necessary. With no configured default, the
agent's current model is unchanged; **Resume last session** preserves the
loaded session's model rather than reapplying the new-session default. An
unadvertised configured default stops connection with an explicit error:
there is no silent fallback. A failed model-change RPC disconnects because
its final state may be uncertain; reconnect to rediscover the actual state.
No prompt is automatically replayed.

Support is capability-based for both Codex and Claude, not inferred from the
provider name. Agents without a supported model config selector show
**Model selection unavailable**; the legacy unstable `session/set_model` API
is not assumed. The pinned Codex ACP 2.2.2 advertises the standard model config
selector under ACP v1. Its choices depend on the selected Codex CLI and
account. Adapter-advertised choices are not a guarantee of account access or
successful inference: some adapters include a locally configured current
model even when it is missing from the underlying runtime's model list.
Select a model supported by your actual runtime, or update that runtime via
its normal installation workflow. Model discovery does not validate a prompt,
authentication refresh or capacity. Claude model selection remains unqualified
against a live authenticated account.

## Application workspace and reload

The CLI resolves the working directory using the existing `.rbtrc` /
`--working-directory` rules, and starts the adapter **in that application
checkout**, not inside Reboot's dashboard source or generated dashboard state.
Both the process cwd and ACP `session/new.cwd` use that directory. Open the
matching `rbt dev run` separately. Edits pass through the existing application
`--watch` and `--generate-watch` machinery: the panel does not add a generic
admin mutation/reload API. API edits still require the project's normal
`rbt generate` setup. Configure the project's test commands in its agent
instructions, or ask the agent to run them and inspect its reported results.

## Security and permissions

This is arbitrary code execution with **your local user's privileges**.
Setting cwd is **not a sandbox** and does not prevent access outside the
checkout. The dashboard advertises no client filesystem or terminal
capabilities: adapters execute tools themselves, under their native permission
and sandbox policies. Reboot does not silently select full-access modes,
disable approvals, or override provider configuration. Review existing local
Claude/Codex settings and the adapter's documentation before opting in.
Trusted argv wrappers can configure a provider's supported sandbox/approval
controls, but those controls belong to the provider, not this panel.

Authenticate through the provider's local CLI before starting the dashboard.
Check a harmless prompt, not just `login status`: stored login metadata does
not prove that a refresh token is valid. Codex's adapter bundles its own CLI;
its [runtime options](https://github.com/agentclientprotocol/codex-acp#runtime-options)
include `CODEX_PATH` for selecting an existing compatible local CLI. A trusted
local wrapper may set that variable without changing global configuration.
Credentials and inherited environment remain in the backend process; no login,
API-key, command, or authentication RPC is exposed in the browser. The panel
shows the adapter's actual permission request and **exact offered options**.
Selecting an option answers that request once; invalid, expired, or replayed
choices are rejected. Persistent choices have the meaning the adapter assigns
to them. No extra approval dialog is invented for tools the provider already
allows. Tool output can itself contain sensitive application data: treat this
panel as a local terminal, not as a safe surface for untrusted collaborators.

All three ACP HTTP endpoints require the dashboard's verified OAuth bearer
and exact configured Origin and Host. Origin is configured by the local CLI,
not derived from forwarded headers. ACP accepts only the explicit loopback
`http://127.0.0.1:<port>` dashboard URL. Portless, MCP-host panels and tunnels
are unsupported. Never expose the dashboard through a tunnel when agents are
enabled. A random in-memory channel binds actions to the one connected browser;
a second connection is refused. Requests and output queues are bounded.
Raw adapter stderr and provider RPC errors are not forwarded to the page.
The backend drains stderr without retaining raw contents and logs only fixed
diagnostic categories. Authentication and quota failures produce actionable
messages without echoing tokens, provider error payloads or private stderr.
For an authentication failure, reauthenticate with the provider's local CLI
outside the dashboard, then reconnect. The dashboard cannot repair expired
OAuth sessions or authenticate an adapter on your behalf.

## Lifecycle and supported protocol

The browser opens a same-origin authenticated POST stream and sends semantic
prompt, model, permission and cancel actions. ACP runs as newline-delimited JSON-RPC
on stdio. The host negotiates protocol version 1, creates one session, streams
text, plans, tool status and file before/after diffs, and answers permission
requests. Other agent-to-client requests receive method-not-supported. Rich
prompt content, client terminals/filesystem, provider mode switching and draft
extensions are not advertised.

Cancel resolves outstanding permissions as cancelled and sends `session/cancel`.
If the adapter does not settle within five seconds the host terminates its
process group. Disconnect, malformed output, startup failures and stream
cancellation clean up the adapter and its descendants. This cannot undo an
already completed edit or stop a child that deliberately escapes its process
group. There is one active browser per dashboard.

**Resume last session** is available only after the adapter advertises
`loadSession: true`. An authenticated, origin-guarded configuration response
reports availability per provider, without disclosing session IDs or connection
channels. The panel rediscovers it after refresh and when switching providers.
The server remembers only its own latest session per provider for this dashboard
process and loads it with the same cwd. **New session** replaces that provider's
resume target; there is no historical-session list or durable dashboard binding.

Browser refresh disconnects the live agent and stops active work; completed
edits remain on disk. Reconnect explicitly with **Resume last session**, which
loads provider-retained context and rediscovers its model selection. The provider
controls whether loading replays the transcript. If the previous connection is
still cleaning up (or another tab owns it), the panel reports this and refreshes
availability; wait and retry rather than starting another task. No arbitrary
session IDs are accepted, and dashboard restart loses the in-memory binding.
Provider history retention is independent. Reconnection and retry never replay
a prompt automatically.

Protocol references: [initialization](https://agentclientprotocol.com/protocol/v1/initialization),
[session setup](https://agentclientprotocol.com/protocol/v1/session-setup),
[session config options](https://agentclientprotocol.com/protocol/v1/session-config-options),
[tool permissions and diffs](https://agentclientprotocol.com/protocol/v1/tool-calls).
