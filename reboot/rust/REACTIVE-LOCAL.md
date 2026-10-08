# Rust-only bounded local reactive readers

`XDatabaseAdapter::local_readers(state_ref)` returns an exact-actor lifecycle
owner and a companion Tonic service. Register the owner using
`ApplicationHost::with_host_recovery`, register the ordinary service, then use
`RunningApplicationHost::try_add_local_readers(service)` (one actor per host).
The generic service builders deliberately reject the reserved companion route. Use generated
`XReactiveClient::reader_method` and `TypedSubscription::message`; dropping the
client subscription cancels its RPC. Unary readers remain unary. This does not
reinterpret user-declared streaming RPCs.

**v1 scope:** one reactive service, one actor, one trusted host owning all
sidecar mutations. No Python `rbt.v1alpha1.React` wire compatibility,
idempotency-key envelopes, cross-actor dependencies, distributed subscriptions,
reconnect/retries or remote-process invalidation. Generated subscription bindings
are emitted only for database-only services. Mixed transaction/workflow services
have no generated subscription API. Raw Database clients, custom persistence
implementations, and other processes mutating the sidecar are outside this
single-owner deployment contract; do not mix them with this API.

Admission is capped at 64 subscriptions per owner, input at 64KiB and emitted
snapshots at 1MiB. Each stream holds one coalescing watch revision, an immutable
response and one pending future, never a spawned worker or unbounded queue.
Revisions are registered before baseline Load. Shared actor admission covers
Load/auth/handler, never waiting for invalidations or transport backpressure.
Changes yielding identical serialized reader results are deduplicated.
Slow consumers can skip intermediate committed values but converge on the latest
committed response. Terminal declared errors preserve the method-specific decoder.

Every evaluation uses the existing generated bearer-verification and immutable
state authorization envelope; actor/type/endpoint/gate pairing is validated.
Trusted host application identity is preserved as an ingress extension, never a
caller-controlled header. A private reader scope checks current host authority
before/after Load, authorization and handler evaluation; placement revocation
is terminal even if the placement later returns. Idle streams observe revocation.
Absent lifecycle owners, wrong actors/stores, absent state, unsupported method
identities and exhausted capacity fail closed. Host cancellation destroys pending
reader futures; client drop reclaims admission without a detached worker.

## Mutation / uncertainty audit

Invalidations occur synchronously after durable ACK, before later validation or
response emission: runtime `store_type` (ordinary sync/async writers and writer
tasks), both CreateActor envelopes, `workflow_writer_step`,
`workflow_scheduling_writer`, and durable participant terminal commit. Native
participant endpoint identity chooses the canonical sidecar actor gate even for
transaction-only adapters. Prepare, abort, replay and failed handler mutation do
not notify committed state. Task status writes do not count as actor changes.

An RAII commit attempt is installed before each admitted mutation RPC. Error or
cancellation before acknowledged completion latches uncertainty on the actor
revision hub. Existing and new subscriptions terminate with Unavailable, rather
than silently remaining stale. The latch is not cleared by a later write: restart
the owning host and re-read persisted state. This deliberately does not claim
native exactly-once notification when an ACK is lost. It preserves existing
private task receipts, CAS/ABA ownership and transaction cleanup semantics.

## Exercised acceptance

`tests/reactive_native_restart.rs` runs the emitted `reactive_app` consumer and
real native Database/RocksDB with discovered local ports. Only generated public
Create/Increment APIs seed or mutate state. It checks baseline 0, committed values
1 and 2 on a live typed stream, a declared failed writer remaining quiet with
state 2, 100 durable writes while the consumer is slow, convergence to 102,
transport-drop resource reclamation, an exclusive writer reaching 103, shutdown
stream closure and actual host/native restart loading 103 in a new subscription.
Unit tests cover absent owners, endpoint/actor mismatch, pre-baseline commit race,
coalescing, capacity, uncertainty and cancelled lease admission. These are local
contract proofs, not full SDK/Python parity.
