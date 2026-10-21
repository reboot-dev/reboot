# CPX02 repeat — all three repetitions completed; strict telemetry gate FAILED

**Status: measurement execution complete, not an accepted clean benchmark.** Owner completed exit 0 with failures=[]; the unchanged strict analyzer exited 1 on actual raw data. No acceptance rule or raw record was repaired. Prior partial report remains untouched.

## Observed three-repetition results (descriptive, not accepted)

Medians below are over three per-run values. Throughput bounds are min–max; latency uses nearest-rank p50/p95/p99, then median across runs (not pooled). Each workload has concurrency 8 and 64-byte payload. These are WAN/application-only SSH-tunnel measurements, not language-only or local saturation limits.

| Stack | Workload | Whole cgroup MiB | RSS sum MiB | Successful RPC/s [min–max] | p50 / p95 / p99 ms |
|---|---|---:|---:|---:|---:|
| rust | reader | 198.21 | 117.61 | 147.18 [147.04–147.80] | 53.71 / 69.68 / 74.04 |
| rust | single_send | 259.53 | 138.80 | 80.61 [80.05–80.72] | 104.64 / 109.61 / 144.44 |
| rust | many_send | 270.00 | 154.25 | 80.20 [79.98–80.44] | 104.72 / 106.68 / 139.17 |
| rust | replay | 275.04 | 168.75 | 80.32 [80.23–80.61] | 104.75 / 105.81 / 114.29 |
| python | reader | 574.13 | 568.84 | 179.76 [179.39–179.82] | 42.25 / 55.89 / 60.77 |
| python | single_send | 584.05 | 570.70 | 113.19 [112.99–113.28] | 69.83 / 70.49 / 82.11 |
| python | many_send | 585.84 | 570.86 | 113.65 [113.63–113.79] | 69.84 / 70.68 / 73.37 |
| python | replay | 577.34 | 567.46 | 114.05 [114.03–114.06] | 69.87 / 70.39 / 72.76 |

Full min/median/max for **every numeric metric**, all 24 individual cases, and qualification resource coverage are in [summary.json](summary.json). Rust is smaller here but slower on all four workloads. Do not attribute either result solely to language: Rust is app + native engine (+ one-shot config); Python has the combined native/proxy/launcher stack.

## Blocking defect and complete evidence accounting

- Strict command: `python3 tiny_repeat_analyze.py closure/results`; **exit 1**: `ValueError: sampler errors (raw preserved; no silent repair)`. See [strict-analyzer-output.log](strict-analyzer-output.log).
- `repeat-perf-3-rust-resources.log` line **1104**, time **1792494669.8538582**: container `37164b2753e9d8ecb86c87d46db065dd3dbb114108a0595153bae65c37b3f825`, PID107199, `StopIteration()`. It occurs during engine shutdown, after the final retained verification and application retirement. This does **not** waive the full-resource-schema requirement.
- Exactly **24 timed cases**, **138000 successful timed RPCs**, zero timed RPC errors, with incremental JSONL equal to final raw samples. All six performance runs and both qualifications completed. Raw JSON responses, concurrent response ordering, transcripts, logs and executed source remain in the archive.
- **9180** resource records audited; exactly one schema failure above. All non-readiness client intervals are bracketed, covered by exact container IDs, and have no resource-schema errors. All phase maximum gaps are below 0.261 seconds (250ms nominal). Expected failed readiness retries lack a client_end event; every such attempt is enumerated rather than treated as a completed interval.
- [independent-audit-output.log](independent-audit-output.log) and [summary.json](summary.json) retain defects; independent audit exit0 means accounting completed, **not benchmark acceptance**. Unchanged analyzer self-tests are supplementary, never the real-results gate.

## Retirement, correctness and resources

- Owner866962 is absent; exact systemd unit MainPID0/inactive/ExecMainStatus0. Original exit receipt: completed, exit0, all_original_unix_children_joined=true. All **445 original Unix children joined**, all **28 container lifecycle records** (including restart epochs) have Pid0, exact wait-output/State exit-code equality, no OOM; **16 unique stack container IDs** independently re-inspected. Rust/config/engine exit0; Python app and external client exit143 from expected stop. Application waits joined before engine waits in each epoch. See retirement.json and fresh readbacks.
- Correctness: **21 deterministic records exact + 1 concurrent membership/multiplicity record equal**; concurrent raw order differs and is retained, not falsely claimed exact. Each performance retained state is byte-exact before/after full restart (six pairs). Soak iteration counts/durations are in soak-verification.json.
- Target: actual one-vCPU CPX02, **932.4921875 MiB MemTotal**, Ubuntu24.04.4, kernel6.8.0-138, Docker29.1.3, cgroupv2. No host swap, no stack swap, no observed OOM counter increase. Host OS, Docker/containerd and SSH included in host telemetry; service cgroup footprint separately retained.
- Whole cgroup memory means `tinyrepeat.slice memory.current`; container sums and process RSS are separate fields. RSS may double-count shared pages. Maxima are sampled at nominal250ms, **not exact peaks**. `memory.peak` is cumulative across slice lifetimes and is not substituted for the sampled per-workload maximum. Observed footprint is not tested minimum RAM.
- External client on existing CCX43 cpuset14, separate machine from target; no client stealing a target CPU. Frozen parent clearance records retired heavy owner and no heavy-suite overlap. Client CPU is not proof of a throughput ceiling. Resource intervals include initialization/controller overhead; RPC denominator is raw RPC-loop seconds.
- No per-container CPU quota, shared physical VM vCPU cap1. No lower-memory run was performed; no minimum-fit claim. Host pressure and MemAvailable are disclosed rather than hidden.

### Full-phase resource coverage

| Phase | Samples | Max gap s | Max whole cgroup MiB | Min host MemAvailable MiB | Max service cgroups MiB |
|---|---:|---:|---:|---:|---:|
| repeat-qualification-rust | 1702 | 0.251009 | 196.53 | 450.90 | 172.39 |
| repeat-qualification-python | 1548 | 0.251283 | 600.71 | 54.44 | 162.52 |
| repeat-perf-1-rust | 1108 | 0.251769 | 270.91 | 410.27 | 170.07 |
| repeat-perf-1-python | 866 | 0.255660 | 589.61 | 30.79 | 165.30 |
| repeat-perf-2-python | 870 | 0.256717 | 602.05 | 44.16 | 155.05 |
| repeat-perf-2-rust | 1110 | 0.251901 | 275.04 | 410.59 | 172.29 |
| repeat-perf-3-rust | 1111 | 0.252285 | 311.27 | 422.26 | 172.27 |
| repeat-perf-3-python | 865 | 0.260424 | 585.09 | 42.84 | 162.44 |

Host memory PSI some/full avg10 sampled maxima: 5.10/3.07; CPU PSI some avg10 max 47.48. Host oom_kill counter bounds [0, 0]. See host-telemetry.json.

## Immutable version and retention

Measured SDK **d3b0642d0cb9962c839cfb57ebfd33f2a3cca389**; controller **101953bbe720945181c2a3caff7aadf3c62f4c36**. Not the later published typed9318 build. Exact image IDs:

- rust: `sha256:3dcf9d9976f76a63b3a290ef6cf15329f1f6148692c72604e5dc797a237f7db4`
- python: `sha256:28241a509e8dbedda24bd2033ce556cc5648ddd02ef80bd349e417586fb84925`
- engine: `sha256:1a73705b0771f9c861d9ba96509806849423a3d8bbff140b1261da76280460cd`

Durable unpaid-storage host: **Omarchy**, `/home/ladin/.cache/hermes-reboot-parity/tiny-repeat-20261020/completed-closure/`. Actual raw archive with executed source: `actual-evidence.tar.gz`; setup/review/failure evidence: `setup-and-review-evidence.tar.gz`. Exhaustive member paths, sizes and SHA256 are in raw-manifest.json and setup-manifest.json. All **21 named volumes / 238 files** retained in all-volumes.tar.gz with independently verified member hashes. Image archive reuses `/home/ladin/.cache/hermes-reboot-parity/tiny-20261020/images.docker-save.tar.gz`; all28 OCI blobs hash-verified and index IDs equal measured runtime IDs. No image duplication/build/registry deploy. Durable retention readback reports over417GB free.

## Cleanup and attempt accounting

Only new VM171353819 / Primary IPv4 156610171 deleted after durable readback. Both provider GETs returned404 at **2026-10-20T11:21:05.519203+00:00**. Initial guarded deletion hit asynchronous auto-delete IP still assigned after server404; the guard stopped safely. Subsequent exact GET confirmed provider auto-deleted IP. No unsafe detach/delete workaround. Full provider requests/status/action receipts are in provider-attempts.jsonl. Existing CCX43 171072439 labels/identity preserved; expiry20Oct20:46:13CEST unchanged. Jobs9b15327c9788/b0002ef1b3de unchanged, allowed to no-op on exact404. No capacity/expiry extension.

Prior setup failures and review drills are preserved separately, not renamed benchmark failures: atomic-ledger interruption of original partial; custody/schema RED drills and repaired GREEN; detached ingress public-key preflight failure and live/fatal regressions; narrow independent delta PASS before fresh parent timing clearance. Full three repetitions were actually run after repair, not reconstructed from earlier partial.

## Reproduction / handoff

`python3 close_repeat.py` regenerates derived accounting and **overwrites three committed JSON evidence files** in `repeat-results-20261020`; it is not a read-only verification command. Run it only in a disposable checkout with the retained raw inputs restored to `closure/results`, and inspect its Git diff afterward. It does not modify raw measurements or acceptance rules; the unchanged strict analyzer must still fail on the archived defect. Normal Git bundle is generated with prerequisite **6e3538ce0b85fcc9b481cf6bffb695a5724426d4**, not a shallow/truncated replacement. Bundle hash and final durable file readback are in the external closure-manifest.json (outside the commit to avoid circular hashes). No push. Parent independent read-only review remains a separate step; this closure does not invent its verdict.
