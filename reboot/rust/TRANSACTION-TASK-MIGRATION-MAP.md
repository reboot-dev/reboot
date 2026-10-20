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

Transaction declared errors deliberately remain failed operations: they do not satisfy the ordinary-writer durable declared-error receipt contract. Shared roots, factories and ordinary writers are not emitted as transaction-reference methods. Existing unsupported canonical scheduling headers remain rejected on TransactionAdapter.

## Native acceptance shape

Actual generated Python WeakReference.spawn schedules a workflow Run and awaits its typed task; that workflow calls a generated exclusive transaction reference. The generated public target RPC runs a registered root -> leaf composition using original participants and the real C++ Database/RocksDB. Both actors are initialized via generated public constructor RPCs, never raw Store seeding. Positive roots stage a future reader successor with the root response receipt. A negative root fails after a successful child staging call and must roll back both actors without a success receipt or committed successor.

Retained restart before source acknowledgement must return the original target response after an intervening real transaction, without repeating either actor's handler or minting another successor. Changed payload and current authorization denial must fail before replay disclosure. Source and target have separate native Database processes so one task owner's recovery cannot mistake the other host's task catalog for its own.

## Still missing / not claimed

This is **not** direct canonical `WeakReference.spawn(transaction_method)` admission or a standalone transaction-task dispatcher. It closes the generated scheduled-workflow -> real transaction-root composition seam, not the entire requested transaction-target migration. Direct transaction task admission still needs one integrated host-owned coordinator execution/cancellation boundary: no exclusive task lease recursively acquired by the root participant, no task completion before all coordinator ACKs, no cancel ACK while a prepared remote effect can still commit, and strict target receipt/admission binding across uncertain restarts. Full Python retry/middleware/internal-credential parity, dynamic placement/migration, shared/factory transaction task targets, durable declared transaction-error replay, and transaction task successor catalogs remain open.
