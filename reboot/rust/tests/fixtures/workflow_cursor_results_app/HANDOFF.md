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

The gate installs SIGTERM/SIGINT ownership handlers before any launch. Handlers
latch sticky failure/cancellation rather than interrupting reservation, pidfd or
wait-receipt publication. Launch/readiness/wait/retirement boundaries observe
cancellation and enter the same protected retention path; repeated catchable
signals cannot unwind that path. The original lock remains held while an owned
child is stopped **or alive**, including after external SIGCONT, until genuine
exit/reaping and descendant reconciliation. No SIGKILL survivability is claimed.
A zero exit that predates a shutdown request is an unexpected exit, not healthy
shutdown; its exact receipt is kept but acceptance fails sticky. The explicit
Started-recovery nonzero-natural-failure path remains separate.

Iteration-zero Stored bytes must survive the first Database restart, but must
be **absent** after advancing. C++ `RecoverIdempotentMutations(workflow_id,
workflow_iteration=None)` reads root prefixes only; it does not enumerate
iteration checkpoints. The inspector's repaired `all` mode reads the root scope
plus **every explicit iteration 0..canonical task.iteration inclusive**, keeping
at most 32 read streams active over the cloned shared gRPC channel. It retains
and counts actual returned mutations (including leaked old nonzero iterations),
not a count inferred from current/root reads. Inventory metadata is mandatory
for the GC assertions. Each call is made while the workflow is parked or terminal;
this is not an atomic multi-RPC inventory for a concurrently advancing workflow,
or an inventory of actor-global/other-workflow keys. No engine protocol changes.
The gate checks retained root bytes, absence of completed scopes, the
fixture-specific checkpoint bound, current Break payloads and exact inventory
bytes across Database restarts. The 10k inventory has a separate finite
200-second client budget, not a native performance claim or timeout acceptance.
The two native scenarios still test saved result/Break replay and refusal to
redispatch an ambiguous Started-after-commit effect.

Local verification for this correction: 23 fixture Python tests, including a
real stopped-child gate SIGTERM test, repeated SIGTERM/SIGINT during retention,
external pidfd SIGCONT with the child still alive, eventual natural exit and lock
release, unexpected-zero retirement, and expected-nonzero failure controls;
15 existing public ownership tests; two Rust inventory tests with 10000 explicit
iteration reads, a leaked iteration7341 record, actual returned count, bounded
concurrency and partial-read failure. Those Rust reads are a labelled async test
double, **not native Database throughput/GC proof**. Offline Cargo check covers
both generated bins. Generated `BMethodsWeakReference` has an existing dead-code
warning. **No current native 10000-iteration acceptance:** no
`REBOOT_NATIVE2PC_CXX_DATABASE` is selected in this environment. No native source
build or infrastructure change was attempted on the low-free-space host.
Historical receipts/PROVENANCE below are not current-source certification. The
documentation verifier's historical source fingerprint remains stale; it was
not refreshed for this correction.

Short-lived clients and failed acquisition reservations belong to the same ledger. Before **any** Database retirement, every SDK/client must have genuine exact joins and closed original pidfd handles; an unknown reservation retains Database and the original exclusive owner. Never synthesize success on ECHILD. Distinguish intentional graceful Database retirement, healthy SDK exit and natural Started-recovery SDK failure. After adopted-child draining, sticky cleanup failures must reject success even when custody is demonstrably discharged.

The checked-in outer gate persists preflight/bootstrap failures and captures/hashes receipts and logs even with an empty command-row list. It launches no containers. Setup/write failures do not guarantee an evidence file if the filesystem itself is unavailable; callers must preserve the printed stage and stderr. Do not select a historical native executable as current-source acceptance merely because its path exists.

`PROVENANCE.json` records historical seed inputs and the earlier bounded evidence
scope; it has not been regenerated for this repair. Its historical native run and
canonical readback do **not** certify this inventory/signal/retirement correction.
Current native/public acceptance remains false.

## Independent canonical readback

`canonical_verifier.py` was delivered as source-only and then actually executed by the parent under the unchanged gate/helper/adapter. It requires the normal configured gate environment plus `CANONICAL_INPUT_ROCKSDB`, `CANONICAL_SERVER_INFO` and `CANONICAL_EXPECTED`. The expected JSON contains the original passing driver report and `canonical_inputs` with pinned `main_rs`/`inspect_rs` path/hash objects, `server_info_sha256` and the full relative-path `rocksdb_manifest`. Copy regular files into new inodes, mount the input read-only, and keep the original server-info bytes. No info regeneration, SDK host or task producer is used. Parent must independently verify final pins, both raw snapshots, genuine child joins, exact container retirement, unchanged inputs, archive hashes and original lock release. The published canonical receipt records the actual parent execution; the source-only docstring describes its initial handoff, not the later run.
