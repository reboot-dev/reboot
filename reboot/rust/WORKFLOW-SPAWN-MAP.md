# Generated callable workflow spawning

Current absolute/immediate generated references use the canonical application
RPC admission contract, including actual generated Reboot Python clients:
[current admission map](CANONICAL-TASK-ADMISSION-MAP.md). The original experimental
Spawn endpoint remains for compatibility; SpawnAfter retains its separate clock.

This records the original spawn checkpoint. Current typed Task handles, canonical
running-child cancellation and bounded relative scheduling are mapped separately
in [TASK-LIFECYCLE-MAP.md](TASK-LIFECYCLE-MAP.md); its new evidence does not rewrite
the original proof boundaries or retrospectively turn source shutdown into
canonical child cancellation.

## Python contract map

Mapped against the source at base `091b42d093bc2a92026322053227f81196e34f85`:

| Python source | Contract | Rust implementation / bounded difference |
|---|---|---|
| `templates/reboot.py.j2:5101-5126,5202+` | WeakReference binds canonical target identity and an explicit optional bearer; its cached stubs are context-bound. | Generated `*WorkflowRef` binds one canonical ActorRef, fixed channel and explicit host-provided caller/service credential. It does not cache a Python-style context-bound stub or inherit user authority. |
| `templates/reboot.py.j2:1960-2008` | Context caller application is propagated; original user bearer is not implicitly forwarded. Channel manager resolves the actor. | Host supplies the caller/application and channel; existing server-owned ingress identity is preserved. No automatic placement/migration or trusted internal-auth bypass. |
| `templates/reboot.py.j2:6069-6209`, `aio/contexts.py:1641-1687` | `schedule()` belongs to transactions or a writer's own actor. A workflow uses `spawn()`, not `schedule()`. | Existing same-actor scheduling writer remains unchanged. This change adds independently committed **workflow-to-workflow spawn**, not cross-actor transaction scheduling. |
| `templates/reboot.py.j2:6392-6558` | Bare workflow spawn selects per-workflow or per-iteration idempotency; non-constructor unary targets include workflows and other callable methods. Return a typed Task object. | Generated workflow-only `method_spawn(context, alias, request, absolute_timestamp)` returns canonical TaskId; `method_wait(context, id)` is typed; `method(context, alias, request)` composes both. Ordinary readers/writers are not new spawn targets. Constructors are explicitly excluded by Python too (`:6094,6433`), not a missing constructor prerequisite for this vertical. |
| `aio/contexts.py:1458-1519` | Task UUID seeds deterministic identity; loop iteration and merged seed scopes affect keys. | Actual dispatcher-owned context and existing checkpoint-key machinery select root/finite/seed scope. The source's immutable intent binds target, method, payload, schedule, response type and declared-error schema. Cursor scopes reject rather than bypass cross-actor retention. |
| `templates/reboot.py.j2:6523-6558` | None/absolute/relative schedule, task stub returns ID, typed task wrapper binds the context. | None or explicit absolute protobuf UTC timestamp only. No relative timedelta recomputation or implicit task-object binding. |

## Implemented execution path

1. `workflow_spawn_codegen.rs` emits executable `*WorkflowRef` methods from actual workflow descriptors and the adapter's `workflow_spawner()` accessor. Other method kinds are not emitted. Existing workflow helper collision checks cover `_spawn`/`_wait`; the new adapter helper name is reserved.
2. `workflow_spawn_client.rs` uses the established `invoke_writer` intent journal, not an at-least-once callback memo. Started Store ACK precedes dispatch. Target task UUID is a deterministic, domain-separated UUID-v4-shaped value of the stable target idempotency key (canonical native admission requires v4 shape; it is not randomly regenerated). Target response identity is checked before the source stores it. Source Stored ACK precedes returning TaskId. Aliases share the existing callable-writer intent namespace: repurposing an alias fails rather than silently dispatching a different operation.
3. `workflow_spawn.rs` implements the experimental Rust-only `WorkflowSpawner.Spawn` transport. The generated adapter supplies its exact registered recovered OneShotTasks owner and AuthorizationPolicy. Admission requires an existing exact actor, a declared non-cursor workflow, matching response/error schema, current token verification/authorization, live dispatcher generation, exclusive actor lease, a clean sticky uncertainty latch and available live-task budget.
4. One synchronous real Database Store atomically persists **pending task + full task admission receipt + fingerprint**. No handler runs to manufacture that receipt. Both the receipt and canonical task must agree on replay, including Completed tasks. Current-state authorization runs before receipt disclosure. Changed request, timestamp or terminal schema fails closed. An existing task without the atomic receipt cannot be adopted/reopened. Dispatch is a bounded hint after ACK; the existing host-owned durable rescan/recovery remains authoritative. Store failure/drop owns the existing commit uncertainty and scheduling-handoff fences.
5. Typed Wait uses the canonical authorized `rbt.v1alpha1.Tasks.Wait` service, with the exact expected workflow method. A decoded success or validated **durable declared terminal** acknowledges the source operation. Network/backend failure, invalid terminal, parent cancellation and canonical child cancellation do not authorize continuation. This does not cache arbitrary Status values or weaken generic at-most-once Started handling.

## Native qualification and scope

`tests/fixtures/workflow_app/prove_spawn.py` uses two independently hosted generated application services, two actual C++ Database/RocksDB processes and canonical public gRPC calls. It never seeds actors/tasks/receipts or retries a mutation. Its finite original parent atomically records every original child and waits all of them; the remote owner has a separately waited durable parent.

The cases include source-ACK crash/restart, target admission replay, concurrent same-alias calls, changed payload/destination/schedule rejection, target authorization revocation, independent Wait revocation, typed child-error catch plus a durable parent continuation, cancellation, and future task scheduling. Raw target task/receipt bytes are compared across retained native restart. Constructor/writer/malformed payload/schema/timestamp negative probes leave durable state unchanged. A transparent raw Database proxy retains actual successful upstream Store request/response bytes, withholds the ACK at target admission / source Started / source Stored, and releases only Unavailable. No successful spawn, catch or parent continuation is allowed before both ACKs. Fresh native/host restart recovers the stable task without duplicate target effects. The source-Stored loss case retains a declared child error without prematurely catching it.

The explicit ignored Rust gate is `tests/workflow_spawn_native.rs`; build the exact-source fixture first and supply `WORKFLOW_SPAWN_BIN`, `WORKFLOW_SPAWN_PYTHON` (grpcio), `WORKFLOW_SPAWN_EVIDENCE` (fresh) and `REBOOT_NATIVE2PC_CXX_DATABASE`. Run `cargo test --locked --offline --test workflow_spawn_native -- --ignored`.

This is not full scheduling parity: no new transaction participant scheduling, generic reader/writer task execution, external-context convenience API, constructors, cursor-target admission/GC, relative schedules, automatic routing, dynamic actor discovery, distributed ownership/fencing or atomic parent/child commit. One WorkflowSpawner route binds one explicitly registered actor owner per host. Pending children survive parent cancellation; no implicit cascading cancellation is claimed. Retained task/receipt garbage collection and a Python-style typed Task object remain future work. The reused native executable is hashed; no new C++ build attestation is claimed. Historical proof archives and the closed benchmark report are unchanged.
