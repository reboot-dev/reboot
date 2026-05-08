#pragma once

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <functional>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <thread>

#include "google/protobuf/timestamp.pb.h"
#include "google/protobuf/util/time_util.h"
#include "stout/borrowed_ptr.h"
#include "tl/expected.hpp"

////////////////////////////////////////////////////////////////////////

namespace rocksdb {
class DB;
}  // namespace rocksdb

////////////////////////////////////////////////////////////////////////

namespace rbt::server {

////////////////////////////////////////////////////////////////////////

// A clock that returns `google::protobuf::Timestamp` values from
// `Now()` that are monotonically non-decreasing both within a process
// and across process restarts. Callers can safely use the returned
// timestamps to seed ordering-sensitive structures (e.g., UUIDv7
// transaction IDs, restart-detection timestamps, etc) without
// worrying about system-clock regressions from NTP step corrections,
// VM restores, or manual clock adjustments.
//
// The clock combines two main mechanisms:
//
//  1. A monotonic wall-clock derived from a one-time
//     `system_clock::now()` base plus a running `steady_clock::now()`
//     delta. This is immune to NTP step corrections during the
//     lifetime of a process because `steady_clock` is guaranteed
//     never to go backward.
//
//  2. A durable "high water mark" that is always ahead of any
//     timestamp returned.
//
// Lifecycle:
//   * Construct the clock (optionally injecting a fake `system_now`
//     and `steady_now` for testing). All other methods CHECK-fail
//     until `Start()` has been called; the clock is not usable in its
//     constructed state.
//
//   * Call one of the `Start()` overloads to bring the clock
//     into its "running" state:
//
//       - `Start(initial_high_water_mark)` seeds the
//         `high_water_mark` directly. Intended for tests — no
//         database is used and no background flusher is launched, so
//         the cross-restart durability guarantees do not apply.
//
//       - `Start(db)` reads or bootstraps the last persisted high
//         water mark from `db` and launches a background flusher to
//         keep the high water mark above the monotonic
//         wall-clock. Intended for production.
//
//   * Call `Stop()` (which, if started with a `db`, stops the
//     background flusher and releases the `db` borrow). The
//     destructor also calls `Stop()`. After `Stop()` the clock is
//     back in a non-running state and all methods CHECK-fail again.
//
// Thread-safety: `Now()` is safe to call concurrently from any
// number of threads once the clock is running. `Start()` and
// `Stop()` are not safe to call concurrently with each other.
// `Start()` CHECK-fails if the clock is already running;
// `Stop()` is idempotent.
class MonotonicClock final {
 public:
  // A duration since the Unix epoch returned by `Now()`. Inherits
  // from `std::chrono::nanoseconds` so all the usual chrono
  // arithmetic / comparison / `duration_cast` operations work
  // directly, and adds an implicit conversion to
  // `google::protobuf::Timestamp` so the value can be handed
  // straight to protobuf-typed APIs.
  class Timestamp final : public std::chrono::nanoseconds {
   public:
    // Allow converting from a plain `std::chrono::nanoseconds`
    // (which is what the clock produces internally). Coarser-
    // precision durations like `std::chrono::seconds` also
    // implicitly convert to `nanoseconds` first via the standard
    // chrono conversion rules, so they match this constructor
    // too.
    /*implicit*/ Timestamp(std::chrono::nanoseconds value)
      : std::chrono::nanoseconds(value) {}

    // Convert to a protobuf `Timestamp` on demand (e.g., so
    // `Now()`'s result can be assigned straight to
    // `response->mutable_timestamp()`).
    operator google::protobuf::Timestamp() const {
      return google::protobuf::util::TimeUtil::NanosecondsToTimestamp(count());
    }
  };

  MonotonicClock(
      // `system_now` provides a one-time base from which to derive
      //  the monotonic wall-clock.
      std::chrono::system_clock::time_point system_now =
          std::chrono::system_clock::now(),
      // `steady_now` enables us to determine the delta of time to add
      // to `system_now` to derive the monotonic wall-clock. Can be
      // overridden for testing purposes, but must always be
      // monotonicly non-decreasing.
      std::function<std::chrono::steady_clock::time_point()> steady_now =
          []() { return std::chrono::steady_clock::now(); })
    : steady_now_(std::move(steady_now)),
      base_system_(system_now),
      base_steady_(steady_now_()) {}

  ~MonotonicClock() {
    Stop();
  }

  MonotonicClock(const MonotonicClock&) = delete;
  MonotonicClock& operator=(const MonotonicClock&) = delete;

  // Seeds the high water mark directly with `initial_high_water_mark`
  // and marks the clock running. Intended for unit tests that want to
  // exercise `Now()` behavior without providing a handle to a running
  // database.
  //
  // `initial_high_water_mark` is a nanosecond duration since the
  // Unix epoch.
  //
  // CHECK-fails if the clock is already running.
  void Start(std::chrono::nanoseconds initial_high_water_mark);

  // Reads the persisted high water mark from `db` (or synthesizes and
  // durably writes a new one if the key is absent) and launches the
  // background flusher.
  //
  // Returns an error if reading or bootstrapping the persisted value
  // fails.
  //
  // CHECK-fails if the clock is already running.
  tl::expected<void, std::string> Start(stout::borrowed_ref<rocksdb::DB>&& db);

  // Stops the clock (if the clock was started with a database handle
  // it also stops the background flusher and releases the borrow).
  //
  // Upon returning the clock is back to its non-running state i.e.,
  // subsequent `Now()`, etc, calls will CHECK-fail until the clock is
  // started again.
  //
  // Idempotent; also called by the destructor.
  void Stop();

  // Returns a timestamp that is:
  //
  //   * Non-decreasing across every call on this clock (including
  //     across prior incarnations of the clock in previous processes
  //     when started via `Start(db)`);
  //
  //   * Less than or equal to the last persisted high water mark.
  //
  // CHECK-fails if the clock is not running.
  //
  // When `strict` is true, the returned timestamp is additionally
  // guaranteed to be strictly greater (at millisecond granularity)
  // than any timestamp previously returned by `Now()`.
  //
  // `strict=true` is NOT suitable for hot paths as it might require a
  // synchrounous database write. Moreover, be aware that multiple
  // calls within the same millisecond may advance apparent time
  // faster than real time.
  //
  // `strict=false` (the default) is the lock-free, non-decreasing
  // hot-path behavior with no possibility of a synchronous write.
  Timestamp Now(bool strict = false);

  // Returns the next high water mark that the background flusher
  // would persist given the current derived monotonic wall-clock and
  // the last persisted high water mark.
  //
  // CHECK-fails if the clock is not running.
  std::chrono::nanoseconds NextHighWaterMark() const;

  // Test-only ability to update the high water mark. Useful for tests
  // that want to simulate high water marks that the background
  // flusher would otherwise be persisting.
  //
  // CHECK-fails if the clock is not running.
  void TestOnly_SetHighWaterMark(std::chrono::nanoseconds high_water_mark);

 private:
  // Derives the monotonic wall-clock "now" since the Unix epoch from
  // the saved base system now and the steady delta.
  std::chrono::nanoseconds MonotonicWallClockNow() const;

  // Flushes the new high water mark to the database.
  void Flush();

  std::function<std::chrono::steady_clock::time_point()> steady_now_;
  const std::chrono::system_clock::time_point base_system_;
  const std::chrono::steady_clock::time_point base_steady_;

  std::atomic<std::chrono::nanoseconds> high_water_mark_{
      std::chrono::nanoseconds::zero()};
  std::atomic<std::chrono::nanoseconds> last_returned_{
      std::chrono::nanoseconds::zero()};

  // Set by `Start(db)`; held until `Stop()`. Empty when the clock
  // was started via the test-only `Start(nanoseconds)` overload.
  std::optional<stout::borrowed_ref<rocksdb::DB>> db_;

  // Background flusher state. `flush_thread_` and the condition
  // variable are only used when the clock was started via
  // `Start(db)`.
  std::thread flush_thread_;
  std::atomic<bool> flush_stop_{false};
  std::condition_variable flush_condition_;
  std::mutex flush_condition_mutex_;

  // Serializes all writes of the high water mark. Necessary to
  // serialize concurrent `Now(strict)` calls (where `strict` is true)
  // and/or concurrent background flushes which may each try to store
  // a new high water mark. Held during the fsync, which should be
  // fine because it is off the hot path.
  std::mutex high_water_mark_write_mutex_;

  // Set to true by `Start()` and back to false by `Stop()`. Every
  // public method other than `Start` / `Stop` / the destructor
  // CHECK-fails when this is false, catching the error of using the
  // clock before starting it.
  std::atomic<bool> running_{false};

  static_assert(
      std::atomic<std::chrono::nanoseconds>::is_always_lock_free,
      "MonotonicClock requires lock-free "
      "std::atomic<std::chrono::nanoseconds>");
};

////////////////////////////////////////////////////////////////////////

}  // namespace rbt::server

////////////////////////////////////////////////////////////////////////
