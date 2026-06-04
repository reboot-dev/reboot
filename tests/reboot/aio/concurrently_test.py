from __future__ import annotations

import asyncio
import logging
import unittest
from reboot.aio.concurrently import (
    AdaptiveConcurrencyLimiter,
    Log,
    _default_logger,
    concurrently,
)
from typing import AsyncGenerator, Awaitable


class LogRecordingHandler(logging.Handler):
    """Handler that captures log records into a list."""

    def __init__(self) -> None:
        super().__init__()
        self.records: list[logging.LogRecord] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.records.append(record)


class AdaptiveConcurrencyLimiterTest(unittest.IsolatedAsyncioTestCase):

    def test_initial_limit(self) -> None:
        """A non-default `initial_limit` is respected."""
        limiter = AdaptiveConcurrencyLimiter(initial_limit=15)
        self.assertEqual(limiter.limit, 15)

    def test_limit_respects_max(self) -> None:
        """Limit never exceeds `max_limit`."""
        default = AdaptiveConcurrencyLimiter.DEFAULT_INITIAL_LIMIT
        limiter = AdaptiveConcurrencyLimiter(
            max_limit=default,
        )
        # Feed many stable samples to try to push the limit
        # up past `max_limit`.
        for _ in range(200):
            limiter.on_sample(0.01)
        self.assertLessEqual(limiter.limit, default)

    def test_limit_respects_min(self) -> None:
        """Limit never drops below `min_limit`."""
        limiter = AdaptiveConcurrencyLimiter(min_limit=3)
        # Feed stable samples to establish a baseline.
        for _ in range(10):
            limiter.on_sample(0.01)
        # Now feed much higher latency to drive the limit down.
        for _ in range(200):
            limiter.on_sample(1.0)
        self.assertGreaterEqual(limiter.limit, 3)

    def test_no_update_before_min_window_samples(self) -> None:
        """The limit does not change until at least
        `min_window_samples` samples have been recorded."""
        limiter = AdaptiveConcurrencyLimiter()
        initial = AdaptiveConcurrencyLimiter.DEFAULT_INITIAL_LIMIT
        window = AdaptiveConcurrencyLimiter.DEFAULT_MIN_WINDOW_SAMPLES
        # Feed one fewer sample than the default window size.
        for _ in range(window - 1):
            limiter.on_sample(0.01)
        self.assertEqual(limiter.limit, initial)

    def test_limit_increases_under_stable_latency(self) -> None:
        """When latency is stable, the limit grows
        proportionally over successive windows."""
        limiter = AdaptiveConcurrencyLimiter()
        default = AdaptiveConcurrencyLimiter.DEFAULT_INITIAL_LIMIT
        # Feed many windows of stable latency.
        for _ in range(100):
            limiter.on_sample(0.01)
        # With proportional growth the limit should have grown
        # well beyond initial.
        self.assertGreater(limiter.limit, default * 4)

    def test_limit_decreases_under_increased_latency(self) -> None:
        """When latency increases significantly, the limit
        decreases within a window or two -- the algorithm
        should be responsive to overload, not require many
        windows of degraded latency before reacting."""
        limiter = AdaptiveConcurrencyLimiter()
        window = AdaptiveConcurrencyLimiter.DEFAULT_MIN_WINDOW_SAMPLES
        # Establish a baseline with low latency.
        for _ in range(50):
            limiter.on_sample(0.01)
        limit_before = limiter.limit

        # Two windows of much higher latency should be enough to
        # see the limit drop.
        for _ in range(window * 2):
            limiter.on_sample(0.1)
        self.assertLess(limiter.limit, limit_before)

    def test_first_window_establishes_baseline(self) -> None:
        """The first window sets the long-term RTT baseline
        without changing the limit."""
        limiter = AdaptiveConcurrencyLimiter()
        initial = AdaptiveConcurrencyLimiter.DEFAULT_INITIAL_LIMIT
        window = AdaptiveConcurrencyLimiter.DEFAULT_MIN_WINDOW_SAMPLES
        # Complete exactly one window.
        for _ in range(window):
            limiter.on_sample(0.05)

        # The limit should still be at initial_limit because
        # the first window only establishes the baseline.
        self.assertEqual(limiter.limit, initial)
        assert limiter._long_rtt is not None
        self.assertAlmostEqual(limiter._long_rtt, 0.05)

    def test_initial_limit_capped_at_max(self) -> None:
        """When `initial_limit` exceeds `max_limit`, the
        constructor caps it."""
        limiter = AdaptiveConcurrencyLimiter(
            initial_limit=50,
            max_limit=10,
        )
        self.assertEqual(limiter.limit, 10)

    def test_initial_limit_floored_at_min(self) -> None:
        """When `initial_limit` is below `min_limit`, the
        constructor raises it to `min_limit`."""
        limiter = AdaptiveConcurrencyLimiter(
            initial_limit=1,
            min_limit=5,
        )
        self.assertEqual(limiter.limit, 5)

    def test_proportional_growth(self) -> None:
        """With default parameters, proportional growth reaches
        high limits quickly."""
        limiter = AdaptiveConcurrencyLimiter()
        initial = AdaptiveConcurrencyLimiter.DEFAULT_INITIAL_LIMIT
        window = AdaptiveConcurrencyLimiter.DEFAULT_MIN_WINDOW_SAMPLES
        # Feed ~12 windows of stable-latency samples.
        windows = 12
        for _ in range(window * windows):
            limiter.on_sample(0.01)
        # With stable latency (i.e., gradient=1.0), each window
        # multiplies the limit by (1 + smoothing * growth_factor). The
        # first window only establishes the baseline, so we get
        # (windows - 1) real updates. Assert the limit reached at
        # least half the theoretical value.
        growth_per_window = 1.0 + limiter._smoothing * limiter._growth_factor
        theoretical = initial * growth_per_window**(windows - 1)
        self.assertGreater(limiter.limit, theoretical / 2)


class ConcurrentlyTest(unittest.IsolatedAsyncioTestCase):

    async def test_basic(self) -> None:
        """All awaitables succeed."""

        async def generator() -> AsyncGenerator[Awaitable[int], None]:
            for i in range(5):
                yield asyncio.sleep(0, result=i)

        results = set()
        async for result in concurrently(generator()):
            results.add(result)

        self.assertEqual(results, {0, 1, 2, 3, 4})

    async def test_empty_generator(self) -> None:
        """An empty generator yields nothing."""

        async def generator() -> AsyncGenerator[Awaitable[int], None]:
            return
            # Make this an async generator.
            yield  # pragma: no cover

        count = 0
        async for _ in concurrently(generator()):
            count += 1  # pragma: no cover

        self.assertEqual(count, 0)

    async def test_exceptions_are_captured(self) -> None:
        """With `return_exceptions=True`, exceptions are yielded
        as bare values (matching `asyncio.gather`)."""

        async def succeed() -> str:
            return "ok"

        async def fail() -> str:
            raise ValueError("boom")

        async def generator() -> AsyncGenerator[Awaitable[str], None]:
            yield succeed()
            yield fail()
            yield succeed()

        results = []
        exceptions = []
        async for result in concurrently(
            generator(),
            return_exceptions=True,
        ):
            if isinstance(result, BaseException):
                exceptions.append(result)
            else:
                results.append(result)

        self.assertEqual(results, ["ok", "ok"])
        self.assertEqual(len(exceptions), 1)
        self.assertIsInstance(exceptions[0], ValueError)
        self.assertEqual(str(exceptions[0]), "boom")

    async def test_fixed_concurrency_is_bounded(self) -> None:
        """With adaptive=False, at most `limit` awaitables run at once."""
        limit = 4
        yielded = 0
        futures: list[asyncio.Future[int]] = []
        done = asyncio.Event()

        async def generator() -> AsyncGenerator[Awaitable[int], None]:
            nonlocal yielded
            while yielded < limit:
                future: asyncio.Future[int] = asyncio.Future()
                futures.append(future)
                yielded += 1
                yield future
            done.set()

        async def consume() -> None:
            await concurrently(
                generator(),
                limit=limit,
                adaptive=False,
            )

        task = asyncio.create_task(consume())

        # Wait for the generator to yield `limit` items.
        while yielded < limit:
            await asyncio.sleep(0)

        self.assertEqual(yielded, limit)

        # Wait 1 second and verify no more yields happened,
        # since concurrency should be bounded and all the
        # futures are pending.
        await asyncio.sleep(1)
        self.assertEqual(yielded, limit)

        # And the generator should not be done, since `concurrently`
        # should not have returned control to it from its last `yield`.
        self.assertFalse(done.is_set())

        # Resolve one future; `concurrently` should try and
        # pull exactly one more from the generator but it
        # should have finished.
        futures[0].set_result(0)

        await done.wait()

        self.assertEqual(yielded, limit)

        # Now complete all the futures and `consume()` should
        # complete too.
        for future in futures[1:]:
            future.set_result(0)

        await task

    async def test_early_break_cancels_pending(self) -> None:
        """Breaking out of the loop cancels outstanding tasks."""
        limit = 3
        yielded = 0

        async def generator() -> AsyncGenerator[Awaitable[int], None]:
            nonlocal yielded
            while True:
                if yielded == limit - 1:
                    yielded += 1
                    # Yield a completed awaitable so we can
                    # trigger `break` below.
                    yield asyncio.sleep(0, result=0)
                else:
                    yielded += 1
                    yield asyncio.Event().wait()

        async for _ in concurrently(
            generator(),
            limit=limit,
            adaptive=False,
        ):
            # Break after the first completion.
            break

        # Only the initial limit tasks should have executed
        # since the current semantics of `concurrently` is to
        # only pull from the generator after executing the
        # loop body.
        self.assertEqual(yielded, limit)

    async def test_fixed_concurrency_one(self) -> None:
        """With adaptive=False and limit=1, results arrive in order."""
        order: list[int] = []

        # Using a helper coroutine here so that we separate
        # out the generator from the actual work being done so
        # as to ensure that if limit=1 then each call to
        # `work` should be done sequentially.
        async def work(i: int) -> int:
            order.append(i)
            return i

        async def generator() -> AsyncGenerator[Awaitable[int], None]:
            for i in range(5):
                yield work(i)

        results = []
        async for result in concurrently(
            generator(),
            limit=1,
            adaptive=False,
        ):
            results.append(result)

        self.assertEqual(results, [0, 1, 2, 3, 4])
        self.assertEqual(order, [0, 1, 2, 3, 4])

    async def test_mixed_results_and_exceptions(self) -> None:
        """Interleaved successes and failures."""

        async def maybe(i: int) -> int:
            if i % 2 == 0:
                raise RuntimeError(f"{i}")
            return i

        async def generator() -> AsyncGenerator[Awaitable[int], None]:
            for i in range(6):
                yield maybe(i)

        results = []
        exceptions = []
        async for result in concurrently(
            generator(),
            return_exceptions=True,
        ):
            if isinstance(result, BaseException):
                exceptions.append(str(result))
            else:
                results.append(result)

        self.assertEqual(sorted(results), [1, 3, 5])
        self.assertEqual(sorted(exceptions), ["0", "2", "4"])

    async def test_adaptive_with_limit(self) -> None:
        """Adaptive mode respects a caller-provided upper bound
        on concurrency: even though the limiter would like to
        ramp up, no more than `limit` awaitables are ever in
        flight."""
        limit = 4
        yielded = 0
        futures: list[asyncio.Future[int]] = []
        done = asyncio.Event()

        async def generator() -> AsyncGenerator[Awaitable[int], None]:
            nonlocal yielded
            while yielded < limit:
                future: asyncio.Future[int] = asyncio.Future()
                futures.append(future)
                yielded += 1
                yield future
            done.set()

        async def consume() -> None:
            await concurrently(
                generator(),
                limit=limit,
            )

        task = asyncio.create_task(consume())

        # Wait for the generator to yield `limit` items.
        while yielded < limit:
            await asyncio.sleep(0)

        self.assertEqual(yielded, limit)

        # Wait 1 second and verify no more yields happened,
        # since adaptive mode caps the limit at `limit` and
        # all the futures are still pending.
        await asyncio.sleep(1)
        self.assertEqual(yielded, limit)

        # And the generator should not be done, since
        # `concurrently` should not have pulled past the
        # bound.
        self.assertFalse(done.is_set())

        # Resolve one future; `concurrently` should try and
        # pull exactly one more from the generator but it
        # should have finished.
        futures[0].set_result(0)

        await done.wait()

        self.assertEqual(yielded, limit)

        # Now complete all the futures and `consume()` should
        # complete too.
        for future in futures[1:]:
            future.set_result(0)

        await task

    async def test_adaptive_starts_at_initial_limit(self) -> None:
        """Adaptive mode starts at `initial_limit`, not the
        caller's upper bound."""
        initial_limit = AdaptiveConcurrencyLimiter.DEFAULT_INITIAL_LIMIT
        futures: list[asyncio.Future[int]] = []
        # Fired by the generator once `initial_limit` futures have
        # been created.
        filled = asyncio.Event()
        # Fired by the test to tell the generator to stop creating
        # futures.
        stop = asyncio.Event()

        async def generator() -> AsyncGenerator[Awaitable[int], None]:
            while not stop.is_set():
                future: asyncio.Future[int] = asyncio.Future()
                futures.append(future)
                if len(futures) == initial_limit:
                    filled.set()
                yield future

        async def consume() -> None:
            async for result in concurrently(
                generator(),
                limit=initial_limit * 10,
            ):
                pass

        task = asyncio.create_task(consume())

        # Wait until the generator has yielded exactly `initial_limit`
        # futures.
        await filled.wait()

        # Yield the event loop once more to confirm no additional
        # futures are created beyond `initial_limit` -- `concurrently`
        # only refills after a result has been consumed by the loop
        # body, and none of the futures have resolved at this point,
        # so there should be no quota for the generator to run.
        await asyncio.sleep(0)
        self.assertEqual(len(futures), initial_limit)

        # Tell the generator to stop, then resolve all pending futures
        # so the consumer can finish.
        stop.set()

        for future in list(futures):
            future.set_result(0)

        await task

    async def test_exceptions_propagate_by_default(self) -> None:
        """By default, an exception from an awaitable is raised
        directly to the caller."""

        async def fail() -> int:
            raise ValueError("boom")

        async def generator() -> AsyncGenerator[Awaitable[int], None]:
            yield asyncio.sleep(0, result=1)
            yield fail()
            yield asyncio.sleep(0, result=3)

        with self.assertRaises(ValueError) as context:
            async for result in concurrently(
                generator(),
            ):
                pass

        self.assertEqual(str(context.exception), "boom")

    async def test_log_summary(self) -> None:
        """When a log dict is passed, a summary message is
        emitted after the batch completes."""
        logger = logging.getLogger("test_log_summary")
        logger.setLevel(logging.DEBUG)
        handler = LogRecordingHandler()
        logger.addHandler(handler)

        async def generator() -> AsyncGenerator[Awaitable[int], None]:
            for i in range(10):
                yield asyncio.sleep(0, result=i)

        await concurrently(
            generator(),
            log=Log(
                label="Test batch",
                logger=logger,
                level=logging.DEBUG,
            ),
        )

        # Find the summary message.
        summary = [
            record for record in handler.records
            if "done:" in record.getMessage()
        ]
        self.assertEqual(len(summary), 1)
        message = summary[0].getMessage()
        self.assertIn("Test batch", message)
        self.assertIn("10 completed", message)
        self.assertIn("0 errors", message)

    async def test_log_no_window_by_default(self) -> None:
        """Without `verbose=True`, no per-window messages are
        emitted — only the summary."""
        logger = logging.getLogger("test_log_no_window")
        logger.setLevel(logging.DEBUG)
        handler = LogRecordingHandler()
        logger.addHandler(handler)

        async def generator() -> AsyncGenerator[Awaitable[int], None]:
            for i in range(50):
                yield asyncio.sleep(0.001, result=i)

        await concurrently(
            generator(),
            log=Log(
                label="Quiet",
                logger=logger,
                level=logging.DEBUG,
            ),
        )

        window_messages = [
            record for record in handler.records
            if "window:" in record.getMessage()
        ]
        self.assertEqual(len(window_messages), 0)

        summary = [
            record for record in handler.records
            if "done:" in record.getMessage()
        ]
        self.assertEqual(len(summary), 1)

    async def test_log_verbose_window(self) -> None:
        """With `verbose=True`, per-window messages are emitted
        during adaptive execution."""
        logger = logging.getLogger("test_log_verbose")
        logger.setLevel(logging.DEBUG)
        handler = LogRecordingHandler()
        logger.addHandler(handler)

        async def generator() -> AsyncGenerator[Awaitable[int], None]:
            for i in range(50):
                yield asyncio.sleep(0.001, result=i)

        await concurrently(
            generator(),
            log=Log(
                label="Verbose",
                logger=logger,
                level=logging.DEBUG,
                verbose=True,
            ),
        )

        window_messages = [
            record for record in handler.records
            if "window:" in record.getMessage()
        ]
        # With 50 operations and default `min_window_samples=5`, we
        # should get several window messages (first window is
        # baseline-only and doesn't log, so fewer than 10).
        self.assertGreater(len(window_messages), 0)
        # Each window message should include the label and limit info.
        for record in window_messages:
            message = record.getMessage()
            self.assertIn("Verbose", message)
            self.assertIn("limit=", message)
            self.assertIn("gradient=", message)

    async def test_no_log_by_default(self) -> None:
        """No log messages are emitted when `log` is not passed."""
        logger = logging.getLogger("test_no_log")
        logger.setLevel(logging.DEBUG)
        handler = LogRecordingHandler()
        logger.addHandler(handler)

        async def generator() -> AsyncGenerator[Awaitable[int], None]:
            for i in range(10):
                yield asyncio.sleep(0, result=i)

        await concurrently(generator())

        self.assertEqual(len(handler.records), 0)

    async def test_log_fixed_mode(self) -> None:
        """In fixed mode, a summary is emitted but no
        per-window messages."""
        logger = logging.getLogger("test_log_fixed")
        logger.setLevel(logging.DEBUG)
        handler = LogRecordingHandler()
        logger.addHandler(handler)

        async def generator() -> AsyncGenerator[Awaitable[int], None]:
            for i in range(10):
                yield asyncio.sleep(0, result=i)

        await concurrently(
            generator(),
            limit=5,
            adaptive=False,
            log=Log(
                label="Fixed batch",
                logger=logger,
                level=logging.DEBUG,
            ),
        )

        # Should have a summary but no window messages.
        window_messages = [
            record for record in handler.records
            if "window:" in record.getMessage()
        ]
        self.assertEqual(len(window_messages), 0)

        summary = [
            record for record in handler.records
            if "done:" in record.getMessage()
        ]
        self.assertEqual(len(summary), 1)
        message = summary[0].getMessage()
        self.assertIn("Fixed batch", message)
        self.assertIn("10 completed", message)
        # Fixed mode summary should not include RTT stats.
        self.assertNotIn("avg_rtt", message)

    async def test_await_collects_results(self) -> None:
        """`await concurrently(...)` collects results into a list."""

        async def generator() -> AsyncGenerator[Awaitable[int], None]:
            for i in range(5):
                yield asyncio.sleep(0, result=i)

        results = await concurrently(generator())
        self.assertEqual(sorted(results), [0, 1, 2, 3, 4])

    async def test_await_return_exceptions(self) -> None:
        """`await concurrently(..., return_exceptions=True)`
        returns results and exceptions mixed together, matching
        `asyncio.gather(return_exceptions=True)`."""

        async def fail() -> int:
            raise ValueError("boom")

        async def generator() -> AsyncGenerator[Awaitable[int], None]:
            yield asyncio.sleep(0, result=1)
            yield fail()
            yield asyncio.sleep(0, result=3)

        results = await concurrently(
            generator(),
            return_exceptions=True,
        )
        # Matches `asyncio.gather: results and exceptions are
        # mixed together as bare values.
        successes = [
            result for result in results
            if not isinstance(result, BaseException)
        ]
        errors = [
            result for result in results if isinstance(result, BaseException)
        ]
        self.assertEqual(sorted(successes), [1, 3])
        self.assertEqual(len(errors), 1)
        self.assertIsInstance(errors[0], ValueError)

    async def test_await_raises_by_default(self) -> None:
        """`await concurrently(...)` raises on the first
        exception by default."""

        async def fail() -> int:
            raise ValueError("boom")

        async def generator() -> AsyncGenerator[Awaitable[int], None]:
            yield asyncio.sleep(0, result=1)
            yield fail()

        with self.assertRaises(ValueError):
            await concurrently(generator())

    async def test_await_empty(self) -> None:
        """`await` on an empty generator returns an empty list."""

        async def generator() -> AsyncGenerator[Awaitable[int], None]:
            return
            yield  # pragma: no cover

        results = await concurrently(generator())
        self.assertEqual(results, [])

    async def test_log_true(self) -> None:
        """`log=True` uses the default logger and auto-derives
        the label from the generator's `__qualname__`."""
        _default_logger.setLevel(logging.DEBUG)
        handler = LogRecordingHandler()
        _default_logger.addHandler(handler)

        try:

            async def my_generator() -> AsyncGenerator[Awaitable[int], None]:
                for i in range(5):
                    yield asyncio.sleep(0, result=i)

            await concurrently(
                my_generator(),
                log=True,
            )

            summary = [
                record for record in handler.records
                if "done:" in record.getMessage()
            ]
            self.assertEqual(len(summary), 1)
            message = summary[0].getMessage()
            # The qualname should appear in the label.
            self.assertIn("my_generator", message)
            self.assertEqual(summary[0].levelno, logging.DEBUG)
        finally:
            _default_logger.removeHandler(handler)

    async def test_log_label_with_qualname(self) -> None:
        """When a label is provided, the generator's
        `__qualname__` is appended in parens."""
        logger = logging.getLogger("test_label_qualname")
        logger.setLevel(logging.DEBUG)
        handler = LogRecordingHandler()
        logger.addHandler(handler)

        async def my_generator() -> AsyncGenerator[Awaitable[int], None]:
            for i in range(5):
                yield asyncio.sleep(0, result=i)

        await concurrently(
            my_generator(),
            log=Log(
                label="Creating nodes",
                logger=logger,
            ),
        )

        summary = [
            record for record in handler.records
            if "done:" in record.getMessage()
        ]
        self.assertEqual(len(summary), 1)
        message = summary[0].getMessage()
        # Label should contain both the custom label and
        # the qualname in parens.
        self.assertIn("Creating nodes (", message)
        self.assertIn("my_generator", message)

    async def test_for_each_with_lambda(self) -> None:
        """`await` with `for_each` returns (element, result)
        tuples."""
        results = await concurrently(
            lambda i: asyncio.sleep(0, result=i * 10),
            for_each=range(5),
        )
        self.assertEqual(
            sorted(results),
            [(0, 0), (1, 10), (2, 20), (3, 30), (4, 40)],
        )

    async def test_for_each_with_function(self) -> None:
        """`await` with `for_each` works with a named
        function."""

        async def double(i: int) -> int:
            return i * 2

        results = await concurrently(
            double,
            for_each=[10, 20, 30],
        )
        self.assertEqual(
            sorted(results),
            [(10, 20), (20, 40), (30, 60)],
        )

    async def test_for_each_return_exceptions(self) -> None:
        """In `for_each` mode with `return_exceptions=True`, yields
        (element, result | BaseException) tuples."""

        async def maybe_fail(i: int) -> int:
            if i == 2:
                raise ValueError("boom")
            return i * 10

        successes = []
        errors = []
        async for element, result in concurrently(
            maybe_fail,
            for_each=[1, 2, 3],
            return_exceptions=True,
        ):
            if isinstance(result, BaseException):
                errors.append((element, result))
            else:
                successes.append((element, result))

        self.assertEqual(sorted(successes), [(1, 10), (3, 30)])
        self.assertEqual(len(errors), 1)
        self.assertEqual(errors[0][0], 2)
        self.assertIsInstance(errors[0][1], ValueError)

    async def test_for_each_async_for(self) -> None:
        """Callable + `for_each` works with async for to build a
        dict."""

        async def get_value(key: str) -> int:
            return len(key)

        result = {
            key: value async for key, value in concurrently(
                get_value,
                for_each=["a", "bb", "ccc"],
            )
        }
        self.assertEqual(
            result,
            {
                "a": 1,
                "bb": 2,
                "ccc": 3
            },
        )

    async def test_for_each_async_generator(self) -> None:
        """Callable + `for_each` works with an async generator,
        allowing lazy streaming sources."""

        async def ids() -> AsyncGenerator[int, None]:
            for i in range(5):
                yield i

        results = await concurrently(
            lambda i: asyncio.sleep(0, result=i * 10),
            for_each=ids(),
        )
        self.assertEqual(
            sorted(results),
            [(0, 0), (1, 10), (2, 20), (3, 30), (4, 40)],
        )

    async def test_iterable_list(self) -> None:
        """A plain list of awaitables works."""
        results = await concurrently(
            [asyncio.sleep(0, result=i) for i in range(5)],
        )
        self.assertEqual(sorted(results), [0, 1, 2, 3, 4])

    async def test_iterable_generator(self) -> None:
        """A sync generator expression of awaitables works."""
        results = await concurrently(
            asyncio.sleep(0, result=i) for i in range(5)
        )
        self.assertEqual(sorted(results), [0, 1, 2, 3, 4])


if __name__ == '__main__':
    unittest.main()
