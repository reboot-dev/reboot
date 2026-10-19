# Callable workflow writer: bounded external-unary vertical

## Source map (before implementation)

- Python `aio/contexts.py:1364-1520`: dispatcher-owned WorkflowContext, task UUID seed, loop/seed-scoped deterministic keys. `templates/reboot.py.j2:1960-2008` constructs generated references from context, explicitly does NOT inherit bearer credentials, derives caller application identity, and resolves state channels. `:2226-2254` wraps each writer in context.idempotently (target/type/method/request), then passes key/per-iteration/always to the real RPC via `aio/stubs.py:504`. Python's trusted caller-auth propagation, automatic routing/retry and transaction machinery are broader than this slice.
- Rust `workflow_context.rs:1741`: private dispatcher context owns no actor lease; individual operations validate the durable task/owner. Tasks do not persist original bearer/application credentials. Never invent those on recovery.
- Rust `workflow_at_most_once.rs:597-751`: control-only durable Started/Stored journal, bounded contract fingerprint and ACK uncertainty guards. Started currently refuses replay for arbitrary effects; do not weaken that guarantee.
- Rust `runtime.rs:4411-4504`: generated ordinary authorized writer checks current policy before receipt replay; receipt fingerprint binds full method/request; state plus response are one Store, success follows ACK.
- Rust `codegen.rs:1901-1949`: actual generated external clients exist, but automatically retry transport errors. Workflow calls must not use that retry loop or create fresh keys.

## Chosen seam

Generate a separate typed workflow writer reference for ordinary, non-constructor database writers. Host explicitly supplies one fixed channel, canonical ActorRef, application CallerId and optional outbound bearer credential (not recovered original user auth). No endpoint discovery, trusted internal-call bypass, cross-application forwarding, transactions, scheduling or spawn. Each call uses a named scope key derived from the actual workflow identity. A source-owned intent contract binds application/actor/method/payload before outbound dispatch. Replay re-dispatches the SAME key through the generated target adapter, whose current authorization and durable receipt arbitrate effects. A successful source journal checkpoint follows the target ACK and its own ACK. Different intent is rejected even after a crash between target ACK and source completion. Any error/cancellation is nonretryable within an attempt; a later recovered task can retry the same immutable intent. Atomic multi-actor commit is explicitly NOT provided.

## Acceptance

Generated two-actor native Database/RocksDB path, crash after target ACK and before source result journal, retained DB/host restart and replay, exact handler count/state/receipt, payload/destination mismatch denial, authorization/error/cancellation and uncertainty gates; Rust library and generator consumer gates on exact final source. No fresh C++ compile claim for reused native binary.
