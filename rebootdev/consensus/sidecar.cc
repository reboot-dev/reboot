#include "rebootdev/consensus/sidecar.h"

#include <filesystem>

#include "absl/strings/str_split.h"
#include "absl/strings/strip.h"
#include "fmt/format.h"
#include "fmt/ostream.h"
#include "fmt/ranges.h"
#include "glog/logging.h"
#include "google/protobuf/util/message_differencer.h"
#include "grpcpp/server_builder.h"
#include "rbt/v1alpha1/sidecar.grpc.pb.h"
#include "rbt/v1alpha1/tasks.pb.h"
#include "rocksdb/db.h"
#include "rocksdb/filter_policy.h"
#include "rocksdb/slice_transform.h"
#include "rocksdb/table.h"
#include "rocksdb/utilities/transaction_db.h"
#include "stout/borrowable.h"
#include "stout/uuid.h"
#include "tl/expected.hpp"

////////////////////////////////////////////////////////////////////////

using id::UUID;

using rbt::v1alpha1::Actor;
using rbt::v1alpha1::ColocatedRangeRequest;
using rbt::v1alpha1::ColocatedRangeResponse;
using rbt::v1alpha1::ColocatedReverseRangeRequest;
using rbt::v1alpha1::ColocatedReverseRangeResponse;
using rbt::v1alpha1::ColocatedUpsert;
using rbt::v1alpha1::ConsensusInfo;
using rbt::v1alpha1::ExportItem;
using rbt::v1alpha1::ExportRequest;
using rbt::v1alpha1::ExportResponse;
using rbt::v1alpha1::IdempotentMutation;
using rbt::v1alpha1::LoadRequest;
using rbt::v1alpha1::LoadResponse;
using rbt::v1alpha1::Participants;
using rbt::v1alpha1::PersistenceVersion;
using rbt::v1alpha1::RecoverRequest;
using rbt::v1alpha1::RecoverResponse;
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

namespace rbt::consensus {

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

class SidecarService final : public rbt::v1alpha1::Sidecar::Service {
 public:
  // Returns a type-erased instance of 'SidecarService' or an error if
  // a 'SidecarService' could not be instantiated.
  static expected<std::unique_ptr<grpc::Service>> Instantiate(
      const std::filesystem::path& db_path,
      const ConsensusInfo& consensus_info);

  ~SidecarService() override;

  // Service methods.
  grpc::Status ColocatedRange(
      grpc::ServerContext* context,
      const ColocatedRangeRequest* request,
      ColocatedRangeResponse* response) override;
  grpc::Status ColocatedReverseRange(
      grpc::ServerContext* context,
      const ColocatedReverseRangeRequest* request,
      ColocatedReverseRangeResponse* response) override;
  grpc::Status Load(
      grpc::ServerContext* context,
      const LoadRequest* request,
      LoadResponse* response) override;
  grpc::Status _Load(
      const LoadRequest* request,
      LoadResponse* response);
  grpc::Status Store(
      grpc::ServerContext* context,
      const StoreRequest* request,
      StoreResponse* response) override;
  grpc::Status _Store(
      const StoreRequest* request,
      StoreResponse* response);
  grpc::Status Recover(
      grpc::ServerContext* context,
      const RecoverRequest* request,
      grpc::ServerWriter<RecoverResponse>* responses) override;
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

 private:
  SidecarService(
      std::shared_ptr<rocksdb::Statistics> statistics,
      std::vector<rocksdb::ColumnFamilyHandle*>&& column_family_handles,
      std::unique_ptr<rocksdb::TransactionDB>&& db)
    : statistics_(statistics),
      column_family_handles_(std::move(column_family_handles)),
      db_(std::move(db)) {}

  // Migrate from previous persistence versions to the current version,
  // if necessary.
  expected<void> MaybeMigratePersistence(const RecoverRequest& request);
  expected<void> MigratePersistence2To3(const RecoverRequest& request);

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
  bool HasTransaction(
      const std::string& state_ref);

  // Helper to validate a non-transactional store request.
  expected<void> ValidateNonTransactionalStore(
      const StoreRequest& request);

  // Helper for recovering actors.
  void RecoverActors(
      grpc::ServerWriter<RecoverResponse>& responses);

  // Helper for recovering tasks.
  std::set<std::string> RecoverTasks(
      grpc::ServerWriter<RecoverResponse>& responses);

  // Helper for recovering transactions.
  expected<void> RecoverTransactions(
      grpc::ServerWriter<RecoverResponse>& responses,
      const std::set<std::string>& committed_task_uuids,
      const std::set<std::string>& committed_idempotency_keys);

  // Helper for recovering uncommitted tasks within a transaction.
  void RecoverTransactionTasks(
      const std::set<std::string>& committed_task_uuids,
      Transaction& transaction,
      stout::borrowed_ref<rocksdb::Transaction>& txn);

  // Helper for recovering uncommitted idempotent mutations within a
  // transaction.
  void RecoverTransactionIdempotentMutations(
      const std::set<std::string>& committed_idempotency_keys,
      Transaction& transaction,
      stout::borrowed_ref<rocksdb::Transaction>& txn);

  // Helper for recovering idempotent mutations.
  std::set<std::string> RecoverIdempotentMutations(
      grpc::ServerWriter<RecoverResponse>& responses);

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

  std::shared_ptr<rocksdb::Statistics> statistics_;

  // Collection of column family handles, one for each state type. Note
  // we're currently just using a vector here as we assume this will
  // be a relatively small list and it will be faster to just iterate
  // through it when doing a lookup.
  std::vector<rocksdb::ColumnFamilyHandle*> column_family_handles_;

  std::unique_ptr<rocksdb::TransactionDB> db_;

  // We track ongoing transactions indexed by 'state_ref' because there should
  // only ever be a single transaction per actor and we want to be able to
  // look up whether or not a actor is currently in a transaction.
  std::map<
      std::string, // An actor id.
      stout::Borrowable<std::unique_ptr<rocksdb::Transaction>>>
      txns_;
};

////////////////////////////////////////////////////////////////////////

SidecarService::~SidecarService() {
  for (auto* column_family_handle : column_family_handles_) {
    rocksdb::Status status =
        db_->DestroyColumnFamilyHandle(column_family_handle);
    CHECK(status.ok())
        << "Failed to destroy column family handle: "
        << status.ToString();
  }
}

////////////////////////////////////////////////////////////////////////

// Create prefix-aware column family options. Can confirm that the filters
// are being applied by examining the `rocksdb.bloom.filter.prefix.useful`
// statistic. See: (check_line_length skip)
// https://github.com/facebook/rocksdb/wiki/Prefix-Seek/6f8f534058979f799ef90d2d8c7e699d94894b6e#why-prefix-seek
rocksdb::ColumnFamilyOptions CreateColumnFamilyOptions() {
  rocksdb::ColumnFamilyOptions cf_options =
      rocksdb::ColumnFamilyOptions();
  rocksdb::BlockBasedTableOptions table_options;
  table_options.filter_policy.reset(
      rocksdb::NewBloomFilterPolicy(10, false));
  cf_options.table_factory.reset(
      rocksdb::NewBlockBasedTableFactory(table_options));
  cf_options.prefix_extractor.reset(
      new PrefixToLastFSlashExtractor());
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

#define TASK_KEY_PREFIX "task"

std::string MakeTaskKey(const TaskId& task_id) {
  return fmt::format(
      TASK_KEY_PREFIX ":{}:{}",
      task_id.state_ref(),
      task_id.task_uuid());
}

////////////////////////////////////////////////////////////////////////

#define CURRENT_PERSISTENCE_VERSION 3

constexpr std::string_view kPersistenceVersionKey = "persistence_version";
constexpr std::string_view kConsensusInfoKey = "consensus_info";

expected<void> WritePersistenceVersion(rocksdb::DB* db, int version) {
  PersistenceVersion pv;
  pv.set_version(version);

  std::string serialized_version_put;
  if (!pv.SerializeToString(&serialized_version_put)) {
    return make_unexpected(fmt::format(
        "Failed to serialize persistence version: {}",
        pv.ShortDebugString()));
  }
  rocksdb::Status status = db->Put(
      DefaultWriteOptions(),
      rocksdb::Slice(kPersistenceVersionKey),
      rocksdb::Slice(serialized_version_put));
  if (!status.ok()) {
    return make_unexpected(fmt::format(
        "Failed to write persistence version: {}",
        status.ToString()));
  }

  return {};
}

expected<void> WriteConsensusInfo(
    rocksdb::DB* db,
    const ConsensusInfo& consensus_info) {
  std::string serialized_consensus_info;
  if (!consensus_info.SerializeToString(&serialized_consensus_info)) {
    return make_unexpected(fmt::format(
        "Failed to serialize consensus info: {}",
        consensus_info.ShortDebugString()));
  }
  rocksdb::Status status = db->Put(
      DefaultWriteOptions(),
      rocksdb::Slice(kConsensusInfoKey),
      rocksdb::Slice(serialized_consensus_info));
  if (!status.ok()) {
    return make_unexpected(fmt::format(
        "Failed to write consensus info: {}",
        status.ToString()));
  }

  return {};
}

expected<void> ValidateConsensusInfo(
    rocksdb::DB* db,
    const ConsensusInfo& expected_consensus_info) {
  std::string serialized_consensus_info;
  rocksdb::Status status = db->Get(
      rocksdb::ReadOptions(),
      kConsensusInfoKey,
      &serialized_consensus_info);
  if (status.ok()) {
    ConsensusInfo actual_consensus_info;
    CHECK(actual_consensus_info.ParseFromString(
        std::move(serialized_consensus_info)));

    if (!google::protobuf::util::MessageDifferencer::Equals(
            actual_consensus_info,
            expected_consensus_info)) {
      // This is not a particularly friendly error message, but it is only a
      // backstop for a higher-level error message rendered by the
      // ConsensusManager (which will tell a user how their shard count
      // changed). A user should not see this check unless there is an issue in
      // that check.
      return make_unexpected(fmt::format(
          "Consensus information mismatched:\nactual: {}\nvs\nexpected: {}\n",
          actual_consensus_info.ShortDebugString(),
          expected_consensus_info.ShortDebugString()));
    }
  } else if (status.IsNotFound()) {
    // TODO: For backwards compatibility for #2910, we currently write the
    // ConsensusInfo if it is not found. After #2910 has been stably shipped
    // for a while, we should error for this case instead.
    return WriteConsensusInfo(db, expected_consensus_info);
  } else {
    return make_unexpected(fmt::format(
        "Failed to read consensus info: {}",
        status.ToString()));
  }

  return {};
}

////////////////////////////////////////////////////////////////////////

std::string SidecarService::ListDatabaseKeys() {
  std::ostringstream stream;
  stream << "{";
  for (rocksdb::ColumnFamilyHandle* column_family_handle :
       column_family_handles_) {
    stream << "\n  " << column_family_handle->GetName() << ": [";
    std::unique_ptr<rocksdb::Iterator> iterator(CHECK_NOTNULL(
        db_->NewIterator(
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

expected<rocksdb::ColumnFamilyHandle*> SidecarService::LookupColumnFamilyHandle(
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
    return make_unexpected(fmt::format(
        "Failed to find column family for state type '{}'",
        state_type));
  }

  return *iterator;
}

////////////////////////////////////////////////////////////////////////

expected<rocksdb::ColumnFamilyHandle*>
SidecarService::LookupOrCreateColumnFamilyHandle(
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
      return make_unexpected(fmt::format(
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

// Gets the actor id from a 'rocksdb::Transaction' based on the
// naming schema used in 'MakeTransactionName'.
std::string GetStateRef(
    const stout::borrowed_ref<rocksdb::Transaction>& txn) {
  const std::string& name = txn->GetName();
  return name.substr(0, name.rfind(':'));
}

// Overload of 'GetStateRef' when we don't have a borrowable.
std::string GetStateRef(const rocksdb::Transaction& txn) {
  const std::string& name = txn.GetName();
  return name.substr(0, name.rfind(':'));
}

////////////////////////////////////////////////////////////////////////

#define TRANSACTION_PARTICIPANT_KEY_PREFIX "transaction-participant"

// Returns a key for storing in rocksdb that represents a transaction
// participant.
std::string MakeTransactionParticipantKey(
    const std::string& state_type,
    const std::string& state_ref) {
  return fmt::format(
      TRANSACTION_PARTICIPANT_KEY_PREFIX ":{}:{}",
      state_type,
      state_ref);
}

////////////////////////////////////////////////////////////////////////

#define TRANSACTION_PREPARED_KEY_PREFIX "transaction-prepared"

// Returns a key for storing in rocksdb that represents a prepared
// transaction, i.e., a transaction that a coordinator has completed
// the prepare phase on, and thus can tell all participants to commit.
// We use a stringified UUID to make debugging easier.
std::string MakeTransactionPreparedKey(const UUID& transaction_id) {
  return fmt::format(
      TRANSACTION_PREPARED_KEY_PREFIX ":{}",
      transaction_id.toString());
}

////////////////////////////////////////////////////////////////////////

#define IDEMPOTENT_MUTATION_KEY_PREFIX "idempotent-mutation"

// Returns a key for storing in rocksdb that represents an idempotent
// mutation. We use the stringified UUID to make debugging easier.
// TODO: Skip deserializing/reserializing the UUID in the sidecar, and
// send it string encoded from the client.
std::string MakeIdempotentMutationKey(const UUID& idempotency_key) {
  return fmt::format(
      IDEMPOTENT_MUTATION_KEY_PREFIX ":{}",
      idempotency_key.toString());
}

////////////////////////////////////////////////////////////////////////

expected<stout::borrowed_ref<rocksdb::Transaction>>
SidecarService::LookupTransaction(
    const std::string& state_type,
    const std::string& state_ref) {
  // TODO: ensure `mutex_` is currently held by this thread.

  // Determine whether we already have a transaction for this actor.
  auto iterator = txns_.find(state_ref);
  if (iterator != std::end(txns_)) {
    return iterator->second.Borrow();
  } else {
    return make_unexpected(fmt::format(
        "Missing transaction for state type '{}' actor '{}'",
        state_type,
        state_ref));
  }
}

////////////////////////////////////////////////////////////////////////

expected<stout::borrowed_ref<rocksdb::Transaction>>
SidecarService::LookupOrBeginTransaction(
    const Transaction& transaction,
    bool store_participant) {
  // TODO: ensure `mutex_` is currently held by this thread.

  // Get out the _root_ transaction's UUID, that's the transaction
  // that any nested transaction ultimately belongs.
  Try<UUID> transaction_id = UUID::fromBytes(transaction.transaction_ids(0));
  if (transaction_id.isError()) {
    return make_unexpected(fmt::format(
        "Failed to lookup or begin transaction for "
        "state type '{}' actor '{}': {}",
        transaction.state_type(),
        transaction.state_ref(),
        transaction_id.error()));
  }

  expected<stout::borrowed_ref<rocksdb::Transaction>> txn = LookupTransaction(
      transaction.state_type(),
      transaction.state_ref());

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
      return make_unexpected(fmt::format(
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
        return make_unexpected(fmt::format(
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
        return make_unexpected(fmt::format(
            "Failed to begin transaction '{}': {}",
            transaction_id->toString(),
            status.ToString()));
      }
    }

    REBOOT_SIDECAR_LOG(1)
        << "Beginning transaction '" << transaction_id->toString()
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
      return make_unexpected(fmt::format(
          "Failed to begin transaction '{}': Unknown rocksdb failure",
          transaction_id->toString()));
    }

    // We must name the transaction in order for rocksdb to persist
    // it when we prepare. We also use the name to be able to
    // determine whether or not we're in the same ongoing
    // transaction for future calls to 'LookupOrBeginTransaction'.
    rocksdb::Status status = txn->SetName(
        MakeTransactionName(
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
      return make_unexpected(fmt::format(
          "Failed to begin transaction '{}': {}",
          transaction_id->toString(),
          status.ToString()));
    }
  }
}

////////////////////////////////////////////////////////////////////////

void SidecarService::DeleteTransaction(
    expected<stout::borrowed_ref<rocksdb::Transaction>>&& txn) {
  // TODO: ensure `mutex_` is currently held by this thread.

  auto iterator = txns_.find(GetStateRef(*txn));
  CHECK(iterator != std::end(txns_));

  // Before we erase we need to release the borrow so that it can be
  // deleted otherwise we'll hang forever! We accomplish that by
  // replacing 'txn' with an unexpected.
  txn = make_unexpected(std::string("Release the borrowed reference!"));

  txns_.erase(iterator);
}

////////////////////////////////////////////////////////////////////////

bool SidecarService::HasTransaction(const std::string& state_ref) {
  // TODO: ensure `mutex_` is currently held by this thread.
  return txns_.find(state_ref) != std::end(txns_);
}

////////////////////////////////////////////////////////////////////////

expected<std::unique_ptr<grpc::Service>> SidecarService::Instantiate(
    const std::filesystem::path& db_path,
    const ConsensusInfo& consensus_info) {
  REBOOT_SIDECAR_LOG(1)
      << "Attempting to open rocksdb at '" << db_path.string() << "'";

  // First get out all of the column families that we have in the
  // database so we can open the database with column family handles.
  std::vector<std::string> column_families;

  rocksdb::Status status = rocksdb::DB::ListColumnFamilies(
      rocksdb::Options(),
      db_path.string(),
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

    REBOOT_SIDECAR_LOG(1)
        << "Trying to open _new_ rocksdb at '" << db_path.string() << "'";

    status = rocksdb::DB::Open(
        options,
        db_path.string(),
        &db);

    if (!status.ok()) {
      return make_unexpected(fmt::format(
          "Failed to open _new_ rocksdb at '{}': {}",
          db_path.string(),
          status.ToString()));
    }

    // We've created a new database. Write the current persistence version and
    // the consensus info.
    expected<void> write_persistence_version =
        WritePersistenceVersion(db, CURRENT_PERSISTENCE_VERSION);
    if (!write_persistence_version.has_value()) {
      return make_unexpected(fmt::format(
          "Failed to write persistence version in _new_ rocksdb at '{}': {}",
          db_path.string(),
          write_persistence_version.error()));
    }
    expected<void> write_consensus_info =
        WriteConsensusInfo(db, consensus_info);
    if (!write_consensus_info.has_value()) {
      return make_unexpected(fmt::format(
          "Failed to write consensus info in _new_ rocksdb at '{}': {}",
          db_path.string(),
          write_consensus_info.error()));
    }

    // NOTE: If we do not flush, then immediately closing the database after
    // the above writes can cause corruption.
    status = db->Flush(rocksdb::FlushOptions());
    if (!status.ok()) {
      return make_unexpected(fmt::format(
          "Failed to flush metadata in new database: {}",
          status.ToString()));
    }

    // Then re-open it.
    delete db;

    status = rocksdb::DB::ListColumnFamilies(
        rocksdb::Options(),
        db_path.string(),
        &column_families);

    if (!status.ok()) {
      return make_unexpected(fmt::format(
          "Failed to get column families in rocksdb: {}",
          status.ToString()));
    }
  }

  // Add all column families.
  std::vector<rocksdb::ColumnFamilyDescriptor> column_family_descriptors;
  for (const std::string& column_family : column_families) {
    column_family_descriptors.push_back(rocksdb::ColumnFamilyDescriptor(
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

  status = rocksdb::TransactionDB::Open(
      db_options,
      txn_options,
      db_path.string(),
      column_family_descriptors,
      &column_family_handles,
      &txn_db);

  if (!status.ok()) {
    return make_unexpected(fmt::format(
        "Failed to open rocksdb at '{}': {}",
        db_path.string(),
        status.ToString()));
  }

  // Validate that we are opening a store with the expected consensus info.
  expected<void> validate_consensus_info =
      ValidateConsensusInfo(txn_db, consensus_info);
  if (!validate_consensus_info.has_value()) {
    return make_unexpected(fmt::format(
        "Could not validate consensus information for '{}': {}",
        db_path.string(),
        validate_consensus_info.error()));
  }

  REBOOT_SIDECAR_LOG(1)
      << "Opened rocksdb at '" << db_path.string()
      << "' with the following column family handles (i.e., state types): "
      << fmt::format("{}", column_families);

  // TODO(benh): iterate through key/values in rocksdb and log the
  // first two and last two for each column family for better
  // debugging when starting a sidecar, i.e., it will give a sense of
  // what is stored.

  return std::unique_ptr<grpc::Service>(
      new SidecarService(
          statistics,
          std::move(column_family_handles),
          std::unique_ptr<rocksdb::TransactionDB>(txn_db)));
}

////////////////////////////////////////////////////////////////////////

grpc::Status SidecarService::ColocatedRange(
    grpc::ServerContext* context,
    const ColocatedRangeRequest* request,
    ColocatedRangeResponse* response) {
  std::unique_lock lock(mutex_);

  REBOOT_SIDECAR_LOG(1)
      << "ColocatedRange { " << request->ShortDebugString() << " }";

  expected<rocksdb::ColumnFamilyHandle*> column_family_handle =
      LookupColumnFamilyHandle(request->state_type());
  if (!column_family_handle.has_value()) {
    return grpc::Status(
        grpc::UNKNOWN,
        fmt::format(
            "Unknown state_type: {}",
            column_family_handle.error()));
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
    end_key_str = fmt::format(
        STATE_KEY_PREFIX ":{}{}",
        request->parent_state_ref(),
        '0');
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
    it = txn.value()->GetIterator(
        read_options,
        *column_family_handle);
  } else {
    it = db_->NewIterator(
        read_options,
        *column_family_handle);
  }

  // Seek to the start of the range to scan.
  if (request->has_start()) {
    it->Seek(fmt::format(
        STATE_KEY_PREFIX ":{}{}{}",
        request->parent_state_ref(),
        '/',
        request->start()));
  } else {
    // If uncapped, append only a trailing forward slash.
    it->Seek(fmt::format(
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

grpc::Status SidecarService::ColocatedReverseRange(
    grpc::ServerContext* context,
    const ColocatedReverseRangeRequest* request,
    ColocatedReverseRangeResponse* response) {
  std::unique_lock lock(mutex_);

  REBOOT_SIDECAR_LOG(1)
      << "ColocatedReverseRange { " << request->ShortDebugString() << " }";

  expected<rocksdb::ColumnFamilyHandle*> column_family_handle =
      LookupColumnFamilyHandle(request->state_type());
  if (!column_family_handle.has_value()) {
    return grpc::Status(
        grpc::UNKNOWN,
        fmt::format(
            "Unknown state_type: {}",
            column_family_handle.error()));
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
    end_key_str = fmt::format(
        STATE_KEY_PREFIX ":{}{}",
        request->parent_state_ref(),
        '/');
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
    it = txn.value()->GetIterator(
        read_options,
        *column_family_handle);
  } else {
    it = db_->NewIterator(
        read_options,
        *column_family_handle);
  }

  // Seek to the start of the range to scan.
  if (request->has_start()) {
    it->SeekForPrev(fmt::format(
        STATE_KEY_PREFIX ":{}{}{}",
        request->parent_state_ref(),
        '/',
        request->start()));
  } else {
    // If uncapped, append '0', which sorts one higher than our separator ('/').
    // As noted above, this is incompatible with the prefix seek optimization in
    // RocksDB.
    it->SeekForPrev(fmt::format(
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

grpc::Status SidecarService::_Load(
    const LoadRequest* request,
    LoadResponse* response) {
  REBOOT_SIDECAR_LOG(1)
      << "_Load { " << request->ShortDebugString() << " }";

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

    column_families.push_back(*column_family_handle);
    keys.push_back(MakeTaskKey(task_id));
  }

  // We should add a column family for every key. Just to be sure:
  CHECK(keys.size() == column_families.size());

  std::vector<rocksdb::Slice> slice_keys;
  for (const std::string& key : keys) {
    slice_keys.emplace_back(key);
  }

  std::vector<std::string> values;
  values.resize(keys.size());
  std::vector<rocksdb::Status> statuses =
      db_->MultiGet(
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
          fmt::format(
              "Failed to load: {}",
              status.ToString()));
    }
  }

  return grpc::Status::OK;
}

grpc::Status SidecarService::Load(
    grpc::ServerContext* context,
    const LoadRequest* request,
    LoadResponse* response) {
  return _Load(request, response);
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
    if (!CheckAllUpsertsForSameActor(
            actor.state_type(),
            actor.state_ref())) {
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
expected<void> SidecarService::ValidateNonTransactionalStore(
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

grpc::Status SidecarService::_Store(
    const StoreRequest* request,
    StoreResponse* response) {
  REBOOT_SIDECAR_LOG(1)
      << "_Store { " << request->ShortDebugString() << " }";

  // Helper for either adding all of the state updates to a
  // 'rocksdb::WriteBatch' or a 'rocksdb::Transaction',
  // depending on whether or not there is an ongoing
  // transaction.
  auto UpdateBatch = [&](auto& batch) -> expected<rocksdb::Status> {
    // First add the actor upserts.
    for (const Actor& actor : request->actor_upserts()) {
      if (!actor.has_state()) {
        return make_unexpected(fmt::format(
            "Actor '{}' missing state to store",
            actor.state_ref()));
      }

      // NOTE: it's possible if we're within a transaction that
      // we'll create a column family that we won't end up putting
      // anything into because the transaction will abort. For now,
      // this will just be an empty column family, but we could
      // consider deleting any empty column families at a later
      // point, especially once we are rebalancing state types and
      // actors across multiple consensuses.

      expected<rocksdb::ColumnFamilyHandle*> column_family_handle =
          LookupOrCreateColumnFamilyHandle(actor.state_type());

      if (!column_family_handle.has_value()) {
        // Since the goal is to make all these updates
        // atomically we must fail if we run into any errors.
        return make_unexpected(column_family_handle.error());
      }

      const std::string& actor_state_key = MakeActorStateKey(
          actor.state_ref());

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
      // actors across multiple consensuses.

      expected<rocksdb::ColumnFamilyHandle*> column_family_handle =
          LookupOrCreateColumnFamilyHandle(task.task_id().state_type());

      if (!column_family_handle.has_value()) {
        // Since the goal is to make all these updates
        // atomically we must fail if we run into any errors.
        return make_unexpected(column_family_handle.error());
      }

      const std::string& task_key = MakeTaskKey(task.task_id());
      std::string serialized_task;
      if (!task.SerializeToString(&serialized_task)) {
        return make_unexpected(fmt::format(
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
        status = batch.Delete(
            *column_family_handle,
            rocksdb::Slice(key));
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
      Try<UUID> idempotency_key = UUID::fromBytes(
          request->idempotent_mutation().key());
      if (idempotency_key.isError()) {
        return make_unexpected(idempotency_key.error());
      }
      expected<rocksdb::ColumnFamilyHandle*> column_family_handle =
          LookupOrCreateColumnFamilyHandle(
              request->idempotent_mutation().state_type());

      const std::string& idempotent_mutation_key =
          MakeIdempotentMutationKey(*idempotency_key);

      std::string idempotent_mutation_bytes;
      if (!request->idempotent_mutation().SerializeToString(
              &idempotent_mutation_bytes)) {
        return make_unexpected(
            "Failed to serialize 'IdempotentMutation'");
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
          fmt::format(
              "Failed to store: {}",
              validate.error()));
    }

    expected<stout::borrowed_ref<rocksdb::Transaction>> txn =
        LookupOrBeginTransaction(request->transaction());

    if (!txn.has_value()) {
      return grpc::Status(
          grpc::UNKNOWN,
          fmt::format(
              "Failed to store: {}",
              txn.error()));
    }

    // Add all the updates from this request into the
    // transaction which will, if committed, apply them
    // atomically.
    expected<rocksdb::Status> status = UpdateBatch(**txn);

    if (!status.has_value()) {
      return grpc::Status(
          grpc::UNKNOWN,
          fmt::format(
              "Failed to update batch: {}",
              status.error()));
    } else if (!status->ok()) {
      return grpc::Status(
          grpc::UNKNOWN,
          fmt::format(
              "Failed to update batch: {}",
              status->ToString()));
    }

    return grpc::Status::OK;
  } else {
    // Request is not within a transaction, let's validate we
    // don't have an ongoing transaction!
    expected<void> validate = ValidateNonTransactionalStore(*request);

    if (!validate.has_value()) {
      return grpc::Status(
          grpc::UNKNOWN,
          fmt::format(
              "Failed to store: {}",
              validate.error()));
    }

    // Add all the updates from this request into a single
    // WriteBatch so that they will get applied atomically.
    rocksdb::WriteBatch batch;

    expected<rocksdb::Status> status = UpdateBatch(batch);

    if (!status.has_value()) {
      return grpc::Status(
          grpc::UNKNOWN,
          fmt::format(
              "Failed to update batch: {}",
              status.error()));
    } else if (!status->ok()) {
      return grpc::Status(
          grpc::UNKNOWN,
          fmt::format(
              "Failed to update batch: {}",
              status->ToString()));
    }

    status = db_->Write(DefaultWriteOptions(request->sync()), &batch);

    CHECK(status.has_value());

    if (status->ok()) {
      return grpc::Status::OK;
    } else {
      return grpc::Status(
          grpc::UNKNOWN,
          fmt::format(
              "Failed to store: {}",
              status->ToString()));
    }
  }
}

grpc::Status SidecarService::Store(
    grpc::ServerContext* context,
    const StoreRequest* request,
    StoreResponse* response) {
  return _Store(request, response);
}

////////////////////////////////////////////////////////////////////////

grpc::Status SidecarService::TransactionParticipantPrepare(
    grpc::ServerContext* context,
    const TransactionParticipantPrepareRequest* request,
    TransactionParticipantPrepareResponse* response) {
  std::unique_lock lock(mutex_);

  REBOOT_SIDECAR_LOG(1) << "TransactionParticipantPrepare { "
                        << request->ShortDebugString() << " }";

  expected<stout::borrowed_ref<rocksdb::Transaction>> txn =
      LookupTransaction(
          request->state_type(),
          request->state_ref());

  if (!txn.has_value()) {
    return grpc::Status(
        grpc::UNKNOWN,
        fmt::format(
            "Failed to prepare transaction: {}",
            txn.error()));
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
        fmt::format(
            "Failed to prepare transaction: {}",
            status.ToString()));
  }
}

////////////////////////////////////////////////////////////////////////

grpc::Status SidecarService::TransactionParticipantCommit(
    grpc::ServerContext* context,
    const TransactionParticipantCommitRequest* request,
    TransactionParticipantCommitResponse* response) {
  std::unique_lock lock(mutex_);

  REBOOT_SIDECAR_LOG(1) << "TransactionParticipantCommit { "
                        << request->ShortDebugString() << " }";

  expected<stout::borrowed_ref<rocksdb::Transaction>> txn =
      LookupTransaction(
          request->state_type(),
          request->state_ref());

  if (!txn.has_value()) {
    return grpc::Status(
        grpc::UNKNOWN,
        fmt::format(
            "Failed to commit transaction: {}",
            txn.error()));
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
        fmt::format(
            "Failed to commit transaction: {}",
            status.ToString()));
  }
}

////////////////////////////////////////////////////////////////////////

grpc::Status SidecarService::TransactionParticipantAbort(
    grpc::ServerContext* context,
    const TransactionParticipantAbortRequest* request,
    TransactionParticipantAbortResponse* response) {
  std::unique_lock lock(mutex_);

  REBOOT_SIDECAR_LOG(1) << "TransactionParticipantAbort { "
                        << request->ShortDebugString() << " }";

  expected<stout::borrowed_ref<rocksdb::Transaction>> txn =
      LookupTransaction(
          request->state_type(),
          request->state_ref());

  if (!txn.has_value()) {
    return grpc::Status(
        grpc::UNKNOWN,
        fmt::format(
            "Failed to abort transaction: {}",
            txn.error()));
  }

  rocksdb::Status status = (*txn)->Rollback();

  if (!status.ok()) {
    return grpc::Status(
        grpc::UNKNOWN,
        fmt::format(
            "Failed to abort transaction: {}",
            status.ToString()));
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

grpc::Status SidecarService::TransactionCoordinatorPrepared(
    grpc::ServerContext* context,
    const TransactionCoordinatorPreparedRequest* request,
    TransactionCoordinatorPreparedResponse* response) {
  std::unique_lock lock(mutex_);

  REBOOT_SIDECAR_LOG(1) << "TransactionCoordinatorPrepared { "
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

  std::string data;
  if (!request->participants().SerializeToString(&data)) {
    return grpc::Status(
        grpc::UNKNOWN,
        fmt::format(
            "Failed to store transaction '{}' as prepared: "
            "Failed to serialize",
            transaction_id->toString()));
  }

  const std::string& key = MakeTransactionPreparedKey(*transaction_id);

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
        fmt::format(
            "Failed to store: {}",
            status.ToString()));
  }
}

////////////////////////////////////////////////////////////////////////

grpc::Status SidecarService::TransactionCoordinatorCleanup(
    grpc::ServerContext* context,
    const TransactionCoordinatorCleanupRequest* request,
    TransactionCoordinatorCleanupResponse* response) {
  std::unique_lock lock(mutex_);

  REBOOT_SIDECAR_LOG(1) << "TransactionCoordinatorCleanup { "
                        << request->ShortDebugString() << " }";

  Try<UUID> transaction_id = UUID::fromBytes(request->transaction_id());
  if (transaction_id.isError()) {
    return grpc::Status(
        grpc::UNKNOWN,
        fmt::format(
            "Failed to cleanup transaction: {}",
            transaction_id.error()));
  }

  const std::string& key = MakeTransactionPreparedKey(*transaction_id);
  rocksdb::Status status = db_->Delete(
      DefaultWriteOptions(),
      rocksdb::Slice(key));

  if (status.ok()) {
    return grpc::Status::OK;
  } else {
    return grpc::Status(
        grpc::UNKNOWN,
        fmt::format(
            "Failed to cleanup: {}",
            status.ToString()));
  }
}

////////////////////////////////////////////////////////////////////////

grpc::Status SidecarService::Export(
    grpc::ServerContext* context,
    const ExportRequest* request,
    ExportResponse* response) {
  std::unique_lock lock(mutex_);

  REBOOT_SIDECAR_LOG(1) << "Export { "
                        << request->ShortDebugString() << " }";

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
    ExportItem* item = response->add_items();
    if (key_type_prefix == STATE_KEY_PREFIX) {
      Actor* actor = item->mutable_actor();
      actor->set_state_type(request->state_type());
      actor->set_state_ref(
          std::string(GetStateRefFromActorStateKey(
              it->key().ToStringView())));
      actor->set_state(it->value().ToString());
    } else if (key_type_prefix == TASK_KEY_PREFIX) {
      CHECK(item->mutable_task()->ParseFromArray(
          it->value().data(),
          it->value().size()));
    } else if (key_type_prefix == IDEMPOTENT_MUTATION_KEY_PREFIX) {
      CHECK(item->mutable_idempotent_mutation()->ParseFromArray(
          it->value().data(),
          it->value().size()));
    } else {
      return grpc::Status(
          grpc::UNKNOWN,
          fmt::format(
              "Unrecognized entry for '{}': {}",
              request->state_type(),
              it->key().ToStringView()));
    }
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

void SidecarService::RecoverActors(
    grpc::ServerWriter<RecoverResponse>& responses) {
  RecoverResponse response;

  // We don't know what is the best batch size for this, so we
  // just use a number that is small enough to not cause
  // performance issues, but large enough to not cause too many
  // round trips.
  // TODO: This should be configurable and pick the better value for default.
  static size_t RECOVER_ACTORS_BATCH_SIZE = 16384;

  size_t batch_size = 0;

  for (rocksdb::ColumnFamilyHandle* column_family_handle :
       column_family_handles_) {
    if (column_family_handle->GetName() == "default") {
      continue;
    }
    std::unique_ptr<rocksdb::Iterator> iterator(CHECK_NOTNULL(
        db_->NewIterator(
            NonPrefixIteratorReadOptions(),
            column_family_handle)));

    iterator->Seek(rocksdb::Slice(STATE_KEY_PREFIX));
    while (iterator->Valid()
           && iterator->key()
                   .ToStringView()
                   .find(STATE_KEY_PREFIX)
               == 0) {
      Actor* actor = response.add_actors();
      actor->set_state_type(column_family_handle->GetName());
      actor->set_state_ref(
          std::string(GetStateRefFromActorStateKey(
              iterator->key()
                  .ToStringView())));

      MaybeWriteAndClearResponse(
          responses,
          response,
          batch_size,
          RECOVER_ACTORS_BATCH_SIZE);

      iterator->Next();
    }
  }

  // Flush any remaining actors.
  WriteAndClearResponse(
      responses,
      response,
      batch_size);
}

////////////////////////////////////////////////////////////////////////

std::set<std::string> SidecarService::RecoverTasks(
    grpc::ServerWriter<RecoverResponse>& responses) {
  // Scan through all column families' set of tasks to find the
  // pending ones.
  //
  // Return the pending task UUIDs that we find so we differentiate
  // _committed_ vs _uncommitted_ ones that are part of transactions.
  std::set<std::string> committed_task_uuids;

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
    std::unique_ptr<rocksdb::Iterator> iterator(CHECK_NOTNULL(
        db_->NewIterator(
            NonPrefixIteratorReadOptions(),
            column_family_handle)));

    // TODO: investigate using "prefix seek" for better performance, see:
    // https://github.com/facebook/rocksdb/wiki/Prefix-Seek
    iterator->Seek(rocksdb::Slice(TASK_KEY_PREFIX));

    while (iterator->Valid()
           && iterator->key().ToStringView().find(TASK_KEY_PREFIX) == 0) {
      Task task;
      CHECK(
          task.ParseFromArray(
              iterator->value().data(),
              iterator->value().size()));
      if (task.status() == Task::PENDING) {
        committed_task_uuids.insert(task.task_id().task_uuid());
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
  WriteAndClearResponse(
      responses,
      response,
      batch_size);

  return committed_task_uuids;
}

////////////////////////////////////////////////////////////////////////

void SidecarService::RecoverTransactionTasks(
    const std::set<std::string>& committed_task_uuids,
    Transaction& transaction,
    stout::borrowed_ref<rocksdb::Transaction>& txn) {
  CHECK_EQ(transaction.uncommitted_tasks_size(), 0);

  // We are recovering only the tasks for this transaction participant, and
  // participation is scoped to an actor. Therefore, the only place we need
  // to look for mutations is in the actor's own state.
  expected<rocksdb::ColumnFamilyHandle*> column_family_handle =
      LookupColumnFamilyHandle(transaction.state_type());
  CHECK(column_family_handle.has_value());

  std::unique_ptr<rocksdb::Iterator> iterator(CHECK_NOTNULL(
      txn->GetIterator(
          NonPrefixIteratorReadOptions(),
          *column_family_handle)));

  // TODO: investigate using "prefix seek" for better performance, see:
  // https://github.com/facebook/rocksdb/wiki/Prefix-Seek
  iterator->Seek(rocksdb::Slice(TASK_KEY_PREFIX));

  while (iterator->Valid()
         && iterator->key().ToStringView().find(TASK_KEY_PREFIX) == 0) {
    Task task;
    CHECK(
        task.ParseFromArray(
            iterator->value().data(),
            iterator->value().size()));

    if (task.task_id().state_ref() == transaction.state_ref()
        && task.status() == Task::PENDING
        && committed_task_uuids.count(task.task_id().task_uuid()) == 0) {
      // Ok, this must be a task that is not yet committed so it's
      // part of this transaction since only one actor can have an
      // ongoing transaction at a time.
      *transaction.add_uncommitted_tasks() = std::move(task);
    }

    iterator->Next();
  }
}

////////////////////////////////////////////////////////////////////////

void SidecarService::RecoverTransactionIdempotentMutations(
    const std::set<std::string>& committed_idempotency_keys,
    Transaction& transaction,
    stout::borrowed_ref<rocksdb::Transaction>& txn) {
  CHECK_EQ(transaction.uncommitted_idempotent_mutations_size(), 0);

  // We are recovering only the idempotent mutations for this transaction
  // participant, and participation is scoped to an actor. Therefore, the
  // only place we need to look for mutations is in the actor's own
  // state.
  expected<rocksdb::ColumnFamilyHandle*> column_family_handle =
      LookupColumnFamilyHandle(transaction.state_type());
  CHECK(column_family_handle.has_value());

  std::unique_ptr<rocksdb::Iterator> iterator(CHECK_NOTNULL(
      txn->GetIterator(
          NonPrefixIteratorReadOptions(),
          *column_family_handle)));

  // TODO: investigate using "prefix seek" for better performance, see:
  // https://github.com/facebook/rocksdb/wiki/Prefix-Seek
  iterator->Seek(rocksdb::Slice(IDEMPOTENT_MUTATION_KEY_PREFIX));

  while (iterator->Valid()
         && iterator->key()
                 .ToStringView()
                 .find(IDEMPOTENT_MUTATION_KEY_PREFIX)
             == 0) {
    IdempotentMutation idempotent_mutation;

    CHECK(idempotent_mutation.ParseFromArray(
        iterator->value().data(),
        iterator->value().size()));

    if (committed_idempotency_keys.count(idempotent_mutation.key()) == 0) {
      *transaction.add_uncommitted_idempotent_mutations() =
          std::move(idempotent_mutation);
    }

    iterator->Next();
  }
}

////////////////////////////////////////////////////////////////////////

expected<void> SidecarService::RecoverTransactions(
    grpc::ServerWriter<RecoverResponse>& responses,
    const std::set<std::string>& committed_task_uuids,
    const std::set<std::string>& committed_idempotency_keys) {
  // Recover all of the transactions that were prepared.
  std::vector<rocksdb::Transaction*> txns;
  db_->GetAllPreparedTransactions(&txns);
  for (rocksdb::Transaction* txn : txns) {
    auto [_, inserted] = txns_.try_emplace(
        GetStateRef(*txn),
        std::unique_ptr<rocksdb::Transaction>(txn));
    CHECK(inserted);
  }

  std::unique_ptr<rocksdb::Iterator> iterator(CHECK_NOTNULL(
      db_->NewIterator(NonPrefixIteratorReadOptions())));

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

  while (iterator->Valid()
         && iterator->key()
                 .ToStringView()
                 .find(TRANSACTION_PARTICIPANT_KEY_PREFIX)
             == 0) {
    Transaction& transaction = *response.add_participant_transactions();

    CHECK(transaction.ParseFromArray(
        iterator->value().data(),
        iterator->value().size()));

    expected<stout::borrowed_ref<rocksdb::Transaction>> txn =
        LookupTransaction(transaction.state_type(), transaction.state_ref());

    if (txn.has_value()) {
      CHECK_EQ((*txn)->GetState(), rocksdb::Transaction::PREPARED);
      transaction.set_prepared(true);

      // Now recover any tasks for our actor that we'll need to dispatch if the
      // transaction gets committed.
      RecoverTransactionTasks(
          committed_task_uuids,
          transaction,
          *txn);

      // Now recover any idempotent mutations for our actor that are part of the
      // transaction.
      RecoverTransactionIdempotentMutations(
          committed_idempotency_keys,
          transaction,
          *txn);
    } else {
      txn = LookupOrBeginTransaction(
          transaction,
          /* store_participant = */ false);

      if (!txn.has_value()) {
        return make_unexpected(txn.error());
      }

      CHECK_EQ((*txn)->GetState(), rocksdb::Transaction::STARTED);
    }

    MaybeWriteAndClearResponse(
        responses,
        response,
        batch_size,
        RECOVER_PARTICIPANT_TRANSACTIONS_BATCH_SIZE);

    iterator->Next();
  }

  // Flush any remaining participant transactions.
  WriteAndClearResponse(
      responses,
      response,
      batch_size);

  // Now recover any prepared coordinator transactions.
  //
  // It's possible that we'll have a coordinator transaction without
  // any participant transaction because the participant may have
  // committed and thus deleted the record of the transaction but we
  // have not yet completed the coordinator's "commit control loop".

  // TODO: investigate using "prefix seek" for better performance, see:
  // https://github.com/facebook/rocksdb/wiki/Prefix-Seek
  iterator->Seek(rocksdb::Slice(TRANSACTION_PREPARED_KEY_PREFIX));

  // We don't know what is the best batch size for this, so we
  // just use a number that is small enough to not cause
  // performance issues, but large enough to not cause too many
  // round trips.
  // TODO: This should be configurable and pick the better value for default.
  static size_t RECOVER_COORDINATOR_TRANSACTIONS_BATCH_SIZE = 256;

  while (iterator->Valid()
         && iterator->key()
                 .ToStringView()
                 .find(TRANSACTION_PREPARED_KEY_PREFIX)
             == 0) {
    // NOTE: we use the stringified form of the UUID as the index
    // because a protobuf 'map' can not have a bytes key. We also
    // store the stringified version of the transaction UUID in the
    // suffix of the rocksdb key for easier debugging so all we need
    // to do here is extract it.
    const std::string_view transaction_id =
        iterator->key()
            .ToStringView()
            .substr(strlen(TRANSACTION_PREPARED_KEY_PREFIX) + 1);

    Participants& participants =
        (*response.mutable_prepared_coordinator_transactions())[transaction_id];

    CHECK(participants.ParseFromArray(
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
  WriteAndClearResponse(
      responses,
      response,
      batch_size);

  return {};
}

////////////////////////////////////////////////////////////////////////

std::set<std::string> SidecarService::RecoverIdempotentMutations(
    grpc::ServerWriter<RecoverResponse>& responses) {
  // Return the committed idempotency keys so we can differentiate
  // _committed_ vs _uncommitted_ ones that are part of transactions.
  std::set<std::string> committed_idempotency_keys;

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

    std::unique_ptr<rocksdb::Iterator> iterator(CHECK_NOTNULL(
        db_->NewIterator(
            NonPrefixIteratorReadOptions(),
            column_family_handle)));

    // TODO: investigate using "prefix seek" for better performance, see:
    // https://github.com/facebook/rocksdb/wiki/Prefix-Seek
    iterator->Seek(rocksdb::Slice(IDEMPOTENT_MUTATION_KEY_PREFIX));

    while (iterator->Valid()
           && iterator->key()
                   .ToStringView()
                   .find(IDEMPOTENT_MUTATION_KEY_PREFIX)
               == 0) {
      IdempotentMutation& idempotent_mutation =
          *response.add_idempotent_mutations();

      CHECK(idempotent_mutation.ParseFromArray(
          iterator->value().data(),
          iterator->value().size()));

      committed_idempotency_keys.insert(idempotent_mutation.key());

      MaybeWriteAndClearResponse(
          responses,
          response,
          batch_size,
          RECOVER_IDEMPOTENT_MUTATIONS_BATCH_SIZE);

      iterator->Next();
    }
  }

  // Flush any remaining idempotent mutations.
  WriteAndClearResponse(
      responses,
      response,
      batch_size);

  return committed_idempotency_keys;
}

////////////////////////////////////////////////////////////////////////

std::string MigrateStateRef(
    const std::string& state_tag,
    std::string state_ref) {
  if (state_ref.find(state_tag) != std::string::npos) {
    // The state_ref already contains the state tag, and so has already
    // been migrated.
    return state_ref;
  }
  std::replace(state_ref.begin(), state_ref.end(), '/', '\\');
  return fmt::format("{}:{}", state_tag, state_ref);
}

expected<const std::string*> GetStateTag(
    const google::protobuf::Map<std::string, std::string>&
        state_tags_by_state_type,
    const std::string& state_type,
    const std::string& position) {
  auto it = state_tags_by_state_type.find(state_type);
  if (it != state_tags_by_state_type.end()) {
    return &it->second;
  }

  if (state_type.rfind("Methods") == state_type.length() - 7) {
    it = state_tags_by_state_type.find(
        state_type.substr(0, state_type.size() - 7));
    if (it != state_tags_by_state_type.end()) {
      return &it->second;
    }
  }

  return make_unexpected(fmt::format(
      "Unknown state type in position {}: {}",
      position,
      state_type));
}

expected<void> MaybeMigrateTaskId(
    const google::protobuf::Map<std::string, std::string>&
        state_tags_by_state_type,
    TaskId* task_id) {
  auto state_tag = GetStateTag(
      state_tags_by_state_type,
      task_id->state_type(),
      "task_id");
  if (!state_tag.has_value()) {
    return make_unexpected(fmt::format(
        "Unknown state type for task: {}",
        state_tag.error()));
  }
  task_id->set_state_ref(
      MigrateStateRef(*state_tag.value(), task_id->state_ref()));
  return {};
}


// This migration deletes Tasks which did not have `Any` response values
// (i.e. from before #2580).
expected<void> SidecarService::MigratePersistence2To3(
    const RecoverRequest& request) {
  for (rocksdb::ColumnFamilyHandle* column_family_handle :
       column_family_handles_) {
    std::unique_ptr<rocksdb::Iterator> iterator(CHECK_NOTNULL(
        db_->NewIterator(
            NonPrefixIteratorReadOptions(),
            column_family_handle)));

    // TODO: investigate using "prefix seek" for better performance, see:
    // https://github.com/facebook/rocksdb/wiki/Prefix-Seek
    iterator->Seek(rocksdb::Slice(TASK_KEY_PREFIX));

    while (iterator->Valid()
           && iterator->key().ToStringView().find(TASK_KEY_PREFIX) == 0) {
      Task task;
      CHECK(
          task.ParseFromArray(
              iterator->value().data(),
              iterator->value().size()));
      if (task.has_response()
          && task.response().type_url().find("type.googleapis.com") != 0) {
        rocksdb::Status status =
            db_->Delete(
                DefaultWriteOptions(),
                column_family_handle,
                iterator->key());
        if (!status.ok()) {
          return make_unexpected(fmt::format(
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

expected<void> SidecarService::MaybeMigratePersistence(
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
      return make_unexpected(fmt::format(
          "Corrupted persistence version: {}",
          pv.version()));
    } else if (pv.version() > CURRENT_PERSISTENCE_VERSION) {
      return make_unexpected(fmt::format(
          "Unsupported persistence version: {}",
          pv.version()));
    } else {
      // Is a previous version which needs updating.
      version = pv.version();
    }
  } else if (status.IsNotFound()) {
    // Version 0 will not have a persisted version yet.
    version = 0;
  } else {
    return make_unexpected(fmt::format(
        "Failed to read persistence version: {}",
        status.ToString()));
  }

  // Expecting at least persistence version >= 2.
  CHECK(2 <= version && version < CURRENT_PERSISTENCE_VERSION)
      << "Persistence version " << version << " is no longer supported";

  for (; version < CURRENT_PERSISTENCE_VERSION; version++) {
    REBOOT_SIDECAR_LOG(0)
        << "Migrating persistence from version { " << version << " }";
    expected<void> migrate;
    switch (version) {
      case 2:
        migrate = MigratePersistence2To3(request);
        break;
      default:
        LOG(FATAL) << "Unreachable";
    }
    if (!migrate.has_value()) {
      return migrate;
    }
  }

  return {};
}

////////////////////////////////////////////////////////////////////////

grpc::Status SidecarService::Recover(
    grpc::ServerContext* context,
    const RecoverRequest* request,
    grpc::ServerWriter<RecoverResponse>* responses) {
  std::unique_lock lock(mutex_);

  REBOOT_SIDECAR_LOG(1)
      << "Recover { " << request->ShortDebugString() << " }";

  // (0) Migrate to the current persistence version, if necessary.
  expected<void> maybe_migrate = MaybeMigratePersistence(*request);
  if (!maybe_migrate.has_value()) {
    return grpc::Status(grpc::UNKNOWN, maybe_migrate.error());
  }

  // (1) Recover the list of all state types and actors.
  RecoverActors(*responses);

  // (2) Recover tasks _before_ recovering transactions because
  // transactions need to know the recovered committed tasks to
  // recover uncommitted tasks.
  std::set<std::string> committed_task_uuids = RecoverTasks(*responses);

  // (3) Recover idempotent mutations _before_ recovering
  // transactions because transactions need to know the
  // recovered committed idempotent mutations to recover
  // uncommitted idempotent mutations.
  std::set<std::string> committed_idempotent_mutations =
      RecoverIdempotentMutations(*responses);

  // (4) Recover transactions.
  expected<void> recover_transactions = RecoverTransactions(
      *responses,
      committed_task_uuids,
      committed_idempotent_mutations);

  if (!recover_transactions.has_value()) {
    return grpc::Status(grpc::UNKNOWN, recover_transactions.error());
  }

  return grpc::Status::OK;
}

////////////////////////////////////////////////////////////////////////

expected<std::unique_ptr<SidecarServer>>
SidecarServer::Instantiate(
    const std::filesystem::path& db_path,
    const ConsensusInfo& consensus_info,
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
      SidecarService::Instantiate(db_path, consensus_info);

  if (!service.has_value()) {
    throw std::runtime_error(fmt::format(
        "Failed to instantiate service: {}",
        service.error()));
  }

  builder.RegisterService(service->get());

  std::unique_ptr<grpc::Server> server(builder.BuildAndStart());

  // NOTE: we'll only know the 'port' after we have successfully
  // started the server, hence we need to update 'address' here.
  if (port.has_value()) {
    address = fmt::format("{}:{}", absl::StripSuffix(address, ":0"), *port);
  }

  REBOOT_SIDECAR_LOG(1) << "sidecar gRPC server listening at " << address;

  return std::unique_ptr<SidecarServer>(
      new SidecarServer(
          std::move(service.value()),
          std::move(server),
          address));
}

extern "C" {

// Tries to 'Load' and returns the size of message (or error code) and the
// message as 'response_ptr' and 'status_message'.
size_t sidecar_server_load_actor_state(
    rbt::consensus::SidecarServer* server,
    const char* request_bytes,
    size_t request_bytes_size,
    char** message_bytes,
    char** status_message) {
  rbt::v1alpha1::LoadRequest request;
  CHECK(request.ParseFromArray(request_bytes, request_bytes_size));

  rbt::v1alpha1::LoadResponse response;

  auto* service = static_cast<rbt::consensus::SidecarService*>(
      server->service_.get());

  auto status = service->_Load(&request, &response);

  if (!status.ok()) {
    REBOOT_SIDECAR_LOG(1) << "Failed to load actor state: "
                          << status.error_message() << std::endl;
    size_t size = status.error_message().size();
    *status_message = new char[size];
    // Use `memcpy` instead of `strncpy` to safely copy raw data,
    // including binary content that may contain null bytes (\0).
    // `strncpy` is intended for null-terminated C-strings and may
    // stop copying early or pad with extra nulls.
    std::memcpy(*status_message, status.error_message().data(), size);
    *message_bytes = nullptr;
    return size;
  } else {
    // Serialize response and send back.
    *status_message = nullptr;
    size_t size = response.ByteSizeLong();
    *message_bytes = new char[size];
    CHECK(response.SerializeToArray(*message_bytes, size));
    return size;
  }
}

// Tries to 'Store' and returns 0 on success or > 0 on gRPC error.
size_t sidecar_server_store(
    rbt::consensus::SidecarServer* server,
    const char* request_bytes,
    size_t request_bytes_size,
    char** status_message) {
  rbt::v1alpha1::StoreRequest request;
  CHECK(request.ParseFromArray(request_bytes, request_bytes_size));

  rbt::v1alpha1::StoreResponse response;

  auto* service = static_cast<rbt::consensus::SidecarService*>(
      server->service_.get());

  auto status = service->_Store(&request, &response);

  if (!status.ok()) {
    REBOOT_SIDECAR_LOG(1) << "Failed to store: "
                          << status.error_message() << std::endl;
    size_t size = status.error_message().size();
    *status_message = new char[size];
    // Use `memcpy` instead of `strncpy` to safely copy raw data,
    // including binary content that may contain null bytes (\0).
    // `strncpy` is intended for null-terminated C-strings and may
    // stop copying early or pad with extra nulls.
    std::memcpy(*status_message, status.error_message().data(), size);

    return size;
  }

  *status_message = nullptr;

  return 0;
}

void sidecar_server_delete_array(char* ptr) {
  delete[] ptr;
}

} // extern "C"

////////////////////////////////////////////////////////////////////////

} // namespace rbt::consensus

////////////////////////////////////////////////////////////////////////
