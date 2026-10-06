# Rust Reboot SDK

## Reader-only one-shot task checkpoint

Partial vertical: generated immediate unary reader tasks without declared errors,
for the same local actor, scheduled only by fresh exclusive non-factory roots.
The host owns one dispatcher per normalized Database endpoint/type/reference;
startup and live canonical recovery scans validate the whole bounded pending set
before dispatch. Delivery is serialized, notifications are coalesced hints, and
live scans discover durable commits even when notification is lost. Staging
checks UUIDv4/RFC4122 identity, duplicate staged IDs, any existing durable ID,
and pending-plus-staged capacity (1024) while participant actor admission is held.
Cancellation/errors leave pending records, not synthetic terminal results.

Real C++ Database/RocksDB acceptance exercises generated root invocation through
live canonical PlacementPlanner, denial cleanup, commit plus pending task,
crash/redelivery, CompleteTask, second restart without redispatch, completed-ID
reuse denial, and live durable discovery without a notification. The discovery
vector writes a pending record via real Store. A separate real-C++ ownership
acceptance cancels a fresh root in its handler, admits the next root, loses that
root's durable participant Commit ACK, observes supervised host failure, then
restarts through legacy transaction recovery and completes the task. Uncertain
handoff never speculatively releases or aborts the participant. Duplicate-owner
release has an ownership-only unit test, not cross-process fencing evidence.
Admission-specific local ownership tokens prevent delayed guard cleanup from
releasing a later admission which reuses the transaction UUID; a deterministic
regression exercises old-guard Drop after readmission. The full generated C++
process suite also exercises exclusive inbound mutated-state persistence when
`final_state` is omitted; explicit final-state overrides remain authoritative.
A real Tonic request deadline also cancels admission after canonical Recover
and before staging/Prepare, verifies unchanged actor state and no durable task or
transaction records, then admits a retry on the same participant. A second
request deadline cancels after real Database Commit while terminal delivery is
parked: the supervised host fails, the task reader does not acquire the uncertain
lease, and restart through legacy recovery completes the task. Failed readiness
also cancels already-admitted unary RPCs, including control calls, without
releasing uncertain participant ownership. A real competing-request regression
keeps its client open without a deadline, proves host termination, and completes
the task after restart; removing only the ingress cancellation reproduces the
shutdown hang. Generator regression coverage excludes declared-error readers
from scheduling and dispatch surfaces. Capacity-saturation and earlier durable
RPC cancellation windows still need dedicated acceptance. No exactly-once
handler effects, writer tasks, workflows, delayed schedules, distributed task
ownership, task auth, retries, or full Rust/Python task parity are claimed.
Python sources: templates/reboot.py.j2:420-467,858-1028,2350-2475;
aio/state_managers.py:4743-5009,6586-6593,6848-6867;
aio/internals/tasks_dispatcher.py. Rust: src/one_shot_tasks.rs and src/codegen.rs;
acceptance: tests/fixtures/task_vertical_acceptance.rs.


The crate began as a schema/proto spike and now contains several durable Rust
runtime slices. It is not yet full Python SDK parity; the evidence-backed
implementation status and pending sidecar acceptances live in
[`PARITY.md`](PARITY.md), and the source-to-source capability inventory is in
[`PARITY-MAP.md`](PARITY-MAP.md).

It proves two real boundaries without importing Python or Node.js:

1. Rust can describe Reboot state/method semantics and emit the existing
   language-neutral Reboot `.proto` contract.
2. Rust can compile Reboot's existing cross-language Echo proto with `tonic`,
   build typed gRPC clients, and attach the external-call metadata Reboot
   requires (`x-reboot-state-ref`, caller-supplied or generated write
   idempotency UUID, optional Bearer token).

```sh
cd reboot/rust
cargo test --locked
# Serves the in-memory EchoMethods host on 127.0.0.1:50051.
cargo run --locked
# Use Reboot's durable Database sidecar for the single-actor Echo adapter.
# The endpoint must include its scheme, for example http://127.0.0.1:50053.
REBOOT_RUST_DATABASE_ENDPOINT=http://127.0.0.1:50053 cargo run --locked
# Use a local, restart-safe state directory for the Echo host. This remains a
# single-process development store, not distributed Reboot durability.
REBOOT_RUST_STATE_DIR=./reboot-rust-state cargo run --locked
# Override explicitly when running more than one local host.
REBOOT_RUST_LISTEN_ADDR=127.0.0.1:50052 cargo run --locked
```

The `build.rs` compilation input is Reboot's existing
`tests/reboot/protoc/explicit_state_annotations_full.proto`, including its
Reboot options and gRPC service. This is deliberately **proto-first**: it
exercises the stable wire format rather than pretending that Rust has a mature
schema-reflection implementation already.

The emitted schema uses Reboot's current `rbt/v1alpha1/options.proto`:

- state type and stable protobuf field tags;
- required/optional field compatibility metadata;
- service → state mapping;
- reader/writer/transaction/workflow method kinds.

The Rust test suite writes the emitted Clinic schema to disk and invokes the
vendored `protoc` against the repository's actual Reboot options. That matters:
string assertions alone can happily bless a proto that cannot compile. The
current DSL emits all proto3 scalar types plus named nested, enum, `repeated`, `map`, and
`oneof` request/response models; maps accept every protobuf-eligible scalar key type. All
models retain the same stable tags and requiredness
metadata as state; enum declarations require a zero/default first variant plus unique
variant names/numbers; package segments and top-level state/message/enum names are valid and
unique. Impossible nested `repeated`/`map` shapes and duplicate field names (including
fields shared with a `oneof`) are rejected before emission.
Undeclared/duplicate method request-response models are rejected too.
`check_backward_compatible_with` also rejects a
published field tag or enum variant being removed, repurposed, or otherwise
changed. A field may be removed only by reserving both its old protobuf tag and
name, which the emitter writes as native `reserved` declarations. Broader
compatibility rules are the next schema slice.

## What this proves

The Reboot **proto and external-client** boundary is viable across languages.
The generated Rust client compiles against the same Echo service surface that
Python and TypeScript integration tests use. The crate also exports a small,
executable `runtime::InMemoryHost` Tonic `EchoMethods` implementation. It keys
process-local actors by `x-reboot-state-ref`, requires a UUID
`x-reboot-idempotency-key` for `Reply`, replays completed writes only for the
same canonical request, rejects same-key request collisions, and serves
`LastMessage` from the matching actor. Its integration tests use generated
clients against a real Tonic server to verify state persistence, replay, actor
isolation, and invalid metadata handling. This does **not** prove that Reboot
servicers are language-neutral: today the server lifecycle and service adapter
are Python-owned, and the Node implementation embeds/generated Python plus a
native Node↔Python bridge.

## Current limits exposed by the spike

This is **not** a runnable generic Rust Reboot backend yet. Current source has hard-coded
Python/Node assumptions that must be generalized before `rbt dev run` can host
one:

1. `reboot/cli/commands/dev.py` accepts only `--python` or `--nodejs` and
   chooses `sys.executable` or `node` as the launcher.
2. `rbt generate` can invoke this crate's prebuilt plugin, but it does not
   build or install it. Rust generation remains adapter-only and requires
   pre-existing protobuf bindings.
3. The crate has executable process-local runtime slices: the default
   `InMemoryActor` host has serialized state reads/writes, idempotent
   write-response caching with same-key collision detection, and rollback of
   failed transactional writes.
   `REBOOT_RUST_DATABASE_ENDPOINT` selects a reusable `DatabaseActorStore`
   plus the concrete `EchoMethodsAdapter`. The store uses Reboot's existing
   Database sidecar to atomically persist state and a completed writer response
   in one `Store(sync=true)` request, then the adapter recovers a response by
   UUID before running a retry. The same store is exercised by a separate
   generated-style Counter reader/writer adapter fixture, proving that the
   storage boundary is not Echo-specific. Concrete Tonic service adapters still
   must be generated per service; this is not a generic dispatcher or complete
   sidecar lifecycle. `REBOOT_RUST_STATE_DIR` instead selects `FileBackedHost`
   for local restart testing, including persisted same-key collision detection;
   that file store remains single-process and has no
   inter-process locks, compaction, encryption, or distributed coordination.
4. Python and Node generated servicer libraries own context propagation,
   retries, persistent state reads/writes, task/workflow semantics, and gRPC
   registration. Rust still needs the corresponding durable runtime crate.
5. Rust has no built-in reflection for struct fields/tags. A production SDK
   needs a `#[derive(RebootState)]` procedural macro or an explicit schema DSL
   to retain stable tags and compatibility checks.

## Cargo-native adapter generation

Downstream Cargo consumers can generate Prost/Tonic bindings and Reboot adapters
from their own `build.rs`; no installed `protoc` or `protoc-gen-reboot_rust` is
needed. Add the feature only to build dependencies:

```toml
[build-dependencies]
reboot-rust-schema = { path = "../reboot/rust", features = ["build"] }
```

```rust
// build.rs
fn main() {
    reboot_rust_schema::build::compile_protos(
        &["proto/counter.proto"],
        &["proto", "../reboot"],
        "crate::proto",
    ).unwrap();
}
```

The helper uses a vendored `protoc` for that build-script invocation, invokes
`tonic-build` with `build_server(true)` and `btree_map(["."])`, writes
$OUT_DIR/reboot-rust-descriptor-set.bin`, and emits a proto-relative adapter
such as `$OUT_DIR/counter.reboot.rs`. The consumer owns the protobuf module and
includes both outputs:

```rust
pub mod proto {
    tonic::include_proto!("my.package");
}
mod adapters {
    include!(concat!(env!("OUT_DIR"), "/counter.reboot.rs"));
}
```

`proto_module` must be a Rust path matching that module (for example
`crate::proto`). By default, generated durable adapters import the runtime as
`reboot_rust_schema::runtime`. If the Cargo dependency is renamed, pass that
crate path to `compile_protos_with_runtime`:

```toml
[build-dependencies]
reboot = { package = "reboot-rust-schema", path = "../reboot/rust", features = ["build"] }

[dependencies]
reboot = { package = "reboot-rust-schema", path = "../reboot/rust" }
```

```rust
// build.rs
fn main() {
    reboot::build::compile_protos_with_runtime(
        &["proto/counter.proto"],
        &["proto", "../reboot"],
        "crate::proto",
        "reboot",
    ).unwrap();
}
```

`proto_module` and `runtime_module` must be valid Rust paths. Unsupported
inputs fail exactly as the executable plugin: only unary reader/writer methods,
same-package top-level request/response/state types, and annotated service
state are supported.

## Concrete Tonic forwarding plugin

This crate also provides `protoc-gen-reboot_rust`, a narrow `protoc` plugin for
authoring concrete Tonic handlers against the schema bindings already exported
as `reboot_rust_schema::proto`. Build it with Cargo, make the binary available
on `PATH`, then invoke `protoc` with the required deterministic parameter:

```sh
cd reboot/rust
cargo build --locked --bin protoc-gen-reboot_rust
PATH="$PWD/target/debug:$PATH" protoc \
  --reboot_rust_opt=module=reboot_rust_schema::proto \
  --reboot_rust_out=generated \
  --proto_path=../.. ../../tests/reboot/protoc/counter.proto
```

After installing that prebuilt binary on `PATH`, the equivalent Reboot CLI
invocation is:

```sh
rbt generate \
  --rust=generated \
  --rust-module=reboot_rust_schema::proto \
  api
```

This invokes only `protoc-gen-reboot_rust` with the supplied module path. It
does not build the plugin or generate Prost/Tonic protobuf bindings; provide
those bindings in the module named by `--rust-module` first. Durable adapters
import `reboot_rust_schema::runtime` by default. When the runtime Cargo
dependency is renamed, add `runtime_module=<Rust path>` to
`--reboot_rust_opt`, for example
`--reboot_rust_opt=module=crate::proto,runtime_module=reboot`.

The direct plugin cannot choose the map container in consumer-owned Prost
bindings. For fingerprinted writer requests containing protobuf maps, direct
plugin consumers must generate deterministic bindings (for example with
`tonic_build::configure().btree_map(["."])`) so those fields use `BTreeMap`.
The Cargo-native helper does this automatically; raw direct-plugin generation
is not changed by it.

For every selected service, the plugin preserves the concrete unary forwarding
`ServiceHandler`/`ServiceAdapter<H>` output. When `protoc` supplies a genuine
`rbt.v1alpha1.service` state option and a unary `rbt.v1alpha1.method` reader or
writer option, it additionally emits an async `ServiceDatabaseHandler`
(using `#[tonic::async_trait]`) and a `ServiceDatabaseAdapter<H>` backed by
`DatabaseActorStore`. Handlers may await while borrowing loaded state. The
adapter also emits a public `StateDurableState` marker implementing
`runtime::DurableStateDeclaration`, binding its Prost state to the canonical
Database state-type string without an impossible orphan-rule implementation on
the downstream protobuf type. Generated adapter calls use that marker; this is
a type-safe local binding, not generic dispatch or distributed coordination.

The durable adapter owns metadata validation, state-reference isolation,
idempotent writer replay, state load, and atomic `Store(sync=true)` of the final
state and idempotency response; application handlers retain their domain
behavior. Writer serialization is process-local for stores using the same
normalized Tonic endpoint, state type, and state reference, including
independently connected stores. It is not guaranteed across endpoint aliases,
proxies, or alternative spellings, and never coordinates across processes,
hosts, or a distributed deployment. `Store` does not make side effects awaited
by a handler transactional or exactly-once.
Streaming methods, unsupported Reboot method kinds, missing annotated state,
cross-package message types, and nested types are rejected rather than guessed.
This remains concrete per-service code: there is no dynamic dispatcher, macro
system, or generic domain mutation.
