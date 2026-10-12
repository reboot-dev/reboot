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


if __name__ == '__main__':
    unittest.main()
