# Q2: generated writer wakes the actual revision future

This is a **native acceptance scenario, not yet an executed native receipt**.
Compilation and the Python preflight tests do not certify writer/wait semantics.

`WORKFLOW_BODY_MODE=revision` compares both `context.state_ref()` and
`context.actor_ref().state_ref()` directly to the stored task's canonical
`TaskId.state_ref` bytes (and checks its state type). It pins and polls the
actual `wait_for_revision()` future to `Pending` before emitting
`revision-parked`, then awaits that *same* future. No synthetic gate notification
or substitute pending future is used.

The driver exercises plain, slash-escaped, and composed/colocated references.
For each it creates the actor and schedules a generated workflow, confirms it
is parked with unchanged canonical actor state, gracefully joins the host and
Database, restarts both against the same RocksDB, and confirms the recovered
workflow is parked with the same stored identity and no checkpoint or terminal
result. It sends exactly one generated `First` RPC with a fresh UUID, then
requires waiter completion, canonical state `first=7`, a completed task, and the
acknowledged reader checkpoint. Nothing mutates `second`.

## Invocation in the existing parent runtime gate

Build `generated-workflow-app` using the existing shared Cargo target cache.
The parent must run `prove_control_flow.py APP_BIN` **in-process**, using its
existing `runpy`/driver mechanism, with:

- `WORKFLOW_CONTROL_SCENARIO=revision`
- `WORKFLOW_CUSTODY_MODULE`: the **already loaded** original runtime module,
  contract `cursor-exact-child-v2`, with `_owner.active_gate` true
- `REBOOT_NATIVE2PC_CXX_DATABASE`: the real CXX/RocksDB Database executable
- `WORKFLOW_REVISION_STAGE`: a new exclusive directory
- `WORKFLOW_CONTROL_EVIDENCE`: a new evidence file outside that directory

The existing runtime must provide `run`, `spawn`, `children`, `_owner`, and
children's `retire`, `require_owned_alive`, `assert_joined`, exact receipts and
rows. It is neither copied nor replaced here. All clients belong to that same
ledger. Before any Database retirement, every non-Database reservation must
have a genuine exact join and discharged descriptors; unrepresented owner rows
or sticky owner failures block Database retirement. No polling/PID-only signal,
kill fallback, ECHILD success, adapter bootstrap, or outer owner release exists
in this scenario. The parent retains responsibility for its outer lock,
container lifetime, archived logs and independent evidence readback.

The legacy control scenario remains unchanged. Its historical subprocess helper
is not imported or executed on the revision branch. Do not use the ordinary
`workflow_native_restart.rs` subprocess launcher for this branch: a fresh Python
process cannot inherit the original runtime module/owner. The parent runtime
must select this scenario explicitly.

## Validation of this change

- Locked offline generated-consumer `cargo check`: passed.
- Locked offline generated-consumer `cargo clippy --all-targets -- -D warnings`: passed.
- Three preflight regression tests: passed.
- `git diff --check`: passed.
- Native scenario: **not executed**. The delegated environment has no
  `REBOOT_NATIVE2PC_CXX_DATABASE`, `WORKFLOW_CUSTODY_MODULE`,
  `WORKFLOW_REVISION_STAGE`, or `WORKFLOW_CONTROL_EVIDENCE`. A direct revision
  invocation failed closed with `BLOCKED: parent must supply its already loaded
  exact-child runtime via WORKFLOW_CUSTODY_MODULE`, before launching children.
  This is not a native receipt. The parent must supply the original active
  runtime and real Database; no substitute supervisor was built.

Local non-native checks:

```
cargo check --locked --offline --manifest-path reboot/rust/tests/fixtures/workflow_app/Cargo.toml --target-dir SHARED_TARGET
python3 -m unittest discover -s reboot/rust/tests/fixtures/workflow_app -p test_revision_preflight.py -v
```

A missing runtime fails closed before executable lookup or process creation.
Such a failure is an external integration blocker, **not** native semantic
failure or successful native acceptance. Preserve the parent's bootstrap
failure receipt even when no scenario evidence file can yet be created.
