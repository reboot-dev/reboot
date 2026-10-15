# Rust SDK parity

This is the **single current parity and capability ledger** for the Rust SDK.
It replaces the separate parity map, capability notes and candidate/contract
records. Historical proposals and failed runs remain available in Git history;
they are not additional current specifications.

**Verdict:** useful experimental local applications and bounded durable runtime
verticals exist. Full Python/TypeScript feature equivalence and production
readiness do not. Languages are intended to be used independently: mixed-language
applications are **not a requirement or a parity gap**. Existing canonical
protocols are implementation contracts, not an interoperability certification.
No overall percentage is asserted.

## CLI signal-owner compatibility source checkpoint (2026-10-15)

The Rust dev helper now has an explicit caller-owned cancellation mode. Normal
CLI dispatch selects it only when the public
`signals.cancel_on_signal_and_raise_system_exit` capability is callable; legacy
main retains the helper's existing SIGTERM/SIGINT handling. Caller-owned mode
does not inspect or replace handlers and propagates cancellation after owned
process cleanup. API presence is not itself proof that an outer cancellation
scope is active.

The [focused regressions](../../tests/reboot/cli/test_rust_signal_ownership.py)
passed **five** tests, including actual test-owned child cancellation/join,
untouched caller handlers, legacy handler restoration and unrelated cancellation.
Adjacent launch-receipt regressions passed **14** tests. Independent source and
BUILD/runfiles reviews passed; a minimal symlink-runfiles simulation also ran
the five tests successfully. **No actual Bazel execution or merged-main signal
acceptance is inferred from these source/unit checks.** The separate real CLI
runtime gate remains distinct.

The separate [real merged-main prefix receipt](tests/evidence/cli-merged-import-help-20261015.json)
now records actual fresh generation of **40** schemas, successful imports of
normal CLI main/current dashboard/presence/BDD/Database descriptors, and a real
normal-main `--help` exit zero. This uses the frozen merged snapshot417: the
published Rust helper and regression bytes match, and the actual dev-call AST
matches, but the entire snapshot is not latest PR/upstream HEAD. The private
source overlay explicitly reuses the pinned qualified installed package native
extension; it is **not** a fresh upstream native library build. Earlier missing
asset/internal Memoize bindings and subsequent obsolete harness arguments were
real failures, not accepted signal tests. All children and the exact container
retired cleanly for the recorded failed trial; serving, insecure refusal and
real signal cleanup acceptance were not established by that prefix run.

## Actual normal merged-main signal cleanup (2026-10-15)

A fresh successor [real signal receipt](tests/evidence/cli-merged-signals-20261015.json)
now records passing normal-main `rbt dev run --rust` trials for **SIGTERM,
SIGINT, SIGHUP and SIGQUIT**. Every trial first reached canonical gRPC Serving
and passed the actual public client health command. The CLI retained the
original terminating signal (exits **-15, -2, -1, -3**), with two birth/argv
qualified Database/app children per trial. The pinned in-container worker
checked leaders/groups absent and listeners closed afterward, while its
unrelated owned sentinel remained alive through every signal trial. The
explicit insecure Database refusal also passed without child launches.

Parent readback independently verified all **3255 frozen source files**,
helper pins, all **2665** generated-overlay files and all row-log hashes. All
owned children joined, with no adopted descendants or cleanup failure; exact
attach exit zero preceded fresh exact-container terminal inspection (PID zero,
exit zero, no OOM/error), and the original owner lock was free. Container child
PIDs were not looked up in host `/proc`.

This closes the **bounded merged-main signal compatibility proof**, using the
same frozen-snapshot and qualified-package native-extension limits above. It
is not latest-upstream build qualification, full CLI parity, init/generate,
hot reload, restart durability or overall SDK parity. Earlier failures were
preserved and never converted to success.

## Cursor/results actual native driver milestone (2026-10-15)

The [actual native driver receipt](tests/evidence/cursor-native-driver-20261015.json)
records two passing scenario groups against the real generated Rust app and
accepted C++ Database: canonical Pending cursor **1025**, terminal consumed/B
commits **1030**, byte-rich Stored-result and saved Break replay equality,
concurrent writes, and Started-without-Stored recovery after actual B commit
**1031**. The latter naturally exits the recovery host with the required
fail-closed diagnostic; no callback is retried.

Parent verification independently rehashed all **634 archived files**, frozen
source/helper/executable pins and exact child joins. Genuine attach completion
preceded fresh exact-container terminal inspection: exited, PID zero, exit zero,
no OOM/error. The original task lock was acquirable afterward. These are actual
runtime results, not the seeded/private cursor tests. The separate fresh native
Database canonical readback has now **passed** (below). Full native/public
qualification, current-upstream qualification and overall SDK parity are **not**
asserted.

## Cursor/results independent canonical readback (2026-10-15)

The [database-only verifier](tests/fixtures/workflow_cursor_results_app/canonical_verifier.py)
ran through the original exclusive owner with a **fresh native Database**, two
fresh generated Rust CLI inspect processes and **no SDK host**. Its input was a
byte-for-byte copy of the closed passing-run RocksDB dataset: **21 files**,
distinct inodes, pinned original server-info bytes, and a verified read-only
input mount. The historical dataset remained unchanged.

The [canonical receipt](tests/evidence/cursor-canonical-readback-20261015.json)
records complete terminal task/status/iteration/raw-record preservation at
iteration **1029**, with the later global actor state (consumed **1030**,
concurrent **3**, after **1**, B commits **1031**). The entire Pending snapshot
matched the prior run, including raw task bytes and its sole Started record,
with no Stored record. Single-shard topology is tied to the pinned original
source construction and reused server-info bytes; no separate live topology
introspection claim is made.

All **three** children genuinely joined with exit zero, including intentional
graceful Database SIGTERM. Parent readback independently verified **92 archived
files**, all **2822** source members, **33** bundle members and **40** runtime
pins; exact attach join preceded fresh terminal container inspection, with no
OOM/error and the original lock free. This closes the bounded cursor/results
native fixture proof, **not** public qualification, current-upstream
qualification or overall SDK parity. The reboot-examples remote HEAD was
rechecked and remains `5c332a2910122d6035799bfaf2a314bf1de830b8`; this
new-feature fixture is not claimed as corresponding examples parity.

## Cursor/results fixture source checkpoint (2026-10-15)

The [fixture](tests/fixtures/workflow_cursor_results_app/HANDOFF.md) is now
available for parent-owned native qualification. Its generated Rust consumer
compiled and passed strict all-target Clippy. The later mandatory writer-metadata
fix also passed an actual locked/offline rebuild; strict Clippy describes the
earlier main.rs. Ten repository-local cleanup/wait unit regressions
exercise the actual helper, including unresolved short clients, unrepresented
reservations and open/missing descriptor obligations. The standalone Rust
wrapper compiles and remains intentionally ignored. These are **source,
compile and unit results**, not native/public cursor acceptance.

The >1024 continuation, typed cross-actor result replay, saved Break replay
and Started-uncertainty driver assertions have now passed on the real native
runtime, followed by the passing independent canonical readback above. The fixture refuses
to substitute subprocess polling for the required parent custody adapter.
Unknown SDK custody blocks Database retirement; independent outer preflight,
archival, real build provenance and approved native execution remain required.
This fixture is not reboot-examples parity evidence and changes no overall
SDK parity verdict.

A subsequent **actual offline Linux x86-64 build** of that published fixture
succeeded with `cargo build --locked --offline`. Parent verification correlated
the frozen source, generated consumers and linked executable, rechecked all
source/helper/output hashes, and verified exact attach completion followed by
fresh exact-container terminal inspection. The original task lock was released
and the build custody record was clean. This is a real built artifact, **not a
native cursor scenario**: no >1024 continuation or result-replay runtime claim
is made. See the [generated app build receipt](tests/evidence/cursor-generated-app-build-20261015.json).

The [first real native attempt](tests/evidence/cursor-native-first-failure-20261015.json)
created actors and dispatched the workflow but failed because B.Effect requires
`x-reboot-idempotency-key`. The fixture now creates a fresh UUID inside each
actual callback dispatch. No stable task/effect key is reused: an erroneous
callback replay must cause another destination commit rather than hide behind
deduplication. Retransmission of one already constructed request can still
deduplicate; absence of transport keys is not claimed. The corrected app's
[offline rebuild](tests/evidence/cursor-dispatch-metadata-build-20261015.json)
passed; the real native rerun remains subject to independent adjudication.

The next [native attempt](tests/evidence/cursor-workload-timeout-20261015.json)
passed the first stored-result/restart setup and actually progressed through
iteration 99, but the generic ten-second milestone wait expired. The harness
now permits 180 seconds only for the parked-at-1025 objective. Existing exact
predicates/state checks and all retirement safety rules are unchanged; normal
readiness waits remain ten seconds. Two fake-clock regressions pass alongside
the eight cleanup units. This wait-budget fix is not native acceptance.

## Cursor and typed-result library checkpoint (2026-10-15)

The experimental library now supports explicitly registered canonical workflow
cursors and typed at-most-once result envelopes with contract/provenance checks.
Generated handlers select cursor registration once per registration through a
`Self: Sized` hook; default finite workflows remain finite. Complete generated
handler-name validation rejects RPC/hook collisions before emission.

Library verification on the exact implementation source: **672 passed, 0 failed,
7 ignored**, plus strict SDK/test Clippy with `-D warnings` (Rust 1.95; library
execution used Rust 1.97.1). The causal Wait regressions exercise policy revocation,
original-owner replacement and uncertainty during cursor-binding recovery, with
valid terminal and corrupted-checkpoint controls. Malformed stored typed results
taint the attempt before acknowledgement and cannot be swallowed to permit finish
or local retry.

**Acceptance boundary:** that checkpoint verified the library only. The later
fixture source checkpoint above does not establish two-actor native/public
acceptance; the actual native proof remains pending.
The seeded cursor unit case is not evidence of executing more than 1024 Continue
steps. Persistence/restarts, real generated cross-actor typed replay and current
upstream merged behavior remain separate gates. Started-without-Stored stays
unresolved; no external exactly-once or general retryable-idempotency guarantee is
claimed. Existing historical native/public receipts below do not certify this
new cursor implementation. Full parity and CI approval remain outstanding.

Evidence: [cursor library receipt](tests/evidence/cursor-library-20261015.json).

## Engine preflight and native constructor prerequisites (2026-10-15)

Taskful constructors now require the read-only `Database.GetCapabilities` response
on their actual native channel before reserving an actor lease, sealing admission,
or consuming a process-global permit. Exact protocol/version/enabled checks reject
old or incompatible engines cleanly; generation is revalidated after the await.
Taskless/replay paths are unchanged. Once the actual atomic write starts, uncertain
outcomes still retain ownership; there is no legacy mutation fallback.

Current-source native acceptance executed **16 isolated behavioral phases**:
old-engine refusal before mutations/reservation, healthy Account completion,
pending shutdown and same-state/token restart recovery, real ACK loss, and all
11 registered-constructor prerequisites (including actual Prepare ACK/TCP loss).
All exact SDK processes and native authorities joined; the container exited zero,
with independently verified terminal state and matching closed-log hashes.
The current C++ capability/admission selection also passed **5 tests** separately.
SDK capability tests, generated consumers and strict SDK/generated lint passed
on the implementation freeze before these native runs; these are distinct gates,
not overlapping counts to add together.

Limits remain: constructor prerequisites are not public/shared Bank.Transfer;
ACK-loss and LostPrepare retain uncertainty until process exit, not normal live
reconciliation. Public Constructor and Tasks regressions now also pass on the
updated generated-module lint freeze, through actual `rbt` startup, canonical
Database persistence/restarts, replay and typed task Wait. Tasks retains strict
all-target Clippy; only generated Tonic modules allow the intentional large
`tonic::Status` return contract. Handwritten modules retain strict linting.
This is not full parity, production readiness, or current-upstream merge-result proof.

Fresh public evidence: [Constructor/Tasks regression receipt](tests/evidence/public-constructor-tasks-20261015.json).

Evidence: [native constructor/preflight receipt](tests/evidence/constructor-preflight-native-20261015.json).

## Atomic standalone constructor tasks (2026-10-13)

Generated standalone `Account.Open` can now atomically persist the initial Account,
pending WelcomeEmail task and first-response checkpoint through the distinct
`CreateActorWithTasks` RPC. There is no legacy CreateActor/Store/Upsert fallback:
old-sidecar refusal remains fail-closed. Response-only legacy constructors do not
require a task owner. Taskful admission reserves an actual actor lease, original
host generation, dispatch ownership and one of the process-global 64 permits before
native IO; cancellation or uncertain acknowledgements retain that ownership.

Four exact fresh-process proofs ran against the upgraded canonical C++ Database:
- Original Open: canonical pending readback before forwarding the genuine native
  ACK, stable pending/completed replay, one WelcomeEmail log, durable completion ACK
  and public typed Wait.
- Pending shutdown: actual joined host, no WelcomeEmail body, canonical Pending
  task, and fsynced first-response token; exact Rust exit then graceful native exit.
- Same-state restart: unchanged pending-directory identity and saved token, genuine
  canonical recovery, no constructor invocation, one WelcomeEmail log, completion,
  public typed Wait and stable completed replay.
- Real ACK loss: after canonical ACK/persistence readback, actual TCP disconnection
  causes public failure and automatic failed-host cancellation/join. The original
  gate, sealed registry and one real global64 permit remain retained; a cold host
  is refused with zero new observed Create/Recover/Load RPCs. Canonical actor/task/
  checkpoint remain Pending, without CompleteTask or a WelcomeEmail body.

All four Rust tests and four native processes exited zero. The isolated network
namespace/container retired cleanly; the external custodian and lock also retired.
The observed disconnect diagnosis was genuine `Unknown` transport failure, not a
fabricated Unavailable response or a production retry-policy change. The token is
hashed in the public receipt; its bytes and private operator inputs are not published.

Supporting acceptance: full canonical Database target **76 passed / 0 failed**;
current SDK library **645 passed / 0 failed / 6 ignored**, matched against its exact
651-test inventory; default check and strict all-target SDK Clippy; x86 original
fixture compilation, strict Clippy and **5 ordinary passed / 5 native ignored**;
companion compilation/strict Clippy and **6 model tests** (its seven canonical-native
cases are prior evidence, not a fresh run on the boxed-probe caller repair).
Generated-binding-only large-error allowances preserve existing client/error API
contracts; authored probe errors are boxed and explicitly unboxed at the companion
boundary. There is no blanket consumer/command-line lint suppression or API rewrite.
Nine untouched original Bank inputs were revalidated at the pinned reboot-examples
revision `5c332a2910122d6035799bfaf2a314bf1de830b8`.

**Limits:** this is bounded standalone constructor authority in a managed pristine
single-shard topology, not a global fence against independent native Prepare/import
writers. Retention remains process-exit-only fail-closed, not live adoption. Fixture
process retirement does not prove universal production-host cleanup; proxy success
trailers remain qualified. WelcomeEmail is a logged effect, not exactly-once delivery
through an external email API. Full original Bank/default initialization, constructor
children inside SignUp and recoverable dynamic writer-task ownership remain missing.
CI/fork approval remains separate and PR #216 stays draft.

Evidence: [atomic constructor checkpoint](tests/evidence/atomic-constructor-checkpoint-20261013.json).

## Historical typed shared declared errors and genuine-ticket refusal (2026-10-13)

Non-factory shared transaction declarations now generate typed business errors,
including the unchanged original Bank/Account schemas. Execution remains restricted
to host-registered, explicitly opted-in shared roots over existing ordinary writers.
Default, inbound and ticket-bearing shared entry cannot gain authority from schema
acceptance. Typed error payloads return only after consuming root Abort succeeds;
unknown Abort acknowledgements dominate the business result and retain ownership.
Generated typed-hook and declared-error enum namespace collisions are rejected.

The checked-in [typed Bank prerequisite fixture](tests/fixtures/typed_shared_bank/README.md)
includes the original Bank adapter unconditionally. Its original-schema tests execute
actual default/malformed-header refusals before root start, sidecar calls or handler
entry, and decode the exact original `bank.v1.OverdraftError`. This replaces the
historical compile-rejection control; it is not admitted original Bank execution.

The separate synthetic SharedRoot/Account canonical Database companion proves
commit persistence at 60/40 across restart, typed deficit 10 without terminal
mutation, root-declared error 17 after one or both real Account mutations followed
by acknowledged restoration/restart, and exact Alice Abort-response discard with
independent same-store ActorGate exclusion. Native observations are per-actor,
serial-case/pre-release evidence; sidecar return is not remote-trailer delivery.
Six additional fresh-host cases exercise malformed and valid wrong-target tickets
on the actual shared-declared receiver, then exact original/clone replay failure
on the legitimate Account.Withdraw destination. Each uses genuine authorized root
issuance, not shared-target outbound permission or manufactured ticket authority.
Only the issuing root enters the handler/Load; rejected calls produce no child
handler invocation or recorded successful native participant terminal response.
This instrumentation is not an exhaustive trace of failed attempts or Prepare.
Unsettled issuance retains the
exact `late enlistment retained; explicit cleanup is incomplete` caller/host
failure rather than manufacturing healthy cleanup.

Fixture runtimes are dedicated synchronous owners destroyed before final Native
Drop. Three causal wrapper tests exercise proof panic, first join timeout and
second cancellation-join timeout using real held task/callback destruction and an
explicit owner surrogate. They are not production ApplicationHost failure-path or
Native kill/wait proofs. Runtime destruction may wait indefinitely for non-yielding
work; no leaking timeout/background shutdown is used. Watch counters report actual
entry/drop/proceeding; unknown callbacks dropped before release are not a Notify
wakeup experiment. The production host cancellation join implementation is unchanged.

**Full original Bank remains unsupported:** Bank singleton initialization,
transactional Account creation inside SignUp and dynamic task-owner recovery are
not established by this synthetic companion. The standalone atomic Account.Open
proof above does not establish nested SignUp ownership. No Python
seed/private snapshot is used as Rust acceptance. Factories, shared-child/outbound
transaction authority, remote composition and broad task effects are not enabled.

Fresh frozen acceptance: **19 named gates**, including two native inventories;
SDK library **630 passed / 0 failed / 3 ignored**, generated downstream **51**
plus its outer harness, original-schema fixture **5**, companion fixture **13**,
default-feature check and strict SDK/shared-consumer/both new fixture lints.
**53 selected canonical Database tests** comprise registered 20, shared-writer 24,
retained-writer 2, synthetic typed-error native 1 and genuine-ticket native 6.
The companion's three wrapper failure tests and three semantics tests are not
additional canonical-native tests. Public Legacy happy/restart, all five strict
Legacy crash windows, Constructors and Tasks passed on this final source snapshot.
Thirteen pinned upstream/local example inputs were reauthenticated at the revision
above. Earlier compile/lint failures remain failures; this does not fix the
historical process-birth observation race or recertify the older full inventory.

Evidence: [typed shared-error checkpoint](tests/evidence/typed-shared-errors-checkpoint-20261013.json).
The parent reconciled **741 PID/birth identities absent**, including zombies;
source, canonical Database and log hashes match. Independent applied-source
approval is bounded, not a universal safety proof. CI/fork approval remains
separate and PR #216 stays draft. Prior dated checkpoint sections below are
historical evidence, including the former Bank compile refusal; they do not
supersede this current capability boundary.

## Historical sealed shared-writer ownership and fail-closed retirement (2026-10-13)

The registered, opt-in shared-root/existing-exclusive-writer prerequisite is
integrated with crate-sealed root policy, consuming guard ownership, retained
lease rollback/reupgrade and immutable-decision/acknowledgement accounting.
Caller metadata, an arbitrary participant list or a mode string does not confer
writer authority. This is a bounded registered-local prerequisite, **not public
shared `Bank.Transfer` acceptance**, arbitrary shared/factory/nested composition,
remote execution, full SDK parity or production readiness.

Explicit Abort admission and sealing are atomic on their supported paths. Queued
and running ordinary work latch shutdown uncertainty before captured work/root
ownership is destroyed; running Work is destroyed before Job returns capacity.
Known-result accounting preserves healthy completion and observer-loss behavior.
Actual Job lifetime is separately observed in test-support so reply delivery or
early shared-capacity return cannot masquerade as physical owner retirement.
These idle helpers are read-only observations requiring quiesced producers,
not authority reservations or ledger settlement. Mutex poisoning/stalls, timer-constructor/arbitrary panic and
the actual five-second forced fallback are not certified by this checkpoint.

Eligible registered Exclusive/non-factory entrypoints recheck host readiness
after authorization and before relinquishing first-touch pristine cleanup
ownership. The separate shared-root flow does not have this new pre-transfer
observation. The exercised Allow-after-
revocation case rejects before native Abort/Prepare/Commit and permits an
independent same-store Account write from 100 to 101. This check is not atomic
across every subsequent await and does not generalize to every entry branch.
Unresolved raw-root membership can honestly fail host shutdown even when a
pristine Account is reusable; uncertain affected ownership remains excluded.

Owned inline heap-construction boundaries close the four generated A→B→C chain
stack-overflow regressions in the real native suite. No stack limit was increased
and no child future was detached/spawned. This establishes regression success,
not a measured frame-size reduction or a universal recursion-depth guarantee.

Fresh source-bound acceptance comprises **23 named gates**, including three
inventory/discovery gates: SDK library **628 passed / 0 failed / 3 ignored**;
generated downstream **51 passed** plus its separate outer harness; default-
feature-disabled check; strict SDK, native-consumer, map-consumer and examples
Clippy; and **54 selected canonical Database tests** (registered 20, shared-writer
24, retained-writer 2, effects restart 1, SortedMap 3 and compatibility/ACK-loss B1
4). These selected counts do not recertify the older full 152-test inventory.

Current public Legacy happy/restart, Hello Constructors and Hello Tasks passed.
The unchanged strict Legacy crash suite passed all five windows in a fresh run,
with all 13 sessions reconciled. An earlier run failed because a Database birth
receipt was unobserved; that failure remains a failure. The successful rerun is
bounded execution evidence, **not a fix or reliability guarantee for process-birth
observation**. Experimental traced receipt backends and rejecting containment
stubs remain outside the implementation and this checkpoint. All 13 pinned
upstream/local example inputs were revalidated at
`5c332a2910122d6035799bfaf2a314bf1de830b8`; shared `Bank.Transfer` still rejects
with its exact unsupported declared-error diagnostic.

Evidence: [sealed ownership checkpoint](tests/evidence/sealed-ownership-checkpoint-20261013.json).
Source, canonical Database and log hashes match across all three accepted stages;
The integration owner's checkpoint reconciliation records 769 PID/birth
identities absent, including zombie identities.
Independent applied-source review is bounded, not a universal safety proof.
GitHub CI/fork approval and current merge-result validation remain separate;
PR #216 stays draft.

## Historical shared roots, stable actor gate and host-owned cleanup (2026-10-12)

The bounded per-root participant registry, clone-shared actor-gate binding and
host-owned local cleanup are integrated and behaviorally verified. Compatibility
native-control ownership and Legacy recovery-prebinding defects are repaired;
independent applied-source review found no blocker in its bounded scope. This is
not production readiness, broad shared-writer support or full SDK parity.

Fresh SDK library acceptance is **578 passed / 0 failed / 1 ignored**; filtered
binding (10) and Legacy recovery (3) selections overlap that library run, rather
than adding distinct coverage. The generated downstream fixture passed **51**
cases, with one separate outer generator harness. Default-feature-disabled check
and strict all-feature/all-target SDK, generated native-consumer, examples and
actual generated SortedMap-consumer Clippy passed.

**28 selected canonical C++ Database tests passed:** compatibility/ACK-loss B1 (4),
registered writer safety (20), SortedMap (3), and durable effects restart (1).
Two native inventory gates are discovery, not behavioral passes. The older full
152-native inventory below certifies its older source, not this production batch.

Current public CLI/canonical Database/RocksDB regressions passed all five Legacy
crash windows, Legacy happy/restart, Hello Constructors and Hello Tasks. All 13
pinned upstream example files were authenticated against upstream/local hashes;
upstream HEAD still matched `5c332a2910122d6035799bfaf2a314bf1de830b8`.
Unchanged shared `Bank.Transfer` still rejects for the exact declared-error schema
diagnostic: this remains an unsupported capability, not public Bank acceptance.

Each participant registry admits at most **64 roots**, including admission/gate
waiters. Clones share real gate authority, frozen before admission and recovery;
writable Prepare and actor-only native terminal controls require actual exclusive
ownership. ACK loss, cancellation, rollback, guard Drop and reuse retain possible
native ownership rather than manufacturing terminal success.

Host cleanup has **256 aggregate tickets per host** across producers, queued jobs,
running children and completed-unreaped children. Captured-slot/root/incarnation
fences preserve prepared, early-native and uncertain ownership. Orderly shutdown
and ordinary Result exits join serving/recovery before draining cleanup; detected
child panic or cleanup timeout is failure. Arbitrary lifecycle/registration-hook
unwind, external host-future cancellation, unbound/custom detached graphs,
synchronous Service::call, arbitrary spawned work and later body polling are not
joined-cleanup guarantees. External guard/context-cache aliases keep producer
tickets even after acknowledged completion and must be relinquished before
successful host drain; automatic cleanup-ticket revocation is not implemented.
The cap was source-reviewed, not experimentally saturated in every category.

Legacy startup prebinds the complete primary/additional participant graph before
any Recover construction. Held authoritative Watch/Commit ACK regressions tie
readiness to actual convergence; these mock lifecycle cases are not independent
native durability evidence.

The SortedMap native regression initially failed shutdown because its fixture
retained a revoked external context/cache guard through host join. It now drops
that fixture-owned alias after the unchanged stale-authority rejection, before
unchanged native-state inspection. All three affected native cases and strict
actual map-consumer lint were rerun. No production bytes changed in that final
fixture repair; earlier accepted SDK/public/registered evidence retains its exact
snapshot with this single-file compatibility difference explicitly recorded.

Evidence: [shared-root checkpoint](tests/evidence/shared-root-checkpoint-20261012.json).
It records 20 named gates (including two discovery gates), immutable source/binary
and log identities, applied reviews, and **701 accepted-stage process identities**
independently absent, including matching zombies. Earlier failed attempts remain
failures. GitHub fork approval and current merge-result validation remain separate;
PR #216 stays draft.

## Historical native inventory and acceptance-barrier repair (2026-10-12)

**Full native inventory at the earlier proof checkpoint: 152 tests passed, zero failed
and zero left ignored in its selected executions.** This is historical evidence,
not fresh certification of the later production changes above. The five discovered suites contain generated canonical
Database/process cases (130), workflow restart/control cases (5), reactive/User
cases (4), SortedMap cases (3), and isolated Native2pc cases (8). The library unit
effects-restart test and separately owned initializer admission test add one each.
Exact executed names match the nonempty, duplicate-free inventories. Focused
retries are excluded from this distinct native total. Eight Native2pc tests prove
the isolated Rust protocol, not Python legacy interoperability or public Bank.

This is a five-file **acceptance-fixture repair**, not a production SDK change:
- The remote target's live Watch may commit after a durable coordinator decision
  while root direct fan-out is parked. The test now parks the actual target native
  Commit before issuance and checks its request identity, absent ACK, prepared
  task and reader silence; restart/redelivery and root/target independence remain.
- Active-child controls are probed while the actual B handler and generated child
  JoinHandle are causally held and A's RPC remains unfinished. Returning B then
  requires exact handler-lifetime Cancelled, successful child join, no late clone
  resolution, independently owned C handler cleanup, durable Abort and readmission.
- Workflow wait observers validate the producer's versioned JSON, exact hook,
  host PID, task UUID and monotonic deadline rather than expecting obsolete text.
- Canonical task completion/pre-CAS visibility is separate from the scheduling
  client's response marker. The declared-result fixture now joins its exact
  scheduling acknowledgement before kill/restart/removal, without mutation retries
  or weakening terminal, typed-error, private-state or pre-CAS assertions.

Strict all-feature/all-target SDK and generated native-consumer Clippy passed;
unchanged `Bank.Transfer` rejected for its exact unsupported declared-error
schema. The receipt has 13 named gates, including two discovery-only inventories.
Initializer admission reused the same task ID and typed Empty across two host
incarnations with one workflow-body entry against the same real Database process;
this particular test does not prove Database process restart or the public sample.
The earlier public Legacy/Constructor/Tasks and default/all-target SDK unit evidence
retains its own checkpoint; those gates were not rerun or relabelled here.

Evidence: [current native checkpoint](tests/evidence/native-inventory-checkpoint-20261012.json),
SHA-256 `9e77a266aa709c547c85e26fd848b1f91fa346d128b37f0979f5839bff3d4826`.
All 7,347 recorded process identities across failed, focused and final attempts
were independently absent, including matching zombies; final source, Database
binary and log hashes matched. Earlier 128/2, 129/1 and workflow 4/1 failed attempts
remain failures, not aggregate acceptance. Source reviews cover the applied repairs;
marker-publication liveness risk fails closed. Historical 131-case/queued-inventory
wording below describes earlier checkpoints. GitHub fork approval and merge-result
validation remain separate; this is not full SDK parity or production readiness.

The bounded shared-slot/gate/cleanup batch is now integrated and verified as
recorded above. Broad shared transactions and public Bank remain unsupported.

## Legacy gRPC and serving initializer checkpoint (2026-10-12)

The pinned `hello-legacy-grpc` now has a faithful Rust-only port using its original
schema: Deprecated/Proxy/Reboot services, unchanged random routing and salutations,
real same-actor generated writers, and ten Proxy calls inside the named
`at_most_once_unit("make greetings", 1, ...)` effect. Python reference files are
provenance, not a running backend. Canonical Empty RPCs render as Rust unit without
colliding with valid generated module/runtime identifiers.

The gRPC serving initializer runs after recovery and required public routes are
usable; health becomes SERVING only after success. Its noncloneable capability is
bound to the actual private host recovery cancellation root, exact task instance,
live generation and callback lifetime. Foreign-host dispatchers reject before
callback construction or Store, including through forwarding recovery wrappers.
Admission persists one immutable alias/task contract and reuses the same task;
typed Wait retains that authority. Fatal initialization cancels and joins owned
deliveries/listener. Seven host and two admission regressions passed on an isolated
snapshot; the subsequently frozen SDK regression covers the same host-binding bytes.
This is not an HTTP initializer, detached-registrar sandbox, distributed CAS or
cross-state-type alias migration claim.

The public CLI/canonical C++ Database/RocksDB crash matrix passed all five windows:
Pending before Started; Started before callback; three acknowledged Proxy replies;
all ten replies before Stored; and Stored before completion. Each application was
killed through a birth-validated kernel pidfd within the producer-relative barrier
budget, then inspected without an app and restarted against the same RocksDB/task.
Pending recovery executes one ten-call block; Stored recovery completes without
reentering it. All three incomplete-Started variants fail on two successive fresh
restarts without callback/effect replay or successful terminal. Three Proxy replies
are not necessarily three Reboot mutations: branch counts come from actual replies.
Canonical actor/task/checkpoint RPC artifacts validate exact scope/key/fingerprint;
inspection exports every configured shard within the selected state-type column
family, rather than confusing nonworkflow recovery with workflow absence.

Fresh public happy/restart also passed: ten initializer calls, no initializer replay,
identical saved writer responses, both Proxy branches, canonical Completed/Stored
readback and strict generated sample Clippy. Constructor and Tasks public regressions
passed. The aggregate has 15 named gates: unchanged SDK all-feature/all-target
643 passing outcomes/0 failed/152 ignored, default 634/0/150 ignored, strict SDK and
native-consumer Clippy, one real native effects-restart test, 20 registered native
safety tests, four launch-receipt units, three inspector units, ten crash-driver units,
26 current-CLI regressions, the four public sample gates, and exact Bank rejection.
Counts are per gate, not deduplicated SDK coverage. All 924 recorded aggregate
process identities were independently absent; binary and compatible source hashes
matched. Failed earlier harness stages are retained and are not accepted evidence.
Only affected public/inspector gates were rerun after harness-only fixes.

Evidence: [accepted Legacy receipt](tests/evidence/legacy-grpc-checkpoint-20261012.json).
Public stage: `/tmp/reboot-rust-legacy-public10-20261012/result.json`; five-case proof:
`/tmp/reboot-rust-legacy-crash-p0ouip5y/result.json`; happy/restart proof:
`/tmp/reboot-rust-upstream-legacy-76ebrh87/result.json`. Source reviews approve their
bounded applied repairs; runtime acceptance is the executed evidence above.
At-most-once unit effects are not arbitrary external exactly-once, ACK-loss crash
certification, production readiness or complete SDK parity. Started without Stored
is deliberately permanent failure. Shared/public Bank remains unsupported and its
declared-error rejection remains intact. GitHub fork approval/merge-result evidence
is separate from local acceptance.

## Pinned upstream examples checkpoint (2026-10-12)

Schemas and provenance are pinned to `reboot-dev/reboot-examples` commit
`5c332a2910122d6035799bfaf2a314bf1de830b8` without changing their annotations.
Hello Constructors now has a faithful generated Rust application exercised through
public `rbt` startup, canonical C++ Database persistence, restart, exact initializer
and scenario messages, and duplicate-free same-key replay. Both requested shutdowns
verify owned-process exit. This is sample acceptance, not full SDK parity.

Imported Account overdraft errors preserve their original protobuf payload and type
URL; foreign URLs and corrupt payloads retain transport-error fallback. Plain
reader/writer services now generate task-owner bindings. Constructor-free writer
admission follows ordinary-method implicit creation, while constructor-required and
mixed-transaction declarations remain require-existing. Registration and admitted
execution regressions pass. Hello Tasks ordinary writers now atomically persist actor
state, typed response checkpoints and successor tasks in a synchronous Store.
Native C++ Database acceptance covers Send -> Warning -> Erase, seven-/three-second
bounded timestamp windows, host and same-RocksDB Database restarts, and actual
admitted Pending Warning recovery after Store but before completion. Recovery
preserves saved Erase identity without reinvoking Warning, duplicating its suffix,
resurrecting a Completed successor or overwriting later actor changes. The
Completed-successor setup deliberately defers Warning through test-support; it is
not proof of natural distributed concurrency. A replay-disabled mutation fails on
saved response identity; exact source restoration and a fresh native run pass.

Hello Tasks now also has a valid-ID public `rbt dev run --rust` sample gate, using
Cargo-native public generation/startup, canonical C++ Database, generated typed
Warning/Erase Wait, exact seven-/three-second scheduling windows, exact message
suffix and erased counters, Pending-at-shutdown protobuf identity read back before
recovery-host launch, same-RocksDB restart and same-key duplicate-free replay.
Read-only Database inspection and an observation-only forwarding consumer wrapper
provide evidence; all mutations and Wait calls use the public app listener. The
aggregate includes this as its nineteenth gate with explicit evidence validation.
Publication audit `1791797064076702020` passed all nineteen gates, with matching
frozen sources and no live owned processes at every gate. Evidence:
`/tmp/reboot-rust-user-http-full-audit-1791797064076702020`. Independent read-only
review found no blocker for bounded valid-ID acceptance under the aggregate.
Scheduling windows do not establish exact execution times; replay checks response
and task-ID identity, visible state and invocation counts rather than comparing
whole task protobufs on every replay. Standalone final receipt/discovery now
executes inside a protected ownership boundary: retention runs even when either
preliminary observation fails. Real standalone assertion, receipt-write and
discovery failure probes retain flock, adopt an unsampled orphan and reap its
natural exit before allowing the failure to escape. No broad kill is used.

Ordinary generated writers now expose a default synchronous immutable local-state
precheck. Only its sealed rejection retries, with cancellable capped-delay backoff,
no attempt ceiling, and actor lease release between attempts. Generic async
handler/transport failures remain non-retryable. Checkpoint replay bypasses the
precheck; original admission persists across attempts, handler awaits, successor
preparation, Store and completion. Stale durable ACKs retain sticky uncertainty.
Hello Warning/Erase prechecks use only the original message-ID presence predicate.

Publication audit `1791801032270208601` passed all nineteen gates, with matching
frozen sources and no live owned processes at every gate. The native gate explicitly
runs four tests (including its recovery helper and the new controlled-ID retry
case). Evidence: `/tmp/reboot-rust-user-http-full-audit-1791801032270208601`.
Independent re-review found the post-handler fencing blocker resolved and no new
blocking defect. Focused evidence under `/tmp/reboot-rust-local-retry-checkpoint`
records 14 retry/fencing regressions and 512 SDK units passing.

The public Hello Tasks gate now exercises missing-ID retries without changing
schemas/shared consumer, replacing a handler, seeding tasks, or raw Database writes.
Faithful Send schedules Warning; two early public Warning calls schedule distinct
Erase tasks. The first Erase removes the message before the original Warning and
second Erase run. Both remain Pending with public SCHEDULED_RETRY and counts >3.
The observation wrapper forwards the shared consumer's immutable prechecks too;
otherwise its default precheck silently bypasses the retry contract. Full Pending
records are compared in app-free shutdown inspection and after a third public rbt
start; actor equality is checked before shutdown and after restart, not during the
app-free inspection. Missing-ID rejection adds no observed handler invocations.
Generated typed Wait RPC deadlines cancel observation without changing Pending
records. Another faithful
Send/typed chain completes while both old tasks retry, demonstrating public writer
usability, not eventual matching-ID completion. Administrative CancelTask rejects
these ordinary tasks (FailedPrecondition); graceful dispatcher shutdown cancels
retry work and preserves Pending storage, not a durable cancelled terminal.

No supported deterministic eventual matching-ID arrangement was found. Pinned
Python `hello-tasks/backend/src/hello_servicer.py` Send uses `uuid.uuid4()`; the
unchanged Rust shared Send uses `Uuid::new_v4()`. SendRequest exposes only text,
not an ID. Idempotency keys replay the saved response, not determine the message ID.
Neither Warning nor Erase inserts messages. Tasks service exposes Wait/List/Cancel,
not submission. Thus the public proof schedules tasks while the message exists,
then removes it; it does NOT schedule missing IDs before their first insertion or
prove eventual reinsertion/completion. A random UUID collision is not a safe proof
strategy. Controlled-ID native eventual-insert coverage remains SDK-seam only.
Native rejection checks do not directly establish checkpoint absence.
Cancellation/generation/ACK boundary regressions remain transport-fake-backed;
scheduling-specific lost-ACK/cancellation/stale-generation native proof is open.
The earlier focused checkpoint was not a rerun of the prior nineteen-gate audit.
Focused public receipt `/tmp/reboot-rust-upstream-tasks-9wjofwb2/result.json`
passed three public sessions, two shutdown inspections and nine commands (including
strict staged Clippy), with 314 frozen inputs matching and 20 exact owned process
identities reconciled. Fifteen ownership regressions and 26 CLI regressions passed;
the feature-enabled native suite passed three scenarios plus its recovery helper.
The updated aggregate's Tasks validator accepted these actual focused receipts.
These manifests certify their original source snapshot; this subsequent ledger
clarification and fingerprint bookkeeping are not a new behavioral acceptance.

Subsequent publication audit `1791803454128973513` passed all nineteen gates
against published implementation `3a4f1f02d5cf2224bab4287e5e3c81900fd929bd`.
All 278 aggregate frozen inputs matched, every gate recorded exit zero and empty
live-owned lists, and 678 recorded PID/start identities were independently absent
before this ledger-only publication update. SDK all-targets logged 516 unit tests
and 618 summed passing outcomes including nested consumers; ignored native inventory
is not included as executed acceptance. The audit also passed four reactive native
cases, eleven same-host native cases and the four-test Hello Tasks native suite
(three scenarios plus helper), strict checks, CLI/ownership regressions and all
public sample gates. Fresh Tasks receipt is
`/tmp/reboot-rust-upstream-tasks-htt9gt_h/result.json` (three sessions, two app-free
shutdown inspections, nine commands, invocation counts 4/5/5/4).
Evidence: `/tmp/reboot-rust-user-http-full-audit-1791803454128973513/accepted.json`;
SHA-256 `4d6a510274cd7a71d36a7db0e0ba7df9618dbbcca936bad2aac43a3e0a6632fc`.
Local aggregate acceptance is not GitHub CI approval or full SDK parity; the
unchanged-public eventual-matching-ID and scheduling ACK claim limits above remain.

Bank shared transactions remain unfinished; Bank generation is an explicit opt-in
probe, not a supported runnable sample.

## Ordinary writer participation prerequisite (2026-10-12)

**Accepted bounded prerequisite, not Bank acceptance:** the retained candidate was
reviewed, repaired and freshly verified against one frozen implementation snapshot.
Generated-native strict Clippy, twenty registered real-C++ Database tests, three
custom native safety tests, SDK all-feature/all-target regression (620 passing
outcomes, zero failed, 150 ignored), strict SDK/example checks, and the Hello Tasks
native suite passed. The latter has three scenarios plus a child-worker entry
helper; ignored inventory is not executed acceptance. Fresh public Constructor
and Tasks generation/startup/restart/retry scenarios also passed. This is thirteen
focused gates, not a rerun of every capability in the historical nineteen-gate audit.

Read-only review exposed a synthesized writer/typed-transaction hook collision.
A real raw-descriptor RED control reproduced it; all emitted handler RPC/helper
names now share one collision check. The repaired regression covers rejected
writer/typed and shared helper collisions and accepted neighboring shapes. Final
frozen gates include the repair. Resource guards retain a 10 GB default and require
an explicit approved override; five boundary tests cover the 12 GB override and
independent 8 GiB free-space floor. Vlad authorized 12 GB after the initial build
crossed 10 GB; no source, proof or Cargo cache was deleted to manufacture a pass.

Ordinary non-constructor writers on generated transaction adapters can now join an
exclusive registered same-host caller transaction. They consume the one-use local
ticket before token verification, actor admission or handler execution; missing
or mismatched tickets fail closed rather than falling back to a metadata-created
transaction. The default `*_transaction_result` hook stages the mutated state in
the existing participant flow, not an independent Store/idempotent writer. Typed
method-declared errors use the existing rich-status and acknowledged leaf rollback
contract. Local registration includes ordinary writer identities; writer-only
services emit and compile their own transaction adapter without a dummy transaction
RPC. Ordinary external/database adapters retain their existing unary behavior.

The downstream generated receiver matrix additionally exercises ordinary writers:
unregistered receiver, wrong method/kind, malformed headers, changed request,
validated child path, policy denial, burned-ticket replay, and forged metadata
without a ticket. A writer-only generated adapter registers its exact method set,
rejects forged inbound metadata and remains usable for successive external writes.
Real generated/C++ Database tests cover sibling commit, prepared-crash recovery,
root typed-error Abort with exclusive readmission, and N1/N2/N3 same-actor reuse
with a caught declared N2 rollback and durable reader-task restart. Native writer
cases freshly execute plain/declared forged inbound metadata rejection and actor
readmission against the final frozen generated host.
N2 constructs but does not admit its task intent: this is not staged-task rollback.
The process fixture uses exact in-process participant resolution/static placement;
this is not public Bank, live-planner distributed or Python shared-Transfer proof.

Final source/evidence hashes, exact commands, counts and failure boundaries are in
[the checkpoint receipt](tests/evidence/ordinary-writer-checkpoint-20261012.json).
Its SHA-256 is `6505dc54f7772de6154242a254d3f569a078295b8f1a3f901f556bcfe07dc2e7`.
Core logs remain under `/tmp/reboot-writer-final-20261012`; public regression logs
are under `/tmp/reboot-writer-public-regressions-20261012`. All 259 selected source
hashes matched. Exact recorded PID/birth reconciliation covered 1,039 identities
across all four attempts: no matching live or zombie process remained, and the
shared owner lock was released. Earlier recovery/aborted-budget and namespace RED
logs are retained as failures, not acceptance. The pre-refresh ledger hash in the
public Tasks receipt records its execution snapshot; this documentation update
is separate bookkeeping. Historical aggregate `1791803454128973513` certifies only
its original checkpoint. The previously failing default-feature compile referenced test-support-only
uncertainty/completion inspections: both affected native acceptances are now explicitly
feature-gated and must still be executed with `test-support`; their assertions were not removed.
Unchanged shared `Bank.Transfer` still rejects its declared-error schema. True shared
multi-actor ownership, account lock upgrade/rollback, public Bank sample acceptance
and broad shared/factory/distributed writer participation remain unimplemented.


Publication audit `1791795011447592919` passed all 18 gates, including two Hello
Tasks native tests, all 11 same-host recovery cases, SDK all-feature/all-target tests,
strict SDK/consumer checks and the existing public User/workflow/greeting and
Constructor regressions. Every gate reported matching frozen sources and no live
owned processes. Evidence: `/tmp/reboot-rust-user-http-full-audit-1791795011447592919`;
focused recovery evidence: `/tmp/hello-warning-recovery-20261012T083304Z`.
Independent read-only review found no concrete blocker for this bounded recovery
proof. GitHub CI remains separate from local publication acceptance.

Publication audit `1791788930944937425` passed all 17 gates, including strict SDK
and generated-consumer Clippy, existing public User/workflow/greeting regressions,
11 same-host native recovery cases, pinned-example consumer checks and Hello
Constructors public restart acceptance. All 261 frozen inputs matched and every
gate reported no live owned processes. Evidence is local under
`/tmp/reboot-rust-user-http-full-audit-1791788930944937425`; GitHub CI is separate.

## Independent recovered Watch and partial-Prepare crash recovery

All registered participant ownership restores finish before coordinator recovery
and recovered Watch convergence are polled concurrently. Readiness waits for both;
participant Watches remain sequential among themselves. Existing sticky terminal
ownership, native ACK serialization and uncertainty failures remain authoritative.

Real registered A/B/C host-crash acceptance now covers a proper Prepare subset:
A/C are durably prepared, B is parked before its first durable Prepare, full
coordinator membership is persisted with `preparing == true`, and no terminal
decision exists. Original values and exact A/C-only prepared records survive a
same-RocksDB Database restart before recovery-host startup. Re-Prepare encounters
absent B, definitively rejects, and publishes immutable Abort. No presumed-absence
Abort or retry-policy change was introduced.

Both fully-prepared Commit and partial-Prepare Abort recovery park direct terminal
delivery after the immutable decision. Recovered Watches clear participant records
while the coordinator record remains, with values 5 for Commit and 4 for Abort.
Public ingress returns Unavailable and readiness remains blocked until coordinator
recovery is released. These cases assert terminal outcomes, not exact immutable
membership for every phase; exact Commit membership remains separately asserted.

Reusable reader acceptance now excludes extra state-type membership, asserts zero
preprepare participant records, and preserves Completed records through a second
actual Database restart and subsequent host launch with unchanged invocation and
mutation-entry logs. Fixture append logging writes each record as one buffer;
three reusable invocations have explicitly bounded Watch capacity three. Typed
Wait observes durable completion, not worker ACK receipt: a normal B reader acquires
the completion worker's actor gate before intentional shutdown, preserving rather
than suppressing the uncertain-shutdown safety failure.

Frozen twelve-gate audit `1791780883957777774` accepted all twelve exits zero:
SDK 592 passing results including nested consumers (491 library, 45 generated),
strict SDK/generated-consumer Clippy, native restart 4, ownership regressions,
CLI unit, public User/workflow/checkpoint restart, greeting, native registered-local
11 and strict native-fixture Clippy. All 238 frozen inputs matched before ledger
bookkeeping; recorded descendant PID/start identities were absent and the owner
lock was released. Applied static safety review found no scoped blocker; review
is distinct from execution. The user-approved target ceiling is 10 GB with an
unchanged 8 GiB free-space floor. Earlier failed audits remain uncertified.
No staged-N2-task rollback, general task-owner composition, arbitrary-depth stack
safety, parallel participant Watches or external exactly-once delivery is claimed.

## Registered reusable reader tasks and additional host-crash phases

The generated same-host public-root fixture now calls the same registered B
sequentially as N1/N2/N3 with fresh child paths under one root coordinator. N1
succeeds, N2 returns its genuine declared limit error without dooming the root,
and N3 observes N1's retained private value 27 rather than N2's rolled-back value.
The final committed values are A=12/B=40. N2 retains exactly one returned B writer.
N1/N3 task intents are admitted; N2's constructed intent returns before admission.
This proves private-state rollback and task non-admission, **not rollback of an
already staged N2 task**.

Only B owns singleton reader tasks. Task/policy/ownership configuration precedes
local registration, and all participants restore before coordinator/owner/task
recovery and readiness. Before Prepare fanout, original public values 5/20,
absent requested task records, no reader invocation and A/B writer membership are
observed. Actual blocked reader entry after Commit reads value 40; two Pending
records survive an owned-host kill and same-RocksDB Database restart. A fresh
recovery-only host uses generated typed Wait for both N1/N3 results equal to 40.
Completed records, invocation logs and mutation-entry logs remain unchanged across
another host launch. Those historical coverage limits are superseded by the newer
Database-restart, zero-participant-record and all-state-type membership assertions
in the accepted checkpoint above.

Additional two-actor crash cases park before Prepare fanout or after immutable
Commit before direct delivery (with live Watch parked). The former observes zero
participant records, one preparing coordinator and no terminal decision, then
recovers Abort with state 4. The latter observes prepared participants, a fully
prepared coordinator and immutable Commit membership before host death and again
after Database restart, then recovers state 5. Both clear outstanding worklists.
These are pre-fanout and post-decision cases, not interrupted partial-prepare proof.

Frozen twelve-gate audit `1791775682349426738` accepted all twelve exits zero:
SDK 591 passing results including nested consumers (490 library, 45 generated),
strict SDK/generated-consumer Clippy, native restart 4, ownership regressions,
CLI unit, public User/workflow/checkpoint restart, greeting, native registered-local
9 and strict native-fixture Clippy. All 238 frozen inputs matched before ledger
bookkeeping; recorded descendant PID/start identities were absent and the owner
lock was released. Source-only applied safety review found no scoped blocker and
identified the coverage limits above; it is distinct from execution acceptance.

## Registered chains, siblings and prepared-host-crash recovery

Exclusive nonfactory generated receipt-backed admission now includes bounded
supervised chains alongside root-star and reusable modes. Shared/factory methods
retain ordinary authorization without registered outbound permission. Sanitized
local wire headers do not reencode host-injected application identity; exact
one-use ticket equality and receiver verification remain mandatory.

Synchronous non-inlined future construction boxing now also covers guard
admission, ownership transitions and authorized-handler construction. Actual
public-root A-to-B-to-C and sequential A-to-B then A-to-C execute inline on normal
Tokio workers with `RUST_MIN_STACK` unset, commit state 5, and survive same-RocksDB
Database restart plus a fresh recovery-only host. This is bounded execution
acceptance, not arbitrary-depth stack safety. Source/disassembly review measured
large remaining branch frames; no stack override or detached local dispatch was
introduced.

Both A/B and A/B/C prepared-host-crash cases observe committed state 4, prepared
participant records and one fully prepared coordinator (`preparing == false`),
kill only their owned host child, and observe outstanding work again after
restarting the same RocksDB Database before starting recovery. The fresh host
restores all participants before canonical coordinator recovery/readiness, reads
state 5 without initialization or mutation rerun, and clears both worklists.
No-rerun evidence is source control flow, not an independent invocation counter;
prepared snapshots check counts/flags, not exact transaction-path identities.
This historical crash point precedes immutable Commit publication. The newer
section above adds pre-fanout/post-decision and reusable reader-task acceptance;
partial-prepare crashes and independent recovered Watch settlement are now
proved by the newer checkpoint above; C-specific Watch gate release remains unproved. The separate
live Watch acceptance still covers B in the two-actor case.

Frozen twelve-gate audit `1791773771269816780` accepted all twelve exits zero:
SDK 591 passing results including nested consumers (490 library, 45 generated),
strict SDK/generated-consumer Clippy, native restart 4, ownership regressions,
CLI unit, public User/workflow/checkpoint restart, greeting, native registered-local
6 and strict native-fixture Clippy. All 238 inputs matched; recorded descendant
PID/start identities were absent and the owner lock was released before this
ledger/fingerprint bookkeeping. Applied source reviews found no scoped blockers;
reviews are distinct from execution. Failed audits `1791773106084911634` and
`1791773377460667822` exposed test-module placement and generated constant-boolean
lint failures respectively; only this replacement certifies the repairs.

## Inline registered transport and call-drop cancellation

Generated exclusive transaction flows now construct cleanup/abort futures through
synchronous non-inlined `boxed_generated_future` thunks. They invoke each closure
once and box without polling or introducing a scheduling boundary. The native
registered A-to-B fixture directly awaits the local call on a normal Tokio worker,
without the former inner child task or a worker-stack-size override. Both native
commit/restart and live decision-Watch cleanup cases pass with `RUST_MIN_STACK`
unset. This is bounded execution evidence, not an all-path stack-safety proof or
a measured post-repair frame-size claim.

The generated fixture additionally drops calls inside the real B handler, during
registered service readiness before B is called, and after forwarding genuine
successful participant trailers but before actual EOF. It observes future/body
drop, revoked retained B-context outbound permission where applicable, empty
parent returned membership and no participant Prepare/Commit requests. Actual EOF
remains necessary for private terminal settlement; the two real trailer layers
introduce no synthetic receipt or duplicate authority. These are call-drop cases,
not host-revocation variants. The Database fixture is ACK-only, not native
cancellation durability evidence; explicit private-ledger uncertainty assertions
remain unproved. The later bounded prepared-host-crash checkpoint above
supplies outstanding-work recovery evidence for its specified crash point.

Frozen twelve-gate audit `1791770034263609620` accepted all twelve exits zero:
SDK 590 passing results (489 library, 45 generated), strict SDK and generated
consumer Clippy, native restart 4, ownership regressions, CLI unit, public User,
workflow and checkpoint restart, greeting, native registered-local 2 and strict
native-fixture Clippy. All 238 inputs matched; exact recorded descendant
PID/start identities were absent and the owner lock released before publication
bookkeeping. Applied source reviews found no blockers within these stated limits.
Earlier audit `1791769861828261311` failed two codegen assertions expecting the
old direct cleanup spelling; only the replacement audit certifies their repair.

## Registered same-host generated transport and native settlement

Explicit `TransactionalRoute::RegisteredSameHost` now dispatches through the
admitted host's exact registered service, bound one-use child ticket and private
terminal capture/consumption. The default route remains `Network`. Route failure
never falls back to networking; ordinary receiver verification and authorization
remain mandatory. Callback rejection or parent doom fails before allocation.

The generated success fixture observes actual codec/trailer settlement and two
Prepare payloads containing A/B state 5 plus two Commit requests. Its ACK-only
Database is not durable readback evidence. The native registered A/B fixture uses
the same actual participants for adapters, exact resolver and recovery, and
initializes through generated public Apply methods without direct Database seeds.
Both committed states are 5 and recovery worklists are empty before and after
restarting the same RocksDB Database. With direct commit fanout parked after its
persisted decision, actual B Watch terminalizes and releases the actor gate:
registered B Apply(0) returns 5 before direct fanout resumes. Recovery restores
both participants before coordinator recovery/readiness.

Frozen twelve-gate audit `1791767571244830705` accepted all exits zero: SDK 590
passing results (489 library and 45 generated), strict SDK/generated-consumer
Clippy, native restart 4, ownership regressions, CLI unit, public User/workflows/
checkpoint restart, greeting, native registered-local 2, and strict native-fixture
Clippy. All 238 frozen inputs matched; recorded descendant PID/start identities
were absent and the owner lock released before this ledger/fingerprint update.
Applied source-only transport and native reviews found no introduced blockers;
reviews are separate from execution acceptance.

This earlier checkpoint scope is exclusive nonfactory single A-to-B, live decision Watch settlement and
post-cleanup Database restart durability. Outstanding-work host-crash recovery,
deeper/sibling/task composition, factory/shared eligibility and authorization
exemptions are not certified. The later inline/call-drop checkpoint above removes
the inner native fixture child task and supplies bounded normal-worker execution
and midtransport call-drop evidence. No retries/manual settlement or
metadata-based internal authority have been added.

## Generated registered-local ticket receiver

Exclusive non-factory generated transaction receivers now consume the opaque
local ticket before verification or participant/storage access, validating the
actual registered binding/configuration, canonical method, sanitized headers and
request bytes. They use the issued child context directly, retaining ancestry
and avoiding a second allocator. Invalid tickets never fall back to ordinary
inbound execution. Missing registration/configuration, malformed headers and
unsupported factory/shared execution burn the shared ticket state on rejection.
Ordinary verification and authorization remain mandatory; no policy exemption
has been introduced.

An actual live registered parent fixture exercises eight independent cases:
unregistered receiver, factory/shared rejection, malformed transaction metadata,
modified body, exact child handler execution, missing authorizer and configured
policy denial. Every case allocates once at issuance and rejects a retained
clone before further participant/handler access or policy verification. The
positive child receives path `[201, 202]` without bearer/cookie credentials.
Actors are initialized through ordinary public generated writers. Each fixture
intentionally aborts the parent; direct receiver tests do not establish successful
codec/trailer transport, parent settlement or native same-host A-to-B durability.
Configuration-failure burning has source review but no dedicated injected case.
Applied read-only review found no introduced safety blocker.

Frozen ten-gate audit `1791764187375442648` accepted: SDK 590 passing results
including nested generated consumers (489 library, 33 owned-unary, generated 45),
both strict Clippy gates, native restart 4, process ownership, CLI unit, public
User/workflows/checkpoint restart and greeting. All ten exits were zero; 236
frozen inputs matched, recorded descendant PID/start identities were absent and
the owner lock was released before this ledger/fingerprint update. Earlier audit
`1791763951454249950` failed generated-consumer Clippy on an error-inspection
idiom; emitted `inspect_err` repairs it without suppressing warnings. Only the
replacement audit certifies the repaired checkpoint.

The later registered same-host checkpoint above certifies transport, private
terminal settlement and bounded native A-to-B post-cleanup restart. Narrowly
capability-bound missing-authorizer handling and retained/task acceptance remain
unfinished. Configured denial stays authoritative; ordinary metadata/internal-call
flags confer no authority.

## Registered-local directory and one-use child ticket primitive

The same-host directory retains the exact configured service and allocator,
with weak binding ownership, exact target/method/configuration checks and
fail-closed lookup. It does not itself grant execution authority.

Registered outbound handlers can now issue an opaque, shared one-use ticket for
an exact destination/request. The retained destination allocator runs once outside
reservations; the actual child receives sanitized protocol headers and immutable
parent ancestry, not inherited credentials, own lifetime or outbound permission.
Mint and consume fence host, ordered lifetimes and branch ledger. A private
per-scope admission lease is invalidated on every terminal completion and Drop;
post-callback validation rejects doom, closure and membership uncertainty.

The primitive regression loops through 28 cases: replay/input mismatch, callback
branch invalidation, allocator/serializer host and parent revocation, terminal
completion without Drop, and no-ledger consume-before/after-Drop orderings.
Success/recoverable completion keeps a sibling active to isolate the exact lease;
rollback requires one active scope. Private unit terminal fixtures are not wire
terminal authority. No-ledger overlapping consumption may linearize before Drop;
controlled orderings are not exhaustive concurrent-race proof. Applied read-only
review found the prior stale-scope blocker closed at source level.

Frozen ten-gate audit `1791760916562807146` accepted: SDK 588 passing results
including nested generated consumers (488 library, 33 owned-unary, generated 44),
both strict Clippy gates, native restart 4, process ownership, CLI unit, public
User/workflows/checkpoint restart and greeting. All ten exits were zero; 236 frozen
inputs matched, recorded PID/start identities were absent and the owner lock was
released before this ledger/fingerprint update.

The primitive alone is not secured generated dispatch. Receiver consumption is
now exercised above; narrowly capability-bound policy handling, actual local
codec/terminal transport and native A-to-B retained/task/restart acceptance remain
unfinished. Configured B policy denial must remain effective;
ordinary metadata/internal-call flags confer no authority and invalid local tickets
must never fall back to network execution.

## Observed host generation reserved through ledger mutation (2026-10-12)

Registered outbound admission and all three runtime-owned terminal disposition
paths now acquire an exact-configuration host Ready reservation before ordered
ancestor/own lifetime reservations and ledger mutation. The short synchronous
regions retain that observed-generation read through membership changes and
completion; they contain no await, gate reread or user callback. Scope Drop stays
unfenced so cleanup after revocation can clear activity and retain uncertainty.

Ready/revoked private-seam tests cover successful membership, rollback membership
and recoverable settlement. Channel-controlled contention tests pause actual
reservation acquisition and exercise registry revocation against admission and
all three disposition paths. The bounded writer-start observation is contention
coverage, not deterministic queued-lock instrumentation. Actual Tonic network
success/declared rollback tests with privately installed registered permission
consume real terminals, settle exact membership and preserve it after later
revocation. They do not prove generated B authorization or ticket dispatch.

This fences ledger mutations against the observed host-gate writer only, not
asynchronous source placement/recovery readiness. Secured one-use B-child tickets,
production ancestry insertion, local receiver integration and native A-to-B
retained/task/restart acceptance remain unfinished.

Fresh frozen ten-gate audit `1791758675639183610` accepted: SDK 586 passing tests
(486 library, including 33 owned-unary regressions; generated 44), strict SDK and
generated-consumer Clippy, native restart 4, process ownership and CLI unit gates,
public User restart/workflows/checkpoint and greeting. All exits zero, frozen
hashes matched and recorded descendant PID/start identities were absent. The
owner lock was released before this intentional ledger/fingerprint update.

## Generated registered lifecycle and observed outbound host fencing (2026-10-12)

Generated adapters expose an exact-configuration observed-Ready preflight;
Starting, shutdown and configuration-invalidating builders fail closed. Actual
registered root-star and sequential-reusable handler fixtures receive guard-bound
permission, while registered plain-exclusive handlers do not. These fixtures use
real ApplicationHost lifecycle and mock sidecars/direct generated service calls,
not native A-to-B dispatch or durability.

Contexts carrying registered permission reject new outbound admission after host
revocation or destruction, before ledger mutation. Pending resolution and pending
wire responses also observe host loss independently of the still-live handler
lifetime. Cancellation drops unfinished scopes, clears activity, preserves
membership uncertainty and returns no participants. Tests cover host destruction,
live-registry revocation after actual Tonic wire admission, revocation before the
first poll without entering a ready resolver, and unchanged ledger bookkeeping
on rejected subsequent admission.

This is observation-only fencing: revocation concurrent with a synchronous
successful poll is not atomically fenced admission or settlement. No tickets,
production ancestry insertion, secured local transport, remote cancellation or
native retained A-to-B acceptance are claimed.

Fresh combined ten-gate audit `1791757516006719869` accepted unchanged frozen
inputs with every gate exit zero and recorded descendants absent: SDK 583 passing
tests (483 library), generated 44, strict SDK and generated-consumer Clippy,
native restart 4, public User restart/workflows/checkpoint and greeting regressions.
The owner lock was released before this ledger update. Prior evidence below
remains historical rather than certification of subsequent source.

## Guard-bound registered outbound permission (2026-10-11)

Supported generated exclusive nonfactory sequential-reusable/root-star handlers
now receive an opaque local outbound permission only at the actual guard boundary:
a consumed policy-entry receipt, exact admission/owner validation, matching host
binding/configuration and an observed Ready reservation precede installation into
the fresh live handler context. The short reservation covers synchronous field
installation only; it is not an atomic source-placement fence. Ordinary policy
checks remain in force. No receipt, public metadata or inherited bearer grants
this permission. Unsupported generated modes supply no registration permission.

Direct context clones retain permission identity; locally derived nested contexts
and reconstructed wire headers do not. Ownership comparison rejects stripped or
replaced identities. Actual guard regressions cover receipt absence, binding
configuration mismatches, valid registrations differing from actual admission,
revoked host rejection, host destruction during a pending handler and permission
revocation after return/cancellation. Sequential-reusable cancellation fixtures
retain prior sibling effects and Watch cleanup; they are not completed rejection
results for every new case. Focused source review found no introduced blocker.

Fresh aggregate acceptance:
`/tmp/reboot-rust-user-http-full-audit-1791755709355280812/accepted.json`:
all **10 gates** exit zero, **580 SDK tests** (including library **480**, generated
consumer **44**), both strict Clippy gates, native **4 cases**, public User,
workflow/checkpoint persisted restart and greeting regressions. Frozen hashes
matched and exact recorded descendants were absent before publication bookkeeping.

**Limits:** generated eligible/unsupported-mode in-handler integration and host
loss between initial validation and final reservation remain unverified. This
checkpoint does not implement one-use B-child tickets, secured same-host transport,
production ancestry insertion or native A-to-B acceptance. Existing native/public
passes are regression evidence, not acceptance of that unfinished vertical.

## Configured inbound allocator and observed host reservations (2026-10-11)

Registry-held generated Tonic templates now retain the exact configured inbound
factory Arc used by the registered adapter. Registration and template cloning do
not allocate; the generated consumer checks pointer identity and one explicit
actual factory invocation. A default-policy denied encoded RPC does not allocate
another child. Factory access is trusted Rust composition, not an authorized
one-use child ticket; retained factories/templates may outlive the host while
registration binding validity cannot.

The successful-participant trailer layer wraps the actual generated service before
erasure. Tests verify staged markers are consumed, participant metadata is absent
from initial headers and denied terminals, and exact actor/ref JSON appears only
on a successful trailer. Errors, pending bodies and EOF are forwarded rather than
inventing terminal evidence. This is not yet local transactional dispatch.

Opaque short synchronous host reservations hold the observed Ready watch read
lock through their caller's immediate mutation; wrong configurations, Starting and
Revoked fail closed. Reservations must not cross await, host Drop/revocation or
same-host reentrant gate reads through any binding clone: a queued writer plus a
second read can deadlock. These reservations are not yet integrated with runtime
ledger settlement or ticket issuance, and do not reserve source placement/recovery
state; readiness monitoring remains asynchronous.

Independent revocation waiters wake on generation revocation, host destruction,
sender closure and uncommitted provisional bindings. Dropping a waiter does not
revoke the owner. Targeted tests include pending destruction without prior revoke,
closure while host identity remains live, and escaped uncommitted bindings across
eight actual failed-registration modes. Focused review found no blocking
allocator/trailer regression and identified the reentrant-read contract/test gaps,
which were addressed before this acceptance.

Fresh aggregate publication acceptance:
`/tmp/reboot-rust-user-http-full-audit-1791753658843288282/accepted.json`.
All **10 gates passed**: SDK **579 tests** (nested downstream summaries included),
SDK library **479**, generated consumer **44**, default consumer **1**, plugin **4**,
SDK and generated reactive-consumer strict Clippy, focused native **4 cases**,
ownership/CLI units and public User/workflows/checkpoint restart/greeting. Frozen
hashes matched, all exact recorded descendant identities were absent, owner lock
released, and resource guards passed before this ledger update.

Policy-bound outbound permission, actual allocated B-child one-use tickets,
secured local runtime dispatch/terminal settlement, immutable production ancestry
insertion, runtime host-reservation integration and same-host native A/B acceptance
remain unimplemented. Earlier sections retain their checkpoint-specific evidence;
this is not broad parity, full native inventory or secure internal authority.

## Registered local composition prerequisites (2026-10-11)

The current checkpoint adds host-owned registration and actual generated Tonic
service templates. Exact canonical actor type/ref, Database endpoint, eligible
exclusive non-factory method set, policy identity and adapter incarnation are
bound together. Provisional bindings remain invalid through failed registration;
configuration-changing generated builders invalidate the binding. Clones retain
it. This is trusted Rust host composition, not attestation against malicious host
code and not internal-call authority.

Registration survives initial/running/serving host transitions and parked
lifecycle cleanup, but weak bindings cannot retain host identity after destruction.
The separate Starting/Ready/Revoked gate observes recovery and placement readiness.
Revocation precedes early failure/shutdown cleanup; the placement epoch baseline
is captured before monitor spawn. Revoked generations cannot reopen. This gate
is an observation API, not an atomic execution or settlement reservation.

Registry-retained templates construct the real generated Tonic server from the
same configured adapter. Erasure releases its template lock before polling and
uses the same service clone for readiness and invocation. An encoded in-process
Increment RPC still receives default-policy PermissionDenied before handler or
Database writes. Retained templates can remain Tower-ready after host destruction
while registration validation fails: ordinary service readiness is not authority.
The generated validation helper boxes its status error without lint suppression.

Private ordered ancestor identity, duplicate/bound checks, multi-channel waits
and settlement reservations are implemented and tested. Production ancestry is
still empty. Immutable parent-prefix insertion is NOT yet implemented; private
unit fixtures alone cannot establish provenance or exclude arbitrary reparenting.

Fresh aggregate publication acceptance:
`/tmp/reboot-rust-user-http-full-audit-1791752099392552443/accepted.json`.
All **10 gates passed**: SDK **573 tests** (including nested downstream summaries),
SDK library **473**, generated consumer **44**, default consumer **1**, plugin **4**,
SDK and generated reactive-consumer strict Clippy, focused native **4 cases**,
ownership/CLI units and public User/workflows/checkpoint restart/greeting.
Frozen source hashes matched, all recorded exact descendant identities were absent,
and the owner lock was released before this ledger update. Final resource guards
passed. Focused reviews found no concrete remaining introduced defect in the
registration/generated template path; identified canonical-target and lifecycle
revocation/epoch defects were repaired and exercised before this acceptance.
The earlier failed audit `1791751864416844683` is retained: strict generated-consumer
Clippy rejected the unboxed validation result before the repair.

This is a bounded prerequisite checkpoint. Policy-bound outbound permission,
one-use inbound tickets binding the actual allocated B child, secured local
transport/terminal dispatch, host execution reservations, immutable production
ancestry insertion and same-host native A/B acceptance remain unimplemented.
No broad native inventory, secure internal authority or overall parity is claimed.
Earlier sections retain their original checkpoint evidence and limitations.

## Revocable generated-handler lifetime (2026-10-11)

Actual guarded generated handlers receive a private lifetime-bound context.
Return or cancellation revokes retained direct/nested clones; the original guard
context remains available for ordinary post-handler staging. Rebinding a live or
revoked lifetime fails closed. Scope identity includes its private lifetime
channel, preventing an unbound source context from stripping revocation.

Common outbound admission rejects revoked contexts before ledger/request mutation.
Raw routing and runtime-owned unary waits observe revocation; pending routing,
response, body and terminal consumption are interrupted. Synchronous scope
allocation and successful/rollback/unsupervised terminal settlement hold watch
read reservations through ledger mutation, serializing with owner revocation.
Abandoned admitted scopes retain membership uncertainty, not invented terminal
ACKs. No remote cancellation or exclusion of concurrently issued wire work is
claimed. This is revocation only, not same-host registration/internal authority.

The actual guard unit fixture covers valid receipt and separately-authorized
receipt-free entry, each with normal return and cancellation after invocation;
direct/nested retained clones fail admission without changing the source ledger.
Raw/scoped helper rejection, rebinding, source-context scope mismatch and actual
Tonic routing/response waits are covered. Raw HTTP/2 body/trailer pauses include
revocation with simultaneous release and prove no terminal settlement.

Fresh aggregate publication acceptance:
`/tmp/reboot-rust-user-http-full-audit-1791747921140123379/accepted.json`.
All **10 gates passed**: SDK **554 tests** (nested downstream summaries included),
generated consumer **43**, default consumer **1**, plugin **4**, SDK and generated
consumer strict Clippy, focused native **4 cases**, ownership/CLI units and public
User/workflows/checkpoint restart/greeting regressions. Focused source review
found no concrete blocker in lifetime identity, cleanup or watch/ledger/doom lock
ordering. This is a bounded prerequisite checkpoint, not broad parity or secure
local-dispatch acceptance. Registered host authority, ancestor composition,
exact preallocated B-child tickets and same-host native acceptance remain open.

## Authorization-backed handler entry and rejection cleanup (2026-10-11)

Selected generated root-star/reusable handlers now retain an opaque decision
receipt from the existing single policy evaluation. Consumption binds the private
policy identity, exact SDK admission incarnation, original transaction ownership,
actor/method and immutable state/request bytes. The guard independently validates
installed ownership and the current effective retained snapshot, rejects stale
or pre-reservation admissions, and rechecks host ownership after awaiting the
participant mutex. This is authorization-entry evidence, not internal-call or
same-host dispatch authority.

Generated outer rejection routes through the existing awaited root Abort or
inbound Watch cleanup. Fixture-local emitted-code request-byte corruption tests
that unchanged branch without an SDK fault hook. The registered-root test uses a
direct generated service-trait future, not a Tonic client RPC: ApplicationHost
activates its actual owner; participant Abort is parked until explicit ACK, while
response completion, root registration, owner capacity and actor admission remain
reserved. No handler, Prepare or Commit runs before ACK; after ACK registration
and a normal fresh-root execution succeed. Sidecars are mocks, not native proof.
The generated inbound rejection test preserves N1 effects and one stable Watch,
rejects N2 before handler/effects/success metadata, and permits N3.

Pre-handler cancellation transfers exact-call relinquishment to the reserved
live owner. The cleanup obligation is synchronously disarmed before handler
invocation, so arbitrary handler failure/cancellation gains no rollback authority.
Mutex-blocked validation and rejection-cleanup cancellation preserve retained
state and admit N3. Failed relinquishment instead retains the exact execution
barrier and reports owning-host failure immediately: queued Prepare remains
blocked, no native Prepare runs and N3 is rejected. Existing Watch ownership and
restart/recovery uncertainty are retained; no speculative Abort is introduced.

Private transport-independent unary consumption is extracted and exercised via
actual in-process Tonic success/declared-error settlement. It grants no local
provenance and preserves original-terminal evidence requirements.

Fresh publication acceptance:
`/tmp/reboot-rust-user-http-full-audit-1791745672651700822/accepted.json`.
All **10 gates passed**, including SDK **550 tests** (nested generated-consumer
summaries included), generated fixture **43 tests**, default consumer **1 test**,
plugin **4 tests**, both strict Clippy gates, focused native **4 cases**, ownership
and CLI units, public User, workflows/transactions, instrumented checkpoint
restart and public greeting. Focused final applied-source repair review found no
concrete blocker. Frozen source hashes matched; all exact owned-process identities
were absent and the owner lock was released before this ledger update. Final
resource guards passed. This is not full native inventory or overall parity.

Secured same-host registration, revocable outbound lifetime/internal dispatch and
exact allocated B-child binding remain unimplemented. The existing native network
N1-success/N2-declared-rollback/N3-success regression is not secured local-dispatch
acceptance. No production-readiness or full-parity claim is made.

## EOF-confirmed terminal evidence and retained-sibling regression (2026-10-11)

The private original-wire observer now wraps a generic readied service while
retaining the network Channel alias. Terminal trailers are withheld until actual
body EOF; Pending does not certify them, and any subsequent frame or body error
invalidates evidence. Successful membership and trailing-error recovery explicitly
require confirmed EOF. Eight observer tests include genuine Tonic consumption,
valid duplicate trailers, late DATA, rich-error controls, Pending/wakeup,
cancellation/drop and post-trailer errors. This private seam provides no local
provenance, public receipt or authorization capability.

The separate-process generated CXX retained-participant fixture additionally
executes N1 success, N2 declared rollback and N3 success, verifies retained writer
state and task disposition, and restarts against persisted state. It proves
retained-writer state rollback, not rollback of a staged N2 task: N2 aborts before
scheduling. It does not establish secured same-host composition.

Fresh full publication acceptance:
`/tmp/reboot-rust-user-http-full-audit-1791740126459346176/accepted.json`.
All ten gates passed, including SDK **542 tests**, both strict Clippy gates,
focused native **4 cases**, ownership and CLI units, ordinary public User,
workflows/transactions, instrumented checkpoint restart and public greeting.
Separate generated N1/N2/N3 native acceptance passed before these audits.
Applied-source review found no concrete new EOF-strengthening defect. Frozen
hashes matched and exact owned-process identities were absent; the owner lock was
released before this ledger update. Target/free-space guards passed. The earlier
all-behavioral-pass audit `1791735866432902440` failed its final target-size guard
and remains unchanged, not accepted. Only approved build-script cache cleanup was
performed before this fresh full run.

Host registration, authorization-backed handler admission and exact allocated
child binding remain unfinished; no full native inventory, production readiness
or full parity claim is made.

## Runtime-owned original-wire terminal validation (2026-10-11)

Generated transactional unary calls now decode exactly one response message and
settle successful membership only from actual terminal trailers carrying one
literal `grpc-status: 0`. Initial response metadata cannot authorize membership.
Admission is rechecked across awaits; cancellation or owner closure preserves
uncertainty rather than admitting late membership.

A private per-RPC Channel/body observer captures original header/trailer maps
before Tonic strips error status metadata. Recovery requires a singleton canonical
nonzero wire status, consistent rich details, and independently percent-decoded
valid UTF-8 `grpc-message` matching the returned status. Duplicate/conflicting or
missing statuses, duplicate message/rich headers, mismatched envelopes, malformed
base64 and synthetic malformed-message diagnostics fail closed. Sanitization of
malformed base64 affects only the forwarded decoder input; original evidence
remains invalid. Genuine singleton declared-error recovery is retained.

Actual raw HTTP/2 regressions cover trailers-only, before-message and after-message
errors on supervised/default paths, genuine controls, successful cardinality and
initial-header forgery. The server trailer regression exercises the real layer's
extension extraction and body wrapping. Server-body pauses are synchronization
fixtures, not proof that the client consumed a message.

Fresh acceptance artifact:
`/tmp/reboot-rust-user-http-full-audit-1791734050943922736/accepted.json`.
All ten publication gates passed: SDK **534 tests**, strict SDK and generated
consumer Clippy, focused native **4 cases**, ownership regressions, CLI units,
ordinary public User, public workflows/transactions, instrumented checkpoint
restart and public greeting/watch/restart/supervision regression. Frozen source
hashes matched; exact retained process identities were absent and the owner lock
was released before this ledger refresh. Applied-source safety review preceded
this audit. Earlier pre-repair audit passes do not certify this repair.

Exact immutable participant routing is also tested with distinct endpoint routes;
that configuration seam is not public-ingress authentication or generated
same-host composition acceptance. Secured A-to-B retained-sibling composition,
private handler admission capabilities and host-owned local transport remain
unfinished. No full parity, ignored-native inventory or production claim is made.

## Signed User public transactions and instrumented checkpoint acceptance (2026-10-11)

The generated secured-user scaffold adds separate `OwnerTransactionsMethods`
(`Apply`, `Inspect`) over the configured `OwnerWorkflows` actor and its shared
Database store/admission gate. Checked arithmetic and declared failure exercise
real transaction rollback; keyed Apply replay returns historical results without
reapplying mutations. Workflow and transaction services preserve each other's
fields, with one task owner and canonical public Tasks.Wait.

Participant restoration precedes durable coordinator and task recovery/readiness.
Participant/Coordinator control services are not mounted on the public listener:
exact single-actor in-process participant and Watch routes are used instead.
Public transaction ingress rejects inbound transaction metadata, including a
syntactically valid structured bundle, rather than treating loopback as authority.
Foreign actor rejection is single-participant identity preflight, not owner-policy
certification. Canonical owner-target credential denial is separately exercised.

The unmodified generated consumer passed real public CLI/CXX/RocksDB acceptance:
rollback, overflow, historical keyed replay, missing/invalid/expired/wrong-owner
credentials, launcher restart and same-actor field preservation. A separate
**instrumented generated-consumer acceptance fixture**, not the production
scaffold, pauses after the first named checkpoint. It compares exact actor/task,
request/iteration, named-step UUID/fingerprint/typed bytes before shutdown, after
app exit with Database still live, and at paused restart. Canonical Wait then
completes and replay preserves terminal state. Intentional app/Database shutdown
requires requested shutdown, exit zero and absence; preexisting exits are rejected.

Fresh combined audit passed all **ten gates**: SDK **527 tests**, strict SDK and
consumer Clippy, focused native **4 cases**, ownership **12 regressions**, CLI
units, ordinary public User, public workflows/transactions, instrumented checkpoint
fixture and retained public greeting/watch/restart/supervision regression.
Accepted artifact:
`/tmp/reboot-rust-user-http-full-audit-1791730170412597128/accepted.json`.
All exits were zero with matching frozen inputs and no recorded live owned
processes at completion or subsequent exact-identity reconciliation. Targeted
artifact `1791729805446869671` passed separately but is not publication acceptance.
Reproduce with `tests/reboot/cli/rust_user_acceptance_runner.py`; the
`--targeted-user-batch` mode is explicitly nonpublication. The documentation checker
now fingerprints the checkpoint fixture too; this checker-only change and ledger
refresh follow semantic acceptance and are verified separately.

Scope is bounded fresh single-actor roots and intentional checkpoint interruption.
No trusted public inbound tree, secured retained-sibling/deeper composition,
authenticated cross-process internal transport, arbitrary-crash/prepared recovery,
OAuth/production/external-exactly-once or full ignored native recertification is
claimed. The preceding workflow checkpoint's exclusions describe its historical
acceptance, not this additional bounded transaction/instrumented proof.

## Signed User public workflows checkpoint (2026-10-11)

The generated `secured-user` scaffold now supports opt-in single-owner workflow
hosting via `RBT_USER_WORKFLOW_OWNER`, alongside ordinary signed User RPCs and the
separate HTTP gateway. A distinct descriptor-backed `OwnerWorkflowsMethods`
service provides explicit authenticated construction, atomic keyed scheduling,
and two named local writer checkpoints (`first-effect`, `second-effect`). One
configured actor has one task owner/recovery registration and canonical public
`rbt.v1alpha1.Tasks.Wait`; recovery starts before public admission/readiness.

The application-owned workflow authorizer requires verified identity, exact
canonical target and state type. Descriptor User defaults alone would allow other
principals to construct their own actors; this singleton contract explicitly
rejects that. Ordinary User services retain their descriptor-owner policy, using
the same signed verifier. External SetClaims and direct public Run are denied.
Workflow mode rejects reactive registry/composition configuration.

Fresh final nine-gate acceptance passed SDK **527 tests**, strict SDK and generated
fixture Clippy, focused native **4 cases**, Linux ownership **12 regressions**,
CLI units, ordinary signed User/HTTP, secured workflow public CLI and greeting
watch/restart/supervision/failed-build regressions. The workflow gate uses an
unmodified real `rbt init` scaffold and actual `rbt dev` CXX/RocksDB runtime:
missing/invalid/expired/non-owner denial; another principal's self-target Create
rejected with canonical actor absence; explicit owner Create; public Run denied
without mutation; scheduling-key replay returns one task UUID/counter; old host
shutdown completes before task eligibility; restart returns typed `7/7` through
canonical Wait, repeated Wait and schedule replay retain actor `7/7/1`; exact
canonical actor type/reference and process cleanup are checked. The ordinary
User/HTTP regression matrix also runs with workflow services mounted.

Accepted local artifact:
`/tmp/reboot-rust-user-http-full-audit-1791727420716185562/accepted.json`.
All nine exits were zero, frozen inputs matched and recorded exact process
identities were absent after reconciliation. The earlier accepted stage
`1791726924796292378` lacks the final three proof assertions and is not final
checkpoint certification. Reproduce through
`tests/reboot/cli/rust_user_acceptance_runner.py`, with a compatible canonical
CXX Database supplier and sole-owned budgeted target.

Scope remains experimental loopback, a single configured workflow owner and
acknowledged scheduling across a normal launcher restart. This does not establish
public interruption after the first named checkpoint, arbitrary-crash recovery,
public secured transactions, OAuth/automatic registration, production safety,
external exactly-once, or full ignored native inventory recertification.

## Signed User public HTTP checkpoint (2026-10-11)

The secured User scaffold now offers opt-in `app --user-http`: a separate
loopback-only gateway pinned to one configured owner and literal loopback RPC
origin. GET `/user`, POST `/user/create` and POST `/user/greet` forward bearer
credentials through the ordinary secured RPC boundary on every call, including
receipt replay. Mutation bodies are explicit UUID keys, bounded to 1024 bytes;
body consumption has a one-second deadline and RPC execution a five-second
deadline. Duplicate Authorization headers and invalid configuration fail closed.
Unknown mutation outcomes require retrying the same UUID, not a new key.

Actual unmodified generated-app acceptance exercises CXX/RocksDB construction,
HTTP/CLI historical replay versus current state, missing/invalid/expired/wrong-owner
receipt denial before and after restart, forged headers, oversized/chunked/stalled
bodies, and independent HTTP/RPC shutdown and upstream-unavailable responses.

**Fresh acceptance based on `03a4f09622dabc0457fad0196740ea63ff38e432`:**
`/tmp/reboot-rust-user-http-full-audit-1791725192880321920` accepted all eight gates:
ownership regressions, SDK 527 passes, strict SDK and generated-consumer Clippy,
focused native 4/4, CLI units, secured User public HTTP and unchanged public greeting
regressions. All gates exited zero with no surviving recorded owned children;
226 frozen inputs matched. The runner reconciles exact tracked and adopted Linux
children before acceptance publication, retaining exclusive build ownership through
observation/evidence failures and deferred interruptions. Twelve actual-runner and
shutdown regressions cover orphan adoption, lock exclusion, torn snapshots, closed
diagnostics, failure suppression and publication only after natural exit/reaping.
Bounded source review approved this dedicated Linux runner, not SIGKILL resilience
or a global process guarantee. Earlier interrupted/pre-repair audits are not this
checkpoint's certification. Ledger fingerprint refresh is publication bookkeeping.

This remains an experimental separate-process local gateway, not production
HTTP/gRPC multiplexing, OAuth, automatic registration, public secured workflows/
transactions/tasks/reactive parity, full-native inventory recertification or
merge-result CI. Raw Database requires an isolated trusted network. No external
side-effect exactly-once or zero internal-invocation claim is made.

## Signed User public CLI checkpoint (2026-10-11)

`rbt init --backend=rust --rust-example=secured-user` now generates an unmodified
ordinary constructor/reader/writer application using descriptor PER_USER_ID ownership
and an application-configured signed credential verifier. The opt-in `jwt-auth`
feature pins RS256, checked public-only RSA keys of 2048..4096 bits, exact string
issuer, matching audience, integral nonnegative expiry strictly after now and
optional integral not-before at or before now. Verified nonempty subject supplies
ownership; the scaffold never selects permissive development authentication.
Configuration failures fail closed. Ephemeral test signing material is not shipped.

Fresh public acceptance launches actual rbt dev with CXX/RocksDB. Owner calls before
explicit Create do not construct the actor. Keyed Create replays its original 0;
fresh duplicate keys deny and leave canonical state unchanged before/after restart.
Missing, invalid, expired and malformed credentials cannot read or disclose keyed
writer replay. Wrong owners and external SetClaims deny. Historical writer replay
returns 1 while current persisted state/read returns 2 after restart.

**Fresh repaired-source acceptance based on
`0f076b69cd8ad1822e71511e601407eb1123abc9`:**
`/tmp/reboot-rust-signed-user-full-audit-1791715355637386080` records SDK 527 passes
including nested consumers (library 430, generated consumer 41, JWT integration 4),
strict SDK and reactive-consumer Clippy, focused native 4/4, CLI units, secured User
public acceptance and unchanged greeting/replay/watch/restart/supervision/failed-build
regressions, all exit 0. All 222 frozen files match and recorded owned process
identities are absent; exclusive owner lock is released. Final applied source review
confirmed supported RSA range and both upper-bound PEM verification tests, plus
fresh duplicate-Create keys and state assertions. Pre-repair acceptance is retained
but is not the certification for this checkpoint. Ledger/checker fingerprint refresh
is subsequent publication bookkeeping, not a semantic rerun or runtime proof.

This is experimental local ordinary User application acceptance, not OAuth, automatic
registration/construction or claims delivery, revocation-list integration, public
secured tasks/transactions/workflows/reactive integration, production deployment,
full-native inventory recertification or merge-result CI. Canonical reads do not
establish zero internal invocations or external effects exactly once. Raw Database
still requires an isolated trusted network and explicit insecure-development opt-in.

## Secured User transaction/replay checkpoint (2026-10-11)

A separate generated PER_USER_ID OwnerTransactions service now exercises explicit
factory construction, exclusive transactions, fresh shared inspection and ordinary
query over actual CXX/RocksDB. Verifier-issued ownership admits the matching owner;
headerless, JSON-only forged identity, wrong-owner and rejecting credentials deny
absent/present calls without handler entry. Canonical Load explicitly returns no
actor before construction (CXX omits missing keys); a positive control validates
exactly one constructed actor, its type/reference and decoded persisted value 10.
External SetClaims cannot invoke its handler.

A keyed exclusive Apply commits/replays response 15. A fresh transaction advances
current state to 18; a failing handler returns InvalidArgument and rolls back its
state change. Revocation maps the credential to a different verified owner, so
replayed calls return PermissionDenied before receipt disclosure both before and
after host plus Database restart on the same RocksDB directory. Regrant returns
the original response 15 without another handler entry; Query and fresh shared
Inspect still report current state 18. Handler logs are observation, not a direct
durable-effect inventory or external-effects exactly-once proof.

Cleanup records stop failures across owned siblings and retains evidence directories.
Once an owner wait times out, it is not killed or waited on again while running;
intentional initial Database SIGKILL is distinct from timeout preservation. Two
fault-injected cleanup regressions execute as part of native acceptance. Successful
hosts must exit zero, cleanup errors fail acceptance, and owned PIDs must be absent.

**Fresh acceptance based on `a64c9d4902899399cb44e9f1ff362d7b9121c312`:**
`/tmp/reboot-rust-secured-transaction-vertical-audit-1791713364644363579` records SDK
522 passes including nested consumers (library 429, generated consumer 41), strict
SDK and reactive-consumer Clippy exit 0 and native reactive 4/4, retaining Counter,
ordinary secured User and workflow regressions independently. All 377 frozen files
match, recorded owned child identities are absent, and applied follow-up review
found no blocker in the repaired Load control or cleanup-timeout paths.
`/tmp/reboot-rust-auth-watch-public-gates-1791713563665777416` separately accepted
CLI unit and generated greeting/replay/watch/RocksDB restart, supervision and
failed-rebuild gates, with 218 matching frozen files and no owned children.

This is bounded native fixture acceptance, not a secured public rbt template,
inbound/retained-sibling transaction certification, zero preflight Load/admission,
shared automatic receipt replay, interrupted-Prepare recovery, automatic User
construction, full-native inventory recertification, production or merge-result CI.

## Secured User workflow checkpoint/restart checkpoint (2026-10-11)

The generated reactive fixture now includes a separate PER_USER_ID OwnerWorkflows
service, with explicit construction and verifier-issued owner authorization.
Truly headerless, forged, wrong-owner and rejected credentials cannot invoke the
constructor, reader or scheduling handler on an absent actor; direct canonical
Database Load confirms state remains absent. Owner scheduling before explicit
Create also fails without handler entry. This does not assert an exact preflight
Load/admission count or automatic construction.

Accepted scheduling replays the same task handle. Revocation denies scheduling
receipt disclosure before and after host plus actual CXX/RocksDB restart. An
already accepted durable workflow recovers while the scheduling credential remains
revoked; this is durable dispatcher authority, not an authenticated app-internal
exemption. External SetClaims cannot invoke its handler.

An acknowledged first named writer checkpoint survives restart byte-for-byte.
Canonical inspection validates the returned exact TaskId, Run method, decoded
request, iteration zero, named checkpoint UUIDs and request fingerprints, typed
checkpoint values 5, and terminal result (5,5). The observed transition is pending
with one checkpoint to completed with two; queried state is (5,5,1). Invocation
logs show two workflow body entries but only one scheduling, first-effect and
second-effect handler invocation. Native host exits must be zero and owned PIDs
must be absent; the Database restart uses intentional SIGKILL, not graceful drain.

**Fresh acceptance based on `7a49e65f40a588d831af1510e0e748c983fe1aea`:**
`/tmp/reboot-rust-secured-workflow-vertical-audit-1791711676407120078` records SDK
522 passes including nested consumers (library 429, generated consumer 41), strict
SDK and reactive-consumer Clippy exit 0, and native reactive 3/3, preserving the
Counter and ordinary secured User cases independently. All 373 frozen files match
and recorded owned child identities are absent. Applied follow-up review found
all four earlier proof gaps repaired and no blocking defect.
`/tmp/reboot-rust-auth-watch-public-gates-1791712012159038707` separately accepted
CLI unit and generated greeting/replay/watch/RocksDB restart, supervision and
failed-rebuild gates, with 214 matching frozen files and no owned children.

This certifies only the acknowledged-first-checkpoint native fixture vertical,
not arbitrary crash windows, external effects exactly-once, User transactions,
automatic construction, exhaustive secured RPC coverage, Tasks.Wait result
ownership, production parity, current full-native inventory or merge-result CI.

## Secured User native HTTP/reactive/replay checkpoint (2026-10-11)

The generated reactive fixture now exercises an explicitly constructed PER_USER_ID
OwnerAccount against actual CXX/RocksDB. Verifier-issued owner identity admits
constructor, reader and writer calls; missing, forged and wrong-owner identities
are denied. External SetClaims remains denied. HTTP forwards credentials into the
generated RPC boundary, without inferring trusted internal authority.

Revoked subscriptions fail before disclosing a new snapshot. The registered
owner's actual subscription permit count is observed at 1 and then 0 before native
host shutdown, avoiding a global-drain false positive. Each HTTP listener has an
independent shutdown marker and mandatory exit-0 check; an HTTP-only restart while
the native host remains alive successfully reads persisted state.

A fixed writer request replays its original result without handler remutation;
revocation denies replay before and after host plus Database restart, and regrant
returns the original result while a fresh read verifies later persisted state.
Invocation logs are observation only, not external-effects exactly-once proof.
The existing Counter regression is preserved unchanged.

**Fresh acceptance based on `a3c826c2338f58c2772fc8365583cb910e9034ae`:**
`/tmp/reboot-rust-secured-user-vertical-audit-1791709997202046219` records SDK
522 passes including nested consumers (library 429, generated consumer 41), strict
SDK and reactive-consumer Clippy exit 0, and native reactive 2/2. All 371 frozen
files remained unchanged and owned child processes were absent. Applied-source
follow-up review found no blockers in the HTTP lifecycle or live reclamation paths.
`/tmp/reboot-rust-auth-watch-public-gates-1791710347081602153` separately accepted
CLI unit and actual generated greeting/replay/watch/RocksDB restart, supervision
and failed-rebuild gates, with unchanged source and no owned children.

This is a bounded native fixture vertical, not a secured User `rbt init` template
or full-suite native recertification. The prior native 132/132 checkpoint below
remains historical; this run executes only the current reactive inventory of 2.
Automatic User construction, OAuth/claims delivery, trusted internal provenance,
User transaction acceptance and broader workflow coverage, exact preflight counters,
encoded/colocated/escaped StateRef coverage, Tasks.Wait result ownership and full
reactive/production parity remain incomplete. PR/merge-result CI is separate.

## Descriptor-backed User policy checkpoint (2026-10-11)

Generated database, transaction and workflow adapters bind the state's raw
`auto_construct` descriptor value in both constructors and `with_authorization`.
Only PER_USER_ID (1) selects default owner authorization; names do not. Identity
is supplied by the host verifier via `Auth::with_user_id`, never inferred from
JSON claims or caller metadata. Missing identity is Unauthenticated; wrong final
decoded StateRef ID/type is PermissionDenied. Explicit custom authorizers replace
the default; development does not bypass User ownership. External SetClaims on
any nonzero annotation is independently denied after credential verification,
including custom Allow. No authenticated app-internal exemption is implemented.
The declaration constant carries metadata, not automatic actor construction.

Generated downstream behavior exercises constructor/reader/writer owner denial,
payload/metadata forgery, matching-owner access, custom Allow replacement and
SetClaims denial with no handler/Store effects. Source review found no definite
external bypass. At that checkpoint, zero Load/root/receipt/admission counters,
encoded/colocated/escaped StateRef matrix and User-specific transaction/workflow/
HTTP/subscription/replay-restart coverage remained incomplete; the newer secured
fixture checkpoint above closes only its admitted ordinary-method native vertical.
Tasks.Wait has independent deny-default policy; actor ownership does not certify
task-result disclosure or arbitrary subscriptions.

**Fresh regression acceptance based on `11a6598b`:**
`/tmp/reboot-rust-user-policy-full-audit-1791708133927180921` records SDK 522
passes including nested consumers (library 429, generated consumer 41), both
strict Clippy gates exit 0 and native 132/132 (SortedMap 3, CXX 115, reactive 1,
workflow 5, transport 8). `/tmp/reboot-rust-auth-watch-public-gates-1791708986525211611`
records CLI and actual greeting/replay/watch/RocksDB restart, supervision and
failed-rebuild acceptance. Aggregates accepted with all gate exits 0, unchanged
frozen source and no owned children. These are regression gates, not secured User
native/public certification, production readiness, or merge-result/CI acceptance.

## Subscription credential ordering checkpoint (2026-10-11)

Both generated local ReaderBinding paths pass original embedded protobuf bytes
through credential verification and current-state policy authorization before
request decoding. Rejected credentials perform no Load or handler call; denied
policy sees exact raw bytes but exposes no decoded request. Allowed malformed
requests receive the admitted decode error. Metadata, scope cancellation and
admission cleanup are preserved; no retry or internal-authority exemption is added.

**Compatibility boundary:** ordinary typed readers now require `Message + Default`
and encode/decode round-trip their request. Generated prost consumers are exercised;
custom Message implementations without Default or with non-wire in-memory fields
are not compatibility-certified. This remains a checkout-only experimental API.

**Fresh acceptance based on `7f1de637`:**
`/tmp/reboot-rust-auth-watch-full-audit-1791706095203478496` records SDK
518 passes including nested consumers (library 427, generated consumer 39), both
strict Clippy gates exit 0 and native 132/132 (SortedMap 3, CXX 115, reactive 1,
workflow 5, transport 8). `/tmp/reboot-rust-auth-watch-public-gates-1791706918389372911`
records CLI 25/25 and actual public greeting/replay/watch/RocksDB restart,
supervision and failed-rebuild acceptance. Both aggregates accepted, all gate exits
0, frozen hashes match and exact owned children are absent. Generated greeting
Cargo zero-test runs are compilation checks, not behavioral acceptance.

Descriptor-backed User policy and independent external SetClaims protection now
have the bounded checkpoints above, including secured native HTTP/reactive/replay
acceptance. Trusted internal provenance and production release remain unfinished.
Source review
found no bounded generated-reader safety blocker; it is not full parity or
merge-result/CI certification.

## Scheduling authorization and live Watch checkpoint (2026-10-11)

Workflow scheduling and registered-owner/generated participant admission verify
credentials and require policy before owner/storage admission. Policy sees the
immutable raw optional state before decoding, absence/replay checks or retained
ownership handoff. Pre-Allow Load failures strip diagnostic messages, details and
metadata; ordinary post-Allow errors and uncertainty semantics are unchanged.
Denied/cancelled independent inbound calls preserve retained siblings; outbound
failures still doom the caller root. Scheduling revocation, pending/completed
replay denial, and regrant of the original task handle are exercised across restart.

Live Watch keeps one pinned RPC across sibling notifications, enables rearm before
checking ownership, and receives notifications for terminal sealing and read-only
Prepare release. Lost ACK and cancellation retain uncertainty without fabricated
retries or Abort. The generated retained-inbound regression proves state and one
Watch, not full durable task preservation. Dedicated terminal in-flight
cancellation/retry-backoff coverage and broader production authorization remain gaps.

Fixture readiness markers use unique, exclusively created sibling temporary files
and atomic rename with a deterministic concurrent-publisher regression. This is
complete-byte visibility, not power-loss durability. Expected incompatible workflow
recovery launches without requiring readiness, then asserts the exact checkpoint
collision, invariant records and subsequent valid recovery; arbitrary nonzero exit
is not an acceptance oracle.

**Fresh repaired-source acceptance based on `4ef375d7`:**
`/tmp/reboot-rust-auth-watch-full-audit-1791701164129097601` records SDK
516 passes including nested consumers, both strict Clippy gates exit 0 and native
132/132 (SortedMap 3, CXX 115, reactive 1, workflow 5, transport 8), all exits 0
with exact owned-process cleanup and frozen hashes verified.
`/tmp/reboot-rust-auth-watch-public-gates-1791702659385473122` records CLI
25/25 and actual public greeting E2E exit 0, durable `0801`, same-key replay,
watch add/restore, RocksDB restart, signal/child-exit and failed-rebuild cleanup.
Its runner failed only its final disk-budget guard, not either behavioral gate.
After approved old-cache cleanup, the separate immutable continuation
`/tmp/reboot-rust-public-budget-reconciliation-1791704915700213052`
revalidated unchanged source/binary hashes, gate exits, greeting evidence, exact
PID/start cleanup and restored budgets under exclusive ownership. This is staged
acceptance, not one uninterrupted successful public runner or green CI.

Full parity, User/trusted provenance, broader HTTP/subscription authorization,
packaging/release and merge-result/CI acceptance remain unclaimed. Earlier failed
marker/workflow stages remain historical evidence, not accepted snapshots.

## Echo authorization and checkout contract checkpoint (2026-10-11)

Legacy Echo memory, file and Database hosts now default deny. The standalone
executable opts into isolated development only for exact
`RBT_RUST_UNAUTHORIZED_DEVELOPMENT=1`; library hosts never infer that policy
from the environment. Credentials are verified before actor admission/storage;
current immutable state and request bytes are authorized before typed decoding,
receipt disclosure or effects. Memory/file gates span authorization through the
operation and release on cancellation. Weak gate registrations do not retain
rejected actors indefinitely; sequential denial tests are not a global concurrent
resource-bound proof. File hosts mask unavailable/corrupt storage diagnostics
before Allow and never fabricate an authorization snapshot.

New ordinary/workflow/SortedMap adapters emit one anonymous alias-aware const
check for checkout API contract 1. Genuine aliased SDK consumers exercise match
and mismatch/regeneration diagnostics. This is not packaging, wire compatibility,
persisted-state migration, a production launcher or release certification.
Cargo adapter outputs are written only when bytes change; include watches remain
conservative. Frozen CXX tests reuse successful/failed preparation only inside
one process; nested fixtures still use fresh hosts/databases and unchanged runtime
assertions. ACK markers publish completed bytes via same-directory atomic rename,
not polling retries; visibility is not crash durability.

**Executed on the pre-format repaired snapshot based on `16ff72b4`:**
`/tmp/reboot-rust-repaired-auth-reuse-audit-1791683363548924557` records
SDK all-target exit 0 (503 passes including nested consumers), strict SDK and
complete generated-CXX-consumer Clippy exit 0, SortedMap 3/3 and CXX 114/114.
The aggregate stopped at its disk guard after these successful suites. An earlier
failed marker-race run and a pre-execution disk-blocked continuation are retained
and are not accepted cases.

`/tmp/reboot-rust-repaired-auth-reuse-continuation-1791684919739833172`
verified unchanged frozen source, prior exits and cleanup, then passed reactive
1/1, workflow 5/5 and native 2PC 8/8, all exit 0. Its `accepted.json` certifies
those remaining 14 cases. Together the retained stages cover the exact **131**
ignored native cases on the same source; they are not one uninterrupted run.
Actual retained PID/start identities were absent and the exclusive lock released.
Canonical Database identity matches the prior audit. Five ordinary CXX cases and
five ordinary native-2PC cases are filtered, not ignored-inventory failures.

Publication formatting is separately recorded at
`/tmp/reboot-rust-publication-format-1791685543988821062`: six files differ only
by verified deterministic rustfmt output. The native evidence above belongs to
its original byte hashes; it is not an exact-byte audit of the formatted checkout.
**Fresh repaired-source acceptance:**
`/tmp/reboot-rust-repaired-auth-reuse-audit-1791686456896434227` records
SDK all-target exit 0 (506 passes including nested consumers), both strict
Clippy gates exit 0, and all 131 native cases passing (3/114/1/5/8).
`/tmp/reboot-rust-postdiagnostic-public-gates-1791687838814802648` records
CLI unit and actual public greeting gates exit 0, including persisted restart,
same-key replay, watcher rebuilds, host/Database exit supervision and failed
live-rebuild cleanup. Both accepted artifacts were read back, frozen hashes
matched, and retained PID/start identities were absent.

Database authorized readers, writers and constructors reject missing policy
before Load, after verifier checks. Failed pre-Allow Load discards diagnostic
messages/details/metadata, retaining only Unavailable retry classification;
other failures become PermissionDenied. No synthetic snapshot is authorized.
Post-Allow receipt/persistence errors and uncertainty semantics are unchanged.
New regressions reproduced the leak (2 failed/1 passed), then passed 3/3;
Echo regressions passed 15/15. Applied-source security review found no blocker.
These are bounded checkout acceptance results, not full parity or CI approval. Python receipt-before-admission
ordering is not claimed identical; production User ownership/trusted provenance,
transport denial coverage, broad task/HTTP policy coverage, dependency-watch
invalidation proofs, packaging and current merge-result/CI acceptance remain open.

## Frozen-snapshot native audit (2026-10-10)

The default Cargo-helper consumer fixture now uses its actual SDK dependency
name, `reboot_rust_schema`, for the explicit development authorization policy.
This is a test-fixture alias correction, not a runtime policy relaxation.

At HEAD `a68871e7bdf3298e9a09106d55468684a36d59e7` plus that exact fixture
repair, all 131 ignored native inventory cases passed: SortedMap 3, generated
CXX 114, reactive restart 1, workflow restart 5, and native 2PC 8. The SDK
all-target gate and both SDK/generated-consumer strict Clippy gates exited 0.
The SDK log records 483 passes including nested consumer tests; ignored tests
are accounted for separately by the native execution.

The frozen source snapshot remained unchanged across the original stage
`/tmp/reboot-rust-current-head-full-audit-1791655473259651199` and continuation
`/tmp/reboot-rust-full-native-continuation-1791666414622448069`. The original
runner exited 1 after CXX passed because it incorrectly required zero filtered
ordinary tests; the corrected continuation verified prior exact inventories,
source hashes and process cleanup, then ran only the remaining 14 cases.
Each native suite exited 0 with its exact selected-case inventory and no live
recorded children; the continuation produced `accepted.json`. Two ordinary CXX
tests and five ordinary native-2PC tests were legitimately filtered by
`--ignored`. The canonical Database hash recorded by the continuation is
`5240488d0a9ff3ed3a6685c93b70fd2c59533df0c150b1c65008aa9f4dc89845`.

This is acceptance of the repaired checkout snapshot across two retained stages,
not merge-result/CI certification, production readiness or full parity. Legacy
Echo authorization, rebuild efficiency and the checkout-only generated/runtime
compatibility contract remain unimplemented priorities.

## Native fixture corrections (2026-10-10)

The disabled task-administration fixture now expects the runtime's fail-closed
`PermissionDenied` for ListTasks and CancelTask. The sequential-star restart
fixture waits for every participant's immediate tasks to be durably Completed
before checking delayed tasks remain Pending and stopping hosts. Root Commit
publishes tasks; handler entry alone is not durable task completion. Exact two
invocations and later Completed-restart/no-redispatch assertions remain intact.
This does not claim exactly-once handler entry across an in-flight crash.

Focused execution of both complete enclosing native cases passed (one case per
Cargo command, exit zero) after these corrections. The preceding five diagnostic
star repetitions produced four passes and one invocation-count failure, with a
Pending reader already logged before shutdown and three reader entries after
restart. Subsequent native execution passed SortedMap 3 and generated CXX 114
on `89879c35858d300848641259899fb531ded2b270`; reactive passed 1 on the
same source. Workflow then exposed a separate fixture conflict: the default
success path caught failed framework method/payload/name probes, tainting the
attempt before successful completion. Those probes now run only in an explicit
`caught-probes` negative case. The runtime clean-attempt guard is unchanged.
The negative case asserts fatal finish rejection, one Pending checkpoint, no
second-handler entry, and clean native restart recovery to Completed with two
checkpoints; successful restart bodies no longer inject deliberate failures.

**Executed repair:** `/tmp/reboot-rust-full-native-1791636271653660112`:
strict generated-workflow fixture Clippy (`-D warnings`) exit 0; all five native
workflow cases passed, including 13 body-recovery/failure subcases; all eight
native 2PC cases passed. Both Cargo suites exited 0 with recorded child cleanup.
The wrapper failed solely because it incorrectly required zero filtered cases;
native 2PC legitimately filtered five non-ignored cases (generated CXX earlier
filtered two). Retained inventories and exact enclosing test names reconcile
these results without exempting any test failure.

Combined retained stages cover all 131 inventory cases successfully (3 + 114 +
1 + 5 + 8), but **not one current-snapshot full audit**: the two workflow fixture
files changed between stages. Earlier failures remain evidence, not passes.
No current merge-result/CI acceptance, production readiness, or full parity is
claimed. Bounded authorization corrections are recorded below; broader A1/A2
coverage and the experimental release contract remain next.

## Fresh shared-root authorization correction (2026-10-10)

Fresh external shared roots now verify credentials before root start/participant
Load and authorize the immutable optional wire state and encoded request before
state decoding, handler invocation, staging or promotion. Denial leaves the
pre-Store guard armed; its asynchronous Drop cleanup releases undurable ownership
without a terminal sidecar Abort. Validated inbound/recovery paths are unchanged.

**Executed, bounded:** generated downstream consumer acceptance at
`/tmp/reboot-rust-shared-auth-regression-1791637544583525535` passed all 32
consumer tests and the one enclosing Cargo test. The new case checks verifier
rejection before Load, denial before handler/effects, eventual denied-participant
reuse, allowed no-op execution, method/state identity and wire snapshots. The
fixture-only bounded wait recognizes only the exact pre-admission pending-owner
conflict; no production mutation/status retry was added.

`/tmp/reboot-rust-shared-auth-native-gates-1791638027913884435` passed strict
SDK/all-targets and whole generated native-consumer Clippy (`-D warnings`), then
both selected native cases (one pass each, exit 0): shared no-op without a durable
decision followed by restart/exclusive admission, and shared promotion recovery
after a durable decision. Frozen source checks passed. Consumer fixture lint
cleanup was separately source-reviewed; unused private generated APIs alone have
a scoped dead-code allowance, not a Clippy warning exemption.

This closes the fresh-shared omitted-policy path, **not all A2 coverage**. Native
regressions use their existing permissive policies; explicit-policy allowed
promotion, denied malformed/absent state and inbound rejection are not certified
by them. The subsequent default-deny/inbound correction is recorded below;
broader task/subscription/HTTP policy coverage,
experimental release contract, full current-head native audit and merge-result
validation remain outstanding. Earlier failed/zero-test runs are not acceptance.

## Default-deny and inbound transaction authorization (2026-10-10)

`AuthorizationPolicy::default()`, `new(None, None)` and verifier-only policies
now deny absent authorizers. Authentication and caller transaction metadata do
not confer internal authority. Development allowance requires the explicit
`permissive_for_development()` host policy. Greeting and batch transaction hosts
select it only for exact `RBT_RUST_UNAUTHORIZED_DEVELOPMENT=1`; `rbt dev run`
deliberately selects that development mode and warns that it is not production-safe.

Shared and exclusive inbound generated adapters verify before participant
admission and authorize immutable wire state/request bytes before decoding or
handlers. Denial reuses existing ownership-aware `abort_local()` cleanup; fresh
shared denial retains its asynchronous undurable-lease cleanup. Exclusive Abort
cleanup is legitimate, including factory denial. No mutation/status retry was added.

**Executed, bounded:** `/tmp/reboot-rust-default-deny-gates-1791639381166298333`
passed both policy tests, all 34 downstream consumer tests plus one enclosing
Cargo test, strict SDK/all-target and complete native-consumer Clippy. Its CLI
step failed on checkout/native-library environment selection; this failure is
retained, not credited. The corrected CLI-only overlay preserves installed Python
native dependencies while selecting current checkout CLI source.

`/tmp/reboot-rust-default-deny-public-gates-1791639852951151642` passed 25 CLI
tests and both selected real CXX native cases (one each): shared no-op/restart
and durable promotion recovery. The public greeting step exposed template
formatting and failed before behavioral acceptance. Only the two templates were
then reformatted. `/tmp/reboot-rust-default-deny-scaffold-gates-1791640126545913225`
passed all 25 CLI tests again and the full public greeting driver: init/Cargo
strict Clippy/fmt, create/write/receipt replay/read, canonical Load `0801`,
watcher rebuilds retaining Database ownership, persisted RocksDB restart,
SIGTERM/SIGINT cleanup, host/Database exit supervision, health-check termination
and failed live rebuild cleanup. Generated Cargo targets executed zero unit
cases; they are build checks, not additional behavioral tests. All completed
stages retain frozen manifests/exits; the final public driver records source
and binary identities, `passed=true`, and owned-child cleanup.

Source review approved the bounded inbound fix. This is **not full A1/A2 or
production security parity**. The subsequent Wait/batch checkpoint below closes
the default-allow paths; production ingress, User ownership and trusted internal
provenance remain missing. Malformed/absent
inbound-state denial, parked-policy cancellation under alternate ownership,
uncertain cleanup, transport denial and custom-policy Allow need broader proofs.
Manual-host unset/invalid/exact-one batch selection is exercised below; other
HTTP/tasks/subscriptions paths need their own coverage.
Reproducible experimental release gates and current-head/merge-result full native
audits remain outstanding. Earlier failed stages and historical composite native
inventories are not current-snapshot full certification.

## Canonical Wait and generated batch default-deny checkpoint (2026-10-10)

Direct and convenience canonical Wait mounts now default deny. Explicit result
policies (including development allowance) remain independent of administrative
scheduling access and preserve result ownership fences. Batch ordinary/index
methods allow development access only for exact environment value `1`; StopBatch
still requires independent configured administration. Configured result grants
replace development Wait permission rather than composing with it.

Retained composite acceptance, not a single current-head full SDK/native audit:
- `1791645557924050880`: 20 task-policy tests, 34 generated downstream cases plus
  one enclosing test; strict all-target SDK and complete native consumer Clippy.
- `1791645931873260808`: CLI regression, real canonical Wait and restart/redelivery
  native cases (one each), full public greeting persistence/watch/cleanup driver.
- `1791646653515343823`: expanded real canonical Wait denial case for both mounts,
  Pending/Completed tasks and absent/caller credentials; strict SDK Clippy.
- `1791646880656352462`: configured result-grant public batch driver, including
  denial, revocation, unchanged records, persisted restart and child cleanup.
- `1791654697083109786`: direct generated-host unset/`0`/`true` denial for read,
  submit, approve and Wait; exact `1` allowance; pending stoppable task isolation
  for no configured admin and missing/wrong credentials. Ordinary mutation
  receipts and pending inventory are checked alongside selected task checkpoints;
  this is not an inventory of every workflow-scoped mutation. Generated consumer
  strict Clippy/fmt and nonzero tests passed. Driver exit 0, frozen mismatch list
  empty, accepted artifact true, live handles empty and owned children reaped.

The earlier selector stage `1791654518749253762` failed because its test fixture
requested a future-scheduled cooperative batch, which the real contract rejects.
The replacement uses an immediate batch parked by withholding approval; no runtime
contract or assertion was weakened. Static source/fixture reviews are distinct
from executed acceptance. Production security and experimental release gaps above
remain outstanding; this checkpoint does not establish full authorization parity.

## How to read the evidence

- **Implemented, bounded:** a public/generated path exists, with the limitations
  stated here. This never means every shape of that Python feature works.
- **Executed:** the cited acceptance actually ran successfully on a recorded
  source snapshot. Tests merely existing or compiling do not earn this label.
- **Test coverage:** source contains executable cases, but the latest batch did
  not necessarily execute every ignored native case.
- **Missing:** required semantics/API are absent or explicitly rejected. A
  rejected operation is not an implementation waiting for a compiler flag.

The latest scheduled-workflow cancellation was implemented on baseline
`f385e2b49680e1fb7d2e7bfd557bfe3bc2875cf2` (2026-10-08). Workflow-service reactive
integration was based on `2ab2695302a62ded67eda4a63cf0919efc41a11d`. The preceding explicit
reconnect vertical was based on `dfb8734c9834f31a2038d36deb8bbadfb6e80601`. Declared workflow
terminals were implemented from `ba58bae69fb047b52e637525b36aa19227c7a7b5`;
the original public batch app was based on `e2a6bdc5914a8c152eb48c102c3dc91249cc4ead`. Executed
public Cargo/native application acceptance and retained greeting regressions
are described in [Verification](#verification). Older workflow/transaction
proofs below retain their separate source snapshots and limits.

## External source review and release priorities (2026-10-10)

An external review supplied by Vlad compares Rust
[`5849787f`](https://github.com/jean-de-bot/reboot/commit/5849787fef3cfdd416da77aae9fcabfbdc6b3887)
with Python PR base
[`84715af`](https://github.com/reboot-dev/reboot/commit/84715af592cf35fa599937fdb7ae9461953c4bc0).
It inspected source/test assertions, not runtime execution, and is not a complete
TypeScript/React API audit. The identifiers below preserve that review's backlog;
closing a finding requires current-source mapping and exercised acceptance, not
merely a passing older checkpoint. Mixed reader/transaction external composition
exists at that snapshot and is not a missing feature.

**Release blockers first: security and reproducible validation.** The review's A1
and A2 are independently confirmed in the pinned sources: an empty
[AuthorizationPolicy](https://github.com/jean-de-bot/reboot/blob/5849787fef3cfdd416da77aae9fcabfbdc6b3887/reboot/rust/src/auth.rs)
allows authorization without an authorizer; the
[fresh shared external root emitter](https://github.com/jean-de-bot/reboot/blob/5849787fef3cfdd416da77aae9fcabfbdc6b3887/reboot/rust/src/codegen.rs#L1795)
does not invoke the explicit policy path used by exclusive external roots. Hooks
are implemented, but this is not default Python production protection. Python's
[DefaultAuthorizer](https://github.com/reboot-dev/reboot/blob/84715af592cf35fa599937fdb7ae9461953c4bc0/reboot/aio/auth/authorizers.py#L350)
distinguishes development, production, User ownership and trusted internal calls.
The next implementation priority is an explicit experimental release/security
contract and a denial-before-handler/effects policy matrix, not broader composition.
Inbound transaction/recovery authority must not be inferred from user headers.

### Review backlog

- **W1:** explicit finite named/indexed replay differs from Python's canonical
  task iteration cursor. Define cursor advancement, Break, restart position and
  checkpoint lifetime together. Python's single control loop and in-memory
  cleanup do not establish on-disk garbage collection.
- **W2:** durable workflow steps/readers remain local and explicitly named;
  cross-actor stubs, deterministic external/idempotency keys and callbacks remain.
- **W3:** bounded evidence-qualified RetryLocal differs from indefinite Python
  unexpected-task retry/backoff. Match eligibility and isolation; never retry
  uncertain mutations merely by status or claim arbitrary external exactly-once.
- **W4:** cancellation admits only future unstarted workflows; running/ordinary
  task cancellation, completion races and restart are separate work.
- **W5:** authorized task listing/streams are local; placement-aware aggregation
  is missing, not task administration itself.
- **W6:** scheduling from transactions exists; transaction task targets and
  general registered-actor writer/workflow recovery remain narrower.
- **T1:** first-touch/direct-leaf rollback and RelinquishOwnership exist; arbitrary
  ancestor/subtree snapshots and rollback-versus-Prepare are not established.
- **T2:** sequential siblings and reusable direct participants exist; overlapping
  branches and general parent/ancestor reentry remain restricted.
- **T3:** fresh local shared promotion, root factories and root idempotent replay
  exist; their inbound/shared/factory/tree/nested combinations do not compose generally.
- **C1:** SortedMap operations/pagination/serial session reuse exist; routed access,
  authorization and broader transaction composition remain. Python does not
  guarantee recoverable rollback of eager nested SortedMap effects either.
- **C2:** Rust-native Queue, OrderedMap, PubSub, presence, OAuth and ciphertext
  libraries are absent; this does not imply Rust cannot call existing services.
- **R1:** local exact-endpoint one-hop dependencies lack transitive/distributed
  invalidation; Python reactive calls also exclude transactions.
- **R2:** LocalReaders.Subscribe and explicit fresh-baseline reconnect exist;
  canonical React/browser protocol and general streaming/state-reader support
  are separate missing surfaces, not absence of subscriptions.
- **G1:** reader/transaction services exist; workflow/transaction service combinations
  and imported/nested descriptor type/error references remain restricted. Nested
  protobuf fields and proto3 are not blanket gaps.
- **G2:** typed declared errors exist, but shared transactions and constructors
  in workflow-bearing services reject relevant declared-error combinations.
- **A1:** bounded default-deny/development opt-in implemented above; remaining production
  protection explicit before claiming a supported production surface.
- **A2:** policy coverage differs across admitted execution forms, particularly
  fresh shared roots. Exercise reader/writer/constructor/shared/exclusive/factory,
  task/subscription and HTTP denials with trusted identity preserved.
- **A3:** real Cargo/init/dev tooling is not production packaging: unpublished SDK,
  generated/runtime compatibility, Rust serve launcher and configuration remain.
- **A4:** placement readiness/process-local gates are not cross-host mutation
  fencing, endpoint-alias or migration proof. Python graceful handoff also has
  unresolved coordination; do not claim unproved superiority.
- **A5:** external HTTP routes/lifecycle hooks exist; gRPC multiplexing, mounts,
  trusted internal contexts and application OAuth/user-state integration remain.
- **A6:** gRPC serving-time initialization now has exact host-bound authority,
  stable durable workflow admission/typed Wait, and public Legacy restart/crash
  acceptance (see the Legacy checkpoint above). HTTP initialization, general
  application-context parity and cross-state-type alias migration remain open.

**Order:** finish the active accepted-slice delivery and full native validation;
then A1/A2 plus reproducible Rust release gates; W1–W6; T1–T3;
R1/R2/G1/G2/C1; production integration A3–A6 and application-driven C2 ports.
Bounds are contracts to review, not automatic defects. New behavior needs matching
Python/Rust request/result/error acceptance and crash/cancellation/lost-response
boundaries. Canonical schemas alone do not certify generated API/protocol parity.

**Validation distinction:** ordinary Cargo runs still leave native tests ignored,
with feature-dependent inventory. The current all-feature native inventory of
152 cases has now been explicitly executed and audited (see the current native
checkpoint above); selected earlier prerequisites were not its substitute.
General Bazel CI does not provide the Cargo/runtime/generated-consumer/native gate.
PR #216 remains draft and fork CI awaits approval, an execution gate rather than a
failing result. Release-readiness requires exact-head and current-merge-result
formatting, strict Clippy, Cargo, generated consumers and native evidence tied to
source/Database revisions. Neither this source review nor historical pass counts
satisfy that gate. Later feature sections retain their individual recorded evidence.

## Capability overview

| Capability | Current useful slice | Main remaining gap |
| --- | --- | --- |
| Local app DX | Cargo scaffold, annotated-proto generation, typed client, durable dev host | Production packaging/bootstrap and general distributed application composition |
| Schema/codegen | Explicit schema DSL, Prost/Tonic bindings and concrete typed adapters | Rust derive/reflection and complete schema/tooling contract |
| State/client runtime | Durable constructors/readers/writers, idempotent response replay, metadata/auth | General distributed ownership/fencing and arbitrary external effects |
| Transactions | Legacy durable coordinator/participant paths, bounded supervised chains/star and opt-in registered shared-root typed errors over existing writers | General nested snapshots, transactional constructors/tasks, reentrancy, intersecting subtrees, migration |
| Tasks | Durable scheduled tasks, typed results/Wait with opt-in result policy, recovery, local admin list/stream and scheduled-workflow cancellation | Transactional targets, running/ordinary/distributed cancellation, aggregation, broad retry and dispatcher fencing |
| Workflows | Finite typed named steps, bounded nested indexed replay, saved reader observations and finite Continue/Break, typed declared business terminals; explicit local-body resumption | Python unbounded Task cursor/GC/Break, cross-actor composition, framework failure isolation |
| Reactive readers | Typed bounded database/workflow/transaction-service ordinary reader subscriptions, plain-database/workflow-bearing/mixed-transaction external unary composition, allowlisted multi-actor routing, bounded one-hop composition, commit invalidation and explicit same-query reconnect | Transactional-context composition, remote/transitive invalidation, transparent reconnect/durable resume, streaming/transaction RPC subscriptions |
| SortedMap | Canonical empty constructor, serial same-host app/map transactions, same-root session reopening, live keyset pages and atomic multi-entry approval transfer | Public inbound adapter, nested/reusable siblings, distributed collection lifecycle |

## Local app development

**Implemented, bounded:** one local public gRPC host backed by one canonical
C++ Database/RocksDB process. The SDK crate is unpublished and requires a checkout.
The CLI does not use Python/Node Envoy/bootstrap, distributed placement, dashboard
or chaos machinery. The default greeting scaffold wires ordinary unary
constructor/writer/reader methods. The opt-in `--rust-example=batch-ledger`
scaffold additionally composes a finite approval-gated workflow, typed canonical
Tasks.Wait, a local reactive subscription and transactional SortedMap in one
host. It restores **all** application/map participant ownership before coordinator
recovery, authoritative Watch convergence, task recovery and public readiness.
One task owner and one Wait service serve this bounded one-server topology;
this is not general distributed placement or mixed-language composition.

Generate it with the same Cargo/native development path:

```sh
rbt init --backend=rust --frontend=none --application-name=batch_ledger \
  --rust-sdk=/absolute/path/to/sdk/reboot/rust --rust-example=batch-ledger
```

Its generated README documents `create`, `submit`, `approve`, `watch`, `wait`,
`read`, `history`, `archive`, `archive-history` and typed archive rejection.
Approval updates the ledger and index in one transaction; archive moves an exact
approval entry between two distinct canonical maps and updates a cumulative counter
under the same admitted app root. Existing workflow terminals/checkpoints are retained;
workflow steps wait without holding an exclusive lease. The stable empty-map
constructor replays on restart; no private state seeding is required. Arbitrary
external-effects exactly-once and additional status-code retry policies are not
claimed.

```sh
mkdir greetings && cd greetings
rbt init --backend=rust --frontend=none --application-name=greetings \
  --rust-sdk=/absolute/path/to/sdk/reboot/rust
export RBT_RUST_DATABASE_BINARY=/absolute/path/to/reboot/server/database
rbt dev run --rust-allow-insecure-database
# In another terminal in the generated project:
cargo run --manifest-path backend/Cargo.toml --bin client -- create
cargo run --manifest-path backend/Cargo.toml --bin client -- greet
cargo run --manifest-path backend/Cargo.toml --bin client -- read
# Reuse this same logical mutation key when retrying:
cargo run --manifest-path backend/Cargo.toml --bin client -- \
  greet hello 11111111-1111-4111-8111-111111111111
```

**Security boundary:** the canonical C++ executable binds unauthenticated
`0.0.0.0`; only the public Rust host is loopback-bound. The explicit insecure
opt-in is mandatory. Use an isolated trusted development network, not production.
Use the compatible canonical Database binary, not the isolated Native2pc sidecar.
The runner needs POSIX process groups/`fcntl`; Linux descendant cleanup uses
child-subreaper support.

Cargo `build.rs` generates bindings/adapters in `OUT_DIR`. The Rust `.rbtrc`
disables the ordinary background generation watcher; `rbt generate --rust` is a
separate prebuilt-plugin route, not the Cargo app build path. The CLI builds app
and client, validates app `--server-info`, starts Database/host, then checks
canonical Health.Check through the client. Rust/proto/build/manifest changes
rebuild and restart the host while retaining Database state; failed builds end
the session. Configuration changes require restarting the command.

State persists at `.rbt/dev/<application-name>/rust/rocksdb`; `database.log` and
`host.log` live alongside it. An advisory lock rejects simultaneous sessions on
the same state directory. Signals cancel/terminate/reap owned process groups;
unexpected child exit fails the CLI and cleans up the other child. The runner
requires `--servers=1` and rejects unsupported frontend/TLS/Node/Python/tracing/
transpilation/background-command modes. `--terminate-after-health-check` is a
bounded startup smoke option. `--port=12991` changes the public listener; use
`RBT_RUST_URL=http://127.0.0.1:12991` on the client. Expunging local state is
separate and destructive, never a normal verification step.

Init validates SDK/frontend/name and collisions before writes, rejects symlinked
scaffold parents/overwrites, and publishes `.rbtrc` last. Python 3.10 uses `tomli`;
newer Python uses `tomllib`.

**Sources:** [rust_init.py](../cli/commands/init/rust_init.py),
[rust_dev.py](../cli/commands/rust_dev.py), [dev.py](../cli/commands/dev.py),
[templates](../cli/commands/init/templates).
**Coverage:** [CLI behavior tests](../../tests/reboot/cli/rust_app_dx_test.py),
[real app acceptance driver](../../tests/reboot/cli/rust_app_dx_e2e.py).
These cover create/write/same-key replay/read, canonical Load, RocksDB restart,
rebuild and owned-child cleanup; process-shim tests alone are not durability proof.

## Schema, generation and ordinary state APIs

The explicit schema DSL emits stable tags/requiredness, proto3 scalar types,
nested models, enums, repeated/map/oneof fields and reserved removed tags/names.
Compatibility checks reject supported tag/type/enum changes; this is not full
Python model validation/reflection. No mature `derive(RebootState)` equivalent
is claimed.

Cargo-native generation uses vendored protoc and deterministic Prost map fields
(`BTreeMap`) for request fingerprints. The direct plugin needs pre-existing
Prost/Tonic bindings and an explicit module/runtime path; it cannot silently
change those bindings' map containers. Generated services are concrete typed
handlers/adapters/clients, not caller-selected dynamic dispatch. Descriptor,
method-kind, symbol and unsupported-shape validation fail closed. Streaming
reader state is not ordinary unary state; canonical map and standalone workflow
services use specifically supported generator paths, not a blanket exception
for arbitrary trusted effects. Request/state/declared-error protobuf shapes are
bounded to supported same-package top-level models. Declared errors are supported
for ordinary unary readers/writers, exclusive transactions, standalone workflow
terminals, ordinary unary reader/writer errors on workflow-bearing services,
and serial same-actor named writer business decisions. The opt-in serial same-actor reader-outcome API supports typed durable declared
errors; ordinary reader waits and framework errors remain fatal step failures.
Shared transactions and workflow-service constructor errors remain unsupported. Metadata/StateRef helpers also remain a
subset: the StateRef codec is not automatic migration of opaque durable keys;
full per-call Options/context merge, timezone/DST parsing and cross-application
service discovery are not supplied.

```toml
[build-dependencies]
reboot = { package = "reboot-rust-schema", path = "/path/to/reboot/rust", features = ["build"] }
[dependencies]
reboot = { package = "reboot-rust-schema", path = "/path/to/reboot/rust" }
```

```rust
// build.rs; consumer owns the crate::proto module and includes emitted adapters.
fn main() {
    reboot::build::compile_protos_with_runtime(
        &["proto/counter.proto"], &["proto", "/path/to/reboot"],
        "crate::proto", "reboot",
    ).unwrap();
}
```

Database-backed adapters isolate actor/type, validate state references and call
metadata, load state, and durably Store state plus writer-response replay data.
Same-key request/method collisions fail closed. Constructor uniqueness,
automatic writer-key expiration and declared error envelopes have scoped tests.
Generated ordinary external unary readers/writers retry **Unavailable only** with
the same request/metadata/logical writer key. Backoff starts at one second, doubles
and caps at 30 seconds; the generated loop has **no total attempt/time budget**.
Callers must own a timeout/cancellation for bounded waiting. After an uncertain
call, a new `_with_key` invocation must reuse the original key; a new automatic
writer invocation creates a new logical key. This is not nested transactional or
arbitrary external-effect retry authority.
Actor gates are process-local, keyed by normalized endpoint/type/ref; endpoint
aliases or separate processes are not coordinated by these locks. Ordinary
handler external IO is not transactional or exactly-once.

**Sources:** [schema/DSL](src/lib.rs), [generation](src/codegen.rs),
[Cargo helper](src/build.rs), [runtime](src/runtime.rs),
[external client](src/lib.rs), [state refs](src/state_ref.rs).
**Coverage:** [generated downstream compilation/behavior](tests/protoc_plugin_counter.rs),
[external metadata/runtime](src/lib.rs).

## Application host, security and HTTP

`ApplicationHost` owns lifecycle, explicit recovery registrations, accepted
placement/readiness and router shutdown. Public ingress stays gated before
recovery or after host failure; internal recovery/control paths are separate.
Server-owned application identity is not a caller header. Generated adapters
support scoped bearer verification/immutable-state authorization and rich
method-declared/system error handling. Canonical Health.Check and opt-in descriptor reflection plus a bounded separate
external HTTP route host exist. Host-wide Health.Watch observes recovery and
required-placement readiness, coalesces duplicate/current updates and ends on
observed failure/shutdown. Check follows the same gate. Neither performs Python's
websocket probe or per-service health discovery. Reflection requires explicit
descriptor sets and is not Rust derive reflection. Request-aware
GET/POST/OPTIONS handlers receive the original Axum request (URI/query, headers,
extensions and body) alongside immutable untrusted external metadata and
server-owned identity. Legacy context-only handlers remain compatible. This is
not automatic HTTP protobuf dispatch, gRPC multiplexing, or an HTTP readiness API.

**Authorization boundary:** default `AuthorizationPolicy` denies absent authorizers;
explicit host-selected development permission is separate from authentication.
Configured generated database methods and fresh shared/exclusive/factory roots,
and supported shared/exclusive inbound methods, enforce their policies before
handlers. Ordinary database and exclusive-root/factory receipts require current
snapshot authorization before disclosure. This does not establish universal
policy coverage: canonical Wait without a result policy and batch non-StopBatch
methods still default allow. Production ingress, User ownership, trusted internal
identity, built-in JWT/OIDC and complete HTTP authorization remain missing.

Shutdown during a parked `HostRecovery::start` drops startup ownership, revokes
readiness, cancels/joins prior owned children and closes ingress. Earlier completed
registrations' child failures can interrupt a later parked start. Children created
by the currently pending start are not independently polled until it returns.
Pre-listen lifecycle initialize/recover hooks also observe the same caller shutdown
future in both gRPC and HTTP hosts, with cancellation-safe RAII and initialized-prefix cleanup. Trusted host registration/handler/router composition is not a sandbox
against a malicious application registrar. Public metadata cannot manufacture
private task, workflow, map or supervised-root authority.

**Sources:** [host](src/application_host.rs), [HTTP](src/http_host.rs),
[generated authorization](src/codegen.rs), [placement](src/legacy_placement.rs).
**Coverage:** host lifecycle tests in [application_host.rs](src/application_host.rs),
[generated native fixture](tests/fixtures/generated_cxx_database_process/src/main.rs).

### Request-aware HTTP and ordinary receipt authorization (2026-10-09)

`get_with_request`, `post_with_request` and `options_with_request` preserve the
request while deriving HTTP name/token metadata before handler entry. Caller
identity stays untrusted; raw header/URI mutation cannot replace the immutable
snapshot or select application identity. Handlers own body size/time bounds and
JSON validation; no default authorization, CORS, multipart/WebSocket or streaming
RPC protocol is supplied by these route builders.

A real generated greeting consumer hosts a loopback HTTP-to-public-gRPC adapter,
not a native Database proxy. Its explicit fixture verifier/authorizer rejects
unknown/missing credentials and revoked grants before saved writer/constructor
responses. Authorization sees the current persisted actor bytes under the same
exclusive gate as receipt lookup. Ordinary protected readers/writers authorize
immutable raw/default protobuf state before state admission/decoding; constructors
preserve absent versus present-empty state and authorize before existence errors.
Unauthenticated owner-side compatibility APIs retain their historical replay path.

Native proof covers create/write/read, cached replay, header spoof isolation,
invalid JSON/UUID/oversized bodies, missing-actor authorization before admission,
revoked writer **and constructor** keys with observed current count 1 and exact
unchanged actor bytes `0801`, watch regeneration, restart and cached constructor
response 0 despite current state 1. A deliberately incomplete body receives 408
while the generated host drains shutdown; no RPC mutation occurs, listeners and
owned descendants close. These are ordinary local application routes, not a
production JWT/OIDC provider, arbitrary transaction gateway, distributed authority,
or lost-ACK/cancelled in-flight mutation proof. No default scaffold HTTP listener
or new public CLI HTTP option is claimed.

**Executed:** preflight `/tmp/reboot-rust-http-request-preflight-1791504298517132096`
passed all four HTTP unit tests and generated batch strict Clippy. Broad
`/tmp/reboot-rust-http-request-final-gates-1791504369366316353` passed strict SDK
Clippy, **408 SDK tests, 128 ignored**, generated HTTP consumer strict Clippy and
its verifier unit test, plus 26 recorded HTTP exchanges and native greeting
restart/regeneration/supervision/cleanup. Full batch regression
`/tmp/reboot-rust-batch-ledger-acceptance-1791504888009235674` passed **162 checks**.
Both accepted manifests confirm sources unchanged during execution. Earlier
unconfigured-verifier negative was an invalid test expectation; a corrected
explicit-policy native red then reproduced receipt-before-authorizer disclosure.
Only corrected green evidence is acceptance. Static review is not execution proof.

**Sources/evidence:** [routes](src/http_host.rs), [ordinary store](src/runtime.rs),
[policy](src/auth.rs), [native harness](../../tests/reboot/cli/rust_app_dx_e2e.py),
[fixture adapter](../../tests/reboot/cli/fixtures/rust_http_request_host.rs),
[HTTP checks](../../tests/reboot/cli/fixtures/rust_http_request_fixture.py).

### Transaction-root receipt authorization (2026-10-09)

Generated external exclusive roots, including factories, verify credentials and
obtain fresh participant admission before authorizing immutable raw optional
state. Only then may the one gate-protected receipt lookup validate a fingerprint
or return a cached success. There is no pre-admission receipt fast path. Execution
state decoding, missing-state diagnostics and factory-existing rejection follow
policy and replay, so a permitted factory retry can return its original response
against a newer existing state without invoking the factory again. Inbound/shared
branches do not acquire universal policy coverage from this change.

Replay now depends on current admission/Load and acknowledged cleanup, rather
than receipt availability alone. It waits behind retained/restored ownership;
restoration must settle before fresh admission. An absent snapshot is preserved
as None, not replaced with a cached response or fabricated state. Cleanup remains bound to
the newly admitted root/local-owner incarnation. Failed or cancelled terminal
ACKs retain uncertainty; they do not manufacture a successful denial/replay or
permission to reopen the original transaction. Receipt decoding occurs after
policy; current state is not decoded by generated execution on a successful
replay. Authorizers must handle raw bytes safely themselves.

Factory pre-handler policy and receipt awaits keep undurable Drop armed. A
synchronous generated guard transition immediately before handler invocation
restores the historical retained-handler lifetime, including all disarm flags.
It refuses owned cancellation/registration/inbound composition. This is not an
acknowledged Prepare and does not grant factory explicit-Abort authority. Handler
cancellation retains the existing uncertainty behavior; it is not newly supported
factory cancellation.

The real C++/RocksDB public generated-service test creates an absent actor with
factory response **7**, advances it through an exclusive writer to **12**, then
retries both original keys. A current-state ceiling of 10 denies both with
PermissionDenied; an allowing policy returns the original factory **7** and
writer **12** while the actor remains **080c**. Each invocation must freshly trace
current state 12. Exact original receipts and state survive denial, permitted
replay and restart of the same RocksDB directory. No direct storage seeding is
used by this new acceptance. This fixture uses an explicit state-sensitive app
policy, not a production identity provider or distinct-principal proof.

Generated-consumer cancellation tests reproduced the pre-handler retained-lease
bug before deferred disarm: authorization cancellation and cached-factory receipt
cancellation both prevented bounded re-admission. The repaired tests prove actual
parked awaits, no handler/terminal work before cancellation, subsequent admission,
and unchanged legacy handler-cancellation retention. These use fake sidecars;
they are not native cancellation, concurrent duplicate admission, lost-ACK,
malformed-state/receipt, or multi-participant proof. Existing exact-incarnation
and prepared-ownership regression gates remain required. Automatic root receipts
still store successful protobuf replies, not declared transaction errors.

**Sources/coverage:** [generator](src/codegen.rs),
[guard ownership](src/explicit_abort.rs), [participant](src/durable_participant.rs),
[generated consumer checks](tests/protoc_plugin_counter.rs),
[native public-service acceptance](tests/generated_cxx_database_process.rs),
[native fixture](tests/fixtures/generated_cxx_database_process/src/main.rs).

**Executed acceptance:** immutable final native root
`/tmp/reboot-rust-transaction-replay-final-native-1791510718240817276` ran three
nonzero ignored native tests: current-state receipt authorization, factory replay
collision, and post-decision factory recovery. SDK/all-targets and its nested
consumer: **411 passed, 129 ignored**, including **31 generated-consumer tests**;
strict SDK Clippy passed. The final invoker adjustment separates a bounded
read-only readiness probe from one tested mutation/replay and clears the probe's
authorization trace before that RPC. No status-based mutation retry is credited.

SDK/generator/guard sources are identical to the full CLI/HTTP proof at
`/tmp/reboot-rust-batch-ledger-acceptance-1791509285544767756` (**162 checks**) and
`/tmp/reboot-rust-http-request-final-gates-1791509982153855278` (**26 HTTP exchanges**,
ordinary replay/privacy, real restart/regeneration and partial-body shutdown),
with whole generated batch-consumer strict Clippy at
`/tmp/reboot-rust-http-request-preflight-1791509213659158995`.
Only the native fixture invoker changed afterward; the final native/SDK rerun
above freezes and verifies that adjustment. Earlier native exclusive-root
idempotency and post-decision recovery also passed at
`/tmp/reboot-rust-transaction-replay-regression-1791509057181156168`.

**Remaining scope:** native factory cancellation, concurrent duplicate admission,
malformed snapshots/receipts, unknown-ACK cleanup and multi-participant authorization
remain unproved. Shared/inbound/task/workflow policy coverage and automatic durable
transaction-declared replies remain separate contracts. This closes the bounded
external-exclusive/factory cache-authorizer bypass, not broad authorization parity.

### Host-wide lifecycle health observations (2026-10-09)

Canonical `grpc.health.v1.Health.Check` and `Watch` share host readiness:
SERVING requires recovery Ready and all opted-in placement declarations. Required
placement loss is NOT_SERVING, even if recovery alone is Ready. Health remains
read-only control ingress available before public actor readiness; observing it
neither grants actor/transaction authority nor relaxes dispatch gates.

Watch sends a current initial observation and changed statuses. Its stream owns
only watch receivers and a boxed pending change future, without detached producers,
queues, database calls, polling timers or extra dependencies. Snapshot versions
are marked before constructing change waits, so a notification between sampling
and polling is retained. Duplicate and fast/slow-client observations coalesce;
this is not a durable transition log, readiness lease or retry authorization.

Observed Failed or owner-channel closure emits NOT_SERVING (unless already the
last observed status) and ends. Once polled, termination on host failure/shutdown stops the observer waiting
for another source change during graceful router shutdown. Arbitrarily stalled
transport/backpressure shutdown is not newly certified. Transport loss
can prevent delivery; no universal final-message delivery is promised. Dropping
or cancelling the stream releases its pending receivers synchronously.

Requests are intentionally host-wide: service names are ignored like the existing
custom Check contract, not per-service SERVICE_UNKNOWN discovery. This additive
Rust Watch does not claim Python parity: Python Watch is unimplemented, and its
Check includes a websocket probe that Rust does not implement.

Sources: [host](src/application_host.rs), [wire lifecycle tests](tests/application_host.rs),
[native CLI observer](../../tests/reboot/cli/fixtures/rust_http_request_fixture.py).

**Executed acceptance:** `/tmp/reboot-rust-health-watch-preflight-1791511880749185669`
ran three direct health stream tests and all twelve real-wire host tests, including
recovering NOT_SERVING -> Ready SERVING -> shutdown NOT_SERVING -> EOF. Placement
revocation/regain, duplicate/slow observations, owner closure and receiver release
are directly exercised. Whole generated batch-consumer strict Clippy passed at
`/tmp/reboot-rust-http-request-preflight-1791511962500090882`.

Final native/SDK proof:
`/tmp/reboot-rust-health-watch-final-gates-1791513399274396552`;
**414 Rust tests passed, 129 ignored** (including 31 nested generated-consumer
checks), strict SDK Clippy and 26 real HTTP exchanges. The ordinary native CLI
consumer holds a public Health.Watch during shutdown and receives exactly
**SERVING, NOT_SERVING, EOF**, while the parked HTTP body drains with 408 and
listeners/process groups close. Caller-resource fault tests cover failed Watch
creation, first-frame failure and shutdown observation; channel/call/partial-body
socket cleanup is not counted as native status delivery. Current CLI unit gate
also passed. Only those fixture/CLI test files changed after the broad batch run;
SDK/host/generator sources remained identical and final native/SDK acceptance
froze the final harness.

The full **162-check** native persisted batch regression passed at
`/tmp/reboot-rust-batch-ledger-acceptance-1791512596767606765`, preserving app/map
restoration, tasks/replay/cancellation, restart and watcher cleanup. No dependency,
lockfile, new producer, timer or second application owner was added.

**Remaining:** per-service health discovery, websocket/end-to-end storage health,
transparent reconnect/resume, a durable transition log and arbitrary transport
backpressure shutdown guarantees are not implemented or proved. Native placement
revocation/failure transitions are not credited by the default greeting shutdown
observer; those require separate live-placement/fault acceptance. Overall parity
remains incomplete.

### Pre-listen lifecycle shutdown and cleanup (2026-10-09)

The gRPC `RunningApplicationHost` polls one pinned caller shutdown future before
and during every pre-listen initialize/recover hook, then reuses it for host
recovery and serving. Shutdown wins simultaneous hook readiness. Interruption
drops the actual awaited hook future before revoking readiness and awaiting
cleanup; no later hook, recovery registration or listener starts on that path.
A final-hook/empty-registry boundary check prevents a shutdown made ready by the
last hook from reaching bind. An incomplete initialize is not treated as
initialized: it must own partial resources through cancellation-safe RAII.
Interrupted recover receives cleanup because initialization already succeeded.
Trusted callbacks must not detach unowned work.

Every successfully initialized component is cleaned in registration order, even
if an earlier cleanup returns an error. Primary hook, bind, recovery-registration,
recovery-child, transport and sticky durable-uncertainty failures are not replaced
by cleanup errors. Otherwise the first cleanup error is reported. Normal ready
shutdown publishes Failed before signaling router cancellation; the publication
order is source-backed, not an assertion of universal remote final-frame delivery.

Five original-source regressions failed at baseline `0945e0b3`: parked initialize
and recover ignored shutdown, precompleted shutdown ran hooks, bind failure
skipped cleanup, and a cleanup error masked the primary lifecycle failure.
Result record: `/tmp/reboot-rust-lifecycle-startup-red-1791514597429512892/result.json`
(process `proc_5e2469e62677`, exit 101; one existing test passed, five failed).
Current tests additionally cover shutdown becoming ready in the last hook,
precompleted empty registry, recovery-registration/child primary failures and
sticky uncertainty surviving cleanup failure. These are actual host/RAII/wire
lifecycle tests, not new C++ transaction-cancellation or durable recovery proof.

**Executed final revision:** `/tmp/reboot-rust-lifecycle-startup-final-gates-1791516077707479328`:
21 host integration tests, **424 Rust tests passed, 129 ignored**
(including 31 nested generated-consumer checks), 24 CLI tests and strict SDK
Clippy. Native generated greeting/HTTP acceptance preserves 26 exchanges,
authorization/replay, real RocksDB restart, rebuild/supervision and owned-child
cleanup; its Health.Watch still receives SERVING -> NOT_SERVING -> EOF.
Whole generated batch-consumer strict Clippy: `/tmp/reboot-rust-http-request-preflight-1791516677539529570`.
Full **162-check** native persisted batch regression: `/tmp/reboot-rust-batch-ledger-acceptance-1791517288056386300`.
Frozen manifests were read back against the final source before ledger refresh.
A preceding final-revision batch run at
`/tmp/reboot-rust-batch-ledger-acceptance-1791516751240757543` stopped after 92 checks
when explicit read-only reconnect returned Unavailable after restart instead of
the requested snapshot; that failed run is not acceptance. A fresh public reader
on its still-running host returned `batch-001 3 1 1 1`. Normal CLI SIGINT shutdown
closed the recorded CLI/Database/host PIDs before the isolated rerun above.
No uncertain mutation was retried. The reconnect failure's exact transport cause
is not established; first-attempt reconnect robustness remains an unresolved
fixture observation, not transparent reconnect or new retry authority.

**Scope at this gRPC checkpoint:** the independent HTTP host startup/cleanup
implementation was not repaired here; the later HTTP checkpoint below extends it. Cleanup hooks are not forcibly timed out; hanging hooks,
panics, externally aborting the entire host future and detached callback effects
are not certified. Generic hooks do not infer Abort or erase sidecar uncertainty.
No new distributed cancellation, lost-ACK recovery, per-service health, actor
ownership or exactly-once external-effect guarantee is claimed. Overall parity
remains incomplete.

Sources: [host](src/application_host.rs),
[host integration tests](tests/application_host.rs),
[native greeting/HTTP regression](../../tests/reboot/cli/rust_app_dx_e2e.py),
[persisted batch regression](../../tests/reboot/cli/rust_batch_ledger_e2e.py).

### HTTP lifecycle startup cancellation and cleanup (2026-10-09)

The external-only `HttpApplicationHost` now pins one caller shutdown future
before initialize/recover and moves that same owned pinned future into Axum's
graceful shutdown. Initial and final-hook/empty-registry boundary probes prevent
already-observed shutdown from running hooks or reaching bind. Biased selection
interrupts a parked hook; its owned future drops before cleanup. Only completed
initialization joins the cleanup prefix. All initialized hooks are cleaned in
registration order despite returned errors. Primary hook/bind/HTTP transport
errors survive cleanup; otherwise the first cleanup error is returned. This
repairs the former `result.or(cleanup)` false-success/error-masking behavior.

Six original-source HTTP regressions failed against `eb08bc98` (process
`proc_18f533ee9313`, exit 101): parked initialize/recover ignored shutdown,
precompleted shutdown ran hooks, startup cleanup masked its primary error,
bind cleanup stopped early, and normal cleanup failure returned success.
Two boundary tests already passed. All eight HTTP lifecycle integration tests
pass in the final revision; parked tests assert RAII drop-before-cleanup, exact
initialized-prefix traces and absent listener. These are direct HTTP host tests,
not new native sidecar transaction-cancellation evidence. Transport precedence
is source-backed, not a new forced transport-error regression.

**Executed final revision:** `/tmp/reboot-rust-http-lifecycle-final-gates-1791519078351082710`: eight HTTP lifecycle tests,
**432 Rust tests passed, 129 ignored**, 24 CLI tests and strict SDK
Clippy. Native generated public CLI greeting/HTTP/health/restart/cleanup retains
26 exchanges and SERVING -> NOT_SERVING -> EOF. The HTTP-only listener hook trace
is exactly initialize/recover/shutdown once per recorded normally stopped host PID,
including the two hot-rebuild hosts; abrupt whole-future drops are not credited; it owns no app,
map, task or sidecar recovery participants. Whole generated batch-consumer strict
Clippy: `/tmp/reboot-rust-http-request-preflight-1791519671124187273`; native persisted **162-check** batch: `/tmp/reboot-rust-batch-ledger-acceptance-1791519744444676826`.
Frozen manifests, database identity and recorded PID absence were audited before
canonical fingerprint refresh.

**Limits:** trusted hooks must own partial resources via cancellation-safe RAII;
cleanup can still wait indefinitely, panics and externally aborting the whole
serving future are not asynchronous cleanup guarantees. No routing authority,
retry, NoAuth, durable Abort or external-exactly-once semantics are expanded.
Overall parity remains incomplete. This extends the previous gRPC-only checkpoint;
its historical HTTP exclusion no longer describes the current host.

Sources: [HTTP host](src/http_host.rs),
[HTTP lifecycle regressions](tests/http_application_lifecycle.rs),
[native HTTP fixture](../../tests/reboot/cli/fixtures/rust_http_request_host.rs),
[native lifecycle inspector](../../tests/reboot/cli/fixtures/rust_http_request_fixture.py).

## Legacy transactions and ownership

### Implemented transaction shapes

Generated typed application RPCs carry validated transaction context to targets,
which load/authorize/run/stage their actual handlers and return participant
membership in trailers. The root collects membership and persists the complete
coordinator set before Prepare. Terminal `Participant` control RPCs do **not**
start/load/stage application methods. The rejected `ParticipantLifecycle.Start`
/`Stage` proposal is obsolete and must not become a roadmap requirement.

Legacy coordinator/participant recovery, resolver/placement routing, durable
state/idempotency, exclusive and factory roots and bounded shared/read-only
paths exist. Fresh local shared-to-exclusive promotion is implemented through a
consuming direct-local handoff on one existing actor: unchanged state takes the
read-only path; mutation owns Prepare/terminal delivery. It is not general
remote/shared promotion. Actor gates include queued-writer fairness,
cancellation-safe admission and supported exclusive-to-shared downgrade.

A successful response/trailer is not a durable decision. Transport uncertainty,
lost terminal ACKs, cancellation and sticky shutdown failure retain ownership
rather than synthesize an Abort or permit live competing admission. Recovery
uses durable canonical decisions; unprepared work must not become a fabricated
Commit. No general transparent retry after uncertain terminal operations exists.

### Supervised chains, rollback and root-star

- Explicit supervised existing-actor exclusive non-factory/non-idempotent
  A→B→C chains preserve original root identity, paths, registered root cleanup and
  each inbound participant's live Watch ownership. Builder/header flags alone do
  not grant authority. Successful-return chains and participant-local task effects
  are bounded supported shapes, not arbitrary-depth tree orchestration.
- First-touch direct-leaf declared-error rollback can retain read-only leaf
  ownership so a root catches the declared failure and commits its own effects.
  Exact singleton membership, admitted incarnation and canonical declared errors
  are mandatory; failed private handler state/tasks are discarded before staging.
- The descendant variant allows B to catch first-touch C, then succeed to A.
  B failure after the catch does not give A general subtree rollback authority.
  C restart before Prepare fails closed; no synthetic duplicate-Prepare success
  or crash-surviving in-memory read lease is supplied.
- `with_sequential_root_star()` permits sequential distinct leaves A→B then A→C.
  The runtime consumes counted scope and performs the real typed unary call;
  caller-created receipts/futures cannot settle membership. Repeated targets,
  overlapping scopes and descendants under this policy are rejected. After B
  succeeds, failed C dooms the root even if caught; uncertain C is not invented
  into confirmed membership. Trusted hosts supply fresh child IDs/routes.

**Additional implemented policy (source/test coverage, not rerun native release
certification here):** `with_sequential_reusable_participants()` allows bounded
serial same-root reuse of direct existing exclusive leaves using fresh nested
IDs. Retained staged effects and per-call snapshot/relinquishment are separate
from distinct-target root-star. Active/prepared/uncertain/stale/completed-ID or
shared-retained admissions fail closed; the canonical bounded
`relinquish_ownership` control path exists. See
[reusable acceptance](tests/fixtures/reusable_participant_acceptance.rs). This does
not establish concurrent/reentrant/intersecting subtree or general ancestor
snapshot semantics.

**Admission limits:** supervised paths are bounded to 32 transaction IDs; merged
participant sets are bounded to 1024. These are rejection boundaries, not automatic
paging or unlimited descendant traversal.

**Still missing:** general sibling/reentrant/intersecting subtrees, ancestor
staged snapshot restoration, nested rollback/retry, unrestricted shared/factory/
idempotent composition, general pre-Prepare coordinator-death resolution,
actor migration and cross-process dispatcher/ownership fencing. A bounded chain
or sequential distinct star is not the Python general ownership engine.

**Sources:** [runtime contexts](src/runtime.rs),
[participants](src/durable_participant.rs), [coordinator](src/durable_coordinator.rs),
[owned abort/scope](src/explicit_abort.rs), [generated stubs](src/codegen.rs),
[legacy protocol](../../rbt/v1alpha1/transactions.proto).
**Coverage:** [direct rollback](tests/fixtures/remote_leaf_task_acceptance.rs),
[descendant rollback](tests/fixtures/descendant_rollback_acceptance.rs),
[failure vectors](tests/fixtures/descendant_rollback_failure_acceptance.rs),
[sequential star](tests/fixtures/sequential_star_acceptance.rs),
[tree tasks](tests/fixtures/tree_participant_task_acceptance.rs).
Python comparison: [contexts](../aio/contexts.py), [stubs](../aio/stubs.py),
[state managers](../aio/state_managers.py). These compare semantics, not mixed apps.

### Isolated Native2pc

Native2pc has separate identities, journals/RPCs, routing and recovery/
materialization primitives. It is real implemented functionality but is not the
canonical legacy transaction protocol. Enrollment digests are supplied externally;
there is no general generated user-method/effect/task executor or retry/timeout/
lock-owning application coordinator. An acknowledged Committed decision is not
proof of participant terminalization/materialized state or executed effects.
Never use its passing tests to certify a
legacy transaction shape or general SDK semantics. Keeping that evidence separate
is still necessary even though mixed-language applications are not a goal.

**Sources:** [native protocol](../../rbt/v1alpha1/native_2pc.proto),
[native sidecar](../server/database.cc).
**Coverage:** [native transport](tests/native_2pc_transport.rs).

## Durable tasks and typed results

Generated existing-actor unary reader and ordinary non-constructor writer methods
can be scheduled immediately or at a canonical absolute UTC timestamp. Generated
owners must be actively registered with host recovery; a dormant builder cannot
schedule. Pending work is durable data, not a queue message. Bounded canonical
rescans discover committed work even when notifications are lost; future tasks
do not block ready peers. The supported runtime bounds pending/admitted work and
owns bounded concurrent singleton deliveries rather than unbounded detached workers. Singleton
admission bounds pending plus staged tasks to **1024**. Shared canonical recovery
rejects a cumulative Pending batch over **1024 before dispatch**, even if each
owner is individually below the limit; it does not page/drain excess work.

Writer success atomically persists actor state plus its saved response, then
**separately** completes via canonical CompleteTask CAS. Restart replays that
checkpoint without remutating, including after an intervening ordinary writer.
This is not atomic Store+CompleteTask. CompleteTask first-result-wins applies to
its CAS authority. Its mutex serializes CompleteTask and nontransactional Store,
but legacy Store still unconditionally upserts tasks; transaction commit/import
have separate write authority. Thus alternate overwrites are not universally
prohibited by the CAS or mutex.

Method-declared reader/writer errors persist as validated `Any<google.rpc.Status>`.
Immutable trusted registration binds full method, state/request/response types
and exact declared-error decoders. Generated Wait checks stored method/terminal;
same response types do not authorize another method. Rich RPC failures remain
transport/system `Grpc` failures rather than becoming declared results just
because their details resemble a schema. Trusted custom registration is not
cryptographic/protoc-origin sealing or third-party Tasks-server certification.

Ordinary writer `PreStoreFailure` receipts now escape as supervised failures,
without live retry. Before Store does **not** establish local-computation-only
provenance: handlers can forward transport or Cancelled statuses and perform
external IO. This on-path fail-closed correction removes the previous implicit
three-attempt policy; the workflow's explicit `RetryLocal` policy remains separate.
The fresh ordinary-writer native regression executed all 10 selected cases,
including the changed handler-failure vectors; historical three-attempt writer
proof is not evidence for this correction.

Failed private state is discarded. Framework Load/Store/replay/completion errors
escape that retry receipt path, and actual owner cancellation/uncertainty remains
fenced. Declared returns before completion CAS may be redelivered: no exactly-once
handler/external-effects guarantee or durable error checkpoint is claimed. Losing
CAS accepts an equal validated canonical winner; conflicting/malformed terminals
fail closed.

Canonical typed `Tasks.Wait` supports registered actors, exact response/error
validation, deadlines and per-poll/pre/post-Load accepted placement authority.
Generated routed Wait selects the latest client route, not a generic retry/migration
engine. Multi-actor/shared-shard reader recovery collects one canonical stream,
validates the whole bounded batch before dispatch and partitions exact type/ref.
Shared recovery does not install cross-actor transaction scheduling authority.
It supports graceful shutdown/redelivery without changing Pending to Cancelled.

Supported explicit supervised tree participants may stage **their own** reader/
writer tasks while exact root/Watch/gate ownership remains valid. Prepare carries
private effects; only committed canonical Pending plus local terminalization
makes them runnable. Trailers/queue hints/root decision alone cannot publish
work. Arbitrary foreign task upserts remain rejected.

Canonical server-local `Tasks.ListTasks` is opt-in on `ReaderTaskWaitService`:
`with_admin_authorization(verifier, authorizer)` requires both explicit
application-owned policies; no policy means denial. Authorization receives an
encoded ListTasks request and no actor state. Original dispatch generations are
retained across both policy awaits; accepted placement, activity and sticky
uncertainty are rechecked before disclosure. This is application-controlled
administration, not Python's built-in admin credential mechanism.

Only an explicit matching `only_server_id` and singleton-recovered owners are
admitted. The bounded in-memory cache records actual `SCHEDULED`, `STARTED` and
local `SCHEDULED_RETRY` phases, preserves retry counts across rescans, prunes
completed IDs on subsequent canonical scans and clears on owner revocation.
Phase timestamps/failure counts are local to this server generation; there is no
atomic canonical snapshot, durable transition history or completed-cache parity.
`iterations` is the canonical task-level count, not a finite workflow checkpoint
index. Shared-reader recovery listing and cross-server aggregation remain rejected.

Canonical `Tasks.ListTasksStream` shares the exact local listing scope and emits
an initial snapshot, then changed observations. Its RPC-owned lazy future polls
at 200ms, retains the original dispatcher generations for the subscription
lifetime and re-verifies/re-authorizes the exact stream method on each observation
before post-await placement/activity/uncertainty checks. Errors terminate the
stream; Drop cancels its timer/policy future, without a spawned producer or
unbounded event queue. Slow consumers coalesce current observations, not a durable
event history. Revocation is checked on the next pulled observation, not pushed
independently through backpressure. The initial snapshot is authorized at RPC
admission. Generated batch `tasks-watch` supplies bearer/server scope and an RPC
deadline; reconnect creates a new current snapshot, without a resume cursor.

**Missing:** transactional task targets, running/ordinary/distributed cancellation and full aggregated listing,
automatic task-creator ACLs, broad retry policies, distributed dispatcher fencing and
migration, arbitrary shared/factory/idempotent tree scheduling. Workflow methods
have their separate context/result contract below, not ordinary declared-task
error semantics.

**Sources:** [task owner/recovery/Wait](src/one_shot_tasks.rs),
[generated descriptors/schedulers](src/codegen.rs), [writer checkpoints](src/runtime.rs),
[canonical task/CompleteTask](../../rbt/v1alpha1/database.proto),
[Database CAS implementation](../server/database.cc).
**Coverage:** [task vectors](tests/fixtures/task_vertical_acceptance.rs),
[tree tasks](tests/fixtures/tree_participant_task_acceptance.rs),
[shared recovery](tests/fixtures/task_vertical_acceptance.rs).
Python comparison: [task dispatcher](../aio/internals/tasks_dispatcher.py),
[Tasks service](../aio/internals/tasks_servicer.py),
[generated method contract](../templates/reboot.py.j2).

### Implemented, bounded scheduled-workflow cancellation

Implemented on baseline `f385e2b49680e1fb7d2e7bfd557bfe3bc2875cf2` (2026-10-08).
Public canonical `Tasks.CancelTask` shares the listing admin's explicitly configured
verifier AND authorizer; default host exposure remains deny. Original dispatcher
generation and server-owned application/server identity are captured before policy
waits. Authorization receives the exact encoded request without actor-state loading;
identity/UUIDv4/placement/owner errors follow successful policy outcomes. Malformed
transport headers still fail parsing before authentication.

Eligibility is a registered singleton workflow, future-scheduled and not entered
STARTED **in this local owner generation**. SCHEDULED is a process-local observation,
not a durable certificate that no prior generation ran it; prior effects across
recovery/clock rollback are retained. Actor-exclusive admission serializes cancellation
with workflow start. Initial admission reloads/validates canonical Pending, owner and
due time and marks STARTED before releasing the gate; a stale completed hint is
validated/skipped without invoking the body.

Cancellation preserves identity/request/method/schedule and performs one sync
`Database.CompleteTask` Pending→Completed CAS, with `Any<google.rpc.Status>` code
Cancelled and exactly one typed `rbt.v1alpha1.Cancelled` detail. A valid ACK plus
still-current authority yields OK; missing/completed canonical tasks yield NOT_FOUND.
Running/due workflows and ordinary task targets are rejected. This is NOT Python's
interrupt/async-cleanup/CANCELLING protocol. False CAS, transport/drop uncertainty
or post-ACK authority loss leave sticky uncertainty before lease release. Existing
host supervision propagates failure asynchronously; no status retry or synchronous
readiness-revocation guarantee is added.

Canonical workflow validation/generated Wait recognize cancellation separately from
business declarations. Declared body validation cannot inject it as an undeclared
business error. Generated Wait retains original TaskId/exact method metadata and
supports both business-error enums (Grpc arm) and no-business-error methods
(tonic::Status). An actual no-error consumer exposed unconditional identity
conversions and a fallback-only match under strict Clippy; generation now emits
only required conversions and direct fail-closed empty validation.

The public batch client adds `cancel TASK_UUID`, with separately admitted exact
admin request. Cancellation does **not** roll back submission state, map data,
scheduling replay or saved steps, nor release an app business reservation.
Compensation/retirement needs a separate app writer, not an invented rollback.

**Executed final acceptance** (all accepted manifests recorded unchanged source):
- `/tmp/reboot-rust-batch-ledger-acceptance-1791466910057365779`: actual public
  scaffold/generation/Cargo/rbt/CXX/RocksDB. Disabled admin, absent/invalid bearer,
  wrong route and running-task denial preserved canonical records. Two generated
  clients concurrently cancelling returned one OK and one NOT_FOUND. Typed Wait
  exposed Cancelled; durable status/type/details and immutable payload/schedule
  matched. Submission/map/replay remained intact; scheduling replay did not reopen
  the terminal; live inventory pruned it. Full RocksDB restart returned identical
  terminal/Wait and zero body dispatch beyond original due time. Batch/reactive/
  reconnect/watch/typed-business-error regressions passed; recorded children reaped.
- `/tmp/reboot-rust-batch-ledger-final-gates-1791467542400778108`: SDK strict
  all-target Clippy with test-support, **398 passed, 0 failed, 128 ignored**;
  default native greeting durable restart/supervision/failed-live-rebuild cleanup.
  The native batch consumer passed strict Clippy and four tests.
- `/tmp/reboot-rust-cancellation-no-business-errors-1791466814746697061`: separate
  generated no-business-error consumer strict all-target Clippy and four library
  tests. This is compiler/consumer evidence, not native persisted cancellation
  for that schema variant. All 51 focused codegen controls passed. SDK controls
  exercise exact rich validation, admin auth/revocation and sticky destructor
  uncertainty; their unit/static role is not native lost-ACK proof.
- First native stage `1791465354930538153` failed an inspector before cancellation
  (ColocatedRangeResponse incorrectly treated as rows), not accepted.
  `1791466020736921795` passed native semantics but was superseded after the
  no-error compiler repair. Final native/broad proofs above were rerun after it.
  Concurrent clients have separate exact PID/command/log records, not a
  thread-unsafe sequential evidence helper.

Both source reviews found no confirmed defect. Source/destructor controls and
uncontrolled concurrency do NOT prove actual completion-CAS lost ACK, dropped
in-flight completion or a deterministic start-versus-cancel race; these are explicit
test gaps. Running/ordinary cancellation, active-body cleanup, distributed authority,
durable phase history and Python CANCELLING remain unsupported. Other parity gaps
are not closed by this slice.

**Sources:** [cancellation](src/task_cancellation.rs),
[controls](src/task_cancellation_tests.rs), [workflow admission](src/workflow_context.rs),
[typed Wait](src/workflow_codegen.rs),
[public native acceptance](../../tests/reboot/cli/rust_batch_ledger_e2e.py).

## Durable named workflows

Standalone workflow descriptors emit a typed handler, private `WorkflowContext`,
workflow scheduler, named writer-step helpers and typed canonical Wait. Ordinary
writer `method_scheduled` hooks can atomically persist state, task and idempotent
scheduling response. Reusing the scheduling key returns the saved handle;
request/method collisions fail closed. A direct public workflow RPC is denied;
public workflow metadata is never private dispatcher authority.

Explicit host recovery registration is mandatory. Steps are **finite explicit
workflow-global names**, same actor, ordinary writers. Each acquires its own actor
lease, validates exact Pending/owner/cancellation and atomically stores effect
plus typed result/provenance. The body holds no actor lease across its own waits.
Acknowledged steps replay saved results without invoking their writers. Task
completion uses canonical CAS outside the body retry branch.

Step identity uses the external-key helper UUIDv5(workflow UUID, name), not the
complete Python typed-RPC manager alias/seed machinery. Writer/result contract,
workflow method/request and step request are fingerprint-bound; conflicting
reuse is rejected. `workflow_iteration` is absent outside loops, not Some(0),
although Task iteration is zero. Incomplete legacy replay records fail closed.

The generated workflow-specific attempt hook defaults ordinary `Status` to
nonretryable `WorkflowBodyError::Failed`. An application may explicitly request
`RetryLocal(String)` **only for local computation failure**. Private failed/
dropped/active operation evidence, exact scope/Pending, original owner generation,
sticky uncertainty and cancellation must remain clean. At most three total
attempts, with 25/50ms backoff, run without restarting the host. Actual transport
`Internal` (e.g. BrokenPipe) is not local-body provenance. Load/recovery, step/
Store uncertainty, completion failures and cancellation do not request retry.
Swallowing/dropping a failed framework operation cannot erase its fence.
Successful finish checks attempt cleanliness before minting its own operation;
receipt acceptance and canonical completion under the actor gate independently
reject unclean attempts. Native caught-reader acceptance proves fail-closed host
supervision and an unset Pending terminal across restart, not recoverable
reader-error replay. Changing saved-step method/request identity requires an
explicit migration; incompatible persisted replay fails closed.

One dispatcher owns at most 1024 live bodies by default, equal to the durable
Pending admission bound (configurable 1..1024 before recovery via
`set_max_live_deliveries`). Each Pending ID is delivered at most once while live.
Parked bodies consume the budget, but every accepted due ID has a delivery slot;
scheduling rejects Pending plus staged work above the configured budget before
commit rather than accepting work that could be stranded indefinitely. Recovery
fails closed if the persisted Pending set exceeds the configured budget. Ordinary
actor RPC admission is separate. Completed children may briefly occupy a slot
until joined; canonical rescans then admit their replacements.
Exhaustion retains existing supervised host failure and Pending restart progress.
There is no durable quarantine or separate per-workflow readiness contract;
the three-attempt budget resets per host delivery after restart.

### Implemented, bounded application cooperative stop

The public batch-ledger app can opt an **immediate** batch into cooperative stop
with `Submit.stop_enabled`; default-false submissions retain the previous wire
encoding and `approved-through-index.v1` predicate identity. Opt-in state binds
the original workflow UUID. An authenticated configured task admin calls ordinary
`StopBatch(batch, task_id)` with an idempotency key. Stale UUIDs, non-opt-in batches
and finished batches return typed `StopDenied`, not guessed cancellation.

The workflow branches on its returned **persisted** reader observation using
`approved-or-stop.v1`, then calls private named `FinishStopped`. It retains the
acknowledged prefix, maps and saved business decisions and returns an explicitly
`stopped` partial Ledger through canonical successful Tasks.Wait. Further
approvals are denied after stop intent commits; an already observed approved unit
may finish before the next observation stops. A replacement batch resets control
flags; its UUID isolates delayed stop requests even when the batch name is reused.
Public FinishStopped scheduling is denied and both control methods remain writers,
not reactive reader targets. Existing task ownership and participant restoration
order are unchanged.

Ordinary workflow-service scheduling writers now load canonical current actor
state and run the authorizer **before** recovering/returning any cached receipt,
under the same exclusive actor gate. Verified/no-op token handling alone is not
authorization. Owner checks bracket awaited policy/recovery work and existing
Store uncertainty fencing remains intact. Previously a cached receipt could bypass
the authorizer; native restart with server administration disabled now denies the
exact previously accepted stop key without changing durable records.

This is a finite application control-flow branch, **not** canonical running-task
cancellation, Python durable Break/unbounded cursor parity, asynchronous interruption,
rollback of prior effects, compensation or external-effects exactly-once. Stop
checkpoint Store lost-ACK and post-checkpoint/pre-terminal crash/replacement are
not newly exercised; general task cancellation gaps remain unchanged.

Sources: [batch application](../cli/commands/init/templates/rust_batch_lib.rs.j2),
[admin policy](../cli/commands/init/templates/rust_batch_host.rs.j2),
[shared scheduling replay](src/workflow_store.rs),
[native acceptance](../../tests/reboot/cli/rust_batch_ledger_e2e.py).

### Implemented, bounded declared workflow terminals

Generated workflow methods may declare same-file protobuf business errors.
Their handler returns a typed error enum; its explicit declared variant becomes
`WorkflowBodyError::Declared`. Plain tonic `Status`, even rich Status, remains
nonretryable `Failed`. There is no status-code retry or error-detail classification
of transport failures. Ordinary reader/writer errors inside workflow services
and serial named writer business decisions are covered below; constructors and
general system abort/running-cancellation terminals remain unsupported. The bounded
admin scheduled-workflow Cancelled terminal is documented separately above.

A declared terminal requires a clean outer workflow scope. Private failed,
dropped or active framework-operation evidence rejects it before canonical Load.
Immutable method declarations validate the exact rich Status shape, declared type
URL and decodable payload, independently of overridable binding hooks. Original
owner, Pending/due scope and cancellation checks then precede the existing
uncertainty-fenced canonical CompleteTask CAS. Acknowledged earlier checkpoints
are retained: business failure is not an all-workflow rollback. Terminal Store
or lost-ACK uncertainty does not authorize retry or a guessed error result.

Generated `*_wait` validates the canonical terminal and reconstructs the typed
business variant. RPC failures remain its `Grpc(Status)` variant. The batch app's
`submit-rejecting` path checkpoints a rejection before returning `BatchRejected`.
Public `Checkpoint` dispatch is explicitly denied by `checkpoint_scheduled`;
only admitted private workflow steps call the checkpoint handler. Subsequent
approval of a rejected batch fails, while a new scheduled batch can proceed.

### Implemented, bounded finite control-flow vertical

`WorkflowContext::iteration(name, index, count)` mints explicit finite indexed
replay scopes, with count bounded to 1..1024. Bounded nested scopes are supported by the separate
composition contract below (depth <=8; Cartesian bound <=1024 along each path). This is **not**
Python's unbounded canonical `Task.iteration` cursor or iteration GC. Task remains
iteration zero and restart reruns the finite application body, loading each
acknowledged typed decision/effect. Explicit finite Continue/Break is now supported
by the separate saved decision API below; this does not persist arbitrary Rust
control flow. Keep the finite count, indices, condition version and named calls
stable across replay.

Generated `WorkflowSteps::<reader>_until` binds exact immutable reader descriptor,
request/result types, explicit checkpoint alias and versioned named condition.
Predicates/reader implementations are trusted pure local computations; closure
semantics are not introspectable. Changed named condition, request, method, type
or finite count fails fingerprint validation at the same checkpoint identity.
Wait-only reader descriptors cannot be staged as ordinary tasks. Hierarchical
UUIDv5 operation namespaces and length-delimited loop/index/name material keep
waits, iteration writers and legacy global writer aliases structurally disjoint;
legacy global writer UUIDv5 semantics remain unchanged. Iteration checkpoint
records carry Some(index), distinct from global None.

The wait subscribes/marks revision before canonical Load and releases actor
admission before parking. A successful immutable read is checked and saved while
exclusive admission is retained; only its typed decision is stored (no actor
upsert or fabricated actor invalidation). A saved matched observation replays
before consulting live state, even after true-to-false flapping and host/RocksDB
restart. Failed/dropped operations retain private attempt evidence; original
owner generation, terminal reader revocation, cancellation and sticky uncertainty
remain fences. No Load/Store/completion uncertainty is retried.

Capacity regression executed on the corrected source:
`/tmp/reboot-rust-control-flow-loop1-capacity-final2-proof.json` records 64 parked
false predicates, ready workflow 65 completing without releasing them, the same
progress after host recovery, configured-capacity scheduling rejection with state
rollback, and undersized-recovery rejection. All 16 owned processes were reaped.
The corresponding SDK all-target tests and SDK/generated workflow consumer strict
Clippy gates passed (`/tmp/reboot-rust-capacity-final-{alltargets,clippy,consumer-clippy,native}.log`).
This is targeted capacity/control-flow evidence, not a fresh run of every ignored
native workflow or transaction acceptance.

The fresh post-repair frozen run in [Verification](#verification) executed all
three native workflow tests, including expanded capacity, subscription-before-read
and false-before-idle barrier races, saved wait flap/restart, three typed iterations
with exactly two checkpoints per finished iteration, ordinary RPC responsiveness
and parked-owner shutdown. Its control-flow proof records 16 owned processes,
all absent after cleanup. The 64 parked/ready-65 scenario is not a full 1024-body
stress test. Earlier native/capacity runs remain separate revision-scoped evidence.

Forced supervisor destruction revokes publication immediately, but each delivery
captures the registry owner before spawn/first poll and retains it until future
destruction. The controlled synchronous-callback unit test proves replacement
claim rejection while an old child survives supervisor abortion, then successful
claim after destruction. Its production spawn-helper mutant failed and restoration
passed; this is focused lifetime evidence, not execution of the entire host's
five-second forced-abort fallback or distributed fencing. Normal shutdown drains
owned children before releasing ownership.

Abort-drain preserves an already-selected delivery error using explicit fallback
provenance, not Status-code/message classification. It can adopt one completed
child error for a supervision fallback or successful cancellation, but does not
overwrite an already-selected primary with secondary readiness failure. Two
deterministic production-helper tests and an unconditional-overwrite causal mutant
exercise this correction without clearing uncertainty or authorizing retry. This
does not rank every concurrent failure by causal importance. Independent read-only
ownership and R1 diagnostic reviews found no unresolved decisive defect in those
bounded corrections; terminal execution/hash/cleanup audit is separate evidence.

**Missing:** Python unbounded cursor/GC and arbitrary durable Break semantics,
remote/cross-actor steps, nested transactions, mixed transaction/workflow services,
general durable reader failure isolation and full alias/seed semantics. The bounded
opt-in declared-reader outcome API below does not supply arbitrary catch semantics. No arbitrary external
side-effect exactly-once claim. New retry proof does not inject Store/CompleteTask
lost ACK; existing uncertainty tests/source guards are separate evidence.

**Sources:** [context/attempt fences](src/workflow_context.rs),
[checkpoint Store/recovery](src/workflow_store.rs),
[generation](src/workflow_codegen.rs), [dispatcher](src/one_shot_tasks.rs).
**Executed acceptance:** [native restart tests](tests/workflow_native_restart.rs),
[generated app](tests/fixtures/workflow_app/src/main.rs),
[restart proof](tests/fixtures/workflow_app/prove_restart.py),
[12-case body proof](tests/fixtures/workflow_app/prove_body_retry.py),
[finite control-flow proof](tests/fixtures/workflow_app/prove_control_flow.py).
This uses generated Create/ScheduleWork, not task-state seeding: future scheduling,
concurrent ordinary Read while paused, same-host failure/success, first writer
once, exhaustion, real transport/framework failures, cancellation, generation ABA,
root-handoff Drop, and pending/terminal persistence through actual host/RocksDB
restarts. Python comparison: [workflow API](../aio/workflows.py),
[dispatcher](../aio/internals/tasks_dispatcher.py).

### Bounded nested finite workflow composition (2026-10-09)

`WorkflowContext::iteration` composes same-actor finite scopes up to eight levels,
with a checked Cartesian bound of at most 1024 leaf positions along a nested path.
Names, nonzero bounds and indices are validated; rejection retains failed-attempt
provenance. This bound is not a workflow-wide checkpoint quota. Every scope retains
original dispatcher generation, cancellation and shared attempt fences.

Flat scopes and global checkpoint identities remain byte-for-byte unchanged.
Nested writer/wait/decision identities use a separate `reboot.nested.scope.v1`
UUIDv5 namespace with length-delimited parent names/indices and existing leaf
identity. Bounds stay out of keys and bind fingerprints (all parent bounds plus
leaf bound): changing a bound hits the original record and fails closed, rather
than creating a new effect. Canonical checkpoint workflow_iteration stores the
local leaf index; UUID identity distinguishes repeated leaf indices under different
parents. Canonical Task.iteration remains zero; there is no cursor advancement/GC.

The generated batch application exposes `Submit.group_size`, `submit-grouped` and
`submit-grouped-break`. A nonzero size must divide the bounded item count. Actual
outer-group/inner-item loops reuse generated immutable reader waits, writer steps
and saved Continue/Break decisions; Break exits the whole group loop before the
existing private after-loop writer. Approvals retain global item indices. Zero
retains the original single-loop path. Public direct private-finalizer calls and
invalid group sizes reject before durable mutation.

**Executed public Cargo/rbt/native:** `/tmp/reboot-rust-nested-cli-1791550478430403401` (26 checks) processed
four items in two groups. Repeated leaf zero produced distinct checkpoints; three
saved decision envelopes independently matched full-path UUIDs, response snapshots
and Continue/Break. After saved Break, a generated-handler-only parent-bound drift
made real recovery fail closed on the original checkpoint identity. Supervised
children were reaped; restoring the bound then restarting real RocksDB/host
retained exact app/map/Pending-task/checkpoint bytes, without callback reexecution.
Canonical public Wait completed one private after-loop effect and no fourth item;
terminal restart retained exact state and did not redispatch. A second ordinary
grouped batch exhausted both groups through canonical Wait. Generated consumers
passed strict Clippy/fmt and 13 tests; 24 CLI tests passed.

SDK `/tmp/reboot-rust-nested-sdk-1791550840030951404`: 446 passed, 131 ignored, strict all-target Clippy. Admission vectors
exercise nested namespace separation, siblings/depth, changed parent bound at the
same key, exact legacy flat key, depth8/product1024 boundaries and tainted invalid
scope admission. Explicit native reader-outcome and staged-map restart gates passed.
Retained public map `/tmp/reboot-rust-map-reentry-cli-1791551104348889239` (18), batch `/tmp/reboot-rust-batch-ledger-acceptance-1791551380009232896` (162), pagination `/tmp/reboot-rust-pagination-cli-1791552132266523406` (22),
generated/HTTP preflight `/tmp/reboot-rust-http-request-preflight-1791550403064564143`, and greeting/HTTP/rebuild/health/cleanup
`/tmp/reboot-rust-loop-decision-greeting-1791552427706479774` (26 HTTP exchanges) passed. Frozen source/native Database identity,
resource bounds and proof-owned PID absence audited before digest refresh.

Python currently permits only one context.loop per workflow
([state manager](../aio/state_managers.py)); this bounded nesting is a separate Rust
application contract, not Python unbounded loop/cursor parity. No nested transaction,
remote/cross-actor composition, concurrency, arbitrary durable catch, full-depth
native saturation, new lost-ACK injection, automatic framework retry or external
exactly-once guarantee is established. Overall Rust parity remains incomplete.

Sources: [scope identity/fences](src/workflow_context.rs),
[checkpoint fingerprint/replay](src/workflow_store.rs),
[generated grouped body](../cli/commands/init/templates/rust_batch_lib.rs.j2),
[public native acceptance](../../tests/reboot/cli/rust_batch_ledger_e2e.py).

### Finite saved Continue/Break and after-loop work (2026-10-09)

`WorkflowContext::decide_reader` and generated `WorkflowSteps::<reader>_decide`
save one same-actor immutable observation and its pure boolean classifier result
as a typed `ControlFlow<Response, Response>`. Only explicit finite iteration
scopes are admitted. Replay returns the saved branch and original snapshot before
consulting live state or invoking the classifier. A named global writer after the
loop is separately persisted; Break is not a workflow terminal. The classifier
is trusted/pure and its condition name is the versioned semantic contract; a crash
before Store acknowledgement can rerun it. No exactly-once callback claim.

Decisions use their own `reboot.finite.decision.v1` UUIDv5 domain; an application
response with the internal envelope's type URL cannot collide with ordinary waits.
The fingerprint additionally binds decision kind and original reader response
URL. Old writer/wait keys are unchanged. The envelope carries saved response bytes,
original response type and branch; type/Prost decoding precedes attempt success.
Generated `_until`/`_decide` helpers are checked against writer member names.
Ordinary waits and decisions both recheck the actor uncertainty latch under the
exclusive lease after queued admission, before recovery/read/checkpoint work.
A controlled polled-reader/uncertain-writer regression verifies rejection and
lease release; it is not new native lost-ACK injection.

The public opt-in batch example adds `submit-break BATCH COUNT KEY DUE THRESHOLD`.
A positive threshold no greater than count stops further approvals/iterations;
`FinishDecision` persists private after-loop finalization, denied to ordinary
public callers even with admin metadata. Existing ordinary batches, stop and
business rejection retain their contracts. Python `context.loop()` instead advances
canonical Task.iteration on Continue and does not persist a distinct Break enum in
its finally path; this separate finite application contract is not that cursor/GC.

**Executed:** `/tmp/reboot-rust-loop-decision-sdk-1791525682443676332`: **434 Rust tests passed, 130 ignored**, strict all-target
SDK Clippy, and one explicitly executed ignored real CXX/RocksDB generated fixture.
It saved Continue then Break, mutated the live actor via a real public writer so
recomputed Break would differ, restarted host and Database, returned the original
snapshot, executed one after-loop writer, and retained state/receipts through a
second terminal restart. Eighteen commands, six owned processes reaped. Classifier
traces prove callback omission; reader omission is additionally source-backed,
not an independent reader-entry trace in that fixture.

Public Cargo/`rbt` execution: `/tmp/reboot-rust-loop-decision-cli-1791525909015345513`: **19 checks**, strict/fmt and
nonzero generated-consumer tests plus 24 CLI tests. Canonical inspection decodes
actual saved envelopes, validates original URL/branch/snapshot and decision UUID
keys, Pending Task.iteration zero, exact restored app/map/task/checkpoint prefix,
then canonical Wait and one after-loop record, no third iteration, and terminal
restart without body/classifier/finalizer redispatch. Public direct continuation
and out-of-bound thresholds are rejected without mutation. The public case
preserves observed state; the separate native fixture above supplies state-flip
coverage. Receipt fingerprints are asserted present and stable, not independently
recomputed by this inspector.

Retained generated-consumer strict Clippy: `/tmp/reboot-rust-http-request-preflight-1791526214679215542`. Full unchanged public
batch regression: `/tmp/reboot-rust-batch-ledger-acceptance-1791526290123700900` (**162 checks**). Native greeting/HTTP/health/hot-rebuild/
restart/cleanup: `/tmp/reboot-rust-loop-decision-greeting-1791527037529943302` (**26 HTTP exchanges**, SERVING -> NOT_SERVING -> EOF).
Frozen manifests, database identity, resource limits and recorded PID absence
were audited before canonical digest refresh. A prior CLI harness timeout compared
an unprefixed event against whole prefixed log lines; its saved Break was parked,
its retained CLI was gracefully stopped without releasing continuation, and fresh
isolated acceptance was required. No uncertain mutation was retried.

**Remaining:** unbounded canonical cursor/GC, cross-actor composition,
general durable catch/failure isolation, new decision Store/CompleteTask lost-ACK
or malformed-envelope process injection, full-bound saturation and distributed
fencing. Existing operation/authority/uncertainty guards remain; compile/unit tests
are not those native negative proofs. Overall parity remains incomplete.

Sources: [decision API](src/workflow_context.rs), [durable keys/Store](src/workflow_store.rs),
[generated helper validation](src/workflow_codegen.rs),
[native state-flip proof](tests/fixtures/workflow_app/prove_loop_decision.py),
[Python loop source](../aio/state_managers.py),
[public CLI acceptance](../../tests/reboot/cli/rust_batch_ledger_e2e.py).

### Serial declared-reader outcomes and private audit fallback (2026-10-09)

`WorkflowContext::wait_reader_declared` and generated `<reader>_try_until` wait
for a matching response or return a saved method-declared typed business error.
Ordinary `_until` and `_decide` keep their fatal error contract. Only generated
explicit declared variants become catchable; Grpc/transport/framework failures,
even rich statuses containing declared-looking details, remain failed operations.
Python until/memoize stores successful callable returns, not thrown exceptions:
this is explicit bounded typed outcome support, not blanket exception parity.

The response/error oneof binds the original response URL, method, request,
versioned predicate condition, actor/workflow identity and finite scope. A separate
`reboot.reader.outcome.v1` UUID domain preserves older writer/wait/decision keys.
Fresh and replayed errors must validate against immutable reader declarations,
canonical non-OK rich Status, exact detail URL and decoded payload. No actor/task
upsert occurs when saving a reader observation. Typed success decode precedes
helper acknowledgment. Reader descriptors remain unschedulable.

A clean serial-attempt reservation prevents preexisting or transient overlapping
helpers from making a declared outcome catchable. Competing helper creation leaves
sticky failure evidence; final acknowledgment and release share one admission
mutex. Internal scope/authority checks have separately classified but still counted
operations: failure/drop evidence is retained without self-tainting successful
reader work. Three focused regressions cover preexisting/transient overlap, clean
release and nested authority failure/drop accounting. They do not prove arbitrary
concurrent native Store failure/cancellation interleavings.

The public opt-in batch app adds `submit-audited` and a private named `RecordAudit`
fallback. A saved ObserveBatch BatchMismatch can be caught, audited, and followed
by ordinary approval/map effects and canonical Wait success. Public callers cannot
invoke that fallback, including while the workflow is paused. Matching reader
success is also exercised without the business-error fallback.

**Executed:** `/tmp/reboot-rust-reader-outcome-sdk-1791534192426796030`: **438 SDK tests passed, 131 ignored**, strict all-target
SDK Clippy, and the explicitly executed generated real CXX/RocksDB reader-outcome
restart test. Its ten owned processes are absent. The fixture saves a declared
threshold error, changes live actor state through a real public writer so a fresh
reader would succeed, restarts Database/host and returns the original saved error
payload without reader/predicate entry. One fallback persists, terminal restart
retains records and omits body redispatch. A changed condition version causes a
real nonzero recovery-host exit with unchanged canonical checkpoint/actor state.
A deliberately caught rich Grpc failure also causes a nonzero supervised-host
exit: Pending task, no outcome/error terminal or fallback, retained first-writer
checkpoint. Negative state assertions use read-only Database Load after host exit.

Public generated Cargo/`rbt`: `/tmp/reboot-rust-reader-outcome-cli-1791534422967915593` (**18 checks**), including
exact restored Pending app/map/task/checkpoint bytes, typed error and success
oneofs, deterministic outcome UUIDs, private continuation denial and terminal
no-redispatch. Strict generated consumer Clippy/fmt and **11 consumer tests**;
24 CLI tests. The public case does not change observed state between restarts;
the separate native fixture supplies changed-state coverage. Fingerprints are
required present/stable, not independently recomputed by the public inspector.

Retained finite Continue/Break public proof: `/tmp/reboot-rust-loop-decision-cli-1791534730122747971` (**19 checks**).
HTTP/generated strict preflight: `/tmp/reboot-rust-http-request-preflight-1791535035775536451`. Full batch regression: `/tmp/reboot-rust-batch-ledger-acceptance-1791535109434672631`
(**162 checks**). Greeting/HTTP/health/rebuild/restart/cleanup: `/tmp/reboot-rust-loop-decision-greeting-1791535833156310151`
(**26 HTTP exchanges**). Frozen-source manifests, database identity, resource
budgets and owned PID absence were audited before canonical digest refresh.

**Remaining:** arbitrary/nested/cross-actor catch and failure isolation, unbounded
cursor/GC, malformed/foreign saved-error native injection, Store/authority lost-ACK
and cancellation/concurrent-attempt native negatives. Trusted versioned predicate
purity is not exactly-once callback execution before Store. Overall parity remains
incomplete.

Sources: [reader outcomes/attempt fences](src/workflow_context.rs),
[checkpoint Store](src/workflow_store.rs), [generation](src/workflow_codegen.rs),
[native proof](tests/fixtures/workflow_app/prove_reader_outcome.py),
[Python memoize](../aio/memoize.py),
[public acceptance](../../tests/reboot/cli/rust_batch_ledger_e2e.py).

### Live bounded public collection pagination (2026-10-09)

`SortedMapSession::page` admits page sizes 1..100 and fetches one extra eligible
row under one existing root-work lifetime reservation. Versioned JSON continuation
binds a fixed-size SHA256 digest of full canonical map identity, original bounds
and direction. Even deeply colocated identities cannot expand its size unboundedly. It resumes at the
first unreturned inclusive key without fabricating successors at the 128-byte key
limit. This token is query data, not authorization or a snapshot capability.
The page size may change between requests. Each generated HistoryPage transaction
owns a fresh serial exclusive app/map root. No public inbound SortedMap adapter,
root idempotency, automatic retry or cross-request snapshot is introduced.

Original bounds and cursor query identity are validated before native scan. The
native page remains cardinality/order/identity checked. Any out-of-start leading
row fails closed with DataLoss and uncertainty rather than being filtered after
consuming a native limit. End-only out-of-range rows are trailing in the strict
ordering and remain excluded. Thus end leakage cannot hide another eligible row.
This is not transparent repair/retry of a faulty native scan.

Generated `HistoryPage`/`client history-page` returns key/value bytes and nullable
continuation for approval or archive maps, in forward/reverse order and optional
inclusive-start/exclusive-end ranges. It traverses the whole multi-batch index,
unlike the legacy per-batch history command's fixed 100-row cap. JSON cursor bytes
are capped at 4096, admitting worst escaped supported ASCII bounds/next keys.
Malformed/foreign map, bounds or direction rejects; changed datasets use live
keyset semantics (insertions before the resume key are not revisited).

**Executed public native Cargo/rbt:** `/tmp/reboot-rust-pagination-cli-1791546886462649186` (**22 checks**) constructed 102
entries through public workflow submission/approval, with no private seeding.
Programmatic forward and reverse traversal proved exact key/value bytes, no skip
or duplicate and termination. Bound-limited traversal covered multiple pages,
inclusive starts/exclusive ends, empty/exact/partial exhaustion. Real host and
RocksDB restart between pages resumed the saved token on unchanged data. Invalid
sizes, malformed and foreign-query cursors rejected without durable mutation;
app/map/task/checkpoint bytes stayed unchanged; a following writer admitted.
Generated strict Clippy/fmt and nonzero consumer tests plus 24 CLI tests passed.

SDK `/tmp/reboot-rust-pagination-sdk-1791547173836221968`: **446 passed, 131 ignored**, strict all-target Clippy; explicit
native reader outcome state-flip/fail-closed restart proof and native staged-map
visibility/range/commit/abort/restart prerequisite both passed. Five page unit
vectors cover max-key first-unreturned lookup, query binding/version, empty/exact
exhaustion, escaped 128-byte ASCII key roundtrip/zero-limit status, and bounded full-identity
binding for deeply colocated maps.
HTTP/generated preflight `/tmp/reboot-rust-http-request-preflight-1791546813527300342`, retained same-root map public checks
`/tmp/reboot-rust-map-reentry-cli-1791547441705197405` (**18**), full batch `/tmp/reboot-rust-batch-ledger-acceptance-1791547720277324457` (**162**) and greeting/HTTP/rebuild/health/
restart/cleanup `/tmp/reboot-rust-loop-decision-greeting-1791548467354204666` (**26 HTTP exchanges**) passed. Frozen sources,
canonical Database identity, resource bounds and owned PID absence audited before
digest refresh. Concurrent cross-request collection mutation, hostile cursor
integrity, distributed routing and cross-request snapshots are not certified.
Overall Rust parity remains incomplete.

Sources: [page/session](src/sorted_map.rs), [native bounds](src/sorted_map_participant.rs),
[canonical range schema](../../rbt/std/collections/v1/sorted_map.proto),
[public schema](../cli/commands/init/templates/rust_batch.proto.j2),
[public handler](../cli/commands/init/templates/rust_batch_lib.rs.j2),
[native acceptance](../../tests/reboot/cli/rust_batch_ledger_e2e.py).

### Opt-in canonical task-result authorization (2026-10-09)

`ReaderTaskWaitService::with_wait_authorization` installs an application-owned
verifier/authorizer pair independently of task administration. Without this
explicit opt-in, Wait preserves its public development behavior. The policies
receive the exact encoded WaitRequest, actor type/routed ref and server-owned
application/server identity, with no actor snapshot or task result. This is a
Rust application security extension: Python TasksServicer.Wait itself checks
routing/placement and retrieves cache/storage, without these policy calls.
It is not an automatic task-creator ACL or built-in identity provider.

Protected Wait captures the original dispatcher generation before policy awaits,
reverifies/reauthorizes before and after every canonical Load, and checks original
owner/activity/uncertainty plus current placement before disclosure. The final
owner guard remains held through synchronous result/diagnostic construction and
is dropped before any pending sleep. Read-only owner validation does not obtain
singleton scheduling authority; shared-reader recovery_request remains absent.
Failed policy reveals no task existence/status/result and writes no task state.
Pending polling observes revocation; dropping/deadlining Wait does not cancel the
durable task. No detached task waiter or status retry is added. Policy/uncertainty
transitions and transport delivery are not one linearizable revocation operation.

The generated batch host optionally uses a trusted local regular-file JSON grant
via RBT_RUST_TASK_RESULT_GRANT. Its separate token/task UUID grant is bounded to
4096 bytes with async read-only IO; absent/malformed/ungranted credentials fail
closed. `client wait` forwards RBT_RUST_TASK_RESULT_TOKEN as bearer metadata
through the generated typed helper without replacing its deadline. This local
development example is not hostile-path filesystem isolation or production IAM.
Tokio may finish bounded read-only filesystem work after future drop; it cannot
publish a task mutation or result on behalf of that dropped Wait.

**Executed native public Cargo/rbt:** `/tmp/reboot-rust-task-result-auth-cli-1791540791349700882` (**14 checks**), generated strict
Clippy/fmt, **12 consumer tests**, 24 CLI tests. Real public submission/approval
created Pending and Completed workflow records. Missing/invalid/admin-only and
ungranted task credentials denied without mutation; a live pending Wait observed
revocation, and the generated protected pending deadline retained Pending bytes.
Actual post-Load authorization was parked, then revoked before release, rejecting
completed disclosure. Restored grants retrieved the exact terminal; malformed
grants denied; real RocksDB/host restart retained policy, terminal and no workflow
redispatch. This proof exercises a success terminal. Protected declared-error/
Cancelled terminals, shared-registry host execution and suspended-policy owner
replacement remain separate acceptance gaps; their existing unprotected native
contracts and read-owner unit vectors do not certify those protected shapes.

SDK `/tmp/reboot-rust-task-result-auth-sdk-1791541080222047185`: **441 passed, 131 ignored**, strict all-target Clippy and retained
explicit native reader outcome state-flip/fail-closed proof. HTTP/generated
preflight `/tmp/reboot-rust-http-request-preflight-1791540717430497691` passed. Same-root maps `/tmp/reboot-rust-map-reentry-cli-1791541309024809130` (**18 checks**), full
baseline batch `/tmp/reboot-rust-batch-ledger-acceptance-1791541574776710814` (**162 checks**) and greeting/HTTP/rebuild/health/restart/
cleanup `/tmp/reboot-rust-loop-decision-greeting-1791542298246798496` (**26 HTTP exchanges**) passed. Frozen source, canonical
Database identity, resource limits and owned PID absence audited before digest
refresh. Three protected-Wait source tests exercise exact request/trusted
identity/revocation, unknown actor denial, and read-owner ABA/uncertainty without
scheduling authority. Overall Rust parity remains incomplete.

Sources: [canonical Wait](src/one_shot_tasks.rs), [policy](src/auth.rs),
[Python Wait](../aio/internals/tasks_servicer.py),
[public host](../cli/commands/init/templates/rust_batch_host.rs.j2),
[native acceptance](../../tests/reboot/cli/rust_batch_ledger_e2e.py).

### Same-root map reopening and atomic multi-entry archive (2026-10-09)

`SortedMapHandle::in_transaction` now permits serial reopening under the exact
same admitted fresh exclusive application root. Its private BuiltinMapAdmission
retains the original native participant guard by canonical map identity. Context
clones share that admission/cache; a newly admitted root gets a new cache. There
is no global handle cache and no context-to-session reference cycle. Reopening
reuses the exact native transaction/local owner rather than reacquiring its own
actor gate, duplicating eager Store or creating a replacement transaction.

Every opening and call still reserves counted root work and revalidates active
root owner, exact endpoint, fresh exclusive path and certain/unsealed membership.
Competing, failed or dropped operations retain existing doom/uncertainty evidence.
Retained guard lifetime does not delay terminal ACK releasing Pending/the actor
lease; delayed guard Drop still matches the exact root/local incarnation. This
adds no network ingress, child transaction path, per-call snapshot/rollback,
shared/factory authority, status retry or root idempotency.

Public `ArchiveEntries` / `client archive-many KEY,KEY,...` moves 1..100 unique
nonempty approval keys through repeated source/archive session openings in one
app transaction. Present-empty bytes remain existing values. All source removals,
destination insertions and app counter changes commit together. A later missing
source/occupied destination rejects the entire root; a caught invalid map range
also dooms all enrolled app/map participants. There are no individual entry commits
or compensations. `archive-many-invalid` exercises that latter path after all moves.

**Executed public native Cargo/rbt:** `/tmp/reboot-rust-map-reentry-cli-1791537054939395043` (**18 checks**), generated strict
Clippy/fmt and **12 consumer tests**, plus 24 CLI tests. Three real approval entries
were created through generated public transactions and completed canonical Wait.
Duplicate/empty requests retained exact app, two maps, task and workflow receipts.
A second missing key rolled back a first eager transfer; a caught invalid range
after three repeated transfers rolled back both maps and all tentative counters.
A fresh bulk root then committed all three present-empty entries. Full Database/
RocksDB and host restart retained exact app/map/task/checkpoint bytes without
workflow redispatch. A repeated command rejected absent sources; a new batch,
approval and bulk transfer after restart exercised independent root ownership.
Three-entry and singleton cases are executed; full-bound 100-key saturation is not.

SDK `/tmp/reboot-rust-map-reentry-sdk-1791537326595919669`: **438 passed, 131 ignored**, strict all-target Clippy and retained
explicit native declared-reader state-flip/fail-closed proof. HTTP/generated
preflight `/tmp/reboot-rust-http-request-preflight-1791536980308505015` passed. Retained reader-outcome public proof `/tmp/reboot-rust-reader-outcome-cli-1791537557282691243`
(**18 checks**), finite decision `/tmp/reboot-rust-loop-decision-cli-1791537870843153717` (**19 checks**), full baseline batch
`/tmp/reboot-rust-batch-ledger-acceptance-1791538178111660431` (**162 checks**), greeting/HTTP/rebuild/health/restart/cleanup `/tmp/reboot-rust-loop-decision-greeting-1791538911173424673`
(**26 HTTP exchanges**). Frozen source, canonical Database identity, resource
limits and recorded owned PID absence were audited before digest refresh.

**Remaining:** native admission-cancellation/Store/Prepare/terminal lost-ACK crash
windows for reentry, full-bound saturation, reusable network sibling paths/nested
snapshots and distributed placement. Same-root session reopening is not ordinary
transaction-sibling rollback parity. Overall parity remains incomplete.

Sources: [map sessions](src/sorted_map.rs), [admitted root cache](src/runtime.rs),
[participant ownership](src/durable_participant.rs),
[public example](../cli/commands/init/templates/rust_batch_lib.rs.j2),
[native acceptance](../../tests/reboot/cli/rust_batch_ledger_e2e.py).

## Local reactive readers

### Same-actor grouped external readers (2026-10-10)

`LocalReaderGroup` registers several generated immutable-reader service bindings
for one exact actor under one canonical recovery/admission owner. Exact immutable
method inventories route to the original adapter, handler and authorization policy;
there is no manufactured shared unary binding identity. Attachment validates every
method against its original opaque identity. Duplicate/empty methods, mismatched
actor/state/endpoint/store gate, nested groups and already-started owners reject
before route mutation. Groups are configured before host startup and registered once.
Bounds remain 64 grouped methods/bindings, 64 registry actors/host streams and eight
distinct one-hop dependencies. Same-root dependency execution still rejects.

Generated database, workflow and mixed transaction adapters expose exact reader
inventories and method-aware registry attachment. Readerless services retain valid
generated Rust through a method-local ReaderBinding bound. Clone/policy rotation,
raw mutation-authority rejection, framework errors and declared reader errors keep
their prior boundaries; transaction execution and workflow checkpoint readers do
not acquire composition authority.

Public configuration pattern (register pre-attachment adapters, then attach registry):

```rust,ignore
let (_, work_readers) = work.local_readers(&ledger_ref)?;
let (_, index_readers) = index.local_readers(&ledger_ref)?;
let mut group = reboot::reactive::LocalReaderGroup::new(work_readers)?;
group.add(index_readers)?;
let mut registry = reboot::reactive::LocalReaderRegistry::new()
    .with_reader_composition();
registry.register(group.into_service()?)?;
registry.register(source_readers)?;
let work = work.with_reader_registry(registry.clone())?;
let index = index.with_reader_registry(registry.clone())?;
// Install registry.owners() once through the public host recovery path.
```

**Executed public native vertical:** `/tmp/reboot-rust-group-composition-cli-1791607463788813721` initialized a Cargo/rbt batch-ledger
application with grouped Work/Index readers at the same Ledger and one distinct
ViewSource. All 49 checks passed: both generated ordinary unary routes,
independent original policies and denial isolation, both typed subscription routes,
shared source commit invalidation, authority/identity/deadline rejection, genuine
approval transactions and workflow progression, two RocksDB restarts and canonical
Wait replay without completed workflow redispatch. Sampled record-byte comparisons
prove those records' equality, not absence of transient writes or atomic snapshots.
The generated consumer passed strict all-target Clippy/fmt and 15 tests. Three
sessions and every recorded process were reaped. SDK passed 477 tests
with 131 native integration tests ignored by the default command;
two named native prerequisites were explicitly executed, not the full ignored suite.
All twelve frozen gates passed, preserving separate workflow/mixed/ordinary
composition, registry, greeting/HTTP, map, batch, nested and pagination regressions.
Frozen source/binary identity, process absence and resource budgets were audited.

This closes bounded same-actor service aggregation, not transactional-context
composition, recursive/same-root dependencies, distributed invalidation, atomic
multi-actor snapshots, durable subscription resume or crash-window/lost-ACK parity.

Sources: [group](src/reactive_group.rs), [identity tests](src/reactive_group_tests.rs),
[generated inventory](src/reactive_codegen.rs),
[native fixture](../../tests/reboot/cli/fixtures/rust_grouped_reader_composition_fixture.py).


### Mixed reader/transaction external composition (2026-10-10)

Generated TransactionAdapters with ordinary reader RPCs now expose optional
reader-context hooks, opaque clone-stable binding identity, checked registry
attachment and explicit exact legacy-root configuration. Registered external unary
readers evaluate the first bounded snapshot; reserved LocalReaders subscriptions
use the contextual binding. Reader policy reconfiguration detaches the registry,
clears legacy roots and rotates identity. Context-hook collisions include all
service methods, including transaction RPCs. Registered errors never fall through.

Transaction method emission, inbound participant metadata, sticky doom/uncertainty,
commit/abort paths, task handoff and internal checkpointed readers remain unchanged.
Unconfigured unary admission retains its baseline; registered contextual readers
require existing actors. External composition rejects raw transaction/workflow/task
mutation authority rather than stripping it or pretending to enter a transaction.

**Executed public native vertical:** `/tmp/reboot-rust-transaction-composition-cli-1791585540360573380` initialized a real Cargo/rbt
batch-ledger app. The fixture registered only its mixed LedgerIndexMethods binding
and a distinct ViewSource actor, never the same-root Work binding or CombinedReaders.
A fixture-only ObserveView reader projects source count into a copied Ledger, not
persisted application state. All 41 checks passed: ordinary generated
unary composition; root/leaf credentials and trusted identity; denial; rich declared
reader error through the existing ApprovalSnapshot subscription; raw-authority and
identity rejection; self/unknown target rejection; deadline cleanup; contextual
subscription/source commit updates; genuine approval transaction/map progression
and scheduled workflow completion; exact sampled record restoration; canonical
Wait terminal replay after a second restart without redispatch.

Before/after comparisons establish equality of sampled canonical records, not
absence of transient writes, inspection of all Database records or atomic snapshots.
Consumer strict all-target Clippy/fmt and 15 tests passed; the retained configuration
tests exercise workflow adapters, not new native mixed-binding configuration cases.
Three sessions and all recorded processes exited. SDK: 474 passed /
131 ignored, strict Clippy and both native restart prerequisites.
Eleven frozen gates retained workflow composition (41), ordinary composition (107),
map (18), batch (162), nested (26), pagination (22), registry, greeting/HTTP and CLI
regressions. Source/binary identity, resource budgets and process absence were audited.

This is external one-hop composition on a mixed service, not transactional reader
composition. Same-host/exact Database endpoint, eight distinct direct dependencies,
sequential one-hop reads and existing stream budgets remain. No same-actor aggregate,
transitive/distributed invalidation, atomic multi-actor snapshots, inherited transaction
authority, durable resume or native lost-ACK/crash-window parity is implied.

Sources: [generator](src/codegen.rs), [typed binding](src/reactive_codegen.rs),
[native fixture](../../tests/reboot/cli/fixtures/rust_transaction_reader_composition_fixture.py),
[public harness](../../tests/reboot/cli/rust_batch_ledger_e2e.py).


### Workflow-bearing external reader composition (2026-10-10)

Generated workflow-bearing DatabaseAdapters now expose default reader-context
hooks, typed binding identity and explicit registry/legacy-root configuration.
Ordinary external unary readers evaluate the registered first snapshot with the
same bounded one-hop engine as plain database adapters. Reserved LocalReaders
subscriptions use the contextual binding as well. All ordinary reader entrypoints
retain the standalone raw-authority boundary, exact actor/endpoint/binding checks,
accepted-request validation, original credentials and trusted host identity.

Internal workflow reader checkpoints, waits, decisions, writer steps, task dispatch
and canonical Wait remain their existing baseline paths. Reader-context hooks do
not receive workflow/task mutation authority. Reconfiguring authorization or
with_workflows clears attached registry/legacy roots and rotates binding identity;
clones retain it. Configure final adapters before registering baseline clones,
then attach serving adapters to avoid registry cycles. Contextual hook and helper
name collisions fail generation; declared reader errors retain their typed details.

**Executed public native vertical:** `/tmp/reboot-rust-workflow-composition-cli-1791581246575727540` used a real Cargo/rbt batch-ledger
app with its scheduled RunBatch workflow, coupled sorted maps and a distinct
registered ViewSource actor created/updated only through public generated writers.
Its application overlay computes a read-only projection in a copied Ledger's
archived field; canonical app/task/checkpoint/map bytes do not store that projection.
41 checks passed: composed ordinary reads; root/source credentials and
trusted identity; root/leaf denial; declared errors; authority/identity rejection;
self/unregistered target rejection; deadline/control read; contextual subscription
and source-commit reevaluation; pending checkpoint progression; exact RocksDB
restoration; canonical workflow completion; terminal replay after a second restart
without redispatch, while new source commits still change external views.
Before/after comparisons prove equality of sampled canonical records, not absence
of transient writes, inspection of every Database record or atomic cross-actor snapshots.
All three sessions and recorded owned processes exited. Consumer strict all-target
Clippy/fmt and 15 tests passed, including real generated adapter configuration tests
for cloned, authorization-reconfigured and workflow-owner-reconfigured bindings.
Those configuration tests use lazy transport and are not native Database proofs.

SDK `/tmp/reboot-rust-unary-composition-sdk-1791580969911386764`: 474 passed/131 ignored, strict Clippy and
both explicit native restart prerequisites passed. Ten frozen gates retained
ordinary composition (107), registry (29),
map (18), batch (162), nested (26), pagination (22), greeting/HTTP (26 exchanges)
and CLI/preflight regressions. Source/Database identity, resource bounds and owned
process absence were audited before updating this canonical ledger.

This extends composed external readers to workflow-bearing database adapters;
mixed reader/transaction adapters still lack contextual registry wiring. Same-host,
exact Database endpoint, eight distinct direct dependencies and one-hop limits
remain. No transitive/distributed snapshots, cross-application authority, durable
resume, native lost-ACK/crash-window coverage, CI certification or full Rust parity
is implied by this vertical. Same-actor mixed-service aggregation is not proved.

Sources: [workflow generator](src/workflow_codegen.rs),
[typed reactive bindings](src/reactive_codegen.rs),
[native workflow fixture](../../tests/reboot/cli/fixtures/rust_workflow_reader_composition_fixture.py),
[public acceptance harness](../../tests/reboot/cli/rust_batch_ledger_e2e.py).


### Standalone reader authority boundary (2026-10-09)

Public LocalReaders subscriptions (registry and direct single-owner entrypoints)
and configured ordinary composed unary readers now share a fail-closed boundary
before routing, admission, snapshot Load, authorization or handler invocation.
Raw presence of transaction IDs, either coordinator identity field, retry age,
workflow ID/iteration, idempotency key, task schedule/method or coordinator
read-only-aware metadata returns FailedPrecondition. Empty, malformed and repeated
values are rejected as authority envelopes, not interpreted as absent fields.
This also applies before an explicitly allowlisted legacy unary fallback on a
configured adapter. Actor identity ambiguity still returns InvalidArgument first.
Normal credentials, trusted host identity, caller metadata and deadlines retain
the existing reader paths; no parser normalization or new authority is introduced.

This is a concrete prerequisite for external unary composition on workflow-bearing
and mixed reader/transaction services, not implementation of those generated
contracts. Internal workflow waits/decisions, checkpointed declared outcomes,
transaction execution, task dispatch and their recovery owners are unchanged.
Database-only, same-host/exact endpoint, eight direct dependencies and one-hop
limits remain; this is not Python's broader transitive reader-context parity.

The pre-fix native run `/tmp/reboot-rust-unary-composition-cli-1791575250893249512`
returned a composed value despite a coordinator-state-type header, failing the
new rejection assertion. Its child cleanup completed. The new runtime matrix
exercises all ten keys in empty/malformed/repeated forms through unary, registry
subscription and direct subscription entrypoints, asserting no binding entry or
permit retention; a clean control read still succeeds.

**Executed native GREEN:** `/tmp/reboot-rust-unary-composition-cli-1791575813295421886` passed
107 composition checks, including 60 envelope
rejections across actual generated unary and reserved subscription RPCs. The
fixture observed no authorization or composed handler entries for those requests,
unchanged canonical root/source actor bytes, and a succeeding normal read. Existing
selection, target authorization, shared capacity, duplicate identity, public
mutation/replay, RocksDB restart and child-cleanup checks remained green. This does
not prove every native cancellation or durable uncertainty window.

SDK `/tmp/reboot-rust-unary-composition-sdk-1791575530521316632`: 472 passed/131 ignored,
strict all-target Clippy and both explicit native restart prerequisites passed.
Generated consumer strict Clippy/fmt passed. Retained registry `/tmp/reboot-rust-reader-registry-cli-1791576514255158795` (29),
map `/tmp/reboot-rust-map-reentry-cli-1791576897721512912` (18), batch `/tmp/reboot-rust-batch-ledger-acceptance-1791577176342562146` (162), nested `/tmp/reboot-rust-nested-cli-1791577937243187674` (26),
pagination `/tmp/reboot-rust-pagination-cli-1791578308055122875` (22), preflight `/tmp/reboot-rust-http-request-preflight-1791576818046713080` and greeting/HTTP
`/tmp/reboot-rust-loop-decision-greeting-1791576130257918559` (26 exchanges) passed. Frozen source/Database identities,
resource bounds and owned-process absence were audited before updating this ledger.
No CI certification or full Rust parity is claimed.

Sources: [standalone boundary](src/reactive.rs),
[runtime matrix](src/reactive_composition_tests.rs),
[public native fixture](../../tests/reboot/cli/fixtures/rust_reader_composition_fixture.py),
[Python header contract](../aio/headers.py).


### Bounded ordinary unary reader composition (2026-10-09)

Ordinary generated database reader RPCs can opt into the same one-hop local
composition used by subscriptions. `with_reader_registry` attaches a complete
composed registry to the serving adapter; exact Database endpoint and opaque
handler/authorization-version identity must match the registered roots. Finalize
policy before cloning bindings. Policy changes detach the old registry and legacy
list and rotate binding identity. Configuration builders box their setup errors;
Tonic method and declared-error contracts remain unchanged.

Registered unary roots dispatch through the original generated authorized snapshot
binding and context hook, with the actual request metadata/extensions. Each call
consumes exactly the first snapshot and drops its cursor before returning. It
retains no subscription, uses the same shared 64-slot admission pool, preserves
root extensions, and delegates only fresh target scope/trusted provenance. Its
one inbound timeout becomes an absolute deadline through admission, snapshot Load,
dependencies and response decode; a late ready result is still rejected. Drop or
expiry seals escaped contexts and reclaims admission. Mutation/transaction/workflow
root authority is rejected. There is no selected-root fallback after routing,
authorization, dependency, cancellation or uncertainty failure.

Custom adapters are strict by default. `with_legacy_unary_roots` explicitly allows
at most 64 exact non-composed identities and cannot shadow registered roots.
The scaffold deliberately retains its existing raw `hello` actor: no canonical
reference repair or hidden actor creation occurs. Same-host, same-endpoint,
database-only and eight direct dependency/one-hop limits remain. Separate Loads
are not an atomic cross-actor snapshot; remote/transitive invalidation, nested
DAGs, durable resume and mixed/workflow root contexts remain missing.

An evaluated Unavailable keeps its code and receives a terminal SDK metadata
marker; generated reader retry guards do not reinterpret that evaluation as a
fresh transport attempt. Unmarked disconnected transport classification and
mutation retry/recovery behavior are unchanged. Focused runtime tests cover this
marker, deadline/cancellation, extension delegation, binding identity and capacity;
these do not establish all real-sidecar uncertainty or cancellation windows.

**Identity-boundary regression:** a real generated Cargo/rbt/CXX run at
`/tmp/reboot-rust-unary-composition-cli-1791571007492137824` reproduced unauthorized
beta snapshot `0802` (count 2) through duplicate actor headers: first-header routing
and snapshot Load disagreed with last-header authorization. Both subscription
entry points now reject duplicate actor identity before routing/admission. The
store boundary rejects duplicates for every required identity field, including
actor and idempotency identity; identical repeats reject too. Single identifiers
are preserved literally. No parser normalization or synthetic authority was added.

**Executed public native acceptance:** `/tmp/reboot-rust-unary-composition-cli-1791571772637877079` passed
43 checks. The ordinary generated client read
returned selected source values after commits, equal-result switching and retirement,
then restored the selected baseline after real RocksDB restart and selection replay.
Root/leaf authorization observed original cookie, trusted application identity,
actual loaded snapshots and request bytes; denied dependency reads produced no
fallback and did not mutate canonical records. Unary and subscription duplicate
identity negatives rejected. Sixty-four simultaneous root streams excluded unary
admission; releasing a stream enabled an ordinary read. Typed watching, self/unknown/
nested failures, failed-build rejection and host/Database/child cleanup were retained.
The fixture only adds test authorization and observation through public generated
interfaces; it does not replace the production evaluator or seed native state.

SDK `/tmp/reboot-rust-unary-composition-sdk-1791571498306860543`: 471 passed/131 ignored, strict all-target
Clippy and both explicit native restart prerequisites passed. Nineteen composition
runtime tests plus the common required-identity regression passed. Retained fresh
registry `/tmp/reboot-rust-reader-registry-cli-1791572469702351692` (29), map `/tmp/reboot-rust-map-reentry-cli-1791572855098756881` (18), batch `/tmp/reboot-rust-batch-ledger-acceptance-1791573141400303145` (162), nested `/tmp/reboot-rust-nested-cli-1791573901349112273`
(26), pagination `/tmp/reboot-rust-pagination-cli-1791574266941211314` (22), preflight `/tmp/reboot-rust-http-request-preflight-1791572775659570425` and greeting/HTTP `/tmp/reboot-rust-loop-decision-greeting-1791572088433356911`
(26 exchanges) passed. Frozen source/Database identities, resource bounds and owned
process absence were audited before updating this ledger. No CI certification or
full Rust parity is claimed.

Sources: [evaluator](src/reactive.rs), [snapshot/identity boundary](src/runtime.rs),
[ordinary adapters/reader retries](src/codegen.rs), [typed bindings](src/reactive_codegen.rs),
[tests](src/reactive_composition_tests.rs),
[native fixture](../../tests/reboot/cli/fixtures/rust_reader_composition_fixture.py).


### Bounded one-hop local reader composition (2026-10-09)

Opt-in `LocalReaderRegistry::with_reader_composition` enables generated database
reader snapshot hooks and typed `{reader}_read_local` calls to registered actors.
The registry enforces one exact canonical Database endpoint. Each evaluation may
use at most eight distinct direct dependencies. Self, unknown/type-mismatched
actors and unsupported bindings fail closed. Leaf dispatch invokes ordinary
unary readers, not another composed context or Subscribe producer. There are no
detached dependency streams, recursive DAGs or cross-actor atomic snapshots.

Revision receivers register and mark their baseline before admission/Load.
Repeated reads retain the earliest baseline so racing commits remain pending.
Successful evaluation replaces dependencies before output deduplication, retiring
unused sources even for equal output. Active evaluation watches root uncertainty
and dynamically registered dependency uncertainty/revocation. Sticky uncertain
commit outcomes terminate the stream; no status-based retries or synthetic abort.

The authorized root envelope holds a shared lease for immutable snapshot Load,
authorization and decode, then releases it before invoking the composed callback.
Direct leaf reads retain original credential/caller metadata with only the exact
target reference substituted, preserve lifecycle scope, and rerun the target's
existing verifier/authorizer against its state/request. This same-host trusted
mutation-owner contract does not grant cross-application internal authority.

Evaluation admission, completion/failure and finalization share one mutex.
A canceled/dropped dependency poisons the evaluation even if its handler catches
or times it out. Failure records precede active-read decrement. Finalization seals
new reads atomically and rejects unfinished calls. A closure watch wakes escaped
in-flight reads; RAII stream Drop cancels the callback/dependency futures and
reclaims admission. Twelve focused tests exercise selection/retirement, racing
revision/uncertainty, actor bounds/auth denial, caught errors, canceled fallback,
root/dependency uncertainty during lease waits, closed contexts, escaped-read
wake/cleanup and atomic finalization. These are local runtime tests, not native
proof of all failure windows.

The greeting scaffold opts in with `RBT_RUST_REACTIVE_COMPOSITION=1` plus its
actor allowlist. Public `select-source` persists a canonical source on a selector
actor; typed `watch` follows that source. Clearing selection restores local reads.
At that checkpoint, ordinary selected-source reads required a subscription scope;
the bounded ordinary unary integration above supersedes that limitation.
selected-source leaves reject nesting rather than recursively resolving a DAG.
Default greeting behavior without composition remains exercised separately.

**Executed public Cargo/rbt/native:** `/tmp/reboot-rust-reader-composition-cli-1791563149582223716` passed
21 checks through public constructors, selection
writers and a generated typed watcher: selected-source commits updated the view,
equal-result source switch retired alpha before beta updates, self/unknown/nested
queries failed without partial publication, canonical CXX Load matched persisted
selector/source states, and real RocksDB restart restored the selected baseline.
Replaying an old selection key did not restore its old dependency. Shutdown,
failed build, actual host/Database exit and owned-child cleanup passed. The fixture
adds only a handler-entry trace for retirement observation; application logic and
all mutations use the actual generated public paths. Its finite quiet-window
trace check is not a proof of arbitrary future inactivity.

SDK `/tmp/reboot-rust-reader-composition-sdk-1791562880330177302`: 463 passed/131 ignored, strict all-target
Clippy and explicit native reader-outcome/staged-map restart gates. Generated
consumer Clippy/fmt passed. Retained registry `/tmp/reboot-rust-reader-registry-cli-1791563835759141764` (29), map `/tmp/reboot-rust-map-reentry-cli-1791564217652716283` (18),
batch `/tmp/reboot-rust-batch-ledger-acceptance-1791564499153902931` (162), nested `/tmp/reboot-rust-nested-cli-1791565258524672068` (26), pagination `/tmp/reboot-rust-pagination-cli-1791565634139742496` (22), preflight
`/tmp/reboot-rust-http-request-preflight-1791564137556504604`, and default greeting/HTTP `/tmp/reboot-rust-loop-decision-greeting-1791563460499733936` (26 exchanges) all passed.
Frozen hashes, Database identity, resources and owned-process absence audited.

Python [reader interception](../aio/stubs.py) and
[reactive manager](../aio/state_managers.py) have broader transitive semantics.
Remote invalidation/migration, nested dependency DAGs, canonical React wire,
atomic multi-actor snapshots and durable resume remain missing. Native target-auth,
commit-uncertainty/cancellation and racing first-Load composition windows are not
claimed by the selected-source acceptance. Overall Rust parity is incomplete.

Sources: [runtime](src/reactive.rs), [authorized snapshots](src/runtime.rs),
[generated hooks](src/codegen.rs), [typed calls](src/reactive_codegen.rs),
[focused tests](src/reactive_composition_tests.rs),
[native fixture](../../tests/reboot/cli/fixtures/rust_reader_composition_fixture.py).


### Allowlisted multi-actor local reader routing (2026-10-09)

`LocalReaderRegistry` installs one reserved LocalReaders route for an explicit
allowlist of at most 64 canonical actor references. Registration retains each
existing generated binding, authorized reader envelope, actor gate and lifecycle
scope. Actor metadata selects only a registered entry; it cannot create an owner,
change its store or subscribe to a constructor/writer. Duplicate references and
empty registry installation fail closed. The registry has a host-wide limit of
64 concurrent streams in addition to each owner's existing limit. End/error/Drop
release global admission without detached producer tasks. Acknowledged commits,
uncertainty and deduplication remain isolated to the exact selected actor.

`RunningApplicationHost::try_add_local_reader_registry` registers all owners and
marks readiness Recovering immediately. Owners start before Ready/public ingress.
A deterministic original-source regression failed with Ready instead of Recovering;
the fixed real-Tonic test parks a predecessor and verifies NOT_SERVING health,
Unavailable ordinary ingress, successful registered baseline after owner startup,
stream cleanup and listener closure. Unit cases retain actor-specific credential
metadata, authorization errors, unknown actor rejection, duplicate reserved-route
rejection in either API order, 64-actor/stream bounds, uncertainty isolation and
admission release. The old single-owner API remains supported.

The generated greeting scaffold optionally reads `RBT_RUST_REACTIVE_ACTORS` once
at startup. Its generated typed client exposes `state-ref <id>` and
`watch <canonical-ref> <count>`. No application code injection or private Database
seeding is needed. Without configuration the previous greeting route is unchanged.
Configuration errors, including non-Unicode input, do not silently disable policy.
The allowlist is not a token verifier: each generated binding still owns normal
authentication/authorization; this remains trusted isolated local development.

**Executed public Cargo/rbt/native:** `/tmp/reboot-rust-reader-registry-cli-1791557943933839768` passed 29
checks: public constructors created alpha/beta plus an unregistered actor; two
actual generated typed clients observed isolated baseline/changed snapshots,
beta commits did not invalidate alpha, and canonical CXX Load verified exact
actor states. Unknown actor/writer-query subscriptions rejected without mutation.
The real host admitted 64 streams across both actors, rejected a 65th, and admitted
a fresh watch after remote Drop. Empty/duplicate/malformed/non-Unicode/65-actor
startup configurations exited without actor mutation. Full CLI/RocksDB restart
preserved all three actor states and idempotent writer replay; fresh subscriptions
observed both persisted values and shutdown terminated both streams. Actual
host/Database exit, failed build, smoke startup and owned-child cleanup passed.
Generated greeting Clippy/fmt passed; its empty Cargo unit targets are compilation
checks, not behavioral test passes. Behavior above ran through the real clients.

SDK `/tmp/reboot-rust-reader-registry-sdk-1791558250398314269`: 451 passed, 131 ignored and strict all-target
Clippy, plus explicit native reader-outcome and staged-map restart gates. Retained
map `/tmp/reboot-rust-map-reentry-cli-1791558601777357831` (18), batch `/tmp/reboot-rust-batch-ledger-acceptance-1791558884585471523` (162), nested `/tmp/reboot-rust-nested-cli-1791559662247691882` (26), pagination
`/tmp/reboot-rust-pagination-cli-1791560028257271664` (22), generated/HTTP preflight `/tmp/reboot-rust-http-request-preflight-1791558520532995052`, and unchanged default
HTTP/greeting/rebuild/health/cleanup `/tmp/reboot-rust-loop-decision-greeting-1791557537361451879` (26 HTTP exchanges) passed.
The HTTP acceptance fixture now preserves the generated configured host and
replaces only its serving tail; it no longer reconstructs an obsolete builder.
Authorization injection and the host's registered recovery owners remain intact.
Frozen source, native Database identity, resource budgets and proof-owned PID
absence were audited before the source digest refresh.

This is a routing foundation, not cross-actor reader composition. Python's
[React route](../aio/servers.py) and [reactive state manager](../aio/state_managers.py)
add transitive reader dependencies that this registry does not provide. Dynamic
dependency registration/retirement, context-aware typed reader calls, remote
invalidation, atomic multi-actor snapshots, canonical React interoperability and
durable stream resume remain missing. Overall Rust parity remains incomplete.

Sources: [registry and stream scope](src/reactive.rs),
[host registration](src/application_host.rs),
[generated greeting host](../cli/commands/init/templates/rust_main.rs.j2),
[typed client](../cli/commands/init/templates/rust_client.rs.j2),
[native acceptance fixture](../../tests/reboot/cli/fixtures/rust_reader_registry_fixture.py).


Database-only generated services expose an exact-actor lifecycle owner plus
companion Tonic service through `local_readers(state_ref)`. Register recovery and
ordinary service with `ApplicationHost`, then add the companion with
`RunningApplicationHost::try_add_local_readers`. Generic service registration
rejects this reserved route. Generated typed subscriptions cancel their RPC on
Drop; ordinary unary readers stay unary.

**Single-owner bounded contract:** one actor/service/trusted host owning every sidecar mutation;
the optional multi-actor registry above routes independent owners on one host.
64 subscriptions **per owner**, a 64KiB **encoded request payload** and a
1MiB **encoded reader response**. These are not bounds on the whole RPC envelope
or total transport memory. One coalescing revision/current response/pending future
per stream avoids unbounded queues. Baseline registration
precedes Load; shared admission covers Load/auth/handler, not idle/backpressure.
Equal serialized responses deduplicate; slow consumers may skip intermediate
values but converge on latest acknowledged state only while the subscription
remains healthy and the consumer continues polling. Authorization/accepted placement
is rechecked; revocation is terminal even if authority later returns.

Acknowledged writer/constructor/workflow-step/scheduling/participant-commit paths
invalidate synchronously. Prepare/Abort/replay/failed mutation do not announce
committed state; task status alone is not actor mutation. RAII mutation uncertainty
terminates existing/new subscriptions with Unavailable rather than silently going
stale; a later write does not clear the latch. Restart/re-read is required. This
is not exactly-once notification after a lost ACK.

Generated subscriptions retain the exact query, caller metadata, channel and
method-specific error decoder. `disconnect()` releases the current RPC but keeps
that plan; explicit `reconnect()` drops the old RPC before awaiting a single new
Subscribe. Failed/cancelled attempts leave it disconnected. A new authenticated
server scope emits a fresh baseline, even if equal; intervening states may be
lost/coalesced. There is no automatic status-based retry or durable resume cursor.
The generated `*_with_timeout(request, duration)` client entry point captures one
absolute budget across reads/reconnects and sends only its remaining duration.
Expiry is checked before and after awaited IO: Tokio timeout alone is insufficient
when a buffered value/header is ready. There is no independent client idle-expiry
task; the deadline is enforced when the client reads or explicitly reconnects.
Remote cursor destruction is asynchronous, not an acknowledged teardown barrier.

Standalone workflow-bearing adapters now expose the same bounded ordinary unary
reader companions. Their manual Clone shares the existing store/handler/auth/task
owner rather than constructing another dispatcher. The generated batch app uses
Work.Observe and typed Work.ObserveBatch for public observation; saved approval
waits now use ObserveBatch. There is no separate View schema/handler/placement
entry. Only declared ordinary readers enter
the subscription dispatcher, never workflow bodies, constructors or scheduling
writers. Declared ordinary-reader errors use the existing method-specific rich
status enum for unary RPCs and subscriptions. Internal waits convert them to
framework Status and taint the attempt before any saved decision; catching a
failed reader cannot authorize successful terminal completion. Declared
workflow-service constructor errors remain unsupported. Ordinary writer errors
are now permitted; their scoped named-step business decisions are documented below.
The shared generator rejects collisions among each reader's base, `_with_timeout`
and `_connect` methods and constructor `new` before companion emission; caller
errors propagate to the public code-generation response without files.

Transaction-bearing service companions now use the existing
`TransactionAdapter<H, P, C, R, F>` bounds and manual Clone, preserving the
shared handler/store/auth, participant, coordinator, registry, factories and
optional reader-task binding. Only ordinary unary readers enter the dispatcher;
root transactions, including reader-looking History, are not subscription
targets. Pure transaction services without ordinary readers have no companion.
Helper/reserved-name checks precede emission; actual per-file outbound
Client/Target names now participate in root-symbol collision checks.

The public batch app's approval service exposes `ApprovalSnapshot(Batch)` with
typed declared `BatchMismatch`; `index-read`, `index-mismatch`,
`index-target-error` and `watch-index-reconnect` exercise it. Its batch-match
condition differs from Work.Observe, which remains the workflow's saved-wait
and public observation reader. Both exact-method ReaderBindings share one
validated local reader owner and LocalReaders service; no additional workflow
dispatcher or canonical Tasks.Wait owner is created. This is local registered
actor observation, not transaction subscription, streaming readers, or
transaction-joined query execution.

**Wakeup #8 executed evidence (2026-10-08):** immutable native proof
`/tmp/reboot-rust-batch-ledger-acceptance-1791469520443513860` passed public
`rbt init`, generation, strict all-target consumer Clippy, four consumer tests,
and actual CLI/native RocksDB acceptance. It verifies decoded declared mismatch,
actual committed approval observation, Approve/History subscription denial with
canonical task/state/map/replay unchanged, same-process explicit reconnection
through schema regeneration and full RocksDB restart, and reclamation of both
subscriptions. Existing batch/reactive/reconnect and scheduled cancellation
regressions remain passing. These are real generated API/native controls, not
emitted-text assertions substituted for persistence evidence.
Compiler-only ordinary-reader-without-business-errors variant
`/tmp/reboot-rust-mixed-reader-no-business-errors-1791470377785105382` passed
strict all-target Clippy and four consumer tests, not separate native persistence.
Broad gates `/tmp/reboot-rust-batch-ledger-final-gates-1791470437913724777`
passed strict SDK Clippy, **399 SDK tests, 128 ignored**, and default greeting
native restart, regeneration, supervision and cleanup. All three accepted
manifests affirm source unchanged at completion; semantic SDK/template inputs
remain unchanged, and only this canonical ledger/fingerprint was refreshed
after the gates (the broad manifest also captured its earlier documentation). The first preflight exposed missing System error arms and
a typed initial-message conversion; both were repaired before corrected
preflight/native acceptance. Independent review found these same compiler
blockers and no other confirmed safety defect; targeted re-review confirmed
closure. Compiler/native evidence comes from parent execution, not review claims.

**Missing:** cross-actor dependencies, distributed or remote-process invalidation, transparent
reconnect/resumption. This uses a Rust-specific local service, not canonical React
wire behavior; that is an API scope distinction, not a mixed-language app goal.
Raw Database/custom persistence/other-process mutation violates its single-owner
contract.

**Sources:** [hub/ownership](src/reactive.rs), [generation](src/reactive_codegen.rs),
[protocol](reactive.proto), [commit sites](src/runtime.rs).
**Executed acceptance:** [native tests](tests/reactive_native_restart.rs),
[generated app](tests/fixtures/reactive_app/src/main.rs),
[process proof](tests/fixtures/reactive_app/prove_restart.py).
The real generated app verifies baseline/live writes, failed writer silence,
slow-reader convergence after 100 durable writes, cancellation reclamation,
shutdown closure and new subscription to persisted state after host/Database
restart. Unit coverage: [reactive tests](src/reactive_tests.rs).

## Canonical SortedMap

Generate canonical `rbt/std/collections/v1/sorted_map.proto` with explicit module/
runtime paths. The exact compiled schema/options select a fixed builtin wrapper;
arbitrary trusted-effects user descriptors remain rejected. The host registers
`SortedMapLibrary` at an exact native endpoint and returned participant control
routes. There is no publicly header-authorized inbound map service.

Generated `SortedMap::create` creates EMPTY canonical state with native uniqueness
and constructor replay. A schema-only Store ensures the canonical entry CF before
CreateActor; it is idempotent metadata, not an actor/entry seed. The uncertainty
gate is installed before native awaits. Within a live admitted fresh same-endpoint
exclusive non-factory app root **without automatic root idempotency**, a typed
`in_transaction(context)` session exposes insert/remove/get/range/reverse_range.
It shares direct native participant ownership, read-own-writes and atomic app/map
Commit or Abort. A caught declared map error dooms the root, not just the session.
Private root provenance is mandatory; public internal/transaction headers and
manual contexts cannot grant it.

**Lifetime boundary:** sessions/futures must be serial and handler-awaited. Every
polled builtin admission/call now reserves counted root work through its await;
only successful returns settle. Failed/dropped work retains ledger uncertainty and
doom, so active or failed operations cannot authorize successful root sealing.
Do not escape/spawn detached calls: this fence does not establish task provenance
or support concurrent sessions. See [lifetime evidence](#sortedmap-operation-lifetime-fencing-2026-10-09). Aggregate membership uses the ordinary bounded participant contract before
eager Store. Uncertain native start/Store cannot release, re-stage or Prepare a
vanished transaction; reset host plus sidecar, recover and abort unprepared work.

**Missing:** public inbound/network builtin adapter, child paths/independent
reusable siblings, nested savepoints, shared/factory/tasks/map-root idempotency,
implicit singleton construction, placement/migration and transparent sidecar-only
restart. Constructor crash/lost-ACK/restart replay is not established by the
constructor test. Existing map Store-lost-ACK recovery is a different test.
**Key/range limits:** nonempty ASCII, at most 128 bytes; `/`, `\`, NUL and
newline are rejected. Forward ranges are `[start,end)` with `start < end`;
reverse ranges include start/exclude end with `start > end`. Limits must be
nonzero. Invalid ordering/zero limit produces declared `InvalidRangeError`; invalid
key characters produce InvalidArgument. Canonical Range has no cursor field; the
SDK page operation adds live keyset continuation, not a cross-RPC snapshot
guarantee.

**Sources:** [library/session](src/sorted_map.rs),
[native participant](src/sorted_map_participant.rs),
[canonical schema](../../rbt/std/collections/v1/sorted_map.proto).
The public application also exercises serial distinct-map transfer under one app
root: exact bytes/read-own-writes, app-plus-two-map Commit/Abort, occupied destination
and present-empty values, all-participant restoration and fresh post-restart transfer.
See [public collection evidence](#public-serial-distinct-map-transfer-2026-10-08).
This does not remove the unsupported lifecycle shapes above; admission-await
cancellation and dropped native Store windows need distinct native proofs.

**Executed acceptance:** [native prerequisite](tests/sorted_map_native_prerequisite.rs),
[generated app](tests/fixtures/sorted_map_app/src/main.rs),
[lost ACK vector](tests/fixtures/sorted_map_lost_ack.rs).
Checks empty CF/constructor replay/duplicate rejection, Range-first, typed writes/
read-own-writes, atomic app/map Commit and caught-error Abort, stale provenance,
parent/key bounds, unprepared recovery and lost-ACK retention. Unit coverage:
[ownership tests](src/sorted_map_ownership_tests.rs).

## Verification


### SortedMap operation-lifetime fencing (2026-10-09)

Same-host builtin admission and every public map call reserve the existing root
active-work ledger before awaiting. A private RAII guard counts unfinished work;
only successful returns settle after fresh authority/admission validation.
Returned errors latch their original doom while the reservation remains held.
Unsettled Drop atomically decrements active work and retains membership uncertainty,
preventing a completion/error race from authorizing successful root sealing.
This bookkeeping grants no dispatch authority and neither sets nor clears native
Store ACK uncertainty. Successful serial reuse remains supported.

The public generated-consumer acceptance overlay performs a real native Insert,
polls a reader until unfinished, drops it, and tries to return transaction success.
That success is rejected. Registered Abort of known, ACKed participants preserves
exact committed app/map/task/checkpoint/archive bytes before and after RocksDB
restart; fresh public approvals complete the original task through canonical Wait.
First Pending proves a polled unfinished future, NOT native Range receipt.
Four new SDK tests cover active sealing, serial settlement, dropped-work fencing,
and original-error/uncertainty retention. Python's participant-transaction-manager
unfinished-call checks provide a lifecycle comparison, not broader parity.

Evidence: `/tmp/reboot-rust-batch-ledger-acceptance-1791499412823156953`
(focused lifetime proof, 10 checks) and
`/tmp/reboot-rust-batch-ledger-acceptance-1791499702590131853`
(full batch regression, 162 checks), and
`/tmp/reboot-rust-batch-ledger-final-gates-1791500401268791548`
(strict SDK all-target Clippy; **406 passed, 0 failed, 128 ignored**; native greeting,
restart, host/Database exit supervision, failed rebuild and child cleanup).
Both native batch consumers passed strict Clippy/fmt and **10 library tests**.
All frozen-source audits matched; recorded owned process groups were reaped.

Limits remain: serial handler-awaited same-host calls only. No promise of map
sessions escaping handlers, concurrent/cloned callers, remote routing, dropped
Store/lost-ACK recovery windows, or general transaction-future cancellation.
Settlement-validation errors may latch a generic dropped-work doom before their
specific diagnostic; original native-operation errors retain their own status.

### Cooperative stop and fresh receipt authorization (2026-10-08)

Implemented on `ac595b011a68f43c94775666cdb7d6949ab95dc7` with a shared scheduling
replay authorization correction; source reviewed after the confirmed bypass fix.

- `/tmp/reboot-rust-batch-ledger-acceptance-1791494496665595401`:
  **38 checks**, native public CLI/C++ Database/RocksDB. A real partial prefix
  including a saved writer business-error decision stops through admin StopBatch,
  retains exact prefix/checkpoints and completes canonical Wait with an explicit
  stopped response. RocksDB/host restart preserves the result without redispatch.
  Replaying the accepted key with administration disabled is PermissionDenied;
  complete actor/map/task/checkpoint/ordinary-receipt snapshots remain identical.
  Re-enabling admin replays the original receipt, including after a successor
  submission. Same-name stale UUID and same-key/different-request negatives leave
  records unchanged. A controlled saved-approval-before-stop-before-writer race
  completes one already-observed unit, then stops at the next observation.
- `/tmp/reboot-rust-batch-ledger-acceptance-1791494902443424066`:
  **162 full batch checks**, strict consumer Clippy/fmt and **10 library tests**;
  default workflows, transaction/map transfer, typed terminals, scheduled cancel,
  reactive reconnect/rebuild and watcher cleanup retained. Recorded watcher PIDs
  were confirmed absent after completion, despite historical handles in the result.
- `/tmp/reboot-rust-batch-ledger-final-gates-1791495601318353167`:
  strict all-target SDK Clippy and **402 passed, 0 failed, 128 ignored**;
  full native greeting restart/idempotency/rebuild/failed-rebuild/shutdown proof.
- `/tmp/reboot-rust-workflow-reader-no-business-errors-1791496109043528591`:
  separate plain-reader generated consumer strict Clippy and **10 library tests**;
  this is a compilation/behavior gate, not independent native persistence proof.

Frozen manifests matched throughout. Each runner retained exclusive target
ownership, target <=8 GiB/free >=8 GiB. Do not credit earlier pre-authorization-fix
proofs as evidence for the security correction. The predecessor framework-error
and caught-reader focused negative proofs were retained; the shared correction
changes ordinary writer ingress, not private typed decisions or reader fences.
Post-stop-checkpoint/pre-terminal crash and lost-ACK boundaries remain unclaimed.

### Named writer business decisions (2026-10-08)

Implemented on baseline `f154bd0c368d447360ee5554f07e6ec537728278`:
ordinary nonconstructor writers on workflow-bearing services may declare typed
business errors. Generated named-step helpers use `writer_step_declared` and
preserve explicit `TaskHandlerError::Declared` versus `Failed`; they never infer
business authority from a Status code or matching rich details. Constructors
remain rejected. Task ownership, canonical Wait and workflow terminal authority
are unchanged; a writer-step error is not a new workflow/task terminal type.

A same-actor serial writer decision requires the exact immutable writer method,
state/request/response and error-payload decoder, named/finite-indexed provenance,
canonical Pending ownership, and a clean attempt with only its own active
operation. Its declared rejection discards the tentative actor copy and atomically
Stores only a validated `Any<google.rpc.Status>` checkpoint plus provenance, with
zero actor upserts and no state-change invalidation. Successful writer effects
continue to Store state plus response. Replay validates the same descriptor and
request fingerprint before returning the typed error, without dispatching the
handler; malformed/foreign/colliding envelopes fail closed. Plain or rich framework
Status remains fatal and taints the attempt; all existing successful-completion
fences and uncertain Store/readiness handling remain in place.

The public opt-in app adds private named `TryCheckpoint`, `StepRejected`,
`Submit.reject_step`, and `submit-step-reject`. The handler deliberately changes
its tentative counter before rejecting. The body catches only the typed business
variant, performs the real Checkpoint and parks at the next approval. Ordinary
public scheduling of TryCheckpoint is denied, like Checkpoint. The default app
path and retained greeting are unchanged. Python source backs writer exception
rollback; these proofs do not assert Python automatically memoizes every caught
writer exception or certify broader Python equivalence.

**Fresh executed evidence (immutable stages, source_unchanged):**

- `/tmp/reboot-rust-batch-ledger-acceptance-1791484810586135003`:
  a generated native handler returns **Grpc** with a real declared-looking
  StepRejected envelope; the body catches it and returns success. The host rejects
  unclean completion. After RocksDB restart the real writer runs, and the only
  saved rejection has its genuine payload, not the forged framework payload;
  public approvals and canonical Wait finish the original task.
- `/tmp/reboot-rust-batch-ledger-acceptance-1791485066794866486`:
  rejected tentative state is discarded; the typed error checkpoint is present;
  the same Pending task and all checkpoint bytes survive restart; no writer
  redispatch occurs for that error. A second real approval completes the task,
  preserving the exact original error row; terminal Wait replays after restart.
- `/tmp/reboot-rust-batch-ledger-acceptance-1791485361738095883`:
  prior caught-reader failure still cannot save a terminal or decision and remains
  unresolved across restart, then progresses through actual approval/Wait.
- `/tmp/reboot-rust-batch-ledger-acceptance-1791485619021677264`:
  full public batch persistence/rebuild/reconnect, shared readers, archive/map
  rollback, listing/stream/cancellation and typed terminals pass; strict consumer
  Clippy/fmt and **seven library tests** pass.
- `/tmp/reboot-rust-batch-ledger-final-gates-1791486315240085598`:
  strict SDK all-target Clippy; **402 passed, 0 failed, 128 ignored**; retained
  greeting native persistence/replay/restart and host/Database supervision pass.
- `/tmp/reboot-rust-workflow-reader-no-business-errors-1791486832728407419`:
  a separate generated ordinary-reader-error-free consumer passes strict Clippy
  and **seven library tests**, retaining the typed writer path. This is compiler
  evidence, not a second native persistence proof.

**Limits:** serial same-actor finite named steps, not concurrent or remote writer
composition. At this writer checkpoint reader failures were not catchable; the bounded
reader-outcome API below supersedes that restriction only for explicit declared
outcomes. Constructor errors, new running cancellation, automatic Status retry or external exactly-once claim.
This new error-checkpoint proof does not inject Store lost ACK, dropped completion
or arbitrary concurrent-operation races. Existing uncertainty controls are
source/unit evidence, not those missing native fault cases. Full parity remains
incomplete.

**Sources:** [typed step admission](src/workflow_context.rs),
[checkpoint effect/replay](src/workflow_store.rs),
[generation](src/workflow_codegen.rs),
[public native acceptance](../../tests/reboot/cli/rust_batch_ledger_e2e.py).

### Workflow-service declared readers and clean completion (2026-10-08)

Implemented on baseline `5335e9c61dbffe43c5f9ffce14c4906364f5a3e6`:
ordinary unary readers on workflow-bearing services may declare method-specific
errors. The public batch app adds `Work.ObserveBatch` with `BatchMismatch`,
`work-unary`/`work-read`/`work-mismatch` and `watch-work-reconnect`. Unary and
shared reactive paths preserve the typed rich-error payload. Internal reader
waits use framework Status and retain empty task-business-error descriptors;
this checkpoint granted neither new task terminal authority nor durable catchable
reader failure decisions. The later opt-in outcome API below adds only typed serial
same-actor reader outcomes, not schedulable reader-task terminal authority. At this checkpoint ordinary writer/constructor declarations
remained rejected; the subsequent writer-decision checkpoint below supersedes
the writer restriction, not the constructor restriction.

A native negative probe exposed a pre-existing safety defect: catching a failed
reader observation and returning success could persist an empty successful task
terminal. Successful `finish` now rejects failed/dropped/live work before minting
its operation. Receipt acceptance and authoritative completion under actor
admission independently reject unclean attempts. Original generation, pending,
readiness, cancellation, canonical terminal and durable uncertainty fences remain.

**Fresh executed evidence (immutable runs, source_unchanged):**

- `/tmp/reboot-rust-batch-ledger-acceptance-1791481089906270585`: generated-handler
  fault overlay catches an actual declared reader failure and returns success.
  The actual supervised host fails with unclean-attempt FailedPrecondition.
  Canonical recovery after RocksDB restart has one Pending task with no terminal
  and no saved decision; ledger/maps are unchanged. Public approve/Wait then
  completes the restored task. Overlay hash is recorded; production SDK/source
  are frozen and both sessions' process groups are reaped.
- `/tmp/reboot-rust-batch-ledger-acceptance-1791481339355527946`: public
  init/Cargo/rbt/CXX/RocksDB acceptance passes ordinary unary success/rich mismatch,
  typed subscription success/mismatch, unchanged raw actor/maps/task/replay on
  errors, and actual committed checkpoint updates. Three retained typed clients
  explicitly reconnect through regeneration and full restart with cleanup.
  Prior batch/map/archive/task-list/stream/cancellation gates remain green.
  Generated consumer strict all-target Clippy/fmt and **six library tests** pass.
- `/tmp/reboot-rust-batch-ledger-final-gates-1791482036728123360`: strict SDK
  all-target Clippy; **401 passed, 0 failed, 128 ignored**, including the new
  failed/dropped/live success fence and writer/constructor denial controls.
  Public default greeting native persistence/replay/restart, host/Database
  failure supervision and failed-live-rebuild cleanup pass.
- `/tmp/reboot-rust-workflow-reader-no-business-errors-1791482553479487000`:
  separate generated workflow-service and transaction-service ordinary readers
  without declared business errors pass strict consumer Clippy and **six library
  tests**. This variant is compiler/consumer evidence, not native persistence.

**Limits:** same local actor/owner, ordinary unary readers and existing bounded
shared reactive machinery. No remote/cross-actor invalidation, streaming-reader
parity, automatic status retry, durable error decisions or workflow-service writer
error expansion. The failure probe covers caught reader error, not new Store/CAS
lost-ACK injection. Saved-step method/request changes require explicit migration;
incompatible old replay fails closed, never silently reinterprets its meaning.
Full Rust parity and production readiness remain unclaimed.

**Sources:** [generation](src/workflow_codegen.rs),
[attempt and completion fences](src/workflow_context.rs),
[public schema](../cli/commands/init/templates/rust_batch.proto.j2),
[native acceptance](../../tests/reboot/cli/rust_batch_ledger_e2e.py).

### Public serial distinct-map transfer (2026-10-08)

The opt-in public batch scaffold adds `LedgerIndex.ArchiveEntry`/`ArchiveHistory`,
`ArchiveRejected`, cumulative `Ledger.archived`, and generated client commands
`archive`/`archive-history`. A second canonical EMPTY SortedMap is host-created via
its stable constructor, not privately seeded. Both exact map participants are in
resolver control routes and recovery registration. All app/map ownership restoration
precedes coordinator/task recovery and readiness; Work still owns the only Tasks.Wait.

Within one fresh same-host existing-actor exclusive app root without automatic
root idempotency, the handler reads source presence (Some(empty) is not absent),
rejects an occupied destination, removes source, inserts exact bytes into destination,
checks both read-own-writes and increments a checked cumulative app counter. Root
Commit covers the app plus both distinct map participants. A caught invalid Range
after all provisional effects dooms/aborts the entire cohort; the CLI preserves the
actual original **Unknown InvalidRangeError**, not an invented Code::Aborted.
Method-scoped ArchiveRejected uses the existing Status-compatible transaction
handler and generated typed-result compatibility hook; required handler traits did
not change. The client validates exact single-detail declared payload/Unknown status.

**Fresh executed evidence (frozen inputs, all source_unchanged):**

- `/tmp/reboot-rust-batch-ledger-acceptance-1791474667645658662`: actual public
  init/Cargo/rbt/CXX/RocksDB. Emitted consumer fmt/strict all-target Clippy and
  **six library tests** passed. Native canonical reads prove raw actor-state,
  both map rows, original workflow terminal and saved progress records unchanged
  after caught two-map doom, source-absent rejection and occupied-destination
  rejection. Occupancy is tested by archiving, publicly resubmitting the same
  batch with a fresh scheduling key, approving/recreating source and completing
  that workflow; a present-empty destination is rejected, not overwritten.
  Successful transfers preserve present-empty value, remove only selected source
  key, increment the durable app counter and retain original task/checkpoint
  bytes. Duplicate move is declared source absence, not a second effect. Full
  RocksDB restart retains identical raw committed snapshot; a fresh transfer
  succeeds after all participant ownership is restored. ArchiveHistory reads the
  canonical destination. Both new transaction RPC subscription attempts fail
  closed; all prior batch/workflow/reactive/list/stream/cancellation/watch checks
  pass and recorded owned process groups are reaped.
- `/tmp/reboot-rust-batch-ledger-final-gates-1791475468598897705`: strict SDK
  all-target Clippy; **399 passed, 0 failed, 128 ignored**. Default greeting
  generation/native create/write/replay/read, canonical Load, RocksDB restart,
  host/Database failure supervision and failed-live-rebuild cleanup pass.
- `/tmp/reboot-rust-mixed-reader-no-business-errors-1791475982812429036`: separate
  generated reader-error variant strict all-target consumer Clippy and **six
  library tests**. This is compiler/consumer evidence, not native persistence
  for that variant. Archive's own declared error remains present in this schema;
  "no business errors" here describes the ordinary ApprovalSnapshot reader.

**Limits:** a bounded serial distinct-actor/direct-root collection application,
not reusable sibling/nested paths or a header-authorized public
builtin/network adapter, distributed placement or general collection migration.
At that checkpoint sessions/futures remained handler-awaited and nonescaping; no
root-operation reservation or cancellation-overlap safety was implied. Empty values are exercised,
not arbitrary nonempty transfer bytes. Unit counter-overflow control proves no
partial increment, not native full-cohort overflow rollback. New three-participant
Store/Prepare/terminal lost-ACK or crash-boundary injection is not executed; prior
single-map uncertainty evidence is not upgraded. No automatic transfer idempotency,
status retry or external-effects exactly-once; callers must reconcile uncertain
RPC outcomes through durable application state. Constructor crash/lost-ACK and
sidecar-only restart remain separate unsupported/unproved shapes.

**Sources:** [public schema](../cli/commands/init/templates/rust_batch.proto.j2),
[handler](../cli/commands/init/templates/rust_batch_lib.rs.j2),
[host](../cli/commands/init/templates/rust_batch_host.rs.j2),
[client](../cli/commands/init/templates/rust_batch_client.rs.j2),
[native acceptance](../../tests/reboot/cli/rust_batch_ledger_e2e.py).

### Workflow-service reactive composition (2026-10-08)

The generated batch app now subscribes to Work.Observe on its workflow-bearing
adapter, with the duplicate View service removed across schema, handler, host,
placement and clients. Fresh public generation passed strict emitted-consumer
all-target Clippy/fmt and **four behavioral tests**. Actual public rbt/C++
Database/RocksDB acceptance passed live updates, explicit same-client reconnect,
proto regeneration and full restart, slot cleanup, and retained batch/map/task/
declared-terminal/list/stream/delayed/lock regressions. Subscribe attempts for
Create, SubmitBatch, Checkpoint and RunBatch returned exact Unimplemented; canonical
ledger/task/map/replay remained unchanged. These are actual integrated controls,
not private seeding or generator-text authority proof.

Review found helper-name collisions for Observe + ObserveWithTimeout/ObserveConnect.
The new control failed RED because emission incorrectly returned Ok; central
symbol validation corrected both database/workflow callers. **51 codegen tests**
passed, including workflow accepted/excluded methods, reserved names, helper
collisions and retained declared-step/mixed-transaction rejection. The shared
helper test checks an untouched companion-output buffer, not compiled colliding
schemas. The targeted read-only review found the P2 closed with no remaining
confirmed repair defect. An initial missing adapter Clone failed actual downstream
preflight and was fixed with manual generic cloning, without H:Clone.

Final immutable native proof:
`/tmp/reboot-rust-batch-ledger-acceptance-1791463075805391400`
(`accepted.json`, `frozen-source.json`, `native/result.json`). Final broad proof:
`/tmp/reboot-rust-batch-ledger-final-gates-1791463666520275062` passed strict SDK
all-target Clippy, **394 passed / 0 failed / 128 ignored**, and actual greeting
regeneration/restart/signals/child-exit/failed-build cleanup. Ignored matrices are
not fresh passes. Sources matched both runs; the ledger/digest update is later
metadata. The pre-symbol-repair native/broad proofs ending `1791461474516531206`
and `1791462099168909387` are **superseded, not final publication evidence**.

This does not add transaction-service subscription bindings, mixed workflow/
transaction services, declared step errors, remote invalidation or canonical
React interoperability. Workflow execution/terminal CAS and uncertainty fences
are unchanged. Sources: [workflow emitter](src/workflow_codegen.rs),
[shared reader emitter](src/reactive_codegen.rs),
[native app acceptance](../../tests/reboot/cli/rust_batch_ledger_e2e.py).


### Explicit reactive reconnect in the public application (2026-10-08)

Fresh public Cargo generation passed emitted-consumer strict Clippy/fmt and
**four behavioral tests**. Actual `rbt dev run`/C++ Database/RocksDB acceptance
retained one generated `watch-reconnect` client PID/query. `next` observed live
approval/checkpoint changes; explicit reconnect returned equal current baselines,
including after native live proto replacement and full durable restart. Explicit
disconnect reclaimed reader slots; stopped-host reconnect returned Unavailable
without exiting the client, then a caller-requested reconnect succeeded after
recovery. Quit reaped that client and reader slots returned to zero. The existing
batch approval/map/rollback, canonical task/replay/typed Wait/declared-error,
regeneration, delayed task, task-list/stream and shutdown/lock regressions passed.

Six new local live-Tonic controls (12 reactive tests including retained controls)
exercise query/ASCII/binary metadata retention, equal fresh baselines, eventual
old-RPC release, failed/cancelled reconnect, terminal Unavailable/PermissionDenied,
malformed snapshot, exact Subscribe counts/no automatic retries, and absolute
budgets including buffered snapshots/ready headers after expiry. These are local
client controls, not C++ distributed authority or native credential-revocation
proof. The native stopped-host status alone does not establish retry absence.

Three RED paths were exercised: retaining the old stream failed the parked
Subscribe cancellation control; the uncorrected buffered-snapshot path returned
Ok(Some(Counter7)) after expiry; removing the reconnect postcheck accepted a ready
header after expiry. Restoration passed 12 tests. Notification-before-response is
not an explicit client transport-buffer acknowledgement; actual mutant failures
establish sensitivity to the production gates. Targeted read-only repair review
found no remaining confirmed deadline defect.

Accepted immutable native proof:
`/tmp/reboot-rust-batch-ledger-acceptance-1791458706014249420`
(`accepted.json`, `frozen-source.json`, `native/result.json`). The prior native run
`/tmp/reboot-rust-batch-ledger-acceptance-1791457669489224470` preceded the deadline
repair and is **superseded, not final publication evidence**. Control logs:
`/tmp/reboot-rust-reactive-reconnect-controls-1791457557441175078`.
Broad frozen gates:
`/tmp/reboot-rust-batch-ledger-final-gates-1791459295060650678` passed strict locked
all-target SDK Clippy, **393 passed / 0 failed / 128 ignored**, and actual retained
greeting regeneration/restart/signals/child-exit/failed-build cleanup. Ignored
native matrices are not fresh passes. Both final manifests were unchanged during
their runs; this canonical ledger/digest update is later metadata.

This is explicit fresh-snapshot reconnection, **not** transparent recovery,
durable event replay, cursor resume, remote invalidation or canonical Python React
protocol parity. Client idle expiry has no independent spawned deadline watcher.
Portable sources: [client/server ownership](src/reactive.rs),
[generated surface](src/reactive_codegen.rs),
[local controls](src/reactive_reconnect_tests.rs),
[public native acceptance](../../tests/reboot/cli/rust_batch_ledger_e2e.py).

### Declared workflow business-error application (2026-10-08)

Fresh public generation passed generated-consumer strict Clippy/fmt and **four
behavioral tests**. Actual `rbt dev run`/C++ Database acceptance created a rejecting
workflow and approval, acknowledged its saved reader/writer checkpoints, and
returned typed `BatchRejected` through canonical Tasks.Wait. Durable inspection
verified Completed/error, exact rich Status/type/payload, partial application and
SortedMap effects, and retained replay records. Full RocksDB restart returned
identical typed Wait and canonical task/app/checkpoint bytes, with no completed
body or writer redispatch. A later normal delayed workflow completed. Existing
listing/stream policy, approval/map rollback, regeneration, pending restart,
subscription cleanup, parked shutdown and lock reuse regressions passed.

The public checkpoint repair was necessary: review found that ordinary callers
could set rejection/progress without a workflow-scoped checkpoint. Both actual
public RPC variants now return PermissionDenied and preserve canonical actor,
task, map and replay bytes. Those native calls occur before approval; the
otherwise-valid **approved** checkpoint is separately denied in the generated
unit control. Targeted re-review confirmed the generated hook wiring and private
step preservation. Do not describe this as a native after-approval exploit replay.

Local runtime control denies unknown/malformed payloads even with a permissive
binding, and denies tainted or iteration-scoped terminal receipts before Load.
It also checks that rich Status alone remains Failed. Removing the clean-attempt
fence made that control fail; restoration passed **8 focused tests**. Source
emission checks inspect typed declarations, handler/Wait and terminal validation;
those string assertions are not behavioral proof by themselves.

Accepted immutable native proof:
`/tmp/reboot-rust-batch-ledger-acceptance-1791454683886347424`
(`accepted.json`, `frozen-source.json`, `native/result.json`). The earlier run
before the public-checkpoint repair is **not accepted final publication evidence**.
RED/restored control:
`/tmp/reboot-rust-workflow-errors-controls-1791453887538072195`.
Broad frozen gates:
`/tmp/reboot-rust-batch-ledger-final-gates-1791455596651079196` passed strict locked
all-target SDK Clippy, **387 passed / 0 failed / 128 ignored**, and the retained
actual greeting regeneration/restart/signals/child-exit/failed-build cleanup gate.
Ignored native matrices are not fresh passes. Both runners audited unchanged
frozen semantic source and disk bounds; this canonical documentation/fingerprint
refresh is subsequent metadata, not a modification of those snapshots.

This acceptance does **not** inject restart between the rejecting checkpoint and
terminal CAS, or declared-terminal CompleteTask lost ACK. Existing generic
uncertainty fences remain source-backed/separately tested, not a new native
injection claim. General framework-failure isolation, running cancellation, Python
unbounded cursor/GC/Break and distributed semantics remain missing.

Portable sources: [typed workflow generation](src/workflow_codegen.rs),
[terminal scope fences](src/workflow_context.rs),
[public native application](../../tests/reboot/cli/rust_batch_ledger_e2e.py).

### Server-local administrative task-list stream (2026-10-08)

Fresh native acceptance generated the public ordinary Cargo consumer and passed
strict all-target Clippy/fmt and two behavioral tests. Actual `rbt dev run` with
C++ Database/RocksDB exercised canonical and generated ListTasksStream: disabled
policy, missing/invalid bearer and unsupported server scope fail closed; initial
empty snapshot and unchanged observations preserve the real RPC deadline; the
same live workflow changes empty → STARTED and completed → empty. Stream clients
terminate on host shutdown and reconnect to a recovered current STARTED snapshot.
Full batch approval/map/checkpoint/replay/regeneration/persisted delayed-task/Wait,
subscription cleanup and durable-lock reuse regressions also passed.

Local controls exercised no-duplicate/coalescing behavior, fresh exact-method
policy checks, original generation/placement/uncertainty/stop revocation with an
unchanged cache, owner replacement during a later awaited policy, terminal error
closure and cancellation of an armed policy future on stream Drop. Two RED
controls failed their exact invariants after removing the original owner fence
or publishing unchanged observations; restored source passed. These are local
controls, not native distributed authority proof. Native deadline/client reaping
is not direct evidence of a particular server future's destructor, nor proof of
independent revocation under transport backpressure.

Immutable native proof:
`/tmp/reboot-rust-batch-ledger-acceptance-1791451791876267609`
(`accepted.json`, `frozen-source.json`, `native/result.json`). Post-native source
changes are public rustdoc correction and an extra test-only awaited-generation
control, not production behavior changes. RED/restored proof:
`/tmp/reboot-rust-task-stream-controls-1791451599163707664`.
Broad frozen gates:
`/tmp/reboot-rust-batch-ledger-final-gates-1791452393276815561` passed strict locked
all-target SDK Clippy, **386 tests passed / 0 failed / 128 ignored**, and the
retained actual greeting regeneration/restart/signals/child-exit/failed-build
cleanup regression. Ignored native matrices are not fresh passes. All manifests
were unchanged during their respective runs; later canonical ledger updates are
separate from those immutable semantic source snapshots.

Portable sources: [RPC fences](src/one_shot_tasks.rs),
[pull-owned stream](src/task_listing.rs), [local controls](src/task_listing_tests.rs),
[public app acceptance](../../tests/reboot/cli/rust_batch_ledger_e2e.py).

### Server-local administrative task listing (2026-10-08)

The public generated batch app now exposes the `tasks` client command and an
opt-in environment-owned development admin verifier/authorizer. Fresh native
acceptance generated the ordinary consumer, passed strict all-target Clippy/fmt
and two tests, then exercised canonical ListTasks through actual `rbt dev run`
and C++ Database/RocksDB. It proved default denial, missing/invalid bearer denial,
explicit-server scope rejection, actual STARTED parked workflow listing before
and after restart, SCHEDULED future timestamp listing before and after restart,
completed pruning and no synthesized terminal history. The full approval/map,
saved-checkpoint replay, regeneration, delayed execution, typed Wait, subscription
cleanup and lock-reuse regression also passed with unchanged frozen source.

Four local controls exercised cache retry/phase bookkeeping and administrative
policy denial plus generation replacement, uncertainty, placement movement and
stop during an awaited authorizer. These are local controls, not native proof of
distributed ownership or retry execution. Native retry-phase observation remains
unexercised; no public cancellation or task-result auth claim is made.

Native proof: `/tmp/reboot-rust-batch-ledger-acceptance-1791449231292063216`
(`accepted.json`, `frozen-source.json`, `command-2.log`, `native/result.json`).
The earlier interrupted run is not accepted evidence. Subsequent changes are
documentation/comments and the strict-Clippy correction `task.timestamp.clone()`
to `task.timestamp` (the optional Timestamp is Copy), not task behavior changes.
The broad gate also exposed a test synchronization race: Weak::upgrade may fail
before DispatchOwner::drop publishes registry release. The ownership control now
waits for actual registry removal; it retains its blocked-child ownership and
replacement-denial assertions and passed 50 exact repeated executions.
These changes must be distinguished from the immutable semantic source snapshot.
Broad frozen gates passed strict locked all-target SDK Clippy, **381 tests passed,
0 failed, 128 ignored**, and the retained native greeting regeneration/restart,
child-exit, signal and failed-build cleanup regression. Ignored native matrices
are not fresh passes. Gate evidence:
`/tmp/reboot-rust-batch-ledger-final-gates-1791450151288499096`
(`accepted.json`, `frozen-source.json`, SDK logs and greeting proof).

Portable sources: [listing controls](src/task_listing_tests.rs),
[phase bookkeeping](src/task_listing.rs),
[public application acceptance](../../tests/reboot/cli/rust_batch_ledger_e2e.py).


### Public batch-ledger application and retained greeting (2026-10-08)

The actual opt-in `rbt init` generated consumer passed strict all-target Clippy,
formatting and two behavioral tests, then ran through normal `rbt dev run` with
the canonical C++ Database. Native acceptance decoded application state,
canonical Pending/Completed Tasks, typed saved replay responses and canonical
SortedMap entries. It exercised submit UUID replay/fingerprint rejection,
pending Wait deadlines, invalid approvals and caught map-range root doom with
**both** app/map unchanged, followed by successful atomic approval.

After one acknowledged checkpoint, live proto regeneration retained Database,
reaped the old host, emitted new bindings and replaced the typed subscription
from persisted state. Full RocksDB restart recovered the same pending UUID
without repeating the saved checkpoint mutation; remaining approvals completed
all three entries. A second restart returned identical typed Wait results and
canonical terminal bytes without body/step redispatch. A future task survived
restart before its persisted due time and completed after it. Subscriber owners
returned to zero, parked shutdown drained streams, and process/lock reuse passed.
Handler evidence is bounded by each session's byte offset into append-only logs.

A separate final frozen gate passed SDK all-target strict Clippy and tests with
`--features test-support`: **377 passed / 0 failed / 128 ignored** (ignored native
matrices are not fresh passes). The default generated greeting retained its own
strict Clippy/fmt/test, real create/write/replay/read, canonical Load, regeneration,
RocksDB restart, SIGTERM/SIGINT and child-exit supervision. An intentionally broken
live proto rebuild exited the CLI and reaped host/Database rather than serving
stale code. Both runners audited unchanged frozen source and target/free-disk
bounds. Test-only observation hooks are not enabled in generated consumers.

Local immutable evidence:
- `/tmp/reboot-rust-batch-ledger-acceptance-1791445215069889908`
  (`accepted.json`, `frozen-source.json`, `command-2.log`, `native/result.json`).
- `/tmp/reboot-rust-batch-ledger-final-gates-1791445889892168445`
  (`accepted.json`, `frozen-source.json`, SDK logs and greeting proof).

Portable acceptance sources are
[`rust_batch_ledger_e2e.py`](../../tests/reboot/cli/rust_batch_ledger_e2e.py) and
[`rust_app_dx_e2e.py`](../../tests/reboot/cli/rust_app_dx_e2e.py), executed with one
exclusive target owner. Earlier failed inspector runs are not accepted proofs.
The final changes after batch acceptance were test-fixture type naming and
greeting timeout/failed-rebuild coverage; the batch SDK/runtime/templates stayed
identical. General distributed recovery, Python cursor/GC/Break and external
exactly-once remain outside this application slice.

### Historical post-repair executed evidence (2026-10-08)

The sole-owner post-R1 frozen run completed **23/23 planned gates**:
**21 exited zero**, while the deliberately stale ledger fingerprint exited 1
and the existing legacy process-consumer strict Clippy baseline exited 101.
Required gates passed; this is **not an all-green matrix**. The stale rejection
was preserved before this reviewed documentation/fingerprint refresh; the checker
was then rerun separately. Legacy generated dead-code/style diagnostics remain
unresolved, rather than being suppressed or described as green.

All-feature SDK all-target execution recorded **374 passed / 0 failed / 128 ignored**,
including **317 library tests** and 28 generated downstream behavioral tests.
Default and no-default library gates each passed 317 tests; these repeated
configurations are not unique coverage totals. Six doctests passed. Strict SDK,
no-default SDK and emitted workflow/map/reactive consumer Clippy passed, along
with docs and formatting/diff checks. Emitted workflow/map all-target gates each
executed zero tests: they establish compilation only, not native behavior.

Actual native execution passed workflow **3**, ordinary-writer **10**, and focused
precise-child-error **3** cases (the latter overlap the writer suite). The workflow
gate preserved separate finite-control-flow, **12-case body-retry**, and named-step
restart proofs. This run did not execute the complete ignored legacy/Native2pc,
native map or native reactive matrices; their older proofs remain historical.

Terminal audit matched **190 frozen source hashes**, all **23 gate-log hashes**,
all **3 proof hashes**, the source manifest and canonical Database/app binaries;
test-result counts matched the logs. Proof process counts were 16/50/11, all with
recorded exits and no live recorded PIDs. Runner descendants were empty, its
process group was empty and the target lock was released. Target/free disk bounds
were checked. Documentation changes after this audit are separate from the freeze.

Local evidence prefix:
`/tmp/reboot-rust-control-flow-loop1-ownerfix-r1-1791441615138944047`
with `-result.json`, `-source.json`, `-successor-audit.json` and separate
`-5-{proof,retry-proof,legacy-proof}.json` artifacts. Read-only R1 review:
`/tmp/reboot-rust-control-flow-loop1-r1-final-independent-review.md`.
Focused diagnostic green/causal-red/restored-green logs:
`/tmp/reboot-rust-ownerfix-r1-{green1,causal-red1,restored-green1}.log`
(2 passed / 1 failed / 2 passed respectively, not unique-test totals).
These local handles are not shipped or portable prerequisites. No newly injected
workflow-wait Store/CompleteTask lost-ACK, Python cursor/GC/Break, distributed
fencing or arbitrary external-effects exactly-once acceptance is claimed.

### Historical corrected workflow evidence and its limits

The corrected sole-owner workflow batch ran successfully on the runtime source
represented by the baseline above: **22/22 gates green**, **312 library tests**
in all-feature/default/no-default runs, strict SDK/generated-consumer Clippy,
28 generated downstream behavioral tests, docs/doctests/format checks and real
map/reactive/workflow CXX/RocksDB gates. Workflow body proof completed **12 cases**
and reported all owned processes absent. Independent audit checked **2,632 hashes**
(source/log/proof/binary), no mismatches/live owned PIDs and released ownership.
The two earlier colliding runners' shared namespace is explicitly excluded.

Recorded local handles (not shipped prerequisites or portable proof artifacts):
`/tmp/reboot-rust-workflow-loop84-corrected-final-{result,audit}.json`,
`-corrected-final-body-proof-final.json`, and `-corrected-final-runner.log`.
Publication audit `/tmp/reboot-rust-publication-audit.json` binds published source
and subsequent docs/one EOF whitespace cleanup. These handles may disappear;
portable re-verification is through repository tests/commands below. The full
older ignored legacy/Native2pc matrix was **not** rerun in that 22-gate batch.
Do not sum repeated gate test counts or call ignored cases green by default.

### Reproducible checks

From `reboot/rust`, use a sole-owned target and enough free disk:

```sh
export CARGO_TARGET_DIR=/tmp/reboot-rust-parity-target
export CARGO_BUILD_JOBS=2 CARGO_INCREMENTAL=0
export CARGO_PROFILE_DEV_DEBUG=0 CARGO_PROFILE_TEST_DEBUG=0
python3 tests/verify_parity_documentation.py
cargo test --locked --all-features --all-targets -- --test-threads=1
cargo clippy --locked --all-features --all-targets -- -D warnings
cargo test --locked --no-default-features --lib
cargo clippy --locked --no-default-features --lib -- -D warnings
cargo test --locked --all-features --doc
RUSTDOCFLAGS='-D warnings' cargo doc --locked --no-deps --all-features
cargo fmt --all --check
```

For actual native acceptance, set an existing compatible canonical C++ binary;
these commands exercise ignored tests, not a fake Database:

```sh
export REBOOT_NATIVE2PC_CXX_DATABASE=/absolute/path/to/reboot/server/database
cargo test --locked --all-features --test workflow_native_restart -- --ignored --test-threads=1 --nocapture
cargo test --locked --all-features --test reactive_native_restart -- --ignored --test-threads=1 --nocapture
cargo test --locked --all-features --test sorted_map_native_prerequisite -- --ignored --test-threads=1 --nocapture
# Full legacy and separate Native2pc matrices are distinct gates:
cargo test --locked --all-features --test generated_cxx_database_process -- --ignored --test-threads=1 --nocapture
cargo test --locked --all-features --test native_2pc_transport -- --ignored --test-threads=1 --nocapture
```

Generated fixture `cargo clippy/test/fmt --manifest-path tests/fixtures/<app>/Cargo.toml`
checks are separate from SDK Clippy; set `-- -D warnings` for Clippy. Native app
proof runs compile their actual generated consumers. Python CLI behavior and real
app driver have separate dependencies; see their source rather than pretending
Rust unit tests exercise init/dev process ownership.

### Consolidation verification (2026-10-08)

For this consolidation, independent source reviews corrected stale implementation
status, default-allow/configured authorization scope, bounded reusable participant
support, concrete admission limits, external retry budgets and writer-task versus
workflow retry provenance. The selected **166 implementation/protocol/test files**
matched the published baseline; only documentation and its new checker changed.

A fresh sole-owner four-gate run passed: checker **6 positive/negative self-tests**
and **84 local links**, **312 library tests**, compilation/discovery of **113
ignored legacy native cases**, and the actual **12-case generated workflow body
CXX/RocksDB proof**. Discovery of 113 cases is **not their execution**. The run's
2,582 source hashes matched at completion and all recorded owned PIDs were absent.
The full 22-gate execution above remains prior evidence, not a new full rerun.
Final text additions here only record these measured results.

Local artifacts: `/tmp/reboot-rust-unified-parity-{result,source}.json`,
`-body-proof.json`, `-ledger-check.log`, `-sdk-lib.log`,
`-native-target-discovery.log`, `-workflow-body-native.log`.
Read-only review records are local audit notes, not additional parity documents.

### Trust and maintenance contract

The documentation checker validates local links/anchors, obsolete-ledger removal,
and a fingerprint of selected SDK/CLI/protocol implementation/test inputs. It has
negative self-tests so a broken link or changed source cannot silently pass.
A matching fingerprint is **not behavioral proof**: source review and actual
acceptance above are separate evidence. The fingerprint excludes documentation
and the checker itself; it is not a full toolchain/dependency lock or native binary
certificate. If relevant implementation changes, re-audit claims and appropriate
acceptance before refreshing it; do not merely regenerate the number.

<!-- parity-source-sha256: a4b0ef644d9af01c57583beff058dc7a2533a43a29577856998e8b0eb84c7498 -->

New feature work updates this ledger in the same verified commit, not another
candidate/status file. Status is by public use case and safe admitted shapes,
with source/acceptance/limitations adjacent. Do not promote a historical blocked
proposal or a compile-only facade into current functionality. Frozen executions
have one build owner and unique evidence namespace; no source edits mid-run.
Commit/push verified changes normally; production/migration/external-effect claims
need their own acceptance, not more historical prose.

## Next higher-level priority

Extend the bounded finite replay/wait vertical only after defining and exercising
canonical unbounded iteration advancement/GC and durable Break authority, or a
separate explicit application contract. Add new-wait Store/CompleteTask lost-ACK
injection and full-bound saturation evidence before expanding those claims.
Current Task iteration-zero and single-owner fences remain mandatory; these
extensions are **not implemented behavior**. Do not silently add quarantine,
distributed fencing or cross-actor guarantees to the existing finite-step API.
