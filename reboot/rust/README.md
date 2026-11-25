# Rust Reboot SDK

Experimental Cargo-native SDK for independently authored Rust applications.

**[Current parity, safe scopes, source/test evidence and verification](PARITY.md)**
is the single capability ledger. No separate candidate or feature-status document
is authoritative. See it before assuming production or general distributed
semantics.

## Signed User application

`rbt init --backend=rust --frontend=none --rust-example=secured-user
--application-name=user_app --rust-sdk=/absolute/path/to/reboot/rust` creates a
signed-credential variant with explicit authenticated Create, reader and writer.
Its README documents the trusted RSA public key, issuer and audience configuration;
client credentials are supplied through `RBT_USER_BEARER_TOKEN`, not command arguments.
The example never selects the launcher's permissive development policy.
Its opt-in `app --user-http` mode is a separate, loopback-only HTTP gateway for
one configured owner: GET `/user`, POST `/user/create`, POST `/user/greet`.
Mutation bodies are explicit UUID keys; requests forward bearer credentials to
the secured RPC adapter on every call, including replay. See the generated README
for explicit listen/upstream/owner configuration, status codes, deadlines and
independent shutdown. This is not HTTP/gRPC multiplexing or a production gateway.

Linux acceptance is reproducible using
`python tests/reboot/cli/rust_user_acceptance_runner.py` from the checkout root.
Set `CARGO_TARGET_DIR`, `REBOOT_NATIVE2PC_CXX_DATABASE`, `RUST_DX_PYTHON` (a CLI-test
Python environment with grpcio/grpcio-tools) and `RUST_DX_RBT` to your local tools.
The runner enforces exclusive target ownership, jobs=2, no incremental/debug data,
target <=8 GiB and free disk >=8 GiB. It preserves frozen evidence under a unique
`/tmp/reboot-rust-user-http-full-audit-*` directory. It is a dedicated Linux child
subreaper: failures retain the lock until tracked/adopted children exit naturally
and are reaped. Persistent observation errors require operator reconciliation;
never delete evidence, kill timeout owners or start competing builds to clear it.
Acceptance is written only after ownership reconciliation. This does not protect
against SIGKILL or arbitrary external process interference.

The optional `jwt-auth` Cargo feature exports `jwt_auth::JwtTokenVerifier::rs256`.
It pins RS256 and a structurally validated 2048..4096-bit public RSA key, verifies
exact string issuer and matching audience, requires integral nonnegative `exp`
strictly after the current second, validates optional integral `nbf`, and maps
only signed nonempty `sub` to `Auth::user_id`. No discovery, key refresh, token
minting, revocation lists, OAuth or automatic user construction is provided.
Public application authentication does not secure the raw C++ Database network.
JWT acceptance tests generate ephemeral keys using OpenSSL; no signing keys are
committed. Enable the feature explicitly in ordinary downstream consumers.

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
