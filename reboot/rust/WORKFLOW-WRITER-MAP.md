# Callable workflow writer: bounded external-unary vertical

The separate executable workflow-to-workflow spawn foundation is mapped in
[WORKFLOW-SPAWN-MAP.md](WORKFLOW-SPAWN-MAP.md). It reuses this immutable source
intent/ACK discipline but adds actual target task admission and typed canonical
Wait; the ordinary-writer reference's historical scope below is unchanged.

## Source map (before implementation)

- Python `aio/contexts.py:1364-1520`: dispatcher-owned WorkflowContext, task UUID seed, loop/seed-scoped deterministic keys. `templates/reboot.py.j2:1960-2008` constructs generated references from context, explicitly does NOT inherit bearer credentials, derives caller application identity, and resolves state channels. `:2226-2254` wraps each writer in context.idempotently (target/type/method/request), then passes key/per-iteration/always to the real RPC via `aio/stubs.py:504`. Python's trusted caller-auth propagation, automatic routing/retry and transaction machinery are broader than this slice.
- Rust `workflow_context.rs:1741`: private dispatcher context owns no actor lease; individual operations validate the durable task/owner. Tasks do not persist original bearer/application credentials. Never invent those on recovery.
- Rust `workflow_at_most_once.rs:597-751`: control-only durable Started/Stored journal, bounded contract fingerprint and ACK uncertainty guards. Started currently refuses replay for arbitrary effects; do not weaken that guarantee.
- Rust `runtime.rs:4411-4504`: generated ordinary authorized writer checks current policy before receipt replay; receipt fingerprint binds full method/request; state plus response are one Store, success follows ACK.
- Rust `codegen.rs:1901-1949`: actual generated external clients exist, but automatically retry transport errors. Workflow calls must not use that retry loop or create fresh keys.

## Chosen seam

Generate a separate typed workflow writer reference for ordinary, non-constructor database writers. Host explicitly supplies one fixed channel, canonical ActorRef, application CallerId and optional outbound bearer credential (not recovered original user auth). No endpoint discovery, trusted internal-call bypass, cross-application forwarding, transactions, scheduling or spawn. Each call uses a named scope key derived from the actual workflow identity. A source-owned intent contract binds application/actor/method/payload before outbound dispatch. Replay re-dispatches the SAME key through the generated target adapter, whose current authorization and durable receipt arbitrate effects. A successful source journal checkpoint follows the target ACK and its own ACK. Different intent is rejected even after a crash between target ACK and source completion. Undeclared errors/cancellation are nonretryable within an attempt; a later recovered task can retry the same immutable intent. Explicit durable declared errors can be caught after both ACKs. Atomic multi-actor commit is explicitly NOT provided.

## Python error/retry contracts and checkpoint boundary

- `aio/stubs.py:490-501`: workflow failures restart the whole workflow; individual calls do not transparently retry (unlike ExternalContext). `:741-769` distinguishes backend/recoverable aborts from uncertain transport failures in transactional calls.
- `aio/idempotency.py:400-501`: `idempotently` binds mutation identity, propagates backend aborts without treating them as unknown mutations, and tracks uncertainty for other failures. It does **not** itself pickle/memoize arbitrary exception values.
- `aio/aborted.py:473-519`: only a declared error or an explicitly recognized framework/backend error establishes known backend provenance; a network error is not proof of a declared application outcome.
- `templates/reboot.py.j2:1149-1233`: retryable aborts propagate; declared errors are translated to this method's own declared type; unrelated/unhandled errors become Unknown. `:939-946` completes a task only for its own declared error. These are different from success-only memoization in `aio/memoize.py:211-246,291-303` (at-most-once failures retain diagnostic failure information; success Store pickles the actual result).
- The declared-error vertical now distinguishes generated explicit typed variants from `Grpc`/System failures. Only workflow-bearing ordinary calls persist failed read-only target receipts. An explicit `DeclaredStatus` variant supports full raw rich-status bytes; generated schema validation runs before provenance conversion. The target emits a durable outcome marker only after Store ACK/replay; the source validates its generated schema, saves a distinct error-marked Stored journal and acknowledges the operation before returning `WorkflowWriterError<E>::Declared { error, status }`. Generic callback failures and unknown ACKs remain poisoned. This is not Python exception pickling or generic Status caching.

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

Prior checkpoint status: bounded correctness repair and evidence complete. Its
pause was superseded by the requested declared-error extension; no prior evidence
was rewritten or recounted as new qualification.
Prior 291 native joins, three loss boundaries and seven regression cases retain
their original bounded meaning; they are not replaced or recounted here.

## Acceptance

Declared error extension: generated explicit typed/`DeclaredStatus` branches use a
separate ordinary-writer disposition, not `TaskHandlerError`: canonical task errors
permit one detail, while this unary contract retains multiple ordered details plus
unknown status fields byte-for-byte. Inspect validated RPC workflow metadata before
the authorization-context copy strips workflow/transaction headers. Authorization
still uses only its sanitized copy. Default external errors remain non-memoized.

Final qualification and review/publication limits are recorded in the declared
target-error subsection of `PARITY.md` and
`tests/evidence/workflow-declared-errors-20261020.json`.

Generated two-actor native Database/RocksDB path, crash after target ACK and before source result journal, retained DB/host restart and replay, exact handler count/state/receipt, payload/destination mismatch denial, authorization/error/cancellation and uncertainty gates; Rust library and generator consumer gates on exact final source. No fresh C++ compile claim for reused native binary.
