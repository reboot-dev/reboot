import reboot.uuidv7
import unittest
import uuid
from reboot.uuidv7 import uuid7, uuid7_timestamp_ms


class UUIDv7Test(unittest.TestCase):

    def test_basic(self):
        """`uuid7()` returns a UUIDv7."""
        result = uuid7()
        self.assertIsInstance(result, uuid.UUID)
        self.assertEqual(result.version, 7)

    def test_auto_timestamp_is_monotonic(self):
        """Many UUIDs generated with no explicit timestamp in quick succession
        have non-decreasing embedded timestamps."""
        previous = uuid7_timestamp_ms(uuid7())
        for _ in range(1000):
            current = uuid7_timestamp_ms(uuid7())
            self.assertGreaterEqual(current, previous)
            previous = current

    def test_explicit_timestamp_is_preserved(self):
        """Passing `timestamp_ms` embeds that exact value in the resulting
        UUID."""
        timestamp_ms = 1_700_000_000_000
        result = uuid7(timestamp_ms=timestamp_ms)
        self.assertEqual(result.version, 7)
        self.assertEqual(uuid7_timestamp_ms(result), timestamp_ms)

    def test_explicit_timestamp_repeated_preserves_timestamp(self):
        """Many UUIDs generated with the same explicit timestamp all keep that
        timestamp — the counter / tail are fresh randomness each call
        and never overflow-and-bump the timestamp the way passing no
        timestamp might."""
        timestamp_ms = 1_700_000_000_000
        for _ in range(1000):
            self.assertEqual(
                uuid7_timestamp_ms(uuid7(timestamp_ms=timestamp_ms)),
                timestamp_ms,
            )

    def test_explicit_timestamp_smaller_than_last_is_preserved(self):
        """An explicit timestamp older than the last auto-generated one must
        still be embedded verbatim — the monotonicity catch-up that
        would otherwise force `last + 1` must NOT apply when the
        caller specifies the timestamp."""
        # Prime the monotonicity state with a recent call.
        recent_timestamp_ms = uuid7_timestamp_ms(uuid7())
        old_timestamp_ms = recent_timestamp_ms - 10_000
        result = uuid7(timestamp_ms=old_timestamp_ms)
        self.assertEqual(uuid7_timestamp_ms(result), old_timestamp_ms)

    def test_explicit_timestamp_does_not_mutate_monotonicity_globals(
        self,
    ):
        """The explicit-timestamp path must not consult or mutate the
        module-level monotonicity state, so an explicit- timestamp
        call between no timestamp calls can't perturb the no timestamp
        monotonicity."""
        # Prime the globals.
        uuid7()
        before_timestamp = reboot.uuidv7._last_timestamp_v7
        before_counter = reboot.uuidv7._last_counter_v7

        for _ in range(100):
            uuid7(timestamp_ms=1)

        self.assertEqual(reboot.uuidv7._last_timestamp_v7, before_timestamp)
        self.assertEqual(reboot.uuidv7._last_counter_v7, before_counter)


if __name__ == '__main__':
    unittest.main()
