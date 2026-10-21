# Canonical original-root intent: bounded implementation checkpoint

Base: `e7abd42a20d64631e1170a1864f75e7fb9654713` (published PR216).
Runtime candidate: `dd2cab9a02dbafb1c4bd2882032479c25ac513e9`.
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

The restored-root helper currently uses the legacy zero timestamp on recovery;
the native fixture's factory explicitly supplies that same zero timestamp. General
nonzero host timestamp/restart-detection contracts have NOT been qualified or
preserved by this record format and require correction or explicit refusal before
broad production enablement. Retention/GC of the new intent records is also not
implemented. The capability remains opt-in for these reasons.

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
`dd2cab9a` builds. Restored candidate qualification is separately recorded.

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
Frozen source:
`/home/benchbuild/.cache/original-root-intent-20261021-src/`.

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
`final11` is the finite candidate qualification gate for `dd2cab9a`; consult its
actual owner/parent receipt before claiming final candidate acceptance.

Prepared local archival/verification tooling lives under
`/home/openclaw/.hermes/profiles/jean/cache/scratch/original_root_{pack,postflight}.py`
and `tests/fixtures/workflow_app/verify_canonical_root_intent_archive.py`.
An archive is not claimed verified merely because those scripts exist. Keep active
original custody until its real terminal wait; independently verify the final
archive before deleting any task-owned evidence or publishing this chain.
