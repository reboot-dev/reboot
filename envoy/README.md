# Why is this directory here?

Reboot uses Envoy's API protos. We get these protos from
[Buf](https://buf.build/envoyproxy/envoy) (see `buf_deps_envoy`), but while
that repository comes with `BUILD` files that contain `proto_library` rules,
they don't contain `py_proto_library` rules.

This directory adds the missing `py_proto_lirary` rules for the `envoy` API
protos. Note that this directory must be at `[workspace_root]/envoy/` for the
resulting Python packages to be in the location that matches their generated
code.

<!-- TODO(rjh): it might be possible to use Buf's generated SDKs instead: https://buf.build/envoyproxy/envoy/sdks -->
