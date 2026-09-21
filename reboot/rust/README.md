# Experimental Rust schema input

This is a deliberately small spike for a third Reboot SDK language. It proves
that a Rust application can describe Reboot state and method semantics and emit
the existing language-neutral Reboot `.proto` contract without importing
Python or Node.js.

```sh
cd reboot/rust
cargo run --locked
```

The emitted schema uses Reboot's current `rbt/v1alpha1/options.proto`:

- state type and stable protobuf field tags;
- required/optional field compatibility metadata;
- service → state mapping;
- reader/writer/transaction/workflow method kinds.

## What this proves

The Reboot semantic descriptor is a viable cross-language boundary. A Rust SDK
can generate API schemas accepted by the existing Reboot tooling, just as the
Pydantic and Zod paths do today.

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
