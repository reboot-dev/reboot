# Canonical application-RPC workflow task admission

Base: `18175834a9df99aeda94786e6d804570c25f6083` (published lifecycle foundation).

Subsequent ordinary reader/writer task work is mapped separately in
[GENERIC-TASK-MIGRATION-MAP.md](GENERIC-TASK-MIGRATION-MAP.md). The workflow-only
qualification below remains historical; it does not certify that extension.

## Actual Python and native contracts

- `rbt/v1alpha1/tasks.proto` defines Wait/List/Cancel, **not** Spawn/CreateTask.
  A generated `CreateTask` class is a method-specific typed handle, not a new
  admission RPC; constructors are excluded from Python spawn/schedule emission.
- `templates/reboot.py.j2`, `WeakReference._Spawn`: calls the original generated
  application's method using its original request, with `x-reboot-task-schedule`
  metadata. Empty means immediate; Python resolves a timedelta at the caller and
  transmits an absolute ISO datetime. No Rust relative-clock rewrite is allowed.
- The same template's `*TasksStub` awaits that method's normal response, then
  reads **successful trailing** `x-reboot-task-id-uuid` and constructs TaskId.
  `_schedule_*` authorizes admission and persists a task with its mutation receipt
  before returning. The method's actual result/error comes later through Tasks.Wait.
- `server/database.cc` / `database.proto`: existing Store persists pending task
  and mutation receipt synchronously; CompleteTask is the existing terminal CAS.
  This change does not add an engine protocol or freshly rebuild native C++.

## Implemented vertical

Generated workflow-bearing application adapters now admit non-cursor workflows
through their original public RPC and canonical metadata/trailer contract. The
adapter derives the response/error schema from its declaration, not untrusted
caller-supplied schema strings. It reuses the recovered owner's current
verification/authorization, exact actor, actor lease, dispatcher generation,
capacity, sticky uncertainty and atomic task/receipt Store. Replay authorization
still precedes disclosure. No workflow body manufactures an admission ACK.
Empty schedule metadata retains the legacy no-timestamp immediate form, rather
than fingerprinting a fresh clock on retry; Python's persisted immediate-clock
representation is not claimed byte-identical. Duplicate schedule metadata uses
its **last** value for both immediate/absolute selection and timestamp parsing,
matching `RebootHeaders::from_metadata` and Python's `dict(metadata)`.

The host's successful-trailer layer emits the UUID only after admission ACK and
only with a unique successful terminal gRPC status. It does not put the UUID in
initial metadata. Generated adapters reject task-schedule metadata for currently
unsupported reader/writer/constructor targets before executing those handlers.

Generated Rust absolute/immediate `_spawn` / `_task` now use the same application
RPC. Their source Started/Stored journal, immutable SpawnRequest bytes, method,
key domains and deterministic target UUID are unchanged. Canonical transport is
not part of the persisted identity. A recovered old Started intent can replay
against a previously admitted legacy target without minting a second child.
The sender validates exactly one returned UUID against its stable expected ID
before its source Stored ACK. Malformed/missing/changed UUIDs cannot acknowledge
or authorize continuation.

Legacy experimental absolute Spawn remains a compatibility endpoint; new
absolute Rust callers no longer depend on it. `_spawn_after` / `_task_after`
remain the distinct experimental target-admission-clock capability. Their saved
absolute timestamps and identities are not rewritten into Python caller-clock
semantics. This is intentionally a bounded migration, not full scheduling parity.
A Python caller replaying a timedelta must reuse its originally resolved absolute
schedule: a freshly recomputed timestamp under the same key is still changed
intent and rejects. Python's broader scheduling/retry policy is not qualified.
The Rust sender still requires the legacy deterministic, key-derived target UUID;
Python-hosted admission/UUID-allocation behavior is not qualified by these tests.

## Remaining migration barriers

| Capability | Existing foundation | Still missing |
|---|---|---|
| Generic reader/writer task targets | Generated one-shot ReaderTaskBinding / AdmittedWriterTask, same-actor writer Store and typed terminals exist | The generic extension adds canonical DatabaseAdapter admission and workflow-bearing ordinary writer dispatch; running-writer interruption, transaction-adapter integration and dynamic ownership remain separate gates; see its map |
| Transaction task targets | Existing participant/coordinator and transaction envelopes | Canonical transaction-task admission/execution with correct participant ownership, atomic scheduling effects, replay and completion; no workflow/transaction equivalence claimed |
| Cursor targets and receipt GC | Cursor-specific durable loop/binding/advancement machinery | Cross-actor cursor admission, retention and admission-receipt GC; experimental and canonical target admission both retain the cursor fence |
| Placement | Explicit recovered OneShotTasks owner, fixed channel and ActorRef, current auth | Python channel-manager placement resolution, migration, distributed ownership/fencing and dynamic actor discovery |
| External context and credentials | Actual generated Python ExternalContext/TasksStub and typed task clients are exercised | Full Python application/middleware equivalence, credential inheritance, automatic routing and Python retry-policy equivalence |

## Qualification

`tests/canonical_task_admission_native.rs` has two explicit native gates. The
first runs the **actual generated Reboot Python** WeakReference.spawn,
*TasksStub and method-specific Task awaiting code against generated Rust public
gRPC services and real C++ Database/RocksDB. A transparent proxy retains actual
application requests/responses and initial/trailing metadata. Cases include
concurrency, typed declared errors, exact future schedule, canonical cancellation,
current admission authorization, changed intent, retained native restart and a
single raw generated application call losing a real native Store ACK.

The second builds the published legacy Rust source, retains a source Started
intent after real legacy target admission, restarts both native stores/hosts,
and recovers through the canonical application RPC with the same task/receipt.
A real upstream UUID trailer is mutated before reaching the Rust source: no
source Stored receipt or parent continuation is allowed. Restored transport
recovers the same intent and permits canonical cancellation/catch/continuation.

Every native service/proxy/client is ledgered and waited by its original finite
parent, including failure and SIGTERM cleanup. Reused C++ binary and Python
runfiles/generator provenance are pinned; source, binary, RED mutants and exact
qualification limits are retained in the checkpoint evidence, not inferred from
wire-shape equivalence. Historical lifecycle/spawn archives remain unchanged.

Executed results: [canonical admission checkpoint](tests/evidence/workflow-canonical-admission-20261020.md).

Duplicate-schedule correction and additive native RED/GREEN qualification:
[last-value schedule blocker fix](tests/evidence/workflow-canonical-duplicate-schedule-20261020.md).
