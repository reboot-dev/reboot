import asyncio
import grpc
import os
import unittest
import unittest.mock
import uuid
from google.protobuf.empty_pb2 import Empty
from google.protobuf.timestamp_pb2 import Timestamp
from google.protobuf.wrappers_pb2 import StringValue
from rbt.v1alpha1 import database_pb2, tasks_pb2
from rbt.v1alpha1.errors_pb2 import (
    StateAlreadyConstructed,
    StateNotConstructed,
    Unavailable,
)
from reboot.aio.aborted import SystemAborted
from reboot.aio.contexts import (
    ContextT,
    EffectValidation,
    ReaderContext,
    TransactionContext,
    WorkflowContext,
    WriterContext,
)
from reboot.aio.headers import Headers
from reboot.aio.internals.channel_manager import _ChannelManager
from reboot.aio.internals.contextvars import Servicing, _servicing
from reboot.aio.internals.tasks_dispatcher import TasksDispatcher
from reboot.aio.placement import StaticPlacementClient
from reboot.aio.resolvers import NoResolver
from reboot.aio.servicers import RebootServiceable, Servicer
from reboot.aio.state_managers import (
    Effects,
    ScalableBloomFilter,
    SidecarStateManager,
)
from reboot.aio.tasks import TaskEffect
from reboot.aio.types import ApplicationId, StateId, StateRef, StateTypeName
from reboot.server.database import (
    DatabaseClient,
    DatabaseServer,
    NonexistentTaskId,
)
from reboot.uuidv7 import uuid7_timestamp_ms
from tempfile import TemporaryDirectory
from tests.reboot import greeter_rbt
from tests.reboot.greeter_servicers import MyGreeterServicer
from typing import Optional


class ScalableBloomFilterTestCase(unittest.IsolatedAsyncioTestCase):

    def test(self):
        """
        Tests that we can add keys and and check for presence and that we
        scale the filter correctly.
        """
        filter = ScalableBloomFilter()

        self.assertEqual(len(filter._filters), 1)

        self.assertEqual(
            filter._filters[0].capacity,
            ScalableBloomFilter.INITIAL_CAPACITY,
        )

        self.assertEqual(
            filter._filters[0].error_rate,
            ScalableBloomFilter.ERROR_RATE,
        )

        while len(filter._filters[0]) != ScalableBloomFilter.INITIAL_CAPACITY:
            filter.add(uuid.uuid4().bytes)

        # We should not have scaled yet.
        self.assertEqual(len(filter._filters), 1)

        # Now adding should scale up the bloom filter with a larger
        # capacity and smaller error rate (but we need to add until
        # we've actually _added_ since bloom filters are
        # probabilistic).
        while filter.add(uuid.uuid4().bytes):
            pass

        self.assertEqual(len(filter._filters), 2)

        self.assertEqual(
            filter._filters[1].capacity,
            ScalableBloomFilter.INITIAL_CAPACITY * 10,
        )

        self.assertEqual(
            filter._filters[1].error_rate,
            filter._filters[0].error_rate *
            ScalableBloomFilter.TIGHTENING_RATIO,
        )


class StateManagerTestCase(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        APPLICATION_ID = ApplicationId('test-app')
        SHARD_ID = "s000000000"

        self.directory = TemporaryDirectory()
        self.db_path = os.path.join(self.directory.name, 'rocksdb')
        shards = [
            database_pb2.ShardInfo(
                shard_id=SHARD_ID,
                shard_first_key=b"",
            )
        ]
        self.sidecar = DatabaseServer(
            self.db_path,
            database_pb2.ServerInfo(shard_infos=shards),
        )
        self.state_manager = SidecarStateManager(
            application_id=APPLICATION_ID,
            database_address=self.sidecar.address,
            serviceables=[RebootServiceable(MyGreeterServicer)],
            shards=shards,
            placement_client=StaticPlacementClient(
                shard_id=SHARD_ID,
                application_id=APPLICATION_ID,
                server_id="UNUSED",
                address="UNUSED",
            ),
        )
        self.channel_manager = _ChannelManager(NoResolver(), secure=False)

        # Call recover to register server ID and instance ID within the
        # database. `Recover` is a very first call from any server
        # during the startup.
        self.assertIsNone(self.state_manager._recovery_timestamp_ms)
        self.assertIsNone(self.state_manager._latest_timestamp_ms)
        self.assertIsNone(self.state_manager._timestamp_refresh_task)

        await self.state_manager.recover(
            application_id=APPLICATION_ID,
            channel_manager=self.channel_manager,
            middleware_by_state_type_name={},
        )

    async def _pretend_to_be_legacy_server(self):
        # Right now the `recover` call also fetches the recover timestamp
        # and starts the refresh loop, so to simulate a legacy server
        # and test backwards compatibility we cancel the refresh loop
        # and clear the recovery timestamp.
        try:
            assert self.state_manager._timestamp_refresh_task is not None
            self.state_manager._timestamp_refresh_task.cancel()
        except asyncio.CancelledError:
            pass
        self.state_manager._recovery_timestamp_ms = None

    async def asyncTearDown(self) -> None:
        # Shut down (in reverse order of startup) the background work
        # that we started in `asyncSetUp()`.
        await self.state_manager.shutdown_and_wait()
        self.sidecar.shutdown_and_wait()

    def create_test_context(
        self,
        context_type: type[ContextT],
        servicer_type: type[Servicer],
        state_id: StateId,
    ) -> ContextT:
        """Helper for creating a context in these tests; only necessary here
        because StateManager expects contexts."""
        state_ref = StateRef.from_id(
            servicer_type.__state_type_name__, state_id
        )
        _servicing.set(Servicing.INITIALIZING)
        kwargs: dict = dict(
            channel_manager=self.channel_manager,
            headers=Headers(
                application_id=ApplicationId('unused'),
                state_ref=state_ref,
            ),
            state_type_name=servicer_type.__state_type_name__,
            method="unused",
            effect_validation=EffectValidation.ENABLED,
        )
        if context_type == WorkflowContext:
            kwargs['reactively_state_manager'] = self.state_manager
            kwargs['reactively_state_type'] = servicer_type.__state_type__
        context = context_type(**kwargs)
        _servicing.set(Servicing.NO)
        return context

    def create_transaction_context(
        self,
        state_id: StateId,
        database_timestamp_ms: Optional[int] = None,
    ) -> TransactionContext:
        """Create a `TransactionContext` for testing."""
        state_ref = StateRef.from_id(
            MyGreeterServicer.__state_type_name__, state_id
        )
        _servicing.set(Servicing.INITIALIZING)
        context = TransactionContext(
            channel_manager=self.channel_manager,
            headers=Headers(
                application_id=ApplicationId('unused'),
                state_ref=state_ref,
            ),
            state_type_name=(MyGreeterServicer.__state_type_name__),
            method="unused",
            effect_validation=EffectValidation.ENABLED,
            database_timestamp_ms=database_timestamp_ms,
        )
        _servicing.set(Servicing.NO)
        return context

    def create_task_dispatcher_mock(self) -> TasksDispatcher:
        # These tests do not currently test task dispatch (that is covered in
        # `tasts_tests.py`). If they wanted to, then a real TasksDispatcher
        # with a mocked `dispatch` method might be used instead.
        return unittest.mock.MagicMock(spec=TasksDispatcher)

    async def test_load_is_none(self) -> None:
        """Test that loading state from an unconstructed actor is None (vs an
        empty bytes).
        """
        client = DatabaseClient(self.sidecar.address)
        state_type = MyGreeterServicer.__state_type_name__
        data: Optional[bytes] = await client.load_actor_state(
            state_type,
            StateRef.from_id(state_type, "test-1234"),
        )
        self.assertIsNone(data)

    async def test_reader_before_construction(self) -> None:
        """Test that a reader can't be called before constructing an actor."""
        with self.assertRaises(SystemAborted) as aborted:
            async with self.state_manager.reader(
                self.create_test_context(
                    ReaderContext, MyGreeterServicer, "test-1234"
                ),
                MyGreeterServicer.__state_type__,
                authorize=None,
            ):
                pass

        self.assertEqual(type(aborted.exception.error), StateNotConstructed)

    async def test_writer_requires_constructor(self) -> None:
        """Test that a writer can't be called if a constructor is defined."""
        with self.assertRaises(SystemAborted) as aborted:
            async with self.state_manager.writer(
                self.create_test_context(
                    WriterContext, MyGreeterServicer, "test-1234"
                ),
                MyGreeterServicer.__state_type__,
                self.create_task_dispatcher_mock(),
                authorize=None,
                requires_constructor=True,
            ):
                pass

        self.assertEqual(type(aborted.exception.error), StateNotConstructed)

        self.assertTrue(aborted.exception.error.requires_constructor)

    async def test_writer_and_constructor_after_construction(self) -> None:
        """Test that a writer can be called after construction but a
        constructor can not.
        """

        async def writer(*, from_constructor: bool):
            async with self.state_manager.writer(
                self.create_test_context(
                    WriterContext, MyGreeterServicer, "test-1234"
                ),
                MyGreeterServicer.__state_type__,
                self.create_task_dispatcher_mock(),
                authorize=None,
                from_constructor=from_constructor,
            ) as (state, writer):
                await writer.complete(
                    Effects(
                        state=greeter_rbt.Greeter.
                        State(title='Dr', name='Jonathan', adjective='best')
                    )
                )

        # Construct an actor, this can come from a writer or
        # constructor because we don't 'requires_constructor'.
        await writer(from_constructor=True)

        # We should be able to call writers on the actor.
        await writer(from_constructor=False)

        # But we can't call constructors.
        with self.assertRaises(SystemAborted) as aborted:
            await writer(from_constructor=True)

        self.assertEqual(
            type(aborted.exception.error), StateAlreadyConstructed
        )

    async def test_writer_reader(self) -> None:
        """Test that after a writer is called a reader can be called and sees
        the updated state.
        """
        async with self.state_manager.writer(
            self.create_test_context(
                WriterContext, MyGreeterServicer, "test-1234"
            ),
            MyGreeterServicer.__state_type__,
            self.create_task_dispatcher_mock(),
            authorize=None,
        ) as (state, writer):
            self.assertEqual(state, greeter_rbt.Greeter.State())
            await writer.complete(
                Effects(
                    state=greeter_rbt.Greeter.
                    State(title='Dr', name='Jonathan', adjective='best')
                )
            )

        async with self.state_manager.reader(
            self.create_test_context(
                ReaderContext, MyGreeterServicer, "test-1234"
            ),
            MyGreeterServicer.__state_type__,
            authorize=None,
        ) as state:
            self.assertEqual(state.title, 'Dr')
            self.assertEqual(state.name, 'Jonathan')
            self.assertEqual(state.adjective, 'best')

    async def test_multiple_readers(self) -> None:
        """Test that multiple readers have their own copy of state so that if
        they change it other readers won't be impacted.
        """
        async with self.state_manager.writer(
            self.create_test_context(
                WriterContext, MyGreeterServicer, "test-1234"
            ),
            MyGreeterServicer.__state_type__,
            self.create_task_dispatcher_mock(),
            authorize=None,
        ) as (state, writer):
            self.assertEqual(state, greeter_rbt.Greeter.State())
            await writer.complete(
                Effects(
                    state=greeter_rbt.Greeter.
                    State(title='Dr', name='Jonathan', adjective='best')
                )
            )

        # Use an event to ensure that our readers overlap computation
        # with one another to properly test that each reader can not
        # impact another readers state.
        event = asyncio.Event()

        async def reader(*, setter: bool):
            async with self.state_manager.reader(
                self.create_test_context(
                    ReaderContext, MyGreeterServicer, "test-1234"
                ),
                MyGreeterServicer.__state_type__,
                authorize=None,
            ) as state:
                self.assertEqual(
                    state,
                    greeter_rbt.Greeter.State(
                        title='Dr', name='Jonathan', adjective='best'
                    )
                )
                if setter:
                    state.title = 'setter'
                    event.set()
                else:
                    await event.wait()
                    # Despite that the setter has now demonstrably run,
                    # this reader's state still has the original title.
                    self.assertEqual(state.title, 'Dr')

        await asyncio.gather(reader(setter=False), reader(setter=True))

    async def test_writer_does_not_block_reader(self) -> None:
        """Test that a reader can execute concurrently with a writer."""
        # Use an event to ensure that the reader overlaps computation
        # with the writer.
        event = asyncio.Event()

        async def reader():
            async with self.state_manager.reader(
                self.create_test_context(
                    ReaderContext, MyGreeterServicer, "test-1234"
                ),
                MyGreeterServicer.__state_type__,
                authorize=None,
            ) as state:
                self.assertEqual(
                    state,
                    greeter_rbt.Greeter.State(
                        title='Dr', name='Jonathan', adjective='best'
                    )
                )
                event.set()

        async with self.state_manager.writer(
            self.create_test_context(
                WriterContext, MyGreeterServicer, "test-1234"
            ),
            MyGreeterServicer.__state_type__,
            self.create_task_dispatcher_mock(),
            authorize=None,
        ) as (state, writer):
            self.assertEqual(state, greeter_rbt.Greeter.State())
            await writer.complete(
                Effects(
                    state=greeter_rbt.Greeter.
                    State(title='Dr', name='Jonathan', adjective='best')
                )
            )
            state.title = 'writer'
            task = asyncio.create_task(reader())
            await event.wait()
            self.assertEqual(state.title, 'writer')
            await task

    async def test_load_nonexistent_task(self) -> None:
        """Test that loading the response for an unknown task raises a
        ValueError."""
        with self.assertRaises(NonexistentTaskId):
            client = DatabaseClient(self.sidecar.address)
            await client.load_task_response(
                tasks_pb2.TaskId(
                    state_type='default',
                    state_ref=StateRef.from_id(
                        StateTypeName('default'), 'nonexistent'
                    ).to_str(),
                    task_uuid=b'nonexistent',
                ),
            )

    async def test_store_load_task(self) -> None:
        """Test that a task can be created, a response can be stored, and the
        response can be loaded afterwards."""
        state_type = StateTypeName('tests.reboot.Greeter')
        state_id = 'test-1234'
        state_ref = StateRef.from_id(state_type, state_id)
        task_effect = TaskEffect(
            state_type=state_type,
            state_ref=state_ref,
            method_name='MyCoolMethod',
            request=Empty(),
        )

        # Run a writer to store a state update and create a task.
        async with self.state_manager.writer(
            self.create_test_context(
                WriterContext, MyGreeterServicer, state_id
            ),
            MyGreeterServicer.__state_type__,
            self.create_task_dispatcher_mock(),
            authorize=None,
        ) as (state, writer):
            self.assertEqual(state, greeter_rbt.Greeter.State())
            await writer.complete(
                Effects(
                    state=greeter_rbt.Greeter.State(
                        title='Dr', name='Jonathan', adjective='best'
                    ),
                    tasks=[task_effect],
                ),
            )

        # Try to load the task response - it should be None as the task
        # has not been marked as complete, but it should not throw (since the
        # task has been created).
        client = DatabaseClient(self.sidecar.address)
        response_or_error: Optional[tuple[
            tasks_pb2.TaskResponseOrError,
            database_pb2.Task,
        ]] = await client.load_task_response(task_effect.task_id)
        self.assertIsNone(response_or_error)

        # Complete the task.
        task_response_string = "task response here"
        async with self.state_manager.task_workflow(
            self.create_test_context(
                WorkflowContext, MyGreeterServicer, state_id
            ),
            task_effect,
            on_loop_iteration=(lambda iteration, _: None),
            validating_effects=False,
        ) as complete:
            await complete(
                task_effect,
                (StringValue(value=task_response_string), None),
            )

        # Reload the task response and see the stored value.
        response_or_error = await client.load_task_response(
            task_effect.task_id
        )
        assert response_or_error is not None
        any_response = response_or_error[0].response
        response = StringValue()
        any_response.Unpack(response)
        self.assertEqual(response.value, task_response_string)

    async def test_recover_nothing_saved(self) -> None:
        """Test that calling recover() on an empty database (i.e. on first
        startup) returns successfully with no state recovered."""
        await self.state_manager.recover(
            application_id='unused',
            channel_manager=self.channel_manager,
            middleware_by_state_type_name={},
        )

    async def test_timestamps_set_after_recover(self):
        """Test that `recover()` extracts the recovery timestamp
        from the database response and also sets latest to it.
        """
        # After recovery, the timestamp should be set.
        assert self.state_manager._recovery_timestamp_ms is not None
        assert self.state_manager._latest_timestamp_ms is not None

        # The "recovery" and "latest" timestamps should be the same to start.
        self.assertEqual(
            self.state_manager._latest_timestamp_ms,
            self.state_manager._recovery_timestamp_ms,
        )

        # It should be a reasonable millisecond timestamp.
        import time
        now_ms = int(time.time() * 1000)
        self.assertAlmostEqual(
            self.state_manager._recovery_timestamp_ms,
            now_ms,
            delta=5000,
        )

    async def test_recovery_starts_refresh_loop(self):
        """Test that `recover()` starts the periodic timestamp
        refresh task.
        """
        # The refresh task should be started after recovery.
        assert self.state_manager._timestamp_refresh_task is not None

    async def test_update_latest_timestamp_resets_refresh(self):
        """Test that `_update_latest_timestamp()` sets the
        refresh event to reset the periodic timer.
        """
        self.state_manager._latest_timestamp_ms = 1000

        # Event should not be set initially.
        self.assertFalse(self.state_manager._timestamp_refresh_event.is_set())

        # Update with a newer timestamp.
        timestamp = Timestamp()
        timestamp.FromMilliseconds(2000)
        self.state_manager._update_latest_timestamp(timestamp)

        # Latest timestamp should be updated.
        self.assertEqual(self.state_manager._latest_timestamp_ms, 2000)

        # Event should be set (to reset the refresh timer).
        self.assertTrue(self.state_manager._timestamp_refresh_event.is_set())

    async def test_update_latest_timestamp_only_increases(self):
        """Test that `_update_latest_timestamp()` only increases
        the stored value, never decreases it.
        """
        self.state_manager._latest_timestamp_ms = 5000

        # Try to update with an older timestamp.
        timestamp = Timestamp()
        timestamp.FromMilliseconds(3000)
        self.state_manager._update_latest_timestamp(timestamp)

        # Should still be 5000.
        self.assertEqual(self.state_manager._latest_timestamp_ms, 5000)

    async def test_update_latest_timestamp_ignores_none(self):
        """Test that `_update_latest_timestamp(None)` is a
        no-op.
        """
        self.state_manager._latest_timestamp_ms = 5000
        self.state_manager._update_latest_timestamp(None)
        self.assertEqual(self.state_manager._latest_timestamp_ms, 5000)

    async def test_refresh_timestamp_returns_valid_timestamp(self):
        """Test that `refresh_timestamp()` on the database
        client returns a valid `Timestamp`.
        """
        client = DatabaseClient(self.sidecar.address)
        timestamp = await client.refresh_timestamp()
        self.assertIsInstance(timestamp, Timestamp)

        import time
        now_ms = int(time.time() * 1000)
        self.assertAlmostEqual(
            timestamp.ToMilliseconds(),
            now_ms,
            delta=5000,
        )

    async def test_store_returns_piggybacked_timestamp(self):
        """Test that `store()` returns a piggybacked
        `Timestamp` from the database response.
        """
        client = DatabaseClient(self.sidecar.address)

        state_type = MyGreeterServicer.__state_type_name__
        state_ref = StateRef.from_id(state_type, "test-1234")

        timestamp = await client.store(
            [
                database_pb2.Actor(
                    state_type=state_type,
                    state_ref=state_ref.to_str(),
                    state=b"test",
                )
            ],
            [],
            [],
            [],
        )

        assert timestamp is not None
        assert isinstance(timestamp, Timestamp)

        import time
        now_ms = int(time.time() * 1000)
        self.assertAlmostEqual(
            timestamp.ToMilliseconds(),
            now_ms,
            delta=5000,
        )

    async def test_uuid4_transaction_id_falls_back_to_disk_write(self):
        """Test that a UUIDv4 transaction ID (from an older coordinator) falls
        back to the normal disk-write path.
        """
        # Simulate recovery by setting the recovery timestamp.
        self.state_manager._recovery_timestamp_ms = 1000

        # Create a transaction context without a database timestamp.
        context = self.create_transaction_context(
            "test-1234",
            database_timestamp_ms=None,
        )
        # Verify the transaction ID is a UUIDv4.
        self.assertEqual(context.transaction_ids[0].version, 4)

        # UUIDv4 transactions should have the legacy behavior.
        async with self.state_manager.transactionally(
            context,
            self.create_task_dispatcher_mock(),
            aborted_type=None,
        ) as transaction:
            self.assertIsNotNone(transaction)
            # Legacy behavior is the transaction should be stored.
            self.assertTrue(transaction._stored)

    async def test_uuid7_transaction_id(self):
        """Test that a UUIDv7 with a timestamp equal to or newer than the
        recovery timestamp means the transaction does not get stored.
        """
        # Server recovered at time 1000.
        self.state_manager._recovery_timestamp_ms = 1000

        # Transaction created at time 2000 (after recovery).
        context = self.create_transaction_context(
            "test-1234",
            database_timestamp_ms=2000,
        )
        # Verify the transaction ID is a UUIDv7.
        self.assertEqual(context.transaction_ids[0].version, 7)

        # This should NOT raise. We enter the transactionally context
        # and yield a transaction.
        async with self.state_manager.transactionally(
            context,
            self.create_task_dispatcher_mock(),
            aborted_type=None,
        ) as transaction:
            # Transaction should be created successfully.
            self.assertIsNotNone(transaction)
            # And the transaction should not be stored.
            self.assertFalse(transaction._stored)

    async def test_stale_uuid7_transaction_id_raises_unavailable(self):
        """Test that a UUIDv7 with a timestamp older than the recovery
        timestamp raises UNAVAILABLE.
        """
        # Server recovered at time 5000.
        self.state_manager._recovery_timestamp_ms = 5000

        # Transaction was created at time 3000 (before recovery).
        context = self.create_transaction_context(
            "test-1234",
            database_timestamp_ms=3000,
        )
        # Verify the transaction ID is a UUIDv7.
        self.assertEqual(context.transaction_ids[0].version, 7)
        self.assertLess(uuid7_timestamp_ms(context.transaction_ids[0]), 5000)

        with self.assertRaises(SystemAborted) as aborted:
            async with self.state_manager.transactionally(
                context,
                self.create_task_dispatcher_mock(),
                aborted_type=None,
            ):
                pass

        self.assertEqual(type(aborted.exception.error), Unavailable)
        self.assertEqual(aborted.exception.code, grpc.StatusCode.UNAVAILABLE)
        assert aborted.exception.message is not None
        self.assertIn("retry required", aborted.exception.message)

    async def test_no_recovery_timestamp_allows_uuid4_transaction_id(self):
        """Test that when recovery timestamp is not set (legacy server),
        UUIDv4 transactions proceed normally without raising
        UNAVAILABLE.
        """
        await self._pretend_to_be_legacy_server()

        # No recovery timestamp set (legacy path).
        self.assertIsNone(self.state_manager._recovery_timestamp_ms)

        # Create a transaction context without a database timestamp.
        context = self.create_transaction_context(
            "test-1234",
            database_timestamp_ms=None,
        )
        # Verify the transaction ID is a UUIDv4.
        self.assertEqual(context.transaction_ids[0].version, 4)

        # This should NOT raise because there is no recovery timestamp
        # to compare against.
        async with self.state_manager.transactionally(
            context,
            self.create_task_dispatcher_mock(),
            aborted_type=None,
        ) as transaction:
            self.assertIsNotNone(transaction)
            # Legacy behavior is the transaction should be stored.
            self.assertTrue(transaction._stored)

    async def test_no_recovery_timestamp_allows_uuid7_transaction_id(self):
        """Test that when recovery timestamp is not set (legacy server),
        UUIDv7 transactions (newer coordinator) have the legacy
        behavior (storing the transaction).
        """
        await self._pretend_to_be_legacy_server()

        # No recovery timestamp set (legacy path).
        self.assertIsNone(self.state_manager._recovery_timestamp_ms)

        # Create a transaction context without a database timestamp.
        context = self.create_transaction_context(
            "test-1234",
            database_timestamp_ms=1000,
        )
        # Verify the transaction ID is a UUIDv7.
        self.assertEqual(context.transaction_ids[0].version, 7)

        # This should NOT raise because there is no recovery timestamp
        # to compare against.
        async with self.state_manager.transactionally(
            context,
            self.create_task_dispatcher_mock(),
            aborted_type=None,
        ) as transaction:
            self.assertIsNotNone(transaction)
            # Legacy behavior is the transaction should be stored.
            self.assertTrue(transaction._stored)


if __name__ == '__main__':
    unittest.main()
