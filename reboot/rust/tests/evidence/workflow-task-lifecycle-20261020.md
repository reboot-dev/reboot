# Canonical workflow Task lifecycle — native checkpoint

Base: `151c358616341203de7dfbd2809563ea704a72e8` (the published spawn foundation).

## Implemented

- Generated typed `_task` / `_retrieve` handles, context-aware canonical Wait,
  external Wait and explicit administrative canonical CancelTask. Handles retain
  the canonical ID/schema/destination, not an old attempt; Clone/Drop do not
  submit or cancel tasks.
- Canonical cancellation of running non-cursor workflows and future workflows
  through actual synchronous C++ CompleteTask CAS. Only ACK notifies the original
  supervised body. Healthy concurrent Wait stays pending; lost/dropped ACK
  atomically publishes uncertainty and clears the temporary fence under Wait's
  publication mutex. A validated durable child cancellation can be caught and
  followed by one durable parent continuation, including retained replay.
- Nonnegative `_task_after` / `_spawn_after` scheduling, with a distinct
  experimental SpawnAfter capability RPC. First target admission atomically
  retains the original absolute timestamp; replay does not recompute the clock.
  Existing absolute-spawn key domains and encoded requests are unchanged.
- Failed framework operations fence subsequent workflow helper admission, not
  merely eventual finish. A canonical-looking rich RPC CANCELLED does not grant
  permission to commit a parent continuation.

Contracts and limits: [TASK-LIFECYCLE-MAP.md](../../TASK-LIFECYCLE-MAP.md).

## Executed qualification

The final owner completed a package-scoped Rust artifact clean, locked offline
all-target tests, strict SDK Clippy, strict generated-fixture Clippy, fixture
build, and both explicitly enabled native gates. The native executable was
**reused and hash-pinned; no fresh C++ build is attested**.

| Gate | Actual result |
|---|---|
| SDK library | 849 passed, 0 failed, 7 ignored |
| Generated downstream consumer suite | 55 passed, 0 failed |
| Strict SDK and generated workflow-fixture Clippy | Passed with `-D warnings` |
| Canonical Python-generated Tasks wire / real C++ Database | 19 scenarios; 658 original-parent child waits |
| Spawn regression / real C++ Database | 16 scenarios; 408 original-parent child waits |
| Negative controls | Four native source mutants rejected; one held-publication-lock unit mutant rejected |
| Actual native-parent failure and SIGTERM cleanup | Both rejected as intended, original children joined |

The all-target run reported **169 ignored entries**. The two new/relevant native
wrappers were then explicitly executed; other ignored gates were not
requalified. There is no full-SDK or full-Python parity claim.

The final native drivers use two generated Rust application services and two
actual C++ Database/RocksDB processes. Canonical Python Tasks stubs are generated
from the real schemas. Cases cover success/declared errors, correct-child
CancelTask, admin and Wait revocation, catch/continuation/replay, retained effects,
a completion race, malformed terminals/rich RPC errors, retained native restarts,
relative scheduling/concurrency, and actual lost completion/admission/source
Started/source Stored ACKs. All 1,066 final native child launches were waited by
their original finite parents. Original remote owner joins and exact terminal
systemd readback are retained; no owned native processes remained at packaging.
The preceding spawn owner's original 397 waits were independently read back and
its retirement preceded this batch.

A late source review repaired the ACK-publication transition and healthy pending
Wait behavior. An initial contention-fixture failure was retained; the corrected
startup handshake, diagnostic evidence, and final RED/GREEN result are separate.
The four native controls have identical final runtime/native inputs, with only
that non-native unit-fixture follow-up; the refreshed unit control differs from
the final source only at its intended mutex mutation. Exact mutant bytes and all
input hashes are retained, rather than hash-only RED descriptions.

## Retained artifacts

- [Machine qualification](workflow-task-lifecycle-20261020.json)
- [Final 379-input manifest](workflow-task-lifecycle-20261020-source-inputs.json)
- [Raw archive](workflow-task-lifecycle-20261020-raw.tar.gz)
- [Archive receipt](workflow-task-lifecycle-20261020-archive.json)

Source-manifest SHA256:
`0baf707d1c52abe669e2e367c8f285806e44e6ca283e967bb9df65f09c3833ad`

Raw archive SHA256:
`b7113dfb898067e4cf24a060e0b87d76172ab1c658e0cc74ff35b1249a00e326`

The 4,705,129-byte archive contains 5,342 files. Every member hash was independently
verified offhost. It retains original ledgers/waits/logs, actual protobufs,
original/mutated wire bytes, exact source objects, five qualified source mutants, preliminary
failures and final source/contract pins. It excludes RocksDB directories, Cargo
caches, temporary compile trees and large binaries; exact task/receipt snapshots
and executable hashes are retained.

Rust fixture SHA256:
`85a2c214a4bb78279ea6cd54d51c305ccbbf992f95fadd9a3998d487c644b42d`

Reused native Database SHA256:
`619002c569e9841144a8bbedf4f2ce6a753bb0e6b103af71883d91d43f413803`

## Remaining boundaries

Spawn admission remains Rust-only: canonical Python Tasks has no Spawn RPC.
This does not implement transaction scheduling integration, arbitrary reader/writer
task targets, cursor lifecycle/receipt GC, dynamic placement or cascading parent
cancellation. Relative schedules use the target-admission clock and reject
negative delays; that is not Python caller-clock/timedelta equivalence.
Administrative status timing is synchronous terminal ACK then NOT_FOUND, not
Python's asynchronous CANCELLING behavior. Raw admin statuses are not journaled
workflow decisions. Native Python **wire clients** were exercised, not a
Python-hosted application or full middleware equivalence.

Only the existing authorized CCX43 was used. No VM, install, registry or deployment
was created; no heavy local Cargo build ran. Its existing expiry was not extended.
Historical proof archives and the closed benchmark were not rewritten.
