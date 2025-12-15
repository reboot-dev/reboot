#include "rebootdev/server/database.h"

#include <openssl/sha.h>

#include <filesystem>
#include <fstream>
#include <ios>
#include <unordered_set>

#include "absl/strings/str_split.h"
#include "absl/strings/strip.h"
#include "fmt/format.h"
#include "fmt/ostream.h"
#include "fmt/ranges.h"
#include "glog/logging.h"
#include "google/protobuf/util/message_differencer.h"
#include "grpcpp/server_builder.h"
#include "rbt/v1alpha1/application_metadata.pb.h"
#include "rbt/v1alpha1/database.grpc.pb.h"
#include "rbt/v1alpha1/tasks.pb.h"
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
using rbt::v1alpha1::PreparedTransactionCoordinator;
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
using rbt::v1alpha1::TransactionCoordinatorCleanupRequest;
using rbt::v1alpha1::TransactionCoordinatorCleanupResponse;
using rbt::v1alpha1::TransactionCoordinatorPreparedRequest;
using rbt::v1alpha1::TransactionCoordinatorPreparedResponse;
using rbt::v1alpha1::TransactionParticipantAbortRequest;
using rbt::v1alpha1::TransactionParticipantAbortResponse;
using rbt::v1alpha1::TransactionParticipantCommitRequest;
using rbt::v1alpha1::TransactionParticipantCommitResponse;
using rbt::v1alpha1::TransactionParticipantPrepareRequest;
using rbt::v1alpha1::TransactionParticipantPrepareResponse;

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
  grpc::Status TransactionCoordinatorCleanup(
      grpc::ServerContext* context,
      const TransactionCoordinatorCleanupRequest* request,
      TransactionCoordinatorCleanupResponse* response) override;
  grpc::Status Export(
      grpc::ServerContext* context,
      const ExportRequest* request,
      ExportResponse* response) override;
  grpc::Status GetApplicationMetadata(
      grpc::ServerContext* context,
      const GetApplicationMetadataRequest* request,
      GetApplicationMetadataResponse* response) override;
  grpc::Status StoreApplicationMetadata(
      grpc::ServerContext* context,
      const StoreApplicationMetadataRequest* request,
      StoreApplicationMetadataResponse* response) override;

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
      const std::string& state_type);

  // Lookup a rocksdb column family handle for the specified state type,
  // or try and create one if no such column family exists for the
  // state type, or fail if a column family could not be created.
  expected<rocksdb::ColumnFamilyHandle*> LookupOrCreateColumnFamilyHandle(
      const std::string& state_type);

  // Iterate through and return a printable list of all the keys stored in the
  // database, for debugging purposes.
  std::string ListDatabaseKeys();

  // Lookup an ongoing transaction for the specified state type and actor
  // or fail if no transaction exists.
  expected<stout::borrowed_ref<rocksdb::Transaction>> LookupTransaction(
      const std::string& state_type,
      const std::string& state_ref);

  // Lookup an ongoing transaction or begin a new transaction for the
  // specified state type and actor if no transaction already exists.
  expected<stout::borrowed_ref<rocksdb::Transaction>> LookupOrBeginTransaction(
      const Transaction& transaction,
      bool store_participant = true);

  // Delete an ongoing transaction.
  void DeleteTransaction(
      expected<stout::borrowed_ref<rocksdb::Transaction>>&& txn);

  // Helper to check if an actor has an ongoing transaction.
  bool HasTransaction(const std::string& state_ref);

  // Helper to validate a non-transactional store request.
  expected<void> ValidateNonTransactionalStore(const StoreRequest& request);

  // Helper for recovering tasks.
  void RecoverTasks(
      grpc::ServerWriter<RecoverResponse>& responses,
      const std::unordered_set<std::string>& shard_ids);

  // Helper for recovering transactions.
  expected<void> RecoverTransactions(
      grpc::ServerWriter<RecoverResponse>& responses,
      const std::unordered_set<std::string>& shard_ids);

  // Helper for recovering uncommitted tasks within a transaction.
  void RecoverTransactionTasks(
      Transaction& transaction,
      stout::borrowed_ref<rocksdb::Transaction>& txn);

  // Helper for recovering uncommitted idempotent mutations within a
  // transaction.
  void RecoverTransactionIdempotentMutations(
      Transaction& transaction,
      stout::borrowed_ref<rocksdb::Transaction>& txn);

  // Helper for recovering idempotent mutations within some shards.
  void RecoverShardsIdempotentMutations(
      grpc::ServerWriter<RecoverResponse>& responses,
      const std::unordered_set<std::string>& shard_ids);

  // Check if a state ref belongs to any of the specified shards.
  bool BelongsToShard(
      std::string_view state_type,
      std::string_view state_ref,
      const std::unordered_set<std::string>& shard_ids);

  // Helper function to compute SHA1 hash of the first component of a state_ref.
  std::string ComputeStateRefHash(std::string_view state_ref) const;

  // Helper function to determine which shard owns a given hash.
  std::string GetShardForHash(const std::string& hash_str) const;

  // Helper function to determine which shard owns a given state_ref.
  std::string GetShardForStateRef(std::string_view state_ref);

  // Helper for sending a response to the client and clearing the batch.
  template <typename T>
  void WriteAndClearResponse(
      grpc::ServerWriter<T>& responses,
      T& response,
      size_t& batch_size) {
    if (batch_size != 0) {
      responses.Write(response);
      response.Clear();
      batch_size = 0;
    }
  }

  // Helper for sending a response to the client and clearing the batch
  // if the batch size has reached the maximum batch size.
  template <typename T>
  void MaybeWriteAndClearResponse(
      grpc::ServerWriter<T>& responses,
      T& response,
      size_t& batch_size,
      const size_t& max_batch_size) {
    if (++batch_size == max_batch_size) {
      WriteAndClearResponse(responses, response, batch_size);
    }
  }

  // Mutex owning instance members.
  std::mutex mutex_;

  std::filesystem::path state_directory_;
  std::filesystem::path metadata_path_;
  std::shared_ptr<rocksdb::Statistics> statistics_;

  // Collection of column family handles, one for each state type. Note
  // we're currently just using a vector here as we assume this will
  // be a relatively small list and it will be faster to just iterate
  // through it when doing a lookup.
  std::vector<rocksdb::ColumnFamilyHandle*> column_family_handles_;

  std::unique_ptr<rocksdb::TransactionDB> db_;

  // Server info containing shard information.
  ServerInfo server_info_;

  // Cache of shard IDs for state refs, necessary because computing
  // the shard ID when you have 2^14 of them over and over again
  // really adds up!
  Cache<std::string, std::string> shard_for_state_ref_;
  // Cache capacity large enough to be helpful but not so large that
  // it's more than O(10s of MB).
  static const size_t SHARD_FOR_STATE_REF_CAPACITY = 8192;

  // We track ongoing transactions indexed by 'state_ref' because there should
  // only ever be a single transaction per actor and we want to be able to
  // look up whether or not a actor is currently in a transaction.
  std::map<
      std::string,  // An actor id.
      stout::Borrowable<std::unique_ptr<rocksdb::Transaction>>>
      txns_;

  // Flag to control whether newly prepared coordinator transactions are allowed
  // to use the "legacy" format (i.e. not providing a coordinator state ref).
  // This should only be true for tests.
  bool allow_legacy_coordinator_prepared_ = false;
};

////////////////////////////////////////////////////////////////////////

// Gets the actor id from a 'rocksdb::Transaction' based on the
// naming schema used in 'MakeTransactionName'.
std::string GetStateRefFromTransaction(const rocksdb::Transaction& txn) {
  const std::string& name = txn.GetName();
  return name.substr(0, name.rfind(':'));
}

// Overload of 'GetStateRef' when we have a borrowable.
std::string GetStateRefFromTransaction(
    const stout::borrowed_ref<rocksdb::Transaction>& txn) {
  return GetStateRefFromTransaction(*txn);
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
    txns_.emplace(state_ref, std::unique_ptr<rocksdb::Transaction>(txn));
  }
}

////////////////////////////////////////////////////////////////////////

DatabaseService::~DatabaseService() {
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

std::string DatabaseService::ListDatabaseKeys() {
  std::ostringstream stream;
  stream << "{";
  for (rocksdb::ColumnFamilyHandle* column_family_handle :
       column_family_handles_) {
    stream << "\n  " << column_family_handle->GetName() << ": [";
    std::unique_ptr<rocksdb::Iterator> iterator(CHECK_NOTNULL(db_->NewIterator(
        NonPrefixIteratorReadOptions(),
        column_family_handle)));

    iterator->SeekToFirst();
    while (iterator->Valid()) {
      stream << "\n    " << iterator->key().ToStringView() << ",";
      iterator->Next();
    }
    stream << "],";
  }
  stream << "\n}";
  return stream.str();
}

////////////////////////////////////////////////////////////////////////

expected<rocksdb::ColumnFamilyHandle*>
DatabaseService::LookupColumnFamilyHandle(const std::string& state_type) {
  // TODO: ensure `mutex_` is currently held by this thread.

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
  // TODO: ensure `mutex_` is currently held by this thread.

  // TODO(benh): make 'column_family_handles_' be a map?
  auto iterator = std::find_if(
      std::begin(column_family_handles_),
      std::end(column_family_handles_),
      [&state_type](rocksdb::ColumnFamilyHandle* column_family_handle) {
        return column_family_handle->GetName() == state_type;
      });

  if (iterator == std::end(column_family_handles_)) {
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
    } else {
      // Save column family handle for future look ups and destruction!
      column_family_handles_.push_back(column_family_handle);

      return column_family_handle;
    }
  } else {
    return *iterator;
  }
}

////////////////////////////////////////////////////////////////////////

// Returns the name we use for 'rocksdb::Transaction'.
std::string MakeTransactionName(
    const std::string& state_ref,
    const std::string& transaction_id) {
  return fmt::format("{}:{}", state_ref, transaction_id);
}

////////////////////////////////////////////////////////////////////////

// Gets the transaction ID from a 'rocksdb::Transaction' based on the
// naming schema that we use in 'MakeTransactionName'.
std::string GetTransactionId(
    const stout::borrowed_ref<rocksdb::Transaction>& txn) {
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
// (check_line_length skip)
#define PREPARED_TRANSACTION_COORDINATOR_KEY_PREFIX                            \
  "prepared-transaction-coordinator"

// Returns a RocksDB key that represents a prepared transaction from the
// coordinator's perspective, including shard information.
std::string MakePreparedTransactionCoordinatorKey(
    const std::string& shard_id,
    const UUID& transaction_id) {
  return fmt::format(
      PREPARED_TRANSACTION_COORDINATOR_KEY_PREFIX ":{}:{}",
      shard_id,
      transaction_id.toString());
}

// Legacy function for backward compatibility. Returns a key without shard
// information.
std::string MakeLegacyTransactionPreparedKey(const UUID& transaction_id) {
  return fmt::format(
      LEGACY_PREPARED_TRANSACTION_COORDINATOR_KEY_PREFIX ":{}",
      transaction_id.toString());
}

////////////////////////////////////////////////////////////////////////

// To ensure that we can handle failures during a migration we need to
// differentiate the key prefix. We only use a version suffix, i.e.,
// `_V3` on the old one so that the code doesn't have a mix of
// versions in it, it's only the migration code that uses the
// suffixes.
#define IDEMPOTENT_MUTATION_KEY_PREFIX_V3 "idempotent-mutation"
#define IDEMPOTENT_MUTATION_KEY_PREFIX "idempotent-mutation-v4"

// Returns a key for storing in rocksdb that represents an idempotent
// mutation. We use the stringified UUID to make debugging easier.
// TODO: Skip deserializing/reserializing the UUID in the sidecar, and
// send it string encoded from the client.
std::string MakeIdempotentMutationKey(
    const std::string& state_ref,
    const UUID& idempotency_key) {
  return fmt::format(
      IDEMPOTENT_MUTATION_KEY_PREFIX ":{}:{}",
      state_ref,
      idempotency_key.toString());
}

////////////////////////////////////////////////////////////////////////

expected<stout::borrowed_ref<rocksdb::Transaction>>
DatabaseService::LookupTransaction(
    const std::string& state_type,
    const std::string& state_ref) {
  // TODO: ensure `mutex_` is currently held by this thread.

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

expected<stout::borrowed_ref<rocksdb::Transaction>>
DatabaseService::LookupOrBeginTransaction(
    const Transaction& transaction,
    bool store_participant) {
  // TODO: ensure `mutex_` is currently held by this thread.

  // Get out the _root_ transaction's UUID, that's the transaction
  // that any nested transaction ultimately belongs.
  Try<UUID> transaction_id = UUID::fromBytes(transaction.transaction_ids(0));
  if (transaction_id.isError()) {
    return make_unexpected(
        fmt::format(
            "Failed to lookup or begin transaction for "
            "state type '{}' actor '{}': {}",
            transaction.state_type(),
            transaction.state_ref(),
            transaction_id.error()));
  }

  expected<stout::borrowed_ref<rocksdb::Transaction>> txn =
      LookupTransaction(transaction.state_type(), transaction.state_ref());

  if (txn.has_value()) {
    // We already have a transaction for this actor. Presumably this
    // lookup is due to a write within that transaction, but we should
    // check that the requested transaction is the same as the one
    // that is ongoing because we can't have two different
    // transactions for the same actor at the same time.
    const std::string& name = MakeTransactionName(
        transaction.state_ref(),
        transaction_id->toString());

    if ((*txn)->GetName() == name) {
      return txn;
    } else {
      return make_unexpected(
          fmt::format(
              "Failed to begin transaction '{}' for state type '{}' actor '{}' "
              "as transaction '{}' has already begun",
              transaction_id->toString(),
              transaction.state_type(),
              transaction.state_ref(),
              GetTransactionId(*txn)));
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
                transaction_id->toString()));
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
                transaction_id->toString(),
                status.ToString()));
      }
    }

    REBOOT_DATABASE_LOG(1) << "Beginning transaction '"
                           << transaction_id->toString() << "' for state type '"
                           << transaction.state_type() << "' actor '"
                           << transaction.state_ref() << "'";

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
              transaction_id->toString()));
    }

    // We must name the transaction in order for rocksdb to persist
    // it when we prepare. We also use the name to be able to
    // determine whether or not we're in the same ongoing
    // transaction for future calls to 'LookupOrBeginTransaction'.
    rocksdb::Status status = txn->SetName(MakeTransactionName(
        transaction.state_ref(),
        transaction_id->toString()));

    if (status.ok()) {
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
              transaction_id->toString(),
              status.ToString()));
    }
  }
}

////////////////////////////////////////////////////////////////////////

void DatabaseService::DeleteTransaction(
    expected<stout::borrowed_ref<rocksdb::Transaction>>&& txn) {
  // TODO: ensure `mutex_` is currently held by this thread.

  auto iterator = txns_.find(GetStateRefFromTransaction(*txn));
  CHECK(iterator != std::end(txns_));

  // Before we erase we need to release the borrow so that it can be
  // deleted otherwise we'll hang forever! We accomplish that by
  // replacing 'txn' with an unexpected.
  txn = make_unexpected(std::string("Release the borrowed reference!"));

  txns_.erase(iterator);
}

////////////////////////////////////////////////////////////////////////

bool DatabaseService::HasTransaction(const std::string& state_ref) {
  // TODO: ensure `mutex_` is currently held by this thread.
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
  std::unique_lock lock(mutex_);

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

  rocksdb::Iterator* it;
  if (request->has_transaction()) {
    // Invariant: if this call is made within a transaction, the transaction
    // must have already been stored. See:
    //   https://github.com/reboot-dev/mono/issues/4019.
    expected<stout::borrowed_ref<rocksdb::Transaction>> txn = LookupTransaction(
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
    it = txn.value()->GetIterator(read_options, *column_family_handle);
  } else {
    it = db_->NewIterator(read_options, *column_family_handle);
  }

  // Seek to the start of the range to scan.
  if (request->has_start()) {
    it->Seek(
        fmt::format(
            STATE_KEY_PREFIX ":{}{}{}",
            request->parent_state_ref(),
            '/',
            request->start()));
  } else {
    // If uncapped, append only a trailing forward slash.
    it->Seek(
        fmt::format(
            STATE_KEY_PREFIX ":{}{}",
            request->parent_state_ref(),
            '/'));
  }

  for (int i = 0; i < request->limit() && it->Valid(); it->Next(), i++) {
    auto key = it->key();
    key.remove_prefix(strlen(STATE_KEY_PREFIX) + 1);
    *response->add_keys() = key.ToString();
    *response->add_values() = it->value().ToString();
  }

  if (!it->status().ok()) {
    return grpc::Status(
        grpc::UNKNOWN,
        fmt::format(
            "Failed to scan { {} }: {}",
            request->ShortDebugString(),
            it->status().ToString()));
  }

  return grpc::Status::OK;
}

////////////////////////////////////////////////////////////////////////

grpc::Status DatabaseService::ColocatedReverseRange(
    grpc::ServerContext* context,
    const ColocatedReverseRangeRequest* request,
    ColocatedReverseRangeResponse* response) {
  std::unique_lock lock(mutex_);

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

  rocksdb::Iterator* it;
  if (request->has_transaction()) {
    // Invariant: if this call is made within a transaction, the transaction
    // must have already been stored. See:
    //   https://github.com/reboot-dev/mono/issues/4019.
    expected<stout::borrowed_ref<rocksdb::Transaction>> txn = LookupTransaction(
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
    it = txn.value()->GetIterator(read_options, *column_family_handle);
  } else {
    it = db_->NewIterator(read_options, *column_family_handle);
  }

  // Seek to the start of the range to scan.
  if (request->has_start()) {
    it->SeekForPrev(
        fmt::format(
            STATE_KEY_PREFIX ":{}{}{}",
            request->parent_state_ref(),
            '/',
            request->start()));
  } else {
    // If uncapped, append '0', which sorts one higher than our separator ('/').
    // As noted above, this is incompatible with the prefix seek optimization in
    // RocksDB.
    it->SeekForPrev(
        fmt::format(
            STATE_KEY_PREFIX ":{}{}",
            request->parent_state_ref(),
            '0'));
  }

  for (int i = 0; i < request->limit() && it->Valid(); it->Prev(), i++) {
    auto key = it->key();
    key.remove_prefix(strlen(STATE_KEY_PREFIX) + 1);
    *response->add_keys() = key.ToString();
    *response->add_values() = it->value().ToString();
  }

  if (!it->status().ok()) {
    return grpc::Status(
        grpc::UNKNOWN,
        fmt::format(
            "Failed to scan { {} }: {}",
            request->ShortDebugString(),
            it->status().ToString()));
  }

  return grpc::Status::OK;
}

////////////////////////////////////////////////////////////////////////

grpc::Status DatabaseService::Find(
    grpc::ServerContext* context,
    const FindRequest* request,
    FindResponse* response) {
  std::unique_lock lock(mutex_);
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

  expected<rocksdb::ColumnFamilyHandle*> column_family_handle =
      LookupColumnFamilyHandle(request->state_type());
  if (!column_family_handle.has_value()) {
    // Return empty results for unknown state types rather than an error.
    // This is important because callers (like SidecarStateManager.actors())
    // may query for state types that haven't been created yet. A state type's
    // column family is only created when the first actor of that type is
    // stored, so returning an empty result correctly indicates there are no
    // actors of this type yet.
    return grpc::Status::OK;
  }

  // Use NonPrefixIteratorReadOptions to ensure we iterate over all keys
  // in total order. This is necessary because we have a prefix extractor
  // configured, and using the default ReadOptions could cause the iterator
  // to skip keys due to prefix optimization.
  rocksdb::ReadOptions read_options = NonPrefixIteratorReadOptions();
  std::unique_ptr<rocksdb::Iterator> it(
      db_->NewIterator(read_options, *column_family_handle));

  if (request->has_start()) {
    // Forward pagination from a specific key.
    const auto& start_key = request->start();
    std::string start_key_ref = MakeActorStateKey(start_key.state_ref());

    // Start at the specified key (inclusive).
    it->Seek(start_key_ref);

    if (start_key.exclusive() && it->Valid()
        && it->key().ToString() == start_key_ref) {
      // Start after the specified key.
      it->Next();
    }

    // Collect up to 'limit' entries going forward.
    uint32_t added_count = 0;
    while (added_count < request->limit() && it->Valid()) {
      std::string_view key_view = it->key().ToStringView();
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
      it->Next();
    }
  } else if (request->has_until()) {
    // Backward pagination before a specific key.
    const auto& until_key = request->until();
    std::string until_key_ref = MakeActorStateKey(until_key.state_ref());

    // End at the specified key (inclusive).
    it->SeekForPrev(until_key_ref);

    if (until_key.exclusive() && it->Valid()
        && it->key().ToString() == until_key_ref) {
      // End before the specified key.
      it->Prev();
    }

    // Collect up to 'limit' entries going backward, but we need to
    // reverse them since we want to return in forward order.
    std::vector<std::string> state_refs;
    uint32_t added_count = 0;
    while (added_count < request->limit() && it->Valid()) {
      std::string_view key_view = it->key().ToStringView();
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
      it->Prev();
    }

    // Reverse to maintain forward order in the response.
    response->mutable_state_refs()->Add(state_refs.rbegin(), state_refs.rend());
  } else {
    // No direction specified. Technically possible, but not supported.
    return grpc::Status(
        grpc::INVALID_ARGUMENT,
        "Must specify either 'start' or 'until' direction");
  }

  if (!it->status().ok()) {
    return grpc::Status(
        grpc::UNKNOWN,
        fmt::format("Failed to iterate: {}", it->status().ToString()));
  }

  return grpc::Status::OK;
}

////////////////////////////////////////////////////////////////////////

grpc::Status DatabaseService::Load(
    grpc::ServerContext* context,
    const LoadRequest* request,
    LoadResponse* response) {
  std::unique_lock lock(mutex_);

  REBOOT_DATABASE_LOG(1) << "Load { " << request->ShortDebugString() << " }";

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
  std::unique_lock lock(mutex_);

  REBOOT_DATABASE_LOG(1) << "Store { " << request->ShortDebugString() << " }";

  // Helper for either adding all of the state updates to a
  // 'rocksdb::WriteBatch' or a 'rocksdb::Transaction',
  // depending on whether or not there is an ongoing
  // transaction.
  auto UpdateBatch = [&](auto& batch) -> expected<rocksdb::Status> {
    // First add the actor upserts.
    for (const Actor& actor : request->actor_upserts()) {
      if (!actor.has_state()) {
        return make_unexpected(
            fmt::format(
                "Actor '{}' missing state to store",
                actor.state_ref()));
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
    for (const Task& task : request->task_upserts()) {
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
            fmt::format(
                "Failed to serialize task: {}",
                task.ShortDebugString()));
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
    for (const ColocatedUpsert& cup : request->colocated_upserts()) {
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

    // Also store response if this is an idempotent mutation.
    if (request->has_idempotent_mutation()) {
      // Get out the idempotency key.
      Try<UUID> idempotency_key =
          UUID::fromBytes(request->idempotent_mutation().key());
      if (idempotency_key.isError()) {
        return make_unexpected(idempotency_key.error());
      }
      expected<rocksdb::ColumnFamilyHandle*> column_family_handle =
          LookupOrCreateColumnFamilyHandle(
              request->idempotent_mutation().state_type());

      const std::string& idempotent_mutation_key = MakeIdempotentMutationKey(
          request->idempotent_mutation().state_ref(),
          *idempotency_key);

      std::string idempotent_mutation_bytes;
      if (!request->idempotent_mutation().SerializeToString(
              &idempotent_mutation_bytes)) {
        return make_unexpected("Failed to serialize 'IdempotentMutation'");
      }

      rocksdb::Status status = batch.Put(
          *column_family_handle,
          rocksdb::Slice(idempotent_mutation_key),
          rocksdb::Slice(idempotent_mutation_bytes));

      if (!status.ok()) {
        // Since the goal is to make all these updates
        // atomically we must fail if we run into any errors.
        return status;
      }
    }

    // Ensure that any additional column families are created.
    for (auto& state_type : request->ensure_state_types_created()) {
      expected<rocksdb::ColumnFamilyHandle*> column_family_handle =
          LookupOrCreateColumnFamilyHandle(state_type);

      if (!column_family_handle.has_value()) {
        // Since the goal is to make all these updates
        // atomically we must fail if we run into any errors.
        return make_unexpected(column_family_handle.error());
      }
    }

    return rocksdb::Status::OK();
  };

  if (request->has_transaction()) {
    // Request is within a transaction, look it up or begin it
    // if we do not yet have an ongoing transaction.
    expected<void> validate = ValidateTransactionalStore(*request);

    if (!validate.has_value()) {
      return grpc::Status(
          grpc::UNKNOWN,
          fmt::format("Failed to store: {}", validate.error()));
    }

    expected<stout::borrowed_ref<rocksdb::Transaction>> txn =
        LookupOrBeginTransaction(request->transaction());

    if (!txn.has_value()) {
      return grpc::Status(
          grpc::UNKNOWN,
          fmt::format("Failed to store: {}", txn.error()));
    }

    // Add all the updates from this request into the
    // transaction which will, if committed, apply them
    // atomically.
    expected<rocksdb::Status> status = UpdateBatch(**txn);

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

    expected<rocksdb::Status> status = UpdateBatch(batch);

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
  std::unique_lock lock(mutex_);

  REBOOT_DATABASE_LOG(1) << "TransactionParticipantPrepare { "
                         << request->ShortDebugString() << " }";

  expected<stout::borrowed_ref<rocksdb::Transaction>> txn =
      LookupTransaction(request->state_type(), request->state_ref());

  if (!txn.has_value()) {
    return grpc::Status(
        grpc::UNKNOWN,
        fmt::format("Failed to prepare transaction: {}", txn.error()));
  }

  // NOTE: we add the deletion of the transaction participant
  // key/value within the 'transaction' because we want it to be
  // deleted atomically with respect to the transaction
  // committing.

  const std::string& key = MakeTransactionParticipantKey(
      request->state_type(),
      request->state_ref());

  rocksdb::Status status = (*txn)->Delete(rocksdb::Slice(key));

  if (!status.ok()) {
    return grpc::Status(
        grpc::UNKNOWN,
        fmt::format(
            "Failed to delete transaction participant: {}",
            status.ToString()));
  }

  status = (*txn)->Prepare();

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
  std::unique_lock lock(mutex_);

  REBOOT_DATABASE_LOG(1) << "TransactionParticipantCommit { "
                         << request->ShortDebugString() << " }";

  expected<stout::borrowed_ref<rocksdb::Transaction>> txn =
      LookupTransaction(request->state_type(), request->state_ref());

  if (!txn.has_value()) {
    return grpc::Status(
        grpc::UNKNOWN,
        fmt::format("Failed to commit transaction: {}", txn.error()));
  }

  rocksdb::Status status = (*txn)->Commit();

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
  std::unique_lock lock(mutex_);

  REBOOT_DATABASE_LOG(1) << "TransactionParticipantAbort { "
                         << request->ShortDebugString() << " }";

  expected<stout::borrowed_ref<rocksdb::Transaction>> txn =
      LookupTransaction(request->state_type(), request->state_ref());

  if (!txn.has_value()) {
    return grpc::Status(
        grpc::UNKNOWN,
        fmt::format("Failed to abort transaction: {}", txn.error()));
  }

  rocksdb::Status status = (*txn)->Rollback();

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
  std::unique_lock lock(mutex_);

  REBOOT_DATABASE_LOG(1) << "TransactionCoordinatorPrepared { "
                         << request->ShortDebugString() << " }";

  // Get out the transaction's UUID.
  Try<UUID> transaction_id = UUID::fromBytes(request->transaction_id());
  if (transaction_id.isError()) {
    return grpc::Status(
        grpc::UNKNOWN,
        fmt::format(
            "Failed to store transaction as prepared: {}",
            transaction_id.error()));
  }

  std::string key;
  std::string data;

  if (request->has_prepared_transaction_coordinator()) {
    // New format with shard-aware storage.
    const auto& coordinator = request->prepared_transaction_coordinator();

    // Compute shard ID based on the coordinator's state_ref.
    std::string shard_id = GetShardForStateRef(coordinator.state_ref());
    key = MakePreparedTransactionCoordinatorKey(shard_id, *transaction_id);

    if (!coordinator.SerializeToString(&data)) {
      return grpc::Status(
          grpc::UNKNOWN,
          fmt::format(
              "Failed to store transaction '{}' as prepared: "
              "Failed to serialize",
              transaction_id->toString()));
    }
  } else {
    if (!allow_legacy_coordinator_prepared_) {
      return grpc::Status(
          grpc::INVALID_ARGUMENT,
          fmt::format(
              "Legacy coordinator prepared format is not allowed. "
              "Transaction '{}' must use the new format with "
              "transaction_coordinator field.",
              transaction_id->toString()));
    }

    // This is deprecated but kept to test our backwards compatibility story.
    key = MakeLegacyTransactionPreparedKey(*transaction_id);
    if (!request->participants().SerializeToString(&data)) {
      return grpc::Status(
          grpc::UNKNOWN,
          fmt::format(
              "Failed to store transaction '{}' as prepared: "
              "Failed to serialize",
              transaction_id->toString()));
    }
  }

  // NOTE: invariant for now is that a coordinator will not try
  // and perform this call more than once and thus we don't need
  // to check if the key already exists. If this ever changes we
  // should consider being more conservative here and if a key
  // already exists check that the data we are storing is the
  // same as what's in the request.

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

grpc::Status DatabaseService::TransactionCoordinatorCleanup(
    grpc::ServerContext* context,
    const TransactionCoordinatorCleanupRequest* request,
    TransactionCoordinatorCleanupResponse* response) {
  std::unique_lock lock(mutex_);

  REBOOT_DATABASE_LOG(1) << "TransactionCoordinatorCleanup { "
                         << request->ShortDebugString() << " }";

  Try<UUID> transaction_id = UUID::fromBytes(request->transaction_id());
  if (transaction_id.isError()) {
    return grpc::Status(
        grpc::UNKNOWN,
        fmt::format(
            "Failed to cleanup transaction: {}",
            transaction_id.error()));
  }

  // Where to delete the transaction (legacy, or sharded key) depends on whether
  // the request contained a `coordinator_state_ref`.
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
        MakePreparedTransactionCoordinatorKey(shard_id, *transaction_id);
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

grpc::Status DatabaseService::Export(
    grpc::ServerContext* context,
    const ExportRequest* request,
    ExportResponse* response) {
  std::unique_lock lock(mutex_);

  REBOOT_DATABASE_LOG(1) << "Export { " << request->ShortDebugString() << " }";

  // Validate that shard_ids are provided.
  if (request->shard_ids().empty()) {
    return grpc::Status(
        grpc::INVALID_ARGUMENT,
        "shard_ids are required for Export request");
  }

  // Convert to unordered_set for efficient lookups.
  std::unordered_set<std::string> shard_ids(
      request->shard_ids().begin(),
      request->shard_ids().end());

  expected<rocksdb::ColumnFamilyHandle*> column_family_handle =
      LookupOrCreateColumnFamilyHandle(request->state_type());

  if (!column_family_handle.has_value()) {
    return grpc::Status(
        grpc::UNKNOWN,
        fmt::format(
            "Failed to begin export for '{}': {}",
            request->state_type(),
            column_family_handle.error()));
  }

  rocksdb::Iterator* it = db_->NewIterator(
      NonPrefixIteratorReadOptions(),
      column_family_handle.value());

  for (it->SeekToFirst(); it->Valid(); it->Next()) {
    std::string_view key = it->key().ToStringView();
    size_t colon_position = key.find(":");
    if (colon_position == std::string::npos) {
      return grpc::Status(
          grpc::UNKNOWN,
          fmt::format(
              "Unrecognized entry for '{}': {}",
              request->state_type(),
              it->key().ToStringView()));
    }

    std::string_view key_type_prefix =
        it->key().ToStringView().substr(0, colon_position);

    ExportItem item;
    std::string state_ref;
    if (key_type_prefix == STATE_KEY_PREFIX) {
      state_ref =
          std::string(GetStateRefFromActorStateKey(it->key().ToStringView()));
      auto* actor = item.mutable_actor();
      actor->set_state_type(request->state_type());
      actor->set_state_ref(state_ref);
      actor->set_state(it->value().ToString());
    } else if (key_type_prefix == TASK_KEY_PREFIX) {
      auto* task = item.mutable_task();
      CHECK(task->ParseFromArray(it->value().data(), it->value().size()));
      state_ref = task->task_id().state_ref();
    } else if (key_type_prefix == IDEMPOTENT_MUTATION_KEY_PREFIX) {
      auto* mutation = item.mutable_idempotent_mutation();
      CHECK(mutation->ParseFromArray(it->value().data(), it->value().size()));
      state_ref = mutation->state_ref();
    } else {
      return grpc::Status(
          grpc::UNKNOWN,
          fmt::format(
              "Unrecognized entry for '{}': {}",
              request->state_type(),
              it->key().ToStringView()));
    }

    // If this item doesn't belong to one of the requested shards, skip it.
    if (!BelongsToShard(request->state_type(), state_ref, shard_ids)) {
      continue;
    }

    *response->add_items() = std::move(item);
  }

  if (!it->status().ok()) {
    return grpc::Status(
        grpc::UNKNOWN,
        fmt::format(
            "Failed to export '{}': {}",
            request->state_type(),
            it->status().ToString()));
  }

  return grpc::Status::OK;
}

////////////////////////////////////////////////////////////////////////

grpc::Status DatabaseService::GetApplicationMetadata(
    grpc::ServerContext* context,
    const GetApplicationMetadataRequest* request,
    GetApplicationMetadataResponse* response) {
  std::unique_lock lock(mutex_);

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
  std::unique_lock lock(mutex_);

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

void DatabaseService::RecoverTasks(
    grpc::ServerWriter<RecoverResponse>& responses,
    const std::unordered_set<std::string>& shard_ids) {
  RecoverResponse response;

  // We don't know what is the best batch size for this, so we
  // just use a number that is small enough to not cause
  // performance issues, but large enough to not cause too many
  // round trips.
  // TODO: This should be configurable and pick the better value for default.
  static size_t RECOVER_TASKS_BATCH_SIZE = 256;

  size_t batch_size = 0;

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
        *response.add_pending_tasks() = std::move(task);

        MaybeWriteAndClearResponse(
            responses,
            response,
            batch_size,
            RECOVER_TASKS_BATCH_SIZE);
      }

      iterator->Next();
    }
  }

  // Flush any remaining tasks.
  WriteAndClearResponse(responses, response, batch_size);
}

////////////////////////////////////////////////////////////////////////

void DatabaseService::RecoverTransactionTasks(
    Transaction& transaction,
    stout::borrowed_ref<rocksdb::Transaction>& txn) {
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
}

////////////////////////////////////////////////////////////////////////

void DatabaseService::RecoverTransactionIdempotentMutations(
    Transaction& transaction,
    stout::borrowed_ref<rocksdb::Transaction>& txn) {
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
}

////////////////////////////////////////////////////////////////////////

expected<void> DatabaseService::RecoverTransactions(
    grpc::ServerWriter<RecoverResponse>& responses,
    const std::unordered_set<std::string>& shard_ids) {
  std::unique_ptr<rocksdb::Iterator> iterator(
      CHECK_NOTNULL(db_->NewIterator(NonPrefixIteratorReadOptions())));

  // TODO: investigate using "prefix seek" for better performance, see:
  // https://github.com/facebook/rocksdb/wiki/Prefix-Seek
  iterator->Seek(rocksdb::Slice(TRANSACTION_PARTICIPANT_KEY_PREFIX));

  RecoverResponse response;

  // We don't know what is the best batch size for this, so we
  // just use a number that is small enough to not cause
  // performance issues, but large enough to not cause too many
  // round trips.
  // TODO: This should be configurable and pick the better value for default.
  static size_t RECOVER_PARTICIPANT_TRANSACTIONS_BATCH_SIZE = 256;

  size_t batch_size = 0;

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
    expected<stout::borrowed_ref<rocksdb::Transaction>> txn =
        LookupOrBeginTransaction(transaction, /* store_participant = */ false);

    CHECK(txn.has_value());

    if ((*txn)->GetState() == rocksdb::Transaction::PREPARED) {
      transaction.set_prepared(true);

      // Now recover any tasks for our actor that we'll need to dispatch if
      // the transaction gets committed.
      RecoverTransactionTasks(transaction, *txn);

      // Now recover any idempotent mutations for our actor that are part of
      // the transaction.
      RecoverTransactionIdempotentMutations(transaction, *txn);
    } else {
      // Transaction just started when we called
      // `LookupOrBeginTransaction()`!
      CHECK_EQ((*txn)->GetState(), rocksdb::Transaction::STARTED);
    }

    *response.add_participant_transactions() = std::move(transaction);

    MaybeWriteAndClearResponse(
        responses,
        response,
        batch_size,
        RECOVER_PARTICIPANT_TRANSACTIONS_BATCH_SIZE);

    iterator->Next();
  }

  // Flush any remaining participant transactions.
  WriteAndClearResponse(responses, response, batch_size);

  // Now recover any prepared coordinator transactions.
  //
  // It's possible that we'll have a coordinator transaction without
  // any participant transaction because the participant may have
  // committed and thus deleted the record of the transaction but we
  // have not yet completed the coordinator's "commit control loop".

  // We don't know what is the best batch size for this, so we
  // just use a number that is small enough to not cause
  // performance issues, but large enough to not cause too many
  // round trips.
  // TODO: This should be configurable and pick the better value for default.
  static size_t RECOVER_COORDINATOR_TRANSACTIONS_BATCH_SIZE = 256;

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


      // There's no way to convince `clang-format` to format the following line
      // in a way that doesn't violate our 80-character line length limit.
      // (check_line_length skip)
      PreparedTransactionCoordinator& coordinator_entry =
          (*response
                .mutable_prepared_transaction_coordinators())[transaction_id];

      // For legacy transactions we don't have a coordinator state reference,
      // so we leave `state_ref` empty and only populate `participants`.
      Participants participants;
      CHECK(participants.ParseFromArray(
          iterator->value().data(),
          iterator->value().size()));

      *coordinator_entry.mutable_participants() = std::move(participants);

      MaybeWriteAndClearResponse(
          responses,
          response,
          batch_size,
          RECOVER_COORDINATOR_TRANSACTIONS_BATCH_SIZE);

      iterator->Next();
    }
  } else {
    REBOOT_DATABASE_LOG(1)
        << "Skipping recovery of legacy prepared transactions because "
        << "we're not recovering the first shard '" << first_shard_id << "'";
  }

  // Now recover shard-aware coordinator transactions. We expect the number of
  // prepared transactions to be relatively low; normally lower than the number
  // of shards. Therefore we scan all prepared transactions, rather than
  // prefix-seeking to each shard specifically.
  std::string prefix = PREPARED_TRANSACTION_COORDINATOR_KEY_PREFIX;

  iterator->Seek(rocksdb::Slice(prefix));

  while (iterator->Valid()
         && iterator->key().ToStringView().find(prefix) == 0) {
    // Parse the key format: `prefix:shard_id:transaction_id`.
    std::string_view key_view = iterator->key().ToStringView();

    // Skip the prefix.
    size_t prefix_len = strlen(PREPARED_TRANSACTION_COORDINATOR_KEY_PREFIX);
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

    // Parse the stored `PreparedTransactionCoordinator`; it can go straight
    // into the response.
    PreparedTransactionCoordinator& coordinator_entry =
        (*response.mutable_prepared_transaction_coordinators())[std::string(
            transaction_id)];

    CHECK(coordinator_entry.ParseFromArray(
        iterator->value().data(),
        iterator->value().size()));

    MaybeWriteAndClearResponse(
        responses,
        response,
        batch_size,
        RECOVER_COORDINATOR_TRANSACTIONS_BATCH_SIZE);

    iterator->Next();
  }

  // Flush any remaining coordinator transactions.
  WriteAndClearResponse(responses, response, batch_size);

  return {};
}

////////////////////////////////////////////////////////////////////////

void DatabaseService::RecoverShardsIdempotentMutations(
    grpc::ServerWriter<RecoverResponse>& responses,
    const std::unordered_set<std::string>& shard_ids) {
  RecoverResponse response;

  // We don't know what is the best batch size for this, so we
  // just use a number that is small enough to not cause
  // performance issues, but large enough to not cause too many
  // round trips.
  // TODO: This should be configurable and pick the better value for default.
  static size_t RECOVER_IDEMPOTENT_MUTATIONS_BATCH_SIZE = 256;

  size_t batch_size = 0;

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

      // Only send this idempotent mutation if its state ref falls within one of
      // the requested shards.
      if (BelongsToShard(
              idempotent_mutation.state_type(),
              idempotent_mutation.state_ref(),
              shard_ids)) {
        *response.add_idempotent_mutations() = std::move(idempotent_mutation);

        MaybeWriteAndClearResponse(
            responses,
            response,
            batch_size,
            RECOVER_IDEMPOTENT_MUTATIONS_BATCH_SIZE);
      }

      iterator->Next();
    }
  }

  // Flush any remaining idempotent mutations.
  WriteAndClearResponse(responses, response, batch_size);
}

////////////////////////////////////////////////////////////////////////

// This migration deletes Tasks which did not have `Any` response values
// (i.e. from before #2580).
expected<void> DatabaseService::MigratePersistence2To3(
    const RecoverRequest& request) {
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

      Try<UUID> idempotency_key = UUID::fromBytes(idempotent_mutation.key());
      if (idempotency_key.isError()) {
        return make_unexpected(idempotency_key.error());
      }

      const std::string& idempotent_mutation_key = MakeIdempotentMutationKey(
          idempotent_mutation.state_ref(),
          *idempotency_key);

      rocksdb::Status status = batch.Put(
          column_family_handle,
          rocksdb::Slice(idempotent_mutation_key),
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

    REBOOT_DATABASE_LOG(1) << "Migrating tasks for '"
                           << column_family_handle->GetName() << "'";

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
// - `public/rebootdev/aio/placement.py`'s `PlanOnlyPlacementClient` (the Python
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
// Returns the shard_id or empty string if no shard is found.
std::string DatabaseService::GetShardForHash(
    const std::string& hash_str) const {
  // We should always have at least one shard configured.
  CHECK(!server_info_.shard_infos().empty())
      << "No shards configured - this should not happen";

  // Find the shard that should own this hash. The shards are ordered by their
  // `first_key`; we iterate backwards to find the last shard whose `first_key`
  // falls before this hash.
  for (int i = server_info_.shard_infos().size() - 1; i >= 0; i--) {
    const auto& shard_info = server_info_.shard_infos(i);
    if (shard_info.shard_first_key() <= hash_str) {
      return shard_info.shard_id();
    }
  }

  CHECK(false) << "No shard found for hash " << hash_str
               << " - this indicates a serious shard configuration error";
}

// Helper function to determine which shard owns a given state_ref.
std::string DatabaseService::GetShardForStateRef(std::string_view state_ref) {
  // Check if we have this cached.
  //
  // TODO: improve stout to support C++20 "heterogeneous lookup" to
  // avoid needing to make a string copy here.
  std::string state_ref_copy(state_ref);
  Option<std::string> cached_shard = shard_for_state_ref_.get(state_ref_copy);
  if (cached_shard.isSome()) {
    return cached_shard.get();
  }

  std::string shard = GetShardForHash(ComputeStateRefHash(state_ref));

  shard_for_state_ref_.put(state_ref_copy, shard);

  return shard;
}

////////////////////////////////////////////////////////////////////////

bool DatabaseService::BelongsToShard(
    std::string_view state_type,
    std::string_view state_ref,
    const std::unordered_set<std::string>& shard_ids) {
  // We should always have shards configured.
  CHECK(!server_info_.shard_infos().empty())
      << "No shards configured - this should not happen";

  // Determine which shard owns this state_ref.
  std::string target_shard_id = GetShardForStateRef(state_ref);

  // Check if the target shard is in the set of requested shards.
  return shard_ids.find(target_shard_id) != shard_ids.end();
}

////////////////////////////////////////////////////////////////////////

grpc::Status DatabaseService::Recover(
    grpc::ServerContext* context,
    const RecoverRequest* request,
    grpc::ServerWriter<RecoverResponse>* responses) {
  std::unique_lock lock(mutex_);

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

  RecoverTasks(*responses, shard_ids);

  // NOTE: newer versions of Reboot recover idempotent mutations on
  // demand via `RecoverIdempotentMutations()`, but for backwards
  // compatibility we still support recovering them here.
  if (!request->skip_idempotent_mutations()) {
    REBOOT_DATABASE_LOG(1) << "Recovering idempotent mutations";

    RecoverShardsIdempotentMutations(*responses, shard_ids);
  }

  REBOOT_DATABASE_LOG(1) << "Recovering transactions";

  expected<void> recover_transactions =
      RecoverTransactions(*responses, shard_ids);

  if (!recover_transactions.has_value()) {
    return grpc::Status(grpc::UNKNOWN, recover_transactions.error());
  }

  return grpc::Status::OK;
}

////////////////////////////////////////////////////////////////////////

grpc::Status DatabaseService::RecoverIdempotentMutations(
    grpc::ServerContext* context,
    const RecoverIdempotentMutationsRequest* request,
    grpc::ServerWriter<RecoverIdempotentMutationsResponse>* responses) {
  std::unique_lock lock(mutex_);

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

  auto idempotent_mutation_key_prefix = [&]() -> expected<std::string> {
    if (request->has_idempotency_key()) {
      Try<UUID> idempotency_key = UUID::fromBytes(request->idempotency_key());
      if (idempotency_key.isError()) {
        return make_unexpected(idempotency_key.error());
      }
      return MakeIdempotentMutationKey(request->state_ref(), *idempotency_key);
    } else {
      return fmt::format(
          IDEMPOTENT_MUTATION_KEY_PREFIX ":{}",
          request->state_ref());
    }
  }();

  if (!idempotent_mutation_key_prefix.has_value()) {
    return grpc::Status(grpc::UNKNOWN, idempotent_mutation_key_prefix.error());
  }

  // TODO: investigate using "prefix seek" for better performance, see:
  // https://github.com/facebook/rocksdb/wiki/Prefix-Seek
  iterator->Seek(rocksdb::Slice(*idempotent_mutation_key_prefix));

  RecoverIdempotentMutationsResponse response;

  // We don't know what is the best batch size for this, so we
  // just use a number that is small enough to not cause
  // performance issues, but large enough to not cause too many
  // round trips.
  // TODO: This should be configurable and pick the better value for default.
  static size_t RECOVER_IDEMPOTENT_MUTATIONS_BATCH_SIZE = 256;

  size_t batch_size = 0;

  while (iterator->Valid()
         && iterator->key().ToStringView().find(*idempotent_mutation_key_prefix)
             == 0) {
    IdempotentMutation idempotent_mutation;

    CHECK(idempotent_mutation.ParseFromArray(
        iterator->value().data(),
        iterator->value().size()));

    *response.add_idempotent_mutations() = std::move(idempotent_mutation);

    MaybeWriteAndClearResponse(
        *responses,
        response,
        batch_size,
        RECOVER_IDEMPOTENT_MUTATIONS_BATCH_SIZE);

    if (request->has_idempotency_key()) {
      break;
    }

    iterator->Next();
  }

  // Flush any remaining idempotent mutations.
  WriteAndClearResponse(*responses, response, batch_size);

  return grpc::Status::OK;
}

////////////////////////////////////////////////////////////////////////

expected<std::unique_ptr<DatabaseServer>> DatabaseServer::Instantiate(
    const std::filesystem::path& state_directory,
    const ServerInfo& server_info,
    std::string address) {
  grpc::ServerBuilder builder;

  builder.SetMaxReceiveMessageSize(kMaxSidecarGrpcMessageSize.bytes());
  builder.SetMaxSendMessageSize(kMaxSidecarGrpcMessageSize.bytes());

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

////////////////////////////////////////////////////////////////////////

}  // namespace rbt::server

////////////////////////////////////////////////////////////////////////
