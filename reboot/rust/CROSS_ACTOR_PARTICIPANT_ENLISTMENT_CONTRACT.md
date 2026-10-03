# Cross-actor participant enlistment: rejected lifecycle-RPC proposal

> **Superseded:** Reboot's authoritative cross-actor model is a generated typed
> outbound application RPC carrying the existing transaction context—not a
> standalone `ParticipantLifecycle.Start` / `Stage` service. See
> [`CROSS_ACTOR_TRANSACTIONAL_STUB_CONTRACT.md`](CROSS_ACTOR_TRANSACTIONAL_STUB_CONTRACT.md).
>
> This document is retained as the analysis that established why terminal
> `Participant` control RPCs cannot themselves start or stage an actor. Its
> proposed new lifecycle service must **not** be implemented: the generated
> application RPC is the correct execution envelope.

## Historical finding

`rbt.v1alpha1.Participant` cannot enlist a remote actor by itself. It exposes
only terminal 2PC control, so reusing those methods for start/load/stage would
be unsafe. The correct replacement is the typed application-RPC model above,
not a new lifecycle service.

## Why the existing `Participant` service is insufficient

`transactions.proto` defines only four terminal/control calls:

```proto
service Participant {
  rpc Prepare(PrepareRequest) returns (PrepareResponse);
  rpc Commit(CommitRequest) returns (CommitResponse);
  rpc Abort(AbortRequest) returns (AbortResponse);
  rpc RelinquishOwnership(RelinquishOwnershipRequest)
      returns (RelinquishOwnershipResponse);
}
```

`PrepareRequest`, `CommitRequest`, and `AbortRequest` contain only a
transaction id (plus prepare-result/read-only compatibility flags).  The
participant identity is supplied as `x-reboot-state-ref` metadata; there is no
state type, coordinator identity, load result, staged state, task, or
idempotent-mutation payload.

That shape is intentional in the existing implementations:

* `DurableActorParticipantHost` accepts `Prepare` only for a pending local
  transaction that `DurableActorParticipant::start` has already created; it
  cannot call `start` or `stage` from the request
  (`reboot/rust/src/durable_participant.rs`, `start` at 229, `stage` at 265,
  host at 481).
* `ParticipantEndpoint` and `ParticipantResolver` expose only
  `prepare`/`commit`/`abort` (`reboot/rust/src/durable_coordinator.rs`, 75-99).
  `TonicParticipantEndpoint` is consequently terminal-control-only.
* Python starts a participant before coordinator fan-out by registering it,
  acquiring its lock, and (when applicable) storing it
  (`reboot/aio/state_managers.py`, `_transaction_participant_start` at
  5454).  Its coordinator sends `Participant.Prepare` only later
  (`_transaction_coordinator_prepare` at 5665).
* `Database.Load` and `Database.TransactionParticipantPrepare` are sidecar
  calls, not calls on the public `Participant` service
  (`rbt/v1alpha1/database.proto`, `LoadRequest` at 312 and
  `TransactionParticipantPrepareRequest` at 460).

Reusing `Prepare` to mean "start/load/stage" would overload a terminal 2PC
operation, omit required data, and break recovery ordering.  A Rust-only trait
would also be dishonest: `TonicParticipantEndpoint` has no RPC with which to
perform the trait remotely.

## Required protobuf addition

Add the following to `rbt/v1alpha1/transactions.proto` (new message and service
names; do not change existing `Participant` fields or RPC meanings).  The file
must also import `database.proto`, because `Task` and `IdempotentMutation` are
defined there:

```proto
import "rbt/v1alpha1/database.proto";

// A complete actor identity. The caller supplies it explicitly; the resolved
// endpoint must reject a request whose target is not the actor it hosts.
message ParticipantTarget {
  string state_type = 1;
  string state_ref = 2;
}

// Begins exactly one root/exclusive participant lifecycle and loads its state.
// This version has no mode/factory/read-only/nested fields: those variants are
// not supported by this contract and must be added as explicitly versioned
// semantics later, rather than silently defaulting.
message StartParticipantRequest {
  bytes transaction_id = 1;       // exactly one 16-byte root UUID
  ParticipantTarget target = 2;
  ParticipantTarget coordinator = 3;
}

message StartParticipantResponse {
  // Presence distinguishes a missing actor from a present actor whose
  // serialized protobuf state is empty.
  optional bytes state = 1;
}

// Supplies the final effects for the already-started target. `state` has the
// same presence semantics as StartParticipantResponse.state.
message StageParticipantRequest {
  bytes transaction_id = 1;
  ParticipantTarget target = 2;
  optional bytes state = 3;
  repeated Task task_upserts = 4;
  repeated IdempotentMutation idempotent_mutations = 5;
}

message StageParticipantResponse {}

// Lifecycle/enlistment is separate from terminal Participant control.
service ParticipantLifecycle {
  rpc Start(StartParticipantRequest) returns (StartParticipantResponse);
  rpc Stage(StageParticipantRequest) returns (StageParticipantResponse);
}
```

`Task` and `IdempotentMutation` already appear in the sidecar prepare payload,
and `optional bytes state` preserves the existing `Actor.state`/`LoadResponse`
presence distinction.  The `ParticipantTarget` and `coordinator` fields are
needed because the existing terminal request has neither target type nor
coordinator identity, while the sidecar `Transaction` persists both actor and
coordinator identity for recovery (`database.proto`, 45-68).

The lifecycle RPC carries the normal application/auth metadata required by the
host, but target selection is the explicit message field above.  A resolver may
supply an endpoint for a target; it must not derive an address from a state ref,
choose placement, construct an actor, generate a UUID, or substitute a clock.

## Rust boundary after the wire contract exists

Only after generated bindings contain `ParticipantLifecycle` should the public
Rust surface add an injected endpoint alongside the existing terminal endpoint:

```rust
type ParticipantFuture<'a, T> = Pin<Box<dyn Future<Output = Result<T, Status>> + Send + 'a>>;

pub trait ParticipantLifecycleEndpoint: Send + Sync + 'static {
    fn start(&self, request: StartParticipantRequest)
        -> ParticipantFuture<'_, StartParticipantResponse>;
    fn stage(&self, request: StageParticipantRequest)
        -> ParticipantFuture<'_, StageParticipantResponse>;
}

pub trait ParticipantResolver: Send + Sync + 'static {
    type Endpoint: ParticipantEndpoint + ParticipantLifecycleEndpoint;
    fn resolve(&self, target: &ParticipantTarget)
        -> ParticipantFuture<'_, Arc<Self::Endpoint>>;
}
```

The concrete Tonic endpoint implements both services at the resolver-provided
address.  An in-process endpoint may call the same lifecycle host directly for
tests, but must validate the full `ParticipantTarget`.  The abstraction remains
host-injected: no `connect`, address construction, placement decision, UUID
creation, or clock fallback is permitted in coordinator/enlistment code.

This is deliberately not an API for invoking arbitrary remote actor methods.
A generated adapter or host-owned executor still has to deserialize the state,
run the target-specific handler, and send the resulting effects in `Stage`.
Without that separately specified execution boundary, the lifecycle API must
not claim distributed method-dispatch semantics.

## Ordering and recovery invariants

1. **Construct/enlist before 2PC fan-out.** Resolve every explicit target,
   `Start` it, run/stage its effects, and obtain successful `Stage` responses
   before any `Participant.Prepare` is sent.  The target holds its exclusive
   lock from successful `Start` through acknowledged terminal control.
2. **Start and stage are retry-safe.** Repeating `Start` with the same target,
   root UUID, and coordinator returns the same loaded-state presence/value;
   a different identity for that UUID is a definitive rejection.  Repeating
   `Stage` with byte-identical effects succeeds without replacement; a
   different stage payload for the same UUID is a definitive rejection.
   Transport/gRPC failures are non-definitive and are retried with the exact
   request.
3. **No prepare before a complete durable participant list.** After all
   required participants have staged, write a `TransactionCoordinator` record
   containing the complete `Participants.should_commit` set with
   `preparing=true`.  Only after that durable write may prepare fan-out begin.
   The database record already represents multiple participants
   (`database.proto`, 110-141 and 514-524); the current Rust coordinator's
   one-participant restriction must be removed only with this lifecycle path.
4. **Prepare outcome is explicit; transport failure is ambiguous.** Continue
   using `Participant.Prepare(abort_via_response=true)`.  Only
   `PrepareResponse.abort` is a definitive never-prepared result.  A failed
   RPC does not justify cleanup or a user-visible abort; retain the durable
   preparing record and retry/recover.  This matches Python's retry rule
   (`state_managers.py`, 5674-5709).
5. **Recover from the durable coordinator record.** Recovery resolves each
   recorded target through the host resolver.  For `preparing=true`, re-prepare
   every recorded participant; after all prepare, durably mark the coordinator
   non-preparing; then commit every recorded participant and clean up only
   after terminal acknowledgements.  The existing native coordinator follows
   this ordering for its one participant (`durable_coordinator.rs`, 398-540).
6. **Participant recovery is terminal-only.** A sidecar-prepared participant
   is rebuilt with its lock and coordinator identity, then accepts re-prepare
   and terminal control.  An unprepared lifecycle is never commit-eligible:
   it aborts/releases on recovery.  This follows the database statement that
   only prepared transactions persist (`database.proto`, 54-61) and the native
   participant recovery/terminal checks (`durable_participant.rs`, 363-477).
7. **Failure before coordinator persistence aborts staged targets.** If Start,
   handler execution, or Stage fails before the coordinator record is written,
   do not fan out Prepare.  Abort every successfully started target, retrying
   ambiguous terminal errors.  A crash in this interval has no durable
   coordinator commit decision and no prepared participant, so recovery must
   not convert it into a commit.

## Required focused tests when implemented

* Generated Tonic bindings expose `ParticipantLifecycle.Start` and `.Stage`;
  existing `Participant` RPC descriptors remain unchanged.
* A resolver-provided remote endpoint receives the exact target/coordinator,
  starts/loads and stages before the coordinator database prepare and before
  any terminal `Prepare` call.
* Repeated Start and repeated identical Stage are idempotent; target,
  coordinator, or staged-payload mismatch is rejected without overwriting the
  pending lifecycle.
* A failed Stage or pre-record failure sends no `Participant.Prepare` and
  drives abort of already-started targets.
* A prepare transport failure leaves the complete coordinator record for
  recovery; only an explicit `PrepareResponse.abort` permits abort cleanup.
* Recovery re-resolves every recorded participant and performs
  re-prepare -> coordinator-prepared -> commit -> cleanup, while an
  unprepared recovered participant cannot commit.
