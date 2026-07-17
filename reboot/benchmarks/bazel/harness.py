"""Statistics collection harness for Python benchmarks.

Usage: `python harness.py <script> <duration> <partitions>
<concurrency>`.

Loads `<script>` as a Python module, which must define an
`async def op(context, data)` that performs a single benchmark
operation, and may define an `async def setup(context)` whose result
is passed to every `op` call as `data`.
"""

import asyncio
import importlib.util
import os
import re
import sys
import time
from reboot.aio.external import ExternalContext
from types import ModuleType

URL = os.environ.get("BENCHMARK_URL", "http://localhost:9991")

INTERIM_STATISTICS_INTERVAL_SECONDS = 5.0


def parse_duration_to_seconds(duration: str) -> float:
    match = re.fullmatch(
        r"(\d+(?:\.\d+)?)\s*(ms|s|m|h)?",
        duration.strip(),
    )
    if match is None:
        raise ValueError(f"Invalid duration '{duration}'")
    value = float(match.group(1))
    unit = match.group(2) or "s"
    return value * {"ms": 0.001, "s": 1.0, "m": 60.0, "h": 3600.0}[unit]


def load_script(path: str) -> ModuleType:
    # Make imports of sibling modules (e.g. shared setup helpers next
    # to the benchmark script) work.
    directory = os.path.dirname(os.path.abspath(path))
    if directory not in sys.path:
        sys.path.insert(0, directory)
    spec = importlib.util.spec_from_file_location("benchmark_script", path)
    if spec is None or spec.loader is None:
        raise ValueError(f"Unable to import '{path}'")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def print_statistics(
    times: list[float],
    duration_seconds: float,
    concurrency: int,
    tabular: bool = False,
) -> None:
    if len(times) == 0:
        return

    times = sorted(times)

    def percentile(p: float) -> float:
        return times[min(int(p * len(times)), len(times) - 1)]

    operations_per_second = round(len(times) / duration_seconds)

    if tabular:
        print(
            "Concurrency;50th percentile;99th percentile;"
            "99.9th percentile;op/s"
        )
        print(
            f"{concurrency};{percentile(0.5):.3f};{percentile(0.99):.3f};"
            f"{percentile(0.999):.3f};{operations_per_second}"
        )
    else:
        print(f"50th percentile: {percentile(0.5):.3f}ms")
        print(f"99th percentile: {percentile(0.99):.3f}ms")
        print(f"99.9th percentile: {percentile(0.999):.3f}ms")
        print(f"op/s: {operations_per_second}")


async def benchmark(
    script: str,
    duration_seconds: float,
    partitions: int,
    concurrency: int,
) -> None:
    module = load_script(script)

    op = getattr(module, "op", None)
    if op is None:
        print(f"Missing 'op' in {script}", file=sys.stderr)
        sys.exit(1)

    context = ExternalContext(name="benchmark", url=URL)

    setup = getattr(module, "setup", None)
    data = await setup(context) if setup is not None else None

    print(
        f"\n\nRunning benchmark for {duration_seconds} seconds with "
        f"{partitions} partitions and a concurrency of {concurrency}\n\n"
    )

    times: list[float] = []
    interim_times: list[float] = []

    deadline = time.monotonic() + duration_seconds

    async def client() -> None:
        while time.monotonic() < deadline:
            begin = time.monotonic()
            await op(context, data)
            milliseconds = (time.monotonic() - begin) * 1000.0
            times.append(milliseconds)
            interim_times.append(milliseconds)

    async def print_interim_statistics() -> None:
        while True:
            await asyncio.sleep(INTERIM_STATISTICS_INTERVAL_SECONDS)
            print_statistics(
                interim_times,
                INTERIM_STATISTICS_INTERVAL_SECONDS,
                concurrency,
            )
            interim_times.clear()

    interim_task = asyncio.create_task(print_interim_statistics())
    try:
        await asyncio.gather(*(client() for _ in range(concurrency)))
    finally:
        interim_task.cancel()

    print_statistics(times, duration_seconds, concurrency, tabular=True)


def main() -> None:
    argv = sys.argv[1:]

    if len(argv) != 4:
        print(
            "usage: harness.py <script> <duration> <partitions> "
            "<concurrency>",
            file=sys.stderr,
        )
        sys.exit(1)

    script, duration, partitions, concurrency = argv

    asyncio.run(
        benchmark(
            script,
            parse_duration_to_seconds(duration),
            int(partitions),
            int(concurrency),
        )
    )


if __name__ == "__main__":
    main()
