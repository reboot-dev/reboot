# Actual 1 GB CPX02: interrupted partial evidence

**Not a completed benchmark qualification.** The prior controller worker failed. Its owner ledger is zero bytes, the original wait children were orphaned, and controller telemetry stopped. No replacement repetitions or lower-memory gates were launched. This report preserves independently recomputed surviving measurements, rather than retroactively certifying custody.

## Whole-stack memory and surviving timing rows

Same actual one-shared-vCPU CPX02 (kernel RAM 977,784,832 bytes), sequential Docker stacks, no swap. External CCX43 client, eight workers, SSH forwarding to the app. These are individual surviving attempts—not medians, not three complete repetitions, and not a server saturation ceiling.

| Attempt | Workload | cgroup MiB sampled max | RSS MiB sampled max | RPC/s | p50 ms | p95 ms | p99 ms |
|---|---|---:|---:|---:|---:|---:|---:|
| perf-1-python | many_send | 574.7 | 558.0 | 11.18 | 475.00 | 2152.21 | 2761.73 |
| perf-1-python | reader | 559.0 | 554.3 | 169.38 | 42.88 | 64.20 | 71.69 |
| perf-1-python | single_send | 563.4 | 550.3 | 7.06 | 1222.99 | 3228.71 | 4123.15 |
| perf-1-rust | many_send | 184.6 | 154.4 | 76.29 | 108.10 | 110.50 | 144.21 |
| perf-1-rust | reader | 112.8 | 128.9 | 144.04 | 55.69 | 72.07 | 75.38 |
| perf-1-rust | replay | 187.1 | 156.5 | 76.04 | 108.34 | 109.59 | 124.00 |
| perf-1-rust | single_send | 175.0 | 138.8 | 76.86 | 108.05 | 112.97 | 148.98 |
| perf-2-python | many_send | 580.7 | 563.3 | 136.94 | 51.86 | 72.68 | 93.53 |
| perf-2-python | reader | 596.8 | 596.8 | 216.57 | 33.82 | 52.34 | 64.46 |
| perf-2-python | replay | 576.6 | 564.6 | 109.86 | 72.45 | 73.27 | 75.25 |
| perf-2-python | single_send | 577.0 | 557.3 | 148.62 | 51.45 | 76.83 | 77.62 |
| perf-2-rust | many_send | 185.0 | 153.2 | 76.02 | 108.28 | 112.84 | 150.88 |
| perf-2-rust | reader | 110.2 | 116.6 | 144.30 | 55.82 | 71.89 | 75.12 |
| perf-2-rust | single_send | 175.5 | 139.2 | 76.18 | 108.25 | 114.76 | 151.55 |

- Throughput and nearest-rank p50/p95/p99 were recomputed from every retained raw RPC sample and checked against the recorded fields. Each file has exactly the expected ordered sample count and zero recorded RPC errors.
- Memory is the sum of exact active stack container cgroups, including the native engine; RSS is a separate sum and can double-count shared pages. Resources were nominally sampled every 250 ms; sampled maxima are not exact peaks. Per-row event/resource coverage is in summary.json. CPU intervals include client import/controller overhead and do not share the timed RPC-loop denominator.
- Rust is an application plus native Database sidecar. Python includes packaged Python, native engine and proxy/launcher in one container. These topology results do not isolate the language. Whole-host OS/Docker memory is not included in the table.
- Fixed readers return 16 × 64-byte messages; reader/replay 10,000 RPCs, single-actor writes 1,000, 32-actor writes 2,000, concurrency eight, no warmup. Writes grow durable state and are not equivalent to fixed readers.

## Correctness and retained restart evidence

- Shared public probe: 22 records each; 21 deterministic records equal exactly. The concurrency record matches membership and multiplicity; raw order is retained and is not an ordering contract.
- Both qualification restart transcript files report complete. Original app/engine retirement ownership cannot now be certified from the lost ledger; restart responses remain genuine raw observations, not replacement lifecycle proof.
- rust: 4 retained read/replay soak batches, 40000 requests, 400.71 timed RPC seconds, zero errors. This is bounded read/replay evidence, not unbounded writer-growth qualification.
- python: 5 retained read/replay soak batches, 50000 requests, 353.20 timed RPC seconds, zero errors. This is bounded read/replay evidence, not unbounded writer-growth qualification.

## Failure, interruption and retirement

- First Python performance attempt retained reader/single-write/many-write results, then its replay SSH command exceeded 240 seconds. Prior retained stdout records severe host memory pressure; recovered tiny.slice memory.events reports zero OOM kills. The failed replay has no retained completed sample JSON. Failure rows remain visible; they are not silently replaced or excluded to manufacture a win.
- Performance attempt 2 Python has four retained timing files. Attempt 2 Rust has reader/single-write/many-write files only; replay completion stdout and owner state were lost. No third repetition or lower-budget result exists. Neither implementation receives full qualification.
- No minimum-RAM claim: the only exercised environment was the physical 1 GB host with no additional finite application memory cap. Observed footprint is not a minimum tested allowance or required host RAM.
- Previous worker transcript last final failure: 2026-10-20T08:56:27Z. This is not an exact telemetry-termination timestamp. Last saved per-container sample: 2026-10-20T08:52:20.010627+00:00; last retained client event: 2026-10-20T08:53:49.684189+00:00. Observation coverage after those instants is absent, not reconstructed.
- Recovery began 2026-10-20T09:02:43.373977+00:00 and ended 2026-10-20T09:03:01.670241+00:00. Exact-label inventory found only the attempt-2 Rust app/engine running on the tiny VM, and the pinned idle external client. New recovery Docker waits were armed for the running containers, app stopped before engine, wait return codes matched exact-ID terminal State, all retired PIDs read back zero. Original child waits could not be joined by this recovery process and are explicitly NOT certified. The failed-created client object was not treated as a launched child.
- Source owner.json remains zero bytes. No synthetic replacement owner ledger, reconstructed RPC response, retroactive wait claim or successful full-run summary was written. Original raw logs, resources, events and harness hashes are archived. Recovery metadata is separate.

## Provenance, retention and boundaries

- Measured Rust SDK source: d3b0642d0cb9962c839cfb57ebfd33f2a3cca389. Python example: 5c332a2910122d6035799bfaf2a314bf1de830b8. Native SDK/C++ artifacts reused pin 8574ccb0df9893274e69d1a19eca469dad56d779; no fresh C++ build or full SDK parity claim.
- App-only ingress bridge correction and restricted SSH forwarding were used; the Rust engine remained internal. Initial setup failure logs are retained. One shared CPU, external network/SSH latency and severe memory pressure limit interpretation.
- Durable directory: `omarchy-jean:/home/ladin/.cache/hermes-reboot-parity/tiny-20261020/`. Contains runnable docker-save images, original build proof, interrupted raw evidence and stopped owned-volume archive. Local compact publication includes REPORT.md, summary.json, provenance.json, raw-evidence.tar.gz, harness and cleanup receipt.
- Deletion authority is only server 171335411 and owned Primary IP 156588567, after durable verification. See cleanup.json for provider outcome. Existing CCX43 is not deleted or extended by this recovery; its original 2026-10-20 20:46 CEST expiry remains authoritative. No new capacity, registry, installs or rebuilds.
