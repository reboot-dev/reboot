# Callable workflow writer: bounded external-unary vertical

## Source map (before implementation)

- Python `aio/contexts.py:1364-1520`: dispatcher-owned WorkflowContext, task UUID seed, loop/seed-scoped deterministic keys. `templates/reboot.py.j2:1960-2008` constructs generated references from context, explicitly does NOT inherit bearer credentials, derives caller application identity, and resolves state channels. `:2226-2254` wraps each writer in context.idempotently (target/type/method/request), then passes key/per-iteration/always to the real RPC via `aio/stubs.py:504`. Python's trusted caller-auth propagation, automatic routing/retry and transaction machinery are broader than this slice.
- Rust `workflow_context.rs:1741`: private dispatcher context owns no actor lease; individual operations validate the durable task/owner. Tasks do not persist original bearer/application credentials. Never invent those on recovery.
- Rust `workflow_at_most_once.rs:597-751`: control-only durable Started/Stored journal, bounded contract fingerprint and ACK uncertainty guards. Started currently refuses replay for arbitrary effects; do not weaken that guarantee.
- Rust `runtime.rs:4411-4504`: generated ordinary authorized writer checks current policy before receipt replay; receipt fingerprint binds full method/request; state plus response are one Store, success follows ACK.
- Rust `codegen.rs:1901-1949`: actual generated external clients exist, but automatically retry transport errors. Workflow calls must not use that retry loop or create fresh keys.

## Chosen seam

Generate a separate typed workflow writer reference for ordinary, non-constructor database writers. Host explicitly supplies one fixed channel, canonical ActorRef, application CallerId and optional outbound bearer credential (not recovered original user auth). No endpoint discovery, trusted internal-call bypass, cross-application forwarding, transactions, scheduling or spawn. Each call uses a named scope key derived from the actual workflow identity. A source-owned intent contract binds application/actor/method/payload before outbound dispatch. Replay re-dispatches the SAME key through the generated target adapter, whose current authorization and durable receipt arbitrate effects. A successful source journal checkpoint follows the target ACK and its own ACK. Different intent is rejected even after a crash between target ACK and source completion. Any error/cancellation is nonretryable within an attempt; a later recovered task can retry the same immutable intent. Atomic multi-actor commit is explicitly NOT provided.

## Python error/retry contracts and checkpoint boundary

- `aio/stubs.py:490-501`: workflow failures restart the whole workflow; individual calls do not transparently retry (unlike ExternalContext). `:741-769` distinguishes backend/recoverable aborts from uncertain transport failures in transactional calls.
- `aio/idempotency.py:400-501`: `idempotently` binds mutation identity, propagates backend aborts without treating them as unknown mutations, and tracks uncertainty for other failures. It does **not** itself pickle/memoize arbitrary exception values.
- `aio/aborted.py:473-519`: only a declared error or an explicitly recognized framework/backend error establishes known backend provenance; a network error is not proof of a declared application outcome.
- `templates/reboot.py.j2:1149-1233`: retryable aborts propagate; declared errors are translated to this method's own declared type; unrelated/unhandled errors become Unknown. `:939-946` completes a task only for its own declared error. These are different from success-only memoization in `aio/memoize.py:211-246,291-303` (at-most-once failures retain diagnostic failure information; success Store pickles the actual result).
- Rust generated writer handler errors currently leave only Started, poison the attempt, and are not durable business outcomes. This checkpoint deliberately does **not** invent generic Status caching: declared target-error recognition, a durable full status/details envelope, replay authorization, and non-poisoning caught declared errors remain unimplemented. Python's provenance distinctions must guide that follow-up rather than treating any gRPC code/detail shape as declared authority.

## Native lost-ACK checkpoint

`database_ack_proxy.py` transparently forwards raw Database RPC bytes. For exactly one selected synchronous Store it first receives the real successful native response, retains request/response bytes and hashes, then parks. An independent direct Database connection verifies source checkpoint phase, pending task and complete target state/receipts while the ACK is withheld. Releasing the fault returns Unavailable, never success. No fake database, mutation replay, or synthetic commit response participates.

`prove_ack_loss.py` exercises target Store, source Started Store and source Stored Store through the generated public scheduling/reference/target path, using separate source and target hosts. Errors terminate the source owner before a successful return. Fresh target mutation on the same unknown-ACK host rejects; full target/source/native restart recovers the stable key without duplicate effects. Changed payload and revoked credentials are rejected with unchanged durable records. An independent decoder checks phase 1/1/2 for the retained source envelopes. The seven previous error/cancel/auth/replay cases also pass unchanged.

The safety repair makes registered uncertain actor gates process-sticky; weak idle registration previously discarded the uncertainty latch. Both ordinary writer envelopes now reject an uncertain gate before further mutation. Clean gates still retire normally. Two library regressions cover gate retention, clean retirement, actor isolation and sticky uncertainty across other known ACKs. Native RED removes only uncertain retention and observes a fresh target mutation return 8; GREEN rejects it and later recovers 7. Evidence: `tests/evidence/workflow-store-ack-loss-20261019.json` and `.tar.gz`; exact final source/native qualification is in archive `suite-final3`, with earlier attempts preserved, not relabeled.

## Final narrow correctness repair and pause

The workflow-capable generated adapter uses a distinct ordinary-writer envelope,
`workflow_scheduling_writer`. Its dispatcher admission does not see actor-only
uncertainty caused by a taskless `store_type`. Check the sticky actor latch after
taking its exclusive lease, before loading state, entering a handler or Store.

`crosspath.rs` and the extended `prove_ack_loss.py` qualify that exact transition:
real taskless Store ACK withheld, all original handles dropped, fresh same-endpoint
workflow-capable generated adapter and fresh key. RED commits 8; GREEN rejects
without handler/Store. Different-actor and independent native-store controls pass.
The full extended gate also reruns target/Started/Stored loss recovery. Final
source inputs match all 363 manifest entries; locked offline all-targets and
strict SDK/fixture Clippy pass. Receipts and failed formatting-check attempt are
in `tests/evidence/workflow-crosspath-uncertainty-20261019.{json,tar.gz}`.

Plan status: bounded correctness repair and evidence complete; **parent review,
then PAUSE unpublished**. No declared-error memoization or further feature work.
Prior 291 native joins, three loss boundaries and seven regression cases retain
their original bounded meaning; they are not replaced or recounted here.

## Acceptance

Generated two-actor native Database/RocksDB path, crash after target ACK and before source result journal, retained DB/host restart and replay, exact handler count/state/receipt, payload/destination mismatch denial, authorization/error/cancellation and uncertainty gates; Rust library and generator consumer gates on exact final source. No fresh C++ compile claim for reused native binary.
