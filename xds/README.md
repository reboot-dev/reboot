# Why is this directory here?

Reboot uses Envoy's xDS API protos. We get these protos from
[Buf](buf.build/cncf/xds) (see `buf_deps_envoy`), but while
that repository comes with `BUILD` files that contain `proto_library` rules,
they don't contain `py_proto_library` rules.

This directory adds the missing `py_proto_lirary` rules for the `xds` API
protos. Note that this directory must be at `[workspace_root]/xds/` for the
resulting Python packages to be in the location that matches their generated
code.

<!-- TODO(rjh): it might be possible to use Buf's generated SDKs instead: buf.build/cncf/xds/sdks -->
