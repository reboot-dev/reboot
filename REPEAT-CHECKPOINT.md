# CPX02 clean repeat — live, incomplete checkpoint

**Not a benchmark result. Do not publish performance claims from this checkpoint.**

## Custody and the next action

- Independent worktree: `/home/openclaw/.hermes/profiles/jean/cache/scratch/tiny-repeat`, based on published `6e3538ce`. No shared-parent SDK files changed.
- Durable parent owner: `root@2.29.27.53`, PID **861984**, PPID **1**, systemd unit `tiny-repeat-owner-20261020.service`, invocation `f03759d9d7e1438f9e08eb7ec8dd5bfc`.
- Executed source: `/root/tiny-repeat-20261020/tiny_repeat_owner.py`, SHA256 `2bae087b2de5d196bd8e64d06e16c128bc1eee21b082e816cbeb6eea317be4a6`.
- Atomic original ledger: `/root/tiny-repeat-20261020/results/owner.json`; append-only custody events: `results/events.jsonl`; stdout/stderr: `/root/tiny-repeat-20261020/owner.log`. No subagent-local background daemons.
- Current gate: **awaiting-parent-timing-clearance**. Worker `47180e96` owns the CCX43 heavy cache/native suite. It resumed after an initially quiet snapshot. Do not stop it or compete with it.
- Parent must coordinate a quiet interval with that worker and independently review this harness. Then atomically create `/root/tiny-repeat-20261020/TIMING-CLEARANCE.json` on CCX43 containing `{"heavy_owner_retired":true,"no_heavy_suite_overlap":true,"coordinator":"parent","review":"<real reviewer/result>"}`. This is timing coordination, NOT another purchase-approval request. Never assert these booleans without checking. The owner also rejects active Cargo/rustc/linker/Bazel processes in its preflight.
- Owner's hard deadline: **2026-10-20 13:58:08.950 UTC / 15:58:08.950 CEST**. Its timer raises into `finally`; service outer limit is four hours five minutes with an additional stop timeout. Parent should inspect well before that deadline. If too little time remains, retire this waiting owner, preserve its ledger, and launch a separately recorded bounded continuation; do not overwrite/reuse `results/` or silently extend a running deadline.
- CCX43's unchanged hard deletion: **2026-10-20 20:46:13 CEST / 18:46:13 UTC**. Get all new evidence independently onto Omarchy well before then. No retention extension authorized.

## Exact paid-resource authority

- New server **171353819**, Primary IPv4 resource **156610171**, class **cpx02**, **fsn1 Germany**. Provider recycled address `2.31.73.10`; neither former resource ID was reused. Existing CCX43 is untouched.
- Fresh API check at creation: EUR **0.302016** per 24 hours, IPv4 included, calculated from net prices with **21% VAT**, below EUR0.31 cap. Exactly one new VM was created; no fallback, registry, extra VM, or paid storage.
- New tiny expiry: **2026-10-21T09:47:45.204208+00:00**, less than 24 hours from creation.
- Jean cron exact-ID deletion job **9b15327c9788**, advance reminder **b0002ef1b3de**. Both enabled/scheduled read back; full jobs in `repeat-identity.json`.
- Guarded deletion implementation: `python3 /home/openclaw/.hermes/profiles/jean/cache/scratch/tiny-repeat/tiny_repeat_provider.py delete`. It verifies the exact new labels/type/location/address/IDs, deletes ONLY these new IDs and requires both API404. **Before manual deletion**, archive/verify full new evidence and owned volumes independently on Omarchy. At hard expiry the already-registered deletion guard remains authoritative.
- Never run the prior `tiny_cleanup.py` for this VM. Never delete former server171335411/IP156588567 or CCX43, or broad-label/unknown resources.

## What is actually verified

1. Atomic ledger: 300 concurrent valid reads; command timeout retained and rejected; injected workload failure; all three original Unix children joined. Repeated as a detached remote systemd service, PPID1; it completed after SSH disconnected.
2. Lifecycle tests with real Unix wait children and fake Docker transport: normal stop and injected app-stop failure both retire app before engine, retain unresolved custody for retry, and join original waits. These are controller tests, not benchmark data.
3. **Actual Docker failure drill on the new tiny VM**: frozen Rust config, engine and app started under this same controller; injected workload failure entered finally. Exact original Docker wait children joined with zero exit codes; terminal PIDs zero. Recorded retirement order `config, app, engine`. No running tiny containers afterward. Remote smoke PID861482, PPID1, successful systemd completion. Raw original evidence copied in `controller-smoke-evidence/`.
4. Actual tiny-host telemetry: 106 retained records, 111 exact-container records, zero sampler-error records; strict analyzer validated all. Host swap zero and parent cgroup `MemorySwapMax=0` verified. The smoke is NOT shared-probe correctness or a timed repetition.
5. Analyzer rejects ten incomplete/malformed/error/timing RPC cases, three malformed resource cases, five malformed counter cases, plus incomplete owner acceptance. It never converts an exception to an accepted result.
6. All three loaded destination image IDs match the frozen source IDs. Independent Omarchy docker-save archive SHA256 `f444904864b2c2bc0ca658ff4ffa4df40ad4de7838f2aee1827fb9f16b2b0349`, exactly 276983276 bytes, read back.
7. No Cargo build, SDK edit, image rebuild, or push. Local incremental caches mentioned in the cleanup audit are not used by this worker.

## Frozen comparison and controller behavior

- Measured Rust source `d3b0642d0cb9962c839cfb57ebfd33f2a3cca389`, image `sha256:3dcf9d9976f76a63b3a290ef6cf15329f1f6148692c72604e5dc797a237f7db4`.
- Python image `sha256:28241a509e8dbedda24bd2033ce556cc5648ddd02ef80bd349e417586fb84925`.
- Engine image `sha256:1a73705b0771f9c861d9ba96509806849423a3d8bbff140b1261da76280460cd`.
- Full prior partial report and source images remain immutable. New evidence has a separate results directory.
- One durable remote parent owns telemetry SSH, app-only SSH ingress, local external-client container wait, every original exact-ID tiny-container wait and all commands. Atomic ledger replaces files via fsync+rename; append receipts/logs precede progress. Independent cleanup attempts run in finally; app retirement must succeed before engine retirement. No stdin lifetime is tied to the agent model.
- Engine stays on an internal Docker network. Only app joins ingress; loopback50052 SSH forwarding. Dedicated control and restricted ingress keys live on CCX43; no private keys are committed/copied to evidence.
- External client: existing CCX43, CPU14 (physical core7, sibling15 not selected), one selected logical CPU, no image change. Parent must prohibit overlapping heavy suites; this is not a saturation-ceiling experiment.
- Shared startup probe: 21 deterministic exact records plus one concurrency multiset, raw orders retained. Retained restart probe follows full app/engine retirement/restart.
- Bounded five-minute read/replay soak per implementation, then three sequential full repetitions in Rust/Python, Python/Rust, Rust/Python order. Same counts/actors/acknowledged replay keys and 64-byte payload; counts read10000/write1=1000/write32=2000/replay10000, concurrency8. Full retained state and replay verified before/after full restart.
- Client final aggregates plus incremental completion-order RPC JSONL, each completed sample flushed. Any timeout therefore retains actual completed samples rather than a nonexistent replay file. 1800-second command bounds replace the fragile 240-second deadline; failures remain failures and must be investigated before a new definitive series.
- One direct 250ms nominal tiny sampler retains host meminfo/CPU/vmstat/PSI/swaps, OS/Docker/containerd service counters, whole-stack and per-container cgroup CPU/memory/events/throttling, process RSS. Strict resource analysis rejects malformed records, lost exact-ID coverage, OOM, swap, >2-second sample gaps and incomplete totals. Clock offsets bounded using five SSH round trips. Sampled maxima are not exact peaks; resource intervals include client initialization and differ from RPC-loop denominators.

## Completion contract for parent continuation

1. Clear timing only after coordination/review; inspect actual remote owner PID/atomic ledger, not SSH launcher. Do not edit the executed scripts while a run is live.
2. Wait for terminal `end`, `complete=true`, empty `failures`, original child joins and each exact-container terminal state. If a workload fails, retain all evidence and investigate; no replacement/discarded errors masquerading as definitive three repetitions.
3. Run `/usr/bin/python3 /root/tiny-repeat-20261020/tiny_repeat_analyze.py /root/tiny-repeat-20261020/results` on CCX43. Six complete performance runs, both qualifications, original waits and all raw counts/resources are mandatory; report missing gates honestly.
4. Independently review/recompute every aggregate, add soak growth/PSI/OOM and whole-host OS/Docker memory interpretation. Deliver throughput, p50/p95/p99 and whole-stack cgroup RAM together. Footprint is NOT tested minimum RAM; no lower-budget distraction before full three reps.
5. Preserve exhaustive raw results, failed attempts, volumes, source/client/loaded image/binary hashes, transcript/summary, final report and Git bundle **independently on Omarchy**, verify byte counts and SHA256 there. Original runnable images are already independently retained at `/home/ladin/.cache/hermes-reboot-parity/tiny-20261020/`.
6. Commit new compact report/summary/provenance/harness and raw manifest/bundle hashes in this independent worktree; no push without independent review. Do NOT alter the old partial report.
7. Delete ONLY recorded new server171353819 and owned IPv4resource156610171 and verify API404 for both. Backups and exact cleanup readback are part of completion. Current checkpoint has NOT completed benchmark or cleanup.
