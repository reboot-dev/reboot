# Canonical ordinary reader/writer task checkpoint

Base: `bc0ef551798dd4d4db16bf953401625beef3175b` (PR216).
Implemented source: `51573b58f769bdd11ba68085fcb8b73a06b0eeea`.
Local tested checkpoint; no push/publication or full-parity claim.

## Implemented capability

- Original application RPC admission now accepts ordinary reader/writer targets on explicitly registered existing DatabaseAdapter actors. Actual generated Reboot Python WeakReference.spawn/TasksStub clients receive canonical successful-trailer-only UUIDs and await their real typed Tasks.Wait handles.
- Ordinary writers execute through the existing dispatcher-minted exclusive capability and native atomic writer checkpoint, not an adapter pretending to be a workflow body. State, saved response and same-actor successor tasks commit together; terminal CompleteTask remains a separate native CAS.
- Workflow-bearing adapters now have actual typed ordinary-writer dispatch and invoke their existing `_scheduled` hook. Native First and ScheduleWork task cases prove this hook, including a writer which schedules a real workflow successor.
- Canonical scheduled cancellation recognizes ordinary registered terminals. Constructor/workflow-reader-wait targets remain rejected. Unsupported TransactionAdapter scheduling is rejected before handler/participant work; a generated Tonic fixture exercises reader, writer, transaction and factory front doors without adding trace effects. This is a rejection boundary, not transaction task execution.

Contracts and the next required executor seam are in [GENERIC-TASK-MIGRATION-MAP.md](../../GENERIC-TASK-MIGRATION-MAP.md).

## Actual qualification

A clean SDK package rebuild preceded the final fixture build. All final compile, SDK/fixture strict Clippy and native gates were rerun after the source mutants; no compile receipts are borrowed from earlier attempts.

- Locked/offline all-targets: **964 passed**, including **850 library** and **55 generated-consumer** passes; **173 ignored entries** in the broad run.
- SDK and workflow fixture Clippy passed with `-D warnings` and all targets.
- The two new ignored native wrappers and four existing admission/migration/lifecycle/spawn wrappers were explicitly executed. Other ignored gates were **not requalified**. No new lint allowance was added.

| Final native gate | Scenarios | Original-parent child waits |
|---|---:|---:|
| Plain generic reader/writer targets | 12 | 229 |
| Workflow-bearing ordinary writer targets | 2 | 49 |
| Canonical workflow admission, including duplicate-LAST schedules | 11 | 199 |
| Published legacy Started-intent migration | 1 | 30 |
| Canonical workflow Task lifecycle | 19 | 659 |
| Workflow spawn regressions | 16 | 408 |
| **Main total** | **61** | **1574** |

The generic cases cover same-key concurrency, current replay authorization, typed declared protobuf errors with discarded private mutation, arbitrary framework failure remaining Pending, exact absolute schedule/cancellation, actual lost admission Store ACK, actual lost writer Store ACK, actual lost completion CAS ACK, retained full native restarts, and saved-response replay after an intervening ordinary writer. The successor checkpoint case retains state plus two Pending tasks before completion, restarts, performs an intervening unary writer, then completes both original tasks without repeating the parent body or minting another child.

The original workflow journals, old identities, target-clock relative capability, immediate/absolute semantics, duplicate-LAST schedule fix and cancellation publication mutex remain unchanged; the existing 47 native workflow scenarios were rerun on the final source. No benchmark was repeated.

## Native RED controls, then restored GREEN

Both final source mutants differ from the final source in exactly one retained source file. Complete input manifests, original/modified bytes, unified diffs, binary hashes, raw native receipts and original-child waits are archived.

1. **Workflow-only admission:** disabling ordinary callable admission makes the real generated Python writer spawn fail against native C++ Database. Restored GREEN admits and completes the ordinary writer.
2. **Skipped writer checkpoint replay:** after retained state 7 and an intervening unary writer producing state 10, skipping only receipt adoption re-executes the original body, produces durable state **17**, and violates the saved-response assertion. Restored GREEN returns the saved **7** without remutation. The negative control records three handler calls instead of the expected two.

The final frozen-source GREEN repeats all SDK/fixture/native gates after these controls. Earlier readiness/replay/error-fixture attempts and pre-guard controls remain archived as preliminary evidence, not silently promoted into final qualification.

## Custody and retention

- Every native service, proxy and client is joined by its original finite parent. The final error and actual SIGTERM native-parent cleanup drills each join **5** original children, retiring applications before Databases. They are distinct from normally retired outer owners; no outer-owner deadline drill is claimed.
- Both accepted remote units read back `MainPID=0`, `ActiveState=inactive`, `Result=success`, `ExecMainStatus=0`; their original owners joined their controller children. Exact-PID readback found no remaining owned processes.
- Across all retained attempts, **25 native receipts / 3751 original child waits** were checked for retirement. These are custody totals, not accepted-case totals. Legacy receipts lacking an aggregate wait flag were checked from every original-child wait field; no receipt was rewritten or replacement wait manufactured.
- One exclusive cache owner, a 30-GiB disk floor and `CARGO_INCREMENTAL=0` guarded the existing authorized CCX43 cache. No heavy Cargo build ran on the parent. No installation, deployment, registry operation, new capacity or expiry change occurred.
- Offhost verification completed at **2026-10-20T16:45:58.752380+00:00**, before the 18:15 UTC retention deadline and within the approximately one-hour checkpoint budget.

## Provenance

Final inputs: **719**, with **701** distinct archived source objects and **10** Cargo-identified generated Rust outputs. Read-only offhost verification checked all **6174** archive members, **430** locally available source inputs, final gate/custody totals, both single-source native mutants, and the final source/input equality.

Rust fixture, rebuilt after clean:
`18e75aef78df6d578976aa651b786c9487f84233d842634e0c8b8e7b74107e4b`.

Native C++ Database is an explicitly **reused** artifact, not a fresh C++ build:
`619002c569e9841144a8bbedf4f2ce6a753bb0e6b103af71883d91d43f413803`.

The legacy migration application is also explicitly reused:
`7c80503337f96dcdac8d3771597223f52a7632fb3d06e89645f00cd495149f1a`.

Final source-input manifest SHA256:
`beb63c616294f9819d5281534d23eb6d821ec63df08d28692fd02b4067c5fc8e`.

Raw archive: **6599744 bytes**; SHA256:
`4983676901d4e1b29f7a677c36ec544c6e9b2f6aae02a1872508bc5b5b4d62e8`.
Large executables, RocksDB stores and compilation caches are excluded; native wire bytes, snapshots, source objects and executable pins are retained.

## Remaining parity barriers

**Running ordinary writer/reader interruption is not implemented.** Their user body retains actor admission; a canceller cannot obtain the native CAS lease while a body is parked. Future/unstarted cancellation proof does not certify running-body cancellation or a new no-effects-after-ACK guarantee for that case. The map specifies the necessary generation-bound body-quiescence/actor handoff; adding another transport wrapper would not solve it.

Also unqualified: transaction-adapter/task execution, dynamic placement/discovery/migration, cursor admission/receipt GC, Python-hosted UUID allocation, workflow-reader-wait task targets and full Python middleware/retry equivalence. Typed protobuf declared error variants are supported, not the unary-only rich DeclaredStatus variant. Pre-checkpoint handler/external side effects are not exactly-once. This checkpoint does not add generated Rust cross-actor ordinary-task spawn references.

## Durable artifacts

- [Machine qualification](generic-reader-writer-tasks-20261020.json)
- [Final source inputs](generic-reader-writer-tasks-20261020-source-inputs.json)
- [Raw archive](generic-reader-writer-tasks-20261020-raw.tar.gz)
- [Archive receipt](generic-reader-writer-tasks-20261020-archive.json)
- [Read-only offhost verification](generic-reader-writer-tasks-20261020-offhost-verification.json)
- [Read-only verifier](verify_generic_reader_writer_tasks.py)

Independent parent source review remains required before any publication.
