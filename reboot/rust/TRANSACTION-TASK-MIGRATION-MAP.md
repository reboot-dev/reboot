# Transaction task / atomic composition migration map

Reviewed starting point: `f6d47955a75999a120790bff0c14db617d87c62c`.

## Actual engine and Python contracts

- `reboot/api.py:997-1023`: Transaction requires an explicit Exclusive or Shared mode. A writer declaration is not a transaction declaration.
- `reboot/templates/reboot.py.j2:861-946`: reader/writer/transaction task dispatch invokes the ordinary generated method via WorkflowStub. Writer and transaction task calls use stable `Idempotency(alias=f'Task {UUID}')`. Workflow control-loop execution and terminal task completion remain separate.
- The same template's scheduling middleware persists Pending plus admission receipt on the original application RPC, returns the UUID in successful trailers, and does not execute the body before admission ACK. There is no canonical Tasks.Spawn RPC.
- `reboot/aio/state_managers.py:4700-4744`: transaction tasks remain staged transaction effects, dispatched only after commit. `complete_task:4746-4785` is a separate durable terminal operation under the actor lock.
- `reboot/server/database.cc:3351-3497`: ParticipantPrepare applies deferred state/tasks/idempotent mutations to the real RocksDB transaction and prepares it; ParticipantCommit commits that transaction. Abort rolls back the prepared transaction. This is legacy 2PC, not the isolated Rust Native2pc protocol.

## Existing Rust, not newly implemented here

- Generated exclusive root/inbound TransactionAdapter handlers already use DurableActorParticipant and DurableRootCoordinator. Generated transaction clients propagate the owned context and participants, including registered same-host composition.
- Supervised trees already support participant-local reader AND ordinary-writer successors. The ordinary writer rejection on unowned/non-tree remote roots must not be mistaken for a universal missing capability.
- Exclusive external root calls with idempotency metadata stage automatic response receipts in the participant transaction. Replay re-acquires actor admission, authorizes the current raw state, and validates RPC/request fingerprints before returning the original response.
- PendingActorEffects and participant Prepare own actor/receipt/successor atomicity. An ordinary writer's Store checkpoint and terminal CompleteTask CAS remain separate; none of this change merges them.

## Chosen executable foundation

Generated `*WorkflowTransactionRef` methods for exclusive, non-factory transaction descriptors invoke the public generated RPC through a dispatcher-owned WorkflowContext. They use a **distinct** `reboot.outbound.transaction.v1` / `outbound-transaction.v1` durable identity domain, preserving all existing writer/spawn keys exactly. Source intent binds destination/application, request, method and response contract before dispatch. Restart retries the same target key, reconsulting target authorization even when a source result was already acknowledged.

The existing root-star owner previously rejected all idempotency metadata. This checkpoint adds the missing **bound exclusive root-star receipt** seam: generated code binds the validated automatic receipt before pre-Load root registration; ordinary idempotent contexts still cannot opt into tree execution by metadata alone. The registered root/abort reservation remains mandatory. The root guard requires exactly its actor/key/fingerprint-bound response mutation in staged effects, and task validation admits that exact root only. Nested contexts clear the binding. Shared, reusable, constructor-default and recoverable-declared-error branches keep their previous fences. Bound roots reject network outbound dispatch rather than forwarding root idempotency into an unqualified remote child; composition uses the existing registered same-host, one-use ticket and credential allowlist.

The target's actual legacy coordinator owns multi-actor atomic commit. The source journal is a separate durable operation. A source operation cannot continue after an uncertain target RPC or source acknowledgement. No implicit in-attempt transport retry or fresh key on uncertainty is introduced. Credentials are explicit outbound service credentials, not recovered task-user identity and not Python's private magic token.

Transaction declared errors deliberately remain failed operations: they do not satisfy the ordinary-writer durable declared-error receipt contract. Shared roots, factories and ordinary writers are not emitted as transaction-reference methods. At that foundation, canonical scheduling headers remained rejected on TransactionAdapter; the follow-on explicit owner below admits only its eligible registered transaction targets.

## Native acceptance shape

Actual generated Python WeakReference.spawn schedules a workflow Run and awaits its typed task; that workflow calls a generated exclusive transaction reference. The generated public target RPC runs a registered root -> leaf composition using original participants and the real C++ Database/RocksDB. Both actors are initialized via generated public constructor RPCs, never raw Store seeding. Positive roots stage a future reader successor with the root response receipt. A negative root fails after a successful child staging call and must roll back both actors without a success receipt or committed successor.

Retained restart before source acknowledgement must return the original target response after an intervening real transaction, without repeating either actor's handler or minting another successor. Changed payload and current authorization denial must fail before replay disclosure. Source and target have separate native Database processes so one task owner's recovery cannot mistake the other host's task catalog for its own.

## Direct canonical transaction-task checkpoint

The follow-on `with_canonical_transaction_tasks(channel, application, bearer)` registration admits eligible exclusive non-factory transaction methods on an existing original-participant owner. The bounded generator currently requires a service already carrying a DatabaseActorStore (a mixed service with ordinary methods). Shared/factory methods and methods declaring transaction errors retain their rejection fences. The registration is explicit, actor scoped and participant bound; the host must register recovery before admission.

Canonical Python `WeakReference.spawn(transaction_method)` now calls that **original application RPC**, stores the actual transaction method in Pending, and obtains the acknowledged UUID in successful trailers. Immutable `TaskMethodDeclaration::transaction()` is distinct from both workflow declarations and ordinary writers. The experimental workflow-only Spawn service does not acquire transaction authority. Generated Rust typed task construction/Wait methods are emitted for eligible methods; canonical cancellation terminals remain Cancelled, not an undeclared-error DataLoss.

Execution reuses the dispatcher-owned journal capability but never an ordinary writer handler or Store checkpoint as a substitute for a transaction. The initial canonical reload owns actor admission only while validating; no task lease spans the target RPC. The generated exclusive transaction reference invokes the real public root RPC, allowing its original participant to acquire the actor normally. The existing legacy coordinator retains target state/response-receipt/successor atomicity, including registered root-star child composition. The source intent/result journal and terminal CompleteTask CAS remain separate durable operations.

The source journal is workflow scoped by the canonical task UUID; the target automatic root receipt retains its separate root scope. Intent binds actor/application/method/request/result and reuses the same distinct transaction-domain target key on restart. A target transport or source ACK failure does not mint a replacement identity or silently retry within an attempt. The recovered call consults current target authorization before original-response replay. Only acknowledged target completion followed by acknowledged source result can reach the terminal CAS.

Future transaction Cancel is a separate synchronous CAS under the same actor gate used by canonical executor reload. It reloads and checks the actual durable task before publication, keeping the lease through terminal ACK. **Due or running transaction tasks cannot be cancelled**: a known transaction target returns FailedPrecondition before ordinary-body signalling or cancellation uncertainty is published. A read-only preview classifies non-transaction tasks before waiting for actor admission, preserving ordinary reader-body interruption on mixed owners. If an absent preview races later admission, the authoritative post-signal reload also fences a due transaction; that exceptional path fails closed with uncertainty rather than acknowledging cancellation. No Cancel ACK is granted while a coordinator/participant could still commit. Host shutdown remains uncertainty/recovery, not Cancel.

The integrated native gate uses the actual generated Python Apply task client and real C++ Database/RocksDB: immediate/delayed execution, future Cancel, duplicate admission/payload rejection, restart before source acknowledgement, actual target-RPC ACK loss, current-policy denial on replay, rejection of running cancellation, and rollback. Exact old-admission-fence and skipped-target-receipt mutants remain RED; accepted source must be GREEN. The actual generated consumer also compiles canonical Empty transaction tasks separately from local Empty and passes strict Clippy. See the [direct-task qualification](tests/evidence/direct-transaction-20261020.md).

## Declared-error follow-on

The [declared transaction-task map](DECLARED-TRANSACTION-TASK-MAP.md) supersedes only the declared-error fence described above. It retains original registered participants, current target authorization, exact request/error-type-list binding, and separate native Abort / error receipt Store / source journal / terminal CAS ACK boundaries. Pure adapters are deferred.

## Still missing / not claimed

This is bounded direct exclusive transaction-task support, not full Python task parity. Pure transaction-only adapters without a DatabaseActorStore, shared/factory targets, broad declared-error continuation outside canonical tasks, running cancellation, broad Python retry/middleware/internal-credential and recovered user-identity parity, dynamic placement/migration, remote-child receipt-bound composition, and future successor execution remain open. The fixture's outbound credentials are explicit host-owned service credentials, not Python's private magic token. Target commit, source-journal ACK and terminal CAS are intentionally not described as one atomic operation.
