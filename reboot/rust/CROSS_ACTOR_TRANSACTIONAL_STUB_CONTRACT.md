# Cross-actor transactions: generated typed stub contract

## Decision

Rust cross-actor transactions must follow Reboot's existing model: a **generated
outbound application RPC** carries the current transaction context to the target
actor. The target executes its generated application handler as a nested
participant and returns its participant identity in Reboot metadata. The root
unions those identities and later drives 2PC.

This replaces the earlier idea of a standalone `ParticipantLifecycle.Start` /
`Stage` service. The existing terminal `Participant` service remains terminal
2PC control only, but no new lifecycle RPC is required: the generated target
application RPC is the typed execution envelope.

## Native contract evidence

* Python generated stubs select the target method statically, resolve the target
  state reference through the channel manager, and make a normal typed RPC
  inside the current transaction context: `reboot/aio/stubs.py` (479-500,
  615-624, 680-715).
* The inbound target extends the transaction-ID path while retaining the root
  coordinator identity: `reboot/aio/contexts.py` (1218-1244, 1265-1312).
* The callee returns its participant set in trailing metadata; the caller unions
  it into the root context: `reboot/aio/stubs.py` (747-753) and
  `reboot/aio/contexts.py` (253-342).
* Durable sidecar records store the participant identity and staged effects, not
  a dynamic method-dispatch record: `rbt/v1alpha1/database.proto` (43-68,
  460-482).

## Rust execution contract

1. **Generated type chooses the method.** An application handler invokes a
   generated typed client/stub for a declared Reboot service and a typed state
   reference. Rust must not introduce a caller-controlled method string,
   reflection dispatch, or generic `Any` envelope.
2. **Host owns routing.** The generated stub receives a host-injected resolver
   or typed channel factory. It maps the explicit `(state_type, state_ref)` to
   an endpoint; it never derives an address, picks placement, constructs an
   actor, creates a UUID, or substitutes a clock.
3. **Known headers only.** The stub forwards the validated Reboot metadata
   allowlist (transaction path, root coordinator, identity/auth, workflow,
   idempotency, retry age, tracing, internal-call flags) and replaces the target
   state-ref header. Unknown inbound metadata is not transitively forwarded.
4. **Nested target execution.** The target generated Tonic adapter recognizes an
   inbound transaction context, validates that the target actor is hosted,
   extends the transaction-ID path, loads and locks its durable participant,
   deserializes the concrete state, authorizes, invokes the concrete generated
   handler, and stages `TransactionExecution` effects. It returns the generated
   response plus its participant identity in trailing Reboot metadata.
5. **Root collection and 2PC.** The root handler collects deduplicated returned
   participant identities. Before *any* terminal `Participant.Prepare`, the
   root persists the complete participant set with `preparing=true`; recovery
   re-resolves and controls every recorded target. Terminal RPC transport errors
   remain ambiguous; only `PrepareResponse.abort` is a definitive abort.
6. **Retry identity.** Each target call uses the existing transaction path,
   method identity, target actor identity, and deterministic request fingerprint.
   A pending/prepared matching target is resumed or replayed, not invoked twice;
   identity or fingerprint mismatch is rejected.

## Required implementation sequence

1. Extend generated Rust application client/stub generation with an explicitly
   injected transactional channel/resolver and typed outbound calls.
2. Extend generated Rust server adapters to admit and execute the limited
   inbound nested root context, while preserving current explicit rejection of
   unsupported shared, factory, read-only, and placement-selected shapes.
3. Add typed participant metadata encode/decode and root participant collection.
4. Generalize durable coordinator records/recovery from one target to a
   canonical, duplicate-free set only after all participants can be constructed,
   staged, and recovered.
5. Add end-to-end tests for Household -> Task: staged nested effects before the
   durable coordinator write, complete-set persistence before prepare, retry /
   ambiguity behavior, and restart recovery across both actors.

## Current boundary

The Rust SDK currently supports only a fresh same-actor root transaction. It
must continue rejecting inbound/nested and multi-actor shapes until steps 1-4
are implemented and tested. `family-tasks` must not claim Household -> Task
atomicity before that point.
