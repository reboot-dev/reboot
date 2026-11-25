# Controller repair checkpoint — HOLD, independent review required

This supersedes only the waiting-owner instructions in `REPEAT-CHECKPOINT.md`.
Prior partial reports and the former executed source remain untouched. No benchmark
workload, timing clearance, image rebuild, SDK change, push or new capacity is authorized
by this checkpoint.

## Replacement custody

- Existing CCX43 `root@2.29.27.53`: systemd unit
  `tiny-repeat-owner-repaired-20261020.service`, PID **863395**, PPID **1**,
  invocation `0c284a68bbfa4fa19ca67c7127ebbf59`.
- Frozen source root `/root/tiny-repeat-repaired-20261020`; Python/config files
  read-only. Owner source SHA256
  `9795811c173f64640d340b146aee96a57ee29979560e8b48d8f363c4d4a2e245`.
  Control SHA256 `3741d8dc70d2695cfc15941960dfe166b388bbdab2c95897588fd636751f9470`.
- Ledger `results/owner.json`; stdout/stderr `owner.log`; event stream
  `results/events.jsonl`. Gate **awaiting-parent-timing-clearance**, with no
  commands, original child processes or stacks. SSH launcher has exited.
- Workload deadline **2026-10-20 13:54:08.950012 UTC**. Cleanup reserve 240 seconds,
  hard outer bound **2026-10-20 13:58:08.950012 UTC**, NOT extended from the old
  owner's deadline. Replacement systemd RuntimeMaxSec is bounded by that same
  absolute deadline. CCX43 deletion remains **18:46:13 UTC / 20:46:13 CEST**.
- Old PID861984/unit `tiny-repeat-owner-20261020.service` was retired ONLY after
  fresh exact-PID, source hash, gate, clearance absence and empty ledger/proc-child
  checks. Terminal readback: MainPID0, failed/exit-code from deliberate signal15,
  `end` retained, no children/stacks. Source SHA256 `2bae087b...` unchanged.
  Original terminal evidence is preserved, not rewritten into a successful run.

## Repaired blocking boundaries

1. Every returned tiny-container ID is registered immediately as **UNRESOLVED**
   before inspection/wait arming. First-inspect and wait-spawn faults retain cleanup
   custody. Cleanup distinguishes exact stopped confirmation from original Unix
   wait qualification; a missing original wait is explicitly unqualified, never
   reconstructed. Engine stop is blocked until every recorded app is confirmed
   stopped. Restart registration precedes the exact-ID restart command too.
2. Cleanup has its own reserved budget inside the existing bound. Deadline signals
   switch to cleanup before unwinding through nested finally blocks. Commands,
   waits and retries use the cleanup bound without reopening workload time.
3. Strict host, service, whole-stack/container CPU/memory/PSI/swap/process schema;
   required counter keys, process census/RSS and no OOM/swap. Empty no-stack samples
   require explicit boundary mode. Malformed JSONL is rejected without rewriting.
   Every qualification/soak/performance phase is checked for raw schema, interval
   coverage, gaps and exact container IDs; soak duration/count are checked from
   events, with per-phase host/service/whole-stack memory summaries.

## Real fault evidence, not benchmark results

- `repeat_fault_runner.py`: identical actual-container fault test against old
  `9110b751` and the repair snapshot. Old **RED**: first inspect, original wait
  spawn, actual workload-deadline cleanup. Repair **GREEN** for all three.
  The deadline drill uses a frozen Python-image process ignoring SIGTERM and a
  real owner timer; actual `docker stop -t 30` takes over 30 seconds. Exact wait
  outputs and terminal PIDs are retained. The old failing implementation has
  explicit test-only recovery receipts, not invented qualification.
- `repeat_final_fault_runner.py`: reruns inspect/spawn/deadline and actual Rust
  config/engine/app smoke against the exact replacement source hashes, under a
  detached PPID1 systemd service. No RPC load or benchmark timing. Original
  systemd service/child/terminal readbacks accompany the evidence archive.
- `repeat_resource_regression_test.py`: 106 original smoke samples validate;
  eight real-smoke mutations old accepts are rejected by the repair (whole stack,
  services, host CPU/swap/vmstat, processes, memory.stat, throttle counters).
  `tiny_repeat_faulttest.py` additionally rejects 19 resource mutations. Truncated
  JSONL remains unchanged and fails closed; explicit boundary mode is exercised.
- Original atomic-ledger/Unix-child test and lifecycle transient-stop-failure
  tests pass. These implementation-authored regression tests are NOT an
  independent review verdict. Parent must obtain independent read-only review
  of the committed candidate and exact frozen remote hashes before clearance.

## Unchanged resource authority and next gate

Only new tiny VM **171353819**, IPv4 resource **156610171**, address **2.31.73.10**
is used. No swap, exact three frozen image IDs, no new capacity or expiry change.
Deletion job **9b15327c9788**, reminder **b0002ef1b3de** remain unchanged; tiny
expiry **2026-10-21T09:47:45.204208+00:00**. No SDK/heavy batches; parent coordinates
the independently retired heavy worker and quiet interval.

**DO NOT create TIMING-CLEARANCE.json until independent review PASS and parent
coordination.** If approved, use the replacement root only, not the old retired
root. The existing clearance contract is described in `REPEAT-CHECKPOINT.md`;
include a real review verdict and candidate/source hashes. Do not edit live source.
If review requires a source change, retire only the exact empty waiting replacement,
preserve proof, and launch a new frozen owner within this unchanged absolute bound.

Durable evidence and Git bundle are retained under Omarchy
`/home/ladin/.cache/hermes-reboot-parity/tiny-repeat-20261020/repair-checkpoint/`.
The accompanying external manifest records the commit, bundle/archive SHA256 and
byte counts, plus readback receipts; it is separate to avoid circular hashes.
