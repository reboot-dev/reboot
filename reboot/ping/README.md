# Ping

This is a very basic Reboot application, built using Bazel. Because it
is built using Bazel, it can be used to productively iterate on Reboot
features:

- To validate behavior of a local Reboot application (with live-reload
  on any framework change!), by using
  `ibazel run //reboot/ping:ping_py_bin`.
- To validate behavior of a local cluster
  (`bazel run //infrastructure/clusters/local:cluster up`), since it is
  installed on those by default.

## Using MCPJam

The application contains MCP functionality. Test it using MCPJam:

```
# From the root of the Bazel repo:
npx @mcpjam/inspector@v2.4.0 --config reboot/ping/mcp_servers.json --server ping-server
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
