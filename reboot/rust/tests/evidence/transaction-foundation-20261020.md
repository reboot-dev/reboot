# Transaction foundation: tested local handoff

Base: `f6d47955a75999a120790bff0c14db617d87c62c`. Feature: `0f60fc1358cd6c4459a8cf3ff9f77cfd11c4210d`. Tested corrective source: `50da3fe53a821d1c11b449e9e8c6bf4de24cdf21` (includes `1e27135f` and `3bb69dcd`). **LOCAL ONLY: no push; independent parent review required before publication.**

## Qualified scope and contracts

Actual Python `WeakReference.spawn` schedules a workflow and awaits its typed result; the workflow invokes a generated exclusive transaction reference. The target uses the real legacy C++ coordinator and registered same-host root-star participants. Root and leaf state, exact root response receipt, and a future reader successor are staged transactionally. This is **not direct canonical `spawn(transaction)` support**, which remains rejected, nor full transaction-task parity.

Source inspection rechecked Python dispatch in `reboot/templates/reboot.py.j2:861-946`, native deferred state/tasks/receipt Apply and Prepare in `reboot/server/database.cc:3351-3453`, native Commit at `3457-3497`, and generated replay/authorization/root registration plus root effect validation. See [migration map](../../TRANSACTION-TASK-MIGRATION-MAP.md). Replay is actor/key/request/scope bound and current authorization precedes disclosure. Nested contexts clear the root receipt binding; receipt-bound composition refuses network fallback. Explicit service credentials are not recovered task-user credentials or Python internal magic-token parity.

Target transaction commit, source journal acknowledgement, and terminal `CompleteTask` CAS are separate operations. Transaction declared errors do not acquire ordinary-writer durable declared-error continuation authority. Shared/factory transaction task targets, dynamic placement, remote receipt-bound composition, direct transaction cancellation ownership, and broad retry/middleware parity remain outside this checkpoint. Constructor policy in this fixture is deliberately permissive; this is not an authenticated production application qualification.

## Final qualification

`transaction-foundation-final4-20261020.service` ran 2026-10-20 19:46:19–19:55:41 UTC. Original owner PID `1645682` joined controller PID `1645683` with return code 0. Terminal systemd readback: inactive, MainPID=0, Result=success, ExecMainStatus=0. Frozen inputs were unchanged.

- All **18** fresh gates accepted: both exact native RED mutants/builds, restored fixture build, SDK all-target tests, strict SDK and fixture Clippy, doctests, fixture tests, transaction proof, original-parent error and SIGTERM drills, outbound, outbound ACK-loss, canonical admission and generic task proofs.
- SDK all-target execution: **972 passed, 175 ignored**, zero failed. Ignored native tests are not silently counted as native passes. Doctests: **8 passed**. Fixture test binary: **0 tests**, build/Clippy qualified separately.
- Final positive native cases: **41** — transaction 7, outbound 7, ACK-loss 4, canonical 11, generic 12. These include previously established controls; not 41 new transaction behaviors.
- Final native ledgers: **773 original child waits** across positive cases, two RED mutants, and two cleanup drills. Separate real parent wait-timeout cleanup drill joined its proof child and **9** original grandchildren.
- Entire retained archive: **34 native receipts, 1,615 original driver-child waits**, including failed/earlier runs. These totals are not unique successful coverage. Original controller/gate/outer-owner joins are distinct ledger levels and not folded into that driver-child count.
- Both native mutants remain RED: missing root binding refuses before transaction Apply; bypassing target receipt replay produces durable **root=17, leaf=17** after restart/intervening mutation. Exact original/modified generator bytes and mutation patches are retained.

All final native child PIDs and gate PIDs were freshly absent after their recorded original-parent waits; all four custodial cache locks were then successfully acquired. Error/SIGTERM and real wait-timeout drills retained original-parent cleanup. This does not claim protection against uncatchable SIGKILL. Outer systemd-owner absence is a timestamped observation plus terminal service state, **not a fabricated external original-parent wait**.

## Failed-run chronology (not retrocertified)

1. `final1` failed strict fixture Clippy (101). `1e27135f` boxed fixture status; no lint allowance was added. Failure remains retained.
2. Interrupted `final2` subsequently passed transaction/error/SIGTERM gates but failed an old crosspath ACK-loss fixture assertion: it expected `injected lost real Store ACK`, whereas the shared proxy emits `injected lost real native ACK`. Actual upstream native Store success and withheld downstream ACK were recorded. This was a fixture contract mismatch, not an observed transaction runtime failure.
3. `3bb69dcd` initially asserted exact equality with the native marker; `final3` failed because the existing Database sidecar wraps the marker with transport context. The precise wrapped error is retained.
4. `50da3fe5` restores the original substring-check shape with the correct native marker and diagnostic status, retaining the typed UNAVAILABLE assertion. `final4` reran the full 18-gate matrix successfully; no runtime implementation or acceptance behavior was weakened.

The newest prior registration suite was **70 cases / 1,761 waits**. The first predecessor's prelaunch check covered the older ordinary owner, and the latest registration owner's absence was checked later. Do not rewrite that historical ordering. Fresh final2/final3/final4 owners rechecked the latest registration receipt/absence before their own launches. Final2 and final3 exact retirement were checked before subsequent source changes.

## Evidence and reproduction

Off-host raw archive:
`/home/openclaw/.hermes/profiles/jean/cache/scratch/transaction-foundation-20261020-raw.tar.gz`

SHA-256: `5428d231fee7acbeafc1b8ce0207912ec19737c4b96885e55cd016f90c2fcb2d`

Size: **9,543,039 bytes**, **3,627 files**. Independent local read-only verifier accepted all member hashes, log hashes, exact source/binary receipt bindings, failed proofs, child joins, cleanup and chronology. Manifest: **732 source/generated/runfile inputs**, **716 unique content objects**; **434** existing local input files compared exactly. The archive retains logs, wire records, sources/generated bindings, controllers and hashes; executable bytes and RocksDB directories are excluded and remain on the expiring host. The C++ engine is reused, not freshly hermetically built.

```sh
python3 reboot/rust/tests/evidence/verify_transaction_foundation.py \
  /home/openclaw/.hermes/profiles/jean/cache/scratch/transaction-foundation-20261020-raw.tar.gz
```

Remote original evidence: `/home/benchbuild/.cache/transaction-foundation-20261020-evidence/` on existing CCX43 `2.29.27.53`, server `171072439`, expires **21 October 2026 18:46 UTC**. No new capacity, installation, deployment, retention change, cache purge or unknown process kill occurred. Source/binary association is hash-bound existing-artifact evidence, not a fresh C++ build attestation.

[Machine summary](transaction-foundation-20261020.json), [archive receipt](transaction-foundation-20261020-archive.json), [complete source manifest](transaction-foundation-20261020-complete-source-inputs.json). Parent must independently review source and evidence, then decide publication; no publication was attempted here.
