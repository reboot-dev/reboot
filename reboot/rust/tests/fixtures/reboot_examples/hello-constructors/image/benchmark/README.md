# Bounded hello-constructors Docker comparison

This is an application benchmark, not full Rust SDK parity or a benchmark of the
languages in isolation. The qualified images are reused without rebuild or pull.
See `results/REPORT.md` for actual measurements and qualifications.

## Reproduce on the authorized CCX43

From the repository root, copy the harness and the **existing** shared public probe
and comparator into a new, refuse-existing source directory on that host:

```sh
IMAGE=reboot/rust/tests/fixtures/reboot_examples/hello-constructors/image
# Choose new task-owned paths and names; never overwrite frozen evidence.
SOURCE=/home/benchbuild/.cache/hello-bench-source-NEW
OUT=/home/benchbuild/.cache/hello-bench-evidence-NEW
mkdir "$SOURCE"
cp "$IMAGE/benchmark/"*.py "$SOURCE/"
cp "$IMAGE/shared_probe.py" "$IMAGE/transcript_comparison.py" "$SOURCE/"
python3 "$SOURCE/run.py" --out "$OUT" --name hello-bench-NEW
python3 "$SOURCE/analyze.py" "$OUT"
```

The run command is finite and must remain under a live waited supervisor/SSH
session, **not** an abandoned shell background job. The owner catches SIGTERM and
SIGINT and retires exact owned children in `finally`. Do not interrupt with SIGKILL.
The executed run was a foreground remote SSH child of a tracked, waited local job.
The host guard refuses any hostname except the existing authorized CCX43. It
refuses any concurrently running Docker container at initial and per-run admission.
It never removes containers, networks or volumes; all newly owned volumes are
retained. Retention/expiry and provider resources are untouched.

The four offline analyzer tests run without Docker:

```sh
python3 -m unittest discover -s "$IMAGE/benchmark" -p 'test_*.py' -v
```

## Frozen comparison

- Same real generated public gRPC schema, protobuf request bodies, state-ref
  metadata and UUIDv7 idempotency metadata; no private load/store microbenchmark.
- Both images first pass the shared conformance suite and comparison (21 exact
  deterministic records plus one raw concurrent membership/multiplicity record).
- Three repetitions, alternating language order: Rust/Python, Python/Rust,
  Rust/Python. Each repetition/language has a fresh owned RocksDB state volume,
  and each case has disjoint actors. Case order is fixed and disclosed.
- Server budget: four CPU-seconds per second and 4 GiB RAM, affinity to logical
  CPUs `0,2,4,6` (four distinct physical cores). Rust app gets 1 CPU/1 GiB;
  separate native C++ engine gets 3 CPU/3 GiB. Python gets all 4 CPU/4 GiB in its
  single container, including embedded native C++ engine, launcher and Envoy.
  This is a **static 1:3 allocation**, not an optimized or dynamically shared
  Rust aggregate limit. Both have swap disabled beyond their memory allowance.
- A separate client container, using the same pinned Python image only as a
  runtime/binding carrier, gets 2 CPU/1 GiB on logical CPUs `8,10` (two other
  physical cores). It has no app/engine running and no healthcheck. It runs on
  the **same CCX43**, not an external or remote client host. Both language paths
  use the same private Docker network hop. No port, especially engine port, is
  published. Internal networks are unique per run.
- Closed-loop concurrency **8**, 64-byte message values. One hundred untimed
  warmup requests precede each measured case, using disjoint warmup actors.
  Channels, pool startup and exact counts are identical for each language.
- Reader: 10,000 calls against one preseeded actor with 16 messages; each complete
  serialized protobuf response is asserted to be **1,056 bytes** and unchanged.
- Durable Send single actor: 1,000 unique identities, growing from 1 to 1,001
  retained messages. Full-state rewrite/serialization growth is intentional.
- Durable Send many actor: 2,000 unique identities round-robin over 32 actors,
  growing from one to 63/64 messages each (16 of each).
- Replay: 10,000 Send calls reusing the **same acknowledged identity and identical
  payload** on one actor; retained message count remains exactly two. This is
  mutation replay, not a reader disguised as replay.
- A full app+engine stop/start after every run verifies all 35 measured actors'
  full payloads/counts unchanged and replays the acknowledged replay mutation
  again before checking. Fresh volumes are preserved, not deleted.

Both implementations use the qualified engine source pin
`8574ccb0df9893274e69d1a19eca469dad56d779`: standalone native executable for Rust,
embedded native library for Python. They are distinct build artifacts, not one
identical executable. The original Python writer context defaults to `sync=True`;
Rust's ordinary writer Store request also explicitly uses `sync: true`. Neither
path relaxes WAL/sync or uses a benchmark-only handler. Successful full-stack
restarts check acknowledged persistence, not power-loss or disk-failure survival.

## Evidence and measurement boundaries

Every RPC retains ordinal, start offset, complete RPC latency, error code, and
response byte length. Percentiles use nearest rank, include errors if any, and
throughput is successful responses divided by the closed-loop wall duration.
All recorded error counts must be zero before offline acceptance.

Host-side cgroup v2 sampling every 250 ms captures all processes in both server
containers (or all Python-container processes) and the separate loadgen.
CPU deltas and throttling counters bracket the client command; this resource
interval includes its interpreter/binding startup and controller return overhead,
unlike the client's internal RPC-only timer. RSS is the **sum of process VmRSS**
and can double-count shared pages; cgroup memory is also retained separately.
Short runs can miss memory peaks between samples. Raw samples, exact image
inspection/HostConfig, OS/CPU/docker/environment, source hashes, commands and
wait statuses are retained. CPU utilization/headroom and throttling are reported,
but this fixed concurrency matrix does not prove maximum server capacity or rule
out a client/GIL/network bottleneck. No saturation sweep or remote-client claim.

Every exact-ID `docker wait` starts only after the container has started. The
owner joins that exact CLI child, compares returned daemon exit status with
terminal exact-ID inspection, and verifies not running, PID zero and no OOM.
Python/client intentional SIGTERM is 143; Rust/native engine/config is 0.
Configuration's completed container does not consume timed server resources.
No full 820-test SDK suite is rerun by this benchmark.
