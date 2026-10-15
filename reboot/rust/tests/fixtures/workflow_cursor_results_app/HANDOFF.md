# Cursor/results fixture: acceptance boundary

This is a **new-feature fixture, not reboot-examples parity evidence**. The original generated consumer compiled and passed strict all-target Clippy; the subsequent transport-metadata fix has also built successfully offline (strict Clippy evidence describes the earlier source). Cleanup barriers have local unit coverage. The first actual native attempt failed at the first cross-actor writer; native/public qualification has **not passed**. The outer Rust test is intentionally ignored.

The scenario targets more than 1024 cursor continuations, generated cross-actor calls, complete Stored-record/payload replay equality, saved Break replay, and Started-after-commit uncertainty. These are proof objectives, not reported runtime results.

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

`PROVENANCE.json` separates historical seed inputs, current fixture hashes and the bounded evidence scope. Native/public acceptance remains false until an independently adjudicated real run satisfies the full contract.
