import unittest
from reboot.controller.shards import make_shard_infos


class TestPlanMakers(unittest.IsolatedAsyncioTestCase):

    async def test_make_shard_infos(self):
        """
        Tests that the right shards are created.
        """
        # There are 2^14 shards (total 16384) - this number might change
        # in the future, but in that case the expectations below need to
        # be adjusted accordingly!
        shard_infos = make_shard_infos()
        self.assertEqual(len(shard_infos), 16384)
        # The first key is always of length 0, so that ANY key falls
        # into _some_ shard.
        self.assertEqual(shard_infos[0].shard_id, "s000000000")
        self.assertEqual(shard_infos[0].shard_first_key, b"")
        # The remaining keys are of length 2, since 2 bytes = 16 bits,
        # and 2^16 = 65536, which is the next power of 8 above 16384.
        self.assertEqual(len(shard_infos[1].shard_first_key), 2)
        # Their keys are evenly distributed across the key space. That
        # means that the first shard starts at 0x0000, the second 4
        # bytes later at 0x0004, and so forth.
        self.assertEqual(shard_infos[1].shard_id, "s000000001")
        self.assertEqual(shard_infos[1].shard_first_key, b"\x00\x04")
        self.assertEqual(shard_infos[2].shard_id, "s000000002")
        self.assertEqual(shard_infos[2].shard_first_key, b"\x00\x08")
        self.assertEqual(shard_infos[3].shard_id, "s000000003")
        self.assertEqual(shard_infos[3].shard_first_key, b"\x00\x0C")


if __name__ == '__main__':
    unittest.main()
