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

}  // namespace rbt

////////////////////////////////////////////////////////////////////////
