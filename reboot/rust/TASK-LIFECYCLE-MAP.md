# Canonical workflow Task lifecycle

Base: `151c358616341203de7dfbd2809563ea704a72e8`.

The subsequent [canonical application-RPC admission migration](CANONICAL-TASK-ADMISSION-MAP.md)
removes the Rust-only admission dependency for new absolute/immediate workflow
spawns. The lifecycle evidence below retains its original checkpoint scope.

## Actual Python/native contracts and chosen foundation

- `templates/reboot.py.j2:4719-4836`: generated method Task owns canonical TaskId and context channel manager; awaiting calls canonical Tasks.Wait, unpacks the declared response or method-specific abort (including system Cancelled). It does not expose a task-instance cancel method. Retrieval accepts an existing ID.
- `aio/internals/tasks_servicer.py:48-126,213-253`: Wait routes to the owning actor, CancelTask requires admin authorization and authoritative placement. Cancellation is not spawn admission. No canonical Tasks.Spawn RPC exists (`rbt/v1alpha1/tasks.proto`): Python admission instead uses the original application RPC with task-schedule metadata and a successful UUID trailer, as mapped in the follow-up above.
- `aio/internals/tasks_dispatcher.py:333-364,376-400`: canonical cancellation interrupts a dispatched task and records a rich `rbt.v1alpha1.Cancelled` system terminal; host shutdown at 410-427 deliberately does not set this terminal. OK/CANCELLING/NOT_FOUND are transient administration statuses, not durable cancellation receipts.
- `server/database.cc:2713-2862`: actual CompleteTask is synchronous pending-to-completed CAS; immutable method/request/iteration must match, timestamp is preserved. It does not revoke arbitrary remote work or provide cancellation admission receipts. Existing Store remains an upsert, so SDK actor admission and uncertainty fencing remain essential.
- `templates/reboot.py.j2:6069-6209,6392-6558`: transactional/same-actor schedule and independently committed workflow spawn have different authority. Python computes relative schedules from its caller clock at 6523-6525. Rust now supports nonnegative relative delays resolved once at target admission, not caller-clock or negative-timedelta equivalence. Replay must retain the original persisted timestamp rather than recompute `now + delay`.
- Cursor advancement and receipt GC use a separate engine capability. This foundation must not admit experimental cursor spawn or relax its retention checks. Fixed channel/explicit host credentials and current actor placement remain the boundary; no dynamic placement/migration equivalence.

Chosen foundation: generated public typed Task handles with retrieval and canonical Wait, actual canonical cancellation of running non-cursor workflows and scheduled workflows, and replay-stable relative admission. Terminal/restart/replay interoperability uses Python-generated Tasks stubs and real C++ Database. A durable, validated system cancellation may be caught by a parent and followed by an acknowledged writer continuation; transport/local shutdown/malformed terminals may not. Administrative CancelTask remains explicitly nonjournaled (its raw status is not replay-stable), not a new workflow checkpoint primitive. No invented canonical spawn or cancellation receipt protocol, transaction integration, running-cursor cancellation or GC claim.

Running cancellation must hold existing actor admission across canonical CAS and notify only after its ACK. The dispatcher keeps an original, execution-owned cancellation registration, drops the cancelled body and joins through its normal supervised delivery. Completion racing cancellation has exactly one CAS winner; uncertain cancellation ACK poisons admission and does not authorize continuation. Source spawn identity/payload journal and target atomic admission are unchanged.

## Implementation and wire boundaries

- `WorkflowTask<R,E>` binds canonical identity, fixed channel, explicit host credentials, exact method and terminal schema. Generated `_task` / `_task_after` bind newly admitted tasks; `_retrieve` binds existing IDs. Method identity is checked by canonical Wait before terminal disclosure. Clone/Drop do not submit or cancel work. External Wait uses the same validation without workflow acknowledgement.
- Canonical cancellation uses existing CompleteTask CAS, not an engine protocol change. Its in-flight ACK fence is linearized against Wait's original-owner publication lock. A lost/dropped ACK sets sticky uncertainty before clearing that temporary fence. Only successful ACK notifies the exact execution-owned registration; no replacement recovery generation can inherit the registration.
- A healthy Wait remains pending while the cancellation ACK is in flight; it does not turn a brief healthy CAS into a parent transport failure. ACK-loss publication holds the same owner mutex across both uncertainty and pending-fence updates, preventing a waiter from reading clean-before-drop plus clear-after-drop. The native proxy proves an actually authorized Wait has reached this fence before releasing the real lost ACK; a separate held-publication-lock RED/GREEN test proves the atomic transition and always joins its original thread.
- Python returns OK when it initiates asynchronous interruption and can return CANCELLING on repetition. This bounded Rust service returns OK only after the terminal CAS ACK and NOT_FOUND after a completed winner; it does not emit CANCELLING. The wire enum interoperates, but administration timing/status semantics are not claimed identical. Cancellation is cooperative future-drop, not preemption of synchronous user code or rollback of already committed local/remote effects.
- The private decoder separates malformed/framework failures from validated durable outcomes. Only the latter acknowledges the parent's operation. A failed framework operation now also blocks subsequent scope admission, so catching a canonical-looking rich RPC status cannot commit the next writer before eventual finish rejects.
- Experimental `SpawnAfter` is a distinct capability RPC; legacy `Spawn` rejects relative_delay. The source journal fingerprints the delay, not a freshly computed clock value. Under the existing target actor lease, first admission computes its absolute timestamp and atomically stores task + full receipt + fingerprint. Replay validates the receipt against the immutable request and adopts only its saved timestamp. Changed delays/destinations/payloads still fail; timestamp overflow is rejected before Store. Canonical Python Tasks has no admission RPC, so this is not a replacement of a nonexistent canonical Spawn.
- Existing absolute-spawn persisted identities and request bytes remain unchanged: the added optional relative_delay is absent on that path. Source key domains, UUID derivation, source Started/Stored journals and target fingerprint domain are unchanged. Relative versus absolute requests under the same alias intentionally collide rather than minting a second identity.

## Native gate

Build `tests/fixtures/workflow_app/Cargo.toml` from the exact source, then set
`WORKFLOW_TASK_BIN`, `WORKFLOW_TASK_PYTHON` (existing grpcio/grpc_tools and
google.rpc runtime), fresh `WORKFLOW_TASK_EVIDENCE`, and
`REBOOT_NATIVE2PC_CXX_DATABASE`. Run:

```
cargo test --locked --offline --features build,test-support --test workflow_task_native -- --ignored
```

`prove_tasks.py` generates canonical Python Tasks/Errors modules, retains their
hashes, and calls those real public gRPC stubs. It records raw requests/responses,
actual native task/receipt bytes, terminal/error decoding, retained full native
restart, administrative and Wait revocation, canonical child cancellation with
parent continuation/replay, retained acknowledged effects, a completion race,
and lost real CompleteTask/relative-admission ACKs. Malformed terminal/rich RPC
faults retain the exact original and mutated wire bytes and prove no parent
continuation. This is not an actual Python-hosted application execution claim.

Every application, Database, proxy and fixture client is recorded by its original
finite parent and explicitly waited. Failure/signal cleanup retires applications
before Databases and records unresolved custody rather than claiming success.
Large binaries are hash-pinned reused artifacts; no new C++ build is attested.

Executed results and exact artifact/source pins:
[native lifecycle checkpoint](tests/evidence/workflow-task-lifecycle-20261020.md).
