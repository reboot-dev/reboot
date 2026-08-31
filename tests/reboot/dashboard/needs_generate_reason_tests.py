"""The reason to run `rbt generate`, derived from one `Dashboard`
state."""
import unittest
from google.protobuf.timestamp_pb2 import Timestamp
from rbt.dashboard.v1.dashboard_pb2 import Dashboard, DashboardGetResponse
from reboot.dashboard.backend.needs_generate_reason import (
    needs_generate_reason,
)

Reason = DashboardGetResponse.NeedsGenerateReason


class NeedsGenerateReasonTest(unittest.TestCase):

    def test_nothing_declared_is_no_reason(self) -> None:
        self.assertIsNone(needs_generate_reason(Dashboard()))

    def test_a_module_not_generated_is_missing(self) -> None:
        state = Dashboard()
        state.api_digests['shop/v1/shop_rbt.py'] = 'a' * 64
        self.assertEqual(needs_generate_reason(state), Reason.MISSING)

    def test_a_digest_that_moved_is_changed(self) -> None:
        state = Dashboard()
        state.api_digests['shop/v1/shop_rbt.py'] = 'a' * 64
        state.generated['shop/v1/shop_rbt.py'].api_digest = 'b' * 64
        self.assertEqual(needs_generate_reason(state), Reason.CHANGED)

    def test_a_digest_that_matches_is_no_reason(self) -> None:
        state = Dashboard()
        state.api_digests['shop/v1/shop_rbt.py'] = 'a' * 64
        state.generated['shop/v1/shop_rbt.py'].api_digest = 'a' * 64
        self.assertIsNone(needs_generate_reason(state))

    def test_a_module_recording_no_digest_is_changed(self) -> None:
        state = Dashboard()
        state.api_digests['shop/v1/shop_rbt.py'] = 'a' * 64
        state.generated['shop/v1/shop_rbt.py'].modified.CopyFrom(
            Timestamp(seconds=1)
        )
        self.assertEqual(needs_generate_reason(state), Reason.CHANGED)

    def test_the_worst_reason_over_all_files_wins(self) -> None:
        state = Dashboard()
        state.api_digests['shop/v1/shop_rbt.py'] = 'a' * 64
        state.generated['shop/v1/shop_rbt.py'].api_digest = 'a' * 64
        state.api_digests['shop/v1/depot_rbt.py'] = 'c' * 64
        state.generated['shop/v1/depot_rbt.py'].api_digest = 'd' * 64
        self.assertEqual(needs_generate_reason(state), Reason.CHANGED)


if __name__ == '__main__':
    unittest.main()
