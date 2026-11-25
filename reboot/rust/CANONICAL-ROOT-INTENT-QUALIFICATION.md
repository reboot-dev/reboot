# Canonical original-root intent: bounded implementation checkpoint

Base: `e7abd42a20d64631e1170a1864f75e7fb9654713` (published PR216).
Runtime candidate: `b2771aed29fd28bc5e3ed3122e10c63f10cd9ffe`.
Predecessor runtime: `dd2cab9a02dbafb1c4bd2882032479c25ac513e9`.
Local branch: `work/rust-original-root-intent-20261021`. No push.

## Implemented, deliberately opt-in

Generated mixed and transaction-only adapters expose
`with_durable_canonical_root_attempts()`. This configures the existing exclusive
root-star mode; it does not enable arbitrary trees, shared/factory transactions,
placement ownership or running cancellation.

The target persists a separate domain-separated intent mutation under original
actor admission, after current-state policy and terminal-receipt replay, before
handler entry. It binds the source workflow UUID/iteration, target actor,
method/request fingerprint, ordered declared-error URLs and original host root
UUID. Source Started remains the original call/receipt journal, not root identity.
Replay selects the saved root, rechecks binding under admission and never replaces
a persisted root because a new factory value is available.

The actual generated network unary path persists bounded, sorted method/target
membership before sending a remote request. A lost intent Store ACK cannot dispatch
that request. Dropped/failed remote attempts cannot reexecute the root handler on
restart merely because no successful child trailers arrived. Cached successful
terminal replay retires only its clean, exact-incarnation admission without issuing
an Abort against the original immutable Commit.

Intent is **not** a response receipt, native decision or Task terminal. Target
response, source Stored acknowledgement and terminal CompleteTask CAS remain
separate. No receipt/Abort response is synthesized.

## Exact remaining limits — publication HOLD

This is a foundation checkpoint, **not completion of the requested major parity
slice**. It does not yet install an automatic host startup recovery owner for the
new intent records, resolve unknown remote membership to a terminal decision, or
bridge authoritative Abort into the source's allowed terminal schema. Unresolved
remote intent remains failed-closed Pending. The existing native participant/Watch
owners are unchanged. Do not describe this as eventual unknown-child convergence.

The bounded helper now explicitly refuses every nonzero host timestamp (including
nanos-only values) with FailedPrecondition before actor admission, intent Store or
handler entry. It does not silently replace the host timestamp. Only admission
through the checked helper can install a verified-zero intent. New records bind
that fact in protobuf tag 6; unversioned legacy records fail closed without a new
factory call or overwrite, since their original timestamps cannot be determined.
This is an explicit compatibility fence, not a migration or general timestamp
preservation claim. Nonzero host timestamp/restart-detection contracts remain
unsupported. Retention/GC of the new intent records is also not implemented. The
capability remains opt-in for these reasons.

## Native qualification and causal controls

The proof uses actual generated Python public spawn/typed Wait, canonical placement,
two application host processes and two independent native Database/RocksDB processes.
New cases cover a root-bound pre-handler crash/restart with exact original UUID;
a membership-ACK/pre-network crash with no child effect and no handler reentry;
and child successful-ACK loss followed by database/application restart, retained
original membership/UUID and failed-closed replay. Positive controls include ordinary
success, source-after-target-ACK restart and lost target response replay.

Two exact one-file controls use the final fixture topology frozen at `be968379`:

* Ignore the saved-root lookup: restart overwrites the durable intent with a different
  root UUID. Both wrong original/recovered native readbacks are retained.
* Omit membership Store: the pre-network marker is reached while the real durable
  intent has no required child. The raw wrong durable readback is retained.

The later replay-cleanup fix changes runtime/generator bytes, not fixture topology.
Controls must be labelled by their actual `be968379` runtime, not represented as
`dd2cab9a` or `b2771aed` builds. Restored candidate qualification is separately recorded.

All attempts retain source manifests, emitted bindings, executable bytes, native
storage, failures and original child waits. Historical failures include a missing
guard delegate, strict SDK/generated lint failures, accidental factory-bootstrap
opt-in, an unrelated ephemeral port Bind collision, original-ID cached replay's
contradictory Abort, and the resulting factory-emitter assertion regression. None
is relabelled a pass or removed.

## Evidence and custody

Authorized validator only: `root@2.29.27.53`, server `171072439`, expiry unchanged
`2026-10-21T18:46:13Z`. No install, deployment, extra capacity, push, heavy local
Cargo or historical deletion occurred. Existing native Database executable is reused;
this is not a fresh C++ build attestation.

Remote evidence:
`/home/benchbuild/.cache/original-root-intent-20261021-evidence/`.
Predecessor frozen source:
`/home/benchbuild/.cache/original-root-intent-20261021-src/`.
Timestamp-repaired frozen source:
`/home/benchbuild/.cache/original-root-intent-20261021-timestamp-src/`.
Independent Git-object comparison on the offhost destination verified all 494 frozen
input hashes against `b2771aed` before archival.

Each new owner uses fresh original-parent/child retirement checks, the same four
exclusive locks, `CARGO_INCREMENTAL=0`, locked/offline Cargo and jobs=2. Admission
reserves the entire earlier 28,500,930,560-byte complete budget plus the strict
8,589,934,592-byte live free-space floor. Initial fresh available space was
78,047,416,320 bytes; existing target allocation was 72,482,983,936 bytes. Source
copies and later measured growth are retained in `budget.json` and owner ledgers.

`final6` qualified 4 focused cases per mixed/pure adapter (8 executions).
`regression9` completed the unchanged 14-case mixed and 14-case pure matrices and
unchanged seven-case legacy matrix, then failed the newly added opted-in cached
replay probe. These receipts belong to the earlier candidate, not the final fix.
`final11` completed successfully for `dd2cab9a`: its original parent waited owner
2367291 with exit 0; the transferred local SSH process also exited 0. Independent
postflight observed all original children absent and all four locks available
before any new build (14 owners, 14 parents, 16 native drivers, 1,497 unique PIDs).

`timestamp12` qualifies runtime `b2771aed`: SDK all-targets, strict SDK Clippy,
doctests, both generated consumers' build/all-target tests/strict Clippy and six
opted native cases per mixed/pure adapter all returned 0. SDK logs contain 994
passing test executions and 175 ignored (including nested consumer executions;
not 994 unique scenarios). All eight root-intent unit tests passed, including
three added tests for nonzero seconds/nanos/negative seconds refusal, unversioned
intent refusal without replacement identity/write, and arbitrary-context bypass
refusal. The native matrix is 12 positive executions of six scenarios, not twelve
unique scenarios. Original parent 2384002 waited owner 2384003, exit 0; local SSH
exit 0 was separately collected. Postflight observed 15 owners, 15 parents, 18
drivers and 1,718 unique PIDs absent, four locks available, and 50,246,320,128 bytes
free before admitting the subsequent native-only regression batch.

`regression13` successfully reran the unchanged mixed/pure 14-case and seven-case
legacy matrices against retained `timestamp12` executable bytes: 35 case executions,
all driver receipts complete, all three owner children exit 0. This makes 47 native
case executions on the timestamp-repaired runtime (12 opted + 35 regression), not
47 unique scenarios. Parent 2400335 waited owner 2400336 with exit 0, and the local
SSH exit 0 was separately collected. Final postflight verified 16 owners, 16 parents,
21 native drivers and 2,363 unique PIDs absent, four locks available and
44,753,588,224 bytes free before the separately owned archive job. Prior failures
and the two historical causal REDs remain retained and are not called current-runtime
negative controls.

The original archive parent 2422239 reached its own 600-second deadline, terminated
and waited child 2422240 (exit -15), and wrote `complete=false` at
`2026-10-21T06:09:51.880192Z`. Both PIDs were independently absent before retry.
Its receipt and partial archive are preserved, not relabelled successful. A new
bounded parent used lossless xz preset 0 / 64 MiB dictionary with an 1,800-second
child deadline. Parent 2423203 waited child 2423205 with exit 0 at
`2026-10-21T06:14:25.030511Z`; both were independently absent afterward.

The full archive is **804,033,484 bytes**, containing **8,623 members** and 4,143
unique full-byte objects. SHA-256:
`8ca98a121ca976c0e1a5e2ce38d4d363e76e6a99c90092fb8c30acefce14777e`.
The manifest SHA-256 is
`539c7c70ca534ddc16d77ab343b77c6e0b6cb9ab1cb41f9aa6a1749adfb8b107`.

Full bytes, manifest, both archive-parent receipts, source Git objects and verifier
are retained offhost through authorized alias `omarchy-jean` at
`/home/ladin/.cache/original-root-intent-20261021-retained/`.
The finite diskless transfer joined both SSH children with exit 0; destination
bytes and hash matched, followed by an independent full archive read there.
No large archive was copied onto the space-constrained local filesystem.

The verifier succeeded against actual archive bytes and `source.git`, checking
all member sizes/hashes/modes and hard links, all 494 current Git input objects,
retained generated binding objects and exact mixed/pure executable hashes, native
Database bytes, RocksDB CURRENT/MANIFEST files, raw case receipts, child waits,
owner log hashes, historical one-file mutation scope and unchanged fixture inputs.
It also requires all eight current root-intent unit tests, including the nonzero
host timestamp, unversioned intent and arbitrary-context refusal assertions.
The two causal REDs remain historical; zero final-runtime causal REDs are claimed.

To repeat the read-only verification on the retention host:

```sh
cd /home/ladin/.cache/original-root-intent-20261021-retained
python3 verify_canonical_root_intent_archive.py \
  original-root-intent-20261021-proof.tar.xz \
  original-root-intent-20261021-proof.manifest.json source.git timestamp12
```

Independent parent source review is still required before publication. Full-byte
retention and successful bounded gates do not remove the implementation limits
above or complete the major parity slice. No push or evidence deletion occurred.

## Additive FINAL-runtime causal qualification (reviewer `c30e4d6f` P1)

The historical `be968379` REDs above remain valid historical evidence only. Their
runtime predates the tag-6 verified-zero timestamp/legacy refusal fence and cached
replay fix. The additive qualification reruns both exact one-file mutants against
`b2771aed29fd28bc5e3ed3122e10c63f10cd9ffe`, with unchanged final fixture assertions
and fresh final-format intents. Independent Git-object comparisons bind all 494
runtime/fixture inputs to both that runtime and reviewed HEAD
`e8fdf8d2eb35903a4516f84ab597dd5b0aef01fe`.

* `final-red-root14`: replace the unique `Ok(found)` with `Ok(None)` in
  `canonical_root_attempt.rs`. Actual generated mixed executable/native RocksDB
  restart persisted original UUID `22def711-7757-4620-9b24-0a256e7bcdba`, then wrong
  replacement `1e060de5-0e6d-4292-8a22-1c6c2a72730b`. The unchanged assertion failed
  with `recovery replaced original root UUID`; both durable snapshots are retained.
* `final-red-member15`: omit only the unique membership
  `self.persist(&record).await?`. The pre-network marker was reached with a fresh
  verified-zero durable root intent containing **zero** members, both durable
  actor values still zero, one root handler entry and no child handler entry.
  The unchanged required-membership assertion failed on the actual native readback.

Neither RED is a timeout, mocked result or historical-runtime aggregation. The
additive verifier independently decodes the raw persisted protobuf, including
mandatory tag 6 = true, and checks exact mutation scope, generated bindings,
executable hashes, Database bytes and retained RocksDB CURRENT/MANIFEST files.

After each mutant, exact original source bytes were restored. `final-restored16`
rebuilt both generated adapters and passed all **six mixed + six pure** opted-in
cases: root-binding restart, remote-intent restart, success, child-ACK loss,
source-after-target-ACK restart and lost target response. The rebuilt mixed/pure
SHA-256 values are respectively
`6ed0b15d8d99b8156b037e79e85d604230a2cbd42ef1bce5ab0ea9bd0b50a017` and
`89bfd76b012e1b82ec5e4badd44c825ef08516a7ad2b5cc6af299822918eaa31`.

The first restored regression matrix is retained as **failed**, not a pass:
`receipt-ack-loss` returned gRPC CANCELLED/`Timeout expired` where the unchanged
fixture requires DEADLINE_EXCEEDED; nine preceding completed cases are not counted
in the successful matrix. Parent 2426050 waited owner 2426051, exit 1. Two further
admission-only attempts are also retained: `final-regression17` rejected a lock
held by its in-parent postflight checker; `final-regression18` rejected reserving
the entire original build budget again after the build phase. Neither launched
build/native children; no child waits were fabricated for their empty ledgers.

A fresh, separately owned native-only `final-regression19` reran the **entire**
unchanged 14 mixed + 14 pure + seven legacy matrices on those same restored
executables, with all 35 cases passing. Parent 2440242 waited owner 2440243 with
exit 0; the local original SSH process separately exited 0. This additive set
therefore contains **two final-runtime causal REDs and 47 successful restored
native case executions** (12 focused + 35 regression), not 47 unique scenarios.
No earlier `timestamp12`/`regression13` execution is counted in that total.

Fresh retirement and four-lock checks preceded every admitted owner. Whole-batch
admission observed 43,841,560,576 bytes free and retained the original
28,500,930,560-byte growth ceiling plus 8,589,934,592-byte floor, incremental=0,
locked/offline Cargo and jobs=2. Native-only readmission reserved twice the measured
5,482,995,712-byte prior complete native matrix plus 4 GiB for the additive archive,
within the original whole-batch ceiling. Final native postflight observed 21 owner
receipts, 22 original parents, 29 native drivers and 3,431 unique PIDs absent,
all four locks free, 31,187,185,664 bytes available and unchanged target allocation.
The failed fresh source-copy attempt is retained; only its unwanted 276,922,368-byte
task-owned copy was removed before recopying with symlinks preserved. No prior proof
or active dependency was removed.

Additive full-byte evidence is retained on `omarchy-jean` under
`/home/ladin/.cache/original-root-intent-20261021-retained/final-causal-20261021/`:

* `original-root-intent-20261021-final-causal-proof.tar.xz`: **390,833,016 bytes**,
  **7,440 members**, SHA-256
  `438e929548899a961989406dad9615dd670786a9433dcf95a4023cdcf6a5e843`.
* Manifest SHA-256:
  `b960d6394b4f656cc977353ce4d0c00c7bfeee4aed0418892c15d0bc4909aa8e`.
* Full frozen source tree (including preserved source symlinks), both mutant source
  objects, emitted generated bindings, four exact application executables, native
  Database executable, real RocksDB directories, raw failed/successful receipts,
  original-parent waits, budgets, driver/owner logs and source Git bindings.

Archive parent 2462251 waited child 2462252, exit 0. The diskless transfer's original
local parent waited both SSH children with exit 0 and retained its receipt. No large
archive was copied locally. Independent offhost verifier parent 3028965 waited child
3028966, exit 0, and retained `verified-final-causal.json`, its log and parent receipt.
It read and checked every archive member and both Git source revisions, independently
confirmed the two final-runtime wrong-state REDs and exact 12 + 35 GREEN counts,
and rehashed the prior immutable archive to its unchanged original SHA-256.
Both pack and verification parents/children were independently absent afterward;
final source remained restored, all four native-host locks were free, with
30,798,233,600 bytes available there and 415,573,176,320 bytes on the retention host.

Read-only repeat verification (the original historical verifier remains unchanged):

```sh
cd /home/ladin/.cache/original-root-intent-20261021-retained/final-causal-20261021
python3 verify_final_canonical_root_intent_archive.py \
  original-root-intent-20261021-final-causal-proof.tar.xz \
  original-root-intent-20261021-final-causal-proof.manifest.json ../source.git
```

The P1 causal-proof gap is qualified by these new controls; **publication remains
HOLD** pending independent parent rereview and the unchanged opt-in limits above.
No runtime feature, fixture assertion, timestamp support, startup owner, Abort/Task
bridge, unknown-Pending convergence or GC capability was added. No push occurred.
