# Experimental Rust schema input

This is a deliberately small spike for a third Reboot SDK language. It proves
two real boundaries without importing Python or Node.js:

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
`x-reboot-idempotency-key` for `Reply`, replays completed writes, and serves
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
2. `reboot/cli/commands/generate.py` exposes only Python/Node.js codegen and
   boilerplate plugins; `rbt generate --rust` does not invoke this crate's
   standalone `protoc-gen-reboot_rust` yet.
3. The crate has executable process-local runtime slices: the default
   `InMemoryActor` host has serialized state reads/writes, idempotent
   write-response caching, and rollback of failed transactional writes.
   `REBOOT_RUST_DATABASE_ENDPOINT` selects a reusable `DatabaseActorStore`
   plus the concrete `EchoMethodsAdapter`. The store uses Reboot's existing
   Database sidecar to atomically persist state and a completed writer response
   in one `Store(sync=true)` request, then the adapter recovers a response by
   UUID before running a retry. The same store is exercised by a separate
   generated-style Counter reader/writer adapter fixture, proving that the
   storage boundary is not Echo-specific. Concrete Tonic service adapters still
   must be generated per service; this is not a generic dispatcher or complete
   sidecar lifecycle. `REBOOT_RUST_STATE_DIR` instead selects `FileBackedHost`
   for local restart testing; that file store remains single-process and has no
   inter-process locks, compaction, encryption, or distributed coordination.
4. Python and Node generated servicer libraries own context propagation,
   retries, persistent state reads/writes, task/workflow semantics, and gRPC
   registration. Rust still needs the corresponding durable runtime crate.
5. Rust has no built-in reflection for struct fields/tags. A production SDK
   needs a `#[derive(RebootState)]` procedural macro or an explicit schema DSL
   to retain stable tags and compatibility checks.

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

For every selected service, the plugin emits a concrete `ServiceHandler` trait
and `ServiceAdapter<H>` implementing that service's tonic-build server trait.
The generated adapter forwards only unary requests and responses whose types
are top-level messages in the same protobuf package. Streaming methods,
cross-package message types, nested types, and invalid `module=<Rust path>`
parameters are rejected by the plugin rather than generating unusable Rust.

The plugin has no durable semantics: it does not inspect Reboot options, map
reader/writer methods to storage, or replace `DatabaseActorStore`. Application
code still explicitly registers each generated adapter with its corresponding
Tonic server.
