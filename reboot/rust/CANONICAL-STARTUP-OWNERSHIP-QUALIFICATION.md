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

**Retention and full-archive verification gates CLOSED. Publication remains held
only for independent parent review of the entire `11c5d309` → final local HEAD
implementation/evidence chain. No push or next-feature work was performed.**

The original archive parent **2547852** waited child **2547853**, exit **0**;
`proc_cf0866dd816a` collected the original SSH exit **0**. Both remote PIDs were
then observed absent. The completed lossless archive is **1,002,551,616 bytes**,
**9,806 members**, **6,247 unique full-byte objects**, SHA-256:
`af82cc8ab1f87755d5c69a62d8f118d8a081cd1b3c2165998a24e6838ba5a8a4`.

Diskless transfer to the authorized Omarchy destination waited both original SSH
children with exit **0** and independently matched destination bytes and SHA-256.
The original archived verifier passed the entire actual archive. An additive
verifier then explicitly checked all seven generated binding inventories,
reference **2**, doctests **8**, both consumer build/test gates, and reconstructed
the **1,680-PID**, ten-owner/ten-parent/21-driver postflight ledger and four-lock
observation. Full-byte/Git/native/causal checks still passed: **501** Git inputs,
**2** final REDs, **61** positive executions, **1,096** joins, SDK **996** passed /
**175** ignored. No native workloads were rerun.

One additive inspector attempt incorrectly expected executable permissions on
content-addressed `write_bytes` object copies. Its exact failed verifier, stderr,
parent wait **1** and original SSH failure remain retained unchanged. The capture
contract preserves executable mode on the separate `copy2` application, not its
object duplicate. The corrected verifier checked that contract against unchanged
archive bytes and passed under original finite parent **3043585**, child
**3043586**, child wait **0**, SSH wait **0**; both PIDs were observed absent.
The corrected verifier SHA-256 is
`f47deac2405961bc0d7f463ea49e7717aa34e4d904565b76d339b8023d7d4b24`.
Actual receipts are retained in
`tests/evidence/canonical-startup-owner-retention-20261021.json`; original and
failed verification files remain beside the archive. Reproduce the final pass:

```sh
cd /home/ladin/.cache/canonical-startup-owner-20261021-retained
python3 verify_canonical_startup_archive_full2.py proof.tar.xz manifest.json source.git
```

Fresh validator observation at `2026-10-21T08:31:11.513946+00:00` verified the
unchanged **501** frozen source inputs, **1,680** absent PIDs, four available locks
and **15,432,683,520** available bytes. This later absence observation is distinct
from the retained actual original wait receipts. No extra cleanup was necessary.

Prior immutable archives were rehashed unchanged against their original manifests:

| Archive | Bytes | SHA-256 |
| --- | ---: | --- |
| `remote-authority-recovery-20261021.tar.gz` | 618,045,372 | `9ca6647845053424b091f9f2bc5cdcbc2ed554435e57564920131f393148f75a` |
| `original-root-intent-20261021-proof.tar.xz` | 804,033,484 | `8ca98a121ca976c0e1a5e2ce38d4d363e76e6a99c90092fb8c30acefce14777e` |
| `original-root-intent-20261021-final-causal-proof.tar.xz` | 390,833,016 | `438e929548899a961989406dad9615dd670786a9433dcf95a4023cdcf6a5e843` |

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
