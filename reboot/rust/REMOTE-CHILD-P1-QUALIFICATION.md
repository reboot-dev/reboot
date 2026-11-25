# Final-topology remote-child P1 qualification

**Qualification PASS; ready for independent parent rereview, not publication permission.**

Tested implementation/fixture: `b20ada237d7071c9d47755ca739abfd3f077a19c`.
Base: `be870386b539449327bfd33002e142bfa594a82b`.
This additive evidence checkpoint changes no runtime, generator or native acceptance fixture.
It closes only the causal-control gap in `independent-prepublication-review-b20ada23.md`.

## Final canonical-placement controls and restoration

All variants were independently extracted from `source-b20ada23.tar` into fresh directories. All 488 recorded source inputs match the final local implementation/fixture after restoration. Each RED differs from that final source manifest in exactly one file; canonical shard/range metadata, Recover filters and participant/coordinator/task registration are unchanged across RED and GREEN.

- **Replay-bypass RED:** change the single generated target receipt replay clause in `codegen.rs` from `if let Some(idempotency) = &automatic_idempotency` to `if let Some(idempotency) = &automatic_idempotency && false`. Run final-fixture `ack-restart`. The canonical Python Wait returns the wrong response **17**, both original native Database readbacks are **17/17**, and the original durable Task is Completed with typed `workflow.v1.Value(17)`. Expected correct response is 7 and final values are 10/10 after the intervening write. The original driver exits 1; its 13 children are actually waited. Exact mutated source, emitted Rust inputs, executable and RocksDB directories are retained.
- **Base-runtime RED:** insert the exact base `runtime.rs` into the **new final fixture**, not an original-base application executable. Runtime SHA-256 is `7520cb62591b80c49fcf1ec14ff488867b8b148089d680c77491474e466544f2`, independently matched to `git show be870386:reboot/rust/src/runtime.rs`. The root reports `FailedPrecondition: receipt-bound root composition requires registered same-host dispatch`; no child handler runs. Original durable values remain **0/0**, Task remains Pending without response/error. Canonical Wait subsequently times out because the root exited; that timeout alone is not the causal evidence. Driver exits 1 with all eight children waited.
- **Restored final GREEN:** freshly rebuild mixed and pure consumers from unmodified final source after both REDs, capture their generated-input/executable bindings, then run the ten affected restart/discovery/replay cases listed below. Both drivers exit 0; original durable Task/receipt/state checks and retained completed-storage restart/replay checks pass. Mixed has 204 original child waits, pure 224.

Affected cases, run for **both** mixed and pure adapters:

`ack-restart`, `error-ack-restart`, `authorization-reject`, `payload-reject`, `target-ack-loss`, `error-target-ack-loss`, `receipt-ack-loss`, `abort-ack-loss`, `source-ack-loss`, `terminal-ack-loss`.

These are **10 unique GREEN cases / 20 positive executions**, not new capability coverage. Twelve owner gates match expected statuses: ten exit 0, two expected RED driver exits 1. Four native drivers account for **449 original-parent child waits**, separate from the owner gates. Unaffected expensive SDK/lint/full matrices were not rerun; their unchanged-source qualification remains in the predecessor pack.

## Custody and scope

Used only existing authorized root@2.29.27.53, server 171072439; expiry remains 2026-10-21 18:46:13 UTC. No capacity, install, deployment, cache deletion, local Cargo build or push occurred.

Fresh preflight at this batch checked archived parent 2114674's actual wait of owner 2114675 **and fresh PID absence**, other original ledgers/children, and availability of all four cache locks before any Cargo. Each original owner independently repeats predecessor retirement checks and holds those four locks through its finite batch. Existing protocols retain atomic durable nonempty child ledgers, `CARGO_INCREMENTAL=0`, locked/offline builds, jobs=2, SIGTERM cleanup, actual joins and 1200s owner/1500s parent deadlines.

Actual parents waited owners with exit 0: 2189248 → 2189249 (replay RED), 2190140 → 2190141 (base RED), 2190692 → 2190693 (restored GREEN). Workload window: 2026-10-21 01:28:11–01:33:29 UTC. Postflight at 01:33:39 UTC on boot `bdc3e231-59dd-45ae-a5d7-59e7e9384078` observes all recorded PIDs absent and all four locks available. Absence observations are not substituted for original waits. Archive creation was separately joined with exit 0.

No new runtime defect was found or fixed. Authentication, original receipt/transaction identity, admission ownership, declared Abort linearity and failed-closed unknown-child Pending uncertainty remain unchanged. This does **not** establish crash-to-Abort convergence, descendant/shared/factory/running-cancellation support or full SDK parity. Native Database is retained existing-binary evidence, `fresh_cpp_build=false`.

## Offhost evidence and read-only verification

Offhost directory:
`/home/openclaw/.hermes/profiles/jean/cache/scratch/remote-child-p1-20261021/`

- `p1-final-topology.tar.xz`: **111271064 bytes**, **2063 members**; SHA-256 `504357c2b5d912ee9840ac35e4f9b257720b6e0b0a699407c88ff27e8fcf8046`.
- `p1-final-topology.manifest.json`: every original member path, hash, size and mode. Pack includes all three variants' owner/parent/driver receipts, logs, canonical wire records, original RocksDB storage, all source-input objects, generated bindings, unstripped application executables and native Database, plus preparation/ownership/pack scripts.
- `offhost-verification.json`: successful full byte/mode/hard-link, source-variant, generated-input/executable, wait/log, canonical Task and wrong-durable-result checks. All 488 restored source hashes match the local checkout. The predecessor generic `verify_pack.py` also exits 0 against this new pack.
- `p1-preflight.json`, `p1-postflight.json`, `p1-mutations.json` and exact parent receipts are also copied separately for inspection.

Executable SHA-256 bindings:

| Variant | SHA-256 |
|---|---|
| replay-bypass mixed | `f6638b69c7a98f761066d9582d6e72e648cdcdfb2ff7dc0865f68c31843baf06` |
| base-runtime mixed | `31a5fd7f53312c8b004ad6a670f79e900094cfe110c562e9eccf9525a5ec7bf1` |
| restored mixed | `5bbdb14a0c40b655fcfeef5aa68a22ad4fe5b155afb745c9f4d4763ab45a7256` |
| restored pure | `72ba4d283b08c494c7e86b4552b7133b1fa9bee709a13a2adf3468049d21dff1` |
| native Database | `619002c569e9841144a8bbedf4f2ce6a753bb0e6b103af71883d91d43f413803` |

Rebuilt executable hashes differ from predecessor builds and are retained explicitly; equality of source inputs, not binary identity across fresh source paths, establishes restoration.

From this checkout, reproduce read-only verification (optional final argument additionally checks restored source bytes):

```sh
E=/home/openclaw/.hermes/profiles/jean/cache/scratch/remote-child-p1-20261021
python3 reboot/rust/tests/fixtures/workflow_app/verify_remote_child_p1.py \
  "$E/p1-final-topology.tar.xz" "$E/p1-final-topology.manifest.json" "$PWD"
```

Old a8240be1 REDs remain historical, not promoted to final-topology evidence. Prior copied archives were left immutable and their SHA-256s rechecked unchanged: current recovery `8584637db4bca14bebc622baf8bd0cb688fbdbd2988bc83e8839b532abcfa285`; compact predecessor `5acdf164ef4e3b1c64da0901bf154bdc61656d237b5d874028a8f7c70be63f98`. The original HANDOFF and HOLD review remain unchanged. Parent must rereview this additive checkpoint before any publication.
