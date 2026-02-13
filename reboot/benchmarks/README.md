# Benchmarks

## Run a benchmark

Currently only supporting Node.js benchmarks (that also use the Python internals).

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
