from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import (
    Any,
    AsyncGenerator,
    Awaitable,
    Callable,
    Generator,
    Generic,
    Iterable,
    List,
    Literal,
    Optional,
    Protocol,
    Tuple,
    TypeVar,
    Union,
    overload,
)

ConcurrentlyResultT = TypeVar("ConcurrentlyResultT")

# Type variable for the element type in `for_each` mode.
ElementT = TypeVar("ElementT")

# Generic type variable for the items yielded by the async
# generator and collected by `await`.
YieldT = TypeVar("YieldT")

# `for_each` accepts either a plain iterable or an async
# generator. Async generators allow lazy, streaming sources
# (e.g., database cursors, paginated APIs) without
# materializing all elements into memory.
ForEach = Union[Iterable[ElementT], AsyncGenerator[ElementT, None]]

# The first positional argument to `concurrently()` is one of:
# - An async generator of awaitables (lazy streaming).
# - A plain iterable of awaitables (e.g., list or generator
#   expression).
# - A callable that maps an element to an awaitable (used
#   with `for_each`).
# The overloads carry the precise type variables; this alias
# is used in the implementation signatures where all variants
# must be accepted.
CallableOrAwaitables = Union[
    AsyncGenerator[Awaitable[Any], None],
    Iterable[Awaitable[Any]],
    Callable[..., Awaitable[Any]],
]


class OnWindowClose(Protocol):
    """Callback protocol for adaptive limiter window close
    events. Invoked each time a sample window closes and the
    concurrency limit is recalculated."""

    def __call__(
        self,
        *,
        limit: int,
        long_rtt: float,
        short_rtt: float,
        gradient: float,
    ) -> None:
        ...


class AdaptiveConcurrencyLimiter:
    """Discovers the optimal concurrency level using the Gradient2
    algorithm, adapted from Netflix's concurrency-limits library
    (https://github.com/Netflix/concurrency-limits).

    Rather than requiring callers to guess the right concurrency
    limit, this class measures operation latency and adjusts the
    limit dynamically. It starts at a conservative
    `initial_limit` and ramps up when latency is stable, or
    backs off when latency increases (indicating overload such as
    backend queuing, event loop saturation, or network
    contention).

    Algorithm choice
    ================

    We evaluated three algorithms from Netflix's library:

    - **Vegas** (TCP Vegas-inspired): Estimates queue depth as
      `limit * (1 - minRTT / currentRTT)` and adjusts when
      the estimate crosses alpha/beta thresholds. Rejected
      because it depends on finding a stable minimum RTT, which
      is unreliable during short batches where the first
      operations may have genuinely different latency (cold
      caches, connection setup).

    - **AIMD** (Additive Increase, Multiplicative Decrease):
      Grows by +1 on success, shrinks by a backoff ratio on
      failure. Rejected because it requires binary drop/success
      signals. In asyncio there are no explicit rejections --
      overload manifests only as increased latency, which AIMD
      cannot detect.

    - **Gradient2** (chosen): Compares short-term RTT against
      long-term RTT using a gradient ratio. When latency rises
      relative to the baseline, the limit decreases
      multiplicatively; when latency is stable, it grows
      via a proportional growth term. This provides continuous
      latency-based feedback without needing a stable minimum
      RTT or explicit drop signals.

    How it works
    ============

    Completed operations report their round-trip time (RTT) via
    `on_sample()`. Samples are accumulated into windows of
    `min_window_samples` completions. When a window closes:

    1. **Short-term RTT**: The average RTT of the current window.

    2. **Long-term RTT**: An exponentially weighted moving average
       (EWMA) across all samples, with decay factor
       `2 / (long_window + 1)`. This tracks the sustained
       baseline latency and adapts gradually.

    3. **Gradient**: `rtt_tolerance * long_rtt / short_rtt`,
       clamped to [0.5, 1.0].

       - When `short_rtt ≈ long_rtt`, gradient ≈
         `rtt_tolerance` (1.5), which gets clamped to 1.0
         -- the system is healthy and the limit grows.
       - When `short_rtt > long_rtt * rtt_tolerance`, gradient
         < 1.0 -- latency has increased beyond the tolerance
         band and the limit shrinks multiplicatively.
       - The 0.5 floor prevents the limit from dropping by more
         than half in a single window.

    4. **New limit**:
       `gradient * current_limit * (1 + growth_factor)`,
       where growth is applied inside the gradient
       multiplication so that backoff dominates when latency
       increases (see "Growth strategy" below). The result is
       smoothed via `(1 - smoothing) * old + smoothing * new`
       and clamped to [min_limit, max_limit].

    Growth strategy
    ===============

    Netflix's Gradient2 uses a fixed additive `queue_size`
    (default 4) for growth. This produces linear ramp-up:
    +0.8 per window with their default smoothing of 0.2. For
    long-lived server processes handling thousands of RPS,
    linear growth is fine -- the limiter converges within
    seconds and then operates in steady state for hours.

    Our workloads are different: short-lived batches of 10s to
    1000s of operations -- e.g., bulk RPC fan-out where an
    application issues many calls in parallel (such as bulk
    `OrderedMap` inserts/removes) and the limiter is created
    per-batch. Linear growth from 5 to 100 would take ~119
    windows (~595 completions) -- most batches would finish
    before the limiter discovered the optimal level.

    Instead, we use **proportional growth** applied inside the
    gradient multiplication:
    `new_limit = gradient * limit * (1 + growth_factor)`.
    This produces exponential ramp-up when healthy and ensures
    backoff still works when overloaded (similar to TCP cubic's
    convex growth phase):

    - gradient=1.0 (healthy): new_limit = 1.5 * limit. After
      smoothing (0.5): +25% per window.
    - gradient=0.5 (overloaded): new_limit = 0.75 * limit.
      After smoothing: -12.5% per window.
    - Starting at 5, reaching 100 takes ~14 windows (~70
      completions) under stable latency.

    Backoff is intentionally slower than growth (-12.5% vs
    +25%): short-batch workloads benefit from aggressive
    ramp-up, and a single noisy window (cold cache, GC pause,
    transient queueing) shouldn't kneecap concurrency for the
    rest of the batch. `rtt_tolerance` (1.5) already absorbs
    most natural variance, and the gradient's 0.5 floor caps
    single-window backoff -- but sustained overload still
    drives the limit down via repeated -12.5% windows.

    Placing growth inside the gradient is critical: an additive
    growth term (Netflix's `queue_size`) or an additive
    proportional term (`gradient * limit + growth_factor *
    limit`) would fully compensate the gradient reduction at
    the 0.5 floor, preventing the limit from ever decreasing.

    This fast ramp-up is appropriate because Python is single-
    threaded: we start conservatively (initial_limit=5) to
    avoid overwhelming a single event loop, but ramp up quickly
    because the backend typically consists of multiple Python
    processes that can absorb higher concurrency. If those
    processes are scaled down dynamically, the resulting latency
    increase triggers a fast backoff via the gradient mechanism.

    Windowing strategy
    ==================

    Netflix's library uses 1-second time windows by default.
    This makes sense for servers handling thousands of RPS --
    a 1-second window captures hundreds of samples, providing
    a stable signal while preventing too-frequent limit
    changes. The 1-second floor is a low-pass filter on update
    frequency, not a statement about operation latency (their
    operations are also in the millisecond range).

    Our workloads involve 10s to 1000s of operations where each
    operation takes milliseconds to 100s of milliseconds, so a
    1-second window might span an entire batch, giving the
    algorithm no chance to adapt. We use **sample-count-based
    windows** instead (default: 5 samples per window). With
    128 operations and 5-sample windows, the algorithm gets ~25
    limit updates -- enough for meaningful adaptation. Smaller
    windows also mean faster detection when backend capacity
    changes (e.g., processes being added or removed
    dynamically). The EWMA on `long_rtt` and the
    `rtt_tolerance` buffer provide sufficient noise reduction
    even with small windows.
    """

    # Minimum samples before the algorithm updates the limit.
    # Smaller windows mean faster adaptation when backend
    # capacity changes (e.g., processes added or removed
    # dynamically), at the cost of noisier signal. Netflix
    # uses 10, but with our small batches we want more frequent
    # updates. With 5 samples per window, a batch of 128
    # operations gives ~25 updates, and the first real limit
    # change happens after just 10 completions.
    DEFAULT_MIN_WINDOW_SAMPLES = 5

    # Conservative default initial concurrency. We tie this to
    # `DEFAULT_MIN_WINDOW_SAMPLES` so the baseline window and
    # the first comparison window operate at the same effective
    # concurrency level: any higher and the baseline consists
    # of the fastest completions among a larger initial batch,
    # biasing `long_rtt` low and making the first gradient
    # comparison look artificially overloaded. Starting low is
    # fine for Python anyway, since a single event loop is
    # easily overwhelmed and we rely on proportional growth to
    # ramp up quickly. (Netflix defaults to 20, but they target
    # multi-threaded Java servers.) For batches smaller than
    # `2 * DEFAULT_MIN_WINDOW_SAMPLES`, the limiter effectively
    # acts as a fixed limit -- which is fine since small
    # batches don't need adaptive behavior.
    DEFAULT_INITIAL_LIMIT = DEFAULT_MIN_WINDOW_SAMPLES

    # Hard ceiling on concurrency. Callers typically override
    # this via the `limit` parameter on `concurrently()`. The
    # high default avoids being an accidental bottleneck when
    # no explicit limit is given.
    DEFAULT_MAX_LIMIT = 1000

    # Default parameter values are documented below with
    # rationale for each choice.

    def __init__(
        self,
        *,
        initial_limit: int = DEFAULT_INITIAL_LIMIT,
        # Upper bound on concurrency. When `None`, uses
        # `DEFAULT_MAX_LIMIT`.
        max_limit: Optional[int] = None,
        # Floor of 1 ensures we always make progress.
        min_limit: int = 1,
        # Allow latency to increase by up to 50% before
        # reducing concurrency. This matches Netflix's default
        # and provides a reasonable tolerance band for the
        # natural variance of RPC latencies.
        rtt_tolerance: float = 1.5,
        # Smoothing factor for limit updates. 0.5 means each
        # window's calculated limit contributes 50% to the new
        # value. Netflix defaults to 0.2, but that's too
        # conservative for short-lived batches where we need to
        # ramp up (and back off) quickly. The EWMA on
        # `long_rtt` already smooths the input signal, so heavy
        # output smoothing would be double-dampening.
        smoothing: float = 0.5,
        # Proportional growth factor. Expected range:
        # `0 < growth_factor <= 1`. When the gradient is 1.0
        # (healthy), the growth term is
        # `growth_factor * current_limit`, giving exponential
        # ramp-up. With smoothing=0.5 and growth_factor=0.5,
        # the limit grows by ~25% per window when healthy.
        # Netflix uses a fixed additive `queue_size=4` instead,
        # which produces linear growth -- too slow for short
        # batches where we need to discover capacity quickly.
        growth_factor: float = 0.5,
        # Number of samples over which the long-term EWMA
        # averages. Decay factor = 2 / (long_window + 1) ≈
        # 0.02, giving a half-life of ~34 samples. Netflix
        # uses 600, but our batches are short-lived -- 600
        # samples would rarely be reached. 100 provides a
        # stable baseline achievable within a single
        # moderately-sized batch.
        long_window: int = 100,
        min_window_samples: int = DEFAULT_MIN_WINDOW_SAMPLES,
        # Optional callback invoked each time a window closes
        # and the limit is recalculated. Used by `concurrently`
        # to wire up per-window logging without coupling logging
        # concerns into the limiter itself.
        on_window_close: Optional[OnWindowClose] = None,
    ):
        max_limit = max_limit or self.DEFAULT_MAX_LIMIT

        assert initial_limit > 0
        assert max_limit > 0
        assert min_limit >= 1
        assert rtt_tolerance > 0
        assert 0 < smoothing <= 1
        assert 0 < growth_factor <= 1
        assert long_window > 0
        assert min_window_samples > 0

        # Don't start above the caller's upper bound.
        initial_limit = min(initial_limit, max_limit)
        initial_limit = max(initial_limit, min_limit)

        self._limit: float = float(initial_limit)
        self._max_limit = max_limit
        self._min_limit = min_limit
        self._rtt_tolerance = rtt_tolerance
        self._smoothing = smoothing
        self._growth_factor = growth_factor
        self._decay = 2.0 / (long_window + 1)
        self._min_window_samples = min_window_samples
        self._on_window_close = on_window_close

        # Long-term RTT baseline (EWMA). None until the first
        # window closes.
        self._long_rtt: Optional[float] = None

        # Current window's accumulated samples.
        self._window_samples: list[float] = []

    @property
    def limit(self) -> int:
        """Current effective concurrency limit, rounded to the
        nearest integer and clamped to [min_limit, max_limit]."""
        return max(self._min_limit, min(
            self._max_limit,
            round(self._limit),
        ))

    def on_sample(self, rtt: float) -> None:
        """Record a completed operation's round-trip time.

        Samples are accumulated into the current window. When
        the window reaches `min_window_samples`, the limit is
        recalculated and the window resets.
        """
        self._window_samples.append(rtt)

        if len(self._window_samples) >= self._min_window_samples:
            self._update_limit()
            self._window_samples.clear()

    def _update_limit(self) -> None:
        """Recalculate the concurrency limit from the current
        window's samples using the Gradient2 formula."""
        # Short-term RTT: average of the current window.
        short_rtt = sum(self._window_samples) / len(self._window_samples)

        if self._long_rtt is None:
            # First window: establish the long-term baseline.
            self._long_rtt = short_rtt
            return

        # Update long-term RTT with EWMA.
        previous_long_rtt = self._long_rtt
        self._long_rtt += (short_rtt - self._long_rtt) * self._decay

        # Gradient, clamped to [0.5, 1.0]; see "How it works"
        # in the class docstring.
        gradient = max(
            0.5,
            min(
                1.0,
                self._rtt_tolerance * previous_long_rtt / short_rtt,
            ),
        )

        # Proportional growth applied inside the gradient; see
        # "Growth strategy" in the class docstring.
        new_limit = gradient * self._limit * (1.0 + self._growth_factor)

        # Smooth the transition to dampen oscillation.
        self._limit = (
            (1 - self._smoothing) * self._limit + self._smoothing * new_limit
        )

        # Clamp to bounds.
        self._limit = max(
            float(self._min_limit),
            min(float(self._max_limit), self._limit),
        )

        if self._on_window_close is not None:
            self._on_window_close(
                limit=self.limit,
                long_rtt=self._long_rtt,
                short_rtt=short_rtt,
                gradient=gradient,
            )


# Default module-level logger, used when a `Log` instance does
# not specify a custom logger.
_default_logger = logging.getLogger(__name__)


@dataclass(frozen=True, kw_only=True)
class Log:
    """Logging configuration for `concurrently()`. All fields are
    optional."""

    # Human-readable description of the operation. If provided,
    # the generator's `__qualname__` is appended in parens. If
    # omitted, just `__qualname__` is used (or "concurrently" as
    # a last resort).
    label: Optional[str] = None
    # Override the default module-level logger.
    logger: Optional[logging.Logger] = None
    # Override the default log level (DEBUG).
    level: Optional[int] = None
    # When True, emit per-window messages (limit, RTT,
    # gradient) during execution. When False, only the final
    # summary is logged.
    verbose: bool = False


# The `log` parameter accepts either `True` (all defaults) or a
# `Log` instance for customization.
LogOption = Union[bool, Log]


class Concurrently(Generic[YieldT]):
    """Wrapper returned by `concurrently()` that supports both
    `async for` and `await`.

    `async for` yields items one at a time in completion
    order. `await` collects all items into a list. Both
    produce the same item type. In `for_each` mode, items
    are `(element, result)` tuples.
    """

    def __init__(
        self,
        callable_or_awaitables: CallableOrAwaitables,
        *,
        for_each: Optional[ForEach[Any]] = None,
        return_exceptions: bool,
        limit: Optional[int],
        adaptive: bool,
        log: Optional[LogOption],
    ):
        self._callable_or_awaitables = callable_or_awaitables
        self._for_each = for_each
        self._return_exceptions = return_exceptions
        self._limit = limit
        self._adaptive = adaptive
        self._log = log

    def __aiter__(self) -> AsyncGenerator[YieldT, None]:
        return _concurrently(
            self._callable_or_awaitables,
            for_each=self._for_each,
            return_exceptions=self._return_exceptions,
            limit=self._limit,
            adaptive=self._adaptive,
            log=self._log,
        )

    def __await__(self) -> Generator[Any, None, List[YieldT]]:

        async def _collect() -> List[YieldT]:
            results: List[YieldT] = []
            async for result in self:
                results.append(result)
            return results

        return _collect().__await__()


# --- `AsyncGenerator` mode overloads ---


@overload
def concurrently(
    awaitables: AsyncGenerator[Awaitable[ConcurrentlyResultT], None],
    *,
    return_exceptions: Literal[True],
    limit: Optional[int] = ...,
    adaptive: bool = ...,
    log: Optional[LogOption] = ...,
) -> Concurrently[Union[ConcurrentlyResultT, BaseException]]:
    ...


@overload
def concurrently(
    awaitables: AsyncGenerator[Awaitable[ConcurrentlyResultT], None],
    *,
    return_exceptions: Literal[False] = ...,
    limit: Optional[int] = ...,
    adaptive: bool = ...,
    log: Optional[LogOption] = ...,
) -> Concurrently[ConcurrentlyResultT]:
    ...


# --- `Iterable` mode overloads ---


@overload
def concurrently(
    awaitables: Iterable[Awaitable[ConcurrentlyResultT]],
    *,
    return_exceptions: Literal[True],
    limit: Optional[int] = ...,
    adaptive: bool = ...,
    log: Optional[LogOption] = ...,
) -> Concurrently[Union[ConcurrentlyResultT, BaseException]]:
    ...


@overload
def concurrently(
    awaitables: Iterable[Awaitable[ConcurrentlyResultT]],
    *,
    return_exceptions: Literal[False] = ...,
    limit: Optional[int] = ...,
    adaptive: bool = ...,
    log: Optional[LogOption] = ...,
) -> Concurrently[ConcurrentlyResultT]:
    ...


# --- `Callable` + `for_each` mode overloads ---


@overload
def concurrently(
    callable: Callable[[ElementT], Awaitable[ConcurrentlyResultT]],
    *,
    for_each: ForEach[ElementT],
    return_exceptions: Literal[True],
    limit: Optional[int] = ...,
    adaptive: bool = ...,
    log: Optional[LogOption] = ...,
) -> Concurrently[
    Tuple[
        ElementT,
        Union[ConcurrentlyResultT, BaseException],
    ],
]:
    ...


@overload
def concurrently(
    callable: Callable[[ElementT], Awaitable[ConcurrentlyResultT]],
    *,
    for_each: ForEach[ElementT],
    return_exceptions: Literal[False] = ...,
    limit: Optional[int] = ...,
    adaptive: bool = ...,
    log: Optional[LogOption] = ...,
) -> Concurrently[Tuple[ElementT, ConcurrentlyResultT]]:
    ...


# NOTE: mypy can't prove that the `Any`-based implementation
# signature accepts all `TypeVar` bounded overload signatures.
# This is standard for overloaded implementations — the
# overloads provide type safety for callers but we need
# `ignore[misc]` for the implementation.
def concurrently(  # type: ignore[misc]
    callable_or_awaitables: CallableOrAwaitables,
    *,
    for_each: Optional[ForEach[Any]] = None,
    return_exceptions: bool = False,
    limit: Optional[int] = None,
    adaptive: bool = True,
    log: Optional[LogOption] = None,
) -> Concurrently[Any]:
    """Concurrently execute awaitables with adaptive concurrency
    control.

    Two modes of operation:

    **AsyncGenerator mode** — pass an async generator of
    awaitables as the first argument::

        async for result in concurrently(
            generator(),
        ):
            ...

    **Callable + `for_each` mode** — pass a callable and an
    iterable. The callable is applied to each element, and
    results are yielded as `(element, result)` tuples::

        async for user_id, response in concurrently(
            lambda user_id: User.ref(user_id).get(context),
            for_each=user_ids,
        ):
            ...

    Both modes support `async for` and `await`. `await`
    collects all results into a list.

    By default, exceptions are raised immediately (like
    `asyncio.gather`). Pass `return_exceptions=True` to
    return exceptions as values instead: each item becomes
    `Union[result, BaseException]`, enabling mypy's
    `isinstance` narrowing for type-safe error handling.
    In `for_each` mode, items are
    `(element, Union[result, BaseException])` tuples.

    Pass `log=True` to enable logging with defaults, or a
    `Log` instance to customize.
    """
    return Concurrently(
        callable_or_awaitables,
        for_each=for_each,
        return_exceptions=return_exceptions,
        limit=limit,
        adaptive=adaptive,
        log=log,
    )


async def _iterable_to_async_generator(
    iterable: Iterable[Awaitable[Any]],
) -> AsyncGenerator[Awaitable[Any], None]:
    """Wrap a plain iterable of awaitables into an async
    generator so that `_concurrently` can consume it uniformly
    via `__anext__()`."""
    for item in iterable:
        yield item


async def _callable_to_async_generator(
    callable: Callable,
    for_each: Any,
) -> AsyncGenerator[Tuple[Any, Awaitable], None]:
    """Wrap a callable + iterable/async generator into an async
    generator that yields `(element, awaitable)` tuples. Used
    by `_concurrently` in `for_each` mode.

    Accepts both plain iterables (`for element in ...`) and
    async generators (`async for element in ...`). This allows
    lazy, streaming sources like database cursors or paginated
    APIs to be consumed on demand without materializing all
    elements into memory."""
    if hasattr(for_each, "__anext__"):
        async for element in for_each:
            yield element, callable(element)
    else:
        for element in for_each:
            yield element, callable(element)


async def _concurrently(
    callable_or_awaitables: CallableOrAwaitables,
    *,
    for_each: Optional[ForEach[Any]],
    return_exceptions: bool,
    limit: Optional[int],
    adaptive: bool,
    log: Optional[LogOption],
) -> AsyncGenerator:
    """Internal async generator that does the actual concurrent
    execution. See `concurrently()` for the public API."""
    # Determine the mode and build the async generator that
    # `fill()` will pull from.
    if for_each is not None:
        # Callable + `for_each` mode: `callable_or_awaitables` is a
        # callable, `for_each` is an iterable or async generator. We
        # wrap them into an async generator of (element, awaitable)
        # tuples and track elements alongside tasks.
        assert callable(callable_or_awaitables), (
            "When `for_each` is provided, the first argument "
            "must be a callable."
        )
        awaitables: AsyncGenerator = _callable_to_async_generator(
            callable_or_awaitables,
            for_each,
        )
        # Extract qualname from the callable for log labels.
        qualname = getattr(callable_or_awaitables, "__qualname__", None)
    else:
        # AsyncGenerator or iterable mode.
        # Extract qualname before potentially wrapping.
        qualname = getattr(callable_or_awaitables, "__qualname__", None)
        if hasattr(callable_or_awaitables, "__anext__"):
            # Already an async generator.
            awaitables = callable_or_awaitables  # type: ignore[assignment]
        else:
            # Plain iterable (e.g., list or generator
            # expression). Wrap it into an async generator.
            awaitables = _iterable_to_async_generator(
                callable_or_awaitables,  # type: ignore[arg-type]
            )

    # In `for_each` mode, map from task to its corresponding
    # element from the iterable so we can yield
    # (element, result) tuples.
    elements: dict[asyncio.Task, Any] = {}

    # Normalize `log=True` to a default `Log` instance.
    if log is True:
        log = Log()

    # Unpack the logging config. All fields are optional;
    # `logger` and `level` default to the module-level logger
    # and DEBUG respectively.
    if log is not None and log is not False:
        label = log.label
        # Build the log label: include the user's label and
        # the generator's `__qualname__` when available. The
        # qualname is always appended in parens for
        # traceability.
        if label is not None and qualname is not None:
            log_label = f"{label} ({qualname})"
        elif label is not None:
            log_label = label
        elif qualname is not None:
            log_label = qualname
        else:
            log_label = "concurrently"
        logger = log.logger or _default_logger
        log_level = log.level if log.level is not None else logging.DEBUG
        verbose = log.verbose
    else:
        log_label = None
        logger = None
        log_level = None
        verbose = False

    # Wire up per-window logging callback for the adaptive
    # limiter. Only enabled when `verbose=True`; otherwise
    # only the final summary is logged.
    on_window_close = None
    if logger is not None and verbose:

        def on_window_close(
            *,
            limit: int,
            long_rtt: float,
            short_rtt: float,
            gradient: float,
        ) -> None:
            assert logger is not None
            assert log_level is not None
            logger.log(
                log_level,
                "[%s] window: limit=%d long_rtt=%.1fms "
                "short_rtt=%.1fms gradient=%.2f",
                log_label,
                limit,
                long_rtt * 1000,
                short_rtt * 1000,
                gradient,
            )

    if adaptive:
        if limit is not None:
            assert limit > 0, f"`limit` must be positive, got {limit}"
        limiter = AdaptiveConcurrencyLimiter(
            max_limit=limit,
            on_window_close=on_window_close,
        )
    else:
        assert limit is not None, "`limit` is required when `adaptive=False`"
        assert limit > 0, f"`limit` must be positive, got {limit}"
        limiter = None

    def effective_limit() -> int:
        if limiter is not None:
            return limiter.limit
        assert limit is not None
        return limit

    pending: set[asyncio.Task[Any]] = set()
    # Map from task to its creation timestamp, used to measure RTT for
    # the adaptive limiter. We use `time.perf_counter` which on Linux
    # has nanosecond resolution (with some precision lost to float
    # representation) and uses a monotonically increasing clock —
    # important because we only care about elapsed duration, not
    # wall-clock time, and we never want a system clock adjustment to
    # produce a negative RTT.
    start_times: dict[asyncio.Task[Any], float] = {}
    exhausted = False

    # Statistics for the final log summary.
    total_count = 0
    error_count = 0
    rtt_min = float("inf")
    rtt_max = 0.0
    rtt_sum = 0.0
    initial_start_time = time.perf_counter()

    # Wrap the awaitable in a coroutine so we can pass it to
    # `asyncio.create_task`. We don't use `asyncio.ensure_future`
    # because according to the robot it only accepts coroutines
    # and `Future` objects, not arbitrary `Awaitable`s.
    async def run(awaitable: Awaitable[Any]) -> Any:
        return await awaitable

    async def fill() -> None:
        nonlocal exhausted
        while len(pending) < effective_limit() and not exhausted:
            try:
                item = await awaitables.__anext__()
            except StopAsyncIteration:
                exhausted = True
                break

            if for_each is not None:
                # In `for_each` mode, the generator yields
                # (element, awaitable) tuples.
                element, awaitable = item
            else:
                element = None
                awaitable = item

            task = asyncio.create_task(run(awaitable))

            pending.add(task)

            if for_each is not None:
                elements[task] = element

            if limiter is not None:
                start_times[task] = time.perf_counter()

    try:
        await fill()

        while len(pending) > 0:
            done, _ = await asyncio.wait(
                pending,
                return_when=asyncio.FIRST_COMPLETED,
            )
            for task in done:
                pending.discard(task)

                total_count += 1

                # Record RTT for the adaptive limiter.
                if limiter is not None:
                    start_time = start_times.pop(task)
                    rtt = time.perf_counter() - start_time
                    limiter.on_sample(rtt)
                    if logger is not None:
                        rtt_min = min(rtt_min, rtt)
                        rtt_max = max(rtt_max, rtt)
                        rtt_sum += rtt

                # Retrieve the element for `for_each` mode.
                element = elements.pop(task) if for_each is not None else None

                exception = task.exception()
                if exception is not None:
                    error_count += 1

                if return_exceptions:
                    # Yield result or exception directly (matching
                    # `asyncio.gather`). In `for_each` mode, pair with
                    # the element. This enables mypy's `isinstance`
                    # narrowing: after `if isinstance(result,
                    # BaseException)` the else branch knows `result`
                    # is the result type.
                    if for_each is not None:
                        yield element, exception or task.result()
                    else:
                        yield exception or task.result()
                else:
                    if exception is not None:
                        raise exception
                    if for_each is not None:
                        yield element, task.result()
                    else:
                        yield task.result()

                # NOTE: this implementation deliberately waits to call
                # `fill()` until _after_ control has been returned
                # from the caller so that if their loop body is very
                # slow we will not potentially grow the `pending`
                # indefinitely.
                #
                # With the adaptive limiter, `fill()` re-reads
                # `effective_limit()` each time, so limit changes from
                # `on_sample()` above take effect immediately, but not
                # until after the loop body has yielded control.
                #
                # TODO: consider adding the ability for the caller to
                # pass a setting to override this behavior, i.e., to
                # support filling immediately after a task has
                # completed rather than after the loop body has run.
                await fill()
    finally:
        # Cancel outstanding tasks if the caller stops iterating
        # early, e.g., due to a `break` or raising an exception.
        if len(pending) > 0:
            for task in pending:
                task.cancel()

            # Use `return_exceptions=True` so that
            # `CancelledError` from the cancelled tasks is
            # swallowed rather than propagated to the caller.
            await asyncio.gather(*pending, return_exceptions=True)

        # Log a summary.
        if logger is not None:
            assert log_level is not None
            elapsed = time.perf_counter() - initial_start_time
            if limiter is not None and total_count > 0:
                avg_rtt = rtt_sum / total_count
                logger.log(
                    log_level,
                    "[%s] done: %d completed, %d errors, "
                    "%.1fms elapsed, avg_rtt=%.1fms, "
                    "min_rtt=%.1fms, max_rtt=%.1fms, "
                    "final_limit=%d",
                    log_label,
                    total_count,
                    error_count,
                    elapsed * 1000,
                    avg_rtt * 1000,
                    rtt_min * 1000,
                    rtt_max * 1000,
                    limiter.limit,
                )
            else:
                logger.log(
                    log_level,
                    "[%s] done: %d completed, %d errors, "
                    "%.1fms elapsed",
                    log_label,
                    total_count,
                    error_count,
                    elapsed * 1000,
                )
