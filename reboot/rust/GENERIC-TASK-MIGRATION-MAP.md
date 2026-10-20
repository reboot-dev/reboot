# Generic callable task migration contract

Base: `bc0ef551798dd4d4db16bf953401625beef3175b` (PR216).

## Actual Python contract

- `reboot/templates/reboot.py.j2:861-946`: dispatch distinguishes reader/writer/transaction from workflows. Ordinary methods execute through their WorkflowStub; writer/transaction calls use stable task-derived idempotency, then task completion is a separate durable operation. A writer task is not a workflow body with renamed metadata.
- `reboot/templates/reboot.py.j2:1473-1582`: original application RPC admission authorizes scheduling as a writer and persists the pending task and admission receipt. Method body does not execute before admission ACK. Successful trailing metadata carries UUID. No Tasks.Spawn protocol exists.
- `reboot/templates/reboot.py.j2:6069-6209,6392-6558`: constructors/streaming methods excluded; transactional schedule and independently committed workflow/external spawn differ. Relative timedelta is caller-resolved absolute time, not experimental target-clock SpawnAfter.
- `reboot/aio/internals/tasks_dispatcher.py:333-427`: canonical cancellation differs from shutdown and preserves already-committed effects; task interruption must be owned and joined.
- `reboot/server/database.cc` Store/CompleteTask and `rbt/v1alpha1/database.proto`: Store persists actor plus ordinary-writer checkpoint atomically; separate CompleteTask CAS persists typed terminal. Store remains upsert; actor admission, original generation, and uncertainty fences cannot be bypassed.

## Chosen capability

Canonical original-RPC admission of ordinary writer/reader tasks on explicitly registered existing actors using existing OneShotTasks and native atomic writer checkpoint authority. Plain DatabaseAdapter services use their existing generated typed binding and `_with_tasks` handler. Workflow-bearing adapters gain actual ordinary writer binding and dispatch through their existing `_scheduled` handler with the same local-state/task restrictions as unary execution. No fake engine/adapter substitutes or invented wire types.

Admission receipt/identity domains, workflow journal, duplicate-LAST metadata, immediate/absolute semantics and experimental target-clock relative workflow identities remain unchanged. Legacy experimental Spawn/SpawnAfter remain workflow-only. Generic capability is enabled only by canonical application RPC routing. Constructors, workflow-reader-wait descriptors and cursors remain fenced. TransactionAdapter database/transaction front doors explicitly reject task-schedule metadata before handler/participant work, rather than treating a spawn as an ordinary unary mutation; shared-factory methods remain unimplemented. This is a fail-closed boundary, not transaction task execution parity.

## Required proof

Actual generated Python WeakReference.spawn/TasksStub/typed Wait, native C++ Database/RocksDB, same-key concurrency, replay authorization, declared typed errors with private-state discard, exact absolute schedule, canonical cancellation, native admission/Store/completion ACK loss, state+checkpoint retained before terminal, restart replay after intervening unary writer, and no duplicate body/effect. Retain source mutants with bytes/diffs, frozen GREEN, strict all-target SDK/fixture Clippy, original finite parent cleanup under failure and real SIGTERM, and offhost compact evidence.

## Next necessary foundation: running ordinary task cancellation

The missing seam is executor/actor ownership, not protobuf routing. A cancel request needs a dispatcher-owned, generation-bound quiescence handoff that can drop/join a pending user body before obtaining the exclusive actor authority for CompleteTask. That handoff must distinguish pre-Store interruption from a started/uncertain Store, prevent fresh delivery while cancellation is unresolved, and retain uncertainty until restart if a durable ACK is lost. Only after body retirement and native cancellation CAS ACK may canonical Wait/Cancel authorize continuation. Preserve the existing publication mutex. A transport adapter or a cancellation flag checked only after the handler returns cannot implement this contract. Required new negatives include cancellation of a parked body holding admission, body/Store/CAS races, request-drop and lost-ACK handoff, replacement generation, and no body/effects after the cancellation ACK.

## Explicit architecture limits

Ordinary writer execution currently retains an exclusive actor lease through user async code and completion. Thus a cancel request cannot interrupt a parked writer body: it waits for that lease. Scheduled/not-yet-executing cancellation can win; a writer already completing can win before cancellation. This is NOT Python running-writer interruption parity. Adding pre-ACK task interruption safely requires a separate cancellation/actor handoff design and proof; do not claim it based on scheduled cancellation alone. Reader execution similarly retains shared admission through its body and needs its own running interruption/race qualification. Typed declared protobuf variants are task terminals; the unary-only `DeclaredStatus` rich-writer variant is still a framework failure in task dispatch (in particular, the existing one-detail task validator is not widened for multi-detail rich statuses). Handlers may rerun before their first acknowledged checkpoint; no exactly-once external side-effect guarantee is added. Dynamic placement/migration, Python-hosted UUID allocation, cursor receipt GC and transaction-adapter/task execution remain out of scope.
