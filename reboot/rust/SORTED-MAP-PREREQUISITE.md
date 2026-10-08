# Canonical SortedMap — bounded same-host library

Loop29 adds a usable generated canonical constructor and typed admitted app-to-map session. This is **not network inbound child/reusable sibling or distributed collection parity**. The loop5 prerequisite below remains historical evidence for low-level early native ownership and restart fences.

## Public generated API and exercised boundary

Generate `rbt/std/collections/v1/sorted_map.proto` with `module=reboot::sorted_map_proto,runtime_module=reboot`. The exact compiled canonical typed schema AND raw Reboot option descriptor are checked. Only a fixed builtin wrapper is emitted; arbitrary trusted-effects user descriptors still fail closed, and no generic user handler/effect adapter is produced for the builtin.

- `sorted_map::SortedMapLibrary::new(store)` is a host-owned registration at the exact native endpoint; there is no public-header-authorized network map service.
- Generated `SortedMap::create(&library, canonical_ref, idempotency_key)` creates EMPTY state using native unique `CreateActor` and durable constructor replay. A schema-only Store ensures the canonical entry CF BEFORE CreateActor, so an empty map is readable. This Store contains **no actor or entry upsert**, and is not fixture initialization. The actor commit gate records uncertainty before either await. Schema creation is idempotent global metadata, not transactional map data.
- Register the constructor handle's `participant()` in the existing coordinator routes, then call generated `map.in_transaction(context)` inside a real app root handler. The returned session exposes typed `insert/remove/get/range/reverse_range`, sharing one direct fresh root map participant.
- Only a live admitted registered app root with active explicit Abort/cancellation ownership grants private in-process builtin provenance. It is endpoint-bound, rechecked after admission and on every call, and revoked when the root guard drops. Public `internal_call` and transaction headers, manual contexts and inactive owner flags do not grant it.
- An application may catch a declared map range error, but the session dooms the root: app and map abort together. Native possible-start/uncertainty, lost Store ACK, no-restage Prepare, task/reader/transaction/recovery fences remain intact.

Actual mixed generated fixture uses the generated canonical constructor (no map actor seed), verifies empty CF/replay/duplicate rejection, calls Range FIRST then typed map mutations/read-own-writes, atomically commits app/map through the native coordinator, catches declared InvalidRangeError and proves both abort, and rejects stale root provenance. Real proof uses CXX Database/RocksDB; final manifests use `/tmp/reboot-rust-sortedmap-loop29-*`.

**Lifecycle contract:** sessions and all call futures must remain serial and handler-awaited; do not escape them or spawn detached calls. The stale-root proof checks calls AFTER RPC completion, not an overlapping cancellation/lifetime race. There is no active root operation reservation across await. Constructor crash/lost-ACK/restart replay is not established by the constructor proof; existing map Store lost-ACK recovery proof is a separate boundary. Aggregate membership shares the ordinary 1024-participant bound, checked atomically before eager Store; excess dooms root while retaining known membership for cleanup.

**Limitations:** explicit host constructor, not implicit Python singleton/network constructor; no public Tonic inbound map adapter, `[root,child]` paths, independent serial sibling reuse, inbound receipt/replay authority, nested savepoints, shared/factory/tasks/map root idempotency, transparent native-only restart, placement/migration/cloud/package parity. App roots must have no automatic idempotency header in this bounded cancellation-owned slice. Keys exclude slash; caller-specified range bounds remain canonical and declared errors retain canonical wire strings. Do not generalize direct typed serial calls into inbound sibling parity.

## Historical loop5 prerequisite

Loop5 implements and exercises an **early-native-visibility prerequisite**, not a completed generated canonical SortedMap library.

The canonical SortedMap protobuf is generated into `sorted_map_proto`, including typed canonical Tonic bindings. An admitted `StartedLocalTransaction` for an existing EMPTY canonical SortedMap actor exposes typed Insert/Remove/Get/Range/ReverseRange. Entries use the native canonical entry CF and StateRef child codec, never a persisted BTreeMap facade. Range-first performs transactional Store before native Range; writes and scans retain one exclusive participant lease and native transaction.

Before the first Store await, Pending records both possible native start and uncertain outcome. Cancellation/lost ACK cannot release through `drop_undurable`; uncertain Store also prohibits live Abort/Prepare because dropping a client future does not prove remote completion. Reset the failed host and native sidecar, restore participant ownership and abort the recovered unprepared root. ACKed early participants prepare the existing native transaction with `transaction=None` and no deferred effects: a sidecar restart cannot silently recreate an empty transaction and lose prior writes. A recovered unprepared participant cannot resume through Prepare. Terminal ACK uncertainty retains ownership without retries.

The generated downstream application fixture exercises a genuine generated app constructor and exclusive root handler. The handler enlists a separately admitted map *before native IO*, performs Range-first and map mutations/read-own-writes, and uses the existing coordinator to commit app/map. A handler error uses existing explicit root Abort and restores both. This is direct same-host admitted coupling, not generated map inbound RPC integration. The other native test uses canonical generated map Tonic clients against a fixture-scoped service, and tests native coordinator commit, explicit participant abort, range bounds, missing versus empty values, neighboring parent isolation and unprepared restart recovery.

## Loop5 historical limitations / blockers

* **No public generated map constructor or host-registerable builtin map adapter.** Tests initialize the pre-existing map through native fixture Store; this is setup, never constructor acceptance. The generated app constructor does not construct the map.
* The Reboot generator still rejects canonical `trusted_effects` and arbitrary trusted user states. No blanket exception was introduced. Canonical wire Tonic bindings alone are not Reboot generated target/client/adapter parity.
* No app-internal provenance has been added. The test-scoped canonical Tonic bridge is not a public production service and carries no authorization claim. Python's default app-internal map authorization must remain mandatory when a builtin adapter is added; public headers are not proof of internal authority.
* Generated map inbound methods create `[root, child]` and serial sibling reuse. The prerequisite intentionally rejects nested/reusable/shared/factory/task/mixed-effects admissions. Supporting them requires admission-owned eager execution/Watch, real participant receipts, once-per-call replay and root-dooming caught abort semantics; the existing deferred snapshot rollback must not be reused for native effects.
* Keys containing slash are explicitly rejected because escaping changes ordering; ASCII StateRef-valid nonempty keys only. Forward inclusive-start/exclusive-end and reverse inclusive-start/exclusive-end, nonzero limit, declared InvalidRangeError. No fabricated cursor or cross-RPC snapshot promise. The real native transaction iterator exposed an exclusive reverse end from its staged overlay; the SDK additionally filters the bounded native page by logical bounds.
* Independent native-only restart while keeping a live guard is NOT supported. A later transactional Store can recreate a vanished native transaction; there is no native expected-incarnation/epoch contract here. The exercised restart procedure resets both host ownership and the sidecar, recovers the unprepared record and aborts it. Do not generalize that proof to transparent reconnect/replay.
* Loop5 fresh mixed constructor/reader/transaction strict Clippy exposed 82 emitted-code errors. Loop29 fixes these generator defects without lint suppressions; its fresh/frozen evidence is separate from loop5.
* This is a fresh serial exclusive root/local host prerequisite, not placement/migration/cloud/full collection parity. Map participant routes are explicitly registered by the fixture host, not inferred from map identity.

Run ignored real tests with `REBOOT_NATIVE2PC_CXX_DATABASE` pointing to the real Database binary:

```
cargo test --locked --test sorted_map_native_prerequisite -- --ignored --test-threads=1 --nocapture
```

Generated app fixture: `tests/fixtures/sorted_map_app`; behavioral ownership tests: `src/sorted_map_ownership_tests.rs`. Final source-frozen evidence and earlier failed attempts are listed in `/tmp/reboot-rust-sortedmap-loop5-result.json` and checkpoint. No acceptance claim follows merely from compilation.
