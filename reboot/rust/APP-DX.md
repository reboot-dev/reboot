# Cargo-native Rust apps

Rust app development currently supports **one local public gRPC host backed by
one canonical C++ Database/RocksDB process**. It does not use the Python/Node
Envoy/bootstrap path or distributed placement.

## Initialize and run

The experimental `reboot-rust-schema` crate is not published. Point init at a
local SDK checkout that contains `reboot/rust` and the repository protobufs:

```sh
mkdir greetings && cd greetings
rbt init --backend=rust --frontend=none --application-name=greetings \
  --rust-sdk=/absolute/path/to/sdk/reboot/rust
export RBT_RUST_DATABASE_BINARY=/absolute/path/to/reboot/server/database
rbt dev run --rust-allow-insecure-database
```

Use the compatible canonical C++ `reboot/server/database` binary, not the Rust
native-2PC sidecar or an arbitrary executable. The CLI currently requires a
POSIX platform (`fcntl` and process groups); Linux descendant cleanup uses the
existing child-subreaper support.

**Security/release boundary:** the current C++ Database executable binds
`0.0.0.0` without authentication and has no address flag. Only the public Rust
host is loopback-bound. Rust dev fails closed unless explicitly passed
`--rust-allow-insecure-database` and prints a startup warning. Use an isolated,
trusted development network; do not expose the raw sidecar to an untrusted
network or use this as a production/cloud deployment path.

From another terminal in the generated project:

```sh
cargo run --manifest-path backend/Cargo.toml --bin client -- create
cargo run --manifest-path backend/Cargo.toml --bin client -- greet
cargo run --manifest-path backend/Cargo.toml --bin client -- read
```

The example's default actor state-ref is `hello`. Create constructs it once;
greet durably increments its count; read returns the stored count. To replay
one logical writer call, persist and reuse its key:

```sh
cargo run --manifest-path backend/Cargo.toml --bin client -- \
  greet hello 11111111-1111-4111-8111-111111111111
```

The generated typed client preserves the key across its `Unavailable` retries.
Its command bounds connect/health and operation waits. Retry after a timeout
with the same explicit key, rather than creating a new logical mutation.

## Generation and lifecycle

- `backend/build.rs` compiles the project's annotated proto using
  `reboot::build::compile_protos_with_runtime`. Tonic bindings, concrete Reboot
  Database adapters and typed external clients are generated in Cargo `OUT_DIR`.
  The existing `rbt generate` Python/TypeScript plugin path does not generate
  these Rust bindings; the Rust `.rbtrc` disables its background watcher.
- The generated app implements the Database handler trait and mounts the
  generated Tonic service through `ApplicationHost`. Construction, writes and
  reads use `DatabaseActorStore`, not an in-memory handler map.
- The CLI builds the Cargo `app` and `client` binaries, asks `app --server-info`
  to encode/validate the canonical ServerInfo protobuf, starts the C++ Database,
  starts the Rust host and checks canonical gRPC Health.Check through the client.
- Rust/proto/build/manifest changes rebuild and restart the host, keeping the
  sidecar and its state. A build failure terminates this dev session with an
  error; fix it and rerun. Configuration changes require restarting the command.
- `.rbt/dev/<application-name>/rust/rocksdb` survives command restarts.
  `database.log` and `host.log` capture process output in the same directory.
  An advisory session lock rejects simultaneous use of this Rust state directory.
- SIGINT and SIGTERM cancel the dev operation, terminate and reap owned process
  groups, and exit with 130/143. Unexpected host or Database exit fails the CLI
  and cleans up its other child. It does not signal unrelated processes.
- `rbt dev run --rust-allow-insecure-database --terminate-after-health-check` performs a startup smoke test and
  stops both children. `rbt dev run --rust-allow-insecure-database --port=12991` changes the public listener;
  use `RBT_RUST_URL=http://127.0.0.1:12991` on the client. The scaffold does not
  pin the port in `.rbtrc`, so the normal CLI override works.
- `rbt dev expunge --application-name=<name>` removes this application's local
  state. Do not expunge a running application.

Init validates SDK/frontend/name and all output collisions before writes. It
refuses to overwrite existing project files or write through a symlinked
scaffold parent, and publishes `.rbtrc` last. Python 3.10 uses the declared
`tomli` dependency; newer Python uses `tomllib`.

## Scope and verification

The Rust branch bypasses Python's Reboot-owned DatabaseServer/PlacementPlanner,
Envoy health checks, dashboard and chaos loop. It requires `--servers=1` and
rejects frontend/TLS/Node/Python/tracing/transpilation/background-command modes
that it cannot supply. No cloud, HTTP/React, multi-server routing, transaction
recovery, tasks/workflows, reactive readers or collection parity is implied.
Only the ordinary generated unary constructor/writer/reader app is scaffolded.

Python behavior tests are in `tests/reboot/cli/rust_app_dx_test.py`; set
`RUST_DX_SDK` and `RUST_DX_RBT` for an installed/isolated SDK and CLI. The Bazel
target declares CLI, SDK metadata, annotation and template data dependencies.
The runtime acceptance layer additionally needs Cargo and a real canonical
C++ Database binary: exercise typed create/write/replay/read, inspect canonical
Database.Load, restart both processes against the same RocksDB directory,
verify typed read/replay, and check every owned PID is gone after signal/child
failure cleanup. Unit/process-shim tests are not RocksDB evidence.
