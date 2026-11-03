# Running ordinary reader/writer cancellation checkpoint

Base: reviewed published `837c7e1f6ad1a50408b1ef41424d768759249f09` (PR216).
Local tested checkpoint; independent parent source review is required before publication. No push was performed.

## Capability

Canonical generated Python spawn / Tasks.CancelTask / typed Task awaiting now exercise execution-owned interruption of running ordinary async readers and writers against actual C++ Database/RocksDB. Cancellation requests a generation-bound handoff before exclusive actor admission. The original execution drops its pending pre-Store body under its lease; a started writer Store is retained through its ACK or sticky failure. No owned ordinary body continues after a winning Cancel ACK.

Concurrent reader cancellations publish independent counted handoffs before serializing CAS. Retired, signalled registrations remain exact-channel tombstones until ACK or restart, suppressing Pending redelivery. This prevents a replacement reader body from blocking another cancellation. Generation identity and channel identity fence replacement ownership. The existing original-owner publication mutex protects Wait uncertainty, and actor commit uncertainty also fences queued ordinary writers after lost Cancel ACK or request drop.

**Ordinary state, saved response and successor tasks commit atomically in Store. Terminal task completion remains a separate CompleteTask CAS.** A cancellation after an acknowledged checkpoint retains prior effects; it does not roll them back or merge the two durable operations. Already-committed successors remain independently runnable.

Python Cancel returns OK when requesting asyncio interruption before callback cleanup; this Rust capability deliberately waits for quiescence and native terminal ACK. No identical response-timing or full middleware equivalence is claimed. Auth-before-disclosure, schema/payload/schedule binding, canonical duplicate-LAST metadata, and distinct ordinary-target versus workflow transport capabilities are preserved.

## Final-source qualification

Final frozen source was rebuilt after clean and after the exact-parent native RED controls. No earlier compile receipts are borrowed.

- Locked/offline all-targets: **968 passed entries**, including **854 library** and **55 generated-consumer** passes; **174 ignored entries**. Nested consumer executions are not additional unique SDK behaviors.
- SDK doctests: **8 passed**, 0 ignored. Workflow fixture all-target test command passed (0 unit tests); real fixture behavior is qualified by the native gates below.
- SDK and workflow-fixture all-target Clippy passed with `-D warnings`; no new allowance was added.
- The seven named ignored native wrappers were explicitly executed. Other ignored gates were **not requalified**.

| Final native gate | Scenarios | Original-parent child waits |
|---|---:|---:|
| running | 6 | 121 |
| generic | 12 | 229 |
| workflow-writer | 2 | 49 |
| canonical | 11 | 199 |
| migration | 1 | 30 |
| lifecycle | 19 | 658 |
| spawn | 16 | 408 |
| **Main total** | **67** | **1694** |

The six new native scenarios cover parked writer private-state discard, parked reader retirement, concurrent cancellation of two running shared readers without replacement-body redelivery, actual lost cancellation ACK with blocked Wait/queued writer, request drop at a held native cancellation ACK, and cancellation after acknowledged writer checkpoint with retained state. Generated typed awaiting catches the durable cancellation before/after full Rust/Database restart; replay preserves identity and effects. Existing generic checkpoint/successor/replay cases and all affected workflow admission/migration/lifecycle/spawn cases were rerun.

## RED, failures and final GREEN

The reviewed parent's actual SDK source replaces the final runtime in an isolated copy while keeping the final generated fixture/proof unchanged. Both parked-writer and parked-reader cancellation fail with bounded FutureTimeoutError on that parent; final GREEN interrupts them. Exact parent/current bytes, diffs, complete input differences and binary hashes are archived. Four source-file differences include two test-only files; no single-file-mutant claim is made. Offhost verification compares retained parent bytes with Git's exact reviewed parent commit.

Preliminary compile, Wait-expectation and fixture-Clippy failures remain archived, not promoted. A concurrent-reader native attempt exposed Pending redelivery after original-body retirement: a third reader body entered and blocked cancellation. The final tombstone handoff fixes that failure; final native evidence requires exactly two reader entries and retirements, with no escaped body. One-body-only earlier GREEN attempts are not the qualification for the final source.

## Custody, retention and provenance

Every native service/proxy/client has a nonempty atomic original-parent ledger and bounded observation/wait deadlines. Error and actual SIGTERM parent-cleanup drills each joined 5 / 5 original children, retiring applications before Databases. Across all retained attempts, **34 native receipts / 4043 original child waits** were checked for retirement; these are custody totals, not accepted-case totals. Final and mutant outer owners read back inactive, MainPID=0, Result=success, with controller children joined. Exact-PID absence is a separate retirement observation, not a manufactured wait. No SIGKILL or outer-owner-deadline cleanup guarantee is claimed.

The existing authorized CCX43 cache used exclusive ownership locks, a 30-GiB disk floor and CARGO_INCREMENTAL=0. No heavy local Cargo build, installation, deployment, new capacity, expiry change or benchmark occurred. Approved retention remains 21 October 2026 18:46:13 UTC. The previous published proof archive remains unchanged (`4983676901d4e1b29f7a677c36ec544c6e9b2f6aae02a1872508bc5b5b4d62e8`).

- Rust fixture SHA256: `82a59261674540993d9e85151d777557bd7b0c9fc283150a0439cc0ddf5240b6`.
- Native C++ Database **reused, not freshly built**: `619002c569e9841144a8bbedf4f2ce6a753bb0e6b103af71883d91d43f413803`. Legacy migration artifact is also reused.
- Final source-input manifest: `82ca0c36adba9c40568f173cf46499ce2e4f4242143e206b891cde32e7b06bfa`; 719 source/runtime/tool inputs.
- Raw archive: 7740651 bytes; SHA256 `a71f48e9de4441df1ecf13991699cb91087bca1b0a265ad6e4ef860315691652`. Large executables, RocksDB stores and caches are excluded; wire bytes, snapshots, exact sources/diffs and executable pins are retained.
- Read-only offhost verification at 2026-10-20T17:49:10.875576+00:00 checked all 7030 members and 430 local compiled inputs before handoff.

## Remaining limits

Cooperative local ordinary-body cancellation only: synchronous code cannot be preempted, already-submitted remote/unowned effects cannot be revoked, and pre-checkpoint external effects are not exactly-once. Transaction-adapter tasks, dynamic/distributed ownership, cursor admission/GC, Python-hosted UUID allocation, workflow-reader-wait targets and full Python middleware/retry/status-timing equivalence remain outside this checkpoint. Typed protobuf declared variants are supported, not unary-only rich DeclaredStatus task outcomes.

## Artifacts

- [Machine qualification](ordinary-running-cancellation-20261020.json)
- [Final source inputs](ordinary-running-cancellation-20261020-source-inputs.json)
- [Raw archive](ordinary-running-cancellation-20261020-raw.tar.gz)
- [Archive receipt](ordinary-running-cancellation-20261020-archive.json)
- [Offhost verification](ordinary-running-cancellation-20261020-offhost-verification.json)
- [Read-only verifier](verify_ordinary_running_cancellation.py)
- [Migration contract](../../GENERIC-TASK-MIGRATION-MAP.md)
