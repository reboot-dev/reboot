#include <condition_variable>
#include <csignal>
#include <fstream>
#include <iostream>
#include <mutex>
#include <thread>

#include "rebootdev/server/database.h"

////////////////////////////////////////////////////////////////////////

using rbt::server::DatabaseServer;
using rbt::v1alpha1::ServerInfo;
using rbt::v1alpha1::ShardInfo;

////////////////////////////////////////////////////////////////////////

extern "C" {

DatabaseServer* database_server_create(
    const char* state_directory,
    const char* server_info_proto,
    size_t server_info_length,
    int port) {
  std::string state_directory_str(state_directory);

  // Use explicit length constructor to handle binary protobuf data. Protobuf
  // serialization can contain null bytes (\0), so we cannot treat it as a
  // null-terminated C string. Using std::string(data, length) ensures all bytes
  // are preserved, including embedded nulls.
  std::string server_info_proto_str(
      server_info_proto,
      server_info_length);

  ServerInfo server_info;
  CHECK(server_info.ParseFromString(server_info_proto_str));
  static std::once_flag* initialize = new std::once_flag();
  std::call_once(
      *initialize,
      []() {
        // Initialize Google's logging library.
        //
        // NOTE: we output to stderr by default!
        FLAGS_logtostderr = 1;
        google::InitGoogleLogging("reboot-database");
      });

  CHECK(server_info.shard_infos_size() > 0)
      << "Server info must contain at least one shard.";

  std::string address = "0.0.0.0:" + std::to_string(port);
  tl::expected<std::unique_ptr<DatabaseServer>, std::string> instantiate =
      DatabaseServer::Instantiate(state_directory_str, server_info, address);

  CHECK(instantiate) << instantiate.error();

  // Take ownership out of the unique pointer.
  return instantiate.value().release();
}

const char* database_server_address(const DatabaseServer* ss) {
  return ss->address().c_str();
}

void database_server_shutdown(DatabaseServer* ss) {
  ss->Shutdown();
}

void database_server_wait(DatabaseServer* ss) {
  ss->Wait();
}

void database_server_destroy(DatabaseServer* ss) {
  delete ss;
}
}

////////////////////////////////////////////////////////////////////////

// Synchronization primitives for signal-based shutdown. We use a condition
// variable to efficiently wake the shutdown thread instead of polling.
static std::mutex shutdown_mutex;
static std::condition_variable shutdown_cv;
static bool shutdown_requested = false;

// Signal handler for graceful shutdown. This only sets a flag and notifies
// the condition variable; the actual shutdown logic runs in a dedicated
// thread to avoid deadlocks.
void handle_shutdown_signal(int sig) {
  // Note: Technically, mutexes and condition variables are not
  // async-signal-safe. However, in practice this works on modern systems.
  std::lock_guard<std::mutex> lock(shutdown_mutex);
  shutdown_requested = true;
  shutdown_cv.notify_one();
}

int main(int argc, char* argv[]) {
  if (argc < 4) {
    std::cerr << "Usage: " << argv[0]
              << " <state_directory> <server_info_path> <port>" << std::endl;
    return 1;
  }

  const char* state_directory = argv[1];
  const char* server_info_path = argv[2];
  int port = std::atoi(argv[3]);

  // Read the server info from file. This file is written by whoever starts
  // this sidecar process; e.g. the `DatabaseServer` in
  // `public/rebootdev/server/sidecar.py` for local servers.
  std::ifstream file(server_info_path, std::ios::binary);
  if (!file) {
    std::cerr << "Error: Could not open server info file: "
              << server_info_path << std::endl;
    return 1;
  }

  std::string server_info_proto(
      (std::istreambuf_iterator<char>(file)),
      std::istreambuf_iterator<char>());
  file.close();

  // Create the database server.
  DatabaseServer* server = database_server_create(
      state_directory,
      server_info_proto.c_str(),
      server_info_proto.size(),
      port);

  if (!server) {
    std::cerr << "Error: Failed to create database server" << std::endl;
    return 1;
  }

  std::cout << "Database server started at: "
            << database_server_address(server) << std::endl;

  // Set up signal handling for graceful shutdown.
  std::signal(SIGINT, handle_shutdown_signal);
  std::signal(SIGTERM, handle_shutdown_signal);

  // Start a shutdown monitoring thread that blocks until signaled for
  // shutdown. This avoids calling `Shutdown()` from the signal handler which
  // can cause deadlocks.
  std::thread shutdown_thread([server]() {
    std::unique_lock<std::mutex> lock(shutdown_mutex);
    shutdown_cv.wait(lock, [] { return shutdown_requested; });
    const char* sig_name = "SIGTERM/SIGINT";
    std::cout << "Received " << sig_name << ", shutting down gracefully..."
              << std::endl;
    server->Shutdown();
  });

  // Wait for the server to finish.
  database_server_wait(server);

  // Ensure shutdown thread completes.
  if (shutdown_thread.joinable()) {
    shutdown_thread.join();
  }

  // Clean up.
  database_server_destroy(server);

  return 0;
}

////////////////////////////////////////////////////////////////////////
