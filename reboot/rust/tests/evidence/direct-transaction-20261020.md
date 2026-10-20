# Direct canonical transaction tasks: qualified local checkpoint

**LOCAL ONLY. No push. Independent parent source/evidence review is required.**

Base: `4a31c38427302d2af48bcd381dfacff6fcc3eb1a` (published PR216 predecessor). Final tested source: `aa44f2914ee51fc8c87876bfdeb6e9830bb10034`. See the [contract/migration map](../../TRANSACTION-TASK-MIGRATION-MAP.md).

## Implemented capability and boundaries

Actual generated Python `AtomicLedger.ref(...).spawn().apply(...)` now admits the original exclusive transaction RPC, persists Pending with its real method/identity and returns the acknowledged canonical UUID. The generated dispatcher binding invokes the public transaction root, not an ordinary writer handler. It releases initial task actor admission before that RPC. The real legacy coordinator owns root/leaf state, bound response receipt and successor atomicity; source journal acknowledgement and terminal CompleteTask CAS remain separate operations.

Registration is explicit and original-participant bound. The generated helper currently requires a mixed service already carrying DatabaseActorStore, an existing actor, and an exclusive non-factory transaction without declared errors. Source intent/result binds actor/application/method/request/type and retries the same transaction-domain target key after restart. Target policy runs before cached response disclosure. Source workflow-scoped and target root-scoped mutations are inspected separately and joined by their exact key in the native proof.

Future Cancel reloads under the original actor gate and retains it through synchronous terminal CAS. Due/running transaction Cancel returns FailedPrecondition, never a no-effects promise while a coordinator can still commit. Read-only classification precedes actor admission so ordinary readers on mixed owners can still receive their execution-owned interruption signal; authoritative reload fences an absent-preview/admission race. The held-reader-lease regression is a model Database test, not a separate native mixed-reader cancellation claim.

## Fresh final qualification

`direct-transaction-final4-20261020.service`, original owner **1800451**, accepted all **25 gates**, with frozen source unchanged:

- SDK `--locked --offline --all-targets --features build,test-support`: **975 passed, 175 ignored**, zero failed. These are summed execution results, not unique additional coverage; ignored native cases are not native passes.
- Strict SDK and complete generated workflow consumer Clippy, all targets, `-D warnings`: both passed. No new lint suppression.
- SDK doctests: **8 passed**. Actual generated consumer tests: **1 passed**. The complete consumer includes canonical Empty transaction-task wrappers alongside distinct local Empty, not only signature string tests.
- **50 native positive cases**: direct transactions **9**, prior workflow-to-transaction **7**, outbound **7**, outbound ACK-loss **4**, canonical admission **11**, generic targets **12**. The latter **41** repeat affected established controls; these are not 50 new behaviors.
- **10 native receipts / 810 original driver-child waits**. The direct suite accounts for **60 waits**. Original gate/owner levels are separate, not folded into driver-child totals.

Direct cases: immediate execution, delayed execution, scheduled Cancel, duplicate admission plus changed-payload rejection, restart after target ACK/before source ACK, actual target RPC ACK loss, current-policy denial during recovered replay, running-Cancel rejection, and rollback after child staging. Exact collision status is FailedPrecondition; denied replay is PermissionDenied. Canonical task statuses and pending methods were independently decoded from retained native Task bytes: completed Apply versus pending Apply on rollback, and only committed Query successors otherwise. See [native readback](direct-transaction-20261020-native-readback.json).

Fresh native negatives retained exact original/modified generator bytes and diffs:

1. Restoring the original canonical-admission fence makes the actual generated Python transaction spawn fail. This is a restored-old-fence mutation, not a claim that the whole predecessor SDK compiled the new helper.
2. Skipping target receipt replay causes actual durable root/leaf state **17/17** after an intervening **3**, instead of preserving **10/10** and the original response **7**.

Original-parent error and SIGTERM drills each joined their **4 original children**. Both are expected failures, not positive cases. Exact native negatives also retain their original waits (5 and 9 respectively).

Final application SHA-256: `8aa8eba49bcd328c696f1a19f23eaa728fd1c3b180a5d4749eb648adc801934b`.

Reused C++ Database SHA-256: `619002c569e9841144a8bbedf4f2ce6a753bb0e6b103af71883d91d43f413803`. This is existing-engine/source association, **not a fresh hermetic C++ build**.

## Custody, corrections and retained attempts

Each acceptance owner freshly checked predecessor owner **1686547**, its actual joined controller **1686549**, recorded original gate/driver retirement and the four custodial cache locks. Subsequent owners also checked newly completed local attempts and all available per-child wait rows. Cargo ran remotely, exclusively, with `CARGO_INCREMENTAL=0`, bounded owners/deadlines and a monitored free-space floor. No local heavy Cargo, new capacity, installation, deployment or destructive cache cleanup occurred.

Final retirement was observed **2026-10-20 21:33:51 UTC**: all recorded gate/driver PIDs absent, all four cache locks reacquired, systemd inactive, MainPID=0, Result=success, ExecMainStatus=0. Outer-owner absence plus terminal systemd state is not a fabricated external original-parent wait. No SIGKILL-immunity claim is made. See [retirement](direct-transaction-20261020-retirement.json).

Retained chronology is not retrocertified:

- Exploratory setup/compile/inspection failures are unqualified logs/receipts, not accepted parity evidence. A pure-transaction helper initially lacked an adapter store; the supported surface was explicitly bounded instead of changing that constructor contract by implication.
- The mixed Empty consumer caught unit_arg/unused_unit. `54f672a4` normalized units before calls rather than suppressing strict lint.
- Source `54f672a4` passed its matrix, but review found unintended ordinary-writer TransactionAdapter admission. `493c6384` retained that fence and added its generator regression; `final3` reran the matrix on `1bd05fe7`.
- A prelaunch ledger-schema check failed before child birth because legacy outbound receipts have per-child waits but no aggregate flag. The corrected owner validates the original rows; it does not invent the missing flag or skip retirement.
- Review then found the mixed-owner cancellation classification could wait behind a reader lease before publishing interruption. `aa44f291` added the read-only preview, authoritative due-transaction fence and held-lease regression. Final4 reran the entire 25-gate matrix on that source.

## Durable off-host artifacts

Local directory outside the idle-pruned scratch tree:

`/home/openclaw/.hermes/profiles/jean/artifacts/direct-transaction-20261020/`

New raw archive: `direct-transaction-20261020-raw.tar.gz`

SHA-256: `5c8e65b9f30e95d8032ef54d4cb65a5388f21e85e4648ffaf515531e0531e6c1`

**711,232,553 bytes / 7,484 members**. Read-only off-host verification accepted all hashes, frozen local source comparisons (**442 inputs**), native outcomes, source mutations, artifact bindings and original waits. Manifest: **2,557 retained source/generated/runtime/artifact names**, **791 unique objects**. It retains **15 executable artifact aliases**, including current/superseded and prior native RED binaries, the prior Empty/foundation binaries and the reused Database. It also retains current proof RocksDB files and prior native RED RocksDB objects. Content-addressed artifact aliases are in `complete-source-inputs.json` and `qualification.json`; restoring an ELF artifact requires restoring its executable permission. Controllers, generated Rust/Python, canonical Python sources/plugin, tool/dependency readback and failed/superseded source snapshots are included.

The prior archives were not modified and were additionally copied into that durable directory:

- Foundation/native RED: `5428d231fee7acbeafc1b8ce0207912ec19737c4b96885e55cd016f90c2fcb2d`.
- Empty compiler RED: `4717b5156be67813858be4d4357a4b0446e4a53081752710cbbe3e56f0daddae`.

Those prior proofs remain reused historical evidence, not fresh execution for this source. Their executable bytes needed for reproduction are now retained off host as well.

```sh
python3 reboot/rust/tests/evidence/verify_direct_transaction.py \
  /home/openclaw/.hermes/profiles/jean/artifacts/direct-transaction-20261020/direct-transaction-20261020-raw.tar.gz
```

[Machine qualification](direct-transaction-20261020.json), [archive receipt](direct-transaction-20261020-archive.json). Remote evidence remains `/home/benchbuild/.cache/direct-transaction-20261020-evidence/` on existing CCX43 **2.29.27.53**, server **171072439**, expiring **21 October 2026 18:46 UTC**. No retention extension or new capacity was requested.

## Remaining major limits

Pure transaction-only adapters without a DatabaseActorStore; shared/factory transaction tasks; declared transaction-error terminals; due/running transaction cancellation; full Python automatic retry, middleware, private internal credentials and recovered user identity; dynamic placement/migration and remote-child receipt-bound composition remain open. Future successors are atomically staged but their eventual execution is not qualified here. Exactly-once arbitrary handler external effects and universal prepared-coordinator cancellation/recovery are not claimed. This is a bounded direct admission/execution checkpoint, not full transaction-task parity or a production-authentication qualification.
