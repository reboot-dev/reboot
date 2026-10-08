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
