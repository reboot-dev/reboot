# Cursor/results fixture: acceptance boundary

This is a **new-feature fixture, not reboot-examples parity evidence**. The original generated consumer compiled and passed strict all-target Clippy; the subsequent transport-metadata fix has also built successfully offline (strict Clippy evidence describes the earlier source). Cleanup barriers have local unit coverage. The first native attempt failed at missing writer metadata; the repaired native driver subsequently passed both scenario assertions with clean verified retirement. The separate database-only canonical readback has also passed; public qualification is not claimed. The outer Rust test is intentionally ignored.

The scenario targets more than 1024 cursor continuations, generated cross-actor calls, complete Stored-record/payload replay equality, saved Break replay, and Started-after-commit uncertainty. The native-driver outcomes are recorded in PARITY.md and its receipt; the independent post-run canonical acceptance boundary is documented separately in the canonical readback receipt.

## Transport metadata versus replay deduplication

Generated writers require `x-reboot-idempotency-key`. Each actual B dispatch
therefore generates a fresh UUID inside the callback; it is never derived from
the task/effect identity or reused on recovery. Destination deduplication cannot
mask accidental redispatch: it would receive a fresh key and commit again.
Stored replay must avoid constructing the callback entirely. The original
keyless call failed on the first real native run; it was not accepted.

## Finite workload wait

The native rerun reached iteration 99 before the generic ten-second wait
expired. Only the explicit parked-at-1025 milestone now allows 180 seconds;
normal readiness/default waits remain ten seconds. The predicate, canonical
state assertions, cleanup deadlines and failure classification are unchanged.
Timeout is never acceptance. Two local fake-clock regressions cover the
unchanged default failure and the explicit workload budget.

## Required parent integration

The trusted parent supplies the real built `CURSOR_APP_BIN`, `REBOOT_NATIVE2PC_CXX_DATABASE`, a fresh exclusive `CURSOR_STAGE` and `CURSOR_EVIDENCE`, and `CURSOR_CUSTODY_MODULE`. Read `prove_cursor.py` for the complete environment/preflight contract. Reject optimized Python execution. Preserve the canonical source freeze and actual app/native executable hashes; independently read back the final evidence.

The custody module must export `CONTRACT = 'cursor430-exact-child-v1'`, `run`, `spawn`, its complete `children` ledger and original `_owner`. Its children expose the exact join/receipt/descriptor fields consumed by `supervision_reference.py`, plus `retire`, `join_failure` and `require_owned_alive`. This is a private integration contract, not a general public adapter API. No subprocess polling fallback is supplied.

Short-lived clients and failed acquisition reservations belong to the same ledger. Before **any** Database retirement, every SDK/client must have genuine exact joins and closed original/attach handles; an unknown reservation retains Database and the original exclusive owner. Never synthesize success on ECHILD. Distinguish intentional graceful Database retirement, healthy SDK exit and natural Started-recovery SDK failure. After adopted-child draining, sticky cleanup failures must reject success even when custody is demonstrably discharged.

The outer parent must persist preflight/bootstrap failures, capture driver output/errors, archive/hash/read back receipts and logs even with an empty command-row list, verify exact container retirement, and retain the original task lock on uncertain ownership. Setup/write failures do not magically guarantee a saved fixture evidence file: the parent must record them separately. Do not launch this fixture with a guessed adapter, config boolean, historical executable path alone, or an unverified approval claim.

`PROVENANCE.json` separates historical seed inputs, current fixture hashes and the bounded evidence scope. The bounded cursor/results native fixture proof is accepted after the real scenario run and separate canonical readback; full-native/public acceptance remains false.

## Independent canonical readback

`canonical_verifier.py` was delivered as source-only and then actually executed by the parent under the unchanged gate/helper/adapter. It requires the normal configured gate environment plus `CANONICAL_INPUT_ROCKSDB`, `CANONICAL_SERVER_INFO` and `CANONICAL_EXPECTED`. The expected JSON contains the original passing driver report and `canonical_inputs` with pinned `main_rs`/`inspect_rs` path/hash objects, `server_info_sha256` and the full relative-path `rocksdb_manifest`. Copy regular files into new inodes, mount the input read-only, and keep the original server-info bytes. No info regeneration, SDK host or task producer is used. Parent must independently verify final pins, both raw snapshots, genuine child joins, exact container retirement, unchanged inputs, archive hashes and original lock release. The published canonical receipt records the actual parent execution; the source-only docstring describes its initial handoff, not the later run.
