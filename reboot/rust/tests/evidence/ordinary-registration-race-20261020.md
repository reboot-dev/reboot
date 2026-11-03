# Ordinary cancellation: absent-registration race checkpoint

Base: `500a418833c95a49858547ced1e1a0566e0c7098`. Local tested checkpoint only; **independent source review remains blocked/pending, so do not publish or advance transaction work**. No push occurred.

## Fix and deterministic proof

Cancel now publishes a generation-bound, signalled intent under the same original-owner/registration locks used by ordinary execution registration, including when the registration is absent. Publication precedes the serialization wait. Late registration atomically observes the intent and suppresses execution rather than creating an unsignalled reader that parks ahead of cancellation's exclusive actor lease. An authoritative NOT_FOUND clears its own acknowledged intent; dropped/uncertain requests preserve suppression and sticky owner/actor uncertainty.

The native proof uses actual generated Python Tasks clients and the existing native C++ Database. Two scheduled readers share the actor: A runs while B is held immediately before registration. CancelA's real successful synchronous CompleteTask ACK is held by a transparent proxy; CancelB reaches the pre-serialization lookup/publication point while B is absent. B is released before A's ACK, forcing the contested ordering.

- Actual parent-source RED: B queues a shared lease, enters a second reader body, and CancelB fails the bounded wait with `FutureTimeoutError()`. The original native parent joins all 9 children after failure.
- Final GREEN: B is suppressed before acquiring a reader lease; exactly one reader enters/retires. Both typed cancellation terminals persist. Separate absent-owner ACK-loss and request-drop scenarios fence Wait and a queued writer, fail the original supervised host, then recover with the real retained Database. Random absent-ID cancellation returns NOT_FOUND without poisoning the following writer.
- Test-only barriers observe/hold registration and the real reader-lease future; they do not seed records, supply Database responses, or reorder the actor gate. The held first ACK is returned unchanged. Loss on the second ACK is injected only after observing the real native successful response.
- Exact parent, instrumented RED and initial GREEN bytes/diffs are retained in `registration-red-inputs.tar`. Its initial GREEN precedes the final test-helper-only Clippy repair; the final GREEN source objects and overlay2 are retained separately. The RED/final-GREEN input manifests differ only in `one_shot_tasks.rs` and `task_cancellation.rs`. Offhost verification compares retained parent bytes to Git's exact base commit.

## Final-source qualification

All final compile receipts are fresh for the final frozen source; no failed-attempt build is promoted.

- Locked/offline all-target tests: **969 passed entries**, including **855 library** and **55 generated-consumer** passes; **174 ignored entries**. Nested executions are not additional unique behaviors.
- SDK doctests: **8 passed**. Fixture all-target test command passed with 0 unit tests; fixture behavior is exercised by native gates.
- SDK and fixture all-target Clippy: **passed with `-D warnings`**, no added allowance.
- All seven affected ignored native wrappers were explicitly run; other ignored gates were not requalified.

| Native gate | Scenarios | Original-parent child waits |
|---|---:|---:|
| running | 9 | 188 |
| generic | 12 | 229 |
| workflow-writer | 2 | 49 |
| canonical | 11 | 199 |
| migration | 1 | 30 |
| lifecycle | 19 | 657 |
| spawn | 16 | 409 |
| **Main total** | **70** | **1761** |

Error and real SIGTERM cleanup drills each joined 5/5 original children. Across all retained attempts, 13 native receipts / 2246 original child waits were verified; these are custody counts, not accepted-case counts.

## Interrupted work, failures and review

The interrupted worker's provider refusal was not a test result. Recovery read its transcript, exact diff and migration map, then freshly inspected the authorized host. Earlier owners had joined their original children; owner PID absence and inactive services were observed before taking the existing cache locks. Prepared source/archives were preserved.

A first launch as benchbuild failed before creating a test child because existing cache locks were root-owned; its journal is retained. Running under the already-authorized root account reused the established owner without changing permissions. The first GREEN passed native running/generic/workflow-writer and all-target tests but failed strict Clippy on a nested `if` in the test-only observer. That frozen source, failure, receipts and original-child waits remain archived. A new immutable GREEN2 source applies Clippy's equivalent let-chain and reruns the entire qualification successfully.

Independent read-only review was attempted via standalone Codex CLI (local tracked session `proc_7a31d96f2c6c`); it exited 1 before review because token refresh failed with HTTP 401. No authentication or provider safeguards were changed or bypassed, and no replacement provider was selected. **Parent independent review is still required.** This document reports test qualification, not review approval.

## Custody and artifacts

Authorized validation host: `root@2.29.27.53` / `jean-reboot-rust-validation-ccx43` (`server171072439`). Retention remains **21 October 2026 18:46:13 UTC / 20:46:13 CEST**. No new capacity, installation, deployment, heavy local build, expiry change or transaction work occurred.

- Final owner: `registration-green2-20261020.service`, owner PID 1493315, source `/home/benchbuild/.cache/registration-race-green2-20261020-src`.
- RED owner: `registration-red2-20261020.service`, owner PID 1470475, source `/home/benchbuild/.cache/registration-race-red-20261020-src`.
- Both read back inactive, MainPID=0, Result=success, ExecMainStatus=0. Their controller children were waited by their original owners. Timestamped `/proc` absence is recorded separately, not represented as an external waitpid receipt. No SIGKILL or outer-deadline cleanup guarantee is claimed.
- Remote evidence: `/home/benchbuild/.cache/registration-race-20261020-evidence/`; final gates `registration-green2-gates.json`, raw receipts `registration-green2-*-raw/receipt.json`, owner receipts copied into the evidence directory. The rejected GREEN1 owner receipt and journals are retained too.
- Final fixture SHA256: `69d42633142028891f0e081f1556ab634f37e1c0f22a7b360c7218e97e207eae`.
- RED fixture SHA256: `d120b4179f08059e7440f78660957921d77761849d05944f727e4b414e6b50e1`.
- Native C++ Database reused, **not freshly built**: `619002c569e9841144a8bbedf4f2ce6a753bb0e6b103af71883d91d43f413803`. Legacy migration binary is also reused.
- Final manifest: 719 source/runtime/tool inputs, SHA256 `83266c52ecb6b2068041fad68c27dfd6ded4df9514739fa1952918d319d74801`.
- New remote/offhost archive: `/home/benchbuild/.cache/ordinary-registration-race-20261020-raw.tar.gz`; 5420579 bytes, 4273 members, SHA256 `4bd2227c8b094f4e121dcbbd441733d69362f087cc32fedbb1e3ef4e8ef16afb`.
- Large executables, RocksDB directories and caches are excluded from the compact archive; exact sources, generated outputs, wire bytes, snapshots, receipts and executable hashes remain. Original frozen executables/stores remain on the authorized host until expiry.
- Offhost verification checked every archive member, 430 local compiled inputs, retained source objects, exact parent bytes, RED/GREEN observation markers and original native child ledgers.
- Historical ordinary-running archive remains unchanged at SHA256 `a71f48e9de4441df1ecf13991699cb91087bca1b0a265ad6e4ef860315691652` (checked locally and remotely).

Read-only verification:

```sh
python reboot/rust/tests/evidence/verify_ordinary_registration_race.py
```

Files: [qualification](ordinary-registration-race-20261020.json), [manifest](ordinary-registration-race-20261020-source-inputs.json), [archive](ordinary-registration-race-20261020-raw.tar.gz), [archive receipt](ordinary-registration-race-20261020-archive.json), [offhost verification](ordinary-registration-race-20261020-offhost-verification.json), [migration contract](../../GENERIC-TASK-MIGRATION-MAP.md).

## Unchanged limits

Cooperative local ordinary reader/writer cancellation on registered existing actors only. No synchronous preemption, revocation of submitted external effects, distributed/dynamic ownership, cursor admission/GC, Python-hosted UUID allocation or transaction-adapter task parity is claimed. Actor state/response/successors still commit together in Store; terminal CompleteTask remains separate. Do not advance transaction work until this checkpoint is independently reviewed.
