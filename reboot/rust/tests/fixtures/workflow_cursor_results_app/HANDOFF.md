# Cursor/results fixture: acceptance boundary

**Current Q6 repair is source/compile/local-supervision tested, not native runtime accepted.**
The opening historical notes and provenance receipts below describe their own
older source revisions; see Required parent integration for the current gate.

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

The checked-in `run_native_gate.py` now supplies the original supervisor and
`cursor_custody.py` adapter; no externally authored module is needed. On Linux:

```sh
CARGO_TARGET_DIR="$TMPDIR/cursor-target" cargo build --offline --locked \
  --manifest-path reboot/rust/tests/fixtures/workflow_cursor_results_app/Cargo.toml --bin app
CURSOR_APP_BIN="$TMPDIR/cursor-target/debug/app" \
REBOOT_NATIVE2PC_CXX_DATABASE=/absolute/path/to/current/native/database \
  python3 reboot/rust/tests/fixtures/workflow_cursor_results_app/run_native_gate.py
```

The standalone gate defaults to **10000** iterations. The two ignored Rust entry
points call this same gate with explicit 1030/10000 budgets; run either with
`cargo test --manifest-path reboot/rust/Cargo.toml --test workflow_cursor_results_native
<test-name> -- --ignored --exact --nocapture` after supplying both executable
variables. Runtime binaries are inputs, not downloaded or built by the gate.
Optional `CURSOR_GATE_DIR` must not exist. `CURSOR_STAGE`/`CURSOR_EVIDENCE` default
inside that exclusive directory; overrides must also be fresh. The gate prints
its `gate.json` path before binary preflight, saves failures even before the body,
and captures `driver.log`, source/executable SHA-256s and artifact hashes.

The gate holds a flock in the original process, enables the existing public
acceptance subreaper, and calls `protected_owned_exit` before releasing ownership.
The adapter owns all launches directly: pidfd acquisition, `waitid(P_PIDFD,
WNOWAIT)` and a genuine exact-child `waitpid` receipt precede descriptor closure.
It never uses Popen polling/wait ECHILD fallback, PID-only signals or forced
kills. SDK shutdown uses the fixture shutdown file; Database receives SIGTERM
only through its pidfd and only after the SDK/client exact-join barrier. Timeout
preserves custody and the gate lock until natural exit/operator reconciliation.
Acquisition failures stay in the ledger and sticky custody failures reject
acceptance. There are no attach descriptors because this route never transfers
children to another supervisor; contract v2 records original direct ownership.

Iteration-zero Stored bytes must survive the first Database restart, but must
be **absent** after advancing. The inspector's `all` mode reads all checkpoints
for the exact workflow; the gate checks root-byte retention, absence of old
iteration scopes, a fixture-specific constant checkpoint bound, current Break
payload retention, and exact all-record equality across Database restarts.
Actor-global destination idempotency records are outside this workflow-scoped
bound. The two native scenarios still test saved result/Break replay and refusal
to redispatch an ambiguous Started-after-commit effect.

Local verification for this repair: 20 fixture Python tests, including real
short-child pidfd joins/shutdown, timeout preservation, natural failure, ECHILD
and acquisition-failure regressions; 15 existing public ownership tests; offline
Cargo check of both generated bins and offline app build. Generated
`BMethodsWeakReference` has an existing dead-code warning. **No current native
10000-iteration acceptance:** the actual gate preflight fails on missing
`REBOOT_NATIVE2PC_CXX_DATABASE`; there is no selected current native executable
or local Bazel command. No native source build or infrastructure change was
attempted on the low-free-space host. Historical receipts/PROVENANCE below are
not current-source certification. The documentation verifier's nine self-tests
pass but its final source fingerprint remains stale; it was not refreshed.

Short-lived clients and failed acquisition reservations belong to the same ledger. Before **any** Database retirement, every SDK/client must have genuine exact joins and closed original pidfd handles; an unknown reservation retains Database and the original exclusive owner. Never synthesize success on ECHILD. Distinguish intentional graceful Database retirement, healthy SDK exit and natural Started-recovery SDK failure. After adopted-child draining, sticky cleanup failures must reject success even when custody is demonstrably discharged.

The checked-in outer gate persists preflight/bootstrap failures and captures/hashes receipts and logs even with an empty command-row list. It launches no containers. Setup/write failures do not guarantee an evidence file if the filesystem itself is unavailable; callers must preserve the printed stage and stderr. Do not select a historical native executable as current-source acceptance merely because its path exists.

`PROVENANCE.json` separates historical seed inputs, current fixture hashes and the bounded evidence scope. The bounded cursor/results native fixture proof is accepted after the real scenario run and separate canonical readback; full-native/public acceptance remains false.

## Independent canonical readback

`canonical_verifier.py` was delivered as source-only and then actually executed by the parent under the unchanged gate/helper/adapter. It requires the normal configured gate environment plus `CANONICAL_INPUT_ROCKSDB`, `CANONICAL_SERVER_INFO` and `CANONICAL_EXPECTED`. The expected JSON contains the original passing driver report and `canonical_inputs` with pinned `main_rs`/`inspect_rs` path/hash objects, `server_info_sha256` and the full relative-path `rocksdb_manifest`. Copy regular files into new inodes, mount the input read-only, and keep the original server-info bytes. No info regeneration, SDK host or task producer is used. Parent must independently verify final pins, both raw snapshots, genuine child joins, exact container retirement, unchanged inputs, archive hashes and original lock release. The published canonical receipt records the actual parent execution; the source-only docstring describes its initial handoff, not the later run.
