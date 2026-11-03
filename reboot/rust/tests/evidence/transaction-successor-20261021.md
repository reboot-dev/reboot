# Future transaction successors: native execution checkpoint

**Accepted frozen source:** `e4a570a8f76581acb7738cb9853c0c2d16e38382`, based on reviewed `d3160c1b833ee4ec5267ceca432c392981c7e1d5`.

The existing runtime already executes eligible durable transaction successors. This checkpoint adds an integrated fixture/proof, not a new dispatcher, ordinary-Store substitute, or invented runtime API. See the [contract/capability map](../../TRANSACTION-SUCCESSOR-EXECUTION-MAP.md) and [machine receipt](transaction-successor-20261021.json).

## Actual outcomes

| Gate | Result |
| --- | --- |
| Future successor scenarios | **6 passed**: live, pending restart, successor post-target/pre-journal crash, each on mixed and pure adapters |
| Abort child nonescape | **2 passed**, mixed and pure, including retained restart and crossing the child's original due time |
| Complete final native batch | **87 positive case executions**: 8 new adapter/scenario vectors plus 79 affected regression executions |
| Original native-driver child waits | **1,236**, including the two expected driver-failure drills; these are waits, not test cases |
| SDK locked/offline all-targets | **980 reported pass executions, 0 failed, 175 ignored** |
| Doctests | **8 passed** |
| Mixed/pure generated consumer all-targets | **1 passed each** |
| Strict Clippy | SDK and both generated consumers passed with `-D warnings` |
| Final outer owner | **26 gates**, original parent waited owner exit **0**, source manifest unchanged |
| Owner cleanup drills | Expected error and SIGTERM failures, exact child joins and original parent waits retained |
| Cache retirement | All recorded owners/gate/driver children absent; all four cache locks reacquired |

Cargo totals are reported result executions, not a claim of unique behavioral coverage. The 175 ignored SDK tests are not counted as native execution passes. Canonical `google.protobuf.Empty` and the colliding local `Empty` are consumer compilation/lint evidence, not native Empty-service execution.

The successful successor scenarios each execute one parent `Apply(7)` and one future `Apply(11)` through the original generated public transaction RPC and registered root→leaf path. Both durable actor values become **18**. The final six cases contain exactly **12 root Apply entries and 12 leaf Apply entries**, unchanged by completed Wait/spawn replay and retained storage restart. Actual successor handler-entry wall-clock timestamps are at or after each task's retained protobuf timestamp.

The successor crash case observes values `[18,18]` while its canonical Task remains Pending, after the real target root ACK but before source journal ACK and terminal CAS. After restarting both Database/RocksDB and application, typed Python Wait returns 18 without additional handler entries. This separates target effects/receipt, source journal and terminal completion rather than treating one as acknowledgement of another.

The Abort cases actually stage a future transaction task on the leaf, then return the declared root error. They retain typed Python/Rust Wait, error payload `required=4242, observed=7`, values `[0,0]`, no Pending escaped child, no prepared participants and no successor invocation after restart and the original due time.

Affected regressions include mixed/pure canonical transaction spawn/Wait, future Cancel and due/running-Cancel rejection, payload/replay collisions, authorization-before-replay, target ACK loss, clean declared root rollback, separate Abort/receipt/source/terminal ACK-loss fences, workflow→transaction composition, ordinary outbound writer journal/ACK recovery, canonical admission and generic tasks. Production runtime/generator guards are unchanged.

## Real native RED controls

Both use exact retained mutated source bytes/diffs, generated outputs, actual executables, the real C++ Database and retained RocksDB. They are precise mutants, not claims that the old base already exposes a missing API.

- **Ignore durable due checks:** the parent has completed but the successor has already run before its future deadline. Native readback is `[18,18]` instead of the required `[7,7]` Pending stage. The proof fails. Six original children were joined.
- **Skip automatic target-root receipt replay:** after successor target ACK/restart, its transaction body runs again. Both durable actor values become **29** instead of 18. The typed result/count proof fails. Ten original children were joined.

The unchanged frozen source was rebuilt after these mutants, with separate mixed/pure executable and generated-output captures, then passed the full final batch. Predecessor RED archives remain untouched and are referenced by hash; their results are not represented as fresh executions here.

## Source and artifact custody

Only the previously authorized CCX43 `171072439`, `root@2.29.27.53`, was used. No capacity, installation, deployment or retention changes were made. Cargo ran remotely, offline/locked, with `CARGO_INCREMENTAL=0`, two jobs and exclusive ownership of all four existing cache locks. Fresh original-owner/child absence checks precede cache acquisition; the previous archived retirement receipt was not substituted for that live check.

The finite owner retains nonempty atomic gate ledgers, joins original children, enforces its deadline and retains ownership through error/SIGTERM cleanup. An independent finite original parent actually waits the owner. Retirement was read at `2026-10-21T00:18:27.056621+00:00`; the final owner wait and four-lock readback are retained. Smoke1/2 outer-owner retirement is labelled an absence observation, not an external original-parent wait. Final/red/smoke3 have separate actual parent waits.

**Offhost durable directory:**

`/home/openclaw/.hermes/profiles/jean/artifacts/transaction-successor-20261021/`

Raw archive:

- Name: `transaction-successor-20261021-raw.tar.gz`
- Bytes: **833455311**
- SHA-256: `026879fd809a6bef610dd9920a324577f8da736b39c4ce35ab05f0424c1b9be4`
- **5,866 retained files**, including its inventory; 5,865 inventory entries were checked offhost. Safe backward hardlinks avoid redundant executable copies.
- Includes full frozen Git source archive/bundle, failed and successful source objects, actual generated Rust/Python outputs, all native receipts/logs/RocksDB, precise mutant inputs and every captured Rust executable plus the actual native Database executable bytes.

All **484 recorded source inputs** match this local worktree's corresponding files. The complete frozen source archive is retained separately inside the raw package. The final proof implementation remains e4a570a8; subsequent report/verifier/ledger changes are evidence-only, not silently reclassified as newly compiled runtime source.

Native Database SHA-256: `619002c569e9841144a8bbedf4f2ce6a753bb0e6b103af71883d91d43f413803`.

This is the previously authorized native executable, not a fresh hermetic C++ build attestation. Its retained `database.cc` matches this source tree (`79404e6ed4f8b227aa0f56505eab04908d03adaae68a7af0f8d11348a45549c1`).

Mixed application SHA-256: `6bad359335303fa8d482bb955023fef8138af4677156b63aa65205449353f313`.

Pure application SHA-256: `3fcce5782c2b4ce5b70b585a9c09f9180fb346c8c1224e8d7a0c65563b4dc18f`.

Preserved predecessor archive SHA-256: `2ccf7a7826cd0a8c8d530f2371d401badc5338af0b26a4b94a25f21a1541a188`.

## Inspector corrections and reproduction

Unqualified attempts remain retained: an initial source-journal comparison failed to decode its Any envelope; a mixed child reader-only owner rejected the new transaction binding; and the first packager expected an aggregate boolean absent from legacy receipts. The corrected packager checks every original child's actual wait entry instead.

The raw archive also retains the pre-publication verifier that incorrectly expected ordinary-writer-style successor IDs in the target root receipt. The actual bounded transaction contract (`runtime.rs::validate_bound_root_effects`) deliberately requires that receipt's `task_ids` to be empty. The **current committed verifier** checks that contract and validates the separately canonical successor Task and typed result; no runtime authority or native evidence was changed to satisfy the inspector. Its real failed log is retained offhost as `transaction-successor-20261021-verifier-failed1.log`.

The current verifier was executed successfully **offhost against the unchanged complete raw archive**, hashing every inventory member and independently decoding canonical Task, terminal Any, declared status/payload and task-scoped source-journal envelopes. No local Cargo build or executable extraction was needed on the low-space review host.

```sh
python3 reboot/rust/tests/evidence/verify_transaction_successor.py \
  /home/openclaw/.hermes/profiles/jean/artifacts/transaction-successor-20261021/transaction-successor-20261021-raw.tar.gz

git bundle verify /home/openclaw/.hermes/profiles/jean/artifacts/transaction-successor-20261021/transaction-successor.bundle
git bundle list-heads /home/openclaw/.hermes/profiles/jean/artifacts/transaction-successor-20261021/transaction-successor.bundle
```

Native reproduction uses the retained owner/parent scripts and exact `final1-commands.json` with an authorized compatible existing Python/Bazel runtime, real Database binary and exclusive caches. The proof scripts are `tests/fixtures/workflow_app/prove_transaction_successor.py` and `prove_transaction_successor_abort.py`; the pure variant additionally sets `PURE_TRANSACTION_FIXTURE=1` and uses the separately built pure executable. Do not run competing cache workloads or silently retry tested mutations.

## Limits

Qualification is bounded to existing actors, exclusive same-host registered root-star transaction successors and mixed/pure service adapters. Shared/factory task targets and due/running transaction cancellation remain rejected. No arbitrary external-effect exactly-once, dynamic task migration, remote-child composition, complete Python retry/private-token/recovered-identity equivalence or general transaction cancellation claim is made. Parent independent review and publication remain separate; this handoff makes no push.
