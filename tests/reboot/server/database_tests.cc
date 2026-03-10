#include <openssl/sha.h>

#include <chrono>
#include <filesystem>
#include <random>
#include <set>

#include "gmock/gmock-matchers.h"
#include "google/protobuf/any.pb.h"
#include "google/protobuf/descriptor.h"
#include "google/protobuf/util/message_differencer.h"
#include "google/protobuf/wrappers.pb.h"
#include "rbt/v1alpha1/application_metadata.pb.h"
#include "reboot/server/database.h"
#include "stout/copy.h"
#include "stout/tests/utils.h"
#include "stout/uuid.h"
#include "tests/reboot/server/uuidv7.h"

////////////////////////////////////////////////////////////////////////

namespace rbt::server {
namespace {

////////////////////////////////////////////////////////////////////////

using id::UUID;

using testing::HasSubstr;
using testing::ThrowsMessage;

////////////////////////////////////////////////////////////////////////

// Helper function to compute SHA1 hash and return first byte.
unsigned char getHashFirstByte(const std::string& str) {
  unsigned char hash[20];
  SHA1(reinterpret_cast<const unsigned char*>(str.data()), str.size(), hash);
  return hash[0];
}

////////////////////////////////////////////////////////////////////////

// Helper function to create a UUIDv7 with a specific timestamp.
// Uses the uuidv7.h library's uuidv7_generate function.
// Returns raw 16-byte UUID (not the string representation).
std::string make_uuidv7(uint64_t timestamp_ms) {
  // Generate random bytes.
  uint8_t rand_bytes[10];
  std::random_device rd;
  for (int i = 0; i < 10; i++) {
    rand_bytes[i] = static_cast<uint8_t>(rd());
  }

  uint8_t uuid[16];
  int8_t status = uuidv7_generate(uuid, timestamp_ms, rand_bytes, nullptr);
  CHECK(status >= 0) << "uuidv7_generate failed with status: "
                     << static_cast<int>(status);

  return std::string(reinterpret_cast<char*>(uuid), sizeof(uuid));
}

// Helper function to get the current time in milliseconds since Unix epoch.
uint64_t now_ms() {
  return static_cast<uint64_t>(
      std::chrono::duration_cast<std::chrono::milliseconds>(
          std::chrono::system_clock::now().time_since_epoch())
          .count());
}

////////////////////////////////////////////////////////////////////////

// Base class for database tests with common functionality.
class DatabaseTest : public TemporaryDirectoryTest {
 protected:
  explicit DatabaseTest(int num_shards) : num_shards_(num_shards) {
    // Calculate shard boundaries dynamically.
    shard_boundaries_.reserve(num_shards_);
    for (int i = 0; i < num_shards_; i++) {
      // Evenly divide the 256-byte hash space.
      unsigned char boundary =
          static_cast<unsigned char>(i * 256 / num_shards_);
      shard_boundaries_.push_back(boundary);
    }
  }

  void SetUp() override {
    TemporaryDirectoryTest::SetUp();
    state_directory = test_directory_path() / std::filesystem::path("rocksdb");
  }

  void TearDown() override {
    // Manually remove the temporary directory to avoid a flake
    // on MacOS where the directory is not empty and rmdir in the
    // `TemporaryDirectoryTest::TearDown` fails.
    stub.reset();
    channel.reset();
    server.reset();

    if (std::filesystem::exists(state_directory)) {
      std::filesystem::remove_all(state_directory);
    }
  }

  void restart_server() {
    v1alpha1::ServerInfo server_info;

    for (int i = 0; i < num_shards_; i++) {
      v1alpha1::ShardInfo* shard = server_info.add_shard_infos();
      // Use the same format as `reboot/controller/plan_makers.py`'s
      // `make_shard_id()`. Example: "s000000001".
      char shard_id[11];  // Size of ID, plus null terminator.
      CHECK(snprintf(shard_id, sizeof(shard_id), "s%09d", i) == 10);
      shard->set_shard_id(shard_id);
      shard->set_shard_first_key(std::string(1, shard_boundaries_[i]));
    }

    stub.reset();
    channel.reset();
    server.reset();

    auto instantiate =
        DatabaseServer::Instantiate(state_directory, server_info);

    CHECK(instantiate) << instantiate.error();

    server = std::move(instantiate.value());

    // Some tests will intentionally use the legacy format of the
    // `TransactionCoordinatorPrepared` call; that's normally forbidden, but in
    // this case necessary to set up a scenario to test backwards compatibility.
    TestOnly_EnableLegacyCoordinatorPrepared(server->TestOnly_GetService());

    channel = server->InProcessChannel(grpc::ChannelArguments());
    stub = rbt::v1alpha1::Database::NewStub(channel);
  }

  // Performs a 'Store'.
  inline void store(
      std::vector<v1alpha1::Actor>&& actor_upserts,
      std::vector<v1alpha1::Task>&& task_upserts,
      std::optional<v1alpha1::Transaction>&& transaction = std::nullopt,
      std::optional<v1alpha1::IdempotentMutation>&& idempotent_mutation =
          std::nullopt,
      std::optional<bool> sync = std::nullopt) {
    v1alpha1::StoreRequest request;

    for (auto&& actor : std::move(actor_upserts)) {
      *request.add_actor_upserts() = std::move(actor);
    }
    for (auto&& task : std::move(task_upserts)) {
      *request.add_task_upserts() = std::move(task);
    }
    if (transaction.has_value()) {
      *request.mutable_transaction() = std::move(transaction.value());
    }
    if (idempotent_mutation.has_value()) {
      *request.mutable_idempotent_mutation() =
          std::move(idempotent_mutation.value());
    }
    if (sync.has_value()) {
      request.set_sync(sync.value());
    }

    v1alpha1::StoreResponse response;
    grpc::ClientContext context;

    grpc::Status status = stub->Store(&context, request, &response);

    if (!status.ok()) {
      throw std::runtime_error(status.error_message());
    }
  }

  // Attempts to 'Load' an actor state. Returns 'nullopt' if no
  // state has been stored.
  inline std::optional<std::string> load(
      const std::string& state_type,
      const std::string& state_ref) {
    v1alpha1::LoadRequest request;

    v1alpha1::Actor* actor = request.add_actors();
    actor->set_state_type(state_type);
    actor->set_state_ref(state_ref);

    v1alpha1::LoadResponse response;
    grpc::ClientContext context;

    grpc::Status status = stub->Load(&context, request, &response);

    EXPECT_TRUE(status.ok());

    if (response.actors().size() == 0) {
      // This actor doesn't exist yet.
      return std::nullopt;
    }

    EXPECT_EQ(1, response.actors().size());

    // Check if the actor has state field set. Note that empty state is still a
    // valid state.
    if (!response.actors(0).has_state()) {
      return std::nullopt;
    } else {
      return response.actors(0).state();
    }
  }

  v1alpha1::RecoverResponse call_recover(
      const v1alpha1::RecoverRequest& request) {
    grpc::ClientContext context;
    std::unique_ptr<grpc::ClientReader<v1alpha1::RecoverResponse>> reader(
        stub->Recover(&context, request));

    v1alpha1::RecoverResponse response;
    v1alpha1::RecoverResponse partial;
    while (reader->Read(&partial)) {
      response.MergeFrom(partial);
    }

    grpc::Status status = reader->Finish();
    CHECK(status.ok()) << status.error_message();

    return response;
  }

  v1alpha1::RecoverResponse recover(const std::string& shard_id) {
    v1alpha1::RecoverRequest request;
    request.add_shard_ids(shard_id);
    return call_recover(request);
  }

  v1alpha1::RecoverResponse recover_all_shards(
      bool skip_idempotent_mutations = false) {
    v1alpha1::RecoverRequest request;
    request.set_skip_idempotent_mutations(skip_idempotent_mutations);

    // Add all shard IDs to a single request.
    for (int i = 0; i < num_shards_; i++) {
      char shard_id[16];
      snprintf(shard_id, sizeof(shard_id), "s%09d", i);
      request.add_shard_ids(shard_id);
    }

    return call_recover(request);
  }

  // Helper to cleanup a coordinator transaction.
  void transaction_coordinator_cleanup(
      const UUID& transaction_id,
      const std::string& coordinator_state_ref) {
    v1alpha1::TransactionCoordinatorCleanupRequest request;
    request.set_transaction_id(transaction_id.toBytes());
    request.set_coordinator_state_ref(coordinator_state_ref);

    v1alpha1::TransactionCoordinatorCleanupResponse response;
    grpc::ClientContext context;

    grpc::Status status =
        stub->TransactionCoordinatorCleanup(&context, request, &response);

    CHECK(status.ok()) << status.error_message();
  }

  // Helper to determine which shard a hash belongs to.
  int get_shard_for_hash(unsigned char hash_byte) const {
    for (int i = num_shards_ - 1; i >= 0; i--) {
      if (hash_byte >= shard_boundaries_[i]) {
        return i;
      }
    }
    CHECK(false) << "get_shard_for_hash: No valid shard found for hash_byte "
                 << static_cast<int>(hash_byte);
    // This line should never be reached, but return 0 to satisfy the compiler.
    return 0;
  }

  // Helper to generate a state ref with realistic format. Example:
  // "AEyp_5wmAiADZg:user123".
  std::string make_state_ref(const std::string& state_id) {
    // Use a hardcoded realistic 14-character state type tag
    // for 'com.example.Actor'.
    static const std::string tag = "AEyp_5wmAiADZg";
    return tag + ":" + state_id;
  }

  // Helper to find N state refs that hash to a specific shard ordinal.
  std::vector<std::string> find_shard_actors(int shard_ordinal, int count = 1) {
    CHECK(shard_ordinal < num_shards_);

    std::vector<std::string> shard_refs;
    shard_refs.reserve(count);

    for (int i = 0; shard_refs.size() < count; i++) {
      std::string state_ref = make_state_ref("user_" + std::to_string(i));
      unsigned char hash_byte = getHashFirstByte(state_ref);
      if (get_shard_for_hash(hash_byte) == shard_ordinal) {
        shard_refs.push_back(state_ref);
      }
    }

    return shard_refs;
  }

  // Helper for getting application metadata.
  inline auto get_application_metadata() {
    v1alpha1::GetApplicationMetadataRequest request;
    v1alpha1::GetApplicationMetadataResponse response;
    grpc::ClientContext context;

    grpc::Status status =
        stub->GetApplicationMetadata(&context, request, &response);

    if (!status.ok()) {
      throw std::runtime_error(status.error_message());
    }

    return response;
  }

  // Helper for storing application metadata.
  inline void store_application_metadata(
      const v1alpha1::ApplicationMetadata& metadata) {
    v1alpha1::StoreApplicationMetadataRequest request;
    *request.mutable_metadata() = metadata;
    v1alpha1::StoreApplicationMetadataResponse response;
    grpc::ClientContext context;

    grpc::Status status =
        stub->StoreApplicationMetadata(&context, request, &response);

    if (!status.ok()) {
      throw std::runtime_error(status.error_message());
    }
  }

  int num_shards_;
  std::vector<unsigned char> shard_boundaries_;

  std::filesystem::path state_directory;
  std::unique_ptr<DatabaseServer> server;
  std::shared_ptr<grpc::Channel> channel;
  std::unique_ptr<rbt::v1alpha1::Database::Stub> stub;
};

////////////////////////////////////////////////////////////////////////

class TwoShardDatabaseTest : public DatabaseTest {
 public:
  TwoShardDatabaseTest() : DatabaseTest(2) {}  // Two-shard configuration

 protected:
  void SetUp() override {
    DatabaseTest::SetUp();
    restart_server();
  }

  // Load task response for the given TaskId.
  inline auto load_task_response(v1alpha1::TaskId&& task_id) {
    v1alpha1::LoadRequest request;
    *request.add_task_ids() = task_id;

    v1alpha1::LoadResponse response;
    grpc::ClientContext context;

    stub->Load(&context, request, &response);

    if (response.tasks_size() > 1) {
      // We only sent one task ID to be fetched, and we expect to
      // have stored that ID in a previous call, so we expect exactly
      // one task in the response.
      throw std::runtime_error(
          fmt::format(
              "Expected one task in LoadResponse; got {}",
              response.tasks_size()));
    } else if (response.tasks_size() == 0) {
      // We only sent one task ID to be fetched, and we expect to
      // have stored that ID in a previous call, so we expect exactly
      // one task in the response.
      throw std::runtime_error(
          fmt::format(
              "Task response was requested for nonexistent TaskId "
              "{{ {} }}",
              task_id.ShortDebugString()));
    }

    const v1alpha1::Task& task = response.tasks(0);

    if (task.status() == v1alpha1::Task::COMPLETED) {
      v1alpha1::TaskResponseOrError response_or_error;
      switch (task.response_or_error_case()) {
        case v1alpha1::Task::kResponse:
          *response_or_error.mutable_response() = task.response();
          break;
        case v1alpha1::Task::kError:
          *response_or_error.mutable_error() = task.error();
          break;
        default: CHECK(false) << "Unexpected response/error value!"; break;
      }
      std::string response_or_error_str;
      response_or_error.SerializeToString(&response_or_error_str);
      return std::make_optional(std::move(response_or_error_str));
    }
    return std::optional<std::string>();
  }

  inline void transaction_participant_prepare(
      std::string&& state_type,
      std::string&& state_ref) {
    v1alpha1::TransactionParticipantPrepareRequest request;
    request.set_state_type(std::move(state_type));
    request.set_state_ref(std::move(state_ref));

    v1alpha1::TransactionParticipantPrepareResponse response;
    grpc::ClientContext context;
    grpc::Status status =
        stub->TransactionParticipantPrepare(&context, request, &response);

    if (!status.ok()) {
      throw std::runtime_error(status.error_message());
    }
  }

  inline void transaction_participant_commit(
      std::string&& state_type,
      std::string&& state_ref) {
    v1alpha1::TransactionParticipantCommitRequest request;
    request.set_state_type(std::move(state_type));
    request.set_state_ref(std::move(state_ref));

    v1alpha1::TransactionParticipantCommitResponse response;
    grpc::ClientContext context;
    grpc::Status status =
        stub->TransactionParticipantCommit(&context, request, &response);

    if (!status.ok()) {
      throw std::runtime_error(status.error_message());
    }
  }

  inline void transaction_participant_abort(
      std::string&& state_type,
      std::string&& state_ref) {
    v1alpha1::TransactionParticipantAbortRequest request;
    request.set_state_type(std::move(state_type));
    request.set_state_ref(std::move(state_ref));

    v1alpha1::TransactionParticipantAbortResponse response;
    grpc::ClientContext context;

    grpc::Status status =
        stub->TransactionParticipantAbort(&context, request, &response);

    if (!status.ok()) {
      throw std::runtime_error(status.error_message());
    }
  }

  inline void transaction_coordinator_prepared(
      const std::string& transaction_id,
      const std::string& coordinator_state_ref,
      std::map<std::string, std::set<std::string>>&& should_commit) {
    v1alpha1::TransactionCoordinatorPreparedRequest request;
    request.set_transaction_id(transaction_id);
    auto* coordinator = request.mutable_prepared_transaction_coordinator();
    coordinator->set_state_ref(coordinator_state_ref);
    for (const auto& [state_type, state_refs] : should_commit) {
      (*(coordinator->mutable_participants()
             ->mutable_should_commit()))[state_type]
          .mutable_state_refs()
          ->Assign(state_refs.begin(), state_refs.end());
    }

    v1alpha1::TransactionCoordinatorPreparedResponse response;
    grpc::ClientContext context;

    grpc::Status status =
        stub->TransactionCoordinatorPrepared(&context, request, &response);

    EXPECT_TRUE(status.ok());
  }


  inline void colocated_store(
      std::string&& state_type,
      std::string&& key,
      std::string&& value) {
    v1alpha1::StoreRequest request;

    v1alpha1::ColocatedUpsert* cup = request.add_colocated_upserts();
    cup->set_state_type(std::move(state_type));
    cup->set_key(std::move(key));
    cup->set_value(std::move(value));

    v1alpha1::StoreResponse response;
    grpc::ClientContext context;

    grpc::Status status = stub->Store(&context, request, &response);

    EXPECT_TRUE(status.ok());
  }

  inline auto colocated_range(
      std::string&& state_type,
      std::string&& parent_state_key,
      std::string start,
      std::string end,
      int limit) {
    v1alpha1::ColocatedRangeRequest request;

    request.set_state_type(std::move(state_type));
    request.set_parent_state_ref(std::move(parent_state_key));
    // TODO: We use the empty string to signal null, which prevents testing a
    // few cases, because the empty string is (currently) a valid key for state
    // machines.
    if (!start.empty()) {
      *request.mutable_start() = start;
    }

    if (!end.empty()) {
      *request.mutable_end() = end;
    }

    request.set_limit(limit);

    v1alpha1::ColocatedRangeResponse response;
    grpc::ClientContext context;

    grpc::Status status = stub->ColocatedRange(&context, request, &response);

    EXPECT_TRUE(status.ok());

    CHECK(response.keys_size() == response.values_size());

    std::vector<std::tuple<std::string, std::string>> items;
    items.reserve(response.keys_size());
    auto k_it = response.keys().begin();
    auto v_it = response.values().begin();
    for (; k_it != response.keys().end(); ++k_it, ++v_it) {
      items.emplace_back(*k_it, *v_it);
    }

    return items;
  }

  inline auto colocated_reverse_range(
      std::string&& state_type,
      std::string&& parent_state_key,
      std::string start,
      std::string end,
      int limit) {
    v1alpha1::ColocatedReverseRangeRequest request;

    request.set_state_type(std::move(state_type));
    request.set_parent_state_ref(std::move(parent_state_key));
    // TODO: We use the empty string to signal null, which prevents testing a
    // few cases, because the empty string is (currently) a valid key for state
    // machines.
    if (!start.empty()) {
      *request.mutable_start() = start;
    }

    if (!end.empty()) {
      *request.mutable_end() = end;
    }

    request.set_limit(limit);

    v1alpha1::ColocatedReverseRangeResponse response;
    grpc::ClientContext context;

    grpc::Status status =
        stub->ColocatedReverseRange(&context, request, &response);

    EXPECT_TRUE(status.ok());

    CHECK(response.keys_size() == response.values_size());

    std::vector<std::tuple<std::string, std::string>> items;
    items.reserve(response.keys_size());
    auto k_it = response.keys().begin();
    auto v_it = response.values().begin();
    for (; k_it != response.keys().end(); ++k_it, ++v_it) {
      items.emplace_back(*k_it, *v_it);
    }

    return items;
  }
};

v1alpha1::Task MakeTask(
    const std::string& state_type,
    const std::string& state_ref,
    const std::string& task_uuid,
    const v1alpha1::Task::Status& status = v1alpha1::Task::PENDING,
    const std::string& method = "Greet",
    const std::string& request = "request") {
  v1alpha1::Task task;
  task.mutable_task_id()->set_state_type(state_type);
  task.mutable_task_id()->set_state_ref(state_ref);
  task.mutable_task_id()->set_task_uuid(task_uuid);
  task.set_status(status);
  task.set_method(method);
  task.set_request(request);
  return task;
}

google::protobuf::StringValue MakeStringValue(const std::string& s) {
  google::protobuf::StringValue value;
  value.set_value(s);
  return value;
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, LoadBeforeStore) {
  std::optional<std::string> data =
      load("Greeter", make_state_ref("test_1234"));

  EXPECT_FALSE(data.has_value());
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, StoreLoad) {
  v1alpha1::Actor actor;
  actor.set_state_type("Greeter");
  actor.set_state_ref(make_state_ref("test_1234"));
  actor.set_state("hello world");
  store({actor}, {});

  std::optional<std::string> data =
      load("Greeter", make_state_ref("test_1234"));

  ASSERT_TRUE(data.has_value());
  EXPECT_EQ("hello world", data.value());
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, StoreEmptyLoad) {
  v1alpha1::Actor actor;
  actor.set_state_type("Greeter");
  actor.set_state_ref(make_state_ref("test_1234"));
  actor.set_state("");
  store({actor}, {});

  std::optional<std::string> data =
      load("Greeter", make_state_ref("test_1234"));

  ASSERT_TRUE(data.has_value());
  EXPECT_EQ("", data.value());
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, StoreLoadStoreLoad) {
  v1alpha1::Actor actor;
  actor.set_state_type("Greeter");
  actor.set_state_ref(make_state_ref("test_1234"));
  actor.set_state("hello world");
  store({actor}, {});

  std::optional<std::string> data =
      load("Greeter", make_state_ref("test_1234"));

  ASSERT_TRUE(data.has_value());
  EXPECT_EQ("hello world", data.value());

  actor.set_state("goodnight moon");
  store({actor}, {});

  data = load("Greeter", make_state_ref("test_1234"));

  ASSERT_TRUE(data.has_value());
  EXPECT_EQ("goodnight moon", data.value());
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, StoreRestartLoad) {
  v1alpha1::Actor actor;
  actor.set_state_type("Greeter");
  actor.set_state_ref(make_state_ref("test_1234"));
  actor.set_state("hello world");
  store({actor}, {});

  restart_server();

  std::optional<std::string> data =
      load("Greeter", make_state_ref("test_1234"));

  ASSERT_TRUE(data.has_value());
  EXPECT_EQ("hello world", data.value());
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, StoreLoadTask) {
  v1alpha1::Task task = MakeTask(
      "Greeter",
      make_state_ref("actor_1234"),
      "task-uuid-1234",
      v1alpha1::Task::COMPLETED);

  task.mutable_response()->PackFrom(MakeStringValue("hello world"));

  store({}, {task});

  std::optional<std::string> response =
      load_task_response(std::move(*task.mutable_task_id()));

  ASSERT_TRUE(response.has_value());
  v1alpha1::TaskResponseOrError response_or_error;
  ASSERT_TRUE(response_or_error.ParseFromString(response.value()));

  google::protobuf::Any any = response_or_error.response();
  google::protobuf::StringValue value;
  ASSERT_TRUE(any.UnpackTo(&value));
  EXPECT_EQ("hello world", value.value());
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, TaskLifecycle) {
  std::string state_ref = make_state_ref("actor_1234");
  std::string state_type = "Greeter";
  std::string actor_state = "you're a wizard harry";

  v1alpha1::Actor actor;
  actor.set_state_type(state_type);
  actor.set_state_ref(state_ref);
  actor.set_state(actor_state);

  v1alpha1::Task task = MakeTask(state_type, state_ref, "task-uuid-1234");

  // Create the pending task along with an actor state update.
  store({actor}, {task});

  // The new actor state should be visible, but the new task should not have
  // a loadable response yet.
  std::optional<std::string> loaded_actor_state =
      load(std::string(state_type), std::string(state_ref));
  ASSERT_TRUE(loaded_actor_state.has_value());
  EXPECT_EQ(actor_state, loaded_actor_state.value());

  std::optional<std::string> response =
      load_task_response(v1alpha1::TaskId(task.task_id()));
  EXPECT_FALSE(response.has_value());

  // Now store a response for the task.
  task.set_status(v1alpha1::Task::COMPLETED);
  task.mutable_response()->PackFrom(MakeStringValue("hello world"));
  store({}, {task});

  // The task response should now be loadable.
  response = load_task_response(std::move(*task.mutable_task_id()));

  ASSERT_TRUE(response.has_value());
  v1alpha1::TaskResponseOrError response_or_error;
  ASSERT_TRUE(response_or_error.ParseFromString(response.value()));

  google::protobuf::Any any = response_or_error.response();
  google::protobuf::StringValue value;
  ASSERT_TRUE(any.UnpackTo(&value));
  EXPECT_EQ("hello world", value.value());
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, LoadTaskNotFound) {
  std::string state_ref = make_state_ref("actor_1234");
  std::string task_uuid = "nonexistent";
  std::string state_type = "Greeter";

  v1alpha1::TaskId task_id;
  task_id.set_state_type(state_type);
  task_id.set_state_ref(state_ref);
  task_id.set_task_uuid(task_uuid);

  EXPECT_THAT(
      [&]() { load_task_response(std::move(task_id)); },
      ThrowsMessage<std::runtime_error>(
          HasSubstr("Task response was requested for nonexistent TaskId")));
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, TransactionParticipantStorePrepareCommit) {
  // Test that we can begin, then prepare, then commit a transaction.

  const std::string state_type = "Greeter";
  const std::string state_ref = make_state_ref("test_1234");

  v1alpha1::Actor actor;
  actor.set_state_type(state_type);
  actor.set_state_ref(state_ref);
  actor.set_state("hello world");

  v1alpha1::Transaction transaction;
  transaction.set_state_type(state_type);
  transaction.set_state_ref(state_ref);
  transaction.add_transaction_ids(UUID::random().toBytes());
  transaction.set_coordinator_state_type("some.Coordinator");
  transaction.set_coordinator_state_ref(make_state_ref("some_actor_1"));

  store({actor}, {}, std::move(transaction));

  transaction_participant_prepare(
      stout::copy(state_type),
      stout::copy(state_ref));

  transaction_participant_commit(
      stout::copy(state_type),
      stout::copy(state_ref));
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, TransactionParticipantStorePrepareAbort) {
  // Test that we can begin, then prepare, then abort a transaction.

  const std::string state_type = "Greeter";
  const std::string state_ref = make_state_ref("test_1234");

  v1alpha1::Actor actor;
  actor.set_state_type(state_type);
  actor.set_state_ref(state_ref);
  actor.set_state("hello world");

  v1alpha1::Transaction transaction;
  transaction.set_state_type(state_type);
  transaction.set_state_ref(state_ref);
  transaction.add_transaction_ids(UUID::random().toBytes());
  transaction.set_coordinator_state_type("some.Coordinator");
  transaction.set_coordinator_state_ref(make_state_ref("some_actor_1"));

  store({actor}, {}, std::move(transaction));

  transaction_participant_prepare(
      stout::copy(state_type),
      stout::copy(state_ref));

  transaction_participant_abort(
      stout::copy(state_type),
      stout::copy(state_ref));
}

////////////////////////////////////////////////////////////////////////

TEST_F(
    TwoShardDatabaseTest,
    TransactionParticipantStoreAbortStorePrepareCommit) {
  // Test that we can begin, then abort abort a transaction (without a
  // prepare), then begin a different transaction and prepare and
  // commit it.

  const std::string state_type = "Greeter";
  const std::string state_ref = make_state_ref("test_1234");

  v1alpha1::Actor actor;
  actor.set_state_type(state_type);
  actor.set_state_ref(state_ref);
  actor.set_state("hello world");

  v1alpha1::Transaction transaction1;
  transaction1.set_state_type(state_type);
  transaction1.set_state_ref(state_ref);
  transaction1.add_transaction_ids(UUID::random().toBytes());
  transaction1.set_coordinator_state_type("some.Coordinator");
  transaction1.set_coordinator_state_ref("some-actor-1");

  store({actor}, {}, std::move(transaction1));

  transaction_participant_abort(
      stout::copy(state_type),
      stout::copy(state_ref));

  v1alpha1::Transaction transaction2;
  transaction2.set_state_type(state_type);
  transaction2.set_state_ref(state_ref);
  transaction2.add_transaction_ids(UUID::random().toBytes());
  transaction2.set_coordinator_state_type("some.Coordinator");
  transaction2.set_coordinator_state_ref("some-actor-1");

  store({actor}, {}, std::move(transaction2));

  transaction_participant_prepare(
      stout::copy(state_type),
      stout::copy(state_ref));

  transaction_participant_abort(
      stout::copy(state_type),
      stout::copy(state_ref));
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, TransactionParticipantStoreStore) {
  // Test that we can begin a transaction and any subsequent
  // transaction begins will fail.

  const std::string state_type = "Greeter";
  const std::string state_ref = make_state_ref("test_1234");

  v1alpha1::Actor actor;
  actor.set_state_type(state_type);
  actor.set_state_ref(state_ref);
  actor.set_state("hello world");

  const UUID transaction_id_1 = UUID::random();

  v1alpha1::Transaction transaction1;
  transaction1.set_state_type(state_type);
  transaction1.set_state_ref(state_ref);
  transaction1.add_transaction_ids(transaction_id_1.toBytes());
  transaction1.set_coordinator_state_type("some.Coordinator");
  transaction1.set_coordinator_state_ref("some-actor-1");

  const UUID transaction_id_2 = UUID::random();

  v1alpha1::Transaction transaction2;
  transaction2.set_state_type(state_type);
  transaction2.set_state_ref(state_ref);
  transaction2.add_transaction_ids(transaction_id_2.toBytes());
  transaction2.set_coordinator_state_type("some.Coordinator");
  transaction2.set_coordinator_state_ref("some-actor-1");

  store({actor}, {}, std::move(transaction1));

  EXPECT_THAT(
      [&]() { store({actor}, {}, std::move(transaction2)); },
      ThrowsMessage<std::runtime_error>(HasSubstr(
          fmt::format(
              "Failed to begin transaction '{}' for state type '{}' "
              "actor '{}' as transaction '{}' has already begun",
              transaction_id_2.toString(),
              state_type,
              state_ref,
              transaction_id_1.toString()))));
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, TransactionParticipantStoreStoreNotInTransaction) {
  // Test that once we've begun a transaction any non-transactional
  // stores will fail.

  const std::string state_type = "Greeter";
  const std::string state_ref = make_state_ref("test_1234");

  v1alpha1::Actor actor;
  actor.set_state_type(state_type);
  actor.set_state_ref(state_ref);
  actor.set_state("hello world");

  v1alpha1::Transaction transaction;
  transaction.set_state_type(state_type);
  transaction.set_state_ref(state_ref);
  transaction.add_transaction_ids(UUID::random().toBytes());
  transaction.set_coordinator_state_type("some.Coordinator");
  transaction.set_coordinator_state_ref(make_state_ref("some_actor_1"));

  store({actor}, {}, std::move(transaction));

  EXPECT_THAT(
      [&]() { store({actor}, {}); },
      ThrowsMessage<std::runtime_error>(HasSubstr(
          "Attempt to store outside of a transaction while "
          "there is an ongoing transaction")));
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, TransactionParticipantStorePreparePrepare) {
  // Test that we can only prepare a transaction once.

  const std::string state_type = "Greeter";
  const std::string state_ref = make_state_ref("test_1234");

  v1alpha1::Actor actor;
  actor.set_state_type(state_type);
  actor.set_state_ref(state_ref);
  actor.set_state("hello world");

  v1alpha1::Transaction transaction;
  transaction.set_state_type(state_type);
  transaction.set_state_ref(state_ref);
  transaction.add_transaction_ids(UUID::random().toBytes());
  transaction.set_coordinator_state_type("some.Coordinator");
  transaction.set_coordinator_state_ref(make_state_ref("some_actor_1"));

  store({actor}, {}, std::move(transaction));

  transaction_participant_prepare(
      stout::copy(state_type),
      stout::copy(state_ref));

  EXPECT_THAT(
      [&]() {
        transaction_participant_prepare(
            stout::copy(state_type),
            stout::copy(state_ref));
      },
      ThrowsMessage<std::runtime_error>(HasSubstr(
          "Failed to prepare transaction: Invalid argument: "
          "Transaction has already been prepared")));
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, TransactionParticipantStoreCommit) {
  // Test that we can't commit a transaction that hasn't been
  // prepared.

  const std::string state_type = "Greeter";
  const std::string state_ref = make_state_ref("test_1234");

  v1alpha1::Actor actor;
  actor.set_state_type(state_type);
  actor.set_state_ref(state_ref);
  actor.set_state("hello world");

  v1alpha1::Transaction transaction;
  transaction.set_state_type(state_type);
  transaction.set_state_ref(state_ref);
  transaction.add_transaction_ids(UUID::random().toBytes());
  transaction.set_coordinator_state_type("some.Coordinator");
  transaction.set_coordinator_state_ref(make_state_ref("some_actor_1"));

  store({actor}, {}, std::move(transaction));

  EXPECT_THAT(
      [&]() {
        transaction_participant_commit(
            stout::copy(state_type),
            stout::copy(state_ref));
      },
      ThrowsMessage<std::runtime_error>(HasSubstr(
          "Failed to commit transaction: Invalid argument: Txn not prepared")));
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, TransactionParticipantPrepareMissingTransaction) {
  // Test that we can't prepare a transaction that doesn't exist.

  const std::string state_type = "Greeter";
  const std::string state_ref = make_state_ref("test_1234");

  v1alpha1::Actor actor;
  actor.set_state_type(state_type);
  actor.set_state_ref(state_ref);
  actor.set_state("hello world");

  store({actor}, {});

  EXPECT_THAT(
      [&]() {
        transaction_participant_prepare(
            stout::copy(state_type),
            stout::copy(state_ref));
      },
      ThrowsMessage<std::runtime_error>(HasSubstr(
          fmt::format(
              "Missing transaction for state type '{}' actor '{}'",
              state_type,
              state_ref))));
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, TransactionParticipantCommitMissingTransaction) {
  // Test that we can't commit a transaction that doesn't exist.

  const std::string state_type = "Greeter";
  const std::string state_ref = make_state_ref("test_1234");

  v1alpha1::Actor actor;
  actor.set_state_type(state_type);
  actor.set_state_ref(state_ref);
  actor.set_state("hello world");

  store({actor}, {});

  EXPECT_THAT(
      [&]() {
        transaction_participant_commit(
            stout::copy(state_type),
            stout::copy(state_ref));
      },
      ThrowsMessage<std::runtime_error>(HasSubstr(
          fmt::format(
              "Missing transaction for state type '{}' actor '{}'",
              state_type,
              state_ref))));
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, TransactionParticipantAbortMissingTransaction) {
  // Test that we can't abort a transaction that doesn't exist.

  const std::string state_type = "Greeter";
  const std::string state_ref = make_state_ref("test_1234");

  v1alpha1::Actor actor;
  actor.set_state_type(state_type);
  actor.set_state_ref(state_ref);
  actor.set_state("hello world");

  store({actor}, {});

  EXPECT_THAT(
      [&]() {
        transaction_participant_abort(
            stout::copy(state_type),
            stout::copy(state_ref));
      },
      ThrowsMessage<std::runtime_error>(HasSubstr(
          fmt::format(
              "Missing transaction for state type '{}' actor '{}'",
              state_type,
              state_ref))));
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, TransactionParticipantStoreDifferentActors) {
  // Test that we can't begin a transaction with different actors.

  const std::string state_type = "Greeter";
  const std::string state_ref1 = make_state_ref("test_1234");
  const std::string state_ref2 = make_state_ref("test_4321");

  v1alpha1::Actor actor1;
  actor1.set_state_type(state_type);
  actor1.set_state_ref(state_ref1);
  actor1.set_state("hello world");

  v1alpha1::Actor actor2;
  actor2.set_state_type(state_type);
  actor2.set_state_ref(state_ref2);
  actor2.set_state("also hello world");

  v1alpha1::Transaction transaction;
  transaction.set_state_type(state_type);
  transaction.set_state_ref(state_ref1);
  transaction.add_transaction_ids(UUID::random().toBytes());
  transaction.set_coordinator_state_type("some.Coordinator");
  transaction.set_coordinator_state_ref(make_state_ref("some_actor_1"));

  EXPECT_THAT(
      [&]() { store({actor1, actor2}, {}, std::move(transaction)); },
      ThrowsMessage<std::runtime_error>(HasSubstr(
          "All actor upserts within a transaction "
          "must be for the same actor")));
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, TransactionParticipantStoreDifferentServices) {
  // Test that we can't begin a transaction with different state_types
  // (and thus actors).

  const std::string state_type1 = "Greeter";
  const std::string state_type2 = "Sleeper";
  const std::string state_ref = make_state_ref("test_1234");

  v1alpha1::Actor actor1;
  actor1.set_state_type(state_type1);
  actor1.set_state_ref(state_ref);
  actor1.set_state("hello world");

  v1alpha1::Actor actor2;
  actor2.set_state_type(state_type2);
  actor2.set_state_ref(state_ref);
  actor2.set_state("also hello world");

  v1alpha1::Transaction transaction;
  transaction.set_state_type(state_type1);
  transaction.set_state_ref(state_ref);
  transaction.add_transaction_ids(UUID::random().toBytes());
  transaction.set_coordinator_state_type("some.Coordinator");
  transaction.set_coordinator_state_ref(make_state_ref("some_actor_1"));

  EXPECT_THAT(
      [&]() { store({actor1, actor2}, {}, std::move(transaction)); },
      ThrowsMessage<std::runtime_error>(HasSubstr(
          "All actor upserts within a transaction "
          "must be for the same actor")));
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, TransactionCoordinatorPrepared) {
  // Test that a coordinator can persist a transaction is prepared.

  transaction_coordinator_prepared(
      UUID::random().toBytes(),
      make_state_ref("coordinator_1"),  // coordinator's state_ref
      {{"some.Participant", {make_state_ref("some_actor_1")}},
       {"another.Participant", {make_state_ref("another_actor_2")}}});
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, RecoverIdempotentMutations) {
  const std::string state_type = "Greeter";
  const std::string state_ref = make_state_ref("test_1234");

  // Store an idempotent mutation.
  const UUID idempotent_mutation_id = UUID::random();
  v1alpha1::IdempotentMutation idempotent_mutation;
  idempotent_mutation.set_state_type(state_type);
  idempotent_mutation.set_state_ref(state_ref);
  idempotent_mutation.set_key(idempotent_mutation_id.toBytes());
  idempotent_mutation.set_response({});

  // All possible arguments to `Store` should be used in this call, as we
  // want to test that all of them can be recovered post-prepare.
  store({}, {}, std::nullopt, std::move(idempotent_mutation));

  // `Recover()` with `skip_idempotent_mutations` should not return
  // any idempotent mutations.
  v1alpha1::RecoverResponse recover_response = recover_all_shards(
      /* skip_idempotent_mutations = */ true);

  ASSERT_EQ(0, recover_response.idempotent_mutations().size());

  // `RecoverIdempotentMutations()` should get the idempotent
  // mutation.
  v1alpha1::RecoverIdempotentMutationsRequest request;
  request.set_state_type(state_type);
  request.set_state_ref(state_ref);

  grpc::ClientContext context;

  std::unique_ptr<
      grpc::ClientReader<v1alpha1::RecoverIdempotentMutationsResponse>>
      reader(stub->RecoverIdempotentMutations(&context, request));

  v1alpha1::RecoverIdempotentMutationsResponse response;
  v1alpha1::RecoverIdempotentMutationsResponse partial;

  while (reader->Read(&partial)) {
    response.MergeFrom(partial);
  }

  grpc::Status status = reader->Finish();

  if (!status.ok()) {
    throw std::runtime_error(status.error_message());
  }

  ASSERT_EQ(1, response.idempotent_mutations().size());

  EXPECT_EQ(
      idempotent_mutation_id.toBytes(),
      response.idempotent_mutations(0).key());
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, RecoverIdempotentMutationsWithUuidV7) {
  // Test that UUIDv7 idempotency keys (expiring) are stored and recovered
  // correctly when they have not yet expired.
  const std::string state_type = "Greeter";
  const std::string state_ref = make_state_ref("test_uuidv7");

  // Create a UUIDv7 with a timestamp 1 hour in the future.
  const uint64_t future_timestamp_ms = now_ms() + (60 * 60 * 1000);
  const std::string uuidv7 = make_uuidv7(future_timestamp_ms);

  v1alpha1::IdempotentMutation idempotent_mutation;
  idempotent_mutation.set_state_type(state_type);
  idempotent_mutation.set_state_ref(state_ref);
  idempotent_mutation.set_key(uuidv7);
  idempotent_mutation.set_response("test_response");

  store({}, {}, std::nullopt, std::move(idempotent_mutation));

  // RecoverIdempotentMutations should return the non-expired UUIDv7 mutation.
  v1alpha1::RecoverIdempotentMutationsRequest request;
  request.set_state_type(state_type);
  request.set_state_ref(state_ref);

  grpc::ClientContext context;

  std::unique_ptr<
      grpc::ClientReader<v1alpha1::RecoverIdempotentMutationsResponse>>
      reader(stub->RecoverIdempotentMutations(&context, request));

  v1alpha1::RecoverIdempotentMutationsResponse response;
  v1alpha1::RecoverIdempotentMutationsResponse partial;

  while (reader->Read(&partial)) {
    response.MergeFrom(partial);
  }

  grpc::Status status = reader->Finish();
  ASSERT_TRUE(status.ok()) << status.error_message();

  ASSERT_EQ(1, response.idempotent_mutations().size());
  EXPECT_EQ(uuidv7, response.idempotent_mutations(0).key());
  EXPECT_EQ("test_response", response.idempotent_mutations(0).response());
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, RecoverIdempotentMutationsExpiredUuidV7) {
  // Test that expired UUIDv7 idempotency keys are NOT recovered.
  const std::string state_type = "Greeter";
  const std::string state_ref = make_state_ref("test_expired_uuidv7");

  // Create a UUIDv7 with a timestamp 1 hour in the past (expired).
  const uint64_t past_timestamp_ms = now_ms() - (60 * 60 * 1000);
  const std::string expired_uuidv7 = make_uuidv7(past_timestamp_ms);

  v1alpha1::IdempotentMutation idempotent_mutation;
  idempotent_mutation.set_state_type(state_type);
  idempotent_mutation.set_state_ref(state_ref);
  idempotent_mutation.set_key(expired_uuidv7);
  idempotent_mutation.set_response("expired_response");

  store({}, {}, std::nullopt, std::move(idempotent_mutation));

  // RecoverIdempotentMutations should NOT return the expired UUIDv7 mutation.
  v1alpha1::RecoverIdempotentMutationsRequest request;
  request.set_state_type(state_type);
  request.set_state_ref(state_ref);

  grpc::ClientContext context;

  std::unique_ptr<
      grpc::ClientReader<v1alpha1::RecoverIdempotentMutationsResponse>>
      reader(stub->RecoverIdempotentMutations(&context, request));

  v1alpha1::RecoverIdempotentMutationsResponse response;
  v1alpha1::RecoverIdempotentMutationsResponse partial;

  while (reader->Read(&partial)) {
    response.MergeFrom(partial);
  }

  grpc::Status status = reader->Finish();
  ASSERT_TRUE(status.ok()) << status.error_message();

  // Expired UUIDv7 mutations should not be recovered.
  EXPECT_EQ(0, response.idempotent_mutations().size());
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, RecoverIdempotentMutationsMixedUuidVersions) {
  // Test that both UUIDv4 (non-expiring) and non-expired UUIDv7 keys are
  // recovered, while expired UUIDv7 keys are filtered out.
  const std::string state_type = "Greeter";
  const std::string state_ref = make_state_ref("test_mixed_uuids");

  // 1. UUIDv4 (non-expiring) - should always be recovered.
  const UUID uuidv4 = UUID::random();
  v1alpha1::IdempotentMutation mutation_v4;
  mutation_v4.set_state_type(state_type);
  mutation_v4.set_state_ref(state_ref);
  mutation_v4.set_key(uuidv4.toBytes());
  mutation_v4.set_response("uuidv4_response");
  store({}, {}, std::nullopt, std::move(mutation_v4));

  // 2. Non-expired UUIDv7 (1 hour in future) - should be recovered.
  const uint64_t future_timestamp_ms = now_ms() + (60 * 60 * 1000);
  const std::string non_expired_uuidv7 = make_uuidv7(future_timestamp_ms);
  v1alpha1::IdempotentMutation mutation_v7_future;
  mutation_v7_future.set_state_type(state_type);
  mutation_v7_future.set_state_ref(state_ref);
  mutation_v7_future.set_key(non_expired_uuidv7);
  mutation_v7_future.set_response("uuidv7_future_response");
  store({}, {}, std::nullopt, std::move(mutation_v7_future));

  // 3. Expired UUIDv7 (1 hour in past) - should NOT be recovered.
  const uint64_t past_timestamp_ms = now_ms() - (60 * 60 * 1000);
  const std::string expired_uuidv7 = make_uuidv7(past_timestamp_ms);
  v1alpha1::IdempotentMutation mutation_v7_past;
  mutation_v7_past.set_state_type(state_type);
  mutation_v7_past.set_state_ref(state_ref);
  mutation_v7_past.set_key(expired_uuidv7);
  mutation_v7_past.set_response("uuidv7_past_response");
  store({}, {}, std::nullopt, std::move(mutation_v7_past));

  // RecoverIdempotentMutations should return only v4 and non-expired v7.
  v1alpha1::RecoverIdempotentMutationsRequest request;
  request.set_state_type(state_type);
  request.set_state_ref(state_ref);

  grpc::ClientContext context;

  std::unique_ptr<
      grpc::ClientReader<v1alpha1::RecoverIdempotentMutationsResponse>>
      reader(stub->RecoverIdempotentMutations(&context, request));

  v1alpha1::RecoverIdempotentMutationsResponse response;
  v1alpha1::RecoverIdempotentMutationsResponse partial;

  while (reader->Read(&partial)) {
    response.MergeFrom(partial);
  }

  grpc::Status status = reader->Finish();
  ASSERT_TRUE(status.ok()) << status.error_message();

  // Should recover 2 mutations: UUIDv4 and non-expired UUIDv7.
  ASSERT_EQ(2, response.idempotent_mutations().size());

  // Collect the keys from the response.
  std::set<std::string> recovered_keys;
  for (const auto& mutation : response.idempotent_mutations()) {
    recovered_keys.insert(mutation.key());
  }

  // Verify UUIDv4 was recovered.
  EXPECT_TRUE(recovered_keys.count(uuidv4.toBytes()) > 0)
      << "UUIDv4 should be recovered";

  // Verify non-expired UUIDv7 was recovered.
  EXPECT_TRUE(recovered_keys.count(non_expired_uuidv7) > 0)
      << "Non-expired UUIDv7 should be recovered";

  // Verify expired UUIDv7 was NOT recovered.
  EXPECT_TRUE(recovered_keys.count(expired_uuidv7) == 0)
      << "Expired UUIDv7 should NOT be recovered";
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, RecoverIdempotentMutationsSpecificUuidV7Key) {
  // Test that we can recover a specific UUIDv7 key by its idempotency_key.
  const std::string state_type = "Greeter";
  const std::string state_ref = make_state_ref("test_specific_uuidv7");

  // Create a UUIDv7 with a timestamp 1 hour in the future.
  const uint64_t future_timestamp_ms = now_ms() + (60 * 60 * 1000);
  const std::string uuidv7 = make_uuidv7(future_timestamp_ms);

  v1alpha1::IdempotentMutation idempotent_mutation;
  idempotent_mutation.set_state_type(state_type);
  idempotent_mutation.set_state_ref(state_ref);
  idempotent_mutation.set_key(uuidv7);
  idempotent_mutation.set_response("specific_response");

  store({}, {}, std::nullopt, std::move(idempotent_mutation));

  // Recover with specific idempotency_key.
  v1alpha1::RecoverIdempotentMutationsRequest request;
  request.set_state_type(state_type);
  request.set_state_ref(state_ref);
  request.set_idempotency_key(uuidv7);

  grpc::ClientContext context;

  std::unique_ptr<
      grpc::ClientReader<v1alpha1::RecoverIdempotentMutationsResponse>>
      reader(stub->RecoverIdempotentMutations(&context, request));

  v1alpha1::RecoverIdempotentMutationsResponse response;
  v1alpha1::RecoverIdempotentMutationsResponse partial;

  while (reader->Read(&partial)) {
    response.MergeFrom(partial);
  }

  grpc::Status status = reader->Finish();
  ASSERT_TRUE(status.ok()) << status.error_message();

  ASSERT_EQ(1, response.idempotent_mutations().size());
  EXPECT_EQ(uuidv7, response.idempotent_mutations(0).key());
  EXPECT_EQ("specific_response", response.idempotent_mutations(0).response());
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, RecoverWorkflowIdempotentMutation) {
  // Test that a non-expiring idempotent mutation stored at the
  // workflow scope is recovered when querying by workflow ID.
  const std::string state_type = "Greeter";
  const std::string state_ref = make_state_ref("test_workflow");
  const UUID workflow_id = UUID::random();
  const UUID idempotency_key = UUID::random();

  v1alpha1::IdempotentMutation mutation;
  mutation.set_state_type(state_type);
  mutation.set_state_ref(state_ref);
  mutation.set_key(idempotency_key.toBytes());
  mutation.set_workflow_id(workflow_id.toBytes());
  mutation.set_response("workflow_response");
  store({}, {}, std::nullopt, std::move(mutation));

  // Recover with workflow scope.
  v1alpha1::RecoverIdempotentMutationsRequest request;
  request.set_state_type(state_type);
  request.set_state_ref(state_ref);
  request.set_workflow_id(workflow_id.toBytes());

  grpc::ClientContext context;
  std::unique_ptr<
      grpc::ClientReader<v1alpha1::RecoverIdempotentMutationsResponse>>
      reader(stub->RecoverIdempotentMutations(&context, request));

  v1alpha1::RecoverIdempotentMutationsResponse response;
  v1alpha1::RecoverIdempotentMutationsResponse partial;
  while (reader->Read(&partial)) {
    response.MergeFrom(partial);
  }
  grpc::Status status = reader->Finish();
  ASSERT_TRUE(status.ok()) << status.error_message();

  ASSERT_EQ(1, response.idempotent_mutations().size());
  EXPECT_EQ(idempotency_key.toBytes(), response.idempotent_mutations(0).key());
  EXPECT_EQ("workflow_response", response.idempotent_mutations(0).response());
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, RecoverWorkflowExpiringIdempotentMutation) {
  // Test that an expiring (UUIDv7) idempotent mutation stored at the
  // workflow scope is recovered when it has not yet expired.
  const std::string state_type = "Greeter";
  const std::string state_ref = make_state_ref("test_workflow_expiring");
  const UUID workflow_id = UUID::random();

  // Create a UUIDv7 1 hour in the future (not expired).
  const uint64_t future_ms = now_ms() + (60 * 60 * 1000);
  const std::string uuidv7 = make_uuidv7(future_ms);

  v1alpha1::IdempotentMutation mutation;
  mutation.set_state_type(state_type);
  mutation.set_state_ref(state_ref);
  mutation.set_key(uuidv7);
  mutation.set_workflow_id(workflow_id.toBytes());
  mutation.set_response("workflow_expiring_response");
  store({}, {}, std::nullopt, std::move(mutation));

  // Recover with workflow scope.
  v1alpha1::RecoverIdempotentMutationsRequest request;
  request.set_state_type(state_type);
  request.set_state_ref(state_ref);
  request.set_workflow_id(workflow_id.toBytes());

  grpc::ClientContext context;
  std::unique_ptr<
      grpc::ClientReader<v1alpha1::RecoverIdempotentMutationsResponse>>
      reader(stub->RecoverIdempotentMutations(&context, request));

  v1alpha1::RecoverIdempotentMutationsResponse response;
  v1alpha1::RecoverIdempotentMutationsResponse partial;
  while (reader->Read(&partial)) {
    response.MergeFrom(partial);
  }
  grpc::Status status = reader->Finish();
  ASSERT_TRUE(status.ok()) << status.error_message();

  ASSERT_EQ(1, response.idempotent_mutations().size());
  EXPECT_EQ(uuidv7, response.idempotent_mutations(0).key());
  EXPECT_EQ(
      "workflow_expiring_response",
      response.idempotent_mutations(0).response());
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, RecoverWorkflowExpiredIdempotentMutation) {
  // Test that an expired UUIDv7 idempotent mutation at the workflow
  // scope is NOT recovered.
  const std::string state_type = "Greeter";
  const std::string state_ref = make_state_ref("test_workflow_expired");
  const UUID workflow_id = UUID::random();

  // Create a UUIDv7 1 hour in the past (expired).
  const uint64_t past_ms = now_ms() - (60 * 60 * 1000);
  const std::string expired_uuidv7 = make_uuidv7(past_ms);

  v1alpha1::IdempotentMutation mutation;
  mutation.set_state_type(state_type);
  mutation.set_state_ref(state_ref);
  mutation.set_key(expired_uuidv7);
  mutation.set_workflow_id(workflow_id.toBytes());
  mutation.set_response("expired_workflow_response");
  store({}, {}, std::nullopt, std::move(mutation));

  // Recover with workflow scope.
  v1alpha1::RecoverIdempotentMutationsRequest request;
  request.set_state_type(state_type);
  request.set_state_ref(state_ref);
  request.set_workflow_id(workflow_id.toBytes());

  grpc::ClientContext context;
  std::unique_ptr<
      grpc::ClientReader<v1alpha1::RecoverIdempotentMutationsResponse>>
      reader(stub->RecoverIdempotentMutations(&context, request));

  v1alpha1::RecoverIdempotentMutationsResponse response;
  v1alpha1::RecoverIdempotentMutationsResponse partial;
  while (reader->Read(&partial)) {
    response.MergeFrom(partial);
  }
  grpc::Status status = reader->Finish();
  ASSERT_TRUE(status.ok()) << status.error_message();

  // Expired workflow-scoped mutation should not be recovered.
  EXPECT_EQ(0, response.idempotent_mutations().size());
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, RecoverWorkflowMixedExpiringIdempotentMutations) {
  // Test that workflow-scoped recovery returns non-expiring and
  // non-expired expiring mutations, but not expired ones.
  const std::string state_type = "Greeter";
  const std::string state_ref = make_state_ref("test_workflow_mixed");
  const UUID workflow_id = UUID::random();

  // 1. Non-expiring (UUIDv4).
  const UUID uuidv4 = UUID::random();
  v1alpha1::IdempotentMutation mutation_v4;
  mutation_v4.set_state_type(state_type);
  mutation_v4.set_state_ref(state_ref);
  mutation_v4.set_key(uuidv4.toBytes());
  mutation_v4.set_workflow_id(workflow_id.toBytes());
  mutation_v4.set_response("v4_response");
  store({}, {}, std::nullopt, std::move(mutation_v4));

  // 2. Non-expired UUIDv7 (1 hour in future).
  const uint64_t future_ms = now_ms() + (60 * 60 * 1000);
  const std::string future_uuidv7 = make_uuidv7(future_ms);
  v1alpha1::IdempotentMutation mutation_v7_future;
  mutation_v7_future.set_state_type(state_type);
  mutation_v7_future.set_state_ref(state_ref);
  mutation_v7_future.set_key(future_uuidv7);
  mutation_v7_future.set_workflow_id(workflow_id.toBytes());
  mutation_v7_future.set_response("v7_future_response");
  store({}, {}, std::nullopt, std::move(mutation_v7_future));

  // 3. Expired UUIDv7 (1 hour in past).
  const uint64_t past_ms = now_ms() - (60 * 60 * 1000);
  const std::string past_uuidv7 = make_uuidv7(past_ms);
  v1alpha1::IdempotentMutation mutation_v7_past;
  mutation_v7_past.set_state_type(state_type);
  mutation_v7_past.set_state_ref(state_ref);
  mutation_v7_past.set_key(past_uuidv7);
  mutation_v7_past.set_workflow_id(workflow_id.toBytes());
  mutation_v7_past.set_response("v7_past_response");
  store({}, {}, std::nullopt, std::move(mutation_v7_past));

  // Recover with workflow scope.
  v1alpha1::RecoverIdempotentMutationsRequest request;
  request.set_state_type(state_type);
  request.set_state_ref(state_ref);
  request.set_workflow_id(workflow_id.toBytes());

  grpc::ClientContext context;
  std::unique_ptr<
      grpc::ClientReader<v1alpha1::RecoverIdempotentMutationsResponse>>
      reader(stub->RecoverIdempotentMutations(&context, request));

  v1alpha1::RecoverIdempotentMutationsResponse response;
  v1alpha1::RecoverIdempotentMutationsResponse partial;
  while (reader->Read(&partial)) {
    response.MergeFrom(partial);
  }
  grpc::Status status = reader->Finish();
  ASSERT_TRUE(status.ok()) << status.error_message();

  // Should recover UUIDv4 and non-expired UUIDv7 only.
  ASSERT_EQ(2, response.idempotent_mutations().size());

  std::set<std::string> recovered_keys;
  for (const auto& m : response.idempotent_mutations()) {
    recovered_keys.insert(m.key());
  }

  EXPECT_TRUE(recovered_keys.count(uuidv4.toBytes()) > 0)
      << "UUIDv4 should be recovered";
  EXPECT_TRUE(recovered_keys.count(future_uuidv7) > 0)
      << "Non-expired UUIDv7 should be recovered";
  EXPECT_TRUE(recovered_keys.count(past_uuidv7) == 0)
      << "Expired UUIDv7 should NOT be recovered";
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, RecoverWorkflowIterationIdempotentMutation) {
  // Test that a non-expiring idempotent mutation stored at the
  // workflow-iteration scope is recovered correctly.
  const std::string state_type = "Greeter";
  const std::string state_ref = make_state_ref("test_workflow_iteration");
  const UUID workflow_id = UUID::random();
  const uint64_t iteration = 42;
  const UUID idempotency_key = UUID::random();

  v1alpha1::IdempotentMutation mutation;
  mutation.set_state_type(state_type);
  mutation.set_state_ref(state_ref);
  mutation.set_key(idempotency_key.toBytes());
  mutation.set_workflow_id(workflow_id.toBytes());
  mutation.set_workflow_iteration(iteration);
  mutation.set_response("iteration_response");
  store({}, {}, std::nullopt, std::move(mutation));

  // Recover with workflow + iteration scope.
  v1alpha1::RecoverIdempotentMutationsRequest request;
  request.set_state_type(state_type);
  request.set_state_ref(state_ref);
  request.set_workflow_id(workflow_id.toBytes());
  request.set_workflow_iteration(iteration);

  grpc::ClientContext context;
  std::unique_ptr<
      grpc::ClientReader<v1alpha1::RecoverIdempotentMutationsResponse>>
      reader(stub->RecoverIdempotentMutations(&context, request));

  v1alpha1::RecoverIdempotentMutationsResponse response;
  v1alpha1::RecoverIdempotentMutationsResponse partial;
  while (reader->Read(&partial)) {
    response.MergeFrom(partial);
  }
  grpc::Status status = reader->Finish();
  ASSERT_TRUE(status.ok()) << status.error_message();

  ASSERT_EQ(1, response.idempotent_mutations().size());
  EXPECT_EQ(idempotency_key.toBytes(), response.idempotent_mutations(0).key());
  EXPECT_EQ("iteration_response", response.idempotent_mutations(0).response());
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, RecoverWorkflowIterationIsolation) {
  // Test that iteration-scoped mutations are isolated per
  // iteration: recovering iteration 1 does not return mutations
  // stored for iteration 2.
  const std::string state_type = "Greeter";
  const std::string state_ref = make_state_ref("test_iteration_isolation");
  const UUID workflow_id = UUID::random();

  // Store mutation for iteration 1.
  const UUID key_iteration1 = UUID::random();
  v1alpha1::IdempotentMutation mutation1;
  mutation1.set_state_type(state_type);
  mutation1.set_state_ref(state_ref);
  mutation1.set_key(key_iteration1.toBytes());
  mutation1.set_workflow_id(workflow_id.toBytes());
  mutation1.set_workflow_iteration(1);
  mutation1.set_response("iteration1_response");
  store({}, {}, std::nullopt, std::move(mutation1));

  // Store mutation for iteration 2.
  const UUID key_iteration2 = UUID::random();
  v1alpha1::IdempotentMutation mutation2;
  mutation2.set_state_type(state_type);
  mutation2.set_state_ref(state_ref);
  mutation2.set_key(key_iteration2.toBytes());
  mutation2.set_workflow_id(workflow_id.toBytes());
  mutation2.set_workflow_iteration(2);
  mutation2.set_response("iteration2_response");
  store({}, {}, std::nullopt, std::move(mutation2));

  // Recover iteration 1 only.
  v1alpha1::RecoverIdempotentMutationsRequest request;
  request.set_state_type(state_type);
  request.set_state_ref(state_ref);
  request.set_workflow_id(workflow_id.toBytes());
  request.set_workflow_iteration(1);

  grpc::ClientContext context;
  std::unique_ptr<
      grpc::ClientReader<v1alpha1::RecoverIdempotentMutationsResponse>>
      reader(stub->RecoverIdempotentMutations(&context, request));

  v1alpha1::RecoverIdempotentMutationsResponse response;
  v1alpha1::RecoverIdempotentMutationsResponse partial;
  while (reader->Read(&partial)) {
    response.MergeFrom(partial);
  }
  grpc::Status status = reader->Finish();
  ASSERT_TRUE(status.ok()) << status.error_message();

  // Should only get iteration 1's mutation.
  ASSERT_EQ(1, response.idempotent_mutations().size());
  EXPECT_EQ(key_iteration1.toBytes(), response.idempotent_mutations(0).key());
  EXPECT_EQ("iteration1_response", response.idempotent_mutations(0).response());
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, RecoverNoTasks) {
  v1alpha1::RecoverResponse response = recover_all_shards();

  EXPECT_EQ(0, response.pending_tasks().size());
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, RecoverOneTask) {
  // Create a pending task.
  v1alpha1::Task task =
      MakeTask("Greeter", make_state_ref("actor_1234"), "task-uuid-1234");
  store({}, {task});

  // Recover() should return that task in pending_tasks.
  v1alpha1::RecoverResponse response = recover_all_shards();
  ASSERT_EQ(1, response.pending_tasks().size());
  EXPECT_EQ(
      task.task_id().task_uuid(),
      response.pending_tasks(0).task_id().task_uuid());

  // Mark that task as completed.
  task.set_status(v1alpha1::Task::COMPLETED);
  task.mutable_response()->PackFrom(MakeStringValue("hello world"));
  store({}, {task});

  // Recover() should no longer return that task in pending_tasks.
  response = recover_all_shards();
  EXPECT_EQ(0, response.pending_tasks().size());
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, RecoverMultipleTasks) {
  std::string state_ref = make_state_ref("actor_1234");
  std::string state_type = "Greeter";

  v1alpha1::Task pending_task = MakeTask(state_type, state_ref, "task-uuid-1");
  v1alpha1::Task pending_task_2 =
      MakeTask(state_type, state_ref, "task-uuid-2");
  v1alpha1::Task completed_task =
      MakeTask(state_type, state_ref, "task-uuid-3", v1alpha1::Task::COMPLETED);

  completed_task.mutable_response()->PackFrom(MakeStringValue("hello world"));

  v1alpha1::Task pending_task_different_actor =
      MakeTask(state_type, make_state_ref("actor_5678"), "task-uuid-4");
  v1alpha1::Task pending_task_different_state_type =
      MakeTask("Echo", make_state_ref("actor_7"), "task-uuid-5");

  store(
      {},
      {pending_task,
       pending_task_2,
       completed_task,
       pending_task_different_actor,
       pending_task_different_state_type});

  v1alpha1::RecoverResponse response = recover_all_shards();

  EXPECT_EQ(4, response.pending_tasks().size());
  std::vector<std::string> response_task_uuids;
  for (const v1alpha1::Task& task : response.pending_tasks()) {
    response_task_uuids.push_back(task.task_id().task_uuid());
  }
  EXPECT_THAT(
      response_task_uuids,
      testing::UnorderedElementsAre(
          pending_task.task_id().task_uuid(),
          pending_task_2.task_id().task_uuid(),
          pending_task_different_actor.task_id().task_uuid(),
          pending_task_different_state_type.task_id().task_uuid()));
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, RecoverTransactionsWithoutPrepared) {
  const std::string state_type = "Greeter";
  const std::string state_ref = make_state_ref("test_1234");

  const std::string coordinator_state_type = "some.Coordinator";
  const std::string coordinator_state_ref = make_state_ref("some_actor_1");

  v1alpha1::Actor actor;
  actor.set_state_type(state_type);
  actor.set_state_ref(state_ref);
  actor.set_state("hello world");

  v1alpha1::Transaction transaction;
  transaction.set_state_type(state_type);
  transaction.set_state_ref(state_ref);
  transaction.add_transaction_ids(UUID::random().toBytes());
  transaction.set_coordinator_state_type(coordinator_state_type);
  transaction.set_coordinator_state_ref(coordinator_state_ref);

  store({actor}, {}, std::move(transaction));

  restart_server();

  v1alpha1::RecoverResponse response = recover_all_shards();

  ASSERT_EQ(response.participant_transactions_size(), 1);

  const v1alpha1::Transaction& participant_transaction =
      response.participant_transactions(0);

  EXPECT_EQ(participant_transaction.state_type(), state_type);
  EXPECT_EQ(participant_transaction.state_ref(), state_ref);
  EXPECT_EQ(
      participant_transaction.coordinator_state_type(),
      coordinator_state_type);
  EXPECT_EQ(
      participant_transaction.coordinator_state_ref(),
      coordinator_state_ref);
  EXPECT_FALSE(participant_transaction.prepared());
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, RecoverTransactionsWithPrepared) {
  const std::string state_type = "Greeter";
  const std::string state_ref = make_state_ref("test_1234");

  const UUID transaction_id = UUID::random();

  const std::string coordinator_state_type = "some.Coordinator";
  const std::string coordinator_state_ref = make_state_ref("some_actor_1");

  v1alpha1::Actor actor;
  actor.set_state_type(state_type);
  actor.set_state_ref(state_ref);
  actor.set_state("hello world");

  v1alpha1::Transaction transaction;
  transaction.set_state_type(state_type);
  transaction.set_state_ref(state_ref);
  transaction.add_transaction_ids(transaction_id.toBytes());
  transaction.set_coordinator_state_type(coordinator_state_type);
  transaction.set_coordinator_state_ref(coordinator_state_ref);

  const std::string task_id = "task-uuid-1234";
  v1alpha1::Task task = MakeTask(state_type, state_ref, task_id);

  const UUID idempotent_mutation_id = UUID::random();
  v1alpha1::IdempotentMutation idempotent_mutation;
  idempotent_mutation.set_state_type(state_type);
  idempotent_mutation.set_state_ref(state_ref);
  idempotent_mutation.set_key(idempotent_mutation_id.toBytes());
  idempotent_mutation.set_response({});

  // All possible arguments to `Store` should be used in this call, as we
  // want to test that all of them can be recovered post-prepare.
  store(
      {actor},
      {task},
      std::move(transaction),
      std::move(idempotent_mutation));

  transaction_participant_prepare(
      stout::copy(state_type),
      stout::copy(state_ref));

  transaction_coordinator_prepared(
      transaction_id.toBytes(),
      std::string(coordinator_state_ref),  // coordinator's state_ref
      {{state_type, {state_ref}}});

  restart_server();

  v1alpha1::RecoverResponse response = recover_all_shards();

  ASSERT_EQ(response.participant_transactions_size(), 1);

  const v1alpha1::Transaction& participant_transaction =
      response.participant_transactions(0);

  EXPECT_EQ(participant_transaction.state_type(), state_type);
  EXPECT_EQ(participant_transaction.state_ref(), state_ref);
  EXPECT_EQ(
      participant_transaction.coordinator_state_type(),
      coordinator_state_type);
  EXPECT_EQ(
      participant_transaction.coordinator_state_ref(),
      coordinator_state_ref);
  EXPECT_TRUE(participant_transaction.prepared());
  ASSERT_EQ(participant_transaction.uncommitted_tasks_size(), 1);
  EXPECT_EQ(
      participant_transaction.uncommitted_tasks(0).task_id().task_uuid(),
      task_id);
  ASSERT_EQ(participant_transaction.uncommitted_idempotent_mutations_size(), 1);
  EXPECT_EQ(
      participant_transaction.uncommitted_idempotent_mutations(0).key(),
      idempotent_mutation_id.toBytes());

  EXPECT_EQ(response.prepared_transaction_coordinators_size(), 1);

  ASSERT_TRUE(response.prepared_transaction_coordinators().contains(
      transaction_id.toString()));

  const auto& participants = response.prepared_transaction_coordinators()
                                 .at(transaction_id.toString())
                                 .participants()
                                 .should_commit();

  EXPECT_EQ(participants.size(), 1);
  ASSERT_TRUE(participants.contains(state_type));

  EXPECT_THAT(
      participants.at(state_type).state_refs(),
      testing::UnorderedElementsAre(state_ref));
}

////////////////////////////////////////////////////////////////////////

// Note: There is additional coverage of colocated data in high level
// SortedMap tests.
TEST_F(TwoShardDatabaseTest, ColocatedRangeBasic) {
  std::vector<std::tuple<std::string, std::string>> empty{};
  auto full = std::vector{std::make_tuple(std::string("a/1"), std::string(""))};

  colocated_store("State", "a/1", {});

  EXPECT_EQ(colocated_range("State", "a", "", "", 128), full);
  EXPECT_EQ(colocated_range("State", "a", "1", "", 128), full);
  EXPECT_EQ(colocated_range("State", "a", "", "2", 128), full);

  EXPECT_EQ(colocated_range("State", "a", "", "", 0), empty);
  EXPECT_EQ(colocated_range("State", "a", "2", "", 128), empty);
  EXPECT_EQ(colocated_range("State", "b", "", "", 128), empty);
}

TEST_F(TwoShardDatabaseTest, ColocatedReverseRangeBasic) {
  std::vector<std::tuple<std::string, std::string>> empty{};
  auto full = std::vector{std::make_tuple(std::string("a/1"), std::string(""))};

  colocated_store("State", "a/1", {});

  EXPECT_EQ(colocated_reverse_range("State", "a", "", "", 128), full);
  EXPECT_EQ(colocated_reverse_range("State", "a", "1", "", 128), full);
  EXPECT_EQ(colocated_reverse_range("State", "a", "", "0", 128), full);
  EXPECT_EQ(colocated_reverse_range("State", "a", "2", "0", 128), full);

  EXPECT_EQ(colocated_reverse_range("State", "a", "", "", 0), empty);
  EXPECT_EQ(colocated_reverse_range("State", "a", "0", "", 128), empty);
  EXPECT_EQ(colocated_reverse_range("State", "b", "", "", 128), empty);
}

////////////////////////////////////////////////////////////////////////

std::string STATE_TYPE_NAME = "MyCoolStateType";
std::string STATE_TYPE_TAG = "ANYSWoW0wtzIdA";

TEST_F(TwoShardDatabaseTest, Find) {
  // Store some actors with different IDs to test `Find`.
  auto make_state_ref = [&](const std::string& id) {
    return STATE_TYPE_TAG + ":" + id;
  };
  std::vector<std::string> state_refs = {
      make_state_ref("actor-001"),
      make_state_ref("actor-002"),
      make_state_ref("actor-010"),
      make_state_ref("actor-100"),
      make_state_ref("actor-200"),
      make_state_ref("actor-a"),
      make_state_ref("actor-b"),
      make_state_ref("actor-c"),
  };

  // Store all actors.
  for (const auto& ref : state_refs) {
    v1alpha1::Actor actor;
    actor.set_state_type(STATE_TYPE_NAME);
    actor.set_state_ref(ref);
    actor.set_state("data-" + ref);
    store({actor}, {});
  }

  // Helper function to perform Find RPC.
  auto find = [this](
                  const std::optional<std::pair<std::string, bool>>& start_id,
                  const std::optional<std::pair<std::string, bool>>& until_id,
                  uint32_t limit,
                  const std::string& state_type_name = STATE_TYPE_NAME,
                  const std::string& state_type_tag = STATE_TYPE_TAG) {
    v1alpha1::FindRequest request;
    request.set_state_type(state_type_name);
    request.set_limit(limit);

    // Add all shard IDs to search all shards.
    for (int i = 0; i < num_shards_; i++) {
      char shard_id[16];
      CHECK(snprintf(shard_id, sizeof(shard_id), "s%09d", i) == 10);
      request.add_shard_ids(shard_id);
    }

    if (start_id.has_value()) {
      const std::string start_state_ref =
          state_type_tag + ":" + start_id->first;
      auto* start_key = request.mutable_start();
      start_key->set_state_ref(start_state_ref);
      start_key->set_exclusive(start_id->second);
    } else if (until_id.has_value()) {
      const std::string until_state_ref =
          state_type_tag + ":" + until_id->first;
      auto* until_key = request.mutable_until();
      until_key->set_state_ref(until_state_ref);
      until_key->set_exclusive(until_id->second);
    }

    v1alpha1::FindResponse response;
    grpc::ClientContext context;
    grpc::Status status = stub->Find(&context, request, &response);

    if (!status.ok()) {
      throw std::runtime_error(status.error_message());
    }

    return response.state_refs();
  };

  // Test 1: Forward pagination from beginning (empty ID).
  {
    auto result = find({{"", false}}, std::nullopt, 3);
    EXPECT_EQ(result.size(), 3);
    EXPECT_EQ(result[0], make_state_ref("actor-001"));
    EXPECT_EQ(result[1], make_state_ref("actor-002"));
    EXPECT_EQ(result[2], make_state_ref("actor-010"));
  }

  // Test 2: Forward pagination from a specific ID (inclusive).
  {
    auto result = find({{"actor-010", false}}, std::nullopt, 3);
    EXPECT_EQ(result.size(), 3);
    EXPECT_EQ(result[0], make_state_ref("actor-010"));
    EXPECT_EQ(result[1], make_state_ref("actor-100"));
    EXPECT_EQ(result[2], make_state_ref("actor-200"));
  }

  // Test 3: Forward pagination from a specific ID (exclusive).
  {
    auto result = find({{"actor-010", true}}, std::nullopt, 3);
    EXPECT_EQ(result.size(), 3);
    EXPECT_EQ(result[0], make_state_ref("actor-100"));
    EXPECT_EQ(result[1], make_state_ref("actor-200"));
    EXPECT_EQ(result[2], make_state_ref("actor-a"));
  }

  // Test 4: Backward pagination before a specific ID (exclusive).
  {
    auto result = find(std::nullopt, {{"actor-200", true}}, 3);
    EXPECT_EQ(result.size(), 3);
    EXPECT_EQ(result[0], make_state_ref("actor-002"));
    EXPECT_EQ(result[1], make_state_ref("actor-010"));
    EXPECT_EQ(result[2], make_state_ref("actor-100"));
  }

  // Test 5: Backward pagination before a specific ID (inclusive).
  {
    auto result = find(std::nullopt, {{"actor-200", false}}, 3);
    EXPECT_EQ(result.size(), 3);
    EXPECT_EQ(result[0], make_state_ref("actor-010"));
    EXPECT_EQ(result[1], make_state_ref("actor-100"));
    EXPECT_EQ(result[2], make_state_ref("actor-200"));
  }

  // Test 6: Forward pagination with limit 0.
  {
    auto result = find({{"", false}}, std::nullopt, 0);
    EXPECT_EQ(result.size(), 0);
  }

  // Test 7: Forward pagination from non-existent ID (should find next).
  {
    auto result = find({{"actor-005", false}}, std::nullopt, 2);
    EXPECT_EQ(result.size(), 2);
    EXPECT_EQ(result[0], make_state_ref("actor-010"));
    EXPECT_EQ(result[1], make_state_ref("actor-100"));
  }

  // Test 8: Unknown state type should return empty results.
  {
    auto result = find({{"", false}}, std::nullopt, 10, "UnknownType");
    EXPECT_EQ(result.size(), 0);
  }

  // Test 9: Forward pagination reaching end of data.
  {
    auto result = find({{"actor-b", false}}, std::nullopt, 10);
    EXPECT_EQ(result.size(), 2);
    EXPECT_EQ(result[0], make_state_ref("actor-b"));
    EXPECT_EQ(result[1], make_state_ref("actor-c"));
  }

  // Test 10: Backward pagination from the end.
  {
    auto result = find(std::nullopt, {{"actor-zzz", false}}, 3);
    EXPECT_EQ(result.size(), 3);
    EXPECT_EQ(result[0], make_state_ref("actor-a"));
    EXPECT_EQ(result[1], make_state_ref("actor-b"));
    EXPECT_EQ(result[2], make_state_ref("actor-c"));
  }
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, FindShardFiltering) {
  // Test that Find only returns state refs belonging to requested shards.

  // Generate actors for specific shards to test filtering.
  std::vector<std::string> shard0_refs = find_shard_actors(0, 3);
  std::vector<std::string> shard1_refs = find_shard_actors(1, 3);

  // Store actors in both shards.
  for (const auto& state_ref : shard0_refs) {
    v1alpha1::Actor actor;
    actor.set_state_type(STATE_TYPE_NAME);
    actor.set_state_ref(state_ref);
    actor.set_state("shard0-data");
    store({actor}, {});
  }

  for (const auto& state_ref : shard1_refs) {
    v1alpha1::Actor actor;
    actor.set_state_type(STATE_TYPE_NAME);
    actor.set_state_ref(state_ref);
    actor.set_state("shard1-data");
    store({actor}, {});
  }

  // Helper to find with specific shard IDs.
  auto find_with_shards =
      [this](const std::vector<std::string>& shard_ids, uint32_t limit = 100) {
        v1alpha1::FindRequest request;
        request.set_state_type(STATE_TYPE_NAME);
        request.set_limit(limit);

        for (const auto& shard_id : shard_ids) {
          request.add_shard_ids(shard_id);
        }

        auto* start_key = request.mutable_start();
        start_key->set_state_ref("");
        start_key->set_exclusive(false);

        v1alpha1::FindResponse response;
        grpc::ClientContext context;
        grpc::Status status = stub->Find(&context, request, &response);

        if (!status.ok()) {
          throw std::runtime_error(status.error_message());
        }

        return std::vector<std::string>(
            response.state_refs().begin(),
            response.state_refs().end());
      };

  // Test 1: Find only shard 0 actors.
  {
    auto result = find_with_shards({"s000000000"});
    EXPECT_EQ(result.size(), 3) << "Should find exactly 3 actors from shard 0";

    // Verify all returned state refs belong to shard 0.
    std::set<std::string> shard0_set(shard0_refs.begin(), shard0_refs.end());
    for (const auto& state_ref : result) {
      EXPECT_TRUE(shard0_set.count(state_ref) > 0)
          << "State ref " << state_ref << " should belong to shard 0";
    }
  }

  // Test 2: Find only shard 1 actors.
  {
    auto result = find_with_shards({"s000000001"});
    EXPECT_EQ(result.size(), 3) << "Should find exactly 3 actors from shard 1";

    // Verify all returned state refs belong to shard 1.
    std::set<std::string> shard1_set(shard1_refs.begin(), shard1_refs.end());
    for (const auto& state_ref : result) {
      EXPECT_TRUE(shard1_set.count(state_ref) > 0)
          << "State ref " << state_ref << " should belong to shard 1";
    }
  }

  // Test 3: Find actors from both shards.
  {
    auto result = find_with_shards({"s000000000", "s000000001"});
    EXPECT_EQ(result.size(), 6) << "Should find all 6 actors from both shards";
  }

  // Test 4: Verify empty shard_ids is rejected.
  {
    v1alpha1::FindRequest request;
    request.set_state_type(STATE_TYPE_NAME);
    request.set_limit(10);

    auto* start_key = request.mutable_start();
    start_key->set_state_ref("");
    start_key->set_exclusive(false);

    v1alpha1::FindResponse response;
    grpc::ClientContext context;
    grpc::Status status = stub->Find(&context, request, &response);

    EXPECT_EQ(status.error_code(), grpc::INVALID_ARGUMENT);
    EXPECT_THAT(
        status.error_message(),
        testing::HasSubstr("shard_ids are required"));
  }
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, FindLimit) {
  // Tests that filtered-out state refs are not counted against the limit.

  // Seed the database with actors in both shards.
  std::vector<std::string> shard0_refs = find_shard_actors(0, 10);
  std::vector<std::string> shard1_refs = find_shard_actors(1, 5);
  std::vector<std::string> all_refs;
  all_refs.insert(all_refs.end(), shard0_refs.begin(), shard0_refs.end());
  all_refs.insert(all_refs.end(), shard1_refs.begin(), shard1_refs.end());
  for (const auto& state_ref : all_refs) {
    v1alpha1::Actor actor;
    actor.set_state_type(STATE_TYPE_NAME);
    actor.set_state_ref(state_ref);
    actor.set_state("test-data");
    store({actor}, {});
  }

  // Request only from shard 0 with a limit that should be achievable if
  // filtering doesn't affect the count.
  v1alpha1::FindRequest request;
  request.set_state_type(STATE_TYPE_NAME);
  request.set_limit(5);  // 5 out of 10 actors should be achievable.
  request.add_shard_ids("s000000000");
  request.mutable_start();  // To set the `oneof`.

  v1alpha1::FindResponse response;
  grpc::ClientContext context;
  grpc::Status status = stub->Find(&context, request, &response);

  ASSERT_TRUE(status.ok()) << "Find should succeed: " << status.error_message();

  // Even though we very likely had to skip a few shard 1 actors, we still got 5
  // shard 0 actors back.
  EXPECT_EQ(response.state_refs().size(), 5)
      << "Should return exactly 5 state refs from shard 0, regardless of how "
      << "many shard 1 actors are encountered and filtered out during "
      << "iteration";

  // Verify all returned refs belong to shard 0.
  std::set<std::string> shard0_set(shard0_refs.begin(), shard0_refs.end());
  for (const auto& state_ref : response.state_refs()) {
    EXPECT_TRUE(shard0_set.count(state_ref) > 0)
        << "State ref " << state_ref << " should belong to shard 0";
  }
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, GetApplicationMetadataEmpty) {
  // Test that getting metadata when none exists returns empty response.
  auto response = get_application_metadata();
  EXPECT_FALSE(response.has_metadata());
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, StoreAndGetApplicationMetadata) {
  // Test storing and retrieving application metadata.
  v1alpha1::ApplicationMetadata metadata;

  // Create a simple file descriptor set for testing.
  google::protobuf::FileDescriptorSet file_descriptor_set;
  google::protobuf::FileDescriptorProto* file_descriptor =
      file_descriptor_set.add_file();
  file_descriptor->set_name("test.proto");
  file_descriptor->set_package("com.example.test");

  *metadata.mutable_file_descriptor_set() = file_descriptor_set;

  store_application_metadata(metadata);

  auto response = get_application_metadata();
  ASSERT_TRUE(response.has_metadata());
  EXPECT_TRUE(response.metadata().has_file_descriptor_set());
  EXPECT_EQ(response.metadata().file_descriptor_set().file_size(), 1);
  EXPECT_EQ(
      response.metadata().file_descriptor_set().file(0).name(),
      "test.proto");
  EXPECT_EQ(
      response.metadata().file_descriptor_set().file(0).package(),
      "com.example.test");


  // Restart the server. The same metadata should still be present.
  restart_server();

  response = get_application_metadata();
  ASSERT_TRUE(response.has_metadata());
  EXPECT_TRUE(response.metadata().has_file_descriptor_set());
  EXPECT_EQ(response.metadata().file_descriptor_set().file_size(), 1);
  EXPECT_EQ(
      response.metadata().file_descriptor_set().file(0).name(),
      "test.proto");
  EXPECT_EQ(
      response.metadata().file_descriptor_set().file(0).package(),
      "com.example.test");
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, UpdateApplicationMetadata) {
  // Test updating application metadata.
  v1alpha1::ApplicationMetadata metadata1;

  // Create initial file descriptor set.
  google::protobuf::FileDescriptorSet file_descriptor_set1;
  google::protobuf::FileDescriptorProto* file_descriptor1 =
      file_descriptor_set1.add_file();
  file_descriptor1->set_name("initial.proto");
  file_descriptor1->set_package("com.example.initial");
  *metadata1.mutable_file_descriptor_set() = file_descriptor_set1;

  store_application_metadata(metadata1);

  // Verify first metadata.
  auto response = get_application_metadata();
  ASSERT_TRUE(response.has_metadata());
  EXPECT_TRUE(response.metadata().has_file_descriptor_set());
  EXPECT_EQ(response.metadata().file_descriptor_set().file_size(), 1);
  EXPECT_EQ(
      response.metadata().file_descriptor_set().file(0).name(),
      "initial.proto");
  EXPECT_EQ(
      response.metadata().file_descriptor_set().file(0).package(),
      "com.example.initial");

  // Update with new metadata.
  v1alpha1::ApplicationMetadata metadata2;

  google::protobuf::FileDescriptorSet file_descriptor_set2;
  google::protobuf::FileDescriptorProto* file_descriptor2 =
      file_descriptor_set2.add_file();
  file_descriptor2->set_name("updated.proto");
  file_descriptor2->set_package("com.example.updated");
  *metadata2.mutable_file_descriptor_set() = file_descriptor_set2;

  store_application_metadata(metadata2);

  // Verify updated metadata.
  response = get_application_metadata();
  ASSERT_TRUE(response.has_metadata());
  EXPECT_TRUE(response.metadata().has_file_descriptor_set());
  EXPECT_EQ(response.metadata().file_descriptor_set().file_size(), 1);
  EXPECT_EQ(
      response.metadata().file_descriptor_set().file(0).name(),
      "updated.proto");
  EXPECT_EQ(
      response.metadata().file_descriptor_set().file(0).package(),
      "com.example.updated");
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, RecoverMultipleCalls) {
  // Test that calling Recover() multiple times doesn't crash. This is
  // particularly important when a single sidecar is shared by multiple
  // servers, which may recover independently.

  const std::string state_type = "Greeter";
  const std::string state_ref = make_state_ref("test_1234");
  const UUID transaction_id = UUID::random();

  v1alpha1::Actor actor;
  actor.set_state_type(state_type);
  actor.set_state_ref(state_ref);
  actor.set_state("hello world");

  v1alpha1::Transaction transaction;
  transaction.set_state_type(state_type);
  transaction.set_state_ref(state_ref);
  transaction.add_transaction_ids(transaction_id.toBytes());
  transaction.set_coordinator_state_type("some.Coordinator");
  auto coordinator_state_ref = make_state_ref("some_actor_1");
  transaction.set_coordinator_state_ref(coordinator_state_ref);

  v1alpha1::Task task = MakeTask(state_type, state_ref, "task-uuid-1234");

  const UUID idempotent_mutation_id = UUID::random();
  v1alpha1::IdempotentMutation idempotent_mutation;
  idempotent_mutation.set_state_type(state_type);
  idempotent_mutation.set_state_ref(state_ref);
  idempotent_mutation.set_key(idempotent_mutation_id.toBytes());
  idempotent_mutation.set_response({});

  store(
      {actor},
      {task},
      std::move(transaction),
      std::move(idempotent_mutation));

  transaction_participant_prepare(
      stout::copy(state_type),
      stout::copy(state_ref));

  transaction_coordinator_prepared(
      transaction_id.toBytes(),
      coordinator_state_ref,
      {{state_type, {state_ref}}});

  restart_server();

  // First Recover() call after restart - should work normally and find the
  // transaction.
  v1alpha1::RecoverResponse response1 = recover_all_shards();
  EXPECT_EQ(response1.participant_transactions_size(), 1);

  // Second Recover() call on the same restarted sidecar - should not crash.
  v1alpha1::RecoverResponse response2 = recover_all_shards();
  EXPECT_EQ(response2.participant_transactions_size(), 1);
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, RecoverMultipleCallsWithAbortedTransaction) {
  // Test that calling Recover() multiple times doesn't hang even when
  // transactions are aborted between `Recover()` calls.

  const std::string state_type = "Greeter";
  const std::string state_ref = make_state_ref("test_1234");
  const UUID transaction_id = UUID::random();

  v1alpha1::Actor actor;
  actor.set_state_type(state_type);
  actor.set_state_ref(state_ref);
  actor.set_state("hello world");

  v1alpha1::Transaction transaction;
  transaction.set_state_type(state_type);
  transaction.set_state_ref(state_ref);
  transaction.add_transaction_ids(transaction_id.toBytes());
  transaction.set_coordinator_state_type("some.Coordinator");
  transaction.set_coordinator_state_ref(make_state_ref("some_actor_1"));

  // Store and prepare the transaction.
  store({actor}, {}, std::move(transaction), std::nullopt);

  transaction_participant_prepare(
      stout::copy(state_type),
      stout::copy(state_ref));

  // First Recover() call - should find the prepared transaction.
  v1alpha1::RecoverResponse response1 = recover_all_shards();
  EXPECT_EQ(response1.participant_transactions_size(), 1);
  EXPECT_TRUE(response1.participant_transactions(0).prepared());

  // Abort the transaction so it's no longer prepared.
  transaction_participant_abort(
      stout::copy(state_type),
      stout::copy(state_ref));

  // Second Recover() call - should not hang in infinite loop.
  // The transaction should not be included since it's no longer prepared.
  v1alpha1::RecoverResponse response2 = recover_all_shards();
  EXPECT_EQ(response2.participant_transactions_size(), 0);
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, RecoverWithShardFiltering) {
  // This test verifies that when a shard is specified in RecoverRequest,
  // only data belonging to that shard is returned.

  // Find state refs that hash to different shards.
  std::vector<std::string> shard0_actors = find_shard_actors(0, 1);
  std::vector<std::string> shard1_actors = find_shard_actors(1, 1);
  std::string shard0_ref = shard0_actors[0];  // Shard ordinal 0 -> s000000000
  std::string shard1_ref = shard1_actors[0];  // Shard ordinal 1 -> s000000001

  // Create and store pending tasks for both shards.
  v1alpha1::Task task_shard0 =
      MakeTask("tests.StateType", shard0_ref, "task-1");
  v1alpha1::Task task_shard1 =
      MakeTask("tests.StateType", shard1_ref, "task-2");
  store({}, {task_shard0, task_shard1});

  // Create and store participant transactions for both shards.
  v1alpha1::Actor actor_shard0;
  actor_shard0.set_state_type("tests.StateType");
  actor_shard0.set_state_ref(shard0_ref);
  actor_shard0.set_state("shard0 data");

  v1alpha1::Transaction transaction_shard0;
  transaction_shard0.set_state_type("tests.StateType");
  transaction_shard0.set_state_ref(shard0_ref);
  transaction_shard0.add_transaction_ids(UUID::random().toBytes());
  transaction_shard0.set_coordinator_state_type("tests.Coordinator");
  transaction_shard0.set_coordinator_state_ref(make_state_ref("coordinator_1"));
  transaction_shard0.set_prepared(false);

  v1alpha1::Actor actor_shard1;
  actor_shard1.set_state_type("tests.StateType");
  actor_shard1.set_state_ref(shard1_ref);
  actor_shard1.set_state("shard1 data");

  v1alpha1::Transaction transaction_shard1;
  transaction_shard1.set_state_type("tests.StateType");
  transaction_shard1.set_state_ref(shard1_ref);
  transaction_shard1.add_transaction_ids(UUID::random().toBytes());
  transaction_shard1.set_coordinator_state_type("tests.Coordinator");
  transaction_shard1.set_coordinator_state_ref(make_state_ref("coordinator_2"));
  transaction_shard1.set_prepared(false);

  store({actor_shard0}, {}, std::move(transaction_shard0));
  store({actor_shard1}, {}, std::move(transaction_shard1));

  // Prepare the transactions so they appear in recovery.
  transaction_participant_prepare("tests.StateType", std::string(shard0_ref));
  transaction_participant_prepare("tests.StateType", std::string(shard1_ref));

  // Create and store idempotent mutations for both shards.
  v1alpha1::IdempotentMutation mutation_shard0;
  mutation_shard0.set_state_type("tests.StateType");
  mutation_shard0.set_state_ref(shard0_ref);
  mutation_shard0.set_key(UUID::random().toBytes());
  mutation_shard0.set_response("response1");

  v1alpha1::IdempotentMutation mutation_shard1;
  mutation_shard1.set_state_type("tests.StateType");
  mutation_shard1.set_state_ref(shard1_ref);
  mutation_shard1.set_key(UUID::random().toBytes());
  mutation_shard1.set_response("response2");

  store({}, {}, std::nullopt, std::move(mutation_shard0));
  store({}, {}, std::nullopt, std::move(mutation_shard1));

  // Create prepared coordinator transactions for each shard.
  // Coordinator transaction for shard0
  std::map<std::string, std::set<std::string>> participants1;
  participants1["tests.StateType"] = {shard0_ref};
  transaction_coordinator_prepared(
      UUID::random().toBytes(),
      std::string(shard0_ref),  // coordinator's state_ref determines shard
      std::move(participants1));

  // Coordinator transaction for shard1
  std::map<std::string, std::set<std::string>> participants2;
  participants2["tests.StateType"] = {shard1_ref};
  transaction_coordinator_prepared(
      UUID::random().toBytes(),
      std::string(shard1_ref),  // coordinator's state_ref determines shard
      std::move(participants2));

  // Test 1: Recover without shard filter - should fail.
  {
    v1alpha1::RecoverRequest request;
    // Don't set shard_id - this should fail now
    v1alpha1::RecoverResponse response;
    v1alpha1::RecoverResponse partial;

    grpc::ClientContext context;
    std::unique_ptr<grpc::ClientReader<v1alpha1::RecoverResponse>> reader(
        stub->Recover(&context, request));

    while (reader->Read(&partial)) {
      response.MergeFrom(partial);
    }

    grpc::Status status = reader->Finish();
    EXPECT_FALSE(status.ok());
    EXPECT_EQ(grpc::StatusCode::INVALID_ARGUMENT, status.error_code());
    EXPECT_THAT(
        status.error_message(),
        testing::HasSubstr("shard_ids are required"));
  }

  // Test 1b: Recover all shards - should return everything.
  {
    v1alpha1::RecoverResponse response = recover_all_shards();

    EXPECT_EQ(2, response.pending_tasks().size());
    EXPECT_EQ(2, response.participant_transactions().size());
    EXPECT_EQ(2, response.idempotent_mutations().size());
    // Now we have 2 coordinator transactions (one per shard)
    EXPECT_EQ(2, response.prepared_transaction_coordinators().size());
  }

  // Test 2: Recover with shard0 filter.
  {
    v1alpha1::RecoverRequest request;
    request.add_shard_ids("s000000000");

    v1alpha1::RecoverResponse response;
    v1alpha1::RecoverResponse partial;

    grpc::ClientContext context;
    std::unique_ptr<grpc::ClientReader<v1alpha1::RecoverResponse>> reader(
        stub->Recover(&context, request));

    while (reader->Read(&partial)) {
      response.MergeFrom(partial);
    }

    grpc::Status status = reader->Finish();
    EXPECT_TRUE(status.ok());

    // Verify pending_tasks are filtered.
    EXPECT_EQ(1, response.pending_tasks().size());
    EXPECT_EQ(shard0_ref, response.pending_tasks(0).task_id().state_ref());

    // Verify participant_transactions are filtered.
    EXPECT_EQ(1, response.participant_transactions().size());
    EXPECT_EQ(shard0_ref, response.participant_transactions(0).state_ref());

    // Verify idempotent_mutations are filtered.
    EXPECT_EQ(1, response.idempotent_mutations().size());
    EXPECT_EQ(shard0_ref, response.idempotent_mutations(0).state_ref());

    // Verify prepared_transaction_coordinators ARE filtered by shard.
    // Each shard only tracks coordinator transactions it owns.
    EXPECT_EQ(1, response.prepared_transaction_coordinators().size());
  }

  // Test 3: Recover with shard1 filter.
  {
    v1alpha1::RecoverRequest request;
    request.add_shard_ids("s000000001");

    v1alpha1::RecoverResponse response;
    v1alpha1::RecoverResponse partial;

    grpc::ClientContext context;
    std::unique_ptr<grpc::ClientReader<v1alpha1::RecoverResponse>> reader(
        stub->Recover(&context, request));

    while (reader->Read(&partial)) {
      response.MergeFrom(partial);
    }

    grpc::Status status = reader->Finish();
    EXPECT_TRUE(status.ok());

    // Verify pending_tasks are filtered.
    EXPECT_EQ(1, response.pending_tasks().size());
    EXPECT_EQ(shard1_ref, response.pending_tasks(0).task_id().state_ref());

    // Verify participant_transactions are filtered.
    EXPECT_EQ(1, response.participant_transactions().size());
    EXPECT_EQ(shard1_ref, response.participant_transactions(0).state_ref());

    // Verify idempotent_mutations are filtered.
    EXPECT_EQ(1, response.idempotent_mutations().size());
    EXPECT_EQ(shard1_ref, response.idempotent_mutations(0).state_ref());

    // Verify prepared_transaction_coordinators ARE filtered by shard.
    EXPECT_EQ(1, response.prepared_transaction_coordinators().size());
  }
}

////////////////////////////////////////////////////////////////////////

TEST_F(TwoShardDatabaseTest, ExportFiltersByShardIds) {
  // Store state in both shard 0 and shard 1.
  const std::string state_type = "TestType";
  std::vector<std::string> shard0_refs = find_shard_actors(0, 3);
  std::vector<std::string> shard1_refs = find_shard_actors(1, 3);
  for (const auto& state_ref : shard0_refs) {
    v1alpha1::Actor actor;
    actor.set_state_type(state_type);
    actor.set_state_ref(state_ref);
    actor.set_state("data_shard0");
    store({actor}, {});
  }
  for (const auto& state_ref : shard1_refs) {
    v1alpha1::Actor actor;
    actor.set_state_type(state_type);
    actor.set_state_ref(state_ref);
    actor.set_state("data_shard1");
    store({actor}, {});
  }

  // Test: Export with only shard 0.
  {
    v1alpha1::ExportRequest request;
    request.set_state_type(state_type);
    request.add_shard_ids("s000000000");

    v1alpha1::ExportResponse response;
    grpc::ClientContext context;
    grpc::Status status = stub->Export(&context, request, &response);
    ASSERT_TRUE(status.ok()) << status.error_message();

    // Verify we only got states from shard 0.
    EXPECT_EQ(shard0_refs.size(), response.items_size());
    std::set<std::string> exported_refs;
    for (const auto& item : response.items()) {
      ASSERT_TRUE(item.has_actor());
      EXPECT_EQ(state_type, item.actor().state_type());
      EXPECT_EQ("data_shard0", item.actor().state());
      exported_refs.insert(item.actor().state_ref());
    }

    // Verify only (and thus all) shard 0 refs were exported.
    for (const auto& expected_ref : shard0_refs) {
      EXPECT_TRUE(exported_refs.count(expected_ref) > 0)
          << "Missing state " << expected_ref << " in shard 0 export";
    }
  }

  // Test: Export with only shard 1.
  {
    v1alpha1::ExportRequest request;
    request.set_state_type(state_type);
    request.add_shard_ids("s000000001");  // Shard 1 ID.

    v1alpha1::ExportResponse response;
    grpc::ClientContext context;
    grpc::Status status = stub->Export(&context, request, &response);
    ASSERT_TRUE(status.ok()) << status.error_message();

    // Verify we only got states from shard 1.
    EXPECT_EQ(shard1_refs.size(), response.items_size());
    std::set<std::string> exported_refs;
    for (const auto& item : response.items()) {
      ASSERT_TRUE(item.has_actor());
      EXPECT_EQ(state_type, item.actor().state_type());
      EXPECT_EQ("data_shard1", item.actor().state());
      exported_refs.insert(item.actor().state_ref());
    }

    // Verify only (and thus all) shard 1 refs were exported.
    for (const auto& expected_ref : shard1_refs) {
      EXPECT_TRUE(exported_refs.count(expected_ref) > 0)
          << "Missing state " << expected_ref << " in shard 1 export";
    }
  }

  // Test: Export with both shards should return all states.
  {
    v1alpha1::ExportRequest request;
    request.set_state_type(state_type);
    request.add_shard_ids("s000000000");
    request.add_shard_ids("s000000001");

    v1alpha1::ExportResponse response;
    grpc::ClientContext context;
    grpc::Status status = stub->Export(&context, request, &response);
    ASSERT_TRUE(status.ok()) << status.error_message();

    // Should get all states from both shards.
    EXPECT_EQ(shard0_refs.size() + shard1_refs.size(), response.items_size());
    std::set<std::string> exported_refs;
    for (const auto& item : response.items()) {
      ASSERT_TRUE(item.has_actor());
      exported_refs.insert(item.actor().state_ref());
    }

    // Verify all refs from both shards were exported.
    for (const auto& expected_ref : shard0_refs) {
      EXPECT_TRUE(exported_refs.count(expected_ref) > 0)
          << "Missing state " << expected_ref << " in full export";
    }
    for (const auto& expected_ref : shard1_refs) {
      EXPECT_TRUE(exported_refs.count(expected_ref) > 0)
          << "Missing state " << expected_ref << " in full export";
    }
  }

  // Test: Export without shard_ids should fail.
  {
    v1alpha1::ExportRequest request;
    request.set_state_type(state_type);
    // Intentionally not setting any shard_ids.

    v1alpha1::ExportResponse response;
    grpc::ClientContext context;
    grpc::Status status = stub->Export(&context, request, &response);

    EXPECT_FALSE(status.ok());
    EXPECT_EQ(grpc::StatusCode::INVALID_ARGUMENT, status.error_code());
    EXPECT_THAT(
        status.error_message(),
        testing::HasSubstr("shard_ids are required"));
  }
}


////////////////////////////////////////////////////////////////////////

// Test class that starts with legacy single shard configuration and can be
// upgraded to modern multi-shard configuration to test backwards
// compatibility.
class LegacyToModernDatabaseTest : public DatabaseTest {
 public:
  LegacyToModernDatabaseTest()
    : DatabaseTest(1) {}  // Starts as single-shard, can upgrade to multi-shard.

 protected:
  void SetUp() override {
    DatabaseTest::SetUp();
    // Start with legacy server by default to test backwards compatibility.
    init_legacy_server();
  }

  // Helper to prepare a coordinator transaction using legacy format.
  void transaction_coordinator_prepared_legacy(const UUID& transaction_id) {
    v1alpha1::TransactionCoordinatorPreparedRequest request;
    request.set_transaction_id(transaction_id.toBytes());

    // Use the deprecated participants field (legacy format).
    std::set<std::string> actors = {
        make_state_ref("actor_1"),
        make_state_ref("actor_2")};
    (*request.mutable_participants()->mutable_should_commit())["some.Service"]
        .mutable_state_refs()
        ->Assign(actors.begin(), actors.end());

    v1alpha1::TransactionCoordinatorPreparedResponse response;
    grpc::ClientContext context;

    grpc::Status status =
        stub->TransactionCoordinatorPrepared(&context, request, &response);

    CHECK(status.ok()) << status.error_message();
  }

  // Helper to prepare a coordinator transaction using modern format.
  void transaction_coordinator_prepared_modern(
      const UUID& transaction_id,
      const std::string& coordinator_state_ref) {
    v1alpha1::TransactionCoordinatorPreparedRequest request;
    request.set_transaction_id(transaction_id.toBytes());

    // Use the new transaction_coordinator field (modern format).
    v1alpha1::PreparedTransactionCoordinator* coordinator =
        request.mutable_prepared_transaction_coordinator();
    coordinator->set_state_ref(coordinator_state_ref);

    std::set<std::string> actors = {
        make_state_ref("actor_3"),
        make_state_ref("actor_4")};
    (*coordinator->mutable_participants()
          ->mutable_should_commit())["some.Service"]
        .mutable_state_refs()
        ->Assign(actors.begin(), actors.end());

    v1alpha1::TransactionCoordinatorPreparedResponse response;
    grpc::ClientContext context;

    grpc::Status status =
        stub->TransactionCoordinatorPrepared(&context, request, &response);

    CHECK(status.ok()) << status.error_message();
  }

  // Initialize server with legacy single shard (cloud-shard-0) format.
  void init_legacy_server() {
    v1alpha1::ServerInfo legacy_server_info;

    // Create legacy single shard with the old "cloud-shard-0" ID.
    v1alpha1::ShardInfo* shard = legacy_server_info.add_shard_infos();
    shard->set_shard_id("cloud-shard-0");
    shard->set_shard_first_key("");

    stub.reset();
    channel.reset();
    server.reset();

    // Clean up existing database directory to start fresh.
    if (std::filesystem::exists(state_directory)) {
      std::filesystem::remove_all(state_directory);
    }

    auto instantiate =
        DatabaseServer::Instantiate(state_directory, legacy_server_info);

    CHECK(instantiate) << instantiate.error();
    server = std::move(instantiate.value());

    // Some tests will intentionally use the legacy format of the
    // `TransactionCoordinatorPrepared` call; that's normally forbidden, but in
    // this case necessary to set up a scenario to test backwards compatibility.
    TestOnly_EnableLegacyCoordinatorPrepared(server->TestOnly_GetService());

    channel = server->InProcessChannel(grpc::ChannelArguments());
    stub = rbt::v1alpha1::Database::NewStub(channel);
  }

  // Restart server with modern multi-shard format (2^14 shards like
  // production).
  void restart_as_modern() {
    const int NUM_SHARDS = 16384;  // 2^14 = 16,384 shards, same as production.

    // Update the parent class's num_shards_ to match the new shard count.
    num_shards_ = NUM_SHARDS;

    v1alpha1::ServerInfo modern_server_info;

    // Create shards using the same logic as production code in shards.py.
    for (int i = 0; i < NUM_SHARDS; i++) {
      v1alpha1::ShardInfo* shard = modern_server_info.add_shard_infos();

      // Generate shard ID using same format as `make_shard_id()` - "s" +
      // 9-digit zero-padded index.
      char shard_id[11];  // "s" + 9 digits + null terminator.
      CHECK(snprintf(shard_id, sizeof(shard_id), "s%09d", i) == 10);
      shard->set_shard_id(shard_id);

      if (i == 0) {
        // First shard always starts at empty key (same as production).
        shard->set_shard_first_key("");
      } else {
        // Divide 256^2 keyspace into NUM_SHARDS equal ranges.
        // Using 2-byte keys since 256^1 < 16384 < 256^2.
        int key_length = 2;
        int total_keys = 256 * 256;  // 256^2.
        int chunk_size = total_keys / NUM_SHARDS;
        int key_int = i * chunk_size;

        // Encode as big-endian 2-byte key.
        unsigned char key_bytes[2];
        key_bytes[0] = (key_int >> 8) & 0xFF;  // High byte.
        key_bytes[1] = key_int & 0xFF;  // Low byte.
        shard->set_shard_first_key(
            std::string(reinterpret_cast<char*>(key_bytes), key_length));
      }
    }

    stub.reset();
    channel.reset();
    server.reset();

    auto instantiate =
        DatabaseServer::Instantiate(state_directory, modern_server_info);

    CHECK(instantiate) << instantiate.error();
    server = std::move(instantiate.value());

    // Some tests will intentionally use the legacy format of the
    // `TransactionCoordinatorPrepared` call; that's normally forbidden, but
    // in this case necessary to set up a scenario to test backwards
    // compatibility.
    TestOnly_EnableLegacyCoordinatorPrepared(server->TestOnly_GetService());

    channel = server->InProcessChannel(grpc::ChannelArguments());
    stub = rbt::v1alpha1::Database::NewStub(channel);
  }

  // Store an idempotent mutation.
  void store_idempotent_mutation(
      const std::string& state_type,
      const std::string& state_ref,
      const std::string& key,
      const std::string& response) {
    v1alpha1::StoreRequest request;

    v1alpha1::IdempotentMutation* mutation =
        request.mutable_idempotent_mutation();
    mutation->set_state_type(state_type);
    mutation->set_state_ref(state_ref);
    mutation->set_key(key);
    mutation->set_response(response);

    v1alpha1::StoreResponse store_response;
    grpc::ClientContext context;

    grpc::Status status = stub->Store(&context, request, &store_response);
    CHECK(status.ok()) << status.error_message();
  }
};

////////////////////////////////////////////////////////////////////////

TEST_F(LegacyToModernDatabaseTest, BackwardsCompatibilityWithLegacyFormat) {
  // Test that both legacy (anonymous) and modern (shard-aware) coordinator
  // prepared transactions are correctly recovered.

  const UUID legacy_transaction_id = UUID::random();
  const UUID modern_transaction_id = UUID::random();
  const std::string coordinator_state_ref = make_state_ref("coordinator_1");

  // Store a legacy format prepared transaction.
  transaction_coordinator_prepared_legacy(legacy_transaction_id);

  // Restart with modern format database.
  restart_as_modern();

  // Store a modern format prepared transaction.
  transaction_coordinator_prepared_modern(
      modern_transaction_id,
      coordinator_state_ref);

  // Test 1: Recover both legacy and modern format transactions.
  {
    v1alpha1::RecoverResponse response = recover_all_shards();

    ASSERT_EQ(2, response.prepared_transaction_coordinators().size());

    // Both transaction IDs should be present.
    std::set<std::string> transaction_ids;
    for (const auto& [tid, participants] :
         response.prepared_transaction_coordinators()) {
      transaction_ids.insert(tid);
    }

    EXPECT_TRUE(transaction_ids.count(legacy_transaction_id.toString()) > 0)
        << "Legacy transaction not found in recovery";
    EXPECT_TRUE(transaction_ids.count(modern_transaction_id.toString()) > 0)
        << "Modern transaction not found in recovery";
  }

  // Test 2: Clean up one transaction and verify the other remains.
  transaction_coordinator_cleanup(legacy_transaction_id, "");

  {
    v1alpha1::RecoverResponse response = recover_all_shards();

    ASSERT_EQ(1, response.prepared_transaction_coordinators().size());
    EXPECT_TRUE(
        response.prepared_transaction_coordinators().count(
            modern_transaction_id.toString())
        > 0)
        << "Modern transaction should still be present after legacy cleanup";
  }

  // Test 4: Clean up the modern transaction too.
  transaction_coordinator_cleanup(modern_transaction_id, coordinator_state_ref);

  {
    v1alpha1::RecoverResponse response = recover_all_shards();

    EXPECT_EQ(0, response.prepared_transaction_coordinators().size())
        << "No transactions should remain after cleanup";
  }
}

////////////////////////////////////////////////////////////////////////

TEST_F(
    LegacyToModernDatabaseTest,
    LegacyTransactionsOnlyRecoveredByFirstShard) {
  // Test that legacy (anonymous) coordinator transactions are only recovered
  // when the first shard is being recovered, not other shards.

  const UUID legacy_transaction_id = UUID::random();

  // Store a legacy format prepared transaction.
  transaction_coordinator_prepared_legacy(legacy_transaction_id);

  // Restart with modern format database.
  restart_as_modern();

  // Test 1: Recovery from first shard should include legacy transaction.
  {
    v1alpha1::RecoverResponse response = recover("s000000000");  // First shard.

    // Should recover the legacy transaction.
    ASSERT_EQ(1, response.prepared_transaction_coordinators().size());

    std::set<std::string> transaction_ids;
    for (const auto& [tid, participants] :
         response.prepared_transaction_coordinators()) {
      transaction_ids.insert(tid);
    }

    EXPECT_TRUE(transaction_ids.count(legacy_transaction_id.toString()) > 0)
        << "Legacy transaction should be recovered by first shard";
  }

  // Test 2: Recovery from second shard should skip legacy transaction.
  {
    v1alpha1::RecoverResponse response =
        recover("s000000001");  // Second shard.

    // Should recover no transactions.
    EXPECT_EQ(0, response.prepared_transaction_coordinators().size())
        << "Second shard should not recover any transactions in this test";
  }
}

////////////////////////////////////////////////////////////////////////

TEST_F(LegacyToModernDatabaseTest, BackwardsCompatibilitySingleShardMigration) {
  // Test the backwards compatibility code in sidecar.cc lines 528-536. This
  // test verifies that a database created with legacy single shard format
  // (cloud-shard-0) can be successfully migrated to the new single-shard
  // format.

  const std::string state_type = "TestService";
  const std::string state_ref = make_state_ref("test_actor");
  const std::string mutation_key = UUID::random().toBytes();
  const std::string mutation_response = "mutation_response_data";

  // Step 1: Store an idempotent mutation in the legacy format.
  store_idempotent_mutation(
      state_type,
      state_ref,
      mutation_key,
      mutation_response);

  // Step 2: Restart with modern single-shard format that triggers migration.
  // This should trigger the backwards compatibility migration code.
  restart_as_modern();

  // Step 3: Verify that the migration succeeded by recovering data.
  v1alpha1::RecoverResponse response = recover_all_shards();

  // The idempotent mutation should be recovered after the format change.
  ASSERT_EQ(1, response.idempotent_mutations().size());

  const v1alpha1::IdempotentMutation& recovered_mutation =
      response.idempotent_mutations(0);

  EXPECT_EQ(state_type, recovered_mutation.state_type());
  EXPECT_EQ(state_ref, recovered_mutation.state_ref());
  EXPECT_EQ(mutation_key, recovered_mutation.key());
  EXPECT_EQ(mutation_response, recovered_mutation.response());
}

TEST_F(
    LegacyToModernDatabaseTest,
    IdempotentMutationRecoveryAfterFormatChange) {
  // Test that an idempotent mutation written before the format change
  // is still correctly recovered by a single server after the format change.

  const std::string state_type = "PaymentService";
  const std::string state_ref = make_state_ref("payment_actor_456");
  const std::string mutation_key1 = UUID::random().toBytes();
  const std::string mutation_response1 = "payment_processed_successfully";
  const std::string mutation_key2 = UUID::random().toBytes();
  const std::string mutation_response2 = "refund_processed_successfully";

  // Step 1: Store multiple idempotent mutations in the legacy format.
  store_idempotent_mutation(
      state_type,
      state_ref,
      mutation_key1,
      mutation_response1);
  store_idempotent_mutation(
      state_type,
      state_ref,
      mutation_key2,
      mutation_response2);

  // Step 2: Restart with modern single-shard format that triggers migration.
  // This triggers the backwards compatibility migration.
  restart_as_modern();

  // Step 3: Verify that a single server can recover all mutations
  // after the format change.
  v1alpha1::RecoverResponse response = recover_all_shards();

  // Both idempotent mutations should be recovered.
  ASSERT_EQ(2, response.idempotent_mutations().size());

  // Verify mutations are correctly recovered (order may vary).
  std::set<std::string> recovered_keys;
  std::set<std::string> recovered_responses;

  for (const auto& mutation : response.idempotent_mutations()) {
    EXPECT_EQ(state_type, mutation.state_type());
    EXPECT_EQ(state_ref, mutation.state_ref());
    recovered_keys.insert(mutation.key());
    recovered_responses.insert(mutation.response());
  }

  EXPECT_TRUE(recovered_keys.count(mutation_key1) > 0);
  EXPECT_TRUE(recovered_keys.count(mutation_key2) > 0);
  EXPECT_TRUE(recovered_responses.count(mutation_response1) > 0);
  EXPECT_TRUE(recovered_responses.count(mutation_response2) > 0);
}


////////////////////////////////////////////////////////////////////////

// Test class with many shards to verify scalability.
class ManyShardDatabaseTest : public DatabaseTest {
 public:
  ManyShardDatabaseTest() : DatabaseTest(16384) {}  // 2^14 = 16,384 shards.

 protected:
  void SetUp() override {
    DatabaseTest::SetUp();
    restart_server();
  }
};

TEST_F(ManyShardDatabaseTest, BasicRecoverWithManyShards) {
  // Test that we can start a sidecar with 2^14 shards and do basic recovery.
  // This verifies that the system can handle large shard counts.

  v1alpha1::RecoverResponse response = recover_all_shards();

  // Should start with no data
  EXPECT_EQ(0, response.pending_tasks().size());
  EXPECT_EQ(0, response.participant_transactions().size());
  EXPECT_EQ(0, response.prepared_transaction_coordinators().size());
  EXPECT_EQ(0, response.idempotent_mutations().size());
}

////////////////////////////////////////////////////////////////////////

}  // namespace
}  // namespace rbt::server

////////////////////////////////////////////////////////////////////////
