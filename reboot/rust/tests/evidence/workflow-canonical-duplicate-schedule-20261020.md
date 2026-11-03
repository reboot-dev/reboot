# Canonical schedule duplicate metadata — blocker fix

Fix parent: `25dcf84eb5afbb5e7613f1275ccf7cdee14c521a`.
Published foundation: `18175834a9df99aeda94786e6d804570c25f6083`.

## Narrow correction

`WorkflowSpawner::schedule` now reads the **last** raw
`x-reboot-task-schedule` value, just as `RebootHeaders::from_metadata` and
Python `Headers.from_grpc_metadata` (`dict(metadata)`) do. That same effective
value chooses immediate versus absolute admission. Empty remains the existing
no-timestamp canonical immediate intent; explicit future values retain their
exact timestamp. No task identity, receipt, authorization, ACK, generation,
actor-lease or fencing behavior was redesigned.

## Actual native RED, then frozen-source GREEN

A newly compiled old-source Rust application, real C++ Database and generated
Python application stub independently reproduced both defects:

| Ordered schedule values | Old source result |
|---|---|
| `['', '2030-01-01T00:00:00+00:00']` | Future admission incorrectly dispatched immediately; schedule assertion failed |
| `['2030-01-01T00:00:00+00:00', '']` | Identical replay returned `FAILED_PRECONDITION` because immediate time was sampled into the fingerprint |
| `['']` | Passed single-empty replay and retained restart control |
| `['', '']` | Passed repeated-empty replay and retained restart control |
| Two identical future values | Passed repeated-future replay and retained restart control |

The old source bytes equal the reviewed parent exactly. The archive retains
those bytes, the fixed bytes, a fixed-to-old unified diff, request metadata and
responses/statuses, persisted admission snapshots, old binary pin and both
independent original RED receipts. The accepted RED and GREEN input manifests
differ in **only `src/workflow_spawn.rs`**; both use the final regression proof.

All five new cases pass against the frozen fixed source. Each checks the actual
generated Python wire call, successful-trailer-only stable task identity,
identical replay before and after native store/host restart, changed effective
schedule rejection before and after restart, and changed payload rejection.
Effective future tasks do not run their body and can be canonically cancelled;
effective empty tasks run once and retain the same typed result.

New native cases in
`canonical_python_generated_spawn_and_typed_task_retained_replay`:

- `schedule-empty-future`
- `schedule-future-empty`
- `schedule-empty-single`
- `schedule-empty-repeated`
- `schedule-future-repeated`

## Final executed gates

- Locked/offline all-target tests: **964 passed**, **171 existing ignores**;
  includes **850 library passes** and **55 generated-consumer passes**.
- Strict SDK and workflow-fixture Clippy passed with `-D warnings`.
- No new ignores or lint allowances; unrelated ignored native gates are not
  certified by this follow-up.

| Native gate | Scenarios | Original-parent child waits |
|---|---:|---:|
| Canonical admission: original six plus five new cases | 11 | 199 |
| Legacy Started-intent migration | 1 | 30 |
| Task lifecycle | 19 | 657 |
| Workflow spawn | 16 | 411 |
| **Main total** | **47** | **1297** |

The five old-source RED/control runs have **75** original child waits, separate
from that main total. Injected error and actual SIGTERM cleanup drills each
joined **8** original children. Accepted finite parents and their enclosing
remote owner were genuinely joined; exact systemd readback is inactive,
`MainPID=0`, `Result=success`. No replacement waits were used. The prior batch's
**1208** original waits and retired PIDs were independently read back.

The existing authorized host and warm caches were used with exclusive owner
locks, a disk floor and `CARGO_INCREMENTAL=0`. No local heavy Cargo build, package
installation, deployment, new VM or retention extension occurred. Existing VM
expiry remains unchanged.

## Provenance and retained attempts

An initial launch as the build user could not open root-owned cache locks and
failed before any test child. A later outer-owner ledger still targeted the
historical evidence directory; its new, uniquely named records were copied
byte-for-byte into `initial-custody-path` (and the original RED owner receipt is
retained). Its controller had built/tested the correct candidate, but the outer
source snapshot pointed at the previous checkout. After correcting both computed
owner paths, **every GREEN compile/test/Clippy/native/drill gate was rerun** under
`greenfinal` with the correct outer source freeze and evidence directory. No
compile/test receipt is silently reused from that initial run. The initial
owner script, exact records and earlier attempts remain archived.

Native C++ and the published-base migration binary are explicitly hash-pinned
**reused** artifacts, not fresh builds. The old-source RED and fixed-source Rust
applications were compiled for this correction. The archive excludes large
executables, RocksDB stores and compilation caches; executable pins are explicit.

Historical admission/lifecycle/spawn archives were not modified. In particular,
the original admission archive still hashes to
`4c09ea1fe76ec96f82936c0f7092d56a79f3bf80537e7c6ff3afb404946d8da9`.
The previous source mutants remain historical evidence, not newly claimed
qualification. This follow-up's fresh old-source mutant targets the actual
reported duplicate-schedule defect.

## Durable evidence

- [Machine qualification](workflow-canonical-duplicate-schedule-20261020.json)
- [Final compiled/source input manifest](workflow-canonical-duplicate-schedule-20261020-source-inputs.json)
- [Raw archive](workflow-canonical-duplicate-schedule-20261020-raw.tar.gz)
- [Archive receipt](workflow-canonical-duplicate-schedule-20261020-archive.json)
- [Read-only offhost verification](workflow-canonical-duplicate-schedule-20261020-offhost-verification.json)

Final manifest: **715** inputs; **698** distinct archived source objects across
old/fixed manifests, plus **10** Cargo-identified generated Rust outputs.
Independent offhost verification checked all **4701** archive members and
**426** available local executable/schema/proof source inputs, old source equality
to the reviewed parent, exact new-case metadata orders and stable UUID trailers,
native counts and original parent custody.

Raw archive: **5700572 bytes**.
SHA256: `3ce19c9bf415bed2728e3c0860fc667c2eb17d896fe7c774b88415981359904f`.

Final input manifest SHA256:
`73d39d93715452c5568dc9214abefd2003c60c6c532f6f653e10dfe4f83e3c25`.

Fixed Rust application SHA256:
`08deb59575da54934ac0eb758ba72770ada5820ae257fe951dee1f09a74654b7`.

Old-source RED Rust application SHA256:
`6f242d6faffbacf4afa9e6316a2effa51270498773875c19f40cc80ecc1972ee`.

Scope and remaining parity barriers are unchanged. This is a local tested fix,
not publication or a full Python-hosted application-parity claim. Narrow
independent rereview remains required before any push.
