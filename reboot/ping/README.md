# Ping

This is a very basic Reboot application, built using Bazel. Because it
is built using Bazel, it can be used to productively iterate on Reboot
features:

- To validate behavior of a local Reboot application (with live-reload
  on any framework change!), by using `ibazel run //reboot/ping:ping_py_bin`.
  This serves both the MCP UIs and the `web/` SPA from the esbuild-built
  static content on disk, behind Envoy under `/__/frontend/` — the web
  app lands at `http://localhost:9991/__/frontend/web/`.
- To validate behavior of a local cluster
  (`bazel run //infrastructure/clusters/local:cluster up`), since it is
  installed on those by default.

## Testing the MCP surface

The application contains MCP functionality. Two inspectors can
drive it; pick one. Both default to port `6274` — to run them
side by side, give the official inspector a different client port
with `CLIENT_PORT=6280` (its proxy stays on `SERVER_PORT=6277`).

### Option A — official MCP Inspector

This is the preferred option for agents. The upstream
`@modelcontextprotocol/inspector` walks the full OAuth dance
against the local backend and renders `UI()` tool artifacts in a
sandboxed iframe under its **Apps** tab. Open source, no sign-in
necessary:

```bash
HOST=127.0.0.1 MCP_AUTO_OPEN_ENABLED=false \
  npx @modelcontextprotocol/inspector@latest
```

The console prints
`http://localhost:6274/?MCP_PROXY_AUTH_TOKEN=…` — open that full
URL (on a remote VM, forward ports `6274` and `6277`, plus `9991`
for the OAuth redirect). If the browser loads the UI from an
origin other than `http://localhost:6274`, also pass
`ALLOWED_ORIGINS=<that-origin>`, or the proxy's DNS-rebinding
guard rejects requests with a 403. Enter
`http://localhost:9991/mcp` as a **Streamable HTTP** server, click
**Connect**, pick any identity in Reboot's dev sign-in picker,
then drive the tools or load the **Apps** tab to interact with the
`Show Ping Counter` / `Show Counter Clicker` widgets.

### Option B — MCPJam Inspector

This is the suggested option for humans: it requires a sign-in,
but offers a chat interface that's great for manually testing
conversation flows. MCPJam's inspector
(`@mcpjam/inspector@2.18.1`, matching the version used elsewhere
in the repo) needs a WorkOS sign-in at `login.mcpjam.com`, which
is fine for a human:

```bash
npx @mcpjam/inspector@2.18.1 --url http://localhost:9991/mcp --oauth
```

## Using as a standalone web app

The same backend serves the standalone browser SPA in
[`frontend/web/`](frontend/web/) at `__/frontend/web/`, backed
by the unified
`oauth=...` flow. Sign in here and you're also signed in on the
MCP surface (and vice versa) via shared `rbt_session` cookies.

```bash
ibazel run //reboot/ping:ping_py_bin
```

Open <http://localhost:9991/__/frontend/web/>, click sign-in, pick
a `Development` identity. The SPA reads `User.whoami` and
`User.list_counters`, and flips counters via `Counter.increment` —
all authenticated by the backend's OAuth.

## On the local cluster

To test that `ping` on the local cluster is working as it should, here
are some helpful operations. Note that the servicers only accept
signed-in callers, so the unauthenticated requests below are expected
to come back `PermissionDenied` — for a smoke test that is still
proof that routing and the authorizer both work:

### `grpcurl` to test gRPC traffic

```sh
grpcurl \
  -plaintext \
  -d {} \
  -H 'x-reboot-state-ref: reboot.ping.Ping:example-pinger-00' \
  a7dum7c5z5d.reboot-cloud-cluster.localhost:9990 \
  reboot.ping.PingMethods/Describe
```

### `curl` to test HTTP traffic

```sh
curl \
  -X POST \
  http://a7dum7c5z5d.reboot-cloud-cluster.localhost:9990/__/reboot/rpc/reboot.ping.Ping:example-pinger-00/reboot.ping.PingMethods/Describe
```

### `websocat` to test websocket traffic

You must [install websocat](https://github.com/vi/websocat#pre-built-binaries).

```
echo "CghEZXNjcmliZQ==" | base64 -d | websocat -b ws://a7dum7c5z5d.reboot-cloud-cluster.localhost:9990/__/reboot/rpc/reboot.ping.Ping:example-pinger-00/rbt.v1alpha1.React/Query
```

### Fetch logs

```
./rbt.sh cloud logs \
  --cloud-url=http://cloud.reboot-cloud-cluster.localhost:9990 \
  --api-key=OUTPUT_BY_YOUR_UP_COMMAND \
  --application-name=ping
```
