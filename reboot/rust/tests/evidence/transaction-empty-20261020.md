# Additive qualification: canonical Empty transaction references

**LOCAL ONLY. Parent independent rereview is required before publication. No push or history rewrite.**

Reviewed predecessor: `625fdf94e9028d84348a00d1401e84d06a1580a3`; unpublished foundation base remains `f6d47955a75999a120790bff0c14db617d87c62c`. Type-rendering fix: `bebd8e6d3c98bbfd6556857ec4fffb6349ebfffe`. Final tested source: `9128343ff044701d4d9461383065ee3b31cd5ea0`.

## Narrow correction and compiler proof

The workflow transaction reference emitter now consumes the same validated method tuples as the existing adapters: method name, rendered request/response types, and canonical method identity. It no longer independently takes the final protobuf identifier. The existing canonical Empty token and final rendering to Rust unit remain authoritative; canonical response Any URLs remain `type.googleapis.com/google.protobuf.Empty`.

The actual generated workflow application fixture adds an exclusive transaction service using canonical `google.protobuf.Empty` for both request and response, alongside its existing local `workflow.v1.Empty` and an exclusive local-Empty method. It compiles the complete generated consumer, including the otherwise-unused reference. Its test type-checks the actual reference futures as `Result<(), tonic::Status>` and `Result<proto::Empty, tonic::Status>` respectively. This is a compile regression, not a new native Empty-service execution claim.

The exact two predecessor generator files (`codegen.rs` and `workflow_transaction_codegen.rs`) are retained and byte-checked against predecessor Git source. The RED source tree differs from final source only in those two files; the complete new consumer fixture is identical. `cargo test --locked --offline --manifest-path .../workflow_app/Cargo.toml --all-targets` exits **101** with actual generated Tonic request/response mismatches between `proto::Empty` and `()`. Fixed source compiles and the consumer test passes.

The first qualification attempt on `bebd8e6d` exposed an additional preexisting strict-consumer issue: passing canonical unit `execution.response` directly into `tonic::Response::new` triggers Clippy `unit_arg`. This attempt remains failed and retained. `9128343f` explicitly evaluates the returned unit field before constructing its unit response in the transaction flow. No lint suppression or acceptance weakening was added. The final frozen source reran the complete affected matrix.

## Fresh final results

`transaction-empty2-20261020.service` ran **2026-10-20 20:15:55–20:24:16 UTC** on the already-authorized CCX43. All **15** final gates accepted, including the expected compiler RED and both expected original-parent cleanup failures:

- SDK all-targets, `--locked --offline --features build,test-support`: **972 passed, 175 ignored**, zero failed. These are execution counts, not unique additional coverage; ignored native cases are not native passes.
- Strict SDK and actual generated consumer Clippy, all targets, `-D warnings`: both passed.
- SDK doctests: **8 passed**. Actual generated consumer: **1 passed**, zero ignored.
- Actual workflow fixture was freshly rebuilt from final source. Its retained Cargo JSON build log identifies the generated Rust artifacts, retained as content-addressed source objects.
- Fresh native positives: **41** — transaction **7**, outbound **7**, outbound ACK-loss **4**, canonical admission **11**, generic task targets **12**. These repeat the affected established controls, not 41 new behaviors.
- **7 native receipts / 746 original driver-child waits**: five positive suites plus original-parent error and SIGTERM drills (9 waits each). Gate/controller/outer-owner levels are separate and not folded into driver-child totals.

Final application SHA-256: `d15e273bc9732bb739385b2ea438e1df0a5ccc7fa4919676166e4f9cd7a68e76`.

Reused actual C++ Database SHA-256: `619002c569e9841144a8bbedf4f2ce6a753bb0e6b103af71883d91d43f413803`. This is existing-engine/source association, **not a fresh hermetic C++ build**. Cargo dependencies, canonical Python tools/runfiles and validation capacity were reused; no new capacity, installation or deployment occurred.

## Custody and immutable predecessor evidence

Before the first additive build, its original owner freshly read predecessor `final4` owner/controller receipts, checked owner **1645682**, controller **1645683**, all recorded original gate/driver children absent, terminal service state, and acquired the same four custodial locks. The failed additive attempt's exact original-parent joins, outer-owner absence and four-lock reacquisition were freshly checked before the second frozen run. Neither ordering is inferred from archived absence facts.

Final original owner **1686547** waited controller **1686549** with status 0. The controller retained nonempty atomic gate ledgers, real bounded waits, deadlines and catchable termination cleanup; proof drivers retained their original child waits. All final gate/driver PIDs were freshly absent and all four cache locks reacquired after completion. Terminal service readback: inactive, MainPID=0, Result=success, ExecMainStatus=0. The outer-owner retirement is a timestamped absence observation plus terminal systemd state, **not a fabricated external original-parent wait**; no SIGKILL immunity is claimed.

The predecessor archive is unchanged:
`/home/openclaw/.hermes/profiles/jean/cache/scratch/transaction-foundation-20261020-raw.tar.gz`, SHA-256 `5428d231fee7acbeafc1b8ce0207912ec19737c4b96885e55cd016f90c2fcb2d`.

Its independent read-only verifier was rerun against an exact `625fdf94` source snapshot: accepted, **34 receipts / 1,615 original waits**, final **41 positives / 7 transaction cases / 773 waits**, **972 passed / 175 ignored / 8 doctests**. Its two exact native RED mutants, failed-run chronology and real parent wait-timeout cleanup drill remain retained and **reused, not rerun or retrocertified for this source**. The additive archive is separate; no predecessor proof or failure bytes were overwritten. The predecessor verifier compares local compiled inputs, so run it in its frozen source snapshot, not against this intentionally changed source.

## Off-host evidence and reproduction

Additive raw archive:
`/home/openclaw/.hermes/profiles/jean/cache/scratch/transaction-empty-20261020-raw.tar.gz`

SHA-256: `4717b5156be67813858be4d4357a4b0446e4a53081752710cbbe3e56f0daddae`.

**4,985,263 bytes / 2,232 files**. Read-only off-host verification accepted all member/log/source hashes, exact old-source bindings, generated canonical/local signatures, failed-attempt retention, final binary/Database bindings, native outcomes and original-child joins. Manifest: **1,168 source/generated/runfile names**, **719 unique objects**; **434** existing final local inputs checked exactly. Failed-source names are retained separately and share unchanged content objects. Executable bytes and RocksDB directories are excluded from the archive and remain on the expiring host.

```sh
python3 reboot/rust/tests/evidence/verify_transaction_empty.py \
  /home/openclaw/.hermes/profiles/jean/cache/scratch/transaction-empty-20261020-raw.tar.gz
```

Remote evidence: `/home/benchbuild/.cache/transaction-empty-20261020-evidence/`; final source `/home/benchbuild/.cache/transaction-empty-20261020-src2`; final receipts `qualification2/`. Existing host **2.29.27.53**, server **171072439**, expires **21 October 2026 18:46 UTC**. Controllers, first failed attempt, exact old-source objects and all final receipts are retained in the archive. [Machine summary](transaction-empty-20261020.json), [archive receipt](transaction-empty-20261020-archive.json), [complete inputs](transaction-empty-20261020-complete-source-inputs.json).

The ledger fingerprint was refreshed only after reviewing the four changed compiled-input files and exercising the new archive verifier against the final proof. The documentation checker passes all 9 self-tests and 307 local-link checks; this freshness check is not behavioral proof. Separate corrupted-archive controls (with refreshed member hashes) reject a wrong final source pin and an unwaited original child; the accepted archive is untouched.

## Unchanged scope limits

Direct canonical `spawn(transaction)` remains rejected. This checkpoint is workflow-to-exclusive-transaction composition, not complete transaction-task parity. Target commit, source-journal acknowledgement and terminal `CompleteTask` CAS remain separate operations. Future successors are staged, not future-execution-qualified. Shared/factory task targets, direct transaction cancellation, broader retry/middleware and identity parity remain outside this checkpoint. Parent independent source/evidence rereview is still required before publication.
