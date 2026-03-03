"""
Implementation taken from https://github.com/python/cpython/blob/main/Lib/uuid.py
(Last commit: 3a04be9)

Need this because uuid7-standard library is NOT time-ordered. Monotonicity is
optional for UUID7 spec (https://www.rfc-editor.org/rfc/rfc9562.html#name-uuid-version-7).
Python 3.14's implementation is monotonic.

* `uuid7` implementation added in Python 3.14
  (https://docs.python.org/3.14/library/uuid.html#uuid.uuid7)

Differences
* `int.from_bytes` needs a byteorder='big' which is set as the default as of Python 3.11
  (https://docs.python.org/3/library/stdtypes.html#int.from_bytes)
* This returns it as a string as a workaround to copying over the entirety of uuid.py
"""
import os
import time
from uuid import UUID, SafeUUID

_UINT_128_MAX = (1 << 128) - 1
_RFC_4122_VERSION_7_FLAGS = ((7 << 76) | (0x8000 << 48))

_last_timestamp_v7 = None
_last_counter_v7 = 0  # 42-bit counter


def _uuid7_get_counter_and_tail():
    rand = int.from_bytes(os.urandom(10), byteorder='big')
    # 42-bit counter with MSB set to 0
    counter = (rand >> 32) & 0x1ff_ffff_ffff
    # 32-bit random data
    tail = rand & 0xffff_ffff
    return counter, tail


def uuid7():
    """Generate a UUID from a Unix timestamp in milliseconds and random bits.

    UUIDv7 objects feature monotonicity within a millisecond.

    Returns UUIDv7 formatted as a string.
    """
    # --- 48 ---   -- 4 --   --- 12 ---   -- 2 --   --- 30 ---   - 32 -
    # unix_ts_ms | version | counter_hi | variant | counter_lo | random
    #
    # 'counter = counter_hi | counter_lo' is a 42-bit counter constructed
    # with Method 1 of RFC 9562, §6.2, and its MSB is set to 0.
    #
    # 'random' is a 32-bit random value regenerated for every new UUID.
    #
    # If multiple UUIDs are generated within the same millisecond, the LSB
    # of 'counter' is incremented by 1. When overflowing, the timestamp is
    # advanced and the counter is reset to a random 42-bit integer with MSB
    # set to 0.

    global _last_timestamp_v7
    global _last_counter_v7

    nanoseconds = time.time_ns()
    timestamp_ms = nanoseconds // 1_000_000

    if _last_timestamp_v7 is None or timestamp_ms > _last_timestamp_v7:
        counter, tail = _uuid7_get_counter_and_tail()
    else:
        if timestamp_ms < _last_timestamp_v7:
            timestamp_ms = _last_timestamp_v7 + 1
        # advance the 42-bit counter
        counter = _last_counter_v7 + 1
        if counter > 0x3ff_ffff_ffff:
            # advance the 48-bit timestamp
            timestamp_ms += 1
            counter, tail = _uuid7_get_counter_and_tail()
        else:
            # 32-bit random data
            tail = int.from_bytes(os.urandom(4), byteorder='big')

    unix_ts_ms = timestamp_ms & 0xffff_ffff_ffff
    counter_msbs = counter >> 30
    # keep 12 counter's MSBs and clear variant bits
    counter_hi = counter_msbs & 0x0fff
    # keep 30 counter's LSBs and clear version bits
    counter_lo = counter & 0x3fff_ffff
    # ensure that the tail is always a 32-bit integer (by construction,
    # it is already the case, but future interfaces may allow the user
    # to specify the random tail)
    tail &= 0xffff_ffff

    int_uuid_7 = unix_ts_ms << 80
    int_uuid_7 |= counter_hi << 64
    int_uuid_7 |= counter_lo << 32
    int_uuid_7 |= tail
    # by construction, the variant and version bits are already cleared
    int_uuid_7 |= _RFC_4122_VERSION_7_FLAGS

    # defer global update until all computations are done
    _last_timestamp_v7 = timestamp_ms
    _last_counter_v7 = counter

    # Convert to string directly rather than wrapping as a UUID object.
    # x = int_uuid_7.to_bytes(16, byteorder='big').hex()  # big endian
    # return f'{x[:8]}-{x[8:12]}-{x[12:16]}-{x[16:20]}-{x[20:]}'

    # Copied from `UUID._from_int` which is how UUIDs are made internally in
    # 3.14. Also, the 3.10 version of UUID checks versioning but doesn't handle
    # uuid7.
    assert 0 <= int_uuid_7 <= _UINT_128_MAX, repr(int_uuid_7)
    res = object.__new__(UUID)
    object.__setattr__(res, 'int', int_uuid_7)
    object.__setattr__(res, 'is_safe', SafeUUID.unknown)
    return res
