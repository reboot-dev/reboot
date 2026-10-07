# Declared task results — verification and delivery record

Baseline: `55d04b65acfbbd1f4e7d853738ba75317067bbba`; branch
`work/rust-task-declared-results`; worktree
`/home/openclaw/worktrees/reboot-rust-tree-participant-tasks`.
Existing dirty work was preserved and extended. Independently reviewed and approved
under the explicit trusted-application-registration boundary below; no full SDK
parity claim. Historical blocked checkpoints are preserved and superseded by the
delivery decision at the end of this record.

## Contracts and scope

Python source contract: `reboot/templates/reboot.py.j2:899–944` separates
method-declared terminals from escaped errors; `reboot/aio/internals/tasks_dispatcher.py:225–305`
retries escaped dispatch failures; `reboot/aio/state_managers.py:4743–4804`
persists terminal responses/errors under actor admission. Canonical Database
`CompleteTask` already supports `Any<google.rpc.Status>` errors (`rbt/v1alpha1/database.proto:395–414`,
`reboot/server/database.cc:2656–2789`). No proto/CXX change is required.

Rust changes couple generated typed handlers/schedulers/Wait, immutable
registration-time method contracts, admitted writer outcome sealing, failed
private-state discard, error completion CAS, Completed replay and CAS-loser
validation. Writer handler-only pre-Store failures have three bounded attempts;
reader escaped failures remain non-retried. Transport/Store/Load/replay/ACK
uncertainty has no live retry. Workflows, task authorization, generic distributed
retry policies and nested subtree rollback are excluded.

### Trusted application registration boundary

`OneShotTasks::new_with_declarations` is a **trusted application registration
boundary**. Private immutable `TaskMethodDeclaration` fields bind full RPC,
state declaration TypeId, request/response TypeIds, persisted request decoder,
response URL and method-specific declared-error decoder set. Runtime validation
precedes receipt creation; overridable binding validation cannot expand it.
Legacy custom `OneShotTasks::new` has no declared authority. This is not
cryptographic/protoc-origin sealing: a malicious registrar can intentionally
register its own incorrect schema. The host application already controls its
handlers, routing and sidecar configuration. Do not describe this API as a
sandbox against malicious application registration.

Generated canonical Wait sends the expected full method in metadata and checks
it against the stored task's registered method; public Wait validates both
response and error against that stored method. Rich RPC failures remain `Grpc`
even if details match a declared payload. A third-party Tasks service that
ignores method metadata is not certified by this same-framework contract.

## Acceptance cases

- Generated declared reader/writer restart, typed original error payload and no
  Completed redispatch; writer retry succeeds on attempt three, failed private
  state never persists; exact writer-task checkpoint key has no error checkpoint.
- Pre-error-CAS restart explicitly permits handler redelivery (at least once).
- Custom declared receipt then parked binding cancellation: destroyed binding
  and sticky failure latch precede queued exclusive writer readmission;
  graceful shutdown returns failure, not success. Existing Store/replay cases retained.
- Custom permissive validator cannot confer undeclared receipt authority.
  Explicit registration negatives reject wrong full service/method, protobuf-wire
  compatible wrong Rust request type, undeclared detail and malformed error.
- Conflicting declared CAS winner is retained and fails owner; byte-equal winner
  is accepted after actual canonical reload/validation. A test-only completion
  counter proves losing-CAS handling completed, rather than sleeping to infer it.
- Public typed Wait rejects wrong/malformed terminal envelopes and cross-calls
  QueryDeclared/ApplyDeclared despite identical response/error types; matching
  rich RPC failure with two details stays Grpc.
- A→B→C declared-capable task staging is invisible before Commit and absent on
  Abort. Durable committed states `[12, 27, 47]` plus one ordinary Apply(100)
  yield exact readmission results `[112, 127, 147]`; this corrects the earlier
  fixture's uniform 112 expectation without weakening its assertion.
- Existing held/lost completion ACK vector now also exercises a declared writer
  result: one handler attempt, unchanged actor state, durable error restart and
  no live retry. Native2pc is regression evidence, not legacy nested parity.

## Causal REDs (all restored in finally with exact-source comparison)

1. Declared `started=false`: `/tmp/task-declared-red-cancel.log`, exit101;
   failed assertion: `actual failure must latch BEFORE queued exclusive readmission`.
2. Ignore registered full method: `/tmp/task-declared-red-fullmethod.log`, exit101;
   canonical task unexpectedly Completed rather than Pending for wrong-full-method.
3. RPC `map_err(from_status)` instead of `Grpc`: `/tmp/task-declared-red-rpcclassification.log`,
   exit101; fake rich transport failure became declared payload9 rather than
   expected Grpc sentinel-2. Both build and handler ran; not a compile/startup RED.

Only these three new causal controls were executed here. Older checkpoint/tree
controls are historical evidence, not rerun declared-error-specific controls.
Suppressed-error persistence, storing failed private mutation, and premature
error-specific tree publication have not received new independent RED mutations.

## Historical verification before wakeup #300

- Focused declared CXX: `/tmp/task-declared-resume-focused3.log`: 7 passed,
  0 failed, 86 filtered before the final fixture formatting/select refinement.
- Locked all-features/all-targets: `/tmp/task-declared-alltargets.log`: 255 library,
  12 host, 1 nonignored CXX (92 ignored), 5 native transport (8 ignored), 4 plugin
  integration, 5 trailer tests; generated downstream fixture 26 passed and default
  downstream fixture1 passed. It includes the final test refinements and production
  source subsequently restored byte-identically after causal controls.
- Full restored-source CXX: `/tmp/task-declared-final-cxx.log`: **91 passed, 1 failed**, 1 nonignored test filtered. Existing `tree_participant_tasks_intermediate_lost_trailers_unknown_c_self_watch` failed at startup Query readiness with Unimplemented. This is NOT a green final matrix.
- Exact-case rerun: `/tmp/task-declared-tree-readiness-rerun.log` never reached a verdict; the 150-second enclosing tool timeout occurred during generated-host rebuilding/artifact-lock waiting. No owned Cargo/rustc processes remained at handoff.
- Native8, strict Clippy, fmt and root doctests never started in that timed-out serial batch; their logs are absent. These remain mandatory gates.
- Independent review: `/home/openclaw/.hermes/profiles/jean/cache/delegation/subagent-summary-0-20261007_061957_319925.txt`. Three blockers substantively resolved; no further source blocker under trusted registration. Generated-origin authority remains unproven: parent must approve the narrower scope or replace public arbitrary registrations and prove registration-forgery negatives.
- Remaining review negatives: direct raw public Wait validation against the stored method, and seeded persisted multiple-detail errors. The current ordinary-method typed Wait negative fails expected-method matching first; RPC multiple-detail coverage does not prove rejection of persisted multiple-detail errors.

**NOT READY FOR DELIVERY.** Stable dirty candidate preserved; sole writer/build released, no commit/push. Hash inventory: `/tmp/task-declared-final-evidence-inventory.json`. All three production source hashes match their pre-RED restored identities. Old fixture hosts were left untouched.

Disk checks stayed above20GB (59GB available); CARGO_INCREMENTAL=0,
CARGO_BUILD_JOBS=2, shared authorized target and existing canonical Database
binary were used for every build. No Bazel build, worktree creation/deletion,
old fixture cleanup or unrelated old-host termination was performed.

## Wakeup #300 — current-source verification

The prior 91/92 failed run and interrupted rerun above remain historical evidence.
After fresh process/disk checks, no build owner remained and59GB was available.
The two direct negative vectors were present in the candidate but previously
unexecuted: seeded persisted multiple-detail errors, and raw public Wait without
`x-reboot-task-method` rejecting an ordinary method's stored declared error.
Both now execute in the enclosing CXX target. Fixed only Clippy's nested-if
warnings (same predicates/assertions) and applied Cargo formatting; no authority
scope change or assertion weakening.

Final source revision this wakeup:
- `/tmp/task-declared-wakeup300-cxx-final.log`: **92 passed**, zero failed,
  one nonignored test filtered; all88 baseline cases plus4 new enclosing cases.
- `/tmp/task-declared-wakeup300-native-final.log`: **8 passed**, zero failed.
- `/tmp/task-declared-wakeup300-alltargets-final.log`: locked all-features/all-targets
  green; **255 library**, **26 generated downstream**, default downstream1,
  host12, plugin4, trailer5; ignored CXX92 and Native8 were subsequently exercised.
- `/tmp/task-declared-wakeup300-clippy-final.log`: strict all-features/all-targets
  Clippy green with `-D warnings`.
- `/tmp/task-declared-wakeup300-fmt-final.log`: Cargo fmt check green.
- `/tmp/task-declared-wakeup300-doc-final.log`: **3 compile-fail doctests passed**.
- `/tmp/task-declared-wakeup300-tree-rerun.log`: the exact unknown-C/self-Watch
  case passed; the complete subsequent matrix also passed. The earlier
  Unimplemented readiness cause is not established, so no startup assertion was
  relaxed and no speculative fixture fix was applied.

**Still NOT READY under the requested stronger authority contract.** All execution
gates above are green, but public trusted application registration is not sealed
generated-origin authority. Independent review's narrower-scope qualification is
unchanged; this wakeup did not approve that scope change or establish a schema root.
No commit/push. Source stable; ownership released with no owned builds remaining.
Updated source/log/binary hashes: `/tmp/task-declared-final-evidence-inventory.json`.

## Delivery scope decision (2026-10-07)

Vlad authorized committing and continuing if the remaining authority qualification
is external application misuse only. The intended boundary trusts host registration,
handler implementation, routing and the canonical Tasks service; it does not
sandbox malicious application code or certify an arbitrary third-party service.
This is not approval to weaken actor admission, request/full-method/error binding,
terminal validation, cancellation or uncertainty handling. Independent read-only
review approved this scope without finding an internal safety blocker:
`/home/openclaw/.hermes/profiles/jean/cache/delegation/subagent-summary-0-20261007_075753_041708.txt`.
It checked registration, full-method/type association, cancellation/readmission,
stored-method Wait, RPC classification and failed private state. No full parity claim.

Final verification is being repeated in `/tmp/task-declared-delivery-{alltargets,
cxx,native}.log`; source changes since wakeup #300 are documentation only.
Fmt, locked strict all-features/all-targets Clippy and all three root doctests
were rerun successfully. Earlier failed logs remain historical evidence.

## Known execution issue

The first extended custom-cancellation run had a five-second entry timeout with
no diagnostic; a diagnostic-enhanced rerun passed. Final matrix must be checked
for recurrence rather than treating that initial focused failure as final acceptance.
