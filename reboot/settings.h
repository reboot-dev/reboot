// The settings below must match their equivalents in:
// * reboot/settings.py
// * <possibly other languages by the time you read this>

#pragma once

////////////////////////////////////////////////////////////////////////

namespace rbt {

////////////////////////////////////////////////////////////////////////

// gRPC max message size to transmit large actor state data, 100 MB.
constexpr size_t kMaxDatabaseMessageTransportBytes = 1024 * 1024 * 100;

// We will flush the batch when the total "estimated" message size
// exceeds this threshold.
constexpr size_t kBatchFlushBytes = kMaxDatabaseMessageTransportBytes / 2;

////////////////////////////////////////////////////////////////////////

// See `EVERY_LOCAL_NETWORK_ADDRESS` and `ONLY_LOCALHOST_NETWORK_ADDRESS`
// in `reboot/settings.py` for when to use which.
constexpr const char* kEveryLocalNetworkAddress = "0.0.0.0";
constexpr const char* kOnlyLocalhostNetworkAddress = "127.0.0.1";

////////////////////////////////////////////////////////////////////////

}  // namespace rbt

////////////////////////////////////////////////////////////////////////
