# Pinned hello-constructors application source

Python reference: `reboot-dev/reboot-examples` revision
`5c332a2910122d6035799bfaf2a314bf1de830b8`. `upstream/` preserves the original
schema, servicer, entrypoint, feature, test, and `.rbtrc` bytes; hashes and paths
are in `../upstream.json`. Verify offline:

```sh
python reboot/rust/tests/fixtures/reboot_examples/hello-constructors/verify_reference.py
```

The existing generated Rust backend preserves Create/Send/Messages and state tag
2. It now supplies an explicit unconditional allow authorizer with no verifier;
the SDK default remains deny. No development authorization selector is needed.

`app` owns a taskless ApplicationLifecycle initializer. Before host binding and
public readiness it invokes the **same generated durable adapter** as public
RPCs, in Create -> Send -> Messages order, for `reboot-hello`, using the original
two message strings, then prints the resulting list. It creates no tasks.
Errors fail startup; it never treats AlreadyConstructed as successful replay.
SIGTERM/Ctrl-C cancels the host-owned hook rather than leaving a detached future.

Each mutation has a separate nonexpiring UUIDv5. The derivation is frozen as:
UUID namespace URL -> `reboot-examples/hello-constructors/initialize/v1` ->
application identity -> `reboot-hello` -> `Create` or `Send`. Keep `RBT_NAME`
stable with the Database's retained storage. On every boot both mutations replay
through persisted receipts; losing the callback after Create does not lose the
next Send. Different application identities deliberately produce different keys
and an existing actor without the matching receipt fails closed. These are
app-local keys, not Python InitializeContext shared-storage interoperability.

## Run from the full repository

Requires an already-qualified, compatible native Database endpoint; this is not
a standalone in-memory server or an image recipe. Only the native Database owns
RocksDB. Do not expose its unauthenticated port publicly.

```sh
cargo build --release --locked \
  --manifest-path reboot/rust/tests/fixtures/reboot_examples/hello-constructors/backend/Cargo.toml \
  --bin app
RBT_NAME=hello-constructors \
RBT_RUST_DATABASE_URL=http://127.0.0.1:20000 \
RBT_RUST_LISTEN_ADDR=127.0.0.1:9990 \
reboot/rust/tests/fixtures/reboot_examples/hello-constructors/backend/target/release/app
```

When using `CARGO_TARGET_DIR`, run `$CARGO_TARGET_DIR/release/app` instead. The
existing `--server-info PATH` mode remains available for engine configuration.

## Qualification boundary

Source/provenance verification and locked offline Cargo dependency resolution
were exercised for this slice. Rust runtime tests below are supplied but **not
executed in this source slice**: the local host had only 115 MiB free and heavy
build/native ownership is reserved for the coordinated CCX43 owner. Do not infer
compiled or native behavior from formatting or provenance checks.

After coordination, run the generated-consumer tests against the SDK's existing
Database fake (no native engine is involved):

```sh
cargo test --locked \
  --manifest-path reboot/rust/tests/fixtures/reboot_examples/hello-constructors/backend/Cargo.toml \
  --test application -- --test-threads=1
cargo test --locked --manifest-path reboot/rust/Cargo.toml --lib \
  admission_requires_existing_or_preserves_default_compatibility
cargo test --locked --manifest-path reboot/rust/Cargo.toml --lib \
  constructor_writer
```

`backend/tests/application.rs` covers typed missing/duplicate construction errors,
exact message fidelity and replay, stable identity, interrupted initialization,
owned host cancellation before listening, repeated boot against retained fake
receipts, and anonymous public gRPC access after automatic startup. Fake receipts
and fresh SDK adapters are **not** C++ process/RocksDB restart evidence. The CLI
restart recipe now verifies automatic initialization instead of running a second
manual initializer with unrelated keys; that recipe also awaits native rerun.

Remaining release gates: compile/tests on the authorized host; actual Python rich
error diagnostics and identity-misuse observations; shared Python/Rust public
transport conformance; interrupted boot and retained-volume engine restart;
engine-loss readiness; pinned compatible native artifact and runtime libraries;
pinned Python generation/launcher; release Dockerfiles/topology and image digests.
No Docker image was built and no shared conformance or benchmark result is claimed.
