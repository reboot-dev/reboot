from rbt.v1alpha1 import database_pb2
from reboot.naming import make_shard_id

NUM_SHARDS = 2**14  # = 16,384.

_NUM_BYTE_VALUES = 256


def _shard_first_keys() -> list[bytes]:
    # Divide the full bytes keyspace (from b"" to b"\xff"*N) into
    # `NUM_SHARDS` equal key ranges. Each shard's key range is
    # represented by its first key (and implicitly ends at the next key
    # in that list).
    #
    # We treat the keyspace as the range of integers from 0 to
    # `256**key_length - 1`, where `key_length` is chosen so that
    # `256**key_length >= NUM_SHARDS`.
    #
    # Example: with NUM_SHARDS=128 we have key_length=1 - the first keys
    # are [0x00, 0x02, 0x04, ..., 0xFE] (i.e. every second byte value).
    #
    # Because real keys can have arbitrary length and sort
    # lexicographically, there are still infinitely many possible keys
    # for each shard (e.g. `0x02`, `0x0200`, `0x020000`, etc. are all in
    # the shard with first key `0x02`).
    key_length = 1  # Number of bytes in each shard's first key.
    while _NUM_BYTE_VALUES**key_length < NUM_SHARDS:
        key_length += 1
    total_keys = _NUM_BYTE_VALUES**key_length
    chunk_size = total_keys // NUM_SHARDS
    first_keys = []
    for i in range(NUM_SHARDS):
        if i == 0:
            # The first shard always starts at the empty key.
            first_keys.append(b"")
            continue

        key_int = i * chunk_size
        # Encode the integer as a big-endian byte string of the
        # appropriate length; big-endian ensures lexicographic ordering
        # matches numeric ordering.
        key_bytes = key_int.to_bytes(key_length, "big")
        first_keys.append(key_bytes)
    return first_keys


def make_shard_infos() -> list[database_pb2.ShardInfo]:
    return [
        database_pb2.ShardInfo(
            shard_id=make_shard_id(shard_index),
            shard_first_key=shard_first_key
        ) for shard_index, shard_first_key in enumerate(_shard_first_keys())
    ]
