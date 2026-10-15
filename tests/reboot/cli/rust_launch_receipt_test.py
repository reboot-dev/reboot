"""Source unit contracts; no native/public runtime acceptance."""
import asyncio
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('receipt_cli', ROOT / 'reboot/cli/commands/rust_dev.py')
assert spec is not None and spec.loader is not None
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def proc_reader(births, argv):
    births = iter(births)
    def read_text(path):
        value = next(births)
        if value is None:
            raise FileNotFoundError
        return '42 (child with spaces) ' + ' '.join(['S'] + ['0'] * 18 + [value])
    return patch.object(Path, 'read_text', read_text), patch.object(Path, 'read_bytes', return_value=b'\0'.join(x.encode() for x in argv) + b'\0')


class LaunchReceiptTests(unittest.TestCase):
    def test_observed_birth_and_full_argv(self):
        argv = ('/bin/database', '/state/rocksdb', '/state/server-info.pb', '20000')
        a, b = proc_reader(['71', '71'], argv)
        with a, b:
            receipt = module.launch_receipt(SimpleNamespace(pid=42), argv, 'Database')
        self.assertTrue(receipt['birth_and_argv_observed'])
        self.assertEqual(receipt['starttime'], '71')
        self.assertEqual(receipt['argv'], list(argv))

    def test_reused_or_missing_pid_never_gets_authority(self):
        for births, observed in ((['71', '72'], ['/bin/app']), ([None, None], ['/bin/app']),
                                 (['71', '71'], ['/bin/replacement'])):
            a, b = proc_reader(births, observed)
            with a, b:
                receipt = module.launch_receipt(SimpleNamespace(pid=42), ('/bin/app',), 'app')
            self.assertFalse(receipt['birth_and_argv_observed'])
            self.assertIsNone(receipt['starttime'])
            self.assertIsNone(receipt['argv'])

    def test_receipt_precedes_startup_body_and_cleanup(self):
        events = []
        async def run():
            async with module.owned_process('/bin/app', launch_label='app', report=lambda s: events.append(json.loads(s.removeprefix('RUST_CHILD_LAUNCH ')))):
                self.assertEqual(events[0]['starttime'], '71')
                events.append('startup body')
        a, b = proc_reader(['71', '71'], ['/bin/app'])
        with a, b, patch.object(module.asyncio, 'create_subprocess_exec', AsyncMock(return_value=SimpleNamespace(pid=42))), patch.object(module, 'stop_process', AsyncMock()) as stop:
            asyncio.run(run())
            stop.assert_awaited_once()
        self.assertEqual(events[1], 'startup body')

    def test_port_excludes_actual_ephemeral_range_and_application(self):
        class Listener:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def bind(self, address): self.address = address
        with patch.object(Path, 'read_text', return_value='20000 20004'), patch.object(module.socket, 'socket', return_value=Listener()):
            self.assertEqual(module.database_port_candidate({20005}), 20006)


class DatabasePortCandidateTests(unittest.TestCase):
    class Listener:
        def __init__(self, attempts, collisions):
            self.attempts = attempts
            self.collisions = collisions
            self.closed = False

        def __enter__(self):
            return self

        def __exit__(self, *args):
            self.closed = True

        def bind(self, address):
            self.attempts.append(address)
            if address[1] in self.collisions:
                raise OSError('address already in use')

    def probe(self, *, text='32768 60999', error=None, exclude=None,
              collisions=()):
        attempts, listeners = [], []

        def socket():
            listener = self.Listener(attempts, collisions)
            listeners.append(listener)
            return listener

        with patch.object(Path, 'read_text', return_value=text,
                          side_effect=error), patch.object(module.socket, 'socket', socket):
            port = module.database_port_candidate(exclude or set())
        self.assertTrue(all(listener.closed for listener in listeners))
        return port, attempts

    def test_missing_procfs_falls_back_and_releases_probe(self):
        port, attempts = self.probe(error=FileNotFoundError(), exclude={20000})
        self.assertEqual(port, 20001)
        self.assertEqual(attempts, [('127.0.0.1', 20001)])

    def test_unreadable_procfs_falls_back(self):
        port, _ = self.probe(error=PermissionError())
        self.assertEqual(port, 20000)

    def test_malformed_ranges_fall_back(self):
        for text in ('', 'not numbers', '20000', '1 2 3', '30000 20000',
                     '0 30000', '20000 65536'):
            with self.subTest(text=text):
                port, _ = self.probe(text=text)
                self.assertEqual(port, 20000)

    def test_collisions_and_exclusions_are_skipped(self):
        port, attempts = self.probe(exclude={20000, 20002}, collisions={20001})
        self.assertEqual(port, 20003)
        self.assertEqual(attempts, [('127.0.0.1', 20001), ('127.0.0.1', 20003)])

    def test_linux_ephemeral_endpoints_are_inclusive(self):
        port, attempts = self.probe(text='20001 20003', exclude={20000})
        self.assertEqual(port, 20004)
        self.assertEqual(attempts, [('127.0.0.1', 20004)])

    def test_excluded_range_exhaustion_does_not_probe(self):
        with patch.object(Path, 'read_text', return_value='32768 60999'), \
                patch.object(module.socket, 'socket') as socket:
            with self.assertRaisesRegex(module.RustDevError, 'No free.*Database port'):
                module.database_port_candidate(set(range(20000, 30000)))
            socket.assert_not_called()

    def test_ephemeral_range_exhaustion_does_not_probe(self):
        with patch.object(Path, 'read_text', return_value='20000 29999'), \
                patch.object(module.socket, 'socket') as socket:
            with self.assertRaisesRegex(module.RustDevError, 'No free.*Database port'):
                module.database_port_candidate(set())
            socket.assert_not_called()

    def test_probe_collision_exhaustion_closes_every_socket(self):
        attempts, listeners = [], []

        def socket():
            listener = self.Listener(attempts, range(20000, 30000))
            listeners.append(listener)
            return listener

        with patch.object(Path, 'read_text', side_effect=FileNotFoundError()), \
                patch.object(module.socket, 'socket', socket):
            with self.assertRaisesRegex(module.RustDevError, 'No free.*Database port'):
                module.database_port_candidate(set())
        self.assertEqual(len(attempts), 10000)
        self.assertTrue(all(listener.closed for listener in listeners))

    def test_socket_creation_failure_is_a_clear_allocation_error(self):
        with patch.object(Path, 'read_text', return_value='32768 60999'), \
                patch.object(module.socket, 'socket', side_effect=OSError('too many open files')):
            with self.assertRaisesRegex(module.RustDevError, 'No free.*Database port'):
                module.database_port_candidate(set())

    def test_missing_procfs_with_real_loopback_probe(self):
        # Linux-host source test of the actual helper, not native macOS acceptance.
        with patch.object(Path, 'read_text', side_effect=FileNotFoundError()):
            port = module.database_port_candidate({20000})
        self.assertIn(port, range(20001, 30000))


if __name__ == '__main__':
    unittest.main()
