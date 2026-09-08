"""Benchmark quantifying how many times a reactive reader body is
re-executed when many clients subscribe to the same state, and how much
time those redundant executions cost.

Run with:
  bazel test --test_output=all //tests/reboot:reactive_fanout_benchmark_py
"""

import asyncio
import gc
import reboot.aio.react
import resource
import time
import unittest
from dataclasses import dataclass
from reboot.aio.applications import Application
from reboot.aio.contexts import EffectValidation, ReaderContext
from reboot.aio.tests import Reboot
from tests.reboot import greeter_rbt
from tests.reboot.greeter_rbt import Greeter
from tests.reboot.greeter_servicers import MyGreeterServicer

# Number of concurrent reactive subscribers on the same state.
SUBSCRIBERS = [1, 5, 10, 25, 50]

# Number of state mutations to apply while subscribers are attached.
MUTATIONS = 20

# Number of leaf actors a single "fan-in" reader reads transitively.
LEAVES = 10


@dataclass(frozen=True)
class Config:
    name: str
    # Simulated CPU cost of one reader body, in seconds.
    reader_work_seconds: float
    # Depth of the `RecursiveMessage` chain stored in the state, which
    # controls how expensive the per-subscriber `CopyFrom()` is.
    state_depth: int = 0
    # Whether the reader memoizes its own result on `(state, request)`,
    # which is the ceiling of what a reader-result cache could save:
    # the body runs once per distinct state instead of once per
    # subscriber, while every other per-subscriber cost stays.
    memoize: bool = False


CONFIGS = [
    Config('trivial reader', 0.0),
    Config('1ms reader', 0.001),
    Config('5ms reader', 0.005),
]

# The three things being compared: no sharing and no cache, a reader
# result cache (the reader memoizes itself), and session sharing (one
# execution fanned out to every identical subscription).
ARMS = [
    ('baseline', False, False),
    ('memoized', True, False),
    ('shared', False, True),
]


class CountingGreeterServicer(MyGreeterServicer):
    """A `Greeter` whose readers count their own executions and the
    wall-clock time spent inside the reader body."""

    reader_work_seconds = 0.0
    memoize = False
    memoized: dict[tuple[str, str], greeter_rbt.GreetResponse] = {}

    executions = 0
    root_executions = 0
    seconds_in_reader = 0.0
    # Every distinct `(state, request)` the reader body was invoked on;
    # its size is the number of executions a perfect cache would need.
    distinct_inputs: set[tuple[str, str]] = set()

    @classmethod
    def reset(cls):
        cls.memoized = {}
        cls.executions = 0
        cls.root_executions = 0
        cls.seconds_in_reader = 0.0
        cls.distinct_inputs = set()

    async def Greet(
        self,
        context: ReaderContext,
        request: greeter_rbt.GreetRequest,
    ) -> greeter_rbt.GreetResponse:
        start = time.perf_counter()

        key = (self._proper_name(), request.name)

        type(self).distinct_inputs.add(key)

        if type(self).memoize:
            cached = type(self).memoized.get(key)
            if cached is not None:
                type(self).seconds_in_reader += time.perf_counter() - start
                return cached

        type(self).executions += 1

        if type(self).reader_work_seconds > 0.0:
            # Busy-wait rather than `asyncio.sleep()` so that this
            # models CPU-bound reader work, which is the part a cache
            # of reader results would actually eliminate.
            deadline = time.perf_counter() + type(self).reader_work_seconds
            while time.perf_counter() < deadline:
                pass

        message = f'Hi {request.name or "??"}, I am {self._proper_name()}'

        response = greeter_rbt.GreetResponse(message=message)

        if type(self).memoize:
            type(self).memoized[key] = response

        type(self).seconds_in_reader += time.perf_counter() - start

        return response

    async def ReadRecursiveMessage(
        self,
        context: ReaderContext,
        request: greeter_rbt.ReadRecursiveMessageRequest,
    ) -> greeter_rbt.ReadRecursiveMessageResponse:
        """A "fan-in" reader: reads `LEAVES` other actors transitively,
        which is what turns one subscription into a tree of reactive
        sessions."""
        type(self).root_executions += 1

        messages = []
        for leaf in range(LEAVES):
            response = await Greeter.ref(f'leaf-{leaf}'
                                        ).Greet(context, name='fanout')
            messages.append(response.message)

        return greeter_rbt.ReadRecursiveMessageResponse(
            message=greeter_rbt.RecursiveMessage(message='|'.join(messages)),
        )


class ReactiveFanoutBenchmark(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        # Disable effect validation so that the numbers reflect a
        # production deployment; with it enabled every reader body runs
        # twice, which would double every count below.
        await self.rbt.up(
            Application(servicers=[CountingGreeterServicer]),
            effect_validation=EffectValidation.DISABLED,
        )
        self.context = self.rbt.create_external_context(name='benchmark')

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def _measure(
        self,
        *,
        config: Config,
        subscribers: int,
        state_id: str,
        memoize: bool = False,
        share: bool = False,
    ) -> dict:
        reboot.aio.react.SHARE_REACTIVE_QUERIES = share

        greeter, _ = await Greeter.Create(
            self.context,
            state_id,
            title='Mr.',
            name='Robot',
            adjective='adjective-0',
        )

        if config.state_depth > 0:
            message = greeter_rbt.RecursiveMessage(message='x' * 64)
            for _ in range(config.state_depth):
                message = greeter_rbt.RecursiveMessage(
                    message='x' * 64,
                    next=message,
                )
            await greeter.StoreRecursiveMessage(self.context, message=message)

        CountingGreeterServicer.reader_work_seconds = (
            config.reader_work_seconds
        )
        CountingGreeterServicer.memoize = memoize
        CountingGreeterServicer.reset()

        seen: list[int] = [0] * subscribers
        latest: list[str] = [''] * subscribers
        progress = asyncio.Event()

        async def subscribe(index: int):
            async for response in greeter.reactively().Greet(
                self.context, name='benchmark'
            ):
                seen[index] += 1
                latest[index] = response.message
                progress.set()

        tasks = [
            asyncio.create_task(subscribe(index))
            for index in range(subscribers)
        ]

        # Wait until every subscriber has received its initial response,
        # so that the measured window contains only mutation-driven
        # re-execution.
        while any(count == 0 for count in seen):
            await progress.wait()
            progress.clear()

        CountingGreeterServicer.reset()

        start = time.perf_counter()

        for n in range(1, MUTATIONS + 1):
            await greeter.SetAdjective(
                self.context, adjective=f'adjective-{n}'
            )

        final = f'the adjective-{MUTATIONS}'
        while any(not message.endswith(final) for message in latest):
            await progress.wait()
            progress.clear()

        elapsed = time.perf_counter() - start

        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

        return {
            'subscribers': subscribers,
            'runs': CountingGreeterServicer.executions,
            'distinct': len(CountingGreeterServicer.distinct_inputs),
            'reader_seconds': CountingGreeterServicer.seconds_in_reader,
            'elapsed': elapsed,
        }

    async def test_benchmark(self) -> None:
        print()
        print(f'{MUTATIONS} mutations, effect validation DISABLED')

        for config in CONFIGS:
            print()
            print(f'### {config.name}')
            header = (
                f"{'subs':>5} | {'base runs':>9} {'base s':>7} | "
                f"{'memo runs':>9} {'memo s':>7} {'win':>6} | "
                f"{'shared runs':>11} {'shared s':>8} {'win':>6}"
            )
            print(header)
            print('-' * len(header))

            for subscribers in SUBSCRIBERS:
                results = {}
                for (arm, memoize, share) in ARMS:
                    results[arm] = await self._measure(
                        config=config,
                        subscribers=subscribers,
                        state_id=(
                            f'{config.name}-{arm}-{subscribers}'.replace(
                                ' ', '-'
                            ).replace(',', '')
                        ),
                        memoize=memoize,
                        share=share,
                    )

                base = results['baseline']['elapsed']
                memo = results['memoized']['elapsed']
                shared = results['shared']['elapsed']

                print(
                    f"{subscribers:>5} | "
                    f"{results['baseline']['runs']:>9} {base:>7.3f} | "
                    f"{results['memoized']['runs']:>9} {memo:>7.3f} "
                    f"{100 * (base - memo) / base:>5.0f}% | "
                    f"{results['shared']['runs']:>11} {shared:>8.3f} "
                    f"{100 * (base - shared) / base:>5.0f}%"
                )

    async def test_transitive_fanout(self) -> None:
        """A reader that transitively reads `LEAVES` other actors: how
        many reader bodies run per subscriber when one leaf changes."""
        CountingGreeterServicer.reader_work_seconds = 0.0
        CountingGreeterServicer.memoize = False

        print()
        print(f'### transitive fan-in over {LEAVES} leaves')

        for leaf in range(LEAVES):
            await Greeter.Create(
                self.context,
                f'leaf-{leaf}',
                title='Mr.',
                name=f'Leaf{leaf}',
                adjective='adjective-0',
            )

        root, _ = await Greeter.Create(
            self.context,
            'root',
            title='Mr.',
            name='Root',
            adjective='adjective-0',
        )

        header = (
            f"{'subs':>5} {'shared':>7} {'leaf sessions':>14} "
            f"{'RSS KB/sub':>11} {'root runs':>10} "
            f"{'leaf runs':>10} {'total':>8} {'needed':>7} {'wall s':>8}"
        )
        print(header)
        print('-' * len(header))

        for iteration, (subscribers, share) in enumerate(
            [(n, share) for n in [1, 5, 10, 25] for share in [False, True]]
        ):
            reboot.aio.react.SHARE_REACTIVE_QUERIES = share
            CountingGreeterServicer.reset()

            gc.collect()
            rss_before = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss

            seen = [0] * subscribers
            latest = [''] * subscribers
            progress = asyncio.Event()

            async def subscribe(index: int):
                async for response in root.reactively().ReadRecursiveMessage(
                    self.context
                ):
                    seen[index] += 1
                    latest[index] = response.message.message
                    progress.set()

            tasks = [
                asyncio.create_task(subscribe(index))
                for index in range(subscribers)
            ]

            while any(count == 0 for count in seen):
                await progress.wait()
                progress.clear()

            # Every transitive read opens its own `React.Query` stream,
            # each of which is a full reactive session on the leaf that
            # runs the leaf's reader once on start. So this count is
            # also the number of leaf reactive sessions now alive.
            leaf_sessions = CountingGreeterServicer.executions

            gc.collect()
            rss_after = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
            rss_per_subscriber = (rss_after - rss_before) / subscribers

            CountingGreeterServicer.reset()

            # Each iteration needs an adjective it has never used, or
            # the write is a no-op and nothing re-executes at all.
            adjective = f'changed-{iteration}'

            start = time.perf_counter()

            await Greeter.ref('leaf-0'
                             ).SetAdjective(self.context, adjective=adjective)

            while any(f'the {adjective}' not in message for message in latest):
                await progress.wait()
                progress.clear()

            elapsed = time.perf_counter() - start

            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)

            root_runs = CountingGreeterServicer.root_executions
            leaf_runs = CountingGreeterServicer.executions
            print(
                f'{subscribers:>5} {str(share):>7} {leaf_sessions:>14} '
                f'{rss_per_subscriber:>11.0f} {root_runs:>10} '
                f'{leaf_runs:>10} {root_runs + leaf_runs:>8} {2:>7} '
                f'{elapsed:>8.3f}'
            )


if __name__ == '__main__':
    unittest.main()
