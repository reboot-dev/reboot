# CCX43 bounded Docker benchmark — executed 2026-10-19

**Completed: 138,000 timed public-gRPC calls across 24 case runs, zero errors.**
Both immutable image pairs passed the shared semantic preflight before timing:
21 deterministic records exact plus one concurrent membership/multiplicity record.
All six measured stacks also passed full app/engine stop/start, acknowledged-state
readback and same-key/same-payload replay without duplicate effects.

## Measured outcome

Values below are the median of three per-run measurements at concurrency 8.
Latency columns are medians of each run's nearest-rank percentile, not pooled
percentiles. The bounds are in `summary.json`, with every raw RPC in the archive.

| Workload | Python successful req/s | Rust successful req/s | Rust / Python | Python p50/p95/p99 ms | Rust p50/p95/p99 ms |
|---|---:|---:|---:|---|---|
| Fixed reader, 1,056-byte response | 4,028.65 | 4,195.11 | 1.041 | 1.752 / 2.880 / 3.080 | 1.839 / 2.451 / 2.820 |
| Durable Send, one growing actor | 577.25 | 453.70 | 0.786 | 13.696 / 15.645 / 16.633 | 16.187 / 21.678 / 52.907 |
| Durable Send, 32 growing actors | 1,536.52 | 1,295.91 | 0.843 | 5.054 / 7.033 / 8.770 | 5.301 / 7.157 / 43.678 |
| Same-key/same-payload mutation replay | 1,863.63 | 1,025.82 | 0.550 | 4.142 / 5.445 / 6.164 | 7.169 / 8.216 / 42.767 |

Rust was slower on all measured mutation/replay cases. Reader throughput was
close; the per-run throughput ranges overlap, and three short repetitions do not
establish statistical significance. No general Rust speedup or language-level
performance conclusion is supported.

## Entire-stack resources

CPU is median average cores over the controller-bracketed resource interval.
Memory is the largest 250-ms sample across the three repetitions, not an exact
peak. RSS sums process VmRSS and may double-count shared pages. Cgroup memory
is reported independently; neither is an isolated language heap measurement.

| Workload | Python CPU cores | Rust CPU cores | Python RSS sum MiB | Rust RSS sum MiB | Python cgroup MiB | Rust cgroup MiB |
|---|---:|---:|---:|---:|---:|---:|
| Reader | 1.578 | 2.411 | 936.3 | 109.3 | 710.3 | 76.9 |
| Single Send | 1.159 | 0.972 | 975.0 | 145.4 | 781.5 | 144.6 |
| Many Send | 2.613 | 2.182 | 983.4 | 151.3 | 794.8 | 154.6 |
| Replay | 2.873 | 1.301 | 986.2 | 161.4 | 799.0 | 158.7 |

These are **whole deployed comparison stacks**: Rust app plus native engine,
versus Python launcher/app plus embedded native engine and Envoy. Python's stack
has more framework/proxy processes. No attribution of the memory difference to
language alone is made.

## Fairness and limits

- Existing authorized CCX43 only: server `171072439`, `2.29.27.53`; no provisioning,
  registry push, deployment, retention or expiry change. Expiry remains
  **2026-10-20 20:46 CEST**.
- Every stack has an aggregate 4 CPU/4 GiB budget on four distinct physical cores.
  Rust is statically split 1 CPU/1 GiB app and 3 CPU/3 GiB engine; Python can use
  all 4 CPU/4 GiB in one container. This is equal total allocation, **not** a
  topology-neutral or optimized allocation comparison.
- A separate, CPU-affined client container runs on two other physical cores of
  the **same host**. There was no authorized external client machine and no
  remote-client claim. Client allowance is 2 CPU/1 GiB. Highest measured client
  cgroup CPU was 0.740 cores, with zero client CPU-throttle events; server CPU
  throttle events were also zero. This does not exclude a GIL/closed-loop/network
  limitation or prove server saturation. Full loadgen CPU/RSS samples are retained.
- Exactly the same public schema, message payloads, idempotency metadata, request
  counts and concurrency are used. Both use synchronous durable engine writes;
  the C++ engine source pin matches, although Python's embedded library and
  Rust's standalone native executable are necessarily distinct artifacts.
- Four bounded cases, one payload size and one concurrency only; **not** a broad
  saturation/steady-state benchmark. Each case has 100 untimed warmup calls.
  Timed runs lasted approximately 1.26–9.84 seconds. More repetitions, longer
  steady-state windows and additional concurrency/resource splits would be needed
  for capacity or p99 production predictions. No results are fabricated or
  extrapolated to omitted cases.
- Reader state is fixed at 16 messages. Single Send grows from 1 to 1,001 messages;
  32-actor Send grows to 63/64 messages each. Replay remains exactly two messages.
  Every run has its own fresh retained state volume. Language order alternates
  Rust/Python, Python/Rust, Rust/Python; fixed case order is reader, single Send,
  many Send, replay. Filesystem/host caches are not dropped.
- Successful full-stack restarts prove this retained acknowledged state survived
  process/engine restart, not power loss or hardware failure. No full SDK parity
  claim or rerun of the historical 820 SDK tests.

## Provenance and custody

Correctness milestone base: PR216 head
`8d80e66a294d46d197b80d097cf16d258f54c3aa`.
Remote reviewed source remained
`63799f2071c4092cf6a5f3d547e384e2d713f121`.
Existing production image IDs were used with `--pull=never`:

- Rust `sha256:f2b48e8e9ef922b0aadc558c3c4e4c8db0b19ab712fc53f7ed75bf7e6e45fc06`
- Database `sha256:1a73705b0771f9c861d9ba96509806849423a3d8bbff140b1261da76280460cd`
- Python `sha256:3e48dc3ed3642bd468e4a700acf8bdedb95fee038fda13c0749f01e381f67194`

Engine and Python SDK source pin:
`8574ccb0df9893274e69d1a19eca469dad56d779`.
`provenance.json` retains qualified binary/library/schema/build hashes. These are
inherited build provenance, not a new hermetic build attestation.

All 39 exact-ID Docker wait CLI children were joined and their returned container
exit codes compared to exact-ID terminal inspection. Independent final readback
verified all 24 owned container IDs stopped, PID zero, no OOM, no published ports,
and exact affinity/CPU/memory/image settings. All eight owned state volumes are
preserved. There are no running Docker containers. Original unrelated stopped
containers, volumes, frozen source and prior evidence were not modified.

The finite remote owner PID was `496335`; the tracked foreground-SSH launcher
completed with wait exit **0**, and a separate timestamped postflight observed
that exact remote owner PID absent. The latter is explicitly an absence
observation, not a substituted Unix wait.

## Artifacts

- `summary.json`: independently recalculated counts, percentiles, ratios, bounds,
  metrics and per-file evidence hashes.
- `provenance.json`: immutable image/source/engine/build association.
- `raw-evidence.tar.gz` and `archive-manifest.json`: complete raw RPC/resource
  samples, owner commands/waits/inspections/logs, postflight readback and exact
  executed source snapshot. No state-volume contents or cryptographic keys.
- Remote measured evidence: `/home/benchbuild/.cache/hello-bench-evidence-v1`.
- Remote frozen source: `/home/benchbuild/.cache/hello-bench-source-v1`.
- Local unpacked evidence: `/home/openclaw/hello-benchmark-artifacts/hello-bench-evidence-v1`.

Validation: four offline analyzer tests PASS; raw-evidence analyzer PASS;
independent exact-target custody/resource readback PASS. No build/runtime failures
were encountered. Only the explicitly bounded matrix above was executed.
