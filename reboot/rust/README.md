# Experimental Rust schema input

This is a deliberately small spike for a third Reboot SDK language. It proves
two real boundaries without importing Python or Node.js:

1. Rust can describe Reboot state/method semantics and emit the existing
   language-neutral Reboot `.proto` contract.
2. Rust can compile Reboot's existing cross-language Echo proto with `tonic`,
   build typed gRPC clients, and attach the external-call metadata Reboot
   requires (`x-reboot-state-ref`, write idempotency UUID, optional Bearer
   token).

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

## What this proves

The Reboot **proto and external-client** boundary is viable across languages.
The generated Rust client compiles against the same Echo service surface that
Python and TypeScript integration tests use. This does **not** prove that Reboot
servicers are language-neutral: today the server lifecycle and service adapter
are Python-owned, and the Node implementation embeds/generated Python plus a
native Node↔Python bridge.

## Current limits exposed by the spike

This is **not** a runnable Rust backend yet. Current source has hard-coded
Python/Node assumptions that must be generalized before `rbt dev run` can host
one:

1. `reboot/cli/commands/dev.py` accepts only `--python` or `--nodejs` and
   chooses `sys.executable` or `node` as the launcher.
2. `reboot/cli/commands/generate.py` exposes only Python/Node.js codegen and
   boilerplate plugins; there is no `protoc-gen-reboot_rust`.
3. Python and Node generated servicer libraries own context propagation,
   idempotency, retries, state reads/writes, task/workflow semantics, and
   gRPC registration. Rust needs an equivalent runtime crate, not merely
   `prost`-generated messages.
4. Rust has no built-in reflection for struct fields/tags. A production SDK
   needs a `#[derive(RebootState)]` procedural macro or an explicit schema DSL
   to retain stable tags and compatibility checks.

The next honest slice is a Rust `protoc` plugin that generates servicer traits
and a Rust runtime crate implementing the existing gRPC/state protocol. Adding
`--rust` to the CLI before those exist would be decorative plumbing.
