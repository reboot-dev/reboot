# Local coding agents in the developer dashboard

`rbt dashboard --agent-config=/absolute/path/to/agents.json` opts in to a
local coding-agent panel. Without that flag no agent process is launched and
no panel is shown. This feature does not use a relay or any external service
between the browser and the adapter. Model providers still receive prompts
and the context their local agent sends them.

Install adapters explicitly in a trusted directory; the dashboard never runs
an installer. The integration targets stable **ACP v1**, not draft v2. Tested
adapter compatibility targets are `@agentclientprotocol/claude-agent-acp@0.95.0`
and `@agentclientprotocol/codex-acp@2.2.2`:

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
The CLI flag may also be placed on a `dashboard --agent-config=...` line in
`.rbtrc`. Review that configuration before running it: it is executable local
configuration. No browser request can supply argv, environment, a filesystem
path, MCP servers, or an arbitrary provider session ID.

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

## Lifecycle and supported protocol

The browser opens a same-origin authenticated POST stream and sends semantic
prompt, permission and cancel actions. ACP runs as newline-delimited JSON-RPC
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
`loadSession: true`. The server remembers only its own latest session per
provider for this dashboard process and loads it with the same cwd; browser
refresh can disconnect the live agent. No arbitrary session IDs are accepted,
and dashboard restart loses this in-memory binding. Provider history retention
is independent. Reconnection and retry never replay a prompt automatically.

Protocol references: [initialization](https://agentclientprotocol.com/protocol/v1/initialization),
[session setup](https://agentclientprotocol.com/protocol/v1/session-setup),
[tool permissions and diffs](https://agentclientprotocol.com/protocol/v1/tool-calls).
