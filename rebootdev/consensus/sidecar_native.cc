#include "rebootdev/consensus/sidecar.h"

////////////////////////////////////////////////////////////////////////

using rbt::consensus::SidecarServer;
using rbt::v1alpha1::ConsensusInfo;
using rbt::v1alpha1::ShardInfo;

////////////////////////////////////////////////////////////////////////

extern "C" {

SidecarServer* sidecar_server_create(
    const char* db_path,
    const char* consensus_info_proto) {
  std::string db_path_str(db_path);
  std::string consensus_info_proto_str(consensus_info_proto);
  ConsensusInfo consensus_info;
  CHECK(consensus_info.ParseFromString(
      consensus_info_proto_str));
  static std::once_flag* initialize = new std::once_flag();
  std::call_once(
      *initialize,
      []() {
        // Initialize Google's logging library.
        //
        // NOTE: we output to stderr by default!
        FLAGS_logtostderr = 1;
        google::InitGoogleLogging("reboot-sidecar");
      });

  tl::expected<std::unique_ptr<SidecarServer>, std::string> instantiate =
      SidecarServer::Instantiate(db_path_str, consensus_info);

  CHECK(instantiate) << instantiate.error();

  // Take ownership out of the unique pointer.
  return instantiate.value().release();
}

const char* sidecar_server_address(const SidecarServer* ss) {
  return ss->address().c_str();
}

void sidecar_server_shutdown(SidecarServer* ss) {
  ss->Shutdown();
}

void sidecar_server_wait(SidecarServer* ss) {
  ss->Wait();
}

void sidecar_server_destroy(SidecarServer* ss) {
  delete ss;
}
}

////////////////////////////////////////////////////////////////////////
