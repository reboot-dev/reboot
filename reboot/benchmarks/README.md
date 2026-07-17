# Benchmarks

## Run a benchmark

### Node.js

Create a benchmark script, e.g., `reboot/benchmarks/construct/construct.ts`, and
provide a default export which is an object that provides the `op` property. See
`reboot/benchmarks/construct/construct.ts` for an example.

Define a Bazel target for that benchmark in the corresponding BUILD file, e.g.,

```
benchmark(
    name = "construct",
    concurrency = "8",
    data = glob(["**/*"]),
    duration = "30s",
    partitions = "8",
    script = "construct.ts",
    working_directory = "reboot/benchmarks/construct",
)
```

```console
bazel run //reboot/benchmarks/construct:construct
```

### Python

Create a benchmark script, e.g., `reboot/benchmarks/python/writer.py`, that
defines an `async def op(context, data)` performing a single benchmark
operation, and optionally an `async def setup(context)` whose result is
passed to every `op` call as `data` (e.g., ids of pre-created states). See
`reboot/benchmarks/python/writer.py` for an example.

Define a Bazel target for that benchmark using the `benchmark_py` macro in
the corresponding BUILD file, e.g.,

```
benchmark_py(
    name = "writer",
    concurrency = "8",
    duration = "30s",
    partitions = "8",
    rbtrc = ".rbtrc",
    script = "writer.py",
    srcs = APP_SRCS,
    working_directory = "reboot/benchmarks/python",
)
```

```console
bazel run //reboot/benchmarks/python:writer
```

The harness sweeps partitions (doubling up to `partitions`) and, for each,
concurrency (doubling from the partition count up to `concurrency`),
printing a `Concurrency;50th percentile;99th percentile;99.9th percentile;op/s` table per partition count and writing a report file to
`reboot/benchmarks/python/reports/`.

Available Python benchmarks:

- `construct` - create a new state per operation.
- `reader` - a minimal reader on a random state.
- `writer` - a minimal durable writer on a random state.
- `transaction_single` - a transaction writing only its own state.
- `transaction_read` - a read-only transaction over two states.
- `transaction_write` - a read-write transaction over two states.
