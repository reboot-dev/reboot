# Python → Rust SDK parity map

**Baseline:** `bae3e7c9` (2026-10-05). This is a capability map, not a claim
that similarly named APIs have the same distributed semantics.

## Evidence rules

- **Implemented** means there is an exercised Rust implementation.
- **Partial** means the listed subset exists; absent behavior is not implied.
- **Missing** means no equivalent public/runtime implementation was found.
- **Real-sidecar proof pending** means in-process/unit coverage exists but the
  C++ Database/RocksDB acceptance is currently ignored without
  `REBOOT_NATIVE2PC_CXX_DATABASE`.
- Native2pc is a separate Rust protocol island, not Python legacy-2PC parity.

The baseline Rust suite passed `cargo fmt --check` and locked all-target,
all-feature tests: 151 library tests, 4 codegen/build integration tests, 5
successful-trailer tests, and 5 native transport tests. Eighteen C++ Database
acceptances were skipped because the sidecar binary was not supplied.

## Delivery order

1. Restore end-to-end *legacy* root transaction/application-host wiring and
   real-sidecar CI. This unblocks evidence for existing coordinator/participant
   code; do not broaden Native2pc as a substitute.
2. Finish bounded fresh-local shared promotion with its opaque handler API and
   direct local durable completion.
3. Add typed SDK boundary primitives (StateRef, idempotency policy) only after
   their cross-language vectors are defined.
4. Independently design larger runtimes: tasks/workflows, streaming/reactive
   reads, collections, nested/distributed transactions, HTTP/auth/application
   lifecycle. They are not follow-up flags on the unary adapter.

## Capability matrix

### Schema, protobuf, and generated adapters

| Capability | Python reference | Rust status and reference | Evidence / remaining work |
|---|---|---|---|
| Descriptor-driven schema/generation | `protoc_gen_reboot_generic.py:354-1177`; `protoc_gen_reboot_python.py:112-322` | **Partial.** Explicit DSL and proto emitter: `src/lib.rs:36-251,1083-1447`; bounded compatibility checker starts at `src/lib.rs:1273`. | Rust validates scalar/enum/map/oneof/reservation cases and compiles emitted proto against Reboot options. It lacks Python-equivalent reflected/generated state declarations and a Python↔Rust golden descriptor corpus. |
| Unary reader/writer generated adapters | Python generator method surface: `protoc_gen_reboot_python.py:213-228` | **Implemented, bounded.** `src/codegen.rs:422-583,733-855`; Cargo helper `src/build.rs:30-141`. | Plugin and downstream fixtures execute durable adapters. Same-package, top-level unary shapes only. |
| Transaction generated adapters | `protoc_gen_reboot_python.py:213-228` | **Partial.** `src/codegen.rs:607-730`; `src/durable_participant.rs`; `src/durable_coordinator.rs`. | Exclusive, inbound/shared read-only, factory, and returned-participant paths have fixtures. General nesting, placement-selected roots, and generated local shared promotion are absent. |
| Streaming, workflow, errors, Pydantic-style conversion, broad service forms | `protoc_gen_reboot_python.py:120-322`; boilerplate plugin | **Missing/rejected by design.** Streaming is rejected in `src/codegen.rs`; no workflow/error conversion runtime. | Publish a Rust generator support matrix and add descriptor-corpus accepted/rejected tests before expanding one method kind at a time. |
| Cargo-native generation / protoc plugin | `cli/commands/generate.py:46-105,177-188`; `cli/rust_generate.py:7-21` | **Implemented for current bounded adapter surface.** `src/build.rs`; `src/bin/protoc-gen-reboot_rust.rs`. | Downstream Cargo fixtures pass. CLI requires a prebuilt plugin on PATH and pre-existing Prost/Tonic bindings; it does not build/install it. |

### State, metadata, and external clients

| Capability | Python reference | Rust status and reference | Evidence / remaining work |
|---|---|---|---|
| Reboot header transport | `aio/headers.py:124-255,242-292,346-352,400-509`; `time.py:27-46,74-80`; `aio/caller_id.py:10-65`; `aio/call.py:10-24` | **Partial.** `RebootHeaders`, the bounded inbound schedule parser, and typed `CallerId` in `src/lib.rs:589-1000`; `ExternalContext` follows. | A source-backed corpus proves malformed/empty caller components, unknown caller keys, last-value-wins duplicate caller and metadata keys, known-header round trips/drop of unknown inbound headers, and transaction-free authorization projection. Strict malformed input, 4,096-character bearer validation, and typed `task_schedule` empty-header→now behavior are also tested. `CallerId` validates Python wire IDs and canonicalizes output. **Task-schedule ISO slice (2026-10-05):** Python `DateTimeWithTimeZone.fromisoformat` delegates to `datetime.fromisoformat`; Rust now exactly normalizes its explicit integral-minute basic offsets (`+HHMM`/`-HHMM`) before Chrono RFC 3339 validation, including `+0200` and `-0530`. `Z` and a space separator already parse in Chrono. The source-backed vectors also assess but intentionally reject offset seconds (including basic seconds), fractional offset seconds, and non-RFC `X` separators: fractional offsets cannot be represented by `FixedOffset`, while whole-second offsets/separators need a separately specified grammar rather than a piecemeal widening. Naive timestamps and date-only values remain rejected—Python would attach local `ZoneInfo` and choose DST fold semantics that `FixedOffset` cannot retain. Schedule metadata is parsed inbound only and is never emitted by `to_metadata`. Typed server/application IDs and server-context application-ID injection remain absent. |
| Typed StateRef/readable refs/colocation | `aio/types.py:46-310,378-418` | **Implemented as a codec only.** Public codec: `src/state_ref.rs`; headers and existing runtime actors retain opaque durable keys in `src/lib.rs:588-823`. | Python-compatible SHA-1 tags, readable normalization, escaping, compound components, type matching, and ID validation are unit-tested. Do not normalize every wire header: established Rust actor identities include opaque durable keys such as `actor/42`, which are neither readable nor canonical Python StateRefs. Rewriting them would split existing lock/database/idempotency identities or reject valid current SDK requests. A future typed-header migration needs an explicit compatibility contract plus real C++ sidecar/restart proof. Native2pc identity remains separate. |
| External client routing/retry | `aio/internals/channel_manager.py:30-150`; `aio/stubs.py:61-740`; `aio/call.py`; `aio/external.py:23-137`; `aio/aborted.py:16-34` | **Partial.** Typed generated external unary reader/writer clients use `ExternalContext`; `ExternalContext::connect(endpoint)` creates one direct caller-requested Tonic channel; `ExternalEndpoint` offers Python-compatible explicit HTTP(S) URL validation before `connect_validated`; `ExternalChannelManager` accepts one validated endpoint and immutably caches one shared, lazy Tonic `Channel`; `is_retryable_status_code`/`is_retryable_status` preserve Python's narrow `Unavailable` classification: `src/codegen.rs:583-636`; `src/lib.rs:970-1175`; `src/runtime.rs:217-301`. | Generated clients attach reader metadata, optional typed `x-reboot-caller-id`, automatic seven-day UUIDv7 writer keys, or caller-owned writer keys. Unit and downstream Tonic acceptance cover endpoint construction, URL validation, the external-context boundary, reader dispatch, explicit-key replay, unavailable-only classification, and concurrent manager clones sharing one in-process-server connection while preserving `ExternalContext` metadata. This is not Python’s general `_ChannelManager`: there is no resolver/address-change cache, explicit shutdown/health observation (Tonic exposes no sound public `Channel` state for it), transparent retry-age policy, nested retry behavior, or general service resolver. Tonic owns transport reconnect behavior; the Rust manager makes no retry/outcome or TLS-equivalence decision. Success trailers are enlisted for transaction calls. |
| Idempotency/replay/fingerprint | `aio/idempotency.py:34-735`; `aio/stubs.py:522-545`; `aio/state_managers.py:130-157,2456-2686,5217-5429` | **Partial.** Canonical SHA-256 fingerprint, collision-safe replay, UUIDv7 expiry enforcement, Python-compatible seven-day-expiring automatic external writer keys, and fresh-exclusive-root replay re-check after local actor admission: `src/runtime.rs:70-135,825-845,1464-1866,2023-2060`; `ExternalContext::writer`: `src/lib.rs:1004-1025`; generated transaction adapter: `src/codegen.rs:665-730`; participant effect staging: `src/durable_participant.rs:236-264`. | Cross-language fingerprint vector, unary/durable replay, collision, UUIDv7 past/equal/future boundary, automatic-writer version/expiry-window, and generated ordering/downstream-compilation tests exist. The post-admission re-check closes the completed-original/queued-duplicate race and aborts the duplicate participant before returning replay. Missing aliases/seeds, workflow/iteration scope, checkpoints, uncertainty acknowledgement, and distributed in-flight duplicate coordination. |
| Placement and resolver API | `aio/placement.py:31-487`; `aio/resolvers.py:9-69` | **Partial, Native2pc-only.** host-fed validated snapshot/routing: `src/placement.rs:92-405`. | Plan validation/routing is tested. Missing general actor/service discovery, planner stream/reconnect, lifecycle, `wait_for_change`, and legacy application-plane routing. |

### Actor state and legacy transactions

| Capability | Python reference | Rust status and reference | Evidence / remaining work |
|---|---|---|---|
| Unary actor admission, read/write, constructors | `aio/state_managers.py:3409-3988,4326-4741,4618-4741` | **Partial.** `DatabaseActorStore`: `src/runtime.rs:1337-1964`. | Durable load/read/write and `RequireExisting`/constructor replay are tested. Missing generic StateManager, authorization callback, broad effects execution, and generated declaration coverage. |
| Per-actor locking and nested ownership | `aio/state_managers.py:709-947,1711-2237,2873-2913,5454-5520` | **Partial.** local `ActorGate`: `src/runtime.rs:845-1080`; one pending local participant: `src/durable_participant.rs:416-651`. | FIFO exclusive queue, no reader barge, cancellation, and atomic upgrade are tested. Missing transaction-tree ownership, relinquish RPC, snapshots/rollback, sibling deadlock handling, and exclusive→shared downgrade. |
| Legacy participant prepare/terminal | `aio/state_managers.py:6139-6719` | **Partial.** `src/durable_participant.rs:654-911,998-1046`. | One actor, durable prepare, read-only release, definitive abort and acknowledged terminal paths are covered. Missing task validation/dispatch, streaming effects, and concurrent participant trees. |
| Legacy root coordinator and enlistment | `aio/state_managers.py:5011-5980,7066-7183` | **Partial.** `src/durable_coordinator.rs:456-595,799-943`; trailers `src/successful_trailers.rs`. | Participant classification/deduplication, prepare→decision→terminal→cleanup ordering and recovery are covered in process-local fixtures. Missing production resolver/placement and broad generated-root integration. |
| Coordinator Watch and recovery | `aio/state_managers.py:5982-6127,6823-7183` | **Partial.** `src/legacy_coordinator.rs:20-152`; participant recovery `src/durable_participant.rs:711-855`. | Durable decision lookup and authoritative Watch membership checks are tested. Application lifecycle must create hosts at exact identities and invoke recovery; restart timestamp/task recovery behavior is absent. |
| Fresh local shared → exclusive promotion | Python effects classification: `aio/state_managers.py:163-211` plus actor-lock semantics | **Pending.** Internal gate/classification/proof seam exists, but `src/codegen.rs:617-730` intentionally keeps fresh shared roots read-only. | Required: opaque local-only handler context; drop local lease before legacy fallback; consuming direct-local handoff through successful `CoordinatorPrepare`; no resolver for local terminal calls; generated and C++ crash/recovery acceptance. See [`PARITY.md`](PARITY.md). |
| Exclusive → shared downgrade | Python lock behavior: `aio/state_managers.py:1711-2237,1936-1961` | **Implemented, process-local.** `ActorGate` uses one ordered reader/writer waiter queue and `ExclusiveActorLease::downgrade(self) -> SharedActorLease`: `src/runtime.rs:854-1160`. | Unit tests prove pre-writer readers are admitted after downgrade, post-writer readers cannot barge, grant-ready reader and queued-writer cancellation are removed safely, and upgrades reject queued work rather than bypassing or deadlocking their snapshot. It remains a process-local gate—not distributed ownership or a durable transaction promotion path. See [`PARITY.md`](PARITY.md). |

### Tasks, collections, and reactive behavior

| Capability | Python reference | Rust status and reference | Evidence / remaining work |
|---|---|---|---|
| Tasks, task workflows, responses, dispatch and recovery | `aio/state_managers.py:4743-5009,5431-5438,6408-6416,6586-6593,6848-6867` | **Missing.** `TransactionExecution` and participant payload only carry task records: `src/runtime.rs:51-67`; `src/durable_participant.rs:236-264`. | Design durable dispatch/ack/retry, workflow iteration, recovery ordering, and effect interpreter before exposing task parity. |
| Colocated collections / SortedMap range | `aio/state_managers.py:3739-3816,6721-6820`; `std/collections/v1/sorted_map.py` | **Missing.** Only FakeDatabase test stubs exist. | Requires collection effect model, sidecar range bindings, transaction visibility, and generated collection API. |
| Streaming and reactive readers | `aio/state_managers.py:4350-4613,6554-6699` | **Missing.** Runtime reader is unary; successful trailers are transport plumbing, not state subscriptions. | Requires lifecycle/backpressure/reconnect/visibility contract and subscription runtime before any generated API. |

### Application host, web, and security

| Capability | Python reference | Rust status and reference | Evidence / remaining work |
|---|---|---|---|
| Application/server lifecycle, service registration, readiness/config | `aio/applications.py:1003-1125`; `aio/servers.py:204-700`; `aio/servicers.py` | **Missing except fixed demo.** `src/main.rs` is a fixed Echo Tonic host; `src/lib.rs` exports no generic application host. | Define registration, lifecycle, recovery, readiness/config, multi-service serving, shutdown and observability. Then add process acceptance. |
| HTTP/ASGI routes and external-context injection | `aio/http.py:25-375`; `aio/applications.py:598-608` | **Missing.** No public Rust HTTP host/route registry. | Choose a framework, then implement explicit route registration, trusted internal context boundaries, bearer extraction, and lifecycle tests. |
| Authentication, authorization, OAuth/OIDC | `aio/auth/token_verifiers.py`; `authorizers.py`; `oauth_server.py`; providers | **Missing.** Rust carries bearer metadata only. | Create token-verifier and authorization traits with default deny, then test metadata/auth integration; OAuth requires the HTTP host. |
| CLI init/dev/run | `cli/commands/init`; `cli/commands/dev.py:132-166,1041-1046,1968-1970` | **Missing.** Cargo can run the bounded binary; `rbt dev run` only supports Python/Node. | Pick Cargo-only support or build `rbt init/dev run --rust` after generic host lifecycle exists. |

### Native2pc: explicitly separate from Python legacy parity

Rust Native2pc (`src/native_2pc.rs`) has validated identities, capability
negotiation, placement-plan routing, one-pass prepare/decision, prepared/staged
recovery, and bounded singleton state-only materialization. Its tests cover
validation, recovery, and transport; real C++ acceptances remain skipped without
the sidecar binary.

Python `aio/state_managers.py` contains legacy Database Participant/Coordinator
2PC, not Native2pc journals or RPCs. Native2pc must not reuse legacy records,
`Database.Recover`, or legacy participant/coordinator mutators. It is therefore
**Rust-only bounded functionality**, not evidence of Python transaction parity.

## Real-sidecar evidence

The following tests remain `#[ignore]` by default because they require an
explicit `REBOOT_NATIVE2PC_CXX_DATABASE` artifact, but they were run against a
fresh real C++ Database/RocksDB process on 2026-10-05 using the artifact built
from `//reboot/server:database` at PR commit `8468ea09`:

- `rust/tests/generated_cxx_database_process.rs` — **10 passed**: generated
  legacy adapter, factory, idempotency, read-only recovery, and shared-root
  acceptance coverage.
- `rust/tests/native_2pc_transport.rs` — **8 passed**: native
  preparation/recovery and materialization coverage.

The remote test host is reachable as `ladin@maxbucek-orignal-omarchy`; its
user-local test toolchain includes Rust and the compatibility `libcrypt.so.1`
needed by Bazel's pinned Python. Local free disk remains below the 40 GiB Bazel
guardrail, so local sidecar rebuilding is still prohibited. Passing unit or
fake-sidecar tests never substitutes for the recorded process/restart evidence.

Future added real-sidecar acceptances remain gated on supplying the artifact
through `REBOOT_NATIVE2PC_CXX_DATABASE`.
