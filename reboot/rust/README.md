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
cargo run --locked
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
current DSL emits typed scalar, named nested, enum, `repeated`, `map`, and
`oneof` request/response models with the same stable tags and requiredness
metadata as state; enum declarations require a zero/default first variant plus unique
variant names/numbers; top-level state/message/enum names are unique. Impossible nested
`repeated`/`map` shapes and duplicate field names (including fields shared with a
`oneof`) are rejected before emission.
Undeclared/duplicate method request-response models are rejected too.
`check_backward_compatible_with` also rejects a
published field tag or enum variant being removed, repurposed, or otherwise
changed. A field may be removed only by reserving both its old protobuf tag and
name, which the emitter writes as native `reserved` declarations. Broader
compatibility rules are the next schema slice.

## What this proves

The Reboot **proto and external-client** boundary is viable across languages.
The generated Rust client compiles against the same Echo service surface that
Python and TypeScript integration tests use. Its integration test runs a real
Tonic Echo server, calls it through the generated client, and verifies the
state reference, idempotency key, and Bearer token reach the server. This does
**not** prove that Reboot servicers are language-neutral: today the server
lifecycle and service adapter are Python-owned, and the Node implementation
embeds/generated Python plus a native Node↔Python bridge.

## Current limits exposed by the spike

This is **not** a runnable Rust backend yet. Current source has hard-coded
Python/Node assumptions that must be generalized before `rbt dev run` can host
one:

1. `reboot/cli/commands/dev.py` accepts only `--python` or `--nodejs` and
   chooses `sys.executable` or `node` as the launcher.
2. `reboot/cli/commands/generate.py` exposes only Python/Node.js codegen and
   boilerplate plugins; there is no `protoc-gen-reboot_rust`.
3. The crate now has an executable, process-local `InMemoryActor` slice:
   serialized state reads/writes, idempotent write-response caching, and
   rollback of failed transactional writes. It is intentionally not durable and
   cannot coordinate multiple actors yet.
4. Python and Node generated servicer libraries own context propagation,
   retries, persistent state reads/writes, task/workflow semantics, and gRPC
   registration. Rust still needs the corresponding durable runtime crate.
5. Rust has no built-in reflection for struct fields/tags. A production SDK
   needs a `#[derive(RebootState)]` procedural macro or an explicit schema DSL
   to retain stable tags and compatibility checks.

The next honest slice is a Rust `protoc` plugin that generates servicer traits
and a Rust runtime crate implementing the existing gRPC/state protocol. Adding
`--rust` to the CLI before those exist would be decorative plumbing.
