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

## Testing the MCP app

### MCPJam

[MCPJam](https://www.mcpjam.com/) is the friendlier option if you're a human poking at the app: log in and it gives you a chat interface that drives the MCP UIs (clicker, pinger) and tools the way a real MCP host would. Point it at ping's MCP server at `http://localhost:9991/mcp`.

### MCP Inspector

The official [MCP Inspector](https://github.com/modelcontextprotocol/inspector) needs no login and shows the raw tools / resources / UIs — handy for a quick, low-level look. Point it at the same `http://localhost:9991/mcp`:

```bash
npx @modelcontextprotocol/inspector
```

## On the local cluster

To test that `ping` on the local cluster is working as it should, here
are some helpful operations:

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
