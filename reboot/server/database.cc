#include "reboot/server/database.h"

#include <openssl/sha.h>

#include <algorithm>
#include <atomic>
#include <cerrno>
#include <chrono>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <ios>
#include <mutex>
#include <optional>
#include <shared_mutex>
#include <thread>
#include <unordered_set>

#include "absl/strings/str_split.h"
#include "absl/strings/strip.h"
#include "fmt/format.h"
#include "fmt/ostream.h"
#include "fmt/ranges.h"
#include "glog/logging.h"
#include "google/protobuf/timestamp.pb.h"
#include "google/protobuf/util/message_differencer.h"
#include "google/protobuf/util/time_util.h"
#include "grpcpp/server_builder.h"
#include "rbt/v1alpha1/application_metadata.pb.h"
#include "rbt/v1alpha1/database.grpc.pb.h"
#include "rbt/v1alpha1/tasks.pb.h"
#include "reboot/server/monotonic_clock.h"
#include "rocksdb/db.h"
#include "rocksdb/filter_policy.h"
#include "rocksdb/slice_transform.h"
#include "rocksdb/table.h"
#include "rocksdb/utilities/transaction_db.h"
#include "rocksdb/utilities/write_batch_with_index.h"
#include "stout/borrowable.h"
#include "stout/cache.h"
#include "stout/uuid.h"
#include "tl/expected.hpp"

////////////////////////////////////////////////////////////////////////

using id::UUID;

using rbt::v1alpha1::Actor;
using rbt::v1alpha1::ApplicationMetadata;
using rbt::v1alpha1::ColocatedRangeRequest;
using rbt::v1alpha1::ColocatedRangeResponse;
using rbt::v1alpha1::ColocatedReverseRangeRequest;
using rbt::v1alpha1::ColocatedReverseRangeResponse;
using rbt::v1alpha1::ColocatedUpsert;
using rbt::v1alpha1::ExportItem;
using rbt::v1alpha1::ExportRequest;
using rbt::v1alpha1::ExportResponse;
using rbt::v1alpha1::FindRequest;
using rbt::v1alpha1::FindResponse;
using rbt::v1alpha1::GetApplicationMetadataRequest;
using rbt::v1alpha1::GetApplicationMetadataResponse;
using rbt::v1alpha1::IdempotentMutation;
using rbt::v1alpha1::LoadRequest;
using rbt::v1alpha1::LoadResponse;
using rbt::v1alpha1::Participants;
using rbt::v1alpha1::PersistenceVersion;
using rbt::v1alpha1::PreloadRequest;
using rbt::v1alpha1::PreloadResponse;
using rbt::v1alpha1::RecoverIdempotentMutationsRequest;
using rbt::v1alpha1::RecoverIdempotentMutationsResponse;
using rbt::v1alpha1::RecoverRequest;
using rbt::v1alpha1::RecoverResponse;
using rbt::v1alpha1::ServerInfo;
using rbt::v1alpha1::StoreApplicationMetadataRequest;
using rbt::v1alpha1::StoreApplicationMetadataResponse;
using rbt::v1alpha1::StoreRequest;
using rbt::v1alpha1::StoreResponse;
using rbt::v1alpha1::Task;
using rbt::v1alpha1::TaskId;
using rbt::v1alpha1::Transaction;
using rbt::v1alpha1::TransactionCoordinator;
using rbt::v1alpha1::TransactionCoordinatorCleanupRequest;
using rbt::v1alpha1::TransactionCoordinatorCleanupResponse;
using rbt::v1alpha1::TransactionCoordinatorPreparedRequest;
using rbt::v1alpha1::TransactionCoordinatorPreparedResponse;
using rbt::v1alpha1::TransactionCoordinatorPrepareRequest;
using rbt::v1alpha1::TransactionCoordinatorPrepareResponse;
using rbt::v1alpha1::TransactionParticipantAbortRequest;
using rbt::v1alpha1::TransactionParticipantAbortResponse;
using rbt::v1alpha1::TransactionParticipantCommitRequest;
using rbt::v1alpha1::TransactionParticipantCommitResponse;
using rbt::v1alpha1::TransactionParticipantPrepareRequest;
using rbt::v1alpha1::TransactionParticipantPrepareResponse;

using rbt::v1alpha1::RefreshTimestampRequest;
using rbt::v1alpha1::RefreshTimestampResponse;

template <class T, class E = std::string>
using expected = tl::expected<T, E>;

using tl::make_unexpected;

////////////////////////////////////////////////////////////////////////

namespace rbt::server {

////////////////////////////////////////////////////////////////////////

// The `state` schema allows for range queries over its contents. We install
// a `prefix_extractor` (see the usage of this class) that extracts a prefix
// up to and including the last forward slash in a key, which allows us to skip
// sstables that do not contain the prefix while executing range queries.
//
// Forward slash is our component separator, so the last forward slash is
// immediately before the final component of a key. Nothing can be colocated
// within a SortedMap, meaning that they can't be nested (yet: see #2983). So
// this prefix extractor always extracts SortedMaps.
//
// TODO: When implementing colocation of other types of data, we should adjust
// this to explicitly match the `SortedMap` type tag, so that we don't extract
// prefixes that don't refer to `SortedMap`s (which would pollute our bloom
// filter with things that we will never scan on).
//
// NOTE: If we ever allow for nested `SortedMap`s, we will want to implement
// https://groups.google.com/g/rocksdb/c/bb6Db8Y3xwU/m/tGnougtbAwAJ.
class PrefixToLastFSlashExtractor : public rocksdb::SliceTransform {
 public:
  explicit PrefixToLastFSlashExtractor() = default;
  ~PrefixToLastFSlashExtractor() override {}

  const char* Name() const override {
    return "PrefixToLastFSlashExtractor";
  }

  rocksdb::Slice Transform(const rocksdb::Slice& src) const override {
    // Search backwards until we find a forward slash.
    int index = src.size() - 1;
    while (true) {
      if (index < 0) {
        // There were no forward slashes. Return the entire slice.
        return src;
      }
      if (src[index] == '/') {
        // Found a forward slash.
        return rocksdb::Slice(src.data(), index);
      }

      index--;
    }
  }

  bool InDomain(const rocksdb::Slice& src) const override {
    // Rather than scanning for slashes multiple times, we always report that
    // a key is in the domain.
    return true;
  }

  bool InRange(const rocksdb::Slice& dst) const override {
    // (check_line_length skip)
    // https://github.com/facebook/rocksdb/blob/444b3f4845dd01b0d127c4b420fdd3b50ad56682/include/rocksdb/slice_transform.h#L73-L75
    CHECK(false) << "Deprecated `InRange` should not be used.";
  }
};

////////////////////////////////////////////////////////////////////////

// Drop-in replacement for `std::mutex` that provides various features
// for correctness and debugging. Note if these features all existed
// in other libraries, e.g., Google's Abseil, we would have used them.
//
// **Thread-ownership tracking.** Always-on: records the ID of the
// thread that currently holds the mutex in a relaxed atomic
// `std::thread::id`. Used by `HasLock()` for self-assertions that a
// caller is holding the mutex before touching guarded state, and by
// the contention logging to name the previous holder. Cost is a
// single relaxed atomic store per `lock()`/`try_lock()`/`unlock()` —
// ~1ns on x86, dwarfed by the mutex itself.
//
// **Contention tracking.** When the
// `REBOOT_DATABASE_MUTEX_CONTENTION_US` environment variable is set
// to a non-negative integer number of microseconds, measures the
// wall-clock time spent waiting to acquire the mutex and logs a
// warning (along with the previous holder's thread ID) whenever a
// single acquisition takes at least that many microseconds. Useful
// for detecting contention without paying the timing cost in normal
// operation.
//
// Why microseconds and not milliseconds: an uncontended
// `std::mutex::lock()` on Linux is roughly 20-50ns (one atomic CAS in
// user space, no syscall). So 1us is already ~25x slower than
// uncontended, 100us is ~2,500x slower, and 1ms is ~40,000x slower.
// Picking the threshold in milliseconds would leave a four-orders-of-
// magnitude blind spot between "no contention" and "logged"; an
// individual 200us wait that occurs thousands of times per second can
// burn an entire CPU core's worth of waiting and would be invisible at
// millisecond granularity. The two `steady_clock::now()` calls cost
// ~15-25ns each on Linux (vDSO-backed), which is dwarfed by the lock
// acquisition itself.
//
// When the environment variable is unset (or invalid) `lock()` falls
// straight through to `std::mutex::lock()` with no measurement
// overhead beyond a single load+branch on a function-local cache
// (plus the always-on owner-tracking store).
//
// Each instance carries a `name` (passed at construction) that is
// included in the contention warnings so that, when there are
// multiple `Mutex` instances in the same process, the log clearly
// identifies which one is contended. The `name` is stored as a
// `const char*`, so callers should pass a string literal (or
// otherwise ensure the storage outlives the mutex).
//
// NOTE: we are using private inheritance from `std::mutex` so that a
// `Mutex&` does not implicitly slice to `std::mutex&`. Without this,
// a caller could acquire the base `std::mutex` directly (e.g., via
// `std::lock_guard<std::mutex>` on an upcast reference) and bypass
// our `lock()` / `try_lock()` / `unlock()` overrides, leaving the
// `owner_` field stale. The base methods are not virtual, so public
// inheritance would make this silent. The overrides remain public
// members of `Mutex` itself, so `std::lock_guard` and
// `std::unique_lock` continue to work as expected.
class Mutex : private std::mutex {
 public:
  explicit Mutex(const char* name) : name_(name) {}

  void lock() {
    // Determine the threshold microseconds, if any, once per process,
    // such that all subsequent locks are a single relaxed load +
    // branch. A negative value means tracking is disabled.
    static const int64_t threshold_us = []() -> int64_t {
      const char* value = std::getenv("REBOOT_DATABASE_MUTEX_CONTENTION_US");
      if (value == nullptr || value[0] == '\0') {
        return -1;
      }
      char* end = nullptr;
      errno = 0;
      const int64_t parsed = std::strtoll(value, &end, 10);
      if (errno != 0 || end == value || *end != '\0' || parsed < 0) {
        LOG(WARNING) << "Ignoring invalid value for "
                        "'REBOOT_DATABASE_MUTEX_CONTENTION_US="
                     << value
                     << "' (expected a non-negative integer number "
                        "of microseconds)";
        return -1;
      }
      LOG(WARNING) << "Mutex contention tracking ENABLED with threshold "
                   << parsed
                   << "us (via 'REBOOT_DATABASE_MUTEX_CONTENTION_US')";
      return parsed;
    }();

    if (threshold_us < 0) {
      // Contention measurement disabled — skip the timing work but
      // still record the owner.
      std::mutex::lock();
      owner_.store(std::this_thread::get_id(), std::memory_order_relaxed);
      return;
    }

    // Snapshot the likely holder before we block, so we can name them
    // in the contention warning. This load races with whoever
    // currently holds the lock: they may release and a new thread may
    // acquire before we actually block, in which case `owner` is "who
    // we started waiting on" rather than "who held the lock for the
    // entire elapsed wait." Still useful.
    const std::thread::id owner = owner_.load(std::memory_order_relaxed);

    const auto start = std::chrono::steady_clock::now();

    std::mutex::lock();

    const auto elapsed_us =
        std::chrono::duration_cast<std::chrono::microseconds>(
            std::chrono::steady_clock::now() - start)
            .count();

    if (elapsed_us >= threshold_us) {
      LOG(WARNING) << "Mutex contention: waited " << elapsed_us
                   << "us to acquire '" << name_
                   << "' (previous holder: " << owner << ", threshold "
                   << threshold_us << "us)";
    }
    owner_.store(std::this_thread::get_id(), std::memory_order_relaxed);
  }

  bool try_lock() {
    if (std::mutex::try_lock()) {
      owner_.store(std::this_thread::get_id(), std::memory_order_relaxed);
      return true;
    }
    return false;
  }

  void unlock() {
    owner_.store(std::thread::id{}, std::memory_order_relaxed);
    std::mutex::unlock();
  }

  // Returns true iff the calling thread currently holds this mutex.
  // Useful for `CHECK(mutex.HasLock())`-style self-assertions.
  bool HasLock() const {
    return owner_.load(std::memory_order_relaxed) == std::this_thread::get_id();
  }

 private:
  // Identifier for this mutex, included in contention warnings.
  // Expected to point at a string with static storage duration (e.g.,
  // a string literal).
  const char* name_;

  // ID of the thread that currently holds this mutex, or a default-
  // constructed `std::thread::id{}` (the "not-a-thread" sentinel)
  // when unlocked. Updated with relaxed atomics; the base
  // `std::mutex` provides all the happens-before ordering that
  // callers need for shared data guarded by this mutex.
  static_assert(
      std::atomic<std::thread::id>::is_always_lock_free,
      "std::atomic<std::thread::id> is not lock-free on this "
      "platform; owner tracking would take a hidden internal lock.");

  std::atomic<std::thread::id> owner_{};
};

////////////////////////////////////////////////////////////////////////

// A `rocksdb::Transaction` is not internally thread-safe. Operations
// on a given transaction are normally serialized by the server
// (Reboot guarantees only one in-progress mutation per state), which
// would make this mutex unnecessary in the common case.
//
// The exception — and the reason we need a mutex for each
// `rocksdb::Transaction` — is the "prepare / abort cancellation
// race": when a `TransactionParticipantPrepare` RPC gets cancelled,
// the server follows up by issuing a `TransactionParticipantAbort`
// for the same transaction, but gRPC cancellation does not stop the
// already-running `TransactionParticipantPrepare` handler. The two
// handlers therefore can theoretically execute concurrently against
// the same `rocksdb::Transaction`; `TransactionParticipantPrepare`
// mutating the `rocksdb::Transaction` via `Apply()`, `txn->Delete()`,
// and `txn->Prepare()` while `TransactionParticipantAbort` calling
// `txn->Rollback()`. The mutex serializes them.
//
// To simplify the usage we've created a `LockableTransaction` which
// can be passed directly to `std::lock_guard` / `std::unique_lock`.
//
// `operator->` and `operator*` forward to the underlying
// `rocksdb::Transaction`, so a `LockableTransaction` behaves like a
// pointer to the transaction for member access.
class LockableTransaction : public Mutex {
 public:
  explicit LockableTransaction(std::unique_ptr<rocksdb::Transaction> txn)
    : Mutex(kMutexName), txn_(std::move(txn)) {}

  rocksdb::Transaction* operator->() const {
    CHECK(HasLock());
    return txn_.get();
  }

  rocksdb::Transaction& operator*() const {
    CHECK(HasLock());
    return *txn_;
  }

 private:
  static constexpr const char* kMutexName = "LockableTransaction";

  std::unique_ptr<rocksdb::Transaction> txn_;
};

////////////////////////////////////////////////////////////////////////

class DatabaseService final : public rbt::v1alpha1::Database::Service {
 public:
  // Returns a type-erased instance of 'DatabaseService' or an error if
  // a 'DatabaseService' could not be instantiated.
  static expected<std::unique_ptr<grpc::Service>> Instantiate(
      const std::filesystem::path& state_directory,
      const ServerInfo& server_info);

  ~DatabaseService() override;

  // Enable legacy coordinator prepared format. This should only be used in
  // tests.
  void SetAllowLegacyCoordinatorPrepared(bool allow) {
    allow_legacy_coordinator_prepared_ = allow;
  }

  // Service methods.
  grpc::Status ColocatedRange(
      grpc::ServerContext* context,
      const ColocatedRangeRequest* request,
      ColocatedRangeResponse* response) override;
  grpc::Status ColocatedReverseRange(
      grpc::ServerContext* context,
      const ColocatedReverseRangeRequest* request,
      ColocatedReverseRangeResponse* response) override;
  grpc::Status Find(
      grpc::ServerContext* context,
      const rbt::v1alpha1::FindRequest* request,
      rbt::v1alpha1::FindResponse* response) override;
  grpc::Status Load(
      grpc::ServerContext* context,
      const LoadRequest* request,
      LoadResponse* response) override;
  grpc::Status Preload(
      grpc::ServerContext* context,
      const PreloadRequest* request,
      grpc::ServerWriter<PreloadResponse>* responses) override;
  grpc::Status Store(
      grpc::ServerContext* context,
      const StoreRequest* request,
      StoreResponse* response) override;
  grpc::Status Recover(
      grpc::ServerContext* context,
      const RecoverRequest* request,
      grpc::ServerWriter<RecoverResponse>* responses) override;
  grpc::Status RecoverIdempotentMutations(
      grpc::ServerContext* context,
      const RecoverIdempotentMutationsRequest* request,
      grpc::ServerWriter<RecoverIdempotentMutationsResponse>* responses)
      override;
  grpc::Status TransactionParticipantPrepare(
      grpc::ServerContext* context,
      const TransactionParticipantPrepareRequest* request,
      TransactionParticipantPrepareResponse* response) override;
  grpc::Status TransactionParticipantCommit(
      grpc::ServerContext* context,
      const TransactionParticipantCommitRequest* request,
      TransactionParticipantCommitResponse* response) override;
  grpc::Status TransactionParticipantAbort(
      grpc::ServerContext* context,
      const TransactionParticipantAbortRequest* request,
      TransactionParticipantAbortResponse* response) override;
  grpc::Status TransactionCoordinatorPrepared(
      grpc::ServerContext* context,
      const TransactionCoordinatorPreparedRequest* request,
      TransactionCoordinatorPreparedResponse* response) override;
  grpc::Status TransactionCoordinatorPrepare(
      grpc::ServerContext* context,
      const TransactionCoordinatorPrepareRequest* request,
      TransactionCoordinatorPrepareResponse* response) override;
  grpc::Status TransactionCoordinatorCleanup(
      grpc::ServerContext* context,
      const TransactionCoordinatorCleanupRequest* request,
      TransactionCoordinatorCleanupResponse* response) override;
  grpc::Status Export(
      grpc::ServerContext* context,
      const ExportRequest* request,
      ExportResponse* response) override;
  grpc::Status ExportStreamed(
      grpc::ServerContext* context,
      const ExportRequest* request,
      grpc::ServerWriter<ExportResponse>* responses) override;
  grpc::Status GetApplicationMetadata(
      grpc::ServerContext* context,
      const GetApplicationMetadataRequest* request,
      GetApplicationMetadataResponse* response) override;
  grpc::Status StoreApplicationMetadata(
      grpc::ServerContext* context,
      const StoreApplicationMetadataRequest* request,
      StoreApplicationMetadataResponse* response) override;
  grpc::Status RefreshTimestamp(
      grpc::ServerContext* context,
      const RefreshTimestampRequest* request,
      RefreshTimestampResponse* response) override;

 private:
  DatabaseService(
      const std::filesystem::path& state_directory,
      std::shared_ptr<rocksdb::Statistics> statistics,
      std::vector<rocksdb::ColumnFamilyHandle*>&& column_family_handles,
      std::unique_ptr<rocksdb::TransactionDB>&& db,
      const ServerInfo& server_info);

  // Migrate from previous persistence versions to the current version,
  // if necessary.
  expected<void> MaybeMigratePersistence(const RecoverRequest& request);
  expected<void> MigratePersistence2To3(const RecoverRequest& request);
  expected<void> MigratePersistence3To4(const RecoverRequest& request);

  // Lookup a rocksdb column family handle for the specified state type,
  // or fail if no such column family exists for the state type.
  expected<rocksdb::ColumnFamilyHandle*> LookupColumnFamilyHandle(
      const std::string& state_type) const;

  // Lookup a rocksdb column family handle for the specified state type,
  // or try and create one if no such column family exists for the
  // state type, or fail if a column family could not be created.
  expected<rocksdb::ColumnFamilyHandle*> LookupOrCreateColumnFamilyHandle(
      const std::string& state_type);

  // Lookup an ongoing transaction for the specified state type and actor
  // or fail if no transaction exists.
  expected<stout::borrowed_ref<LockableTransaction>> LookupTransaction(
      const std::string& state_type,
      const std::string& state_ref);

  // Lookup an ongoing transaction or begin a new transaction for the
  // specified state type and actor if no transaction already exists.
  expected<stout::borrowed_ref<LockableTransaction>> LookupOrBeginTransaction(
      const Transaction& transaction,
      bool store_participant = true);

  // Delete an ongoing transaction.
  void DeleteTransaction(
      expected<stout::borrowed_ref<LockableTransaction>>&& txn);

  // Apply actor upserts, task upserts, colocated upserts, idempotent
  // mutations, etc, to a `rocksdb::Transaction` or
  // `rocksdb::WriteBatch`. Used by both `Store()` and
  // `TransactionParticipantPrepare()`.
  template <typename Batch>
  expected<rocksdb::Status> Apply(
      Batch& batch,
      const google::protobuf::RepeatedPtrField<Actor>& actor_upserts,
      const google::protobuf::RepeatedPtrField<Task>& task_upserts,
      const google::protobuf::RepeatedPtrField<ColocatedUpsert>&
          colocated_upserts,
      const google::protobuf::RepeatedPtrField<std::string>&
          ensure_state_types_created,
      const google::protobuf::RepeatedPtrField<IdempotentMutation>&
          idempotent_mutations);


  // Helper to check if an actor has an ongoing transaction.
  bool HasTransaction(const std::string& state_ref);

  // Helper to validate a non-transactional store request.
  expected<void> ValidateNonTransactionalStore(const StoreRequest& request);

  // Helper for recovering tasks.
  grpc::Status RecoverTasks(
      const grpc::ServerContext& context,
      grpc::ServerWriter<RecoverResponse>& responses,
      const std::unordered_set<std::string>& shard_ids);

  // Helper for recovering transactions.
  expected<void, grpc::Status> RecoverTransactions(
      const grpc::ServerContext& context,
      grpc::ServerWriter<RecoverResponse>& responses,
      const std::unordered_set<std::string>& shard_ids);

  // Helper for recovering uncommitted tasks within a transaction.
  grpc::Status RecoverTransactionTasks(
      const grpc::ServerContext& context,
      Transaction& transaction,
      LockableTransaction& txn);

  // Helper for recovering uncommitted idempotent mutations within a
  // transaction.
  grpc::Status RecoverTransactionIdempotentMutations(
      const grpc::ServerContext& context,
      Transaction& transaction,
      LockableTransaction& txn);

  // Helper for recovering idempotent mutations within some shards.
  grpc::Status RecoverShardsIdempotentMutations(
      const grpc::ServerContext& context,
      grpc::ServerWriter<RecoverResponse>& responses,
      const std::unordered_set<std::string>& shard_ids);

  // Check if a state ref belongs to any of the specified shards.
  bool BelongsToShard(
      std::string_view state_type,
      std::string_view state_ref,
      const std::unordered_set<std::string>& shard_ids,
      bool use_cache = true);

  // Helper function to compute SHA1 hash of the first component of a state_ref.
  std::string ComputeStateRefHash(std::string_view state_ref) const;

  // Helper function to determine which shard owns a given hash.
  std::string GetShardForHash(const std::string& hash_str) const;

  // Helper function to determine which shard owns a given state_ref.
  std::string GetShardForStateRef(
      std::string_view state_ref,
      bool use_cache = true);

  // Iterates RocksDB and calls `on_item` for each matching item.
  // If `on_item` returns a non-OK status, iteration stops early and
  // that status is returned to the caller.
  grpc::Status _Export(
      const grpc::ServerContext& context,
      const ExportRequest& request,
      const std::function<grpc::Status(ExportItem&&, size_t)>& on_item);

  std::filesystem::path state_directory_;
  std::filesystem::path metadata_path_;
  std::shared_ptr<rocksdb::Statistics> statistics_;

  // Serializes reads and writes of the application metadata file at
  // `metadata_path_`. The file is read by `GetApplicationMetadata` and
  // written by `StoreApplicationMetadata`; this mutex protects against
  // a torn write or partial read if those calls ever overlap. Both
  // are infrequent and on the cold path, so a plain `std::mutex` is
  // fine.
  mutable std::mutex metadata_mutex_;

  // Collection of column family handles, one for each state type. Note
  // we're currently just using a vector here as we assume this will
  // be a relatively small list and it will be faster to just iterate
  // through it when doing a lookup.
  std::vector<rocksdb::ColumnFamilyHandle*> column_family_handles_;

  // Protects `column_family_handles_` exclusively. Reads (e.g.,
  // within `LookupColumnFamilyHandle`) take a shared lock and writes
  // (e.g., within `LookupOrCreateColumnFamilyHandle`) take an
  // exclusive lock.
  mutable std::shared_mutex column_family_handles_mutex_;

  stout::Borrowable<std::unique_ptr<rocksdb::TransactionDB>> db_;

  // Server info containing shard information.
  ServerInfo server_info_;

  // Sorted vector of `(shard_first_key, shard_id)` pairs, built once
  // at construction time from `server_info_`. Enables O(log N) binary
  // search in `GetShardForHash`.
  std::vector<std::pair<std::string, std::string>> sorted_shard_first_keys_;

  // Cache of shard IDs for state refs, necessary because computing
  // the shard ID when you have 2^14 of them over and over again
  // really adds up!
  Cache<std::string, std::string> shard_for_state_ref_;
  // Cache capacity large enough to be helpful but not so large that
  // it's more than O(10s of MB).
  static const size_t SHARD_FOR_STATE_REF_CAPACITY = 8192;

  // Protects `shard_for_state_ref_` exclusively. The underlying
  // `stout::Cache` is not internally thread-safe; this mutex is
  // acquired by `GetShardForStateRef` for the duration of each
  // get/put.
  mutable Mutex shard_cache_mutex_{"DatabaseService::shard_cache_mutex_"};

  // We track ongoing transactions indexed by 'state_ref' because there should
  // only ever be a single transaction per actor and we want to be able to
  // look up whether or not a actor is currently in a transaction.
  std::map<
      std::string,  // An actor id.
      stout::Borrowable<LockableTransaction>>
      txns_;

  // Protects `txns_` exclusively. Acquired internally by
  // `LookupTransaction`, `LookupOrBeginTransaction`,
  // `DeleteTransaction`, and `HasTransaction`.
  mutable Mutex txns_mutex_{"DatabaseService::txns_mutex_"};

  // Flag to control whether newly prepared coordinator transactions are allowed
  // to use the "legacy" format (i.e. not providing a coordinator state ref).
  // This should only be true for tests.
  bool allow_legacy_coordinator_prepared_ = false;

  // Monotonic clock used to return timestamps on RPC responses.
  std::unique_ptr<MonotonicClock> monotonic_clock_;

  // Optional hook invoked only in tests at specific long-running RPC
  // call sites. See `TestOnlyLongRunningRPCHookSite` for the set of
  // call sites.
  std::function<void(TestOnlyLongRunningRPCHookSite)>
      test_only_hook_for_long_running_rpc_;

 public:
  void SetTestOnlyHookForLongRunningRPC(
      std::function<void(TestOnlyLongRunningRPCHookSite)> hook) {
    test_only_hook_for_long_running_rpc_ = std::move(hook);
  }
};

////////////////////////////////////////////////////////////////////////

// Gets the actor id from a 'rocksdb::Transaction' based on the
// naming schema used in 'MakeTransactionName'.
std::string GetStateRefFromTransaction(const rocksdb::Transaction& txn) {
  const std::string& name = txn.GetName();
  return name.substr(0, name.rfind(':'));
}

////////////////////////////////////////////////////////////////////////

DatabaseService::DatabaseService(
    const std::filesystem::path& state_directory,
    std::shared_ptr<rocksdb::Statistics> statistics,
    std::vector<rocksdb::ColumnFamilyHandle*>&& column_family_handles,
    std::unique_ptr<rocksdb::TransactionDB>&& db,
    const ServerInfo& server_info)
  : state_directory_(state_directory),
    // The application metadata is serialized proto bytes stored in a file,
    // not in RocksDB. This is for backwards compatibility with previous
    // Reboot versions.
    metadata_path_(state_directory / "__metadata"),
    statistics_(statistics),
    column_family_handles_(std::move(column_family_handles)),
    db_(std::move(db)),
    server_info_(server_info),
    shard_for_state_ref_(SHARD_FOR_STATE_REF_CAPACITY) {
  CHECK(server_info_.shard_infos_size() > 0)
      << "Server info must contain at least one shard.";

  // Build `sorted_shard_first_keys_` for O(log N) lookup in `GetShardForHash`.
  sorted_shard_first_keys_.reserve(server_info_.shard_infos_size());
  for (const auto& shard_info : server_info_.shard_infos()) {
    sorted_shard_first_keys_.emplace_back(
        shard_info.shard_first_key(),
        shard_info.shard_id());
  }
  // The `server_info_.shard_infos()` should be already sorted, but we
  // don't want to keep that invariant in mind so in the worst case
  // scenario we will need to sort ~16K shards only once, which will
  // take ~2-5ms.
  std::sort(sorted_shard_first_keys_.begin(), sorted_shard_first_keys_.end());

  // We recover all prepared transactions here since every server
  // will call `Recover()` on every startup and we only want to do
  // it once. Also, while in production there won't be any other
  // kinds of calls _before_ `Recover()`, there were tests
  // introduced into 'tests/reboot/server/database_tests.cc' at some
  // point that break that invariant, and thus the constructor is
  // the only place we can do this before any other possible calls
  // are made.
  std::vector<rocksdb::Transaction*> txns;
  db_->GetAllPreparedTransactions(&txns);
  for (rocksdb::Transaction* txn : txns) {
    std::string state_ref = GetStateRefFromTransaction(*txn);
    // `try_emplace` forwards the trailing argument directly to
    // `Borrowable<LockableTransaction>`'s constructor, which in turn
    // forwards to `LockableTransaction(unique_ptr)`. Needed instead
    // of `emplace(key, LockableTransaction{...})` because a
    // `std::mutex` is non-movable.
    txns_.try_emplace(
        std::move(state_ref),
        std::unique_ptr<rocksdb::Transaction>(txn));
  }

  // Create and start the `MonotonicClock` passing `db_` so it can
  // read and write state to be resilient to database reboots!
  monotonic_clock_ = std::make_unique<MonotonicClock>();
  monotonic_clock_->Start(db_.Borrow());
}

////////////////////////////////////////////////////////////////////////

DatabaseService::~DatabaseService() {
  // Need to stop the clock so it releases its borrow on `db_`
  // otherwise we'll hang forever!
  monotonic_clock_->Stop();

  for (auto* column_family_handle : column_family_handles_) {
    rocksdb::Status status =
        db_->DestroyColumnFamilyHandle(column_family_handle);
    CHECK(status.ok()) << "Failed to destroy column family handle: "
                       << status.ToString();
  }
}

////////////////////////////////////////////////////////////////////////

// Create prefix-aware column family options. Can confirm that the filters
// are being applied by examining the `rocksdb.bloom.filter.prefix.useful`
// statistic. See: (check_line_length skip)
// https://github.com/facebook/rocksdb/wiki/Prefix-Seek/6f8f534058979f799ef90d2d8c7e699d94894b6e#why-prefix-seek
rocksdb::ColumnFamilyOptions CreateColumnFamilyOptions() {
  rocksdb::ColumnFamilyOptions cf_options = rocksdb::ColumnFamilyOptions();
  rocksdb::BlockBasedTableOptions table_options;
  table_options.filter_policy.reset(rocksdb::NewBloomFilterPolicy(10, false));
  cf_options.table_factory.reset(
      rocksdb::NewBlockBasedTableFactory(table_options));
  cf_options.prefix_extractor.reset(new PrefixToLastFSlashExtractor());
  return cf_options;
}

// When iterating outside of the ranges defined by our prefix extractor in
// CreateColumnFamilyOptions, we need to disable prefix seeks.
// See: (check_line_length skip)
// https://github.com/facebook/rocksdb/wiki/Prefix-Seek#how-to-ignore-prefix-bloom-filters-in-read
rocksdb::ReadOptions NonPrefixIteratorReadOptions() {
  rocksdb::ReadOptions read_options = rocksdb::ReadOptions();
  read_options.total_order_seek = true;
  return read_options;
}

// The default WriteOptions that should be used for any write operation.
//
// `sync` is not enabled by default, but we would still like writes
// which occur outside of a transaction to `sync` before returning,
// unless specified otherwise, e.g., by a user who doesn't care if
// their `writer` syncs or not.
rocksdb::WriteOptions DefaultWriteOptions(bool sync = true) {
  rocksdb::WriteOptions write_options = rocksdb::WriteOptions();
  write_options.sync = sync;
  return write_options;
}

////////////////////////////////////////////////////////////////////////

#define STATE_KEY_PREFIX "state"

std::string MakeActorStateKey(const std::string& state_ref) {
  return fmt::format(STATE_KEY_PREFIX ":{}", state_ref);
}

std::string_view GetStateRefFromActorStateKey(
    const std::string_view actor_state_key) {
  return actor_state_key.substr(strlen(STATE_KEY_PREFIX) + 1);
}

////////////////////////////////////////////////////////////////////////

// To ensure that we can handle failures during a migration we need to
// differentiate the key prefix. We only use a version suffix, i.e.,
// `_V3` on the old one so that the code doesn't have a mix of
// versions in it, it's only the migration code that uses the
// suffixes.
#define TASK_KEY_PREFIX_V3 "task"
#define TASK_KEY_PREFIX "task-v4"

std::string MakeTaskKey(const Task::Status& status, const TaskId& task_id) {
  return fmt::format(
      TASK_KEY_PREFIX ":{}:{}:{}",
      Task::Status_Name(status),
      task_id.state_ref(),
      task_id.task_uuid());
}

////////////////////////////////////////////////////////////////////////

#define CURRENT_PERSISTENCE_VERSION 4

constexpr std::string_view kPersistenceVersionKey = "persistence_version";
constexpr std::string_view kServerInfoKey = "server_info";

expected<void> WritePersistenceVersion(rocksdb::DB* db, int version) {
  PersistenceVersion pv;
  pv.set_version(version);

  std::string serialized_version_put;
  if (!pv.SerializeToString(&serialized_version_put)) {
    return make_unexpected(
        fmt::format(
            "Failed to serialize persistence version: {}",
            pv.ShortDebugString()));
  }
  rocksdb::Status status = db->Put(
      DefaultWriteOptions(),
      rocksdb::Slice(kPersistenceVersionKey),
      rocksdb::Slice(serialized_version_put));
  if (!status.ok()) {
    return make_unexpected(
        fmt::format(
            "Failed to write persistence version: {}",
            status.ToString()));
  }

  return {};
}

expected<void> WriteServerInfo(rocksdb::DB* db, const ServerInfo& server_info) {
  std::string serialized_server_info;
  if (!server_info.SerializeToString(&serialized_server_info)) {
    return make_unexpected(
        fmt::format(
            "Failed to serialize server info: {}",
            server_info.ShortDebugString()));
  }
  rocksdb::Status status = db->Put(
      DefaultWriteOptions(),
      rocksdb::Slice(kServerInfoKey),
      rocksdb::Slice(serialized_server_info));
  if (!status.ok()) {
    return make_unexpected(
        fmt::format("Failed to write server info: {}", status.ToString()));
  }

  return {};
}

expected<void> ValidateServerInfo(
    rocksdb::DB* db,
    const ServerInfo& expected_server_info) {
  std::string serialized_server_info;
  rocksdb::Status status =
      db->Get(rocksdb::ReadOptions(), kServerInfoKey, &serialized_server_info);
  if (status.ok()) {
    ServerInfo actual_server_info;
    CHECK(
        actual_server_info.ParseFromString(std::move(serialized_server_info)));

    if (actual_server_info.shard_infos_size() == 1
        && actual_server_info.shard_infos(0).shard_id() == "cloud-shard-0"
        && expected_server_info.shard_infos(0).shard_first_key() == "") {
      // This is a special case for backwards compatibility with
      // single-shard databases created before "real" shard IDs were introduced.
      // The old shard ID was never used, so it's safe to ignore it. Overwrite
      // the legacy format with the new format.
      return WriteServerInfo(db, expected_server_info);
    }

    if (!google::protobuf::util::MessageDifferencer::Equals(
            actual_server_info,
            expected_server_info)) {
      // This is not a particularly friendly error message, but it is only a
      // backstop for a higher-level error message rendered by the
      // ServerManager (which will tell a user how their shard count
      // changed). A user should not see this check unless there is an issue in
      // that check.
      return make_unexpected(
          fmt::format(
              "Server information mismatched:\nactual: {}\nvs\nexpected: {}\n",
              actual_server_info.ShortDebugString(),
              expected_server_info.ShortDebugString()));
    }
  } else if (status.IsNotFound()) {
    // TODO: For backwards compatibility for #2910, we currently write the
    // ServerInfo if it is not found. After #2910 has been stably shipped
    // for a while, we should error for this case instead.
    return WriteServerInfo(db, expected_server_info);
  } else {
    return make_unexpected(
        fmt::format("Failed to read server info: {}", status.ToString()));
  }

  return {};
}

////////////////////////////////////////////////////////////////////////

expected<rocksdb::ColumnFamilyHandle*>
DatabaseService::LookupColumnFamilyHandle(const std::string& state_type) const {
  std::shared_lock lock(column_family_handles_mutex_);

  // TODO(benh): make 'column_family_handles_' be a map?
  auto iterator = std::find_if(
      std::begin(column_family_handles_),
      std::end(column_family_handles_),
      [&state_type](rocksdb::ColumnFamilyHandle* column_family_handle) {
        return column_family_handle->GetName() == state_type;
      });

  if (iterator == std::end(column_family_handles_)) {
    return make_unexpected(
        fmt::format(
            "Failed to find column family for state type '{}'",
            state_type));
  }

  return *iterator;
}

////////////////////////////////////////////////////////////////////////

expected<rocksdb::ColumnFamilyHandle*>
DatabaseService::LookupOrCreateColumnFamilyHandle(
    const std::string& state_type) {
  // TODO(benh): make 'column_family_handles_' be a map?
  auto find = [&]() {
    return std::find_if(
        std::begin(column_family_handles_),
        std::end(column_family_handles_),
        [&state_type](rocksdb::ColumnFamilyHandle* column_family_handle) {
          return column_family_handle->GetName() == state_type;
        });
  };

  // Fast path: handle already exists.
  {
    std::shared_lock lock(column_family_handles_mutex_);
    auto iterator = find();
    if (iterator != std::end(column_family_handles_)) {
      return *iterator;
    }
  }

  // Slow path: take an exclusive lock and re-check, since another
  // thread may have created the handle between dropping the shared
  // lock and acquiring the exclusive one.
  std::unique_lock lock(column_family_handles_mutex_);

  auto iterator = find();
  if (iterator != std::end(column_family_handles_)) {
    return *iterator;
  }

  rocksdb::ColumnFamilyHandle* column_family_handle = nullptr;

  rocksdb::Status status = db_->CreateColumnFamily(
      CreateColumnFamilyOptions(),
      state_type,
      &column_family_handle);

  if (!status.ok()) {
    return make_unexpected(
        fmt::format(
            "Failed to create column family for state type '{}': {}",
            state_type,
            status.ToString()));
  }

  // Save column family handle for future look ups and destruction!
  column_family_handles_.push_back(column_family_handle);

  return column_family_handle;
}

////////////////////////////////////////////////////////////////////////

// Returns the name we use for 'rocksdb::Transaction'.
std::string MakeTransactionName(
    const std::string& state_ref,
    const std::string& transaction_id) {
  return fmt::format("{}:{}", state_ref, transaction_id);
}

////////////////////////////////////////////////////////////////////////

// Helper to convert raw transaction ID bytes (16 bytes) to the
// standard UUID string format (8-4-4-4-12). Works for any UUID
// version (v4, v7, etc.) unlike `UUID::fromBytes` which only handles
// v4 (at least the version that we are pinned using).
expected<std::string> TransactionIdFromBytes(const std::string& bytes) {
  if (bytes.size() != 16) {
    return make_unexpected(
        fmt::format(
            "Invalid transaction ID: expected 16 bytes, got {}",
            bytes.size()));
  }
  static constexpr char HEX[] = "0123456789abcdef";
  const auto* b = reinterpret_cast<const uint8_t*>(bytes.data());
  // 8-4-4-4-12 = 32 hex chars + 4 dashes = 36 chars.
  std::string result(36, '\0');
  size_t position = 0;
  for (size_t i = 0; i < 16; i++) {
    if (i == 4 || i == 6 || i == 8 || i == 10) {
      result[position++] = '-';
    }
    // Upper 4 bits of the byte -> first hex digit.
    result[position++] = HEX[b[i] >> 4];
    // Lower 4 bits of the byte -> second hex digit.
    result[position++] = HEX[b[i] & 0x0f];
  }
  return result;
}

////////////////////////////////////////////////////////////////////////

// Gets the transaction ID from a 'rocksdb::Transaction' based on the
// naming schema that we use in 'MakeTransactionName'.
std::string GetTransactionId(const LockableTransaction& txn) {
  // TODO(benh): use "string_view" version of 'absl::StrSplit' for
  // better performance.
  return std::vector<std::string>(absl::StrSplit(txn->GetName(), ':')).back();
}

////////////////////////////////////////////////////////////////////////

#define TRANSACTION_PARTICIPANT_KEY_PREFIX "transaction-participant"

// Returns a RocksDB key that represents a transaction participant.
std::string MakeTransactionParticipantKey(
    const std::string& state_type,
    const std::string& state_ref) {
  return fmt::format(
      TRANSACTION_PARTICIPANT_KEY_PREFIX ":{}:{}",
      state_type,
      state_ref);
}

////////////////////////////////////////////////////////////////////////

// Legacy prefix for coordinator transactions without shard information.
// Used for backward compatibility.
// (check_line_length skip)
#define LEGACY_PREPARED_TRANSACTION_COORDINATOR_KEY_PREFIX                     \
  "transaction-prepared"

// Prefix for shard-aware coordinator transactions.
//
// NOTE: the "prepared-" prefix in this key prefix is a remnant of the
// legacy semantics where only _prepared_ transactions were persisted,
// but now we also persist transactions that are _preparing_.
#define TRANSACTION_COORDINATOR_KEY_PREFIX "prepared-transaction-coordinator"

// Returns a RocksDB key that represents a transaction coordinator,
// including shard information.
std::string MakeTransactionCoordinatorKey(
    const std::string& shard_id,
    const std::string& transaction_id) {
  return fmt::format(
      TRANSACTION_COORDINATOR_KEY_PREFIX ":{}:{}",
      shard_id,
      transaction_id);
}

// Legacy function for backward compatibility. Returns a key without shard
// information.
std::string MakeLegacyTransactionPreparedKey(
    const std::string& transaction_id) {
  return fmt::format(
      LEGACY_PREPARED_TRANSACTION_COORDINATOR_KEY_PREFIX ":{}",
      transaction_id);
}

////////////////////////////////////////////////////////////////////////

// To ensure that we can handle failures during a migration we need to
// differentiate the key prefix. We only use a version suffix, i.e.,
// `_V3` on the old one so that the code doesn't have a mix of
// versions in it, it's only the migration code that uses the
// suffixes.
#define IDEMPOTENT_MUTATION_KEY_PREFIX_V3 "idempotent-mutation"
#define IDEMPOTENT_MUTATION_KEY_PREFIX "idempotent-mutation-v4"

// Idempotent mutations that expire use UUIDv7.
#define EXPIRING_IDEMPOTENT_MUTATION_KEY_PREFIX "expiring-idempotent-mutation"

// Workflow-scoped variants. We need both non-expiring and expiring
// prefixes because `.always()` creates expiring (UUIDv7) idempotency
// keys, and `.always()` can be called within a workflow.
#define WORKFLOW_IDEMPOTENT_MUTATION_KEY_PREFIX "workflow-idempotent-mutation"
#define WORKFLOW_EXPIRING_IDEMPOTENT_MUTATION_KEY_PREFIX                       \
  "workflow-expiring-idempotent-mutation"

// Workflow-iteration-scoped variants for control loop iterations.
// Unlike the workflow-scoped variants, we don't need an expiring
// prefix here: `.always()` (which creates expiring UUIDv7 keys)
// never passes a `workflow_iteration` header — only
// `.per_iteration()` does, and it uses deterministic,
// non-expiring keys.
#define WORKFLOW_ITERATION_IDEMPOTENT_MUTATION_KEY_PREFIX                      \
  "workflow-iteration-idempotent-mutation"

// Returns a key for storing in rocksdb that represents an idempotent
// mutation. Originally we used the stringified UUID to make debugging
// easier, but in practice that hasn't been valuable so for newer,
// expiring idempotency keys we simply store their bytes directly.
//
// When `workflow_id` is present, the key is prefixed with the
// workflow-scoped variant so that mutations within a workflow are
// isolated from mutations outside a workflow.
expected<std::string> MakeIdempotentMutationKey(
    const std::string& state_ref,
    const std::string& idempotency_key,
    const std::optional<std::string>& workflow_id = std::nullopt,
    const std::optional<uint64_t>& workflow_iteration = std::nullopt) {
  CHECK_EQ(idempotency_key.size(), 16)
      << "Expecting idempotency key to be the raw 16-byte format, "
      << "not the 36-character hex string representation";

  int version =
      static_cast<int>((static_cast<uint8_t>(idempotency_key[6]) >> 4) & 0x0F);

  if (workflow_id.has_value() && workflow_iteration.has_value()) {
    CHECK_EQ(workflow_id->size(), 16)
        << "Expecting workflow id to be the raw 16-byte format";

    if (version == 7) {
      // Iteration-scoped mutations are always non-expiring because
      // only `.per_iteration()` sets the `workflow_iteration` header,
      // and `.per_iteration()` uses deterministic (non-UUIDv7) keys.
      return make_unexpected(
          "Unexpected UUIDv7 (expiring) key for workflow iteration-scoped "
          "idempotent mutation");
    }

    return fmt::format(
        WORKFLOW_ITERATION_IDEMPOTENT_MUTATION_KEY_PREFIX ":{}:{}:{}:{}",
        state_ref,
        *workflow_id,
        *workflow_iteration,
        idempotency_key);
  }

  if (workflow_id.has_value()) {
    CHECK_EQ(workflow_id->size(), 16)
        << "Expecting workflow id to be the raw 16-byte format";

    if (version == 7) {
      return fmt::format(
          WORKFLOW_EXPIRING_IDEMPOTENT_MUTATION_KEY_PREFIX ":{}:{}:{}",
          state_ref,
          *workflow_id,
          idempotency_key);
    }

    return fmt::format(
        WORKFLOW_IDEMPOTENT_MUTATION_KEY_PREFIX ":{}:{}:{}",
        state_ref,
        *workflow_id,
        idempotency_key);
  }

  // We interpret UUIDv7 as an expiring idempotency key and use the
  // bytes directly as they are lexicographically ordered and are
  // roughly half the number of bytes as the stringified version.
  if (version == 7) {
    return fmt::format(
        EXPIRING_IDEMPOTENT_MUTATION_KEY_PREFIX ":{}:{}",
        state_ref,
        idempotency_key);
  }

  Try<UUID> uuid = UUID::fromBytes(idempotency_key);

  if (uuid.isError()) {
    return make_unexpected(uuid.error());
  }

  return fmt::format(
      IDEMPOTENT_MUTATION_KEY_PREFIX ":{}:{}",
      state_ref,
      uuid->toString());
}

////////////////////////////////////////////////////////////////////////

expected<stout::borrowed_ref<LockableTransaction>>
DatabaseService::LookupTransaction(
    const std::string& state_type,
    const std::string& state_ref) {
  std::lock_guard lock(txns_mutex_);

  // Determine whether we already have a transaction for this actor.
  auto iterator = txns_.find(state_ref);
  if (iterator != std::end(txns_)) {
    return iterator->second.Borrow();
  } else {
    return make_unexpected(
        fmt::format(
            "Missing transaction for state type '{}' actor '{}'",
            state_type,
            state_ref));
  }
}

////////////////////////////////////////////////////////////////////////

expected<stout::borrowed_ref<LockableTransaction>>
DatabaseService::LookupOrBeginTransaction(
    const Transaction& transaction,
    bool store_participant) {
  // Get out the _root_ transaction's ID, that's the transaction
  // that any nested transaction ultimately belongs.
  expected<std::string> transaction_id =
      TransactionIdFromBytes(transaction.transaction_ids(0));
  if (!transaction_id.has_value()) {
    return make_unexpected(
        fmt::format(
            "Failed to lookup or begin transaction for "
            "state type '{}' actor '{}': {}",
            transaction.state_type(),
            transaction.state_ref(),
            transaction_id.error()));
  }

  expected<stout::borrowed_ref<LockableTransaction>> txn =
      LookupTransaction(transaction.state_type(), transaction.state_ref());

  if (txn.has_value()) {
    // We already have a transaction for this actor. Presumably this
    // lookup is due to a write within that transaction, but we should
    // check that the requested transaction is the same as the one
    // that is ongoing because we can't have two different
    // transactions for the same actor at the same time.
    const std::string& name =
        MakeTransactionName(transaction.state_ref(), *transaction_id);

    std::lock_guard lock(**txn);

    if ((**txn)->GetName() == name) {
      return txn;
    } else {
      return make_unexpected(
          fmt::format(
              "Failed to begin transaction '{}' for state type '{}' actor '{}' "
              "as transaction '{}' has already begun",
              *transaction_id,
              transaction.state_type(),
              transaction.state_ref(),
              GetTransactionId(**txn)));
    }
  } else {
    // There is no stored transaction for this actor yet. Begin the
    // given transaction now.
    //
    // We persist the fact that we're participating in this
    // transaction _before_ we actually begin a transaction in
    // rocksdb, to avoid the following scenario:
    //
    // 1. A writer call calls 'Store', beginning this transaction in
    // memory. In this hypothetical world we don't persist anything
    // about the transaction yet.
    //
    // 2. We crash and restart.
    //
    // 3. Another writer calls 'Store' as part of the same
    // transaction. Whoever called that writer expects that that is
    // the second write in the transaction, but in fact we treat this
    // as the first call in a new transaction, having forgotten all
    // about the first write.
    //
    // 4. We participate in the transaction as normal, without any
    // chance for the coordinator to discover the missing write.  In
    // the future we can discover such discrepancies through other
    // methods (e.g., a write counter kept in memory, which must match
    // a write counter that gets aggregated and passed back up to the
    // coordinator), but for now we discover this issue by persisting
    // our participation in the transaction explicitly.
    //
    // TODO(benh): actually implement the recovery logic that uses
    // this persisted key to abort previously-started transactions.
    if (store_participant) {
      std::string data;
      if (!transaction.SerializeToString(&data)) {
        return make_unexpected(
            fmt::format(
                "Failed to begin transaction '{}': Failed to serialize",
                *transaction_id));
      }

      const std::string& key = MakeTransactionParticipantKey(
          transaction.state_type(),
          transaction.state_ref());

      // TODO(benh): CHECK 'key' is not found.
      rocksdb::Status status = db_->Put(
          DefaultWriteOptions(),
          rocksdb::Slice(key),
          rocksdb::Slice(data));

      if (!status.ok()) {
        return make_unexpected(
            fmt::format(
                "Failed to begin transaction '{}': {}",
                *transaction_id,
                status.ToString()));
      }
    }

    REBOOT_DATABASE_LOG(1) << "Beginning transaction '" << *transaction_id
                           << "' for state type '" << transaction.state_type()
                           << "' actor '" << transaction.state_ref() << "'";

    rocksdb::TransactionOptions txn_options;

    // NOTE: we ask rocksdb to fail if we have skipped prepare and
    // gone straight to commit using the 'skip_prepare' option to
    // help protect from our own code having a bug!
    txn_options.skip_prepare = false;

    rocksdb::Transaction* txn = db_->BeginTransaction(
        // TODO: It is not clear whether the `WriteOptions.sync` flag applies
        // to transactions, but we set it as a precaution. It's possible that
        // we could safely remove it.
        DefaultWriteOptions(),
        txn_options);

    if (txn == nullptr) {
      return make_unexpected(
          fmt::format(
              "Failed to begin transaction '{}': Unknown rocksdb failure",
              *transaction_id));
    }

    // We must name the transaction in order for rocksdb to persist
    // it when we prepare. We also use the name to be able to
    // determine whether or not we're in the same ongoing
    // transaction for future calls to 'LookupOrBeginTransaction'.
    rocksdb::Status status = txn->SetName(
        MakeTransactionName(transaction.state_ref(), *transaction_id));

    if (status.ok()) {
      std::lock_guard lock(txns_mutex_);
      auto [iterator, inserted] = txns_.try_emplace(
          transaction.state_ref(),
          std::unique_ptr<rocksdb::Transaction>(txn));
      CHECK(inserted);
      return iterator->second.Borrow();
    } else {
      delete txn;
      return make_unexpected(
          fmt::format(
              "Failed to begin transaction '{}': {}",
              *transaction_id,
              status.ToString()));
    }
  }
}

////////////////////////////////////////////////////////////////////////

void DatabaseService::DeleteTransaction(
    expected<stout::borrowed_ref<LockableTransaction>>&& txn) {
  std::lock_guard lock(txns_mutex_);

  auto iterator = [&]() {
    std::lock_guard lock(**txn);
    return txns_.find(GetStateRefFromTransaction(***txn));
  }();

  CHECK(iterator != std::end(txns_));

  // Before we erase we need to release the borrow so that it can be
  // deleted otherwise we'll hang forever! We accomplish that by
  // replacing 'txn' with an unexpected.
  txn = make_unexpected(std::string("Release the borrowed reference!"));

  txns_.erase(iterator);
}

////////////////////////////////////////////////////////////////////////

template <typename Batch>
expected<rocksdb::Status> DatabaseService::Apply(
    Batch& batch,
    const google::protobuf::RepeatedPtrField<Actor>& actor_upserts,
    const google::protobuf::RepeatedPtrField<Task>& task_upserts,
    const google::protobuf::RepeatedPtrField<ColocatedUpsert>&
        colocated_upserts,
    const google::protobuf::RepeatedPtrField<std::string>&
        ensure_state_types_created,
    const google::protobuf::RepeatedPtrField<IdempotentMutation>&
        idempotent_mutations) {
  // First add the actor upserts.
  for (const Actor& actor : actor_upserts) {
    if (!actor.has_state()) {
      return make_unexpected(
          fmt::format("Actor '{}' missing state to store", actor.state_ref()));
    }

    // NOTE: it's possible if we're within a transaction that
    // we'll create a column family that we won't end up putting
    // anything into because the transaction will abort. For now,
    // this will just be an empty column family, but we could
    // consider deleting any empty column families at a later
    // point, especially once we are rebalancing state types and
    // actors across multiple servers.

    expected<rocksdb::ColumnFamilyHandle*> column_family_handle =
        LookupOrCreateColumnFamilyHandle(actor.state_type());

    if (!column_family_handle.has_value()) {
      // Since the goal is to make all these updates
      // atomically we must fail if we run into any errors.
      return make_unexpected(column_family_handle.error());
    }

    const std::string& actor_state_key = MakeActorStateKey(actor.state_ref());

    rocksdb::Status status = batch.Put(
        *column_family_handle,
        rocksdb::Slice(actor_state_key),
        rocksdb::Slice(actor.state()));

    if (!status.ok()) {
      // Since the goal is to make all these updates
      // atomically we must fail if we run into any errors.
      return status;
    }
  }

  // Now add all the task upserts.
  for (const Task& task : task_upserts) {
    // NOTE: it's possible if we're within a transaction that
    // we'll create a column family that we won't end up putting
    // anything into because the transaction will abort. For now,
    // this will just be an empty column family, but we could
    // consider deleting any empty column families at a later
    // point, especially once we are rebalancing state types and
    // actors across multiple servers.

    expected<rocksdb::ColumnFamilyHandle*> column_family_handle =
        LookupOrCreateColumnFamilyHandle(task.task_id().state_type());

    if (!column_family_handle.has_value()) {
      // Since the goal is to make all these updates
      // atomically we must fail if we run into any errors.
      return make_unexpected(column_family_handle.error());
    }

    // Never expecting a task to be updated or inserted that isn't
    // either pending or completed.
    CHECK(task.status() == Task::PENDING || task.status() == Task::COMPLETED);

    const std::string& task_key = MakeTaskKey(task.status(), task.task_id());

    std::string serialized_task;
    if (!task.SerializeToString(&serialized_task)) {
      return make_unexpected(
          fmt::format("Failed to serialize task: {}", task.ShortDebugString()));
    }

    rocksdb::Status status = batch.Put(
        *column_family_handle,
        rocksdb::Slice(task_key),
        rocksdb::Slice(serialized_task));

    if (!status.ok()) {
      // Since the goal is to make all these updates
      // atomically we must fail if we run into any errors.
      return status;
    }

    // Also need to delete the pending task if it was already stored
    // in the database.
    if (task.status() == Task::COMPLETED) {
      status = batch.Delete(
          *column_family_handle,
          rocksdb::Slice(MakeTaskKey(Task::PENDING, task.task_id())));

      if (!status.ok()) {
        // Since the goal is to make all these updates
        // atomically we must fail if we run into any errors.
        return status;
      }
    }
  }

  // Then all colocated upserts.
  for (const ColocatedUpsert& cup : colocated_upserts) {
    expected<rocksdb::ColumnFamilyHandle*> column_family_handle =
        LookupOrCreateColumnFamilyHandle(cup.state_type());

    rocksdb::Status status;
    const std::string& key = MakeActorStateKey(cup.key());
    if (cup.has_value()) {
      status = batch.Put(
          *column_family_handle,
          rocksdb::Slice(key),
          rocksdb::Slice(cup.value()));
    } else {
      status = batch.Delete(*column_family_handle, rocksdb::Slice(key));
    }

    if (!status.ok()) {
      // Since the goal is to make all these updates
      // atomically we must fail if we run into any errors.
      return status;
    }
  }

  // Store idempotent mutations.
  for (const IdempotentMutation& mutation : idempotent_mutations) {
    expected<rocksdb::ColumnFamilyHandle*> column_family_handle =
        LookupOrCreateColumnFamilyHandle(mutation.state_type());

    if (!column_family_handle.has_value()) {
      return make_unexpected(column_family_handle.error());
    }

    std::optional<std::string> workflow_id;
    if (mutation.has_workflow_id()) {
      workflow_id = mutation.workflow_id();
    }

    std::optional<uint64_t> workflow_iteration;
    if (mutation.has_workflow_iteration()) {
      workflow_iteration = mutation.workflow_iteration();
    }

    expected<std::string> idempotent_mutation_key = MakeIdempotentMutationKey(
        mutation.state_ref(),
        mutation.key(),
        workflow_id,
        workflow_iteration);

    if (!idempotent_mutation_key.has_value()) {
      return make_unexpected(idempotent_mutation_key.error());
    }

    std::string idempotent_mutation_bytes;
    if (!mutation.SerializeToString(&idempotent_mutation_bytes)) {
      return make_unexpected("Failed to serialize 'IdempotentMutation'");
    }

    rocksdb::Status status = batch.Put(
        *column_family_handle,
        rocksdb::Slice(*idempotent_mutation_key),
        rocksdb::Slice(idempotent_mutation_bytes));

    if (!status.ok()) {
      // Since the goal is to make all these updates
      // atomically we must fail if we run into any errors.
      return status;
    }
  }

  // Ensure that any additional column families are created.
  for (auto& state_type : ensure_state_types_created) {
    expected<rocksdb::ColumnFamilyHandle*> column_family_handle =
        LookupOrCreateColumnFamilyHandle(state_type);

    if (!column_family_handle.has_value()) {
      // Since the goal is to make all these updates
      // atomically we must fail if we run into any errors.
      return make_unexpected(column_family_handle.error());
    }
  }

  return rocksdb::Status::OK();
}

////////////////////////////////////////////////////////////////////////

bool DatabaseService::HasTransaction(const std::string& state_ref) {
  std::lock_guard lock(txns_mutex_);
  return txns_.find(state_ref) != std::end(txns_);
}

////////////////////////////////////////////////////////////////////////

expected<std::unique_ptr<grpc::Service>> DatabaseService::Instantiate(
    const std::filesystem::path& state_directory,
    const ServerInfo& server_info) {
  REBOOT_DATABASE_LOG(1) << "Attempting to open rocksdb at '"
                         << state_directory.string() << "'";

  // First get out all of the column families that we have in the
  // database so we can open the database with column family handles.
  std::vector<std::string> column_families;

  rocksdb::Status status = rocksdb::DB::ListColumnFamilies(
      rocksdb::Options(),
      state_directory.string(),
      &column_families);

  if (!status.ok()) {
    // It's possible that the database has never been created, let's
    // try opening it brand new.
    //
    // Ideally we could set 'rocksdb::Options::create_if_missing'
    // before calling 'rocksdb::DB::ListColumnFamilies(...)' but it
    // isn't respected. Instead, we try and open or create it here.
    rocksdb::Options options;
    options.create_if_missing = true;

    rocksdb::DB* db = nullptr;

    REBOOT_DATABASE_LOG(1) << "Trying to open _new_ rocksdb at '"
                           << state_directory.string() << "'";

    status = rocksdb::DB::Open(options, state_directory.string(), &db);

    if (!status.ok()) {
      return make_unexpected(
          fmt::format(
              "Failed to open _new_ rocksdb at '{}': {}",
              state_directory.string(),
              status.ToString()));
    }

    // We've created a new database. Write the current persistence version and
    // the server info.
    expected<void> write_persistence_version =
        WritePersistenceVersion(db, CURRENT_PERSISTENCE_VERSION);
    if (!write_persistence_version.has_value()) {
      return make_unexpected(
          fmt::format(
              "Failed to write persistence version in _new_ rocksdb at '{}': "
              "{}",
              state_directory.string(),
              write_persistence_version.error()));
    }
    expected<void> write_server_info = WriteServerInfo(db, server_info);
    if (!write_server_info.has_value()) {
      return make_unexpected(
          fmt::format(
              "Failed to write server info in _new_ rocksdb at '{}': {}",
              state_directory.string(),
              write_server_info.error()));
    }

    // NOTE: If we do not flush, then immediately closing the database after
    // the above writes can cause corruption.
    status = db->Flush(rocksdb::FlushOptions());
    if (!status.ok()) {
      return make_unexpected(
          fmt::format(
              "Failed to flush metadata in new database: {}",
              status.ToString()));
    }

    // Then re-open it.
    delete db;

    status = rocksdb::DB::ListColumnFamilies(
        rocksdb::Options(),
        state_directory.string(),
        &column_families);

    if (!status.ok()) {
      return make_unexpected(
          fmt::format(
              "Failed to get column families in rocksdb: {}",
              status.ToString()));
    }
  }

  // Add all column families.
  std::vector<rocksdb::ColumnFamilyDescriptor> column_family_descriptors;
  for (const std::string& column_family : column_families) {
    column_family_descriptors.push_back(
        rocksdb::ColumnFamilyDescriptor(
            column_family,
            CreateColumnFamilyOptions()));
  }

  rocksdb::TransactionDBOptions txn_options;

  // By default rocksdb only persists transactions when they're
  // committed, so we change the write policy to persist
  // transactions at prepare since we are doing two phase commit.
  txn_options.write_policy = rocksdb::TxnDBWritePolicy::WRITE_PREPARED;

  std::vector<rocksdb::ColumnFamilyHandle*> column_family_handles;

  rocksdb::TransactionDB* txn_db = nullptr;

  std::shared_ptr<rocksdb::Statistics> statistics =
      rocksdb::CreateDBStatistics();
  rocksdb::Options db_options = rocksdb::Options();
  db_options.statistics = statistics;
  // Info logs are written to filenames which are prefixed with the absolute
  // path of the data directory, which is collision safe.
  db_options.db_log_dir = "/tmp/rocksdb";
  // TODO(rjh): use "production" values here when deployed on the Cloud. The
  //            default values are _extremely_ conservative. One LLM suggests:
  //            * table_options.block_cache = 60-70% of available RAM. This is
  //                  the most important setting, and ~1000x the default.
  //                  TODO: how much does it help in Reboot's write-heavy
  //                  workload?
  //            * db_options.write_buffer_size = 256 MB (per memtable).
  //            * db_options.max_write_buffer_number = 3 or 4.
  //            * db_options.db_write_buffer_size = 1GB (total across all column
  //                  families)
  //            * db_options.max_background_jobs = 50-75% of CPU cores
  //            * db_options.max_subcompactions = 4 (for parallelism)

  status = rocksdb::TransactionDB::Open(
      db_options,
      txn_options,
      state_directory.string(),
      column_family_descriptors,
      &column_family_handles,
      &txn_db);

  if (!status.ok()) {
    return make_unexpected(
        fmt::format(
            "Failed to open rocksdb at '{}': {}",
            state_directory.string(),
            status.ToString()));
  }

  // Validate that we are opening a store with the expected server info.
  expected<void> validate_server_info = ValidateServerInfo(txn_db, server_info);
  if (!validate_server_info.has_value()) {
    return make_unexpected(
        fmt::format(
            "Could not validate server information for '{}': {}",
            state_directory.string(),
            validate_server_info.error()));
  }

  REBOOT_DATABASE_LOG(1)
      << "Opened rocksdb at '" << state_directory.string()
      << "' with the following column family handles (i.e., state types): "
      << fmt::format("{}", column_families);

  // TODO(benh): iterate through key/values in rocksdb and log the
  // first two and last two for each column family for better
  // debugging when starting a sidecar, i.e., it will give a sense of
  // what is stored.

  return std::unique_ptr<grpc::Service>(new DatabaseService(
      state_directory,
      statistics,
      std::move(column_family_handles),
      std::unique_ptr<rocksdb::TransactionDB>(txn_db),
      server_info));
}

////////////////////////////////////////////////////////////////////////

grpc::Status DatabaseService::ColocatedRange(
    grpc::ServerContext* context,
    const ColocatedRangeRequest* request,
    ColocatedRangeResponse* response) {
  REBOOT_DATABASE_LOG(1) << "ColocatedRange { " << request->ShortDebugString()
                         << " }";

  expected<rocksdb::ColumnFamilyHandle*> column_family_handle =
      LookupColumnFamilyHandle(request->state_type());
  if (!column_family_handle.has_value()) {
    return grpc::Status(
        grpc::UNKNOWN,
        fmt::format("Unknown state_type: {}", column_family_handle.error()));
  }

  // Set the end of the range to scan.
  std::string end_key_str;
  if (request->has_end()) {
    // `iterate_upper_bound` is exclusive, so we can just use the end key.
    end_key_str = fmt::format(
        STATE_KEY_PREFIX ":{}{}{}",
        request->parent_state_ref(),
        '/',
        request->end());
  } else {
    // If uncapped, append '0', which sorts one higher than our separator ('/').
    end_key_str =
        fmt::format(STATE_KEY_PREFIX ":{}{}", request->parent_state_ref(), '0');
  }
  rocksdb::Slice end_key = rocksdb::Slice(end_key_str);
  rocksdb::ReadOptions read_options = rocksdb::ReadOptions();
  read_options.iterate_upper_bound = &end_key;

  auto scan = [&](std::unique_ptr<rocksdb::Iterator>&& iterator) {
    // Seek to the start of the range to scan.
    if (request->has_start()) {
      iterator->Seek(
          fmt::format(
              STATE_KEY_PREFIX ":{}{}{}",
              request->parent_state_ref(),
              '/',
              request->start()));
    } else {
      // If uncapped, append only a trailing forward slash.
      iterator->Seek(
          fmt::format(
              STATE_KEY_PREFIX ":{}{}",
              request->parent_state_ref(),
              '/'));
    }

    for (int i = 0; i < request->limit() && iterator->Valid();
         iterator->Next(), i++) {
      auto key = iterator->key();
      key.remove_prefix(strlen(STATE_KEY_PREFIX) + 1);
      *response->add_keys() = key.ToString();
      *response->add_values() = iterator->value().ToString();
    }

    return iterator->status();
  };

  rocksdb::Status status;

  if (request->has_transaction()) {
    // Invariant: if this call is made within a transaction, the transaction
    // must have already been stored. See:
    //   https://github.com/reboot-dev/mono/issues/4019.
    expected<stout::borrowed_ref<LockableTransaction>> txn = LookupTransaction(
        request->transaction().state_type(),
        request->transaction().state_ref());
    if (!txn.has_value()) {
      return grpc::Status(
          grpc::UNKNOWN,
          fmt::format(
              "No active transaction found for state type '{}' actor '{}'",
              request->transaction().state_type(),
              request->transaction().state_ref()));
    }
    std::lock_guard lock(**txn);
    status = scan(
        std::unique_ptr<rocksdb::Iterator>(CHECK_NOTNULL(
            (**txn)->GetIterator(read_options, *column_family_handle))));
  } else {
    status = scan(
        std::unique_ptr<rocksdb::Iterator>(CHECK_NOTNULL(
            db_->NewIterator(read_options, *column_family_handle))));
  }

  if (!status.ok()) {
    return grpc::Status(
        grpc::UNKNOWN,
        fmt::format(
            "Failed to scan { {} }: {}",
            request->ShortDebugString(),
            status.ToString()));
  }

  return grpc::Status::OK;
}

////////////////////////////////////////////////////////////////////////

grpc::Status DatabaseService::ColocatedReverseRange(
    grpc::ServerContext* context,
    const ColocatedReverseRangeRequest* request,
    ColocatedReverseRangeResponse* response) {
  REBOOT_DATABASE_LOG(1) << "ColocatedReverseRange { "
                         << request->ShortDebugString() << " }";

  expected<rocksdb::ColumnFamilyHandle*> column_family_handle =
      LookupColumnFamilyHandle(request->state_type());
  if (!column_family_handle.has_value()) {
    return grpc::Status(
        grpc::UNKNOWN,
        fmt::format("Unknown state_type: {}", column_family_handle.error()));
  }

  // Set the end of the range to scan.
  std::string end_key_str;
  if (request->has_end()) {
    // The RocksDB API we use below (`iterate_lower_bound`) is inclusive but the
    // end of the scan range should be exclusive. To ensure the end key is
    // omitted from the scan, append a NUL byte.
    end_key_str = fmt::format(
        STATE_KEY_PREFIX ":{}{}{}{}",
        request->parent_state_ref(),
        '/',
        request->end(),
        '\0');
  } else {
    // If uncapped, append only a trailing forward slash. This is safe because
    // we don't allow the empty string to be a valid key.
    end_key_str =
        fmt::format(STATE_KEY_PREFIX ":{}{}", request->parent_state_ref(), '/');
  }

  // Disable the prefix seek optimization, for two reasons:
  //    (1) When no `start_key` is specified, we need a way to iterate starting
  //    from the largest key that might appear in the map. We currently do that
  //    by appending a "0", which breaks the prefix key optimization as
  //    implemented by PrefixToLastFSlashExtractor.
  //
  //    (2) "Using prefix mode to iterate in reverse order ... is not yet
  //     supported" (https://github.com/facebook/rocksdb/wiki/Prefix-Seek).
  rocksdb::ReadOptions read_options = NonPrefixIteratorReadOptions();

  rocksdb::Slice end_key = rocksdb::Slice(end_key_str);
  read_options.iterate_lower_bound = &end_key;

  auto scan = [&](std::unique_ptr<rocksdb::Iterator>&& iterator) {
    // Seek to the start of the range to scan.
    if (request->has_start()) {
      iterator->SeekForPrev(
          fmt::format(
              STATE_KEY_PREFIX ":{}{}{}",
              request->parent_state_ref(),
              '/',
              request->start()));
    } else {
      // If uncapped, append '0', which sorts one higher than our separator
      // ('/'). As noted above, this is incompatible with the prefix seek
      // optimization in RocksDB.
      iterator->SeekForPrev(
          fmt::format(
              STATE_KEY_PREFIX ":{}{}",
              request->parent_state_ref(),
              '0'));
    }

    for (int i = 0; i < request->limit() && iterator->Valid();
         iterator->Prev(), i++) {
      auto key = iterator->key();
      key.remove_prefix(strlen(STATE_KEY_PREFIX) + 1);
      *response->add_keys() = key.ToString();
      *response->add_values() = iterator->value().ToString();
    }

    return iterator->status();
  };

  rocksdb::Status status;

  if (request->has_transaction()) {
    // Invariant: if this call is made within a transaction, the transaction
    // must have already been stored. See:
    //   https://github.com/reboot-dev/mono/issues/4019.
    expected<stout::borrowed_ref<LockableTransaction>> txn = LookupTransaction(
        request->transaction().state_type(),
        request->transaction().state_ref());
    if (!txn.has_value()) {
      return grpc::Status(
          grpc::UNKNOWN,
          fmt::format(
              "No active transaction found for state type '{}' actor '{}'",
              request->transaction().state_type(),
              request->transaction().state_ref()));
    }
    std::lock_guard lock(**txn);
    status = scan(
        std::unique_ptr<rocksdb::Iterator>(CHECK_NOTNULL(
            (**txn)->GetIterator(read_options, *column_family_handle))));
  } else {
    status = scan(
        std::unique_ptr<rocksdb::Iterator>(CHECK_NOTNULL(
            db_->NewIterator(read_options, *column_family_handle))));
  }

  if (!status.ok()) {
    return grpc::Status(
        grpc::UNKNOWN,
        fmt::format(
            "Failed to scan { {} }: {}",
            request->ShortDebugString(),
            status.ToString()));
  }

  return grpc::Status::OK;
}

////////////////////////////////////////////////////////////////////////

grpc::Status DatabaseService::Find(
    grpc::ServerContext* context,
    const FindRequest* request,
    FindResponse* response) {
  REBOOT_DATABASE_LOG(1) << "Find { " << request->ShortDebugString() << " }";

  // Validate that shard_ids are provided.
  if (request->shard_ids().empty()) {
    return grpc::Status(
        grpc::INVALID_ARGUMENT,
        "shard_ids are required for Find request");
  }

  // Convert to unordered_set for efficient lookups.
  std::unordered_set<std::string> shard_ids(
      request->shard_ids().begin(),
      request->shard_ids().end());

  // Column family handles are never deleted once created, so the
  // returned pointer remains valid for the lifetime of this call.
  expected<rocksdb::ColumnFamilyHandle*> column_family_handle =
      LookupColumnFamilyHandle(request->state_type());
  if (!column_family_handle.has_value()) {
    // Return empty results for unknown state types rather than an error.
    // This is important because callers (like SidecarStateManager.actors())
    // may query for state types that haven't been created yet. A state
    // type's column family is only created when the first actor of that
    // type is stored, so returning an empty result correctly indicates
    // there are no actors of this type yet.
    return grpc::Status::OK;
  }

  // Use NonPrefixIteratorReadOptions to ensure we iterate over all keys
  // in total order. This is necessary because we have a prefix extractor
  // configured, and using the default ReadOptions could cause the iterator
  // to skip keys due to prefix optimization.
  // `db_->NewIterator()` is thread-safe and captures an implicit
  // snapshot of the DB state at the moment of iterator creation.
  // See https://github.com/facebook/rocksdb/wiki/Iterator#consistent-view
  // https://github.com/facebook/rocksdb/wiki/RocksDB-FAQ
  // Concurrent writes after that point are invisible to the iterator,
  // so we get a consistent read without holding `mutex_` across the
  // iteration.
  rocksdb::ReadOptions read_options = NonPrefixIteratorReadOptions();
  std::unique_ptr<rocksdb::Iterator> iterator(
      db_->NewIterator(read_options, *column_family_handle));

  if (request->has_start()) {
    // Forward pagination from a specific key.
    const auto& start_key = request->start();
    std::string start_key_ref = MakeActorStateKey(start_key.state_ref());

    // Start at the specified key (inclusive).
    iterator->Seek(start_key_ref);

    if (start_key.exclusive() && iterator->Valid()
        && iterator->key().ToString() == start_key_ref) {
      // Start after the specified key.
      iterator->Next();
    }

    // Collect up to 'limit' entries going forward.
    uint32_t added_count = 0;

    // We don't know how many iterations we'll need to do to find `limit`
    // matching entries. To perform `IsCancelled()` checks with the
    // same frequency we use a separate counter.
    uint8_t cancellation_check_counter = 0;

    while (added_count < request->limit() && iterator->Valid()) {
      // Despite the RPC is unary, it may be a "long-running" RPC if the
      // limit is large, so we want to check is the context is cancelled
      // so we will return early.
      // https://github.com/reboot-dev/mono/issues/5349
      //
      // Performing `IsCancelled()` checks is relatively expensive due to
      // a `seq_cst` atomic load and there is no reason to check on every
      // iteration.
      //
      // TODO: Remove that code once we make `Find` be a streaming RPC
      // or support pagination.
      // https://github.com/reboot-dev/mono/issues/5360
      if (++cancellation_check_counter == 100) {
        // To not overflow the counter, we reset it each time we do a
        // check.
        cancellation_check_counter = 0;
        if (context->IsCancelled()) {
          return grpc::Status::CANCELLED;
        }
      }
      std::string_view key_view = iterator->key().ToStringView();
      const std::string prefix = STATE_KEY_PREFIX ":";
      if (key_view.size() < prefix.size()
          || key_view.substr(0, prefix.size()) != prefix) {
        // We've reached a key that doesn't belong to actor state.
        break;
      }
      std::string_view state_ref = GetStateRefFromActorStateKey(key_view);
      // Only include state refs that belong to the requested shards.
      if (BelongsToShard(request->state_type(), state_ref, shard_ids)) {
        response->add_state_refs(std::string(state_ref));
        ++added_count;
      }
      iterator->Next();
    }
  } else if (request->has_until()) {
    // Backward pagination before a specific key.
    const auto& until_key = request->until();
    std::string until_key_ref = MakeActorStateKey(until_key.state_ref());

    // End at the specified key (inclusive).
    iterator->SeekForPrev(until_key_ref);

    if (until_key.exclusive() && iterator->Valid()
        && iterator->key().ToString() == until_key_ref) {
      // End before the specified key.
      iterator->Prev();
    }

    // Collect up to 'limit' entries going backward, but we need to
    // reverse them since we want to return in forward order.
    std::vector<std::string> state_refs;
    uint32_t added_count = 0;

    // We don't know how many iterations we'll need to do to find `limit`
    // matching entries. To perform `IsCancelled()` checks with the
    // same frequency we use a separate counter.
    uint8_t cancellation_check_counter = 0;

    while (added_count < request->limit() && iterator->Valid()) {
      // Despite the RPC is unary, it may be a "long-running" RPC if the
      // limit is large, so we want to check is the context is cancelled
      // so we will return early.
      // https://github.com/reboot-dev/mono/issues/5349
      //
      // Performing `IsCancelled()` checks is relatively expensive due to
      // a `seq_cst` atomic load and there is no reason to check on every
      // iteration.
      //
      // TODO: Remove that code once we make `Find` be a streaming RPC
      // or support pagination.
      // https://github.com/reboot-dev/mono/issues/5360
      if (++cancellation_check_counter == 100) {
        // To not overflow the counter, we reset it each time we do a
        // check.
        cancellation_check_counter = 0;
        if (context->IsCancelled()) {
          return grpc::Status::CANCELLED;
        }
      }
      std::string_view key_view = iterator->key().ToStringView();
      const std::string prefix = STATE_KEY_PREFIX ":";
      if (key_view.size() < prefix.size()
          || key_view.substr(0, prefix.size()) != prefix) {
        // We've reached a key that doesn't belong to actor state.
        break;
      }
      std::string_view state_ref = GetStateRefFromActorStateKey(key_view);
      // Only include state refs that belong to the requested shards.
      if (BelongsToShard(request->state_type(), state_ref, shard_ids)) {
        state_refs.push_back(std::string(state_ref));
        ++added_count;
      }
      iterator->Prev();
    }

    // Reverse to maintain forward order in the response.
    response->mutable_state_refs()->Add(state_refs.rbegin(), state_refs.rend());
  } else {
    // No direction specified. Technically possible, but not supported.
    return grpc::Status(
        grpc::INVALID_ARGUMENT,
        "Must specify either 'start' or 'until' direction");
  }

  if (!iterator->status().ok()) {
    return grpc::Status(
        grpc::UNKNOWN,
        fmt::format("Failed to iterate: {}", iterator->status().ToString()));
  }

  return grpc::Status::OK;
}

////////////////////////////////////////////////////////////////////////

grpc::Status DatabaseService::Load(
    grpc::ServerContext* context,
    const LoadRequest* request,
    LoadResponse* response) {
  REBOOT_DATABASE_LOG(1) << "Load { " << request->ShortDebugString() << " }";

  // Piggyback the current timestamp for refresh.
  *response->mutable_timestamp() = monotonic_clock_->Now();

  std::vector<rocksdb::ColumnFamilyHandle*> column_families;
  std::vector<std::string> keys;

  // Add all the requested actors to our lists of column families and keys
  // to fetch. Also keep a parallel vector of actor IDs we're planning to
  // fetch, so that we can match up fetched state with actor IDs.
  std::vector<const Actor*> actors_to_load;
  for (const Actor& actor : request->actors()) {
    expected<rocksdb::ColumnFamilyHandle*> column_family_handle =
        LookupColumnFamilyHandle(actor.state_type());

    if (!column_family_handle.has_value()) {
      // Service is unknown. We don't have the context to decide here
      // whether that's an illegal state for the caller, and even if it
      // is, we'd like to complete other batched loads if possible, so we
      // just drop this entry from our list of actors to load.
      continue;
    }

    actors_to_load.push_back(&actor);
    column_families.push_back(*column_family_handle);
    keys.push_back(MakeActorStateKey(actor.state_ref()));
  }

  // Now add all the tasks. We'll fetch the whole Task object, so we don't
  // need to hold onto the IDs in a separate list to tell which one is
  // which.
  for (const TaskId& task_id : request->task_ids()) {
    expected<rocksdb::ColumnFamilyHandle*> column_family_handle =
        LookupColumnFamilyHandle(task_id.state_type());

    if (!column_family_handle.has_value()) {
      // Service is unknown. We don't have the context to decide here
      // whether that's an illegal state for the caller, and even if it
      // is, we'd like to complete other batched loads if possible, so we
      // just drop this entry from our list of tasks to load.
      continue;
    }

    // We don't know the status of this task, so we'll try and fetch
    // it in all possible statuses we expect.
    CHECK_EQ(Task::Status_descriptor()->value_count(), 3);

    column_families.push_back(*column_family_handle);
    keys.push_back(MakeTaskKey(Task::PENDING, task_id));

    column_families.push_back(*column_family_handle);
    keys.push_back(MakeTaskKey(Task::COMPLETED, task_id));
  }

  // We should add a column family for every key. Just to be sure:
  CHECK(keys.size() == column_families.size());

  std::vector<rocksdb::Slice> slice_keys;
  for (const std::string& key : keys) {
    slice_keys.emplace_back(key);
  }

  std::vector<std::string> values;
  values.resize(keys.size());
  std::vector<rocksdb::Status> statuses = db_->MultiGet(
      rocksdb::ReadOptions(),
      column_families,
      slice_keys,
      &values);

  for (int i = 0; i < statuses.size(); i++) {
    const rocksdb::Status& status = statuses[i];
    if (status.IsNotFound()) {
      // This key wasn't found; skip it.
      continue;
    } else if (status.ok()) {
      // Our list of keys starts with all the actors and ends with all the
      // tasks, so we can identify the type of each result by the number
      // of actors we were trying to load.
      if (i < actors_to_load.size()) {
        Actor& actor = *response->add_actors();
        actor.CopyFrom(*actors_to_load[i]);
        actor.set_state(values[i]);
      } else {
        Task& task = *response->add_tasks();
        // TODO: We are currently deserializing the Task into a proto
        // object, just to immediately re-serialize it and send it back
        // over the wire. Consider a structure where we can keep the
        // Task in the serialized format through this handoff.
        CHECK(task.ParseFromString(values[i]));
      }
    } else {
      return grpc::Status(
          grpc::UNKNOWN,
          fmt::format("Failed to load: {}", status.ToString()));
    }
  }

  return grpc::Status::OK;
}

////////////////////////////////////////////////////////////////////////

// Helper that extracts the state_type/actor for a store request that is
// being made within a transaction. Also validates that the request
// only has one state_type/actor for all actor and task upserts.
expected<void> ValidateTransactionalStore(const StoreRequest& request) {
  // If we're in a transaction then all of the upserts must be
  // for the same state_type/actor.
  std::optional<std::string> state_type = std::nullopt;
  std::optional<std::string> state_ref = std::nullopt;

  auto CheckAllUpsertsForSameActor =
      [&](const std::string& actor_or_task_state_type,
          const std::string& actor_or_task_state_ref) {
        if (!state_type.has_value()) {
          CHECK(!state_ref.has_value());
          state_type = actor_or_task_state_type;
          state_ref = actor_or_task_state_ref;
          return true;
        } else {
          return state_type.value() == actor_or_task_state_type
              && state_ref.value() == actor_or_task_state_ref;
        }
      };

  // Ensure that all actor upserts are for the same actor.
  for (const Actor& actor : request.actor_upserts()) {
    if (!CheckAllUpsertsForSameActor(actor.state_type(), actor.state_ref())) {
      return make_unexpected(
          "All actor upserts within a transaction "
          "must be for the same actor");
    }
  }

  // Ensure that all task upserts are for the same actor.
  for (const Task& task : request.task_upserts()) {
    if (!CheckAllUpsertsForSameActor(
            task.task_id().state_type(),
            task.task_id().state_ref())) {
      return make_unexpected(
          "All task upserts within a transaction "
          "must be for the same actor");
    }
  }

  return {};
}

////////////////////////////////////////////////////////////////////////

// Helper that extracts the state_type/actor for a store request that is
// being made within a transaction. Also validates that the request
// only has one state_type/actor for all actor and task upserts.
expected<void> DatabaseService::ValidateNonTransactionalStore(
    const StoreRequest& request) {
  for (const Actor& actor : request.actor_upserts()) {
    if (HasTransaction(actor.state_ref())) {
      return make_unexpected(
          "Attempt to store outside of a transaction while "
          "there is an ongoing transaction");
    }
  }

  for (const Task& task : request.task_upserts()) {
    if (HasTransaction(task.task_id().state_ref())) {
      return make_unexpected(
          "Attempt to store outside of a transaction while "
          "there is an ongoing transaction");
    }
  }

  return {};
}

////////////////////////////////////////////////////////////////////////

grpc::Status DatabaseService::Store(
    grpc::ServerContext* context,
    const StoreRequest* request,
    StoreResponse* response) {
  REBOOT_DATABASE_LOG(1) << "Store { " << request->ShortDebugString() << " }";

  // Piggyback the current timestamp for refresh.
  *response->mutable_timestamp() = monotonic_clock_->Now();

  // Wrap the single optional idempotent mutation from the
  // `StoreRequest` into a `RepeatedPtrField` so that it can
  // be passed to `Apply()` which takes a repeated field (to
  // also support the `TransactionParticipantPrepare` path
  // which has multiple idempotent mutations).
  google::protobuf::RepeatedPtrField<IdempotentMutation> idempotent_mutations;
  if (request->has_idempotent_mutation()) {
    *idempotent_mutations.Add() = request->idempotent_mutation();
  }

  if (request->has_transaction()) {
    // Request is within a transaction, look it up or begin it
    // if we do not yet have an ongoing transaction.
    expected<void> validate = ValidateTransactionalStore(*request);

    if (!validate.has_value()) {
      return grpc::Status(
          grpc::UNKNOWN,
          fmt::format("Failed to store: {}", validate.error()));
    }

    expected<stout::borrowed_ref<LockableTransaction>> txn =
        LookupOrBeginTransaction(request->transaction());

    if (!txn.has_value()) {
      return grpc::Status(
          grpc::UNKNOWN,
          fmt::format("Failed to store: {}", txn.error()));
    }

    std::lock_guard lock(**txn);

    // Add all the updates from this request into the
    // transaction which will, if committed, apply them
    // atomically.
    expected<rocksdb::Status> status = Apply(
        ***txn,
        request->actor_upserts(),
        request->task_upserts(),
        request->colocated_upserts(),
        request->ensure_state_types_created(),
        idempotent_mutations);

    if (!status.has_value()) {
      return grpc::Status(
          grpc::UNKNOWN,
          fmt::format("Failed to update batch: {}", status.error()));
    } else if (!status->ok()) {
      return grpc::Status(
          grpc::UNKNOWN,
          fmt::format("Failed to update batch: {}", status->ToString()));
    }

    return grpc::Status::OK;
  } else {
    // Request is not within a transaction, let's validate we
    // don't have an ongoing transaction!
    expected<void> validate = ValidateNonTransactionalStore(*request);

    if (!validate.has_value()) {
      return grpc::Status(
          grpc::UNKNOWN,
          fmt::format("Failed to store: {}", validate.error()));
    }

    // Add all the updates from this request into a single
    // WriteBatch so that they will get applied atomically.
    rocksdb::WriteBatch batch;

    expected<rocksdb::Status> status = Apply(
        batch,
        request->actor_upserts(),
        request->task_upserts(),
        request->colocated_upserts(),
        request->ensure_state_types_created(),
        idempotent_mutations);

    if (!status.has_value()) {
      return grpc::Status(
          grpc::UNKNOWN,
          fmt::format("Failed to update batch: {}", status.error()));
    } else if (!status->ok()) {
      return grpc::Status(
          grpc::UNKNOWN,
          fmt::format("Failed to update batch: {}", status->ToString()));
    }

    status = db_->Write(DefaultWriteOptions(request->sync()), &batch);

    CHECK(status.has_value());

    if (status->ok()) {
      return grpc::Status::OK;
    } else {
      return grpc::Status(
          grpc::UNKNOWN,
          fmt::format("Failed to store: {}", status->ToString()));
    }
  }
}

////////////////////////////////////////////////////////////////////////

grpc::Status DatabaseService::TransactionParticipantPrepare(
    grpc::ServerContext* context,
    const TransactionParticipantPrepareRequest* request,
    TransactionParticipantPrepareResponse* response) {
  REBOOT_DATABASE_LOG(1) << "TransactionParticipantPrepare { "
                         << request->ShortDebugString() << " }";

  // Piggyback the current timestamp for refresh.
  *response->mutable_timestamp() = monotonic_clock_->Now();

  // If the participant deferred its initial store because restart
  // detection eliminated the need, we'll have a transaction now and
  // must begin it.
  if (request->has_transaction()) {
    expected<stout::borrowed_ref<LockableTransaction>> txn =
        LookupOrBeginTransaction(request->transaction());

    if (!txn.has_value()) {
      return grpc::Status(
          grpc::UNKNOWN,
          fmt::format("Failed to begin transaction: {}", txn.error()));
    }
  }

  expected<stout::borrowed_ref<LockableTransaction>> txn =
      LookupTransaction(request->state_type(), request->state_ref());

  if (!txn.has_value()) {
    return grpc::Status(
        grpc::UNKNOWN,
        fmt::format("Failed to prepare transaction: {}", txn.error()));
  }

  std::lock_guard lock(**txn);

  // When using restart detection all intermediate writes within the
  // transaction were kept in memory and thus we need to apply them
  // now.
  if (request->has_transaction()) {
    // Construct the actor upsert from the serialized state and the
    // `state_type`/`state_ref` from the transaction.
    google::protobuf::RepeatedPtrField<Actor> actor_upserts;
    if (request->has_state()) {
      Actor* actor = actor_upserts.Add();
      actor->set_state_type(request->state_type());
      actor->set_state_ref(request->state_ref());
      actor->set_state(request->state());
    }

    expected<rocksdb::Status> status = Apply(
        ***txn,
        actor_upserts,
        request->task_upserts(),
        // No colocated upserts or ensure_state_types_created —
        // `SortedMap` is excluded from restart detection so colocated
        // writes never appear here, and column family creation is
        // handled above by `LookupOrBeginTransaction`.
        {},
        {},
        request->idempotent_mutations());

    if (!status.has_value()) {
      return grpc::Status(
          grpc::UNKNOWN,
          fmt::format("Failed to apply deferred writes: {}", status.error()));
    } else if (!status->ok()) {
      return grpc::Status(
          grpc::UNKNOWN,
          fmt::format(
              "Failed to apply deferred writes: {}",
              status->ToString()));
    }
  }

  // NOTE: we add the deletion of the transaction participant
  // key/value within the 'transaction' because we want it to be
  // deleted atomically with respect to the transaction
  // committing.

  const std::string& key = MakeTransactionParticipantKey(
      request->state_type(),
      request->state_ref());

  rocksdb::Status status = (**txn)->Delete(rocksdb::Slice(key));

  if (!status.ok()) {
    return grpc::Status(
        grpc::UNKNOWN,
        fmt::format(
            "Failed to delete transaction participant: {}",
            status.ToString()));
  }

  status = (**txn)->Prepare();

  if (status.ok()) {
    return grpc::Status::OK;
  } else {
    return grpc::Status(
        grpc::UNKNOWN,
        fmt::format("Failed to prepare transaction: {}", status.ToString()));
  }
}

////////////////////////////////////////////////////////////////////////

grpc::Status DatabaseService::TransactionParticipantCommit(
    grpc::ServerContext* context,
    const TransactionParticipantCommitRequest* request,
    TransactionParticipantCommitResponse* response) {
  REBOOT_DATABASE_LOG(1) << "TransactionParticipantCommit { "
                         << request->ShortDebugString() << " }";

  // Piggyback the current timestamp for refresh.
  *response->mutable_timestamp() = monotonic_clock_->Now();

  expected<stout::borrowed_ref<LockableTransaction>> txn =
      LookupTransaction(request->state_type(), request->state_ref());

  if (!txn.has_value()) {
    return grpc::Status(
        grpc::UNKNOWN,
        fmt::format("Failed to commit transaction: {}", txn.error()));
  }

  rocksdb::Status status = [&]() {
    std::lock_guard lock(**txn);
    return (**txn)->Commit();
  }();

  if (status.ok()) {
    // TODO(benh): do we want to keep anything around about the
    // transaction in case it gets used again incorrectly?
    DeleteTransaction(std::move(txn));

    return grpc::Status::OK;
  } else {
    // NOTE: invariant here is that this will/should get
    // retried, either by a coordinator that is trying to
    // converge on getting its transaction to commit, or by a
    // participant watch that notices the transaction should be
    // committed.
    return grpc::Status(
        grpc::UNKNOWN,
        fmt::format("Failed to commit transaction: {}", status.ToString()));
  }
}

////////////////////////////////////////////////////////////////////////

grpc::Status DatabaseService::TransactionParticipantAbort(
    grpc::ServerContext* context,
    const TransactionParticipantAbortRequest* request,
    TransactionParticipantAbortResponse* response) {
  REBOOT_DATABASE_LOG(1) << "TransactionParticipantAbort { "
                         << request->ShortDebugString() << " }";

  expected<stout::borrowed_ref<LockableTransaction>> txn =
      LookupTransaction(request->state_type(), request->state_ref());

  if (!txn.has_value()) {
    // No RocksDB transaction exists for this state, so there is
    // nothing to roll back. This is not an error as a server may call
    // abort without knowing whether or not it has successfully
    // prepared when we are using restart detection.
    return grpc::Status::OK;
  }

  rocksdb::Status status = [&]() {
    std::lock_guard lock(**txn);
    return (**txn)->Rollback();
  }();

  if (!status.ok()) {
    return grpc::Status(
        grpc::UNKNOWN,
        fmt::format("Failed to abort transaction: {}", status.ToString()));
  }

  // NOTE: we need to delete the transaction participant
  // key/value and it's possible that we may fail before doing
  // so. If this happens when we restart we'll think we're
  // within a transaction and the "watch control loop" will sort
  // out that we're not within a transaction and call into this
  // abort here.

  const std::string& key = MakeTransactionParticipantKey(
      request->state_type(),
      request->state_ref());

  status = db_->Delete(DefaultWriteOptions(), rocksdb::Slice(key));

  if (status.ok()) {
    // TODO(benh): do we want to keep anything around about the
    // transaction in case it gets used again incorrectly?
    DeleteTransaction(std::move(txn));

    return grpc::Status::OK;
  } else {
    return grpc::Status(
        grpc::UNKNOWN,
        fmt::format(
            "Failed to delete transaction participant: {}",
            status.ToString()));
  }
}

////////////////////////////////////////////////////////////////////////

grpc::Status DatabaseService::TransactionCoordinatorPrepared(
    grpc::ServerContext* context,
    const TransactionCoordinatorPreparedRequest* request,
    TransactionCoordinatorPreparedResponse* response) {
  REBOOT_DATABASE_LOG(1) << "TransactionCoordinatorPrepared { "
                         << request->ShortDebugString() << " }";

  // Piggyback the current timestamp for refresh.
  *response->mutable_timestamp() = monotonic_clock_->Now();

  // Get out the transaction's ID.
  expected<std::string> transaction_id =
      TransactionIdFromBytes(request->transaction_id());
  if (!transaction_id.has_value()) {
    return grpc::Status(
        grpc::UNKNOWN,
        fmt::format(
            "Failed to store transaction as prepared: {}",
            transaction_id.error()));
  }

  std::string key;
  std::string data;

  if (request->has_transaction_coordinator()) {
    // New format with shard-aware storage.
    const auto& coordinator = request->transaction_coordinator();

    // Compute shard ID based on the coordinator's state_ref.
    std::string shard_id = GetShardForStateRef(coordinator.state_ref());
    key = MakeTransactionCoordinatorKey(shard_id, *transaction_id);

    if (!coordinator.SerializeToString(&data)) {
      return grpc::Status(
          grpc::UNKNOWN,
          fmt::format(
              "Failed to store transaction '{}' as prepared: "
              "Failed to serialize",
              *transaction_id));
    }
  } else {
    if (!allow_legacy_coordinator_prepared_) {
      return grpc::Status(
          grpc::INVALID_ARGUMENT,
          fmt::format(
              "Legacy coordinator prepared format is not allowed. "
              "Transaction '{}' must use the new format with "
              "transaction_coordinator field.",
              *transaction_id));
    }

    // This is deprecated but kept to test our backwards compatibility story.
    key = MakeLegacyTransactionPreparedKey(*transaction_id);
    if (!request->participants().SerializeToString(&data)) {
      return grpc::Status(
          grpc::UNKNOWN,
          fmt::format(
              "Failed to store transaction '{}' as prepared: "
              "Failed to serialize",
              *transaction_id));
    }
  }

  // NOTE: when `TransactionCoordinatorPrepare` has been called
  // first, there will already be a key for this transaction with
  // `preparing = true`. This call overwrites it with
  // `preparing = false` (the default), marking the transaction
  // as fully prepared.

  // The "commit control loop" deletes this via
  // `TransactionCoordinatorCleanup`.
  rocksdb::Status status = db_->Put(
      DefaultWriteOptions(),
      rocksdb::Slice(key),
      rocksdb::Slice(data));

  if (status.ok()) {
    return grpc::Status::OK;
  } else {
    return grpc::Status(
        grpc::UNKNOWN,
        fmt::format("Failed to store: {}", status.ToString()));
  }
}

////////////////////////////////////////////////////////////////////////

grpc::Status DatabaseService::TransactionCoordinatorPrepare(
    grpc::ServerContext* context,
    const TransactionCoordinatorPrepareRequest* request,
    TransactionCoordinatorPrepareResponse* response) {
  REBOOT_DATABASE_LOG(1) << "TransactionCoordinatorPrepare { "
                         << request->ShortDebugString() << " }";

  // Piggyback the current timestamp for refresh.
  *response->mutable_timestamp() = monotonic_clock_->Now();

  // Get out the transaction's ID.
  expected<std::string> transaction_id =
      TransactionIdFromBytes(request->transaction_id());
  if (!transaction_id.has_value()) {
    return grpc::Status(
        grpc::UNKNOWN,
        fmt::format(
            "Failed to store coordinator prepare: {}",
            transaction_id.error()));
  }

  if (!request->has_transaction_coordinator()) {
    return grpc::Status(
        grpc::INVALID_ARGUMENT,
        fmt::format(
            "Transaction '{}' must provide transaction_coordinator.",
            *transaction_id));
  }

  // Copy the coordinator proto and ensure `preparing` is true.
  TransactionCoordinator coordinator = request->transaction_coordinator();
  coordinator.set_preparing(true);

  // Compute shard ID based on the coordinator's `state_ref`.
  std::string shard_id = GetShardForStateRef(coordinator.state_ref());
  std::string key = MakeTransactionCoordinatorKey(shard_id, *transaction_id);

  std::string data;
  if (!coordinator.SerializeToString(&data)) {
    return grpc::Status(
        grpc::UNKNOWN,
        fmt::format(
            "Failed to store coordinator prepare for "
            "transaction '{}': Failed to serialize",
            *transaction_id));
  }

  // The "commit control loop" deletes this via
  // `TransactionCoordinatorCleanup`, or
  // `TransactionCoordinatorPrepared` overwrites it with
  // `preparing = false`.
  rocksdb::Status status = db_->Put(
      DefaultWriteOptions(),
      rocksdb::Slice(key),
      rocksdb::Slice(data));

  if (status.ok()) {
    return grpc::Status::OK;
  } else {
    return grpc::Status(
        grpc::UNKNOWN,
        fmt::format("Failed to store: {}", status.ToString()));
  }
}

////////////////////////////////////////////////////////////////////////

grpc::Status DatabaseService::TransactionCoordinatorCleanup(
    grpc::ServerContext* context,
    const TransactionCoordinatorCleanupRequest* request,
    TransactionCoordinatorCleanupResponse* response) {
  REBOOT_DATABASE_LOG(1) << "TransactionCoordinatorCleanup { "
                         << request->ShortDebugString() << " }";

  expected<std::string> transaction_id =
      TransactionIdFromBytes(request->transaction_id());
  if (!transaction_id.has_value()) {
    return grpc::Status(
        grpc::UNKNOWN,
        fmt::format(
            "Failed to cleanup transaction: {}",
            transaction_id.error()));
  }

  // Where to delete the transaction (legacy, or sharded key) depends on whether
  // the request contained a `coordinator_state_ref`.
  //
  // NOTE: callers may invoke this when no coordinator record exists
  // (e.g., during abort when a we failed to record that the
  // coordinator was preparing). This is safe because RocksDB
  // supporting doing a delete on a missing key.
  rocksdb::Status status;
  if (request->coordinator_state_ref().empty()) {
    // This means legacy format - delete from a legacy key.
    const std::string& legacy_key =
        MakeLegacyTransactionPreparedKey(*transaction_id);
    status = db_->Delete(DefaultWriteOptions(), rocksdb::Slice(legacy_key));
  } else {
    // This means modern (sharded) format - compute shard and delete.
    std::string shard_id =
        GetShardForStateRef(request->coordinator_state_ref());
    const std::string& shard_key =
        MakeTransactionCoordinatorKey(shard_id, *transaction_id);
    status = db_->Delete(DefaultWriteOptions(), rocksdb::Slice(shard_key));
  }

  if (!status.ok()) {
    return grpc::Status(
        grpc::UNKNOWN,
        fmt::format("Failed to cleanup transaction: {}", status.ToString()));
  }

  return grpc::Status::OK;
}

////////////////////////////////////////////////////////////////////////

// Helper for sending a response to the client and clearing the
// batch. Returns `CANCELLED` if `Write()` returns `false` (stream
// has been closed), which indicates the client has disconnected or
// cancelled the RPC.
template <typename T>
grpc::Status WriteAndClearResponse(
    grpc::ServerWriter<T>& responses,
    T& response,
    size_t& estimated_batch_bytes) {
  if (estimated_batch_bytes != 0) {
    if (!responses.Write(response)) {
      return grpc::Status::CANCELLED;
    }
    response.Clear();
    estimated_batch_bytes = 0;
  }
  return grpc::Status::OK;
}

////////////////////////////////////////////////////////////////////////

// Helper for sending a response to the client and clearing the
// batch once its estimated byte size reaches the flush threshold.
// Returns `CANCELLED` if `Write()` returns `false` (stream
// has been closed), which indicates the client has disconnected or
// cancelled the RPC.
template <typename T>
grpc::Status MaybeWriteAndClearResponse(
    grpc::ServerWriter<T>& responses,
    T& response,
    size_t& estimated_batch_bytes,
    size_t estimated_item_bytes) {
  estimated_batch_bytes += estimated_item_bytes;
  if (estimated_batch_bytes >= rbt::kBatchFlushBytes) {
    return WriteAndClearResponse(responses, response, estimated_batch_bytes);
  }
  return grpc::Status::OK;
}

////////////////////////////////////////////////////////////////////////

// Estimate the serialized size of an `Actor` without CPU-expensive
// protobuf serialization. The dominant "expensive" fields will always
// be `bytes` fields, so we can just sum the sizes of those and add
// some metadata size for the other fields.
// NOTE: it is not a "real" size but the estimation only, but it is fine
// since we have a batch size threshold as twice lower than the max
// size we can transport over the wire and we also do not expect the
// data to be close to the transport limit.
size_t EstimateActorSize(const Actor& actor) {
  return actor.state_type().size() + actor.state_ref().size()
      + actor.state().size();
}

////////////////////////////////////////////////////////////////////////

// Estimate the serialized size of a `Task` without CPU-expensive
// protobuf serialization. The dominant "expensive" fields will always
// be `bytes` fields, so we can just sum the sizes of those and add
// some metadata size for the other fields.
// NOTE: it is not a "real" size but the estimation only, but it is fine
// since we have a batch size threshold as twice lower than the max
// size we can transport over the wire and we also do not expect the
// data to be close to the transport limit.
size_t EstimateTaskSize(const Task& task) {
  // `TaskId` data.
  size_t size = task.task_id().state_type().size()
      + task.task_id().state_ref().size() + task.task_id().task_uuid().size();

  // Timestamp field (`int64` + `int32`) + `uint64` for `iteration`.
  size += 24;

  // `method` and `request` data.
  size += task.method().size() + task.request().size();

  if (task.has_response()) {
    size += task.response().value().size() + task.response().type_url().size();
  }
  if (task.has_error()) {
    size += task.error().value().size() + task.error().type_url().size();
  }
  return size;
}

////////////////////////////////////////////////////////////////////////

// Estimate the serialized size of a `IdempotentMutation` without
// CPU-expensive protobuf serialization. The dominant "expensive"
// fields will always be `bytes` fields, so we can just sum the sizes of
// those and add some metadata size for the other fields.
// NOTE: it is not a "real" size but the estimation only, but it is fine
// since we have a batch size threshold as twice lower than the max
// size we can transport over the wire and we also do not expect the
// data to be close to the transport limit.
size_t EstimateIdempotentMutationSize(const IdempotentMutation& mutation) {
  // `IdempotentMutation` data fields.
  size_t size = mutation.state_type().size() + mutation.state_ref().size()
      + mutation.key().size() + mutation.response().size();

  if (mutation.has_workflow_id()) {
    size += mutation.workflow_id().size();
  }

  if (mutation.has_workflow_iteration()) {
    // `workflow_iteration` is a `uint64`.
    size += 8;
  }

  // To avoid for-looping over all task IDs, we can estimate the size of
  // each `TaskId`, since it has 2 strings (overestimate them as 100
  // bytes each) and a UUID bytes field (32 bytes).
  size += mutation.task_ids().size() * 232;
  return size;
}

////////////////////////////////////////////////////////////////////////

// Returns the current wall-clock time in milliseconds since the Unix
// epoch, encoded as a 6-byte big-endian string (i.e., same as what is
// in a UUIDv7) suitable for use as a key-prefix bound (e.g., used
// when scanning expiring idempotent mutations where we want to skip
// mutations whose expiration is in the future).
std::string CurrentTimestampForKeyPrefix() {
  uint64_t now_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
                        std::chrono::system_clock::now().time_since_epoch())
                        .count();
  std::string timestamp(6, '\0');
  timestamp[0] = static_cast<char>((now_ms >> 40) & 0xFF);
  timestamp[1] = static_cast<char>((now_ms >> 32) & 0xFF);
  timestamp[2] = static_cast<char>((now_ms >> 24) & 0xFF);
  timestamp[3] = static_cast<char>((now_ms >> 16) & 0xFF);
  timestamp[4] = static_cast<char>((now_ms >> 8) & 0xFF);
  timestamp[5] = static_cast<char>(now_ms & 0xFF);
  return timestamp;
}

////////////////////////////////////////////////////////////////////////

// Scans the iterator over keys starting at `start_prefix` and
// continuing while the key begins with `end_prefix` (defaults to
// `start_prefix` when not provided), parsing each value as an
// `IdempotentMutation` and appending to
// `response.idempotent_mutations()`. Flushes batches via
// `MaybeWriteAndClearResponse` when the response grows too large.
// Returns a non-OK status if the client disconnected mid-stream;
// the caller should exit early in that case. Templated on the
// response type because `RecoverIdempotentMutationsResponse` and
// `PreloadResponse` both have an `idempotent_mutations` repeated
// field but are different types.
template <typename Response>
grpc::Status RecoverIdempotentMutationsForKeyPrefix(
    rocksdb::Iterator& iterator,
    const std::string& start_prefix,
    std::optional<std::string> end_prefix,
    grpc::ServerWriter<Response>& responses,
    Response& response,
    size_t& estimated_batch_bytes) {
  if (!end_prefix.has_value()) {
    end_prefix = start_prefix;
  }

  // TODO: investigate using "prefix seek" for better performance, see:
  // https://github.com/facebook/rocksdb/wiki/Prefix-Seek
  iterator.Seek(rocksdb::Slice(start_prefix));

  while (iterator.Valid()
         && iterator.key().ToStringView().find(*end_prefix) == 0) {
    IdempotentMutation idempotent_mutation;

    CHECK(idempotent_mutation.ParseFromArray(
        iterator.value().data(),
        iterator.value().size()));

    size_t estimated_idempotent_mutation_bytes =
        EstimateIdempotentMutationSize(idempotent_mutation);
    *response.add_idempotent_mutations() = std::move(idempotent_mutation);

    if (grpc::Status status = MaybeWriteAndClearResponse(
            responses,
            response,
            estimated_batch_bytes,
            estimated_idempotent_mutation_bytes);
        !status.ok()) {
      return status;
    }

    iterator.Next();
  }

  return grpc::Status::OK;
}

////////////////////////////////////////////////////////////////////////

// Recovers non-workflow-scoped idempotent mutations for a single
// `state_ref` (both non-expiring and unexpired expiring) into the
// given response, streaming batches via `responses` as needed. Used
// by both the no-filter branch of `RecoverIdempotentMutations` and
// by `Preload`. The caller provides the iterator so multiple scans
// within a single RPC can share a consistent snapshot view.
// Templated on the response type for the same reason as
// `RecoverIdempotentMutationsForKeyPrefix`.
template <typename Response>
grpc::Status RecoverNonWorkflowIdempotentMutations(
    rocksdb::Iterator& iterator,
    const std::string& state_ref,
    grpc::ServerWriter<Response>& responses,
    Response& response,
    size_t& estimated_batch_bytes) {
  // Recover non-expiring idempotent mutations.
  if (grpc::Status status = RecoverIdempotentMutationsForKeyPrefix(
          iterator,
          fmt::format(IDEMPOTENT_MUTATION_KEY_PREFIX ":{}", state_ref),
          std::nullopt,
          responses,
          response,
          estimated_batch_bytes);
      !status.ok()) {
    return status;
  }

  // Recover expiring idempotent mutations whose expiration is _after_
  // the current time.
  return RecoverIdempotentMutationsForKeyPrefix(
      iterator,
      fmt::format(
          EXPIRING_IDEMPOTENT_MUTATION_KEY_PREFIX ":{}:{}",
          state_ref,
          CurrentTimestampForKeyPrefix()),
      fmt::format(EXPIRING_IDEMPOTENT_MUTATION_KEY_PREFIX ":{}", state_ref),
      responses,
      response,
      estimated_batch_bytes);
}

////////////////////////////////////////////////////////////////////////

// Estimate the serialized size of a `Transaction` without
// CPU-expensive protobuf serialization. The dominant "expensive"
// fields will always be `bytes` fields, so we can just sum the sizes of
// those and add some metadata size for the other fields.
// NOTE: it is not a "real" size but the estimation only, but it is fine
// since we have a batch size threshold as twice lower than the max
// size we can transport over the wire and we also do not expect the
// data to be close to the transport limit.
size_t EstimateTransactionSize(const Transaction& transaction) {
  size_t size = transaction.state_type().size() + transaction.state_ref().size()
      + transaction.coordinator_state_type().size()
      + transaction.coordinator_state_ref().size();

  // To avoid for-looping over all transaction IDs, we can estimate the size
  // of each transaction ID, since it is a UUID bytes field (32 bytes).
  size += transaction.transaction_ids().size() * 32;

  for (const auto& task : transaction.uncommitted_tasks()) {
    // Each task has a serialized `request` and `response_or_error`,
    // which is tricky to guesstimate, but hopefully we won't have a ton
    // of uncommitted tasks at a time and this will be good enough.
    size += EstimateTaskSize(task);
  }
  for (const auto& mutation : transaction.uncommitted_idempotent_mutations()) {
    // Each idempotent mutation has a serialized `response` which is
    // tricky to guesstimate, but hopefully we won't have a ton of
    // uncommitted mutations at a time and this will be good enough.
    size += EstimateIdempotentMutationSize(mutation);
  }
  return size;
}

////////////////////////////////////////////////////////////////////////

// Estimate the serialized size of a `TransactionCoordinator`
// without CPU-expensive protobuf serialization. The dominant "expensive"
// fields will always be `bytes` fields, so we can just sum the sizes of
// those and add some metadata size for the other fields.
// NOTE: it is not a "real" size but the estimation only, but it is fine
// since we have a batch size threshold as twice lower than the max
// size we can transport over the wire and we also do not expect the
// data to be close to the transport limit.
size_t EstimateTransactionCoordinatorSize(
    const TransactionCoordinator& coordinator) {
  size_t size = coordinator.state_ref().size();

  // To avoid for-looping over all participants, we can guesstimate the
  // size of each participant. Overestimate each `string` field as 100
  // bytes and each map value is a list of ~50 entries.
  size += (coordinator.participants().should_commit_size()
           + coordinator.participants().should_abort_size())
      * (100 * 50);
  return size;
}

////////////////////////////////////////////////////////////////////////

grpc::Status DatabaseService::_Export(
    const grpc::ServerContext& context,
    const ExportRequest& request,
    const std::function<grpc::Status(ExportItem&&, size_t)>& on_item) {
  REBOOT_DATABASE_LOG(1) << "Export { " << request.ShortDebugString() << " }";

  // Validate that shard_ids are provided.
  if (request.shard_ids().empty()) {
    return grpc::Status(
        grpc::INVALID_ARGUMENT,
        "shard_ids are required for Export request");
  }

  // Convert to unordered_set for efficient lookups.
  std::unordered_set<std::string> shard_ids(
      request.shard_ids().begin(),
      request.shard_ids().end());

  // Column family handles are never deleted once created, so the
  // returned pointer remains valid for the lifetime of this call.
  expected<rocksdb::ColumnFamilyHandle*> column_family_handle =
      LookupOrCreateColumnFamilyHandle(request.state_type());

  if (!column_family_handle.has_value()) {
    return grpc::Status(
        grpc::UNKNOWN,
        fmt::format(
            "Failed to begin export for '{}': {}",
            request.state_type(),
            column_family_handle.error()));
  }

  // `db_->NewIterator()` is thread-safe and captures an implicit
  // snapshot of the DB state at the moment of iterator creation.
  // See https://github.com/facebook/rocksdb/wiki/Iterator#consistent-view
  // https://github.com/facebook/rocksdb/wiki/RocksDB-FAQ
  // Concurrent writes after that point are invisible to the iterator,
  // so we get a consistent read without holding `mutex_` across the
  // iteration.
  rocksdb::ReadOptions read_options = NonPrefixIteratorReadOptions();
  std::unique_ptr<rocksdb::Iterator> iterator(
      CHECK_NOTNULL(db_->NewIterator(read_options, *column_family_handle)));

  if (test_only_hook_for_long_running_rpc_) {
    test_only_hook_for_long_running_rpc_(
        TestOnlyLongRunningRPCHookSite::EXPORT_RIGHT_AFTER_IMPLICIT_SNAPSHOT);
  }

  for (iterator->SeekToFirst(); iterator->Valid(); iterator->Next()) {
    std::string_view key = iterator->key().ToStringView();
    size_t colon_position = key.find(":");
    if (colon_position == std::string::npos) {
      return grpc::Status(
          grpc::UNKNOWN,
          fmt::format(
              "Unrecognized entry for '{}': {}",
              request.state_type(),
              iterator->key().ToStringView()));
    }

    std::string_view key_type_prefix =
        iterator->key().ToStringView().substr(0, colon_position);

    ExportItem item;
    std::string state_ref;
    size_t estimated_item_bytes = 0;
    if (key_type_prefix == STATE_KEY_PREFIX) {
      state_ref = std::string(
          GetStateRefFromActorStateKey(iterator->key().ToStringView()));
      auto* actor = item.mutable_actor();
      actor->set_state_type(request.state_type());
      actor->set_state_ref(state_ref);
      actor->set_state(iterator->value().ToString());
      estimated_item_bytes = EstimateActorSize(*actor);
    } else if (key_type_prefix == TASK_KEY_PREFIX) {
      auto* task = item.mutable_task();
      CHECK(task->ParseFromArray(
          iterator->value().data(),
          iterator->value().size()));
      state_ref = task->task_id().state_ref();
      estimated_item_bytes = EstimateTaskSize(*task);
    } else if (
        key_type_prefix == IDEMPOTENT_MUTATION_KEY_PREFIX
        || key_type_prefix == EXPIRING_IDEMPOTENT_MUTATION_KEY_PREFIX
        || key_type_prefix == WORKFLOW_IDEMPOTENT_MUTATION_KEY_PREFIX
        || key_type_prefix == WORKFLOW_EXPIRING_IDEMPOTENT_MUTATION_KEY_PREFIX
        || key_type_prefix
            == WORKFLOW_ITERATION_IDEMPOTENT_MUTATION_KEY_PREFIX) {
      auto* mutation = item.mutable_idempotent_mutation();
      CHECK(mutation->ParseFromArray(
          iterator->value().data(),
          iterator->value().size()));
      state_ref = mutation->state_ref();
      estimated_item_bytes = EstimateIdempotentMutationSize(*mutation);
    } else {
      return grpc::Status(
          grpc::UNKNOWN,
          fmt::format(
              "Unrecognized entry for '{}': {}",
              request.state_type(),
              iterator->key().ToStringView()));
    }

    // If this item doesn't belong to one of the requested shards,
    // skip it.
    // For the `Export` we iterate over all items in the database so the
    // odds of hitting the cache are low, so we set `use_cache` to
    // `false` to avoid the overhead of checking the cache on each item.
    if (!BelongsToShard(
            request.state_type(),
            state_ref,
            shard_ids,
            /* use_cache= */ false)) {
      continue;
    }

    if (grpc::Status status = on_item(std::move(item), estimated_item_bytes);
        !status.ok()) {
      return status;
    }
  }

  if (!iterator->status().ok()) {
    return grpc::Status(
        grpc::UNKNOWN,
        fmt::format(
            "Failed to export '{}': {}",
            request.state_type(),
            iterator->status().ToString()));
  }

  return grpc::Status::OK;
}

////////////////////////////////////////////////////////////////////////

grpc::Status DatabaseService::ExportStreamed(
    grpc::ServerContext* context,
    const ExportRequest* request,
    grpc::ServerWriter<ExportResponse>* responses) {
  ExportResponse response;
  size_t estimated_batch_bytes = 0;
  grpc::Status status = _Export(
      *context,
      *request,
      [this, context, responses, &response, &estimated_batch_bytes](
          ExportItem&& item,
          size_t estimated_item_bytes) -> grpc::Status {
        *response.add_items() = std::move(item);
        return MaybeWriteAndClearResponse(
            *responses,
            response,
            estimated_batch_bytes,
            estimated_item_bytes);
      });
  if (!status.ok()) {
    return status;
  }
  // Flush any remaining items.
  return WriteAndClearResponse(*responses, response, estimated_batch_bytes);
}

////////////////////////////////////////////////////////////////////////

grpc::Status DatabaseService::Export(
    grpc::ServerContext* context,
    const ExportRequest* request,
    ExportResponse* response) {
  size_t estimated_batch_bytes = 0;
  grpc::Status status = _Export(
      *context,
      *request,
      [response, &estimated_batch_bytes](
          ExportItem&& item,
          size_t estimated_item_bytes) -> grpc::Status {
        *response->add_items() = std::move(item);
        estimated_batch_bytes += estimated_item_bytes;
        // Return `FAILED_PRECONDITION` to stop iteration once over
        // the size limit.
        if (estimated_batch_bytes >= rbt::kBatchFlushBytes) {
          return grpc::Status(
              grpc::FAILED_PRECONDITION,
              "Export data exceeds the gRPC message size limit; "
              "please upgrade Reboot CLI to be compatible with "
              "streamed exports.");
        }
        return grpc::Status::OK;
      });
  if (!status.ok()) {
    return status;
  }
  return grpc::Status::OK;
}

////////////////////////////////////////////////////////////////////////

grpc::Status DatabaseService::GetApplicationMetadata(
    grpc::ServerContext* context,
    const GetApplicationMetadataRequest* request,
    GetApplicationMetadataResponse* response) {
  std::lock_guard lock(metadata_mutex_);

  REBOOT_DATABASE_LOG(1) << "GetApplicationMetadata { "
                         << request->ShortDebugString() << " }";


  if (!std::filesystem::exists(metadata_path_)) {
    // No metadata file exists yet; that likely means this is the first time
    // this application is starting. Return empty metadata, the caller will
    // understand that that means we don't have any. The caller will soon call
    // `StoreApplicationMetadata` to set some real metadata.
    return grpc::Status::OK;
  }

  std::ifstream file(metadata_path_, std::ios::binary);
  if (!file.is_open()) {
    return grpc::Status(
        grpc::INTERNAL,
        fmt::format(
            "Failed to open metadata file: {}",
            metadata_path_.string()));
  }

  std::string serialized_metadata(
      (std::istreambuf_iterator<char>(file)),
      std::istreambuf_iterator<char>());
  file.close();

  // We expect the file to contain a valid serialized ApplicationMetadata proto.
  // It's possible that the file is empty (i.e. `StoreApplicationMetadata` could
  // have set an empty metadata), but it should never contain invalid data.
  if (!response->mutable_metadata()->ParseFromString(serialized_metadata)) {
    return grpc::Status(grpc::INTERNAL, "Failed to parse metadata from file");
  }

  return grpc::Status::OK;
}

////////////////////////////////////////////////////////////////////////

grpc::Status DatabaseService::StoreApplicationMetadata(
    grpc::ServerContext* context,
    const StoreApplicationMetadataRequest* request,
    StoreApplicationMetadataResponse* response) {
  std::lock_guard lock(metadata_mutex_);

  REBOOT_DATABASE_LOG(1) << "StoreApplicationMetadata { "
                         << request->metadata().ShortDebugString() << " }";


  // Create the directory if it doesn't already exist.
  std::error_code ec;
  std::filesystem::create_directories(state_directory_, ec);
  if (ec) {
    return grpc::Status(
        grpc::INTERNAL,
        fmt::format(
            "Failed to create directory {}: {}",
            state_directory_.string(),
            ec.message()));
  }

  std::string serialized_metadata = request->metadata().SerializeAsString();

  std::ofstream file(metadata_path_, std::ios::binary | std::ios::trunc);
  if (!file.is_open()) {
    return grpc::Status(
        grpc::INTERNAL,
        fmt::format(
            "Failed to open metadata file for writing: {}",
            metadata_path_.string()));
  }

  file.write(serialized_metadata.data(), serialized_metadata.size());
  file.flush();

  if (file.fail()) {
    return grpc::Status(grpc::INTERNAL, "Failed to write metadata to file");
  }

  file.close();

  return grpc::Status::OK;
}

////////////////////////////////////////////////////////////////////////

grpc::Status DatabaseService::RecoverTasks(
    const grpc::ServerContext& context,
    grpc::ServerWriter<RecoverResponse>& responses,
    const std::unordered_set<std::string>& shard_ids) {
  std::shared_lock lock(column_family_handles_mutex_);

  RecoverResponse response;

  size_t estimated_batch_bytes = 0;

  for (rocksdb::ColumnFamilyHandle* column_family_handle :
       column_family_handles_) {
    std::unique_ptr<rocksdb::Iterator> iterator(CHECK_NOTNULL(db_->NewIterator(
        NonPrefixIteratorReadOptions(),
        column_family_handle)));

    // Only want to recover pending tasks!
    static const std::string& TASK_PENDING_KEY_PREFIX =
        TASK_KEY_PREFIX ":" + Task::Status_Name(Task::PENDING);

    // TODO: investigate using "prefix seek" for better performance, see:
    // https://github.com/facebook/rocksdb/wiki/Prefix-Seek
    iterator->Seek(rocksdb::Slice(TASK_PENDING_KEY_PREFIX));

    while (iterator->Valid()
           && iterator->key().ToStringView().find(TASK_PENDING_KEY_PREFIX)
               == 0) {
      Task task;
      CHECK(task.ParseFromArray(
          iterator->value().data(),
          iterator->value().size()));

      CHECK_EQ(task.status(), Task::PENDING);

      if (BelongsToShard(
              task.task_id().state_type(),
              task.task_id().state_ref(),
              shard_ids)) {
        size_t estimated_task_bytes = EstimateTaskSize(task);
        *response.add_pending_tasks() = std::move(task);

        if (grpc::Status status = MaybeWriteAndClearResponse(
                responses,
                response,
                estimated_batch_bytes,
                estimated_task_bytes);
            !status.ok()) {
          return status;
        }
      }

      iterator->Next();
    }
  }

  // Flush any remaining tasks.
  return WriteAndClearResponse(responses, response, estimated_batch_bytes);
}

////////////////////////////////////////////////////////////////////////

grpc::Status DatabaseService::RecoverTransactionTasks(
    const grpc::ServerContext& context,
    Transaction& transaction,
    LockableTransaction& txn) {
  CHECK_EQ(transaction.uncommitted_tasks_size(), 0);

  // We are recovering only the tasks for _this_ transaction, so we
  // only look through the updates that are in the transaction itself,
  // not the entire database.
  expected<rocksdb::ColumnFamilyHandle*> column_family_handle =
      LookupColumnFamilyHandle(transaction.state_type());
  CHECK(column_family_handle.has_value());

  rocksdb::WriteBatchWithIndex* batch = txn->GetWriteBatch();

  std::unique_ptr<rocksdb::WBWIIterator> iterator(
      CHECK_NOTNULL(batch->NewIterator(*column_family_handle)));

  iterator->Seek(rocksdb::Slice(TASK_KEY_PREFIX));

  // When iterating via the transaction's write batch directly we get
  // `rocksdb::WriteEntry`s which may exist for the same key multiple
  // times. In the case of a task, we never expect it to be added more
  // than once, so to assert that invariant we track each task we find
  // in a set.
  std::set<std::string> task_ids;

  while (iterator->Valid()) {
    rocksdb::WriteEntry entry = iterator->Entry();

    // Make sure this is still a key we care about.
    if (entry.key.ToStringView().find(TASK_KEY_PREFIX) != 0) {
      break;
    }

    // We are only expecting tasks to be inserted into the database
    // during a transaction.
    CHECK_EQ(entry.type, rocksdb::kPutRecord);

    Task task;
    CHECK(task.ParseFromArray(entry.value.data(), entry.value.size()));

    // Task should be for this transaction's state ref!
    CHECK_EQ(task.task_id().state_ref(), transaction.state_ref());

    // All tasks added in a transaction should be pending.
    CHECK_EQ(task.status(), Task::PENDING);

    CHECK(task_ids.count(task.task_id().task_uuid()) == 0);

    task_ids.insert(task.task_id().task_uuid());

    *transaction.add_uncommitted_tasks() = std::move(task);

    iterator->Next();
  }

  return grpc::Status::OK;
}

////////////////////////////////////////////////////////////////////////

grpc::Status DatabaseService::RecoverTransactionIdempotentMutations(
    const grpc::ServerContext& context,
    Transaction& transaction,
    LockableTransaction& txn) {
  CHECK_EQ(transaction.uncommitted_idempotent_mutations_size(), 0);

  // We are recovering only the idempotent mutations for _this_
  // transaction, so we only look through the updates that are in the
  // transaction itself, not the entire database.
  expected<rocksdb::ColumnFamilyHandle*> column_family_handle =
      LookupColumnFamilyHandle(transaction.state_type());
  CHECK(column_family_handle.has_value());

  rocksdb::WriteBatchWithIndex* batch = txn->GetWriteBatch();

  std::unique_ptr<rocksdb::WBWIIterator> iterator(
      CHECK_NOTNULL(batch->NewIterator(*column_family_handle)));

  iterator->Seek(rocksdb::Slice(IDEMPOTENT_MUTATION_KEY_PREFIX));

  // When iterating via the transaction's write batch directly we get
  // `rocksdb::WriteEntry`s which may exist for the same key multiple
  // times. In the case of an idempotent mutation, we never expect it
  // to be added more than once, so to assert that invariant we track
  // each idempotency key we find in a set.
  std::set<std::string> idempotency_keys;

  while (iterator->Valid()) {
    rocksdb::WriteEntry entry = iterator->Entry();

    // Make sure this is still a key we care about.
    if (entry.key.ToStringView().find(IDEMPOTENT_MUTATION_KEY_PREFIX) != 0) {
      break;
    }

    // We are only expecting idempotent mutations to be inserted into
    // the database during a transaction.
    CHECK_EQ(entry.type, rocksdb::kPutRecord);

    IdempotentMutation idempotent_mutation;

    CHECK(idempotent_mutation.ParseFromArray(
        entry.value.data(),
        entry.value.size()));

    // Idempotent mutation should be for this transaction's state ref!
    CHECK_EQ(idempotent_mutation.state_type(), transaction.state_type());
    CHECK_EQ(idempotent_mutation.state_ref(), transaction.state_ref());

    CHECK(idempotency_keys.count(idempotent_mutation.key()) == 0);

    idempotency_keys.insert(idempotent_mutation.key());

    *transaction.add_uncommitted_idempotent_mutations() =
        std::move(idempotent_mutation);

    iterator->Next();
  }

  return grpc::Status::OK;
}

////////////////////////////////////////////////////////////////////////

expected<void, grpc::Status> DatabaseService::RecoverTransactions(
    const grpc::ServerContext& context,
    grpc::ServerWriter<RecoverResponse>& responses,
    const std::unordered_set<std::string>& shard_ids) {
  std::unique_ptr<rocksdb::Iterator> iterator(
      CHECK_NOTNULL(db_->NewIterator(NonPrefixIteratorReadOptions())));

  // TODO: investigate using "prefix seek" for better performance, see:
  // https://github.com/facebook/rocksdb/wiki/Prefix-Seek
  iterator->Seek(rocksdb::Slice(TRANSACTION_PARTICIPANT_KEY_PREFIX));

  RecoverResponse response;

  size_t estimated_batch_bytes = 0;

  while (
      iterator->Valid()
      && iterator->key().ToStringView().find(TRANSACTION_PARTICIPANT_KEY_PREFIX)
          == 0) {
    Transaction transaction;

    CHECK(transaction.ParseFromArray(
        iterator->value().data(),
        iterator->value().size()));

    if (!BelongsToShard(
            transaction.state_type(),
            transaction.state_ref(),
            shard_ids)) {
      // Not for any of our shards; skip it.
      iterator->Next();
      continue;
    }

    // We either have a previously prepared transaction that was
    // restored when we called `GetAllPreparedTransactions()` in
    // rocksdb or we crashed before the transaction was prepared and
    // we need to begin a transaction that will later be aborted
    // because any recovered transactions that are not prepared get
    // aborted.
    expected<stout::borrowed_ref<LockableTransaction>> txn =
        LookupOrBeginTransaction(transaction, /* store_participant = */ false);

    CHECK(txn.has_value());

    std::lock_guard lock(**txn);

    if ((**txn)->GetState() == rocksdb::Transaction::PREPARED) {
      transaction.set_prepared(true);

      // Now recover any tasks for our actor that we'll need to dispatch if
      // the transaction gets committed.
      if (grpc::Status status =
              RecoverTransactionTasks(context, transaction, **txn);
          !status.ok()) {
        return make_unexpected(status);
      }

      // Now recover any idempotent mutations for our actor that are part of
      // the transaction.
      if (grpc::Status status = RecoverTransactionIdempotentMutations(
              context,
              transaction,
              **txn);
          !status.ok()) {
        return make_unexpected(status);
      }
    } else {
      // Transaction just started when we called
      // `LookupOrBeginTransaction()`!
      CHECK_EQ((**txn)->GetState(), rocksdb::Transaction::STARTED);
    }

    size_t estimated_transaction_bytes = EstimateTransactionSize(transaction);
    *response.add_participant_transactions() = std::move(transaction);

    if (grpc::Status status = MaybeWriteAndClearResponse(
            responses,
            response,
            estimated_batch_bytes,
            estimated_transaction_bytes);
        !status.ok()) {
      return make_unexpected(status);
    }

    iterator->Next();
  }

  // Flush any remaining participant transactions.
  if (grpc::Status status =
          WriteAndClearResponse(responses, response, estimated_batch_bytes);
      !status.ok()) {
    return make_unexpected(status);
  }

  // Now recover any coordinator transactions.
  //
  // It's possible that we'll have a coordinator transaction without
  // any participant transaction because the participant may have
  // committed and thus deleted the record of the transaction but we
  // have not yet completed the coordinator's "commit control loop".

  // First, handle legacy coordinator transactions (for backward compatibility).
  //
  // Legacy coordinator transactions were written before we associated them with
  // shards. Fortunately, we are free to recover them into any shard we like:
  // any server can be the coordinator for any transaction, it's only
  // important that there's only one. We arbitrarily decide that it's the first
  // shard that coordinates the legacy transactions.
  CHECK(server_info_.shard_infos_size() > 0);
  const std::string& first_shard_id = server_info_.shard_infos(0).shard_id();
  const bool recovering_first_shard =
      shard_ids.find(first_shard_id) != shard_ids.end();

  if (recovering_first_shard) {
    REBOOT_DATABASE_LOG(1)
        << "Recovering legacy prepared transactions into shard '"
        << first_shard_id << "'";

    iterator->Seek(
        rocksdb::Slice(LEGACY_PREPARED_TRANSACTION_COORDINATOR_KEY_PREFIX));

    while (iterator->Valid()
           && iterator->key().ToStringView().find(
                  LEGACY_PREPARED_TRANSACTION_COORDINATOR_KEY_PREFIX)
               == 0) {
      // NOTE: we use the stringified form of the UUID as the index
      // because a protobuf 'map' can not have a bytes key. We also
      // store the stringified version of the transaction UUID in the
      // suffix of the rocksdb key for easier debugging so all we need
      // to do here is extract it.
      const std::string_view transaction_id =
          iterator->key().ToStringView().substr(
              strlen(LEGACY_PREPARED_TRANSACTION_COORDINATOR_KEY_PREFIX) + 1);

      TransactionCoordinator& coordinator =
          (*response.mutable_transaction_coordinators())[transaction_id];

      // For legacy transactions we don't have a coordinator state reference,
      // so we leave `state_ref` empty and only populate `participants`.
      Participants participants;
      CHECK(participants.ParseFromArray(
          iterator->value().data(),
          iterator->value().size()));

      *coordinator.mutable_participants() = std::move(participants);

      size_t estimated_transaction_coordinator_bytes =
          EstimateTransactionCoordinatorSize(coordinator);

      if (grpc::Status status = MaybeWriteAndClearResponse(
              responses,
              response,
              estimated_batch_bytes,
              estimated_transaction_coordinator_bytes);
          !status.ok()) {
        return make_unexpected(status);
      }

      iterator->Next();
    }
  } else {
    REBOOT_DATABASE_LOG(1)
        << "Skipping recovery of legacy coordinator transactions because "
        << "we're not recovering the first shard '" << first_shard_id << "'";
  }

  // Now recover shard-aware coordinator transactions. We expect the number of
  // transactions to be relatively low; normally lower than the number
  // of shards. Therefore we scan all transactions, rather than
  // prefix-seeking to each shard specifically.
  std::string prefix = TRANSACTION_COORDINATOR_KEY_PREFIX;

  iterator->Seek(rocksdb::Slice(prefix));

  while (iterator->Valid()
         && iterator->key().ToStringView().find(prefix) == 0) {
    // Parse the key format: `prefix:shard_id:transaction_id`.
    std::string_view key_view = iterator->key().ToStringView();

    // Skip the prefix.
    size_t prefix_len = strlen(TRANSACTION_COORDINATOR_KEY_PREFIX);
    if (key_view.size() <= prefix_len + 1) {
      iterator->Next();
      continue;
    }
    key_view = key_view.substr(prefix_len + 1);  // Skip "prefix:"

    // Extract shard ID and transaction ID.
    size_t colon_pos = key_view.find(':');
    if (colon_pos == std::string::npos) {
      iterator->Next();
      continue;
    }

    std::string_view key_shard_id = key_view.substr(0, colon_pos);
    std::string_view transaction_id = key_view.substr(colon_pos + 1);

    // Check if this shard was requested.
    if (shard_ids.find(std::string(key_shard_id)) == shard_ids.end()) {
      iterator->Next();
      continue;
    }

    // Parse the stored `TransactionCoordinator`; it can go straight
    // into the response.
    TransactionCoordinator& coordinator =
        (*response
              .mutable_transaction_coordinators())[std::string(transaction_id)];

    CHECK(coordinator.ParseFromArray(
        iterator->value().data(),
        iterator->value().size()));

    size_t estimated_transaction_coordinator_bytes =
        EstimateTransactionCoordinatorSize(coordinator);

    if (grpc::Status status = MaybeWriteAndClearResponse(
            responses,
            response,
            estimated_batch_bytes,
            estimated_transaction_coordinator_bytes);
        !status.ok()) {
      return make_unexpected(status);
    }

    iterator->Next();
  }

  // Flush any remaining coordinator transactions.
  if (grpc::Status status =
          WriteAndClearResponse(responses, response, estimated_batch_bytes);
      !status.ok()) {
    return make_unexpected(status);
  }

  return {};
}

////////////////////////////////////////////////////////////////////////

grpc::Status DatabaseService::RecoverShardsIdempotentMutations(
    const grpc::ServerContext& context,
    grpc::ServerWriter<RecoverResponse>& responses,
    const std::unordered_set<std::string>& shard_ids) {
  std::shared_lock lock(column_family_handles_mutex_);

  RecoverResponse response;

  size_t estimated_batch_bytes = 0;

  for (rocksdb::ColumnFamilyHandle* column_family_handle :
       column_family_handles_) {
    if (column_family_handle->GetName() == "default") {
      continue;
    }

    std::unique_ptr<rocksdb::Iterator> iterator(CHECK_NOTNULL(db_->NewIterator(
        NonPrefixIteratorReadOptions(),
        column_family_handle)));

    // TODO: investigate using "prefix seek" for better performance, see:
    // https://github.com/facebook/rocksdb/wiki/Prefix-Seek
    iterator->Seek(rocksdb::Slice(IDEMPOTENT_MUTATION_KEY_PREFIX));

    while (
        iterator->Valid()
        && iterator->key().ToStringView().find(IDEMPOTENT_MUTATION_KEY_PREFIX)
            == 0) {
      IdempotentMutation idempotent_mutation;

      CHECK(idempotent_mutation.ParseFromArray(
          iterator->value().data(),
          iterator->value().size()));

      // Only send this idempotent mutation if its state ref falls within one
      // of the requested shards.
      if (BelongsToShard(
              idempotent_mutation.state_type(),
              idempotent_mutation.state_ref(),
              shard_ids)) {
        size_t estimated_idempotent_mutation_bytes =
            EstimateIdempotentMutationSize(idempotent_mutation);
        *response.add_idempotent_mutations() = std::move(idempotent_mutation);

        if (grpc::Status status = MaybeWriteAndClearResponse(
                responses,
                response,
                estimated_batch_bytes,
                estimated_idempotent_mutation_bytes);
            !status.ok()) {
          return status;
        }
      }

      iterator->Next();
    }
  }

  // Flush any remaining idempotent mutations.
  return WriteAndClearResponse(responses, response, estimated_batch_bytes);
}

////////////////////////////////////////////////////////////////////////

// This migration deletes Tasks which did not have `Any` response values
// (i.e. from before #2580).
expected<void> DatabaseService::MigratePersistence2To3(
    const RecoverRequest& request) {
  std::shared_lock lock(column_family_handles_mutex_);

  for (rocksdb::ColumnFamilyHandle* column_family_handle :
       column_family_handles_) {
    std::unique_ptr<rocksdb::Iterator> iterator(CHECK_NOTNULL(db_->NewIterator(
        NonPrefixIteratorReadOptions(),
        column_family_handle)));

    // TODO: investigate using "prefix seek" for better performance, see:
    // https://github.com/facebook/rocksdb/wiki/Prefix-Seek
    iterator->Seek(rocksdb::Slice(TASK_KEY_PREFIX));

    while (iterator->Valid()
           && iterator->key().ToStringView().find(TASK_KEY_PREFIX) == 0) {
      Task task;
      CHECK(task.ParseFromArray(
          iterator->value().data(),
          iterator->value().size()));
      if (task.has_response()
          && task.response().type_url().find("type.googleapis.com") != 0) {
        rocksdb::Status status = db_->Delete(
            DefaultWriteOptions(),
            column_family_handle,
            iterator->key());
        if (!status.ok()) {
          return make_unexpected(
              fmt::format(
                  "Failed to delete stale task: {}",
                  status.ToString()));
        }
      }

      iterator->Next();
    }
  }

  // Finally, update the persistence version.
  return WritePersistenceVersion(db_.get(), 3);
}

// This migration:
//
// 1. Renames the idempotent mutation keys so that they
//    are easier to recover per state ref.
//
// 2. Renames task keys so we can just recover pending tasks.
expected<void> DatabaseService::MigratePersistence3To4(
    const RecoverRequest& request) {
  std::shared_lock lock(column_family_handles_mutex_);

  for (rocksdb::ColumnFamilyHandle* column_family_handle :
       column_family_handles_) {
    if (column_family_handle->GetName() == "default") {
      continue;
    }

    std::unique_ptr<rocksdb::Iterator> iterator(CHECK_NOTNULL(db_->NewIterator(
        NonPrefixIteratorReadOptions(),
        column_family_handle)));

    // To do the rename atomically we need to use a write batch. We
    // also want to batch writes together because for large enough
    // databases doing a write for every single idempotent mutation or
    // task is prohibitively expensive
    rocksdb::WriteBatch batch;

    size_t entries = 0;

    REBOOT_DATABASE_LOG(1) << "Migrating idempotent mutations for '"
                           << column_family_handle->GetName() << "'";

    // TODO: investigate using "prefix seek" for better performance, see:
    // https://github.com/facebook/rocksdb/wiki/Prefix-Seek
    iterator->Seek(rocksdb::Slice(IDEMPOTENT_MUTATION_KEY_PREFIX_V3 ":"));

    // Helper to determine if the iterator is still valid.
    std::function<bool()> valid = [&]() {
      return iterator->Valid()
          && iterator->key().ToStringView().find(
                 IDEMPOTENT_MUTATION_KEY_PREFIX_V3 ":")
          == 0;
    };

    while (valid()) {
      IdempotentMutation idempotent_mutation;

      CHECK(idempotent_mutation.ParseFromArray(
          iterator->value().data(),
          iterator->value().size()));

      expected<std::string> idempotent_mutation_key = MakeIdempotentMutationKey(
          idempotent_mutation.state_ref(),
          idempotent_mutation.key());

      if (!idempotent_mutation_key.has_value()) {
        return make_unexpected(idempotent_mutation_key.error());
      }

      std::unique_ptr<rocksdb::Iterator> iterator(
          CHECK_NOTNULL(db_->NewIterator(
              NonPrefixIteratorReadOptions(),
              column_family_handle)));

      // To do the rename atomically we need to use a write batch. We
      // also want to batch writes together because for large enough
      // databases doing a write for every single idempotent mutation or
      // task is prohibitively expensive
      rocksdb::WriteBatch batch;

      size_t entries = 0;

      REBOOT_DATABASE_LOG(1) << "Migrating idempotent mutations for '"
                             << column_family_handle->GetName() << "'";

      // TODO: investigate using "prefix seek" for better performance, see:
      // https://github.com/facebook/rocksdb/wiki/Prefix-Seek
      iterator->Seek(rocksdb::Slice(IDEMPOTENT_MUTATION_KEY_PREFIX_V3 ":"));

      // Helper to determine if the iterator is still valid.
      std::function<bool()> valid = [&]() {
        return iterator->Valid()
            && iterator->key().ToStringView().find(
                   IDEMPOTENT_MUTATION_KEY_PREFIX_V3 ":")
            == 0;
      };

      while (valid()) {
        IdempotentMutation idempotent_mutation;

        CHECK(idempotent_mutation.ParseFromArray(
            iterator->value().data(),
            iterator->value().size()));

        expected<std::string> idempotent_mutation_key =
            MakeIdempotentMutationKey(
                idempotent_mutation.state_ref(),
                idempotent_mutation.key());

        if (!idempotent_mutation_key.has_value()) {
          return make_unexpected(idempotent_mutation_key.error());
        }

        rocksdb::Status status = batch.Put(
            column_family_handle,
            rocksdb::Slice(*idempotent_mutation_key),
            iterator->value());

        if (!status.ok()) {
          return make_unexpected(
              fmt::format(
                  "Failed to rename idempotent mutation: {}",
                  status.ToString()));
        }

        status = batch.Delete(column_family_handle, iterator->key());

        if (!status.ok()) {
          return make_unexpected(
              fmt::format(
                  "Failed to rename idempotent mutation key: {}",
                  status.ToString()));
        }

        entries += 1;

        iterator->Next();

        // Check if we don't have any more to migrate or if we've hit
        // our batch size and should do a write.
        if (!valid() || batch.GetDataSize() == (32 * 1024 * 1024)) {  // 32 MB
          // Write the batch then instantiate a new one.
          status = db_->Write(DefaultWriteOptions(), &batch);

          if (!status.ok()) {
            return make_unexpected(
                fmt::format(
                    "Failed to rename idempotent mutation key(s): {}",
                    status.ToString()));
          }

          batch = rocksdb::WriteBatch();

          REBOOT_DATABASE_LOG(1)
              << "Migrated " << entries << " idempotent mutation(s)";
        }
      }

      CHECK_EQ(batch.Count(), 0) << "Should have a new batch";

      entries = 0;

      REBOOT_DATABASE_LOG(1)
          << "Migrating tasks for '" << column_family_handle->GetName() << "'";

      // TODO: investigate using "prefix seek" for better performance, see:
      // https://github.com/facebook/rocksdb/wiki/Prefix-Seek
      iterator->Seek(rocksdb::Slice(TASK_KEY_PREFIX_V3 ":"));

      valid = [&]() {
        return iterator->Valid()
            && iterator->key().ToStringView().find(TASK_KEY_PREFIX_V3 ":") == 0;
      };

      while (valid()) {
        Task task;
        CHECK(task.ParseFromArray(
            iterator->value().data(),
            iterator->value().size()));

        rocksdb::Status status = batch.Put(
            column_family_handle,
            rocksdb::Slice(MakeTaskKey(task.status(), task.task_id())),
            iterator->value());

        if (!status.ok()) {
          return make_unexpected(
              fmt::format("Failed to rename task key: {}", status.ToString()));
        }

        status = batch.Delete(column_family_handle, iterator->key());

        if (!status.ok()) {
          return make_unexpected(
              fmt::format("Failed to rename task key: {}", status.ToString()));
        }

        entries += 1;

        iterator->Next();

        if (!valid() || batch.GetDataSize() == (32 * 1024 * 1024)) {  // 32 MB
          // Write the batch then instantiate a new one.
          status = db_->Write(DefaultWriteOptions(), &batch);

          if (!status.ok()) {
            return make_unexpected(
                fmt::format(
                    "Failed to rename task key(s): {}",
                    status.ToString()));
          }

          batch = rocksdb::WriteBatch();

          REBOOT_DATABASE_LOG(1) << "Migrated " << entries << " task(s)";
        }
      }
    }
  }

  // Finally, update the persistence version.
  return WritePersistenceVersion(db_.get(), 4);
}

expected<void> DatabaseService::MaybeMigratePersistence(
    const RecoverRequest& request) {
  // Read the persistence version from the default column family.
  std::string serialized_pv_get;
  rocksdb::Status status = db_->Get(
      rocksdb::ReadOptions(),
      kPersistenceVersionKey,
      &serialized_pv_get);
  int version;
  if (status.ok()) {
    PersistenceVersion pv;
    CHECK(pv.ParseFromString(std::move(serialized_pv_get)));
    if (pv.version() == CURRENT_PERSISTENCE_VERSION) {
      // Up to date.
      return {};
    } else if (pv.version() < 1) {
      // Version 0 did not support a version tag, so this is unexpected.
      return make_unexpected(
          fmt::format("Corrupted persistence version: {}", pv.version()));
    } else if (pv.version() > CURRENT_PERSISTENCE_VERSION) {
      return make_unexpected(
          fmt::format("Unsupported persistence version: {}", pv.version()));
    } else {
      // Is a previous version which needs updating.
      version = pv.version();
    }
  } else if (status.IsNotFound()) {
    // Version 0 will not have a persisted version yet.
    version = 0;
  } else {
    return make_unexpected(
        fmt::format(
            "Failed to read persistence version: {}",
            status.ToString()));
  }

  // Expecting at least persistence version >= 2.
  CHECK(2 <= version && version < CURRENT_PERSISTENCE_VERSION)
      << "Persistence version " << version << " is no longer supported";

  for (; version < CURRENT_PERSISTENCE_VERSION; version++) {
    REBOOT_DATABASE_LOG(1) << "Migrating persistence from version " << version;
    expected<void> migrate;
    switch (version) {
      case 2:
        migrate = MigratePersistence2To3(request);
        REBOOT_DATABASE_LOG(1) << "Migrated persistence to version " << version;
        break;
      case 3: migrate = MigratePersistence3To4(request); break;
      default: LOG(FATAL) << "Unreachable";
    }
    if (!migrate.has_value()) {
      return migrate;
    }
  }

  return {};
}

////////////////////////////////////////////////////////////////////////////////
//
// Helper functions for sharding logic. These must match the logic in:
// - `public/reboot/aio/placement.py`'s `PlanOnlyPlacementClient` (the Python
//   routing logic).
// - `compute_header_x_reboot_server_id.lua.j2` (the Envoy routing logic).
//
////////////////////////////////////////////////////////////////////////////////

// Helper function to compute SHA1 hash of the first component of a state_ref.
// The first component is the part before the first '/' character.
std::string DatabaseService::ComputeStateRefHash(
    std::string_view state_ref) const {
  // Extract the first component of the state ref (before any '/').
  std::string_view first_component = state_ref;
  size_t slash_pos = state_ref.find('/');
  if (slash_pos != std::string::npos) {
    first_component = state_ref.substr(0, slash_pos);
  }

  // Compute SHA1 hash of the first component.
  unsigned char hash[SHA_DIGEST_LENGTH];
  SHA1(
      reinterpret_cast<const unsigned char*>(first_component.data()),
      first_component.size(),
      hash);

  return std::string(reinterpret_cast<const char*>(hash), SHA_DIGEST_LENGTH);
}

// Helper function to determine which shard owns a given hash.
// Uses a binary search on `sorted_shard_first_keys_`.
std::string DatabaseService::GetShardForHash(
    const std::string& hash_str) const {
  // We should always have at least one shard configured.
  CHECK(!sorted_shard_first_keys_.empty())
      << "No shards configured - this should not happen";

  // `upper_bound` finds the first entry with `shard_first_key > hash_str`.
  // Stepping back one gives the last entry with `shard_first_key <=
  // hash_str`, which is the owning shard. The first shard always has
  // `shard_first_key == ""`, so the result should be always valid.
  auto iterator = std::upper_bound(
      sorted_shard_first_keys_.begin(),
      sorted_shard_first_keys_.end(),
      hash_str,
      [](const std::string& hash,
         const std::pair<std::string, std::string>& entry) {
        return hash < entry.first;
      });

  CHECK(iterator != sorted_shard_first_keys_.begin())
      << "No shard found for hash " << hash_str
      << " - this indicates a serious shard configuration error";

  --iterator;
  return iterator->second;
}

// Helper function to determine which shard owns a given state_ref.
std::string DatabaseService::GetShardForStateRef(
    std::string_view state_ref,
    bool use_cache) {
  // TODO: improve stout to support C++20 "heterogeneous lookup" to
  // avoid needing to make a string copy here.
  std::string state_ref_copy(state_ref);

  // Check if we have this cached.
  if (use_cache) {
    std::lock_guard lock(shard_cache_mutex_);
    Option<std::string> cached_shard = shard_for_state_ref_.get(state_ref_copy);
    if (cached_shard.isSome()) {
      return cached_shard.get();
    }
  }

  // Compute the shard outside the cache lock — it's a pure function
  // and concurrent computation for the same `state_ref` is harmless
  // (both threads will arrive at the same answer).
  std::string shard = GetShardForHash(ComputeStateRefHash(state_ref));

  if (use_cache) {
    std::lock_guard lock(shard_cache_mutex_);
    shard_for_state_ref_.put(state_ref_copy, shard);
  }

  return shard;
}

////////////////////////////////////////////////////////////////////////

bool DatabaseService::BelongsToShard(
    std::string_view state_type,
    std::string_view state_ref,
    const std::unordered_set<std::string>& shard_ids,
    bool use_cache) {
  // We should always have shards configured.
  CHECK(!server_info_.shard_infos().empty())
      << "No shards configured - this should not happen";

  // Determine which shard owns this state_ref.
  std::string target_shard_id = GetShardForStateRef(state_ref, use_cache);

  // Check if the target shard is in the set of requested shards.
  return shard_ids.find(target_shard_id) != shard_ids.end();
}

////////////////////////////////////////////////////////////////////////

grpc::Status DatabaseService::Recover(
    grpc::ServerContext* context,
    const RecoverRequest* request,
    grpc::ServerWriter<RecoverResponse>* responses) {
  if (test_only_hook_for_long_running_rpc_) {
    test_only_hook_for_long_running_rpc_(
        TestOnlyLongRunningRPCHookSite::RECOVER_ENTERED);
  }

  REBOOT_DATABASE_LOG(1) << "Recover { " << request->ShortDebugString() << " }";

  // Validate that shard_ids are provided.
  if (request->shard_ids().empty()) {
    return grpc::Status(
        grpc::INVALID_ARGUMENT,
        "shard_ids are required for Recover request");
  }

  // Migrate to the current persistence version, if necessary.
  expected<void> maybe_migrate = MaybeMigratePersistence(*request);
  if (!maybe_migrate.has_value()) {
    return grpc::Status(grpc::UNKNOWN, maybe_migrate.error());
  }

  // TODO: recover tasks, idempotent mutations (as long as we continue
  // to do so for backwards compatibility), and transactions in
  // parallel!

  // Handle the `shard_ids` as a hash set for efficiency.
  std::unordered_set<std::string> shard_ids(
      request->shard_ids().begin(),
      request->shard_ids().end());

  REBOOT_DATABASE_LOG(1) << "Recovering tasks";

  // Send the timestamp so the server can use it for restart
  // detection. Must be strictly greater (at millisecond granularity)
  // than any timestamp previously returned by
  // `monotonic_clock_->Now()`, so the server can detect if it
  // restarted while involved in a transaction.
  RecoverResponse response;
  *response.mutable_timestamp() = monotonic_clock_->Now(/*strict=*/true);
  responses->Write(response);

  if (grpc::Status status = RecoverTasks(*context, *responses, shard_ids);
      !status.ok()) {
    return status;
  }

  // NOTE: newer versions of Reboot recover idempotent mutations on
  // demand via `RecoverIdempotentMutations()`, but for backwards
  // compatibility we still support recovering them here.
  if (!request->skip_idempotent_mutations()) {
    REBOOT_DATABASE_LOG(1) << "Recovering idempotent mutations";

    if (grpc::Status status =
            RecoverShardsIdempotentMutations(*context, *responses, shard_ids);
        !status.ok()) {
      return status;
    }
  }

  REBOOT_DATABASE_LOG(1) << "Recovering transactions";

  expected<void, grpc::Status> recover_transactions =
      RecoverTransactions(*context, *responses, shard_ids);

  if (!recover_transactions.has_value()) {
    return recover_transactions.error();
  }

  return grpc::Status::OK;
}

////////////////////////////////////////////////////////////////////////

grpc::Status DatabaseService::RecoverIdempotentMutations(
    grpc::ServerContext* context,
    const RecoverIdempotentMutationsRequest* request,
    grpc::ServerWriter<RecoverIdempotentMutationsResponse>* responses) {
  if (test_only_hook_for_long_running_rpc_) {
    test_only_hook_for_long_running_rpc_(
        TestOnlyLongRunningRPCHookSite::RECOVER_IDEMPOTENT_MUTATIONS_ENTERED);
  }

  REBOOT_DATABASE_LOG(1) << "RecoverIdempotentMutations { "
                         << request->ShortDebugString() << " }";

  expected<rocksdb::ColumnFamilyHandle*> column_family_handle =
      LookupColumnFamilyHandle(request->state_type());

  // There might not be any instances of the state type yet, so just
  // return without any idempotent mutations.
  if (!column_family_handle.has_value()) {
    return grpc::Status::OK;
  }

  std::unique_ptr<rocksdb::Iterator> iterator(CHECK_NOTNULL(
      db_->NewIterator(NonPrefixIteratorReadOptions(), *column_family_handle)));

  RecoverIdempotentMutationsResponse response;

  size_t estimated_batch_bytes = 0;

  // Extract optional `workflow_id` and `workflow_iteration` for scoping.
  std::optional<std::string> workflow_id;
  if (request->has_workflow_id()) {
    workflow_id = request->workflow_id();
  }

  std::optional<uint64_t> workflow_iteration;
  if (request->has_workflow_iteration()) {
    workflow_iteration = request->workflow_iteration();
  }

  if (request->has_idempotency_key()) {
    expected<std::string> idempotent_mutation_key_prefix =
        MakeIdempotentMutationKey(
            request->state_ref(),
            request->idempotency_key(),
            workflow_id,
            workflow_iteration);

    if (!idempotent_mutation_key_prefix.has_value()) {
      return grpc::Status(
          grpc::UNKNOWN,
          idempotent_mutation_key_prefix.error());
    }

    if (grpc::Status status = RecoverIdempotentMutationsForKeyPrefix(
            *iterator,
            *idempotent_mutation_key_prefix,
            std::nullopt,
            *responses,
            response,
            estimated_batch_bytes);
        !status.ok()) {
      return status;
    }

    CHECK_LE(response.idempotent_mutations_size(), 1)
        << "Only expecting at most a single idempotency key";
  } else if (workflow_id.has_value() && workflow_iteration.has_value()) {
    CHECK_EQ(workflow_id->size(), 16)
        << "Expecting workflow id to be the raw 16-byte format";

    // Recover this iteration's mutations. Only non-expiring
    // mutations are stored at the iteration scope because only
    // `.per_iteration()` sets the `workflow_iteration` header,
    // and it uses deterministic UUIDv4 keys.
    if (grpc::Status status = RecoverIdempotentMutationsForKeyPrefix(
            *iterator,
            fmt::format(
                WORKFLOW_ITERATION_IDEMPOTENT_MUTATION_KEY_PREFIX ":{}:{}:{}",
                request->state_ref(),
                *workflow_id,
                *workflow_iteration),
            std::nullopt,
            *responses,
            response,
            estimated_batch_bytes);
        !status.ok()) {
      return status;
    }
  } else if (workflow_id.has_value()) {
    CHECK_EQ(workflow_id->size(), 16)
        << "Expecting workflow id to be the raw 16-byte format";

    // Recover this workflow's non-expiring mutations.
    if (grpc::Status status = RecoverIdempotentMutationsForKeyPrefix(
            *iterator,
            fmt::format(
                WORKFLOW_IDEMPOTENT_MUTATION_KEY_PREFIX ":{}:{}",
                request->state_ref(),
                *workflow_id),
            std::nullopt,
            *responses,
            response,
            estimated_batch_bytes);
        !status.ok()) {
      return status;
    }

    // Recover this workflow's expiring idempotent mutations that have
    // an expiration timestamp _after_ the current time (in
    // milliseconds since Unix epoch).
    if (grpc::Status status = RecoverIdempotentMutationsForKeyPrefix(
            *iterator,
            fmt::format(
                WORKFLOW_EXPIRING_IDEMPOTENT_MUTATION_KEY_PREFIX ":{}:{}:{}",
                request->state_ref(),
                *workflow_id,
                CurrentTimestampForKeyPrefix()),
            // Don't recover past this workflow's expiring idempotent
            // mutations, which may have timestamps that are larger
            // than the current timestamp.
            fmt::format(
                WORKFLOW_EXPIRING_IDEMPOTENT_MUTATION_KEY_PREFIX ":{}:{}",
                request->state_ref(),
                *workflow_id),
            *responses,
            response,
            estimated_batch_bytes);
        !status.ok()) {
      return status;
    }
  } else {
    // Non-workflow-scoped recovery: delegate to the shared
    // helper that is also used by `Preload`.
    if (grpc::Status status = RecoverNonWorkflowIdempotentMutations(
            *iterator,
            request->state_ref(),
            *responses,
            response,
            estimated_batch_bytes);
        !status.ok()) {
      return status;
    }
  }

  // Flush any remaining idempotent mutations.
  if (grpc::Status status =
          WriteAndClearResponse(*responses, response, estimated_batch_bytes);
      !status.ok()) {
    return status;
  }

  return grpc::Status::OK;
}

////////////////////////////////////////////////////////////////////////

grpc::Status DatabaseService::Preload(
    grpc::ServerContext* context,
    const PreloadRequest* request,
    grpc::ServerWriter<PreloadResponse>* responses) {
  REBOOT_DATABASE_LOG(1) << "Preload { " << request->ShortDebugString() << " }";

  // The first response message carries the state and the current
  // timestamp (for clock refresh). Idempotent mutations are streamed
  // in this and subsequent messages, batched by the helper when the
  // estimated byte size reaches the flush threshold.
  PreloadResponse response;
  size_t estimated_batch_bytes = 0;

  // Piggyback the current timestamp for refresh.
  *response.mutable_timestamp() = monotonic_clock_->Now();

  expected<rocksdb::ColumnFamilyHandle*> column_family_handle =
      LookupColumnFamilyHandle(request->state_type());

  if (column_family_handle.has_value()) {
    if (!request->skip_state()) {
      // Fetch the state for this `state_ref` if it exists.
      const std::string& key = MakeActorStateKey(request->state_ref());
      std::string value;
      rocksdb::Status status = db_->Get(
          rocksdb::ReadOptions(),
          *column_family_handle,
          rocksdb::Slice(key),
          &value);

      if (status.ok()) {
        Actor* actor = response.mutable_actor();
        actor->set_state_type(request->state_type());
        actor->set_state_ref(request->state_ref());
        actor->set_state(value);
      } else if (!status.IsNotFound()) {
        return grpc::Status(
            grpc::UNKNOWN,
            fmt::format("Failed to load actor state: {}", status.ToString()));
      }
    }

    if (!request->skip_idempotent_mutations()) {
      // Recover non-workflow-scoped idempotent mutations for this
      // `state_ref` via the shared helper. The helper streams batches
      // when the response gets too large; we flush any remaining
      // mutations below.
      std::unique_ptr<rocksdb::Iterator> iterator(
          CHECK_NOTNULL(db_->NewIterator(
              NonPrefixIteratorReadOptions(),
              *column_family_handle)));

      if (grpc::Status status = RecoverNonWorkflowIdempotentMutations(
              *iterator,
              request->state_ref(),
              *responses,
              response,
              estimated_batch_bytes);
          !status.ok()) {
        return status;
      }
    }
  }

  // NOTE: if the column family doesn't exist (state type unknown),
  // there is no state and no idempotent mutations to recover. We
  // still write the (mostly empty) first response below so the client
  // gets the timestamp.

  // Flush any remaining content (the first response with actor
  // state + timestamp, plus any leftover idempotent mutations).
  responses->Write(response);

  return grpc::Status::OK;
}

////////////////////////////////////////////////////////////////////////

grpc::Status DatabaseService::RefreshTimestamp(
    grpc::ServerContext* context,
    const RefreshTimestampRequest* request,
    RefreshTimestampResponse* response) {
  *response->mutable_timestamp() = monotonic_clock_->Now();
  return grpc::Status::OK;
}

////////////////////////////////////////////////////////////////////////

expected<std::unique_ptr<DatabaseServer>> DatabaseServer::Instantiate(
    const std::filesystem::path& state_directory,
    const ServerInfo& server_info,
    std::string address) {
  grpc::ServerBuilder builder;

  builder.SetMaxReceiveMessageSize(kMaxDatabaseMessageTransportBytes);
  builder.SetMaxSendMessageSize(kMaxDatabaseMessageTransportBytes);

  std::optional<int> port;

  if (absl::EndsWith(address, ":0")) {
    port = 0;
    builder.AddListeningPort(
        address,
        grpc::InsecureServerCredentials(),
        &*port);
  } else {
    builder.AddListeningPort(address, grpc::InsecureServerCredentials());
  }

  expected<std::unique_ptr<grpc::Service>> service =
      DatabaseService::Instantiate(state_directory, server_info);

  if (!service.has_value()) {
    throw std::runtime_error(
        fmt::format("Failed to instantiate service: {}", service.error()));
  }

  builder.RegisterService(service->get());

  std::unique_ptr<grpc::Server> server(builder.BuildAndStart());

  // NOTE: we'll only know the 'port' after we have successfully
  // started the server, hence we need to update 'address' here.
  if (port.has_value()) {
    address = fmt::format("{}:{}", absl::StripSuffix(address, ":0"), *port);
  }

  REBOOT_DATABASE_LOG(1) << "sidecar gRPC server listening on " << address;

  return std::unique_ptr<DatabaseServer>(new DatabaseServer(
      std::move(service.value()),
      std::move(server),
      address));
}

////////////////////////////////////////////////////////////////////////

void TestOnly_EnableLegacyCoordinatorPrepared(grpc::Service* service) {
  auto* sidecar_service = dynamic_cast<DatabaseService*>(service);
  if (sidecar_service) {
    sidecar_service->SetAllowLegacyCoordinatorPrepared(true);
  }
}

void SetTestOnlyHookForLongRunningRPC(
    grpc::Service* service,
    std::function<void(TestOnlyLongRunningRPCHookSite)> hook) {
  auto* db_service = dynamic_cast<DatabaseService*>(service);
  if (db_service) {
    db_service->SetTestOnlyHookForLongRunningRPC(std::move(hook));
  }
}

////////////////////////////////////////////////////////////////////////

}  // namespace rbt::server

////////////////////////////////////////////////////////////////////////
