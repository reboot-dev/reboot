#include <atomic>
#include <chrono>

#include "gtest/gtest.h"
#include "reboot/server/monotonic_clock.h"

////////////////////////////////////////////////////////////////////////

namespace rbt::server {
namespace {

////////////////////////////////////////////////////////////////////////

// Shared base `system_clock::now()` used by every test.
const auto kSystemNow = std::chrono::system_clock::now();

////////////////////////////////////////////////////////////////////////

// A fake `steady_clock` used in the `steady_now` lambda we hand to
// `MonotonicClock`'s constructor.
class FakeSteadyClock final {
 public:
  std::chrono::steady_clock::time_point Now() const {
    return now_.load(std::memory_order_acquire);
  }

  void Advance(std::chrono::nanoseconds delta) {
    now_.store(Now() + delta, std::memory_order_release);
  }

 private:
  std::atomic<std::chrono::steady_clock::time_point> now_{
      std::chrono::steady_clock::time_point{std::chrono::seconds{1'000}}};
};

////////////////////////////////////////////////////////////////////////

// When the monotonic wall-clock runs ahead of the high water mark,
// `Now()` pins at the high water mark rather than exceeding it.
TEST(MonotonicClockTest, NowBoundedAboveByHighWaterMark) {
  FakeSteadyClock steady;

  // Start the clock with a high water mark that is equal to the
  // monotonic wall-clock.
  const auto initial_high_water_mark = kSystemNow.time_since_epoch();

  MonotonicClock clock(kSystemNow, [&]() { return steady.Now(); });

  clock.Start(initial_high_water_mark);

  // Advance the monotonic wall-clock well past the high water
  // mark.
  steady.Advance(std::chrono::hours{1});

  // Ensure `Now()` returns the high water mark.
  EXPECT_EQ(clock.Now(), initial_high_water_mark);
}

////////////////////////////////////////////////////////////////////////

// In steady state when the monotonic wall-clock remains below the
// high water mark `Now()` tracks the monotonic wall-clock at
// nanosecond resolution.
TEST(MonotonicClockTest, NowTracksWallClockInSteadyState) {
  FakeSteadyClock steady;

  // Start the clock with a high water mark that is equal to the
  // monotonic wall-clock.
  const auto initial_high_water_mark = kSystemNow.time_since_epoch();

  MonotonicClock clock(kSystemNow, [&]() { return steady.Now(); });

  clock.Start(initial_high_water_mark);

  // Simulate a background flush.
  const auto next_high_water_mark = clock.NextHighWaterMark();
  clock.TestOnly_SetHighWaterMark(next_high_water_mark);

  auto previous = clock.Now();

  EXPECT_EQ(previous, initial_high_water_mark);

  for (size_t i = 0; i < 100; ++i) {
    steady.Advance(std::chrono::nanoseconds{1});
    const auto now = clock.Now();
    EXPECT_GT(now, previous);
    EXPECT_LT(now, next_high_water_mark);
    previous = now;
  }
}

////////////////////////////////////////////////////////////////////////

// After a "restart" whose monotonic wall-clock has been rewound,
// `Now()` keeps returning the high water mark until the flusher
// (simulated here by `TestOnly_SetHighWaterMark`) advances it.
TEST(MonotonicClockTest, RewoundWallClockPinsAtHighWaterMark) {
  FakeSteadyClock steady;

  // Start the clock simulating a rewound monotonic wall-clock by
  // using an initial high water mark that is far into the future.
  const auto initial_high_water_mark =
      kSystemNow.time_since_epoch() + std::chrono::seconds{60};

  MonotonicClock clock(kSystemNow, [&]() { return steady.Now(); });

  clock.Start(initial_high_water_mark);

  for (size_t i = 0; i < 100; ++i) {
    steady.Advance(std::chrono::milliseconds{10});
    EXPECT_EQ(clock.Now(), initial_high_water_mark);
  }

  // If the flusher was running it would also see a next high water
  // mark that is pinned to the initial high water mark.
  const auto next_high_water_mark = clock.NextHighWaterMark();
  EXPECT_EQ(next_high_water_mark, initial_high_water_mark);
}

////////////////////////////////////////////////////////////////////////

// Tests that a slow flusher means `Now()` returns the high water mark
// until the next high water mark is made durable.
TEST(MonotonicClockTest, SlowFlusherPinsAtHighWaterMark) {
  FakeSteadyClock steady;

  // Start the clock with a high water mark that is equal to the
  // monotonic wall-clock.
  const auto initial_high_water_mark = kSystemNow.time_since_epoch();

  MonotonicClock clock(kSystemNow, [&]() { return steady.Now(); });

  clock.Start(initial_high_water_mark);

  // Advance `steady_clock` well past the high water mark simulating a
  // flusher that has been stalled or failed for some reason.
  steady.Advance(std::chrono::seconds{10});

  // `Now()` should be pinned at high water mark.
  EXPECT_EQ(clock.Now(), initial_high_water_mark);

  // Advance further; `Now()` still pinned.
  steady.Advance(std::chrono::seconds{10});
  EXPECT_EQ(clock.Now(), initial_high_water_mark);

  // Now simulate a flusher cycle.
  const auto next_high_water_mark = clock.NextHighWaterMark();
  EXPECT_GT(next_high_water_mark, initial_high_water_mark);
  clock.TestOnly_SetHighWaterMark(next_high_water_mark);

  // `Now()` should now return a value larger than the initial high
  // water mark, but less than the new/next high water mark.
  const auto now = clock.Now();
  EXPECT_GT(now, initial_high_water_mark);
  EXPECT_LE(now, next_high_water_mark);
}

////////////////////////////////////////////////////////////////////////

// `Now(strict=true)` returns values that are strictly greater at
// millisecond granularity than any previous `Now()` return.
TEST(MonotonicClockTest, StrictAdvancesByAtLeastOneMillisecond) {
  FakeSteadyClock steady;

  // Make the system clock (and thus the initial high water mark) be
  // millisecond floored so that we can do `Now(strict=true)` calls
  // and not have to worry about nanoseconds.
  const auto system_now =
      std::chrono::time_point_cast<std::chrono::milliseconds>(kSystemNow);

  const auto initial_high_water_mark = system_now.time_since_epoch();

  MonotonicClock clock(system_now, [&]() { return steady.Now(); });

  clock.Start(initial_high_water_mark);

  // `Now()` should return the pinned initial high water mark since
  // the steady clock has not been advanced.
  EXPECT_EQ(clock.Now(), initial_high_water_mark);

  // Now simulate a flusher cycle.
  const auto next_high_water_mark = clock.NextHighWaterMark();
  EXPECT_GT(next_high_water_mark, initial_high_water_mark);
  clock.TestOnly_SetHighWaterMark(next_high_water_mark);

  // `Now()` should _still_ return the pinned initial high water mark
  // since the steady clock has not been advanced.
  auto now = clock.Now();
  EXPECT_EQ(now, initial_high_water_mark);

  // But `Now(strict=true)` should return a timestamp that is 1
  // millisecond advanced! And below the new/next high water mark.
  now = clock.Now(/* strict = */ true);
  EXPECT_EQ(now, initial_high_water_mark + std::chrono::milliseconds(1));
  EXPECT_LT(now, next_high_water_mark);

  // A non-strict call afterward must observe the advance made by the
  // strict calls (non-decreasing across all calls).
  now = clock.Now();
  EXPECT_EQ(now, initial_high_water_mark + std::chrono::milliseconds(1));

  // And another `Now(strict=true)` should return a timestamp that is
  // again 1 millisecond advanced, 2 milliseconds total from the
  // initial high water mark.
  now = clock.Now(/* strict = */ true);
  EXPECT_EQ(now, initial_high_water_mark + std::chrono::milliseconds(2));
  EXPECT_LT(now, next_high_water_mark);
}

////////////////////////////////////////////////////////////////////////

// Methods CHECK-fail when called before `Start()` — this catches the
// programmer error of using the clock in its
// constructed-but-not-started state. Using `EXPECT_DEATH` because
// these are unrecoverable CHECKs.
TEST(MonotonicClockDeathTest, MethodsRequireStart) {
  FakeSteadyClock steady;

  MonotonicClock clock(kSystemNow, [&]() { return steady.Now(); });

  EXPECT_DEATH({ clock.Now(); }, "not yet been started");
  EXPECT_DEATH({ clock.NextHighWaterMark(); }, "not yet been started");
}

////////////////////////////////////////////////////////////////////////

TEST(MonotonicClockDeathTest, DoubleStartFails) {
  FakeSteadyClock steady;

  MonotonicClock clock(kSystemNow, [&]() { return steady.Now(); });

  clock.Start(kSystemNow.time_since_epoch());

  EXPECT_DEATH(
      { clock.Start(kSystemNow.time_since_epoch()); },
      "already been started");
}

////////////////////////////////////////////////////////////////////////

}  // namespace
}  // namespace rbt::server

////////////////////////////////////////////////////////////////////////
