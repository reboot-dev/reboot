import argparse
import asyncio
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile
if sys.version_info >= (3, 11):
    import tomllib
else:  # Python 3.10 remains supported, including type checking.
    import tomli as tomllib
import unittest
from unittest.mock import patch

from reboot.cli.commands.init.rust_init import initialize_rust
from reboot.cli.commands.rust_dev import (
    RustDevError, build_rust_app, owned_process, run_rust_dev, snapshot, validate_rust_args,
    wait_for_change, wait_for_port,
)

ROOT = Path(__file__).resolve().parents[3]
SDK = Path(os.environ.get('RUST_DX_SDK', ROOT / 'reboot/rust'))
if SDK.name == 'Cargo.toml':  # Bazel rootpath can name the exported manifest.
    SDK = SDK.parent
SDK = SDK.resolve()
RBT = str(Path(os.environ.get('RUST_DX_RBT', Path(sys.executable).parent / 'rbt')).resolve())


class ScaffoldTest(unittest.TestCase):
    def test_batch_selector_real_cli_and_complete_outputs(self):
        with tempfile.TemporaryDirectory() as directory:
            result = subprocess.run([RBT, 'init', '--backend=rust', '--frontend=none',
                                     '--application-name=batch_ledger', f'--rust-sdk={SDK}',
                                     '--rust-example=batch-ledger'], cwd=directory, text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            root = Path(directory)
            self.assertTrue((root / 'backend/src/host.rs').is_file())
            self.assertIn('with_participant(map_participant', (root / 'backend/src/host.rs').read_text())
            self.assertIn('batch-v1', (root / 'backend/src/lib.rs').read_text())
            self.assertIn('sorted_map.proto', (root / 'backend/build.rs').read_text())
            self.assertTrue((root / 'api/batch_ledger/v1/batch.proto').is_file())

    def test_batch_invalid_selector_and_host_collision_publish_nothing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaisesRegex(ValueError, 'Unsupported Rust example'):
                initialize_rust(root, 'ledger', str(SDK), 'none', 'bogus')
            self.assertEqual(list(root.iterdir()), [])
            (root / 'backend/src').mkdir(parents=True)
            (root / 'backend/src/host.rs').write_text('mine')
            with self.assertRaisesRegex(ValueError, 'overwrite'):
                initialize_rust(root, 'ledger', str(SDK), 'none', 'batch-ledger')
            self.assertEqual((root / 'backend/src/host.rs').read_text(), 'mine')
            self.assertFalse((root / '.rbtrc').exists())
            self.assertFalse((root / 'backend/Cargo.toml').exists())

    def test_real_cli_init_creates_cargo_native_app(self):
        with tempfile.TemporaryDirectory() as directory:
            result = subprocess.run([RBT, 'init', '--backend=rust',
                                     '--frontend=none', '--application-name=hello_rust',
                                     f'--rust-sdk={SDK}'], cwd=directory, text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            root = Path(directory)
            manifest = tomllib.loads((root / 'backend/Cargo.toml').read_text())
            self.assertEqual(manifest['dependencies']['reboot']['path'], str(SDK.resolve()))
            self.assertEqual({b['name'] for b in manifest['bin']}, {'app', 'client'})
            rc = (root / '.rbtrc').read_text()
            self.assertIn('--rust', rc)
            self.assertIn('--no-generate-watch', rc)
            self.assertNotIn('--python', rc)
            self.assertNotIn('--nodejs', rc)
            self.assertIn('ApplicationHost::new', (root / 'backend/src/main.rs').read_text())
            self.assertIn('compile_protos_with_runtime', (root / 'backend/build.rs').read_text())
            for source in (root / 'backend').rglob('*.rs'):
                self.assertTrue(source.read_bytes().endswith(b'\n'), str(source))

    def test_missing_sdk_has_no_partial_publication(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, 'require.*rust-sdk'):
                initialize_rust(Path(directory), 'hello', None, 'none')
            self.assertEqual(list(Path(directory).iterdir()), [])

    def test_wrong_sdk_has_no_partial_publication(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, 'Invalid Rust SDK'):
                initialize_rust(Path(directory), 'hello', directory, 'none')
            self.assertEqual(list(Path(directory).iterdir()), [])

    def test_frontend_rejected_before_writes(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, 'frontend=none'):
                initialize_rust(Path(directory), 'hello', str(SDK), 'react')
            self.assertEqual(list(Path(directory).iterdir()), [])

    def test_keyword_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, 'reserved'):
                initialize_rust(Path(directory), 'crate', str(SDK), 'none')
            self.assertEqual(list(Path(directory).iterdir()), [])

    def test_dependency_names_rejected_before_publication(self):
        for name in ['reboot', 'prost', 'prost_types', 'tonic', 'tonic_health', 'uuid', 'tokio', 'std', 'core', 'alloc']:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                with self.assertRaisesRegex(ValueError, 'dependency crate'):
                    initialize_rust(root, name, str(SDK), 'none')
                self.assertEqual(list(root.iterdir()), [])
                result = subprocess.run([RBT, 'init', '--backend=rust', '--frontend=none',
                                         f'--application-name={name}', f'--rust-sdk={SDK}'],
                                        cwd=root, text=True, capture_output=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('dependency crate', result.stdout + result.stderr)
                self.assertEqual(list(root.iterdir()), [])

    def test_existing_file_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'README.md').write_text('mine')
            with self.assertRaisesRegex(ValueError, 'overwrite'):
                initialize_rust(root, 'hello', str(SDK), 'none')
            self.assertEqual((root / 'README.md').read_text(), 'mine')
            self.assertFalse((root / '.rbtrc').exists())
            self.assertFalse((root / 'backend').exists())

    def test_symlink_parent_rejected(self):
        with tempfile.TemporaryDirectory() as directory, tempfile.TemporaryDirectory() as outside:
            root = Path(directory)
            (root / 'backend').symlink_to(outside, target_is_directory=True)
            with self.assertRaisesRegex(ValueError, 'parent'):
                initialize_rust(root, 'hello', str(SDK), 'none')
            self.assertEqual(list(Path(outside).iterdir()), [])

    def test_reinit_rejected_and_original_unchanged(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            initialize_rust(root, 'hello', str(SDK), 'none')
            before = snapshot([str(root / '**/*'), str(root / '.rbtrc')])
            with self.assertRaisesRegex(ValueError, 'overwrite'):
                initialize_rust(root, 'hello', str(SDK), 'none')
            self.assertEqual(snapshot([str(root / '**/*'), str(root / '.rbtrc')]), before)

    def test_python_and_node_cli_still_initialize(self):
        for backend in ['python', 'nodejs']:
            with self.subTest(backend=backend), tempfile.TemporaryDirectory() as directory:
                result = subprocess.run([RBT, 'init',
                                         f'--backend={backend}', '--frontend=none',
                                         '--application-name=hello_compat'], cwd=directory,
                                        text=True, capture_output=True)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                extension = 'py' if backend == 'python' else 'ts'
                self.assertTrue((Path(directory) / f'backend/src/main.{extension}').exists())

    def test_unsupported_runtime_options(self):
        validate_rust_args(argparse.Namespace(servers=1, chaos=False, generate_watch=False))
        for kwargs in [dict(servers=2), dict(frontend_host='http://localhost'),
                       dict(python=True), dict(chaos=True), dict(generate_watch=True),
                       dict(tls_certificate='cert'), dict(tracing='jaeger')]:
            with self.subTest(kwargs=kwargs), self.assertRaises(RustDevError):
                validate_rust_args(argparse.Namespace(**kwargs))

    def test_real_dev_cli_rejects_servers_before_build(self):
        with tempfile.TemporaryDirectory() as directory:
            initialize_rust(Path(directory), 'hello', str(SDK), 'none')
            # CLI StoreOnce disallows overriding rc flags; disable rc for this
            # explicit negative invocation rather than silently duplicating.
            (Path(directory) / '.rbtrc').unlink()
            result = subprocess.run([RBT, 'dev', 'run',
                                     '--rust', '--servers=2', '--application=backend/Cargo.toml'],
                                    cwd=directory, text=True, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('only 1', result.stdout + result.stderr)
            self.assertFalse((Path(directory) / '.rbt').exists())


class RuntimeTest(unittest.IsolatedAsyncioTestCase):
    async def test_missing_database_rejected_before_cargo_or_state(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'Cargo.toml').write_text('[package]\nname="hello"')
            with self.assertRaisesRegex(RustDevError, 'DATABASE_BINARY'):
                await run_rust_dev(manifest=root / 'Cargo.toml', database_binary=root / 'absent',
                                   state=root / 'state', application_name='hello')
            self.assertFalse((root / 'state').exists())

    async def test_insecure_database_requires_opt_in_before_cargo_or_state(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'Cargo.toml').write_text('[package]\nname="hello"')
            with self.assertRaisesRegex(RustDevError, '0.0.0.0 without authentication'):
                await run_rust_dev(manifest=root / 'Cargo.toml', database_binary=Path(sys.executable),
                                   state=root / 'state', application_name='hello')
            self.assertFalse((root / 'state').exists())

    async def test_owned_child_reaped_on_cancellation(self):
        entered = asyncio.Event()
        child = None
        async def operation():
            nonlocal child
            async with owned_process(sys.executable, '-c', 'import time; time.sleep(120)') as process:
                child = process
                entered.set()
                await asyncio.Future()
        task = asyncio.create_task(operation())
        await asyncio.wait_for(entered.wait(), 2)
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertIsNotNone(child.returncode)
        with self.assertRaises(ProcessLookupError):
            os.kill(child.pid, 0)

    async def test_startup_child_failure_is_not_readiness(self):
        async with owned_process(sys.executable, '-c', 'raise SystemExit(23)') as process:
            await process.wait()
            with self.assertRaisesRegex(RustDevError, 'exited 23'):
                await wait_for_port(process, 19999)

    async def test_early_child_exit_is_reaped(self):
        async with owned_process(sys.executable, '-c', 'raise SystemExit(7)') as process:
            await process.wait()
        self.assertEqual(process.returncode, 7)
        with self.assertRaises(ProcessLookupError):
            os.kill(process.pid, 0)

    async def test_exited_group_leader_does_not_orphan_descendant(self):
        import pyprctl
        pyprctl.set_child_subreaper(True)
        with tempfile.TemporaryDirectory() as directory:
            pid_file = Path(directory) / 'pid'
            script = ('import subprocess,sys; p=subprocess.Popen([sys.executable,"-c",'
                      '"import signal,time; signal.signal(signal.SIGTERM,signal.SIG_IGN); time.sleep(120)"]); '
                      'open(sys.argv[1],"w").write(str(p.pid))')
            async with owned_process(sys.executable, '-c', script, str(pid_file)) as process:
                await process.wait()
                descendant = int(pid_file.read_text())
                self.assertTrue(Path(f'/proc/{descendant}').exists())
            with self.assertRaises(ProcessLookupError):
                os.kill(descendant, 0)

    async def test_edit_consumed_during_build_triggers_another_build(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'source.rs'
            path.write_text('consumed input')
            patterns = [str(path)]
            consumed = asyncio.Event()
            release = asyncio.Event()
            compiled = []
            async def cargo(*args, **kwargs):
                compiled.append(path.read_text())
                consumed.set()
                await release.wait()
                return b''
            with patch('reboot.cli.commands.rust_dev.checked_command', cargo):
                build = asyncio.create_task(build_rust_app(Path(directory) / 'Cargo.toml', directory, {}, patterns))
                await asyncio.wait_for(consumed.wait(), 1)
                path.write_text('edited after Cargo consumed input')
                release.set()
                previous = await build
                self.assertEqual(compiled, ['consumed input'])
                await asyncio.wait_for(wait_for_change(patterns, previous), 1)
                previous = await build_rust_app(Path(directory) / 'Cargo.toml', directory, {}, patterns)
                self.assertEqual(compiled[-1], 'edited after Cargo consumed input')
                self.assertEqual(previous, snapshot(patterns))

    async def test_watch_detects_edit_and_delete(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'source.rs'
            path.write_text('before')
            patterns = [str(path)]
            previous = snapshot(patterns)
            path.write_text('after')
            await asyncio.wait_for(wait_for_change(patterns, previous), 1)
            previous = snapshot(patterns)
            path.unlink()
            await asyncio.wait_for(wait_for_change(patterns, previous), 1)



class HealthObserverCleanupTest(unittest.TestCase):
    """Fault injection checks resource cleanup, not native status delivery."""
    def fixture(self):
        spec = importlib.util.spec_from_file_location('health_fixture_cleanup', ROOT / 'tests/reboot/cli/fixtures/rust_http_request_fixture.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        obj = module.HttpRequestFixture.__new__(module.HttpRequestFixture)
        obj.grpc_port = 1
        obj.health_channel = obj.health_watch = obj.slow_socket = None
        obj.evidence = {}
        return obj

    def test_failed_watch_creation_and_first_frame_close_owned_channel(self):
        from types import SimpleNamespace
        from unittest.mock import Mock, MagicMock
        for failure in ['creation', 'first_frame']:
            with self.subTest(failure=failure):
                obj = self.fixture()
                channel = Mock()
                call = MagicMock()
                call.__next__ = Mock(side_effect=RuntimeError('injected first-frame failure'))
                stub = Mock()
                stub.Watch.side_effect = RuntimeError('injected creation failure') if failure == 'creation' else None
                stub.Watch.return_value = call
                modules = {
                    'grpc': SimpleNamespace(insecure_channel=Mock(return_value=channel)),
                    'grpc_health': SimpleNamespace(),
                    'grpc_health.v1': SimpleNamespace(health_pb2=SimpleNamespace(HealthCheckRequest=Mock()), health_pb2_grpc=SimpleNamespace(HealthStub=Mock(return_value=stub))),
                }
                with patch.dict(sys.modules, modules), self.assertRaises(RuntimeError):
                    obj.begin_slow_body()
                channel.close.assert_called_once()
                if failure == 'first_frame':
                    call.cancel.assert_called_once()
                self.assertIsNone(obj.health_channel)
                self.assertIsNone(obj.health_watch)

    def test_failed_shutdown_observation_closes_channel_and_partial_body_socket(self):
        from types import SimpleNamespace
        from unittest.mock import Mock, MagicMock
        obj = self.fixture()
        channel, sock = Mock(), Mock()
        call = MagicMock()
        call.__iter__.side_effect = RuntimeError('injected watch shutdown failure')
        obj.health_channel, obj.health_watch, obj.slow_socket = channel, call, sock
        modules = {'grpc_health': SimpleNamespace(), 'grpc_health.v1': SimpleNamespace(health_pb2=SimpleNamespace())}
        with patch.dict(sys.modules, modules), self.assertRaises(RuntimeError):
            obj.closed()
        channel.close.assert_called_once()
        call.cancel.assert_called_once()
        sock.close.assert_called_once()
        self.assertIsNone(obj.health_channel)
        self.assertIsNone(obj.health_watch)
        self.assertIsNone(obj.slow_socket)


if __name__ == '__main__':
    unittest.main(verbosity=2)
