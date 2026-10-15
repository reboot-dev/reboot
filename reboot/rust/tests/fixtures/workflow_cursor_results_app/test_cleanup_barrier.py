"""Local UNIT custody doubles; no executable launches, signals or native proof."""
import importlib.util
import os
from pathlib import Path
import sys
from types import SimpleNamespace as NS
import unittest
from unittest.mock import patch


class Child:
    def __init__(self, executable):
        self.argv = [executable]
        self.joined_exact = True
        self.failure = None
        self.row = {'joined': True, 'fd': None}
        self.attach = NS(receipt={'unit_only': True}, fd=None, failure=None)
        self.returncode = 0
        self.requests = 0

    def retire(self, **kwargs):
        self.requests += 1  # UNIT observation, never a process signal.


class CleanupBarrierTests(unittest.TestCase):
    def setUp(self):
        source = Path(__file__).with_name('supervision_reference.py')
        spec = importlib.util.spec_from_file_location('cleanup_unit_helper', source)
        assert spec is not None and spec.loader is not None
        self.helper = importlib.util.module_from_spec(spec)
        with patch.object(sys, 'argv', ['UNIT', '/UNIT/sdk']), patch.dict(
            os.environ, {'REBOOT_NATIVE2PC_CXX_DATABASE': '/UNIT/database'}
        ):
            spec.loader.exec_module(self.helper)
        self.sdk = Child('/UNIT/sdk')
        self.db = Child('/UNIT/database')
        # SDK intentionally absent from processes: short clients/reservations
        # must still block Database through the complete adapter ledger.
        self.owner = NS(failure=None, direct=[self.sdk.row, self.db.row])
        setattr(self.helper, '_custody', NS(_owner=self.owner, children=[self.sdk, self.db]))
        setattr(self.helper, 'processes', [{'process': self.db, 'expected_exit': 'healthy'}])

    def rejects_without_database_request(self):
        with self.assertRaises(RuntimeError):
            self.helper.stop(self.db)
        self.assertEqual(self.db.requests, 0)

    def test_exact_joined_control(self):
        self.helper.stop(self.db)
        self.assertEqual(self.db.requests, 1)

    def test_unjoined_short_client(self):
        self.sdk.joined_exact = False
        self.rejects_without_database_request()

    def test_unknown_receipt(self):
        self.sdk.attach.receipt = None
        self.rejects_without_database_request()

    def test_unrepresented_reservation(self):
        self.owner.direct.append({'joined': False, 'fd': 123})
        self.rejects_without_database_request()

    def test_original_descriptor_open(self):
        self.sdk.row['fd'] = 123
        self.rejects_without_database_request()

    def test_attach_descriptor_open(self):
        self.sdk.attach.fd = 123
        self.rejects_without_database_request()

    def test_missing_descriptor_state(self):
        del self.sdk.row['fd']
        self.rejects_without_database_request()

    def test_default_wait_budget_still_fails_before_late_condition(self):
        clock = [0]
        def advance(_):
            clock[0] += 1
        with patch.object(self.helper.time, 'monotonic', side_effect=lambda: clock[0]), patch.object(self.helper.time, 'sleep', side_effect=advance):
            with self.assertRaisesRegex(RuntimeError, 'bounded wait timed out'):
                self.helper.until(lambda: clock[0] >= 20)
        self.assertEqual(clock[0], 10)

    def test_explicit_workload_budget_requires_actual_condition(self):
        clock = [0]
        def advance(_):
            clock[0] += 1
        with patch.object(self.helper.time, 'monotonic', side_effect=lambda: clock[0]), patch.object(self.helper.time, 'sleep', side_effect=advance):
            self.helper.until(lambda: clock[0] >= 20, timeout=180)
        self.assertEqual(clock[0], 20)

    def test_sticky_owner_failure(self):
        self.owner.failure = 'UNIT unknown acquisition'
        self.rejects_without_database_request()


if __name__ == '__main__':
    unittest.main()
