# Canonical workflow admission — tested checkpoint

Base: `18175834a9df99aeda94786e6d804570c25f6083` (published lifecycle foundation; PR 216).

## Outcome and limits

Actual generated Reboot Python WeakReference.spawn / TasksStub / typed Task
clients now create and await non-cursor workflow tasks through the generated Rust
application's **original public RPC**, canonical schedule metadata and successful
UUID trailer. Generated Rust absolute/immediate references use that same wire.
No Tasks.Spawn/CreateTask RPC was invented. The legacy endpoint is retained for
compatibility; target-clock SpawnAfter and all previous absolute intent/key/UUID
bindings are preserved.

A Rust binary built from the published base admitted a future child over the
legacy transport and retained a source Started intent. Both native stores/hosts
then restarted; canonical recovery retained the exact target bytes and source
identity. A changed real UUID trailer could not advance source Started to Stored;
restored transport recovered, cancelled the child and committed one parent
continuation. This is native Python **client** qualification, not a Python-hosted
application or full middleware, placement, clock or UUID-allocation equivalence.

Contracts and remaining migration barriers:
[canonical admission map](../../CANONICAL-TASK-ADMISSION-MAP.md).

## Executed qualification

- Locked/offline all-target tests: **850 library passes**, 7 library ignores;
  **55 generated downstream consumer passes**.
- Strict SDK and generated workflow-fixture Clippy passed with `-D warnings`.
- **42 main native scenarios**, **1208 original-parent child waits**:

| Gate | Scenarios | Original child waits |
|---|---:|---:|
| canonical | 6 | 111 |
| lifecycle | 19 | 657 |
| migration | 1 | 30 |
| spawn | 16 | 410 |

The all-target run listed **171 ignored entries**. Canonical admission /
legacy migration, lifecycle and spawn native wrappers were explicitly executed;
other ignored gates were **not requalified**. No full-SDK/full-Python claim.

Three final native source mutants were rejected: omitted UUID trailer, ignored
explicit schedule, and acceptance of a changed UUID. Exact changed source,
unified diffs, complete input manifests, executable hashes and original RED
receipts are retained before restored GREEN. Native-parent injected error and
SIGTERM drills both failed as intended with every original child joined. These
controls/drills are separate from the main scenario/wait totals above.

The original preceding owner's 1,066 waits were independently read back complete;
its parent retired before this batch. The new finite remote owner and every
native parent retained atomic nonempty ledgers, waited original children, and
reached exact terminal systemd state before packaging. No replacement waits were
used to manufacture custody.

## Qualification provenance and repaired attempts

The accepted all-target/strict-Clippy/fixture-build receipts are `final3-*`.
A later recovery-client readiness issue and a Wait-fault proxy's missing
pass-through trailers required **two Python proof-only repairs**. The final5
controller mechanically compared complete manifests and proved that only
`prove_canonical_admission.py` and `tasks_terminal_proxy.py` differed: all
Rust/schema/Cargo inputs and actual Python runtime sources were unchanged. It
retained those actual compile receipts explicitly as reused, then reran all
native gates, all three source mutants, and both cleanup drills on the final
proof inputs and the identical pinned Rust executable. The source-delta and
receipt-reuse assertions were independently checked offhost, not silently
relabeled as a fresh all-target execution.

Earlier failures (including an obsolete generated-code expectation and generated
fixture Clippy line formatting) remain in the raw archive; neither is counted
as qualification. The native C++ executable was **reused/hash-pinned, not freshly
built**. No install, registry operation, deployment, new capacity or retention
extension occurred. No heavy local Cargo build ran. Independent source review
and normal publication remain required; this checkpoint is a local commit only.

## Retained evidence

- [Machine qualification](workflow-canonical-admission-20261020.json)
- [Final input manifest](workflow-canonical-admission-20261020-source-inputs.json)
- [Raw archive](workflow-canonical-admission-20261020-raw.tar.gz)
- [Archive receipt](workflow-canonical-admission-20261020-archive.json)
- [Independent offhost verification](workflow-canonical-admission-20261020-offhost-verification.json)

Final manifest: **715 inputs**; source objects are retained by hash,
including real generator/runtime Python and observed generated Rust output.
The archive contains **4361 files**, **7269723 bytes**; every member,
local executable/schema source, final mutant delta, native count and original
wait was independently verified offhost. It excludes large executables,
RocksDB directories and compile caches; executable pins are explicit.

Raw archive SHA256:
`4c09ea1fe76ec96f82936c0f7092d56a79f3bf80537e7c6ff3afb404946d8da9`

Source manifest SHA256:
`0eae7460bc4e471c3a7534188879760e6f60c35cf928d07b7c23ede263981799`

Final Rust fixture SHA256:
`e164476f4aeb84f4e0dedee73a301c210c9634624e116d15a68735b3be13a231`

Published-base Rust fixture SHA256:
`7c80503337f96dcdac8d3771597223f52a7632fb3d06e89645f00cd495149f1a`

Reused native Database SHA256:
`619002c569e9841144a8bbedf4f2ce6a753bb0e6b103af71883d91d43f413803`

## Remaining barriers

Generic reader/writer and transaction task targets, cursor admission/receipt GC,
and dynamic placement/ownership remain open. Python-hosted server admission /
UUID allocation and recomputed timedelta replay are not qualified. Existing
relative SpawnAfter still uses target admission time, not the Python caller's
clock. Administrative cancellation timing and other historical lifecycle limits
are unchanged; historical archives and benchmark reports were not rewritten.
