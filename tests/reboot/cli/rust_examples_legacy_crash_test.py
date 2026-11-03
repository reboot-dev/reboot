"""Driver unit contracts only; these do not certify any public crash case."""
import importlib.util
import os
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

HERE = Path(__file__).parent
spec = importlib.util.spec_from_file_location('legacy_crash_driver', HERE / 'rust_examples_legacy_crash_e2e.py')
assert spec is not None and spec.loader is not None
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class CrashDriverTests(unittest.TestCase):
    def test_five_distinct_windows_keep_started_fail_closed(self):
        self.assertEqual([case[0] for case in module.CASES], ['pending', 'started', 'partial', 'effects', 'stored'])
        self.assertEqual([case[3] for case in module.CASES], [0, 0, 3, 10, 10])
        self.assertEqual([case[4] for case in module.CASES], [False, True, True, True, False])

    def test_staging_enables_hooks_only_in_disposable_consumer(self):
        original = {p: module.sha(p) for p in (module.SOURCE / 'hello-legacy-grpc').rglob('*') if p.is_file()}
        with tempfile.TemporaryDirectory() as directory:
            driver = module.Driver.__new__(module.Driver)
            driver.stage = Path(directory)
            apps = [driver.stage_app(name) for name in ('pending', 'stored')]
            self.assertNotEqual(apps[0][1], apps[1][1])
            for app, name in apps:
                cargo = (app / 'backend/Cargo.toml').read_text()
                self.assertIn('default = ["native-test-support"]', cargo)
                self.assertIn(str(module.SDK), cargo)
                self.assertIn(str(module.ROOT), (app / 'backend/build.rs').read_text())
                self.assertIn('--application-name=' + name, (app / '.rbtrc').read_text())
        self.assertEqual({p: module.sha(p) for p in original}, original)

    def test_task_identity_rejects_malformed_or_wrong_contract(self):
        # Tiny unit-test protobufs, never public proof records or runtime substitutes.
        valid = b'\x0a\x01x\x12\x0aInitialize'
        with tempfile.TemporaryDirectory() as directory:
            task = Path(directory) / 'task.pb'
            task.write_bytes(valid)
            expected = module.task_identity(task)
            # Canonical status and response changes must not alter identity.
            task.write_bytes(valid + b'\x18\x01')
            self.assertEqual(module.task_identity(task), expected)
            for data in (valid[:-1], valid + b'\x12\x0aInitialize', valid + b'\x38\x01',
                         valid + b'\x22\x01x', b'\x0a\x01x\x12\x05Greet', valid + b'\x80'):
                with self.subTest(data=data):
                    task.write_bytes(data)
                    with self.assertRaises((AssertionError, KeyError)):
                        module.task_identity(task)

    def test_marker_identity_and_producer_deadline_not_discovery(self):
        with tempfile.TemporaryDirectory() as directory:
            marker = Path(directory) / 'pause.marker'
            value = {'version': 1, 'clock': 'CLOCK_MONOTONIC', 'created_ns': 1_000_000_000,
                     'hook': 'hook', 'case': 'case-initial', 'pid': 42,
                     'task_uuid': '12345678-1234-1234-1234-123456789abc'}
            marker.write_text(json.dumps(value))
            with patch.object(module.time, 'monotonic_ns', return_value=8_999_999_999):
                receipt = module.marker_receipt(marker, 'hook', 'case-initial', 42)
                self.assertGreater(module.barrier_remaining({'producer_marker': receipt}), 0)
            with patch.object(module.time, 'monotonic_ns', return_value=9_000_000_000):
                with self.assertRaises(AssertionError):
                    module.barrier_remaining({'producer_marker': value})
            for field, bad in (('clock', 'wall'), ('hook', 'other'), ('pid', 43),
                               ('case', 'stale'), ('created_ns', '1000000000'), ('created_ns', 10**30)):
                marker.write_text(json.dumps(dict(value, **{field: bad})))
                with self.subTest(field=field), self.assertRaises(AssertionError):
                    module.marker_receipt(marker, 'hook', 'case-initial', 42)
            marker.write_text(json.dumps(value))
            marker.with_suffix('.release').touch()
            with self.assertRaises(AssertionError):
                module.marker_receipt(marker, 'hook', 'case-initial', 42)

    def test_launch_provenance_survives_cleaned_children_without_signal_authority(self):
        with tempfile.TemporaryDirectory() as directory:
            driver = module.Driver.__new__(module.Driver)
            driver.database = Path('/database')
            driver.target = Path('/target')
            driver.owned = {}
            log = Path(directory) / 'cli.log'
            receipts = [{'version': 1, 'label': label, 'pid': pid, 'starttime': '71',
                         'executable': argv[0], 'argv': argv, 'birth_and_argv_observed': True}
                        for label, pid, argv in (
                            ('Database', 42, ['/database', '/durable/rocksdb', '/durable/server-info.pb', '20000']),
                            ('app', 43, ['/target/debug/app']))]
            log.write_text(''.join('RUST_CHILD_LAUNCH ' + json.dumps(r) + '\n' for r in receipts))
            record = {'log': str(log)}
            with patch.object(module, 'process_start', return_value=None), patch.object(module, 'discover_owned'):
                driver.children(record)
                driver.absent_children(record)
            self.assertEqual(record['rocksdb'], '/durable/rocksdb')
            self.assertEqual(record['database_url'], 'http://127.0.0.1:20000')
            self.assertEqual(driver.owned, {})
            self.assertNotIn('live_cmdline', record['app'])
            receipts[0]['birth_and_argv_observed'] = False
            receipts[0]['starttime'] = None
            log.write_text('RUST_CHILD_LAUNCH ' + json.dumps(receipts[0]) + '\n')
            with patch.object(module, 'discover_owned'), self.assertRaises(AssertionError):
                driver.children({'log': str(log)})

    def test_proto_and_staged_input_bytes_are_fingerprinted(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            sdk = root / 'reboot/rust'
            sdk.mkdir(parents=True)
            (root / 'rbt/v1alpha1').mkdir(parents=True)
            proto = root / 'rbt/v1alpha1/database.proto'
            proto.write_text('syntax = "proto3";')
            with patch.object(module, 'ROOT', root), patch.object(module, 'SDK', sdk):
                before = module.source_manifest()
                self.assertIn(str(proto), before)
                proto.write_text('syntax = "proto2";')
                self.assertNotEqual(module.source_manifest(), before)
            app = root / 'examples/sample'
            app.mkdir(parents=True)
            lock = app / 'Cargo.lock'
            lock.write_text('version = 3')
            before = module.stage_manifest(app)
            lock.write_text('version = 4')
            self.assertNotEqual(module.stage_manifest(app), before)

    def test_actual_pidfd_api_or_libc_binding_targets_kernel_identity(self):
        fd = module.open_pidfd(os.getpid())
        try:
            module.send_pidfd(fd, 0)  # Kernel permission probe, no signal delivered.
        finally:
            os.close(fd)
        with self.assertRaises(OSError):
            module.send_pidfd(fd, 0)  # A closed descriptor cannot become PID authority.

    def test_owned_ipv6_listener_is_observed(self):
        import socket
        with socket.socket(socket.AF_INET6, socket.SOCK_STREAM) as listener:
            listener.bind(('::1', 0))
            listener.listen()
            self.assertTrue(module.listener_owned(os.getpid(), module.process_start(os.getpid()), listener.getsockname()[1]))

    def test_actual_host_vendored_protoc_matches_locked_package(self):
        driver = module.Driver.__new__(module.Driver)
        driver.env = dict(os.environ)
        driver.command = lambda app, *args: subprocess.check_output([str(x) for x in args], text=True)
        app = module.SOURCE / 'hello-legacy-grpc'
        manifest = driver.resolved_protoc_manifest(app)
        expected = {'x86_64': 'x86_64', 'aarch64': 'aarch_64'}[os.uname().machine]
        self.assertIn('protoc-bin-vendored-linux-' + expected, manifest['package'])
        self.assertIn('libprotoc', manifest['version'])
        self.assertTrue(manifest['input_hashes'])

    def test_budget_ceiling_and_free_floor_are_independent(self):
        driver = module.Driver.__new__(module.Driver)
        driver.target = HERE
        driver.evidence = {}
        floor = 8 * 1024**3
        with patch.dict(os.environ, {'RUST_DX_TARGET_CEILING_BYTES': '12000000000'}, clear=True), \
             patch.object(subprocess, 'check_output', return_value=b'12000000000 target\n'), \
             patch.object(shutil, 'disk_usage', return_value=SimpleNamespace(free=floor)):
            driver.budget()
            with patch.object(subprocess, 'check_output', return_value=b'12000000001 target\n'):
                with self.assertRaises(AssertionError):
                    driver.budget()
            with patch.object(shutil, 'disk_usage', return_value=SimpleNamespace(free=floor - 1)):
                with self.assertRaises(AssertionError):
                    driver.budget()
        self.assertEqual(len(driver.evidence['budgets']), 1)


if __name__ == '__main__':
    unittest.main()
