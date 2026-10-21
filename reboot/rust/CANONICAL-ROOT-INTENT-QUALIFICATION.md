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
