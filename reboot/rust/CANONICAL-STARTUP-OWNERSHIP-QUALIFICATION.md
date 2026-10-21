# Canonical original-root startup ownership: bounded checkpoint

Published base: `11c5d30957e995ab8e48c31a86ea83695c556aa9` (PR216).
Tested implementation/fixture revision: `4e4bb8e33f62cfbead226a0484753c0576fb1110`.
Runtime implementation first committed in `593db19b`; subsequent commits refine proof only.
No push. Independent parent review is required before publication.

## Runtime behavior

`LegacyDurableRecovery::with_canonical_root_attempt_recovery()` is a separate,
deliberately opt-in host registration. It uses the original injected participant,
its actual exclusive actor admission, the existing coordinator/resolver and the
same normalized Database endpoint. It is not a request-controlled UUID recovery
API, replacement owner factory, actor catalog or readiness setter.

After ordinary native participant/coordinator recovery, the owner scans bounded
intent mutations for that exact actor. New intent records additionally bind the
original receipt key (tag 7), permitting reconstruction of the domain-separated
UUID-v5 mutation key and request fingerprint. It validates the original workflow,
iteration, UUID, zero-timestamp certification, ordered error schema and sorted
method/target membership. It rechecks the complete binding under original actor
admission before acknowledging the durable recovery claim (tag 8).

Unknown authority remains **owned Pending**. The actual original participant
lease blocks public writers and original target reentry, including the source
journal's earlier actor admission. A marker beyond that admission need not become
reachable. Cancellation/drop disarms speculative Abort and retains the exact
participant slot/lease; it never releases unknown ownership into queued RPCs.

The supervised owner consults **only** native immutable DecisionGet for the saved
original root UUID and coordinator. It never issues DecisionPut or interprets
absence/transport failure as Abort. A validated existing native Abort authorizes
exact-root Abort delivery to the persisted remote targets. Only acknowledged
member delivery permits the separate durable retirement flag (tag 9) and clean
local admission release. Repeated restart preserves the original root and
retirement. A known Commit without its actual saved response remains Pending;
a validated existing receipt is left to the generated authorization/replay path.

No response/error receipt, source Stored acknowledgement or terminal Task CAS is
synthesized. An authoritative native Abort is **not** a source Task terminal.

## Actual Python/C++ mapping

* `reboot/aio/state_managers.py:6828-6958`: canonical Recover, original participant
  reconstruction, original actor exclusive acquisition, supervised Watch and
  coordinator replay are separate ownership/control boundaries.
* `reboot/server/database.cc:3764-3844`: the native immutable decision uses the
  original root UUID plus coordinator reference; absent DecisionGet returns an
  empty response, not Abort. RocksDB GetForUpdate prevents contradictory outcomes.
* Existing Rust participant/native recovery restores only actual native records.
  Predispatch intent is an idempotent mutation, not an extant prepared participant.
  The new startup owner explicitly reacquires the original participant allocation
  rather than assuming that native Recover enumerates these intent records.
* Child ACK loss can already have a genuine immutable Abort published by the
  original live owner. The new proof records that native authority **before**
  restart; neither the test nor startup recovery fabricates it.

## Qualification and current publication gate

The frozen final source contains 501 Git-bound Rust/schema/Cargo/Python inputs.
Actual generated Python public RPCs run against mixed and transaction-only Rust
adapters, two application processes and two native C++ Database/RocksDB processes.
The Database executable is reused, SHA-256
`619002c569e9841144a8bbedf4f2ce6a753bb0e6b103af71883d91d43f413803`;
this is not a fresh C++ build attestation.

Final-runtime causal controls use unchanged final fixture assertions and fresh
final-format native records:

1. Release the startup admission after its claim Store. The actual public writer
   escapes and both durable actor values become **1/1**, failing the precise
   `startup ownership let normal writer escape` assertion.
2. Omit only the startup claim Store. The actual native intent retains verified
   zero timestamp and receipt key but no durable claim, failing the precise
   `startup recovery claim missing from durable intent` assertion.

Both original parents waited their owners with exit 0; both native drivers exited
1 at the required wrong-durable-state assertions. Exact mutant bytes, old/new
mutation, generated bindings, application bytes, real native storage and waits are
retained. Fixed source bytes were restored before rebuilding both adapters and
rerunning affected qualification.

The restored SDK all-targets, strict SDK Clippy, doctests, both generated consumer
build/tests/strict Clippy passed. SDK logs contain **996 passing executions and
175 ignored**, including nested consumer execution, not 996 unique scenarios.
The complete final native qualification passed unchanged: `restored8` supplies
four mixed startup and six mixed foundation cases; `restored10` supplies four
pure startup, six pure foundation, the complete 14 mixed + 14 pure + seven legacy
matrices, and three opted-in typed Commit/replay cases per adapter. This is
**55 matrix executions plus six additional opted Commit/replay executions = 61
positive executions**, with **1,096 original driver-child joins**. Counts are
execution totals, not unique scenarios. The two causal REDs and preliminary
repeated attempts are not added to that positive count. Reference verification
also passed its two tests.
`restored8` is retained as failed on pure fixture `AddrInUse`; `restored9` is
retained as failed because framework `CANCELLED / Timeout expired` did not meet the
strict `DEADLINE_EXCEEDED` oracle. Neither failure is waived or relabelled a pass.
Earlier compiler/default-header and proof-seam/classification mistakes are also
retained, with actual original child waits.

All remaining matrices were rerun completely without changing source, oracle or
assertions. The original `restored10` parent waited its owner with exit 0, and the
local original SSH wait also returned 0. Fresh postflight checked ten owners, ten
parents, 21 drivers and 1,680 unique PIDs absent, all four locks available, and
16,439,083,008 bytes free. Exact receipts and per-gate executable hashes are indexed
in `tests/evidence/canonical-startup-owner-20261021.json`.

**Publication HOLD: the additive full-byte archive is active; offhost transfer,
complete independent archive verification, and parent source review remain.**
The native matrices are complete; the archive verifier has only had its raw
protobuf/key decoder exercised against the two actual RED readbacks so far. Do
not call the full archive verified before its actual complete execution.

At custody transfer, archive parent **2547852** owns child **2547853** under the
original 600-second child deadline. Local custodian handle: `proc_cf0866dd816a`.
The parent agent must collect the real archive/SSH waits, then use the retained
diskless transfer script and run `verify_canonical_startup_archive.py` against
actual archive bytes, manifest and the already-retained source Git repository.
Never terminate or detach this work merely because this implementation delegate
has reached its checkpoint budget.

## Evidence handles and resource custody

* Validator: exact authorized CCX43 `root@2.29.27.53`, server `171072439`.
* Unchanged expiry: **2026-10-21T18:46:13Z**; no extension, installation,
  deployment or new capacity.
* Frozen source: `/home/benchbuild/.cache/canonical-startup-owner-20261021-src5`.
* Evidence: `/home/benchbuild/.cache/canonical-startup-owner-20261021-evidence`.
* Authorized retention destination:
  `omarchy-jean:/home/ladin/.cache/canonical-startup-owner-20261021-retained/`.
  Its separate bare source Git repository already resolves the exact tested
  revision; the incremental bundle's SHA-256 is
  `fa9a7947a3b54ae17bf0381c52da71627a7701dd7f5ed7d9fd38f5900cd2ad4b`.
* Each finite original parent waits its original owner; owners wait every child,
  hold the same four cache locks, use locked/offline Cargo, jobs=2 and incremental=0.
  Original whole-batch growth/target ceiling is 28,500,930,560 bytes, with a strict
  8,589,934,592-byte live floor and consumed growth subtracted on readmission.
* User-authorized exact-host cleanup removed only 1,438 freshly hash-verified,
  offhost-duplicated RocksDB files after complete prior-archive verification,
  original retirement checks, four locks and fd/maps checks. Actual recovered
  capacity was 9,211,801,600 bytes. Executables, active dependencies, dirty source,
  credentials, receipts and immutable prior archives were preserved.
* No heavy local Cargo or large archive on the parent filesystem.

## Deliberate limits

This is a substantial startup ownership/known-native-Abort retirement checkpoint,
not full Rust/Python parity. Unknown membership still needs legitimate native
outcome authority; it does not automatically become Abort. The Abort-to-source-
Task typed terminal bridge, nonzero host timestamps, legacy tag-7 migration,
intent retention/GC, arbitrary shared/factory trees, placement ownership and
running transaction cancellation remain unsupported. Legacy intents without a
startup receipt binding are refused by this opt-in owner rather than rewritten
with guessed identity or timestamps.
