import unittest
from reboot.aio.applications import Application
from reboot.aio.contexts import (
    Context,
    ContextVia,
    EffectValidation,
    ReaderContext,
    TransactionContext,
    WorkflowContext,
    WriterContext,
    assert_context_type,
)
from reboot.aio.external import ExternalContext, InitializeContext
from reboot.aio.headers import STATE_REF_HEADER, Headers
from reboot.aio.internals.channel_manager import _ChannelManager
from reboot.aio.resolvers import NoResolver
from reboot.aio.tests import Reboot
from reboot.aio.types import ApplicationId, StateRef
from tests.reboot.greeter_rbt import Greeter
from tests.reboot.greeter_servicers import MyGreeterServicer
from typing import TypeVar
from unittest import mock


class ContextTestCase(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_context_not_constructible(self) -> None:
        with self.assertRaises(RuntimeError) as error:
            ReaderContext(
                channel_manager=_ChannelManager(NoResolver(), secure=False),
                headers=Headers(
                    application_id=ApplicationId('application_id'),
                    state_ref=StateRef.from_id(
                        Greeter.__state_type_name__, 'state_ref'
                    ),
                ),
                state_type_name=MyGreeterServicer.__state_type_name__,
                method='unused',
                effect_validation=EffectValidation.ENABLED,
            )

        self.assertIn(
            'Context should only be constructed by middleware',
            str(error.exception)
        )

    async def test_context_not_constructible_in_actor(self) -> None:
        await self.rbt.up(Application(servicers=[MyGreeterServicer]))

        context = self.rbt.create_external_context(name=self.id())

        greeter, response = await Greeter.Create(
            context,
            title='Dr',
            name='Jonathan',
            adjective='best',
        )

        with self.assertRaises(
            Greeter.TryToConstructContextAborted
        ) as aborted:
            await greeter.TryToConstructContext(context)

        self.assertIn(
            'Context should only be constructed by middleware',
            str(aborted.exception)
        )

    async def test_no_crash_if_bad_headers(self) -> None:
        """Tests that the generated code that constructs the context fails
        gracefully if the headers for the context are not set correctly."""
        await self.rbt.up(Application(servicers=[MyGreeterServicer]))
        context = self.rbt.create_external_context(name=self.id())

        # Create a fake version of `Headers.to_grpc_metadata` that removes the
        # state ref header, which is required.
        real_to_grpc_metadata = Headers.to_grpc_metadata

        def fake_to_grpc_metadata(self):
            grpc_metadata = real_to_grpc_metadata(self)
            # Remove the required state ref header.
            grpc_metadata = tuple(
                header_pair for header_pair in grpc_metadata
                if header_pair[0] != STATE_REF_HEADER
            )
            return grpc_metadata

        # On the next call, fail to set the state ref header. The server
        # should fail gracefully.
        with mock.patch(
            'reboot.aio.headers.Headers.to_grpc_metadata',
            fake_to_grpc_metadata
        ):
            with self.assertRaises(Greeter.CreateAborted) as aborted:
                await Greeter.Create(
                    context,
                    title='Dr',
                    name='Jonathan',
                    adjective='best',
                )

            self.assertIn('gRPC metadata missing', str(aborted.exception))


_ContextT = TypeVar('_ContextT', bound=Context | ExternalContext)


def _bare(cls: type[_ContextT]) -> _ContextT:
    """A context instance without running its `__init__`, which would
    need a running application; `assert_context_type` only performs
    `isinstance` checks on the instance."""
    return object.__new__(cls)


_TIP = (
    'Tip: running a type checker such as `mypy` on your code reports '
    'this mistake before your code runs.'
)


class AssertContextTypeTestCase(unittest.TestCase):

    def test_expected_context_passes(self) -> None:
        assert_context_type(
            _bare(TransactionContext),
            [TransactionContext],
            via='schedule',
            method='post_open',
        )
        # A subclass of an expected type passes too.
        assert_context_type(
            _bare(InitializeContext),
            [WorkflowContext, ExternalContext],
            via='spawn',
            method='post_open',
        )

    def test_schedule_from_workflow(self) -> None:
        with self.assertRaises(TypeError) as e:
            assert_context_type(
                _bare(WorkflowContext),
                [TransactionContext],
                via='schedule',
                method='sync_poggio',
            )

        self.assertEqual(
            str(e.exception),
            '`schedule()` can not be used from within a `workflow`: '
            '`schedule(...).sync_poggio(...)` was passed `WorkflowContext` '
            'but expects `TransactionContext`. Use `spawn()` instead: '
            'replace `.schedule(` with `.spawn(` and leave the rest of the '
            'call as is. Note that `spawn()` returns a task object rather '
            "than a task ID; `await` it to get the method's response, or use "
            f'its `.task_id` property. {_TIP}',
        )

    def test_schedule_from_outside_reboot(self) -> None:
        with self.assertRaises(TypeError) as e:
            assert_context_type(
                _bare(ExternalContext),
                [TransactionContext],
                via='schedule',
                method='sync_poggio',
            )

        self.assertIn(
            '`schedule()` can not be used from outside of Reboot: '
            '`schedule(...).sync_poggio(...)` was passed `ExternalContext`',
            str(e.exception),
        )
        self.assertIn(
            'replace `.schedule(` with `.spawn(`',
            str(e.exception),
        )

    def test_schedule_from_writer_for_another_state(self) -> None:
        with self.assertRaises(TypeError) as e:
            assert_context_type(
                _bare(WriterContext),
                [TransactionContext],
                via='schedule',
                method='sync_poggio',
            )

        self.assertIn(
            'A `writer` can only schedule tasks for its own state',
            str(e.exception),
        )
        self.assertIn('`self.ref().schedule(...)`', str(e.exception))
        self.assertIn(
            'make the calling method a `transaction`',
            str(e.exception),
        )

    def test_schedule_from_reader(self) -> None:
        with self.assertRaises(TypeError) as e:
            assert_context_type(
                _bare(ReaderContext),
                [WriterContext, TransactionContext],
                via='schedule',
                method='sync_poggio',
            )

        self.assertIn(
            'A `reader` can not schedule tasks because a `reader` can not '
            'have effects: `schedule(...).sync_poggio(...)` was passed '
            '`ReaderContext` but expects one of `WriterContext`, '
            '`TransactionContext`.',
            str(e.exception),
        )

    def test_spawn_from_transaction(self) -> None:
        with self.assertRaises(TypeError) as e:
            assert_context_type(
                _bare(TransactionContext),
                [WorkflowContext, ExternalContext],
                via='spawn',
                method='sync_poggio',
            )

        self.assertIn(
            '`spawn()` can not be used from within a `transaction`: '
            '`spawn(...).sync_poggio(...)` was passed `TransactionContext` '
            'but expects one of `WorkflowContext`, `ExternalContext`. '
            'Use `schedule()` instead: replace `.spawn(` with `.schedule(`',
            str(e.exception),
        )
        self.assertIn(
            'returns a task ID rather than a task object',
            str(e.exception),
        )

    def test_spawn_from_writer(self) -> None:
        with self.assertRaises(TypeError) as e:
            assert_context_type(
                _bare(WriterContext),
                [WorkflowContext, ExternalContext],
                via='spawn',
                method='sync_poggio',
            )

        self.assertIn(
            '`spawn()` can not be used from within a `writer`',
            str(e.exception),
        )
        self.assertIn(
            'Use `self.ref().schedule(...)` instead',
            str(e.exception),
        )

    def test_spawn_from_reader(self) -> None:
        with self.assertRaises(TypeError) as e:
            assert_context_type(
                _bare(ReaderContext),
                [WorkflowContext, ExternalContext],
                via='spawn',
                method='sync_poggio',
            )

        self.assertIn(
            'A `reader` can not spawn tasks because a `reader` can not have '
            'effects',
            str(e.exception),
        )

    def test_reactively_from_writer(self) -> None:
        with self.assertRaises(TypeError) as e:
            assert_context_type(
                _bare(WriterContext),
                [ExternalContext, ReaderContext, WorkflowContext],
                via='reactively',
                method='balance',
            )

        self.assertIn(
            '`reactively()` can only be used from within a `reader` or a '
            '`workflow`, or from outside of Reboot: '
            '`reactively(...).balance(...)` was passed `WriterContext` but '
            'expects one of `ExternalContext`, `ReaderContext`, '
            '`WorkflowContext`. Call the method directly instead: remove '
            '`.reactively()` from the call.',
            str(e.exception),
        )

    def test_until_from_transaction(self) -> None:
        with self.assertRaises(TypeError) as e:
            assert_context_type(
                _bare(TransactionContext),
                [WorkflowContext],
                via='until',
                method='balance',
            )

        self.assertIn(
            '`until()` can only be used from within a `workflow`: '
            '`until(...).balance(...)` was passed `TransactionContext` but '
            'expects `WorkflowContext`.',
            str(e.exception),
        )

    def test_not_a_context(self) -> None:

        class SyncPoggioRequest:
            pass

        with self.assertRaises(TypeError) as e:
            assert_context_type(
                SyncPoggioRequest(),  # type: ignore[arg-type]
                [TransactionContext],
                via='schedule',
                method='sync_poggio',
            )

        self.assertEqual(
            str(e.exception),
            '`schedule(...).sync_poggio(...)` expects `TransactionContext` '
            'as its first argument but was passed `SyncPoggioRequest`. '
            "Pass the calling method's `context` as the first argument, "
            f'e.g., `sync_poggio(context, ...)`. {_TIP}',
        )

        with self.assertRaises(TypeError) as e:
            assert_context_type(
                None,  # type: ignore[arg-type]
                [TransactionContext],
                via='schedule',
                method='sync_poggio',
            )

        self.assertIn('but was passed `None`', str(e.exception))

    def test_every_message_recommends_a_type_checker(self) -> None:
        cases: list[tuple[ContextVia, list[type], object]] = [
            ('schedule', [TransactionContext], _bare(WorkflowContext)),
            ('schedule', [TransactionContext], _bare(WriterContext)),
            ('schedule', [TransactionContext], _bare(ReaderContext)),
            ('spawn', [WorkflowContext], _bare(TransactionContext)),
            ('spawn', [WorkflowContext], _bare(ReaderContext)),
            ('reactively', [ReaderContext], _bare(TransactionContext)),
            ('until', [WorkflowContext], _bare(ReaderContext)),
            ('schedule', [TransactionContext], object()),
        ]
        for via, expected, context in cases:
            with self.assertRaises(TypeError) as e:
                assert_context_type(
                    context,  # type: ignore[arg-type]
                    expected,
                    via=via,
                    method='sync_poggio',
                )
            self.assertTrue(
                str(e.exception).endswith(_TIP),
                str(e.exception),
            )


if __name__ == '__main__':
    unittest.main()
