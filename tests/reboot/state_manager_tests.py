import asyncio
import grpc
import os
import unittest
import unittest.mock
import uuid
from datetime import timedelta
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
    Lock,
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


class LockTest(unittest.IsolatedAsyncioTestCase):

    async def test_initial_state_is_unlocked(self) -> None:
        lock = Lock()
        self.assertFalse(lock.is_locked())
        self.assertFalse(lock.is_shared_locked())
        self.assertFalse(lock.is_exclusive_locked())

    async def test_acquire_shared_grants_immediately(self) -> None:
        lock = Lock()
        await lock.acquire_shared(deadline=None)
        self.assertTrue(lock.is_shared_locked())
        self.assertFalse(lock.is_exclusive_locked())
        lock.release_shared()
        self.assertFalse(lock.is_locked())

    async def test_acquire_exclusive_grants_immediately(self) -> None:
        lock = Lock()
        await lock.acquire_exclusive(deadline=None)
        self.assertTrue(lock.is_exclusive_locked())
        self.assertFalse(lock.is_shared_locked())
        lock.release_exclusive()
        self.assertFalse(lock.is_locked())

    async def test_two_shared_holders_run_concurrently(self) -> None:
        """Two `acquire_shared` calls both succeed without either
        blocking."""
        lock = Lock()
        await lock.acquire_shared(deadline=None)
        # A second shared acquire should be immediate; if it were
        # blocking we would hang here rather than the explicit
        # timeout below.
        await asyncio.wait_for(lock.acquire_shared(deadline=None), timeout=1.0)
        self.assertTrue(lock.is_shared_locked())
        lock.release_shared()
        lock.release_shared()
        self.assertFalse(lock.is_locked())

    async def test_exclusive_waits_for_shared(self) -> None:
        lock = Lock()
        await lock.acquire_shared(deadline=None)

        exclusive_acquired = asyncio.Event()

        async def exclusive() -> None:
            await lock.acquire_exclusive(deadline=None)
            exclusive_acquired.set()

        exclusive_task = asyncio.create_task(exclusive())
        # Exclusive must not have acquired yet.
        await asyncio.sleep(0)
        self.assertFalse(exclusive_acquired.is_set())
        # Release the shared hold and the exclusive should proceed.
        lock.release_shared()
        await asyncio.wait_for(exclusive_acquired.wait(), timeout=1.0)
        self.assertTrue(lock.is_exclusive_locked())
        lock.release_exclusive()
        await exclusive_task

    async def test_shared_waits_for_exclusive(self) -> None:
        lock = Lock()
        await lock.acquire_exclusive(deadline=None)

        shared_acquired = asyncio.Event()

        async def shared() -> None:
            await lock.acquire_shared(deadline=None)
            shared_acquired.set()

        shared_task = asyncio.create_task(shared())
        await asyncio.sleep(0)
        self.assertFalse(shared_acquired.is_set())
        lock.release_exclusive()
        await asyncio.wait_for(shared_acquired.wait(), timeout=1.0)
        self.assertTrue(lock.is_shared_locked())
        lock.release_shared()
        await shared_task

    async def test_exclusive_starvation_guard(self) -> None:
        """A fresh `acquire_shared` arriving after an exclusive
        waiter is queued does not join the active shared cohort: it
        queues behind the exclusive waiter.
        """
        lock = Lock()
        await lock.acquire_shared(deadline=None)

        exclusive_acquired = asyncio.Event()
        late_shared_acquired = asyncio.Event()

        async def exclusive() -> None:
            await lock.acquire_exclusive(deadline=None)
            exclusive_acquired.set()

        async def late_shared() -> None:
            await lock.acquire_shared(deadline=None)
            late_shared_acquired.set()

        exclusive_task = asyncio.create_task(exclusive())
        # Give the exclusive a chance to queue.
        await asyncio.sleep(0)
        late_shared_task = asyncio.create_task(late_shared())
        await asyncio.sleep(0)

        # Neither queued waiter has acquired yet.
        self.assertFalse(exclusive_acquired.is_set())
        self.assertFalse(late_shared_acquired.is_set())

        # Release the original shared hold; the exclusive should win,
        # not the late shared.
        lock.release_shared()
        await asyncio.wait_for(exclusive_acquired.wait(), timeout=1.0)
        self.assertFalse(late_shared_acquired.is_set())
        lock.release_exclusive()
        await asyncio.wait_for(late_shared_acquired.wait(), timeout=1.0)
        lock.release_shared()
        await exclusive_task
        await late_shared_task

    async def test_upgrade_when_sole_shared_holder_is_immediate(
        self,
    ) -> None:
        lock = Lock()
        await lock.acquire_shared(deadline=None)
        await asyncio.wait_for(lock.upgrade(deadline=None), timeout=1.0)
        self.assertTrue(lock.is_exclusive_locked())
        self.assertFalse(lock.is_shared_locked())
        lock.release_exclusive()

    async def test_upgrade_beats_queued_exclusive(self) -> None:
        """A shared-to-exclusive upgrade jumps past exclusive waiters
        queued for the lock — this preserves the upgrading
        transaction's shared-consistent view of the state.
        """
        lock = Lock()
        await lock.acquire_shared(deadline=None)

        queued_exclusive_acquired = asyncio.Event()

        async def queued_exclusive() -> None:
            await lock.acquire_exclusive(deadline=None)
            queued_exclusive_acquired.set()

        # Queue an exclusive waiter behind the shared hold.
        queued_exclusive_task = asyncio.create_task(queued_exclusive())
        await asyncio.sleep(0)

        # Upgrade should be immediate (we are sole shared holder) and
        # the queued exclusive must NOT have been granted in the
        # meantime.
        await asyncio.wait_for(lock.upgrade(deadline=None), timeout=1.0)
        self.assertTrue(lock.is_exclusive_locked())
        self.assertFalse(queued_exclusive_acquired.is_set())

        # Release; the queued exclusive can now proceed.
        lock.release_exclusive()
        await asyncio.wait_for(queued_exclusive_acquired.wait(), timeout=1.0)
        lock.release_exclusive()
        await queued_exclusive_task

    async def test_upgrade_waits_for_other_shared_holders_to_drain(
        self,
    ) -> None:
        lock = Lock()
        await lock.acquire_shared(deadline=None)
        await lock.acquire_shared(deadline=None)  # Second shared holder.

        upgraded = asyncio.Event()

        async def upgrader() -> None:
            await lock.upgrade(deadline=None)
            upgraded.set()

        upgrader_task = asyncio.create_task(upgrader())
        await asyncio.sleep(0)
        # Other shared holder still holds the lock; upgrade must wait.
        self.assertFalse(upgraded.is_set())

        # Release the second shared holder; upgrade should now be
        # granted.
        lock.release_shared()
        await asyncio.wait_for(upgraded.wait(), timeout=1.0)
        self.assertTrue(lock.is_exclusive_locked())
        lock.release_exclusive()
        await upgrader_task

    async def test_second_upgrade_fast_fails(self) -> None:
        """Two shared holders both trying to upgrade is a deadlock
        by construction. The lock should fast-fail the second
        attempt.
        """
        lock = Lock()
        await lock.acquire_shared(deadline=None)
        await lock.acquire_shared(deadline=None)

        # The first upgrade waits for the other shared holder to
        # drain.
        first_upgrade_task = asyncio.create_task(lock.upgrade(deadline=None))
        await asyncio.sleep(0)
        self.assertFalse(first_upgrade_task.done())

        # The second upgrade attempt must fail immediately.
        with self.assertRaises(SystemAborted) as aborted:
            await lock.upgrade(deadline=None)
        self.assertEqual(type(aborted.exception.error), Unavailable)

        # Cleanup: release the other shared holder so the first
        # upgrade completes, then release the exclusive hold.
        lock.release_shared()
        await asyncio.wait_for(first_upgrade_task, timeout=1.0)
        lock.release_exclusive()

    async def test_downgrade_when_sole_holder(self) -> None:
        lock = Lock()
        await lock.acquire_exclusive(deadline=None)
        lock.downgrade()
        self.assertTrue(lock.is_shared_locked())
        self.assertFalse(lock.is_exclusive_locked())
        lock.release_shared()
        self.assertFalse(lock.is_locked())

    async def test_downgrade_grants_queued_shared(self) -> None:
        """Downgrading from exclusive to shared lets a queued shared
        waiter join the (now shared) holder."""
        lock = Lock()
        await lock.acquire_exclusive(deadline=None)

        queued_shared_acquired = asyncio.Event()

        async def queued_shared() -> None:
            await lock.acquire_shared(deadline=None)
            queued_shared_acquired.set()

        queued_shared_task = asyncio.create_task(queued_shared())
        await asyncio.sleep(0)
        # The exclusive hold blocks the shared waiter.
        self.assertFalse(queued_shared_acquired.is_set())

        lock.downgrade()
        await asyncio.wait_for(queued_shared_acquired.wait(), timeout=1.0)
        # Both the downgrader and the queued waiter now hold shared.
        self.assertTrue(lock.is_shared_locked())
        self.assertFalse(lock.is_exclusive_locked())

        lock.release_shared()
        lock.release_shared()
        await queued_shared_task

    async def test_downgrade_keeps_exclusive_waiter_queued(self) -> None:
        """Downgrading to shared must NOT grant a queued exclusive
        waiter, since the downgrader still holds shared."""
        lock = Lock()
        await lock.acquire_exclusive(deadline=None)

        queued_exclusive_acquired = asyncio.Event()

        async def queued_exclusive() -> None:
            await lock.acquire_exclusive(deadline=None)
            queued_exclusive_acquired.set()

        queued_exclusive_task = asyncio.create_task(queued_exclusive())
        await asyncio.sleep(0)

        lock.downgrade()
        await asyncio.sleep(0)
        # We still hold shared, so the exclusive waiter must wait.
        self.assertFalse(queued_exclusive_acquired.is_set())

        # Release our shared hold; the exclusive waiter can now proceed.
        lock.release_shared()
        await asyncio.wait_for(queued_exclusive_acquired.wait(), timeout=1.0)
        lock.release_exclusive()
        await queued_exclusive_task

    async def test_shared_deadline_raises_unavailable(self) -> None:
        lock = Lock()
        await lock.acquire_exclusive(deadline=None)
        with self.assertRaises(SystemAborted) as aborted:
            await lock.acquire_shared(deadline=timedelta(seconds=0.05))
        self.assertEqual(type(aborted.exception.error), Unavailable)
        # Lock state should be unchanged after a failed acquire.
        self.assertTrue(lock.is_exclusive_locked())
        self.assertFalse(lock.is_shared_locked())
        lock.release_exclusive()

    async def test_exclusive_deadline_raises_unavailable(self) -> None:
        lock = Lock()
        await lock.acquire_shared(deadline=None)
        with self.assertRaises(SystemAborted) as aborted:
            await lock.acquire_exclusive(deadline=timedelta(seconds=0.05))
        self.assertEqual(type(aborted.exception.error), Unavailable)
        self.assertTrue(lock.is_shared_locked())
        self.assertFalse(lock.is_exclusive_locked())
        lock.release_shared()


class EffectsRequiresExclusiveTest(unittest.TestCase):
    """Unit tests for `Effects.requires_exclusive()`, which decides
    whether a transaction running in shared mode must upgrade
    to exclusive."""

    def _state(
        self,
        title: str = "",
        name: str = "",
        adjective: str = "",
    ) -> greeter_rbt.Greeter.State:
        return greeter_rbt.Greeter.State(
            title=title, name=name, adjective=adjective
        )

    def test_no_state_no_effects_is_no_mutation(self) -> None:
        """Empty effects with no prior state is a read-only no-op."""
        self.assertFalse(
            Effects().requires_exclusive(initial_state_bytes=None)
        )

    def test_unchanged_state_is_no_mutation(self) -> None:
        """`effects.state` byte-equal to the initial snapshot is a
        read-only no-op (e.g., the user touched the yielded state
        reference but mutated it back before `complete()`)."""
        state = self._state(title="Dr", name="Jonathan", adjective="best")
        initial_state_bytes = state.SerializeToString(deterministic=True)
        self.assertFalse(
            Effects(state=state).requires_exclusive(
                initial_state_bytes=initial_state_bytes,
            )
        )

    def test_changed_state_is_mutation(self) -> None:
        """`effects.state` whose bytes differ from the initial
        snapshot is a mutation."""
        initial_state = self._state(
            title="Dr", name="Jonathan", adjective="best"
        )
        initial_state_bytes = initial_state.SerializeToString(
            deterministic=True
        )
        modified_state = self._state(
            title="Dr", name="Jonathan", adjective="worst"
        )
        self.assertTrue(
            Effects(state=modified_state).requires_exclusive(
                initial_state_bytes=initial_state_bytes,
            )
        )

    def test_construction_is_mutation(self) -> None:
        """A non-`None` `effects.state` with no initial bytes means
        the state didn't exist yet — i.e., this is a constructor — and
        must persist to disk."""
        state = self._state(title="Dr", name="Jonathan", adjective="best")
        self.assertTrue(
            Effects(state=state).requires_exclusive(
                initial_state_bytes=None,
            )
        )

    def test_tasks_alone_is_mutation(self) -> None:
        """Scheduling a task is a write side effect that must be
        persisted even if the state is byte-identical."""
        state = self._state(title="Dr", name="Jonathan", adjective="best")
        initial_state_bytes = state.SerializeToString(deterministic=True)
        state_type = StateTypeName("tests.reboot.Greeter")
        task = TaskEffect(
            state_type=state_type,
            state_ref=StateRef.from_id(state_type, "test-1234"),
            method_name="MyCoolMethod",
            request=Empty(),
        )
        self.assertTrue(
            Effects(
                state=state,
                tasks=[task],
            ).requires_exclusive(initial_state_bytes=initial_state_bytes)
        )

    def test_colocated_upserts_alone_is_mutation(self) -> None:
        """Writing a colocated key is a write side effect that must
        be persisted even if the state is byte-identical."""
        state = self._state(title="Dr", name="Jonathan", adjective="best")
        initial_state_bytes = state.SerializeToString(deterministic=True)
        self.assertTrue(
            Effects(
                state=state,
                _colocated_upserts=[("key", b"value")],
            ).requires_exclusive(initial_state_bytes=initial_state_bytes)
        )


if __name__ == '__main__':
    unittest.main()
