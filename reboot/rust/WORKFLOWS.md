# Durable named workflows v1 (local development)

A standalone service may declare `option (rbt.v1alpha1.method).workflow = {};`.
The generator emits a typed database handler, `ServiceWorkflowSteps`,
`ServiceTasks`, `ServiceTasksWait`, and `DatabaseAdapter::with_workflows`.
A direct public workflow RPC is rejected with PermissionDenied. Arbitrary public
workflow metadata is never private task authority.

Register the returned task owner with `ApplicationHost::with_host_recovery` and
mount its canonical public Tasks wait service using the application's accepted
legacy placement. This is explicit host registration, not a self-starting worker.
See the runnable `tests/fixtures/workflow_app` application and its
`workflow/v1/workflow.proto` contract.

## Scheduling from an ordinary generated writer

The generated writer has an optional `method_scheduled` handler hook, returning
`TransactionExecution<Response>` with local task upserts. The default calls the
ordinary writer and schedules nothing. Override the hook to use
`ServiceTasks::workflow(state_ref, &typed_request, optional_utc_timestamp)` and
return the task ID in the writer's typed response. The writer atomically stores
its state, task records and idempotent response through canonical CXX Store with
`sync=true`. Reusing the scheduling UUID returns the same saved handle without
rescheduling; method/request collisions and incomplete fingerprints fail closed.
Scheduling requires an existing actor and the exact running local owner.

## Named typed steps

A workflow handler receives a private `WorkflowContext`. Invoke generated typed
`ServiceWorkflowSteps::writer(context, Arc<Handler>, "explicit-name", request)`.
Each step acquires its actor lease independently, checks the exact pending task,
running owner generation and cancellation, and atomically stores its effect plus
typed result and provenance. On restart the body runs again, but an acknowledged
step replays its saved result without rerunning its writer. The workflow body
holds no actor lease across its own waits. The terminal result is persisted with
canonical CompleteTask CAS and exposed through the generated typed Wait helper.

Names are bounded, mandatory, workflow-global identities. The v1 named-step key
uses the Python **external key helper** UUIDv5(workflow_uuid, name), not Python's
fully-qualified typed RPC manager alias. Writer method, typed result contract,
workflow method/request, and step request are fingerprint-bound to that name;
changing any of them is rejected instead of rerunning a conflicting effect.
This deliberate bounded named-step API is not exact Python typed-RPC key parity.
Outside loops `workflow_iteration` is absent, **not Some(0)**, even though the
Task iteration remains zero. Legacy incomplete replay records are rejected.

## Limits and evidence

Same actor, explicit finite named ordinary-writer steps only. No control loop or
iteration advancement, until/subscribe, reactive readers, arbitrary external
side effects, nested transactions, cross-actor/distributed workflows, mixed
transaction/workflow service, or declared workflow errors. One host dispatcher
serializes workflow bodies; a parked body does not block actor readers/writers
but does block other workflow deliveries during a body and its bounded delay.
Override the generated `run_attempt` hook (named after each workflow) to return
`WorkflowBodyError::RetryLocal(message)` for an explicitly local computation
failure. The default hook maps ordinary handler `Status` errors to `Failed`, which
is always nonretryable, including Internal from real Tonic IO/H2 transport errors.
A clean explicit local disposition receives at most three total host-owned
attempts and 25/50ms backoff, without restarting the host.
The original owner generation, exact Pending identity and cancellation are checked
again; acknowledged named steps replay their saved typed results, not their writers.
Any failed, dropped or still-active named-step/scope/finish operation irreversibly
fences retry for that attempt, even if the body swallows its error. Ordinary Status errors (including Internal, Unknown, Unavailable, Cancelled,
DeadlineExceeded and Aborted),
canonical Load/recovery failures, Store uncertainty and completion failures are
not retried. This is deliberately narrower than Python's workflow retries.
Only local body computation and supported named steps are in scope; arbitrary
external effects are not exactly-once and must not rely on these retries.

Exhaustion still fails the supervised host under the existing dispatcher contract
(`one_shot_tasks.rs`, `OneShotTaskRecovery::start`); Pending progress is retained
for restart recovery. No durable failure/quarantine state or independent workflow
failure/readiness contract exists, so this change does not invent one or silently
skip failed work. The three-attempt budget is local to one host delivery and resets
after a host restart; it is not a durable global lifetime retry budget.
Unauthenticated native Database requires explicit insecure-development opt-in
when using `rbt dev run`; this fixture launches a test-owned native process.
No cloud, packaging or full SDK parity claim.

Run the genuine process proof:

```sh
REBOOT_NATIVE2PC_CXX_DATABASE=/path/to/bazel-bin/reboot/server/database \
  cargo test --locked --all-features --test workflow_native_restart -- --ignored --nocapture
```

The proof uses generated Create/ScheduleWork RPCs (never task Store seeding), a
persisted future UTC schedule and restart before due, a first-step ACK pause with
concurrent public Read, actual host plus CXX/RocksDB restarts, exact effect counts,
scheduling replay/collision rejection, private-RPC denial, durable typed terminal
after another restart, canonical Load/provenance inspection and owned cleanup.

`generated_workflow_body_resumes_without_host_restart_and_fences_unsafe_failures`
adds real CXX/RocksDB proof of a first body failure followed by same-host success,
first-handler invocation exactly once, subsequent work/read readiness, bounded
three-attempt exhaustion, one-attempt transport (including actual BrokenPipe to
Internal conversion), swallowed/dropped-step, native Load and finish-Load fences;
parked-delay cancellation, original-generation ABA and root-handoff Drop fences;
and pending/terminal checkpoint durability after restart.
