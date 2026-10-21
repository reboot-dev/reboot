"""Focused signal-owner compatibility; not full CLI/native acceptance."""
import ast
import asyncio
import importlib.util
from pathlib import Path
import signal
import sys
import unittest
from unittest.mock import patch

# Keep the runfiles tree: resolving source symlinks can escape Bazel's
# declared data closure into the original checkout.
ROOT = Path(__file__).absolute().parents[3]
spec = importlib.util.spec_from_file_location(
    'rust_signal_ownership_subject', ROOT / 'reboot/cli/commands/rust_dev.py')
assert spec is not None and spec.loader is not None
rust = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rust)


class SignalOwnershipTests(unittest.IsolatedAsyncioTestCase):
    async def test_caller_owner_never_reads_or_replaces_handlers(self):
        @rust.cancel_on_terminal_signal
        async def operation(*, terminal_signals_owned_by_caller=False):
            return 17
        with patch.object(signal, 'getsignal', side_effect=AssertionError('nested lookup')), \
                patch.object(signal, 'signal', side_effect=AssertionError('nested owner')):
            self.assertEqual(await operation(terminal_signals_owned_by_caller=True), 17)

    async def test_caller_cancellation_joins_real_owned_child(self):
        ready = asyncio.Event()
        children = []
        finalized = []

        @rust.cancel_on_terminal_signal
        async def operation(*, terminal_signals_owned_by_caller=False):
            async with rust.owned_process(sys.executable, '-c', 'import time; time.sleep(60)') as child:
                children.append(child)
                try:
                    ready.set()
                    await asyncio.Future()
                finally:
                    finalized.append(True)

        with patch.object(signal, 'signal', side_effect=AssertionError('nested owner')):
            task = asyncio.create_task(operation(terminal_signals_owned_by_caller=True))
            try:
                await asyncio.wait_for(ready.wait(), 5)
            finally:
                task.cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await asyncio.wait_for(task, 10)
        self.assertEqual(finalized, [True])
        self.assertEqual(len(children), 1)
        self.assertIsNotNone(children[0].returncode)

    async def test_default_installs_and_restores_original_handlers(self):
        before = {s: signal.getsignal(s) for s in (signal.SIGTERM, signal.SIGINT)}

        @rust.cancel_on_terminal_signal
        async def operation():
            return 23

        with patch.object(signal, 'signal', wraps=signal.signal) as calls:
            self.assertEqual(await operation(), 23)
        self.assertEqual(calls.call_count, 4)
        self.assertEqual(before, {s: signal.getsignal(s) for s in before})

    async def test_unrelated_cancellation_is_not_signal_success(self):
        before = {s: signal.getsignal(s) for s in (signal.SIGTERM, signal.SIGINT)}

        @rust.cancel_on_terminal_signal
        async def operation():
            raise asyncio.CancelledError('unrelated')

        with self.assertRaises(asyncio.CancelledError):
            await operation()
        self.assertEqual(before, {s: signal.getsignal(s) for s in before})

    def test_normal_entrypoint_delegates_terminal_signal_ownership_to_cli_main(self):
        tree = ast.parse((ROOT / 'reboot/cli/commands/dev.py').read_text())
        calls = [node for node in ast.walk(tree) if isinstance(node, ast.Call)
                 and isinstance(node.func, ast.Name) and node.func.id == 'run_rust_dev']
        self.assertEqual(len(calls), 1)
        expression = next(keyword.value for keyword in calls[0].keywords
                          if keyword.arg == 'terminal_signals_owned_by_caller')
        if not isinstance(expression, ast.Constant):
            self.fail(f"expected literal signal-owner value, got {ast.dump(expression)}")
        self.assertIs(expression.value, True)


if __name__ == '__main__':
    unittest.main()
