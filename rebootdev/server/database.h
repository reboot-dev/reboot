#pragma once

#include <google/protobuf/descriptor.pb.h>
#include <google/protobuf/repeated_field.h>

#include <filesystem>
#include <string>

#include "glog/logging.h"
#include "grpcpp/channel.h"
#include "grpcpp/create_channel.h"
#include "grpcpp/security/credentials.h"
#include "grpcpp/server.h"
#include "grpcpp/support/channel_arguments.h"
#include "rbt/v1alpha1/database.grpc.pb.h"
#include "rbt/v1alpha1/tasks.pb.h"
#include "rebootdev/settings.h"
#include "stout/borrowable.h"
#include "tl/expected.hpp"

////////////////////////////////////////////////////////////////////////

namespace rbt::server {

////////////////////////////////////////////////////////////////////////

// A helper function to answer the question "are we logging the given verbosity
// level?".
inline bool RebootDatabaseLogLevelEnabled(int verbosity) {
  // Reboot's logging is enabled for `verbosity` if the value of the
  // `REBOOT_DATABASE_LOG_VERBOSITY` environment variable is higher than or
  // equal to `verbosity`. If unset, the default `...LOG_VERBOSITY` is 0 (i.e.,
  // no logging).
  static const char* variable = std::getenv("REBOOT_DATABASE_LOG_VERBOSITY");
  static int chosen_verbosity = variable != nullptr ? atoi(variable) : 0;
  return chosen_verbosity >= verbosity;
}

#define REBOOT_DATABASE_LOG(level)                                             \
  LOG_IF(INFO, RebootDatabaseLogLevelEnabled(level))

////////////////////////////////////////////////////////////////////////

// NOTE: there are two distinct "database" types: 'DatabaseService' and
// 'DatabaseServer'.
//
// 'DatabaseService' is the actual implementation of the gRPC service.
//
// 'DatabaseServer' is the combination of both the instantiated
// 'DatabaseService' and a gRPC server.

////////////////////////////////////////////////////////////////////////

// Abstraction for encapsulating and running a database including the
// necessary gRPC server.
class DatabaseServer final {
 public:
  static tl::expected<std::unique_ptr<DatabaseServer>, std::string> Instantiate(
      const std::filesystem::path& state_directory,
      const rbt::v1alpha1::ServerInfo& server_info,
      std::string address = "127.0.0.1:0");

  ~DatabaseServer() {
    Shutdown();
    Wait();
  }

  void Shutdown() {
    if (server_) {
      REBOOT_DATABASE_LOG(1)
          << "Shutting down database gRPC server at " << address_;
      server_->Shutdown();
    }
  }

  void Wait() {
    if (server_) {
      REBOOT_DATABASE_LOG(1)
          << "Waiting for database gRPC server at " << address_;
      server_->Wait();
      REBOOT_DATABASE_LOG(1)
          << "Waited for database gRPC server at " << address_;
      server_.reset();
      service_.reset();
    }
  }

  auto InProcessChannel(const grpc::ChannelArguments& arguments) {
    return server_->InProcessChannel(arguments);
  }

  const std::string& address() const {
    return address_;
  }

  // Get the underlying service for testing purposes. This should only be used
  // in tests.
  grpc::Service* TestOnly_GetService() {
    return service_.get();
  }

 private:
  DatabaseServer(
      std::unique_ptr<grpc::Service>&& service,
      std::unique_ptr<grpc::Server>&& server,
      const std::string& address)
    : service_(std::move(service)),
      server_(std::move(server)),
      address_(address) {}

  std::unique_ptr<grpc::Service> service_;
  std::unique_ptr<grpc::Server> server_;
  const std::string address_;
};

////////////////////////////////////////////////////////////////////////

// Function to enable legacy coordinator prepared format for testing.
// This should only be used in tests.
void TestOnly_EnableLegacyCoordinatorPrepared(grpc::Service* service);

////////////////////////////////////////////////////////////////////////

}  // namespace rbt::server

////////////////////////////////////////////////////////////////////////
