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
#include "rbt/v1alpha1/sidecar.grpc.pb.h"
#include "rbt/v1alpha1/tasks.pb.h"
#include "rebootdev/settings.h"
#include "stout/borrowable.h"
#include "tl/expected.hpp"

////////////////////////////////////////////////////////////////////////

namespace rbt::consensus {

////////////////////////////////////////////////////////////////////////

// A helper function to answer the question "are we logging the given verbosity
// level?".
inline bool RebootSidecarLogLevelEnabled(int verbosity) {
  // Reboot's logging is enabled for `verbosity` if the value of the
  // `REBOOT_SIDECAR_LOG_VERBOSITY` environment variable is higher than or
  // equal to `verbosity`. If unset, the default `...LOG_VERBOSITY` is 0 (i.e.,
  // no logging).
  static const char* variable = std::getenv("REBOOT_SIDECAR_LOG_VERBOSITY");
  static int chosen_verbosity = variable != nullptr ? atoi(variable) : 0;
  return chosen_verbosity >= verbosity;
}

#define REBOOT_SIDECAR_LOG(level) \
  LOG_IF(INFO, RebootSidecarLogLevelEnabled(level))

////////////////////////////////////////////////////////////////////////

// NOTE: there are two distinct "sidecar" types: 'SidecarService' and
// 'SidecarServer'.
//
// 'SidecarService' is the actual implementation of the gRPC service.
//
// 'SidecarServer' is the combination of both the instantiated
// 'SidecarService' and a gRPC server.

////////////////////////////////////////////////////////////////////////

// Abstraction for encapsulating and running a sidecar including the
// necessary gRPC server.
class SidecarServer final {
 public:
  static tl::expected<std::unique_ptr<SidecarServer>, std::string> Instantiate(
      const std::filesystem::path& db_path,
      const rbt::v1alpha1::ConsensusInfo& consensus_info,
      std::string address = "127.0.0.1:0");

  ~SidecarServer() {
    Shutdown();
    Wait();
  }

  void Shutdown() {
    if (server_) {
      REBOOT_SIDECAR_LOG(1)
          << "Shutting down sidecar gRPC server at " << address_;
      server_->Shutdown();
    }
  }

  void Wait() {
    if (server_) {
      REBOOT_SIDECAR_LOG(1)
          << "Waiting for sidecar gRPC server at " << address_;
      server_->Wait();
      REBOOT_SIDECAR_LOG(1)
          << "Waited for sidecar gRPC server at " << address_;
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

 private:
  SidecarServer(
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

} // namespace rbt::consensus

////////////////////////////////////////////////////////////////////////
