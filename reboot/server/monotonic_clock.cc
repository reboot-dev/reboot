#include "reboot/server/monotonic_clock.h"

#include <algorithm>
#include <string>
#include <string_view>
#include <utility>

#include "fmt/format.h"
#include "glog/logging.h"
#include "google/protobuf/util/time_util.h"
#include "rocksdb/db.h"
#include "rocksdb/options.h"
#include "rocksdb/slice.h"
#include "rocksdb/status.h"

template <class T, class E = std::string>
using expected = tl::expected<T, E>;

using tl::make_unexpected;

////////////////////////////////////////////////////////////////////////

namespace rbt::server {

////////////////////////////////////////////////////////////////////////

using ::google::protobuf::util::TimeUtil;

////////////////////////////////////////////////////////////////////////

namespace {

////////////////////////////////////////////////////////////////////////

// How often the background flusher wakes up to persist a new durable
// high water mark. In the normal state the flusher keeps the high
// water mark a "reservation window" ahead of the monotonic
// wall-clock; in the "stuck" state (post-restart with a rewound
// system clock) it intentionally does nothing until the monotonic
// wall-clock catches up.
constexpr std::chrono::seconds kFlushInterval{1};

////////////////////////////////////////////////////////////////////////

// How long beyond the current monotonic wall-clock reading to
// "reserve" for the high water mark. The goal is to keep the high
// water mark safely above the wall-clock in normal operations, so
// that `Now()` returns the wall-clock reading rather than then being
// forced to return the current high water mark because we are waiting
// for a new high water mark to be persisted. We've choosen 2 seconds
// to also bound the worst-case scenario on restart where we'd be
// forced to return the current high water mark while waiting for the
// monotonic wall-clock to catch up (in practice, restarting the
// process will take more than 2 seconds so we'll always have a
// monotonic wall-clock that has advanced past the last persisted high
// water mark).
constexpr std::chrono::nanoseconds kHighWaterMarkReservation =
    std::chrono::seconds(2);

////////////////////////////////////////////////////////////////////////

// Key where the persisted high water mark lives in the database.
constexpr std::string_view kMonotonicClockHighWaterMarkKey =
    "monotonic_clock_high_water_mark";

////////////////////////////////////////////////////////////////////////

// Reads the persisted high water mark from `db`. Returns
// `std::nullopt` when the key is absent — which happens for brand-new
// databases (and databases created before this mechanism was
// introduced).
//
// We use a serialized `google::protobuf::Timestamp` representation
// rather than coming up with our own serialization mechanism.
expected<std::optional<std::chrono::nanoseconds>> ReadHighWaterMark(
    rocksdb::DB& db) {
  std::string serialized_high_water_mark;

  rocksdb::Status status = db.Get(
      rocksdb::ReadOptions(),
      kMonotonicClockHighWaterMarkKey,
      &serialized_high_water_mark);

  if (status.IsNotFound()) {
    return std::optional<std::chrono::nanoseconds>{};
  }

  if (!status.ok()) {
    return make_unexpected(
        fmt::format(
            "Failed to read monotonic clock high water mark: {}",
            status.ToString()));
  }

  google::protobuf::Timestamp high_water_mark;

  if (!high_water_mark.ParseFromString(std::move(serialized_high_water_mark))) {
    return make_unexpected(
        "Failed to parse persisted monotonic clock high water mark");
  }

  return std::optional<std::chrono::nanoseconds>{std::chrono::nanoseconds(
      TimeUtil::TimestampToNanoseconds(high_water_mark))};
}

// Writes the `high_water_mark` to `db`.
expected<void> WriteHighWaterMark(
    rocksdb::DB& db,
    std::chrono::nanoseconds high_water_mark) {
  const google::protobuf::Timestamp high_water_mark_timestamp =
      TimeUtil::NanosecondsToTimestamp(high_water_mark.count());

  std::string serialized_high_water_mark;
  if (!high_water_mark_timestamp.SerializeToString(
          &serialized_high_water_mark)) {
    return make_unexpected(
        fmt::format(
            "Failed to serialize monotonic clock high water mark: {}",
            high_water_mark_timestamp.ShortDebugString()));
  }

  rocksdb::WriteOptions write_options;

  // Without fsync, the write could be left in the kernel page cache
  // and lost on a machine crash; `Now()` might then have already
  // returned values above what survives on disk, breaking the
  // durability invariant on the next restart!
  write_options.sync = true;

  rocksdb::Status status = db.Put(
      write_options,
      rocksdb::Slice(kMonotonicClockHighWaterMarkKey),
      rocksdb::Slice(serialized_high_water_mark));

  if (!status.ok()) {
    return make_unexpected(
        fmt::format(
            "Failed to write monotonic clock high water mark: {}",
            status.ToString()));
  }

  return {};
}

}  // namespace

////////////////////////////////////////////////////////////////////////

void MonotonicClock::Start(std::chrono::nanoseconds initial_high_water_mark) {
  CHECK(!running_.load(std::memory_order_acquire))
      << "MonotonicClock has already been started!";

  high_water_mark_.store(initial_high_water_mark, std::memory_order_release);

  last_returned_.store(initial_high_water_mark, std::memory_order_release);

  // Store `running_` last with release semantics so that any thread
  // observing `running_ == true` (via acquire) is guaranteed to see
  // the initialized atomics above.
  running_.store(true, std::memory_order_release);
}

////////////////////////////////////////////////////////////////////////

expected<void> MonotonicClock::Start(stout::borrowed_ref<rocksdb::DB>&& db) {
  CHECK(!running_.load(std::memory_order_acquire))
      << "MonotonicClock has already been started!";

  // Read or bootstrap the last persisted high water mark. This is the
  // linchpin of cross-restart monotonicity: every timestamp returned
  // by any prior incarnation of this database was `<=` the persisted
  // high water mark at that moment, so using it guarantees `Now()`
  // returns values `>=` anything any prior incarnation returned.
  expected<std::optional<std::chrono::nanoseconds>> persisted =
      ReadHighWaterMark(*db);

  if (!persisted.has_value()) {
    return make_unexpected(std::move(persisted).error());
  }

  std::chrono::nanoseconds initial_high_water_mark;

  if (persisted->has_value()) {
    initial_high_water_mark = **persisted;
  } else {
    // No persisted high water mark: either a brand-new database or
    // one created before the monotonic clock existed. Synthesize an
    // initial value from the derived monotonic wall-clock and persist
    // it so we ensure the invariant that the persisted high water
    // mark >= anything ever returned holds from the very first call.
    initial_high_water_mark =
        MonotonicWallClockNow() + kHighWaterMarkReservation;

    expected<void> write = WriteHighWaterMark(*db, initial_high_water_mark);

    if (!write.has_value()) {
      return make_unexpected(
          fmt::format(
              "Failed to bootstrap monotonic clock high water mark: {}",
              write.error()));
    }
  }

  // Now start the clock with the persisted high water mark.
  Start(initial_high_water_mark);

  db_ = std::move(db);

  // Catch the high water mark up to the monotonic wall-clock before
  // any caller can observe `Now()`. If the database was down long
  // enough that the persisted high water mark is now behind the
  // current wall-clock, `Now()` would otherwise return the stale
  // persisted high water mark until the flusher has waited the flush
  // interval. In the event that the clock was rewound, then `Flush()`
  // will be a no-op because the existing persisted high water mark
  // will be sufficiently ahead.
  Flush();

  flush_thread_ = std::thread([this]() {
    while (true) {
      {
        std::unique_lock<std::mutex> lock(flush_condition_mutex_);
        if (flush_condition_.wait_for(lock, kFlushInterval, [this] {
              return flush_stop_.load();
            })) {
          break;
        }
      }
      Flush();
    }
  });

  return {};
}

////////////////////////////////////////////////////////////////////////

void MonotonicClock::Stop() {
  // Idempotent: if the clock was never started (or was already
  // stopped) there's nothing to do.
  if (!running_.load(std::memory_order_acquire)) {
    return;
  }

  // Stop the flusher thread (only started via the `Start(db)`
  // overload).
  if (flush_thread_.joinable()) {
    {
      std::lock_guard lock(flush_condition_mutex_);
      flush_stop_.store(true);
    }
    flush_condition_.notify_one();
    flush_thread_.join();
  }

  if (db_.has_value()) {
    db_.reset();
  }

  running_.store(false, std::memory_order_release);
}

////////////////////////////////////////////////////////////////////////

void MonotonicClock::Flush() {
  CHECK(db_.has_value());

  // Serialize against any concurrent `Now(strict=true)` writer(s).
  std::lock_guard lock(high_water_mark_write_mutex_);

  // Compute inside the lock so the current high water mark read by
  // `NextHighWaterMark()` is the true current value (no concurrent
  // writer can be advancing it while we hold the lock).
  const std::chrono::nanoseconds next_high_water_mark = NextHighWaterMark();

  const std::chrono::nanoseconds high_water_mark =
      high_water_mark_.load(std::memory_order_acquire);

  // Skip when the next high water mark does not advance the
  // current one. This is the rewound-clock "stuck" state, where
  // `NextHighWaterMark()` deliberately returns the current high
  // water mark while we are waiting for the monotonic wall-clock
  // to catch up. (No concurrent `Now(strict=true)` writer can
  // advance the mark while we hold `high_water_mark_write_mutex_`.)
  if (next_high_water_mark <= high_water_mark) {
    return;
  }

  expected<void> write = WriteHighWaterMark(**db_, next_high_water_mark);

  if (write.has_value()) {
    high_water_mark_.store(next_high_water_mark, std::memory_order_release);
  } else {
    // TODO: we'll try again after the next interval, but maybe we
    // should try again sooner?
    LOG(WARNING) << "Failed to flush monotonic clock high water mark: "
                 << write.error();
  }
}

////////////////////////////////////////////////////////////////////////

std::chrono::nanoseconds MonotonicClock::MonotonicWallClockNow() const {
  // Derive a monotonic wall-clock `now`, i.e., a duration since the
  // Unix epoch that is guaranteed not to go backward for the lifetime
  // of this process, by computing a `delta` from the (monotonic)
  // steady clock that we add to `base_system_`.
  const auto delta = steady_now_() - base_steady_;
  const auto now = base_system_.time_since_epoch() + delta;
  return std::chrono::duration_cast<std::chrono::nanoseconds>(now);
}

////////////////////////////////////////////////////////////////////////

MonotonicClock::Timestamp MonotonicClock::Now(bool strict) {
  CHECK(running_.load(std::memory_order_acquire))
      << "MonotonicClock has not yet been started!";

  while (true) {
    // Start by assuming in the normal case that we'll just be
    // returning the monotonic wall-clock value.
    std::chrono::nanoseconds now = MonotonicWallClockNow();

    // But we can't return something above our persisted high water
    // mark otherwise we'll break our invariant!
    //
    // This is unlikely to happen but may occur if the flusher has
    // been stalled or failed and will retry.
    const std::chrono::nanoseconds high_water_mark =
        high_water_mark_.load(std::memory_order_acquire);

    now = std::min(now, high_water_mark);

    // And we also can't return anything that is less than the last
    // value we returned! This is important in two scenarios:
    //
    // (1) The rewound-clock "stuck" state, where `now` may be smaller
    // than the high water mark but ALSO smaller than the last
    // returned value when it is actually equal to the initial high
    // water mark when we start! We need to make sure that we continue
    // to return that initial high water mark until the wall-clock
    // catches up to ensure we uphold our invariant of never returning
    // a non-decreasing value.
    //
    // (2) In the normal state, we may have more than one concurrent
    // call to `Now()` and because we are lock-free each one will get
    // it's own `MonotonicWallClockNow()` so we need to ensure that we
    // return non-decreasing values.
    std::chrono::nanoseconds last_returned =
        last_returned_.load(std::memory_order_acquire);

    now = std::max(now, last_returned);

    // In the strict case we additionally force a
    // millisecond-granularity advance beyond `last_returned` whenever
    // necessary, so concurrent callers (or repeated calls within a
    // single millisecond) observe strictly increasing milliseconds.
    if (strict
        && std::chrono::floor<std::chrono::milliseconds>(now)
            <= std::chrono::floor<std::chrono::milliseconds>(last_returned)) {
      now = std::chrono::floor<std::chrono::milliseconds>(last_returned)
          + std::chrono::milliseconds(1);
    }

    // If the strict advance pushed us above the current high water
    // mark, we must persist a new high water mark.
    //
    // This runs under `high_water_mark_write_mutex_` so that it's
    // serialized against the flusher and any other concurrent
    // `Now(strict=true)` callers. Without that serialization, two
    // writers could each fsync + publish their own computed value in
    // opposite order and leave the last persisted high water mark
    // smaller than what `high_water_mark_` briefly reported.
    if (now > high_water_mark) {
      CHECK(db_.has_value()) << "Now(strict=true) would exceed the "
                             << "high water mark and must persist a new "
                             << "one, but the clock has no database";
      {
        std::lock_guard lock(high_water_mark_write_mutex_);
        // Re-read inside the lock: another writer (the flusher, or
        // another `Now(strict=true)` caller) may have advanced the
        // high water mark past our computed `now` while we were
        // contending for the lock, in which case we should just try
        // to determine a new `now` again!
        if (now > high_water_mark_.load(std::memory_order_acquire)) {
          const std::chrono::nanoseconds new_high_water_mark =
              now + kHighWaterMarkReservation;

          expected<void> write = WriteHighWaterMark(**db_, new_high_water_mark);

          if (!write.has_value()) {
            LOG(WARNING)
                << "Failed to advance monotonic clock high water mark: "
                << write.error();
            // We'll try again! Possibly forever!
            continue;
          }

          high_water_mark_.store(
              new_high_water_mark,
              std::memory_order_release);
        }
      }
      // Retry with the advanced high water mark (that either we or
      // someone else advanced).
      continue;
    }

    if (last_returned_.compare_exchange_weak(
            last_returned,
            now,
            std::memory_order_release,
            std::memory_order_acquire)) {
      return now;
    }
    // Lost the compare-and-swap, i.e., another caller advanced
    // `last_returned_` before us. Loop to try again!
  }
}

////////////////////////////////////////////////////////////////////////

std::chrono::nanoseconds MonotonicClock::NextHighWaterMark() const {
  CHECK(running_.load(std::memory_order_acquire))
      << "MonotonicClock has not yet been started!";

  // Using `std::max` here so we don't decrease the high water mark
  // if after a restart the wall-clock has been rewound.
  return std::max(
      high_water_mark_.load(std::memory_order_acquire),
      MonotonicWallClockNow() + kHighWaterMarkReservation);
}

////////////////////////////////////////////////////////////////////////

void MonotonicClock::TestOnly_SetHighWaterMark(
    std::chrono::nanoseconds high_water_mark) {
  CHECK(running_.load(std::memory_order_acquire))
      << "MonotonicClock has not yet been started!";

  high_water_mark_.store(high_water_mark, std::memory_order_release);
}

////////////////////////////////////////////////////////////////////////

}  // namespace rbt::server

////////////////////////////////////////////////////////////////////////
