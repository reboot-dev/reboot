# Remote-child P2: bounded original terminal-authority recovery

**Bounded seam qualified; full pre-handoff child-ACK convergence is NOT implemented.**
Independent review is required. No push or deployment was performed.

Base: `048223cf764ed19f0cca7bdbcace5aaecd013dce` (reviewed PR216 checkpoint).
Tested implementation/fixture: `b12ec0965eb1e9afd766a5db5fe14613d47e5a19`.
The subsequent verifier/ledger/report checkpoint is evidence-only.

## Implemented contract

`DurableRootCoordinator` now reads the native immutable terminal decision for the
**original recovered root UUID/coordinator** before re-Prepare or DecisionPut.
A valid existing Abort/Commit resumes original-ID participant terminal delivery
and coordinator cleanup. Commit must match the prepared record's writable member
set exactly; read-only members cannot enter terminal delivery. Malformed authority
or read failure fails closed; absence is not Abort. A lost terminal ACK retains the
original record/decision and does not clean it up.

This uses existing native authority, not a new protocol, synthetic receipt,
ordinary Store composition, fresh effect identity or absence-to-Abort rule.
Authorization, membership/endpoint/gate/admission validation, declared-error
Abort/receipt ACK order, target versus source journals and terminal CAS are
unchanged. No general running Cancel, shared factories or placement ownership is
claimed. The detailed Python/C++/Rust foundation map is in
`REMOTE-CHILD-TRANSACTION-MAP.md`.

## Causal native RED / restored GREEN

The current final fixture drives actual generated Python public spawn/Wait,
canonical placement, two application host processes and two independent native
Database/RocksDB processes. A transparent proxy discards an observed successful
native DecisionPut ACK. The application owner and both databases then crash/restart.
During original coordinator recovery, DecisionGet remains available while repeated
DecisionPut is non-definitively unavailable. No mutation response is fabricated.

- **Exact-base-coordinator RED:** replace only `durable_coordinator.rs` with its
  exact `048223cf` bytes in the final fixture. Both `authority-commit-ack-loss` and
  `authority-abort-ack-loss` fail the native readback assertion: the original
  coordinator record remains even though the original immutable Commit/Abort is
  readable. Denied redundant writes carry the same original UUID. Canonical Task
  remains Pending. Native values are 7/7 for Commit and 0/0 for Abort. This is a
  durable wrong-record oracle, not merely a Wait timeout or process exit.
- **Restored GREEN:** rebuild mixed/pure from the unchanged frozen fixed source
  after RED. Both outcomes retire the original coordinator and participant records
  without another DecisionPut; original decision bytes are unchanged. Bodies enter
  once each. Commit reauthorizes cached target replay, preserves 7/7 and reaches
  Completed canonical `Any(workflow.v1.Value(7))` through separate source-journal ACK
  and terminal CAS; completed-storage restart does not repeat effects.
- **Abort limit:** original native Abort converges to 0/0 with no staged successor
  escape, but the original source Task remains Pending, without response/error.
  Native rollback alone does not authorize a declared-result receipt or Task CAS.
  The source is deliberately parked before any new target dispatch. This is not
  claimed as complete task-to-error convergence.

The outage is scoped to **original coordinator recovery**. Existing cached target
replay subsequently uses its established fresh local guard/Abort housekeeping;
that is not represented as original-attempt recovery or a new effect transaction.
The pre-handoff `child-ack-loss` control remains unchanged: 0/0, failed-closed Pending.

## Verified counts and controls

The read-only offhost verifier reports:

- **2 new native scenarios / 4 mixed-pure positive executions**, plus two exact-base
  RED executions. The earlier focused mixed run repeats these scenarios; it does
  not increase coverage.
- **39 unique native scenario paths / 78 accepted mixed-pure case executions** in
  the final affected remote, direct, declared-error, successor and Abort matrices.
  These include the explicitly Pending uncertainty-fence cases, not 78 terminal
  successes. Full remote matrices have 14 cases per adapter; authority adds two;
  direct has nine, declared ten, successor three, successor-Abort one.
- **986 SDK all-target pass executions**, **175 ignored** (not native passes),
  **8 doctests**, strict SDK Clippy, strict mixed/pure generated-consumer Clippy,
  and both consumer all-target suites including canonical Empty/local Empty
  collision compilation. Five new unit tests cover original authority, malformed
  or inconsistent decisions, read failure, missing authority and lost terminal ACK.
- **29 qualified owner gates**, **16 qualified native driver runs**, and
  **1,156 original-parent driver-child waits**. These are separate counts; SDK
  tests, owner gates and child joins are not native scenario coverage.

## Rejected attempts and resource bounds

All failed attempts, sources, generated bindings, executables, native storage and
raw ledgers are retained; none was overwritten to turn a run green.

- Initial proof iterations corrected child control-listener/public-readiness
  ordering, separated real reauthorization entries from body counts, scoped the
  mutation outage away from existing replay housekeeping, and intentionally
  crashed ACK-uncertain startup owners instead of requiring natural exit.
- `final1` completed SDK/lint/doctests, mixed consumers, full mixed remote,
  authority and direct gates, then the declared receipt-fence probe observed
  client `CANCELLED: Timeout expired` rather than its asserted DEADLINE_EXCEEDED.
  The unchanged fresh `final2` declared matrix passed all ten cases. The failed
  transport-status assertion is preserved, not described as a production fix.
- The disk-floor guard stopped `final2` during pure remote execution and stopped
  `final3` when the predecessor command list reached an additional older local
  workflow-transaction gate. Both interrupted drivers retained atomic nonempty
  ledgers and joined every child. All named affected mixed/pure matrices above
  completed in separately owned stages. The additional older local gate remains
  unqualified in this batch; it is not counted as passed.
- After measuring free space, the native-only continuation used an 8-GiB free
  floor; the final two bounded error/SIGTERM drills used a separately recorded
  7-GiB floor. No further Cargo, cache deletion or extra capacity was used in
  those continuations. Original 1200s owner / 1500s parent deadlines remained.

Fresh preflight checked original prior-owner waits, current PID absence and all
four cache locks before Cargo. Every owner repeated that protocol and held the
same four locks, with `CARGO_INCREMENTAL=0`, locked/offline Cargo and jobs=2.
Fresh postflight verifies every recorded native child absent, original owners
actually waited by their original parents, and all four locks available. Error
and SIGTERM original-parent drills both have joined nonempty child ledgers.
The long SSH collection call timed out while its finite remote parent remained
active; it was observed and allowed to finish, not replaced by a competing owner.

Only existing root@2.29.27.53 / server 171072439 was used. Its authorized expiry
remains 2026-10-21 18:46:13 UTC. No install, deployment, extra capacity, heavy local
Cargo or push occurred. Native Database is retained existing-binary evidence,
`fresh_cpp_build=false`.

## Offhost immutable evidence

Directory:
`/home/openclaw/.hermes/profiles/jean/cache/scratch/remote-authority-recovery-20261021/`

- `remote-authority-recovery-20261021.tar.gz`: **618045372 bytes / 5929 members**.
  SHA-256: `9ca6647845053424b091f9f2bc5cdcbc2ed554435e57564920131f393148f75a`.
- Matching `.manifest.json`: every original member path, byte count, hash and mode.
  Includes every failed attempt's executable, all claimed RED/GREEN executables,
  generated-input bindings, all native RocksDB storage, 491 final source-input
  objects, original waits/logs and the native Database executable. Byte-identical
  members are losslessly hard-link deduplicated; no binary was stripped.
- `offhost-verification.json`: successful full member/hash/mode/hard-link checks,
  exact one-file RED/source restoration checks against local Git, original waits,
  executable/generated-input association, canonical Task/Status Any decoding and
  original decision/coordinator native readbacks.
- `pack-parent.json`: the separately owned archival child was actually waited
  with exit 0. `tested-source.bundle` advertises tested HEAD `b12ec096` and requires
  exactly the reviewed base `048223cf`; `git bundle verify` and list-heads passed.

| Executable | SHA-256 |
|---|---|
| exact-base-coordinator mixed RED | `a2290b2902f5cc145c348443054f514e8d6b7a4c8215e1494aeb0c032c68b5f1` |
| restored mixed GREEN | `091fadaf8c763ca6de035ff4d52008998752537ed58663b077c93cd63cd09f3e` |
| restored pure GREEN | `ca7aa12aa7c30797654c41e064f3ee95e197753ec0f2733a62be5ad211728c14` |
| existing native Database | `619002c569e9841144a8bbedf4f2ce6a753bb0e6b103af71883d91d43f413803` |

Read-only reproduction, including complete final source-input checks through Git
for paths excluded by a sparse checkout:

```sh
E=/home/openclaw/.hermes/profiles/jean/cache/scratch/remote-authority-recovery-20261021
python3 reboot/rust/tests/fixtures/workflow_app/verify_remote_terminal_recovery.py \
  "$E/remote-authority-recovery-20261021.tar.gz" \
  "$E/remote-authority-recovery-20261021.manifest.json" "$PWD"
```

Previous P1 archives and prior evidence directories were not modified. Full
pre-handoff convergence still requires durable task-to-original-root identity,
complete pre-dispatch membership/recovery ownership, and an authoritative outcome
receipt bridge; none is replaced by this bounded native-decision recovery seam.
