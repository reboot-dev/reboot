# Rust SDK parity ledger

This ledger is deliberately evidence-based. A row is **implemented** only when
it has an exercised Rust path; it is **proven against the sidecar** only when a
real C++ Database process/RocksDB acceptance covers it. Unit fixtures and
in-process fake sidecars are useful but do not establish distributed semantics.

## Implemented and verified in Rust

- Proto/Tonic generation, concrete unary service adapters, state admission, and
  typed outbound transaction clients.
- Durable Database-sidecar state and idempotency mutation handling, including a
  request fingerprint collision guard.
- Root exclusive transactions, root factory transactions, inbound participant
  handling, returned participant collection, and durable legacy coordinator
  `Watch`/recovery ordering.
- Bounded shared/read-only transactions: read-only participants are classified
  separately from writers, and all-read-only decisions are persisted.
- Isolated Native2pc protocol, recovery/materialization primitives, placement
  plan validation, and native state reads. Native2pc deliberately does not reuse
  legacy participant/coordinator records or RPCs.
- Actor gate shared/exclusive exclusion, FIFO writer queueing, reader-barge
  prevention, cancellation-safe queue removal, and retryable upgrade rejection
  when a queued writer would otherwise deadlock a snapshot holder.

The strict Rust baseline at commit `a4c56672` is `cargo fmt --check`, locked
all-target/all-feature Clippy with warnings denied, and locked all-target/all-
feature tests. Native C++ Database acceptances are separately gated by
`REBOOT_NATIVE2PC_CXX_DATABASE` and are intentionally ignored without it.

## Pending: fresh local shared-to-exclusive promotion

**Use case:** a fresh root transaction for one existing actor starts shared. If
its final state is byte-for-byte unchanged, it completes read-only. If its
final state changes, it upgrades atomically and commits as the sole local
writer. This is the bounded Python-compatible case; it excludes factory,
nesting, placement, automatic idempotency, tasks, collection effects, returned
participants, remote calls, workflows, and Native2pc.

**Why it is pending:** Rust has the gate and participant classification pieces,
but no safe end-to-end generated path yet. The production path must retain the
exact local pending ownership and actor lease through successful
`CoordinatorPrepare` acknowledgement. It must then directly prepare/commit/abort
that exact local participant rather than resolve it again by address.

The generated fresh-shared API also needs a separate opaque local-only handler
context. Passing the normal `TransactionContext` would permit outbound calls or
returned participants, violating the bounded local guarantee. Compatibility is
non-negotiable: if an application does not opt into the opaque hook, the
promotable local lease must be dropped first, then the existing legacy shared
read-only handler runs in a separately started transaction. The legacy handler
must never inherit promotion authority.

**Required acceptance coverage before this can be marked implemented:**

1. Generated/downstream fixture: opt-in changed final state uses direct local
   coordinator completion; the resolver is never called for that participant.
2. Generated/downstream fixture: opt-in unchanged final state completes the
   direct read-only path without C++ participant write/terminal calls.
3. Generated/downstream fixture: `Unsupported` hook releases the local
   promotable lease before the legacy handler begins; the legacy handler cannot
   promote, mutate transaction state, or make an outbound transactional call
   under that authority.
4. Unit tests: pre-`CoordinatorPrepare` error/cancellation drops and releases
   pending gate ownership; after a successful acknowledgement, drop does not
   release it because durable recovery owns ambiguity.
5. Unit tests: reject every out-of-scope shape (factory, nested, absent actor,
   tasks, idempotency, returned participants, placement, remote effects).
6. Real C++ Database/RocksDB process tests: same-host contention, durable final
   bytes, kill/restart after coordinator-prepare and after decision, recovery,
   and exactly-once final application/response.

## Pending: exclusive-to-shared downgrade

**Use case:** Python's actor lock lets an exclusive holder downgrade to shared,
then grants already-queued compatible readers while later writers remain behind
them. Rust currently implements shared acquisition, exclusive FIFO acquisition,
and shared-to-exclusive upgrade, but deliberately exposes no downgrade API.

**Why it is pending:** Rust does not currently queue shared waiters, so it
cannot distinguish readers that were waiting before a writer from readers trying
to barge after that writer. Adding a superficial `downgrade()` would either
starve the writer or violate the existing no-reader-barge guarantee. This needs
a unified ordered reader/writer waiter queue plus cancellation tests before an
API is added.

**Required acceptance coverage:** readers queued before a writer are admitted
on downgrade; readers arriving after that writer are not; cancelled readers and
writers are removed safely; no two exclusive leases coexist; and an upgrader
never jumps the queue or deadlocks while retaining its snapshot.

## Other known parity gaps

These are not blockers for the local promotion slice and should be tackled
independently rather than smuggled into it:

- Generic Rust application lifecycle/registration comparable to Python's
  application and middleware runtime.
- Task/workflow execution, reactive/streaming readers, colocated collection
  range effects, and their durable recovery semantics.
- General nested/distributed transaction behavior beyond the explicitly
  supported legacy and isolated Native2pc paths.
- First-class Rust state reflection/derive support with the same schema
  compatibility model as the Python-facing SDK.
- CLI support to build/install/run a Rust application rather than requiring a
  prebuilt plugin and consumer-owned Prost/Tonic bindings.

Each requires its own design and real sidecar acceptance; none should be claimed
by the current generated unary adapter surface.
