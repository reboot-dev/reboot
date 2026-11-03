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

Source/provenance verification, offline locked compilation and tests, and real
native Database application restart qualification were exercised on the existing
authorized CCX43 (not the low-disk local host). See the committed compact receipt
`qualification-ccx43.json` for exact source/artifact pins and evidence paths.
The release/image and shared Python gates below remain open; native debug
execution is not Docker evidence.

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
and fresh SDK adapters are **not** C++ process/RocksDB restart evidence.
`tests/native.rs` and `run_native_application.py` separately exercised the
production app against the native C++ engine: automatic initializer recovery,
anonymous public Create/Send/Messages, rich missing/duplicate errors, exact data
fidelity, same-key replay after unrelated writes, app-only and full-engine
retained-volume restarts. The interrupted initializer is the same Startup hook
inside ApplicationHost, with a **test-only** generated service wrapper parking
Send after the real durable Create ACK. Its exact child is SIGKILLed before the
engine is retired/restarted; it is not a production binary failpoint. All 15
owned children have exact wait receipts; sources/executables remained frozen.

Offline tests also cover independent competing process gates (both authorized
and compatibility constructors): same-key replay and distinct-key typed rejection.
A failing Send makes startup fail before binding, and the next boot recovers the
retained Create without duplication.

Remaining release gates: actual Python rich error diagnostics and identity-misuse
observations; shared Python/Rust public transport conformance; engine-loss
readiness; release artifacts/runtime libraries; Dockerfiles/topology/image digests.
No Docker image was built and no shared conformance or benchmark is claimed.

**Known Python behavior gap:** SDK `reboot/aio/servers.py` retries initializer
exceptions with backoff (except InputError); this Rust application exits on
initializer failure. Native restart recovery passes, but this is not equivalent
to Python's in-process retry policy. Do not call this same-behavior acceptance
until the intended policy is reconciled and shared-tested.

**Environment blocker:** Python reference code generation succeeded using the
existing Bazel `rbt`, its Reboot plugins, and existing mypy plugin paths. Its
supported public dev runtime still requires Envoy: neither an `envoy` executable
nor Docker is present on this authorized host. No install, image pull, paid
capacity, deletion or push was performed. Shared Python execution remains
unverified, rather than replacing the runtime with a fake or direct handler.
