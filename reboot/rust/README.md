# Rust Reboot SDK

Experimental Cargo-native SDK for independently authored Rust applications.

**[Current parity, safe scopes, source/test evidence and verification](PARITY.md)**
is the single capability ledger. No separate candidate or feature-status document
is authoritative. See it before assuming production or general distributed
semantics.

## Local app quickstart

The crate is unpublished; init requires a checkout and a compatible canonical C++
Database binary. The raw Database listener is unauthenticated and non-loopback: use
an isolated trusted development network. This is not a production deployment.

```sh
mkdir greetings && cd greetings
rbt init --backend=rust --frontend=none --application-name=greetings \
  --rust-sdk=/absolute/path/to/sdk/reboot/rust
export RBT_RUST_DATABASE_BINARY=/absolute/path/to/reboot/server/database
rbt dev run --rust-allow-insecure-database
```

From another terminal in that project:

```sh
cargo run --manifest-path backend/Cargo.toml --bin client -- create
cargo run --manifest-path backend/Cargo.toml --bin client -- greet
cargo run --manifest-path backend/Cargo.toml --bin client -- read
```

For [build/generation](PARITY.md#schema-generation-and-ordinary-state-apis),
[host/CLI lifecycle](PARITY.md#local-app-development),
[transactions](PARITY.md#legacy-transactions-and-ownership),
[tasks](PARITY.md#durable-tasks-and-typed-results),
[workflows](PARITY.md#durable-named-workflows),
[reactive readers](PARITY.md#local-reactive-readers),
[SortedMap](PARITY.md#canonical-sortedmap) and
[verification commands](PARITY.md#verification), use the same ledger.


### Bounded unary reader composition

Database-only generated adapters can opt ordinary unary readers into an installed
same-endpoint `LocalReaderRegistry` with `with_reader_registry`. Finalize the
adapter's authorization, register its `local_readers` clones, enable composition,
then attach a complete registry clone and install the original on ApplicationHost.
Attachment checks matching generated handler/policy identity and Database endpoint.
Root dispatch and every dependency retain generated authenticated snapshot Load.
Each admitted unary request evaluates once, seals its context, and drops its
cursor before returning; it retains no background subscription. Admission shares
the existing 64-slot pool. Inbound timeouts become one absolute deadline, including
result decoding. Mutation/transaction/workflow authority is rejected. Arbitrary
root extensions are preserved, not delegated; existing trusted application scope
and target authority are forwarded through their established private extensions.

Custom adapters default to strict registered roots. `with_legacy_unary_roots`
explicitly preserves a bounded exact list of non-composed, still-authorized legacy
roots; it cannot shadow registered roots. The greeting scaffold explicitly retains
raw `hello` without repairing it into a different canonical reference. Attachment
is not actor creation, and policy changes detach old registry/list state.
Terminal evaluated Unavailable errors retain their code with an SDK marker, which
prevents generated reader clients from implicitly retrying that evaluation; actual
unmarked disconnected transport classification and mutation clients are unchanged.
No atomic multi-actor snapshots, remote invalidation, nested composition, durable
resume or mixed/workflow root context parity is claimed.

Required store identity fields and both local subscription entry points reject
duplicate identity metadata before routing or snapshot authorization. This keeps
actor selection and authorization attached to the same literal identity; identical
repeated fields are rejected too. Single legacy identifiers remain unchanged.
