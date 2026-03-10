import asyncio
import contextlib
import grpc
import log.log
import logging
import reboot.aio.internals.channel_manager
import unittest
from ast import literal_eval
from collections import namedtuple
from rbt.v1alpha1 import errors_pb2
from rbt.v1alpha1.errors_pb2 import StateNotConstructed
from reboot.aio.applications import Application
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import (
    EffectValidation,
    ReaderContext,
    TransactionContext,
    WriterContext,
)
from reboot.aio.headers import (
    STATE_REF_HEADER,
    TRANSACTION_PARTICIPANTS_HEADER,
    TRANSACTION_PARTICIPANTS_TO_ABORT_HEADER,
    Headers,
)
from reboot.aio.state_managers import SidecarStateManager, StateManager
from reboot.aio.tests import Reboot
from reboot.aio.types import StateRef
from reboot.server.database import DatabaseClient
from reboot.std.collections.v1.sorted_map import SortedMap, sorted_map_library
from tests.reboot import bank_pb2, bank_pb2_grpc, bank_rbt
from tests.reboot.bank import SINGLETON_BANK_ID, AccountServicer, BankServicer
from tests.reboot.bank_rbt import Account, Bank
from tests.reboot.general_rbt import (
    General,
    GeneralError,
    GeneralRequest,
    GeneralResponse,
)
from tests.reboot.general_servicer import GeneralServicer
from unittest import mock


class LogCapture(logging.NullHandler):

    def __init__(self):
        self._log_records: list[logging.LogRecord] = []

        # Public attributes expected of a handler.
        self.level = logging.DEBUG

    def emit(self, record: logging.LogRecord) -> None:
        """Captures the log record in an in-memory list.

        Part of the Handler interface; see:
          https://docs.python.org/3/library/logging.handlers.html
          https://docs.python.org/3/library/logging.html#logging.Handler
        """
        self._log_records.append(record)

    def handle(self, record: logging.LogRecord) -> bool:
        """Captures the log record in an in-memory list.

        Part of the Handler interface; see:
          https://docs.python.org/3/library/logging.handlers.html
          https://docs.python.org/3/library/logging.html#logging.Handler
        """

        self.emit(record)
        return True

    def install(self):
        """Attach our handler to the root logger so that all messages seen by the
        user are captured by us."""

        log.log.get_logger().addHandler(self)

    def uninstall(self):
        log.log.get_logger().removeHandler(self)

    def messages(self, level: int) -> list[str]:
        return [
            log_record.getMessage()
            for log_record in self._log_records
            if log_record.levelno == level
        ]

    def has_message_that_contains(self, level: int, substring: str) -> bool:
        return any(
            substring in log_record.getMessage()
            for log_record in self._log_records
            if log_record.levelno == level
        )


class TransactionTestCase(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_transactions_basic(self) -> None:
        """Tests a transaction without inducing any failures."""
        await self.rbt.up(
            Application(servicers=[AccountServicer, BankServicer])
        )

        context = self.rbt.create_external_context(name=self.id())

        bank, _ = await Bank.Create(context, SINGLETON_BANK_ID)

        await bank.SignUp(
            context,
            account_id='ben',
            initial_deposit=42,
        )

        await bank.SignUp(
            context,
            account_id='jonathan',
            initial_deposit=42,
            initial_deposit_transfer_from_account_id='ben',
        )

        jonathan = Account.ref('jonathan')
        await jonathan.Deposit(context, amount=100)

        transferrable_response = await bank.Transferrable(
            context,
            from_account_id='jonathan',
            to_account_id='ben',
            amount=142,
        )

        self.assertTrue(transferrable_response.transferrable)

        transferrable_response = await bank.Transferrable(
            context,
            from_account_id='jonathan',
            to_account_id='ben',
            amount=143,
        )

        self.assertFalse(transferrable_response.transferrable)

    async def test_transactions_after_down(self) -> None:
        """Tests that a transaction that constructed actors correctly
        persisted the state such that the server and sidecar can be
        restarted and another transaction can be performed."""
        revision = await self.rbt.up(
            Application(servicers=[AccountServicer, BankServicer])
        )

        context = self.rbt.create_external_context(name=self.id())

        bank, _ = await Bank.Create(context, SINGLETON_BANK_ID)

        await bank.SignUp(
            context,
            account_id='ben',
            initial_deposit=42,
        )

        await bank.SignUp(
            context,
            account_id='jonathan',
            initial_deposit=42,
            initial_deposit_transfer_from_account_id='ben',
        )

        jonathan = Account.ref('jonathan')
        await jonathan.Deposit(context, amount=100)

        await self.rbt.down()

        await self.rbt.up(revision=revision)

        bank = Bank.ref(SINGLETON_BANK_ID)

        transferrable_response = await bank.Transferrable(
            context,
            from_account_id='jonathan',
            to_account_id='ben',
            amount=142,
        )

        self.assertTrue(transferrable_response.transferrable)

        transferrable_response = await bank.Transferrable(
            context,
            from_account_id='jonathan',
            to_account_id='ben',
            amount=143,
        )

        self.assertFalse(transferrable_response.transferrable)

    async def test_transaction_once_prepared_no_need_commits(self) -> None:
        """Tests that once a transaction coordinator has prepared it doesn't
        need to successfully perform commit in order for the
        transaction to succeed."""
        # Need to get a reference to the pre-mocked 'Commit' method so
        # we can use it for any service/actors that we aren't trying
        # to mimic a failure for.
        commit = SidecarStateManager.Commit

        async def mock_commit(state_manager, request, grpc_context):
            headers = Headers.from_grpc_context(grpc_context)
            if (headers.state_id == 'jonathan'):
                raise RuntimeError('Mock error')
            else:
                return await commit(state_manager, request, grpc_context)

        with mock.patch(
            'reboot.aio.state_managers.SidecarStateManager.Commit', mock_commit
        ):
            await self.rbt.up(
                Application(servicers=[AccountServicer, BankServicer])
            )

            context = self.rbt.create_external_context(name=self.id())

            bank, _ = await Bank.Create(context, SINGLETON_BANK_ID)

            await bank.SignUp(context, account_id='jonathan')

            jonathan = Account.ref('jonathan')

            await jonathan.Deposit(context, amount=100)

    async def test_transaction_aborts_when_prepare_fails(self) -> None:
        """Tests that if a transaction participant fails then the transaction
        will abort."""
        # Need to get a reference to the pre-mocked 'Commit' method so
        # we can use it for any service/actors that we aren't trying
        # to mimic a failure.
        prepare = SidecarStateManager.Prepare

        async def mock_prepare(state_manager, request, grpc_context):
            headers = Headers.from_grpc_context(grpc_context)
            if (headers.state_id == 'jonathan'):
                raise RuntimeError('Mock error')
            else:
                return await prepare(state_manager, request, grpc_context)

        with mock.patch(
            'reboot.aio.state_managers.SidecarStateManager.Prepare',
            mock_prepare
        ):
            await self.rbt.up(
                Application(servicers=[AccountServicer, BankServicer]),
            )

            context = self.rbt.create_external_context(name=self.id())

            bank, _ = await Bank.Create(context, SINGLETON_BANK_ID)

            with self.assertRaises(Bank.SignUpAborted) as aborted:
                await bank.SignUp(context, account_id='jonathan')

            self.assertIn('Mock error', str(aborted.exception))

            # Need to acknowledge idempotency uncertainty so that we
            # can continue running the test!
            context.acknowledge_idempotency_uncertainty()

            await bank.SignUp(context, account_id='ben')

    async def test_aborted_transaction_never_constructs(self) -> None:
        """Tests that if a transaction aborts no actors get created and thus
        doing a read on those actors should fail because they are not
        constructed."""
        # Need to get a reference to the pre-mocked 'Commit' method so
        # we can use it for any service/actors that we aren't trying
        # to mimic a failure.
        prepare = SidecarStateManager.Prepare

        # We only want to fail a prepare the first time.
        prepare_called = asyncio.Event()

        async def mock_prepare(state_manager, request, grpc_context):
            headers = Headers.from_grpc_context(grpc_context)
            if (
                headers.state_id == 'jonathan' and not prepare_called.is_set()
            ):
                prepare_called.set()
                raise RuntimeError('Mock error')
            else:
                return await prepare(state_manager, request, grpc_context)

        with mock.patch(
            'reboot.aio.state_managers.SidecarStateManager.Prepare',
            mock_prepare
        ):
            await self.rbt.up(
                Application(servicers=[AccountServicer, BankServicer]),
            )

            context = self.rbt.create_external_context(name=self.id())

            bank, _ = await Bank.Create(context, SINGLETON_BANK_ID)

            with self.assertRaises(Bank.SignUpAborted) as sign_up_aborted:
                await bank.SignUp(context, account_id='jonathan')

            self.assertIn('Mock error', str(sign_up_aborted.exception))

            # Need to acknowledge idempotency uncertainty so that we
            # can continue running the test!
            context.acknowledge_idempotency_uncertainty()

            # Now since the transaction has aborted we should be able
            # to do another 'SignUp'.
            await bank.SignUp(context, account_id='ben')

            # But when we check transferrable this should fail as the
            # from account 'jonathan' should not be constructed.
            with self.assertRaises(
                Bank.TransferrableAborted
            ) as transferrable_aborted:
                await bank.Transferrable(
                    context,
                    from_account_id='jonathan',
                    to_account_id='ben',
                    amount=100,
                )

            self.assertEqual(
                type(transferrable_aborted.exception.error), errors_pb2.Unknown
            )

            self.assertIn(
                "aborted with 'StateNotConstructed'",
                str(transferrable_aborted.exception),
            )

    async def test_coordinator_down_participant_abort(self) -> None:
        """Tests that a transaction coordinator only keeps information about a
        transaction before doing the prepare phase of two phase commit
        in memory so that if it fails when it comes back up the
        transaction will abort."""
        # Need to get a reference to the pre-mocked methods so
        # we can use it for any service/actors that we aren't trying
        # to mimic a failure.
        prepare = SidecarStateManager.Prepare
        abort = SidecarStateManager.Abort

        prepare_called = asyncio.Event()
        prepare_waiting = asyncio.Event()

        account_ref = StateRef.from_id(
            Account.__state_type_name__, 'jonathan-2345'
        )

        async def mock_prepare(state_manager, request, grpc_context):
            headers = Headers.from_grpc_context(grpc_context)
            if headers.state_ref == account_ref:
                # NOTE: only want to raise the first time!
                if not prepare_called.is_set():
                    prepare_called.set()
                    await prepare_waiting.wait()
                    raise RuntimeError('Mock prepare error')
                else:
                    return await prepare(state_manager, request, grpc_context)
            else:
                return await prepare(state_manager, request, grpc_context)

        async def mock_abort(state_manager, request, grpc_context):
            headers = Headers.from_grpc_context(grpc_context)
            if headers.state_ref == account_ref:
                raise RuntimeError('Mock abort error')
            else:
                return await abort(state_manager, request, grpc_context)

        with mock.patch(
            'reboot.aio.state_managers.SidecarStateManager.Prepare',
            mock_prepare
        ), mock.patch(
            'reboot.aio.state_managers.SidecarStateManager.Abort', mock_abort
        ), mock.patch(
            # Disable retries on error, so that we can get a clear
            # signal when a server has gone down.
            'reboot.aio.stubs.UnaryRetriedCall._should_retry',
            lambda *args, **kwargs: False
        ):
            await self.rbt.up(
                Application(servicers=[AccountServicer, BankServicer]),
                local_envoy=True,
                local_envoy_tls=True,  # For SSL/TLS test coverage.
                servers=2,
            )

            context = self.rbt.create_external_context(name=self.id())

            bank, _ = await Bank.Create(context, SINGLETON_BANK_ID)

            # Confirm that the relevant Bank and Account instances are running
            # in different servers. Note that this isn't necessarily
            # guaranteed by our use of the API, but we happen to have picked an
            # account ID that ends up on a different server than the bank.
            bank_server_id, account_server_id = await self.rbt.unique_servers(
                bank._state_ref,
                account_ref,
            )

            async def SignUp():
                await bank.SignUp(context, account_id=account_ref.id)

            sign_up_task = asyncio.create_task(SignUp())

            await prepare_called.wait()

            bank_server = await self.rbt.server_stop(bank_server_id)

            prepare_waiting.set()

            with self.assertRaises(Bank.SignUpAborted) as aborted:
                await sign_up_task

            self.assertEqual(
                type(aborted.exception.error), errors_pb2.Unavailable
            )

            # Need to acknowledge idempotency uncertainty so that we
            # can continue running the test!
            context.acknowledge_idempotency_uncertainty()

            await self.rbt.server_start(bank_server)

            bank = Bank.ref(SINGLETON_BANK_ID)

            await bank.SignUp(context, account_id=account_ref.id)

    async def test_coordinator_down_participant_prepared_still_aborts(
        self
    ) -> None:
        """Tests that if a transaction coordinator does not complete the
        prepare phase of two phase commit before failing then any
        participants that were prepared still abort once the
        coordinator restarts."""
        # Need to get a reference to the pre-mocked methods so
        # we can use it for any service/actors that we aren't trying
        # to mimic a failure.
        prepare = SidecarStateManager.Prepare
        abort = SidecarStateManager.Abort

        prepare_called = asyncio.Event()
        prepare_waiting = asyncio.Event()

        account_ref = StateRef.from_id(
            Account.__state_type_name__, 'jonathan-2345'
        )

        async def mock_prepare(state_manager, request, grpc_context):
            headers = Headers.from_grpc_context(grpc_context)
            if headers.state_ref == account_ref:
                prepare_called.set()
                await prepare_waiting.wait()
                return await prepare(state_manager, request, grpc_context)
            else:
                return await prepare(state_manager, request, grpc_context)

        async def mock_abort(state_manager, request, grpc_context):
            headers = Headers.from_grpc_context(grpc_context)
            if headers.state_ref == account_ref:
                raise RuntimeError('Mock abort error')
            else:
                return await abort(state_manager, request, grpc_context)

        with mock.patch(
            'reboot.aio.state_managers.SidecarStateManager.Prepare',
            mock_prepare
        ), mock.patch(
            'reboot.aio.state_managers.SidecarStateManager.Abort', mock_abort
        ), mock.patch(
            # Disable retries on error, so that we can get a clear
            # signal when a server has gone down.
            'reboot.aio.stubs.UnaryRetriedCall._should_retry',
            lambda *args, **kwargs: False
        ):
            await self.rbt.up(
                Application(servicers=[AccountServicer, BankServicer]),
                local_envoy=True,
                local_envoy_tls=True,  # For SSL/TLS test coverage.
                servers=2,
            )

            context = self.rbt.create_external_context(name=self.id())

            bank, _ = await Bank.Create(context, SINGLETON_BANK_ID)

            # Confirm that the relevant Bank and Account instances are running
            # in different servers. Note that this isn't necessarily
            # guaranteed by our use of the API, but we happen to have picked an
            # account ID that ends up on a different server than the bank.
            bank_server_id, account_server_id = await self.rbt.unique_servers(
                bank._state_ref,
                account_ref,
            )

            async def SignUp():
                await bank.SignUp(context, account_id=account_ref.id)

            sign_up_task = asyncio.create_task(SignUp())

            await prepare_called.wait()

            bank_server = await self.rbt.server_stop(bank_server_id)

            prepare_waiting.set()

            with self.assertRaises(Bank.SignUpAborted) as aborted:
                await sign_up_task

            self.assertEqual(
                type(aborted.exception.error), errors_pb2.Unavailable
            )

            # Need to acknowledge idempotency uncertainty so that we
            # can continue running the test!
            context.acknowledge_idempotency_uncertainty()

            await self.rbt.server_start(bank_server)

            bank = Bank.ref(SINGLETON_BANK_ID)

            await bank.SignUp(context, account_id=account_ref.id)

    def _capture_logs(self) -> LogCapture:
        """A helper function that installs a `LogCapture` and ensures it is
        cleaned up at the end of the test.
        """
        # Capture all logs emitted going forward.
        capture = LogCapture()
        capture.install()

        # Uninstall the log capture once the test completes.
        self.addCleanup(capture.uninstall)

        return capture

    async def test_transaction_recovery_after_prepared(self) -> None:
        """Tests a transaction coordinator completes the first phase of two
        phase commit (prepared), but nobody hears about the commits
        (we mock them out) then everyone restarts and the transaction
        still commits such that other mutations and transactions are
        able to execute successfully."""
        # Even in this tricky situation, with restarting servicers, we should
        # not see log spam - nothing is broken. Prove that we don't see log spam
        # by capturing the logs.
        log = self._capture_logs()

        # Up the log level on the `state_manager`; we'd like to check that it
        # logs some messages that are normally invisible.
        reboot.aio.state_managers.logger.setLevel(logging.DEBUG)

        # Begin a transaction, but prevent it from completing.
        account_ref = StateRef.from_id(
            Account.__state_type_name__, 'jonathan-2345'
        )

        async def mock_commit(state_manager, request, grpc_context):
            raise RuntimeError('Mock error')

        with mock.patch(
            'reboot.aio.state_managers.SidecarStateManager.Commit', mock_commit
        ):
            await self.rbt.up(
                Application(servicers=[AccountServicer, BankServicer]),
                local_envoy=True,
                local_envoy_tls=True,  # For SSL/TLS test coverage.
                servers=2,
            )
            context = self.rbt.create_external_context(name=self.id())

            bank, _ = await Bank.Create(context, SINGLETON_BANK_ID)

            # Confirm that the relevant Bank and Account instances are running
            # in different servers. Note that this isn't necessarily
            # guaranteed by our use of the API, but we happen to have picked an
            # account ID that ends up on a different server than the bank.
            bank_server_id, account_server_id = await self.rbt.unique_servers(
                bank._state_ref,
                account_ref,
            )

            await bank.SignUp(context, account_id=account_ref.id)

            # Now bring everyone down with the mock still in place.
            bank_server = await self.rbt.server_stop(bank_server_id)
            account_server = await self.rbt.server_stop(account_server_id)

        # Bring the bank back up. During recovery we will initiate the commit
        # phase of two phase commit.
        await self.rbt.server_start(bank_server)
        # At this point, `Bank` (the transaction coordinator) has
        # recovered the transaction and is trying to complete it.
        # However, it can't reach `Account` yet; a situation that it
        # should handle gracefully. Bring up the `Account`'s server
        # so that the transaction can complete.
        await self.rbt.server_start(account_server)

        # This should all have happened without errors.
        self.assertEqual(
            0, len(log.messages(logging.ERROR)), log.messages(logging.ERROR)
        )

        # And if we had our logs cranked up to `DEBUG`, then we'd have seen
        # information about our inability to contact the coordinator.
        self.assertGreater(len(log.messages(logging.DEBUG)), 0)
        self.assertTrue(
            log.has_message_that_contains(
                logging.DEBUG, "Coordinator failed to commit; will retry"
            ),
            log.messages(logging.DEBUG),
        )

        # Account should commit and then we should be able to perform
        # another mutation on the constructed actor.
        jonathan = Account.ref(account_ref.id)
        await jonathan.Deposit(context, amount=100)

        # As well as more transactions on the bank.
        bank = Bank.ref(SINGLETON_BANK_ID)

        await bank.SignUp(context, account_id='ben')

        transferrable_response = await bank.Transferrable(
            context,
            from_account_id=account_ref.id,
            to_account_id='ben',
            amount=100,
        )

        self.assertTrue(transferrable_response.transferrable)

    async def test_read_commit_race_condition(self) -> None:
        """As we eagerly return the result of a transaction after the first
        phase of the two-phase commit, we must take care to block users
        attempting to read the new state until we've completed the commit.

        This test exercises this race by delaying the commit and showing that
        the reader get's blocked when trying to read state of an actor with an
        outstanding prepared transaction.
        """

        # Save the real functions, used in the mocks.
        commit = SidecarStateManager.Commit
        load = SidecarStateManager._load
        transaction_await = StateManager.Transaction.__await__

        # Events to allow control of commit and test flow.
        continue_commit = asyncio.Event()
        commit_done = asyncio.Event()

        # Event's to check that the load function is called, but that the reader
        # is stuck in the method.
        load_started = asyncio.Event()
        load_done = asyncio.Event()

        # Events similar to the load events, but for the transaction await.
        transaction_await_started = asyncio.Event()
        transaction_await_done = asyncio.Event()

        async def mock_watch(*args, **kwargs):
            """Mock Watch to ensure that no participant hears about the
            (upcoming) commit through this channel. Otherwise they might start
            committing.
            """
            # Hang forever.
            await asyncio.Future()

        async def mock_commit(state_manager, request, grpc_context):
            """Mock to stall the commit and signal when the commit is done."""
            await continue_commit.wait()
            result = await commit(state_manager, request, grpc_context)
            commit_done.set()
            return result

        async def mock_load(*args, **kwargs):
            """Mock load to signal when we enter and leave the load function."""
            load_started.set()
            result = await load(*args, **kwargs)
            load_done.set()
            return result

        def mock_transaction_await(*args, **kwargs):
            """Mock transaction.__await__ to signal when we enter and leave the
            load function."""
            transaction_await_started.set()
            yield from transaction_await(*args, **kwargs)
            transaction_await_done.set()

        # Account name used in test.
        account_name = 'jonathan'

        with mock.patch(
            'reboot.aio.state_managers.SidecarStateManager.Commit',
            mock_commit,
        ), mock.patch(
            'reboot.aio.state_managers.SidecarStateManager.Watch',
            mock_watch,
        ), mock.patch(
            'reboot.aio.state_managers.SidecarStateManager._load',
            mock_load,
        ), mock.patch(
            'reboot.aio.state_managers.StateManager.Transaction.__await__',
            mock_transaction_await,
        ):
            # Bring up the servicers.
            await self.rbt.up(
                Application(servicers=[BankServicer, AccountServicer]),
            )

            # Create the account using the transactional method `SignUp`.
            context = self.rbt.create_external_context(name=self.id())

            bank, _ = await Bank.Create(context, SINGLETON_BANK_ID)

            await bank.SignUp(
                context, account_id=account_name, initial_deposit=10
            )

            # At this point, since control has returned to us, the transaction
            # has committed but since we know we have mocked the actual commit
            # calls none of the participants have actually committed. Therefore,
            # if we make another call to read the state of the actor that we
            # just created it should block until the participant has actually
            # been able to commit.

            account = Account.ref(account_name)

            # Clear the load related events.
            load_started.clear()
            load_done.clear()

            # Test that the transaction `await` related events are unset.
            self.assertFalse(transaction_await_started.is_set())
            self.assertFalse(transaction_await_done.is_set())

            # Start checking the balance in the background, as we want to check
            # a few things, before getting to the result.
            get_balance_task = asyncio.create_task(account.Balance(context))

            # We should get to enter the load function.
            await load_started.wait()

            # Yield for good measure, to allow the load function to get proper stuck.
            await asyncio.sleep(0.0)

            # We should not have exited the load function. Particularly, we
            # should not have left the part of the load where we are `await`ing
            # for the transaction to commit.
            self.assertFalse(load_done.is_set())

            self.assertTrue(transaction_await_started.is_set())
            self.assertFalse(transaction_await_done.is_set())

            # And the Balance task should still be running.
            self.assertFalse(get_balance_task.done())

            # Let's allow the commit to continue.
            continue_commit.set()

            # We should now be unstuck and able to get the balance.
            balance_response = await get_balance_task
            self.assertEqual(balance_response.amount, 10)

            # Check for good measure that the commit has completed and that the
            # load finished too.
            self.assertTrue(commit_done.is_set())
            self.assertTrue(load_done.is_set())

    async def test_simple_transaction_failure(self):
        """Test simple transaction failure.
        """

        async def mock_SignUp(
            self: BankServicer,
            context: TransactionContext,
            request: bank_rbt.SignUpRequest,
        ) -> bank_rbt.SignUpResponse:
            raise RuntimeError('Mock error')

        with mock.patch('tests.reboot.bank.BankServicer.SignUp', mock_SignUp):
            await self.rbt.up(
                Application(servicers=[BankServicer, AccountServicer]),
            )

            context = self.rbt.create_external_context(name=self.id())

            bank, _ = await Bank.Create(context, SINGLETON_BANK_ID)

            with self.assertRaises(Bank.SignUpAborted) as aborted:
                await bank.SignUp(context, account_id='jonathan')

            # The error from `mock_Signup` should be propagated.
            self.assertIn('Mock error', str(aborted.exception))

    def get_transactionally_patch(self, handler):
        """Get the `mock.patch` object for
        `SidecarStateManager.transactionally` needed for a number of transaction
        tests.

        The original `transactionally` will be executed in a
        `try-except-finally` scope. The `handler` is called in the finally
        clause with the relevant state manager, context, transaction and
        exception (if applicable).
        """

        # We need a handle to call the real `transactionally` inside the mock.
        transactionally = SidecarStateManager.transactionally

        @contextlib.asynccontextmanager
        async def mock_transactionally(
            self: SidecarStateManager,
            context,
            task_dispatcher,
            *,
            aborted_type,
        ):
            """Mock function that calls `transactionally` and validates the
            transaction and the context afterwards."""
            transaction = None
            exception = None
            try:
                # Call and `yield` from the real transactionally.
                async with transactionally(
                    self,
                    context,
                    task_dispatcher,
                    aborted_type=aborted_type,
                ) as transaction:
                    yield transaction
            except Exception as e:
                exception = e
                raise
            finally:
                # Execute test specific checks.
                handler(self, context, transaction, exception)

        return mock.patch(
            'reboot.aio.state_managers.SidecarStateManager.transactionally',
            mock_transactionally
        )

    def expect_call_raises_anything_but_assertion_error(self, method):
        """Get the `mock.patch` object for a method.

        This returns a mock that will fail the test in case of an assertion
        error. This allows for distinguishing test asserts from other types of
        exceptions in code.
        """
        # For consistency with other test code, define the `test` intermediate.
        test = self

        async def call_method_but_fail_test_on_assertion_error(
            *args, **kwargs
        ):
            """Helper method that calls the method we want to mock and fails the
            test in case an assertion error is raised by the original method.
            """
            try:
                return await method(*args, **kwargs)
            except AssertionError as e:
                test.fail(
                    f'{method.__qualname__} raised {type(e).__name__}: {e}'
                )
                raise

        return mock.patch(
            f'{method.__module__}.{method.__qualname__}',
            call_method_but_fail_test_on_assertion_error,
        )

    @contextlib.contextmanager
    def expect_never_called(self, method):
        """Helper to create mock patch objects for methods.

        The mock calls the original function, but registers the function as
        having been called. If, when the mock is uninstalled, the function
        has been called, the test fails.
        """

        # For consistency with other test code, define the `test`
        # intermediate.
        test = self

        method_called = False

        async def wrapper(self, *args, **kwargs):
            return await method(self, *args, **kwargs)

        # Get the fully qualified name of the passed in method. This is used
        # for the mock patch and for the assertion message.
        method_name = f'{method.__module__}.{method.__qualname__}'

        with mock.patch(
            method_name,
            wrapper,
        ):
            try:
                yield
            finally:
                test.assertFalse(
                    method_called,
                    f"Method '{method_name}' called",
                )

    async def test_servicer_stub_method_raises_case_unconstructed(self):
        """Test the transaction call flow:
                ExternalContext -> Bank -> Account (reader)
            where the account being read has not yet been created.
        """

        # Calls to the bank will be intercepted by the mock below both before
        # and after initialization. For the purposes of this test we only care
        # about the calls that happen _after_ initialization, since those are
        # the transactional ones. Track whether the bank has been initialized,
        # so that we can ignore pre-initialization calls in the mock.
        bank_initialized = False

        def check_transactionally(
            state_manager, context, transaction, exception
        ):
            """Test specific logic for the transactionally mock.

            This is called on any service and thus contain logic for both
            the Bank and the Account service.
            """
            nonlocal bank_initialized
            if context.state_type_name == BankServicer.__state_type_name__ and bank_initialized:
                # We only have failing transaction calls in this test.
                self.assertIsNotNone(transaction)
                self.assertIsNotNone(exception)

                # Let's check that the abort flags are correctly
                # set. Because we're getting back a
                # `StateNotConstructed`, the context should not
                # require that the transaction aborts, but the whole
                # transaction should abort because the error is not
                # handled and is propagating as `Unknown`.
                self.assertTrue(transaction.must_abort)
                self.assertFalse(context.transaction_must_abort)
            elif context.state_type_name == AccountServicer.__state_type_name__:
                # We only have failing transaction calls in this test.
                self.assertIsNotNone(transaction)
                self.assertIsNotNone(exception)

                # Let's check that the account does not exist but that the call
                # is a reader call.
                self.assertEqual(type(context), ReaderContext)
                self.assertNotIn(
                    context._state_ref,
                    state_manager._states[context.state_type_name],
                )

                # Let's check that the abort flags are correctly
                # set. Because we're getting back a
                # `StateNotConstructed`, nothing should be aborting.
                self.assertFalse(transaction.must_abort)
                self.assertFalse(context.transaction_must_abort)

        with self.get_transactionally_patch(
            check_transactionally
        ), self.expect_call_raises_anything_but_assertion_error(
            bank_rbt.BankServicerMiddleware.Transferrable
        ):
            await self.rbt.up(
                Application(servicers=[BankServicer, AccountServicer]),
            )

            context = self.rbt.create_external_context(name=self.id())

            bank, _ = await Bank.Create(context, SINGLETON_BANK_ID)

            bank_initialized = True

            with self.assertRaises(Bank.TransferrableAborted) as aborted:
                await bank.Transferrable(
                    context,
                    from_account_id='jonathan',
                    to_account_id='jonathan',
                    amount=10,
                )

            # `Bank.Transferrable` should fail because the account has not been
            # constructed yet and the attempt to read the account balance should
            # fail with the error that the account is unconstructed.
            self.assertEqual(type(aborted.exception.error), errors_pb2.Unknown)

            self.assertIn(
                "aborted with 'StateNotConstructed'",
                str(aborted.exception),
            )

    async def test_servicer_stub_method_raises_case_reader(self):
        """Test the transaction call flow:
                ExternalContext -> Bank -> Account (reader)
            where the reader method is mocked to fail.
        """

        # return
        async def mock_Balance(self, context, state, request):
            raise RuntimeError('Mock error')

        def check_transactionally(
            state_manager, context, transaction, exception
        ):
            """Test specific logic for the transactionally mock.

            This is called on any service and thus contain logic for both
            the Bank and the Account service.
            """
            if exception is None:
                # We don't care about the SignUp call where everything goes
                # well.
                return

            if context.state_type_name == BankServicer.__state_type_name__:
                # We only have transaction calls in this test.
                self.assertIsNotNone(transaction)

                # Let's check that the abort flags are correctly set. On the
                # bank side, both should be true.
                self.assertTrue(transaction.must_abort)
                self.assertTrue(context.transaction_must_abort)
            elif context.state_type_name == AccountServicer.__state_type_name__:
                # We only have transaction calls in this test.
                self.assertIsNotNone(transaction)

                # Let's check that the account does exist and this is a reader
                # call.
                self.assertIn(
                    context._state_ref,
                    state_manager._states[context.state_type_name],
                )
                self.assertEqual(type(context), ReaderContext)

                # Let's check that the abort flags are correctly set. On the
                # account side, only the transaction must abort have been set.
                self.assertTrue(transaction.must_abort)
                self.assertFalse(context.transaction_must_abort)

        with self.get_transactionally_patch(
            check_transactionally
        ), self.expect_call_raises_anything_but_assertion_error(
            bank_rbt.BankServicerMiddleware.Transferrable
        ), mock.patch(
            'tests.reboot.bank.AccountServicer.Balance',
            mock_Balance,
        ):
            await self.rbt.up(
                Application(servicers=[BankServicer, AccountServicer]),
                effect_validation=EffectValidation.DISABLED,
            )

            context = self.rbt.create_external_context(name=self.id())

            bank, _ = await Bank.Create(context, SINGLETON_BANK_ID)

            await bank.SignUp(context, account_id='jonathan')

            with self.assertRaises(Bank.TransferrableAborted) as aborted:
                await bank.Transferrable(
                    context,
                    from_account_id='jonathan',
                    to_account_id='jonathan',
                    amount=10,
                )

            # In this case `Bank.Transferrable` should fail when we attempt to
            # read the account balance as we've mocked this function: the
            # account exists but we can't check the balance. We propagate the
            # error from the failed `Account.Balance` call.
            self.assertIn('Mock error', str(aborted.exception))

    async def test_servicer_stub_method_raises_case_writer(self):
        """Test the transaction call flow:
                ExternalContext -> Bank -> Account (writer)
            where the writer method is mocked to fail.
        """

        async def mock_Open(self, context, state, request):
            raise RuntimeError('Mock error')

        def check_transactionally(
            state_manager, context, transaction, exception
        ):
            """Test specific logic for the transactionally mock.

            This is called on any service and thus contain logic for both
            the Bank and the Account service.
            """
            if exception is None:
                # We don't care about the SignUp call where everything goes
                # well.
                return

            if context.state_type_name == BankServicer.__state_type_name__:
                # We only have transaction calls in this test.
                self.assertIsNotNone(transaction)

                # Let's check that the abort flags are correctly set. On the
                # bank side, both should be true.
                self.assertTrue(transaction.must_abort)
                self.assertTrue(context.transaction_must_abort)
            elif context.state_type_name == AccountServicer.__state_type_name__:
                # We only have transaction calls in this test.
                self.assertIsNotNone(transaction)

                # The account should not exist as the `Open` call is mocked.
                self.assertNotIn(
                    context._state_ref,
                    state_manager._states[context.state_type_name],
                )
                self.assertEqual(type(context), TransactionContext)

                # Let's check that the abort flags are correctly set. On the
                # account side, only the transaction must abort have been set.
                self.assertTrue(transaction.must_abort)
                self.assertFalse(context.transaction_must_abort)

        with self.get_transactionally_patch(
            check_transactionally
        ), self.expect_call_raises_anything_but_assertion_error(
            bank_rbt.BankServicerMiddleware.SignUp
        ), mock.patch(
            'tests.reboot.bank.AccountServicer.Open',
            mock_Open,
        ):
            await self.rbt.up(
                Application(servicers=[BankServicer, AccountServicer]),
                effect_validation=EffectValidation.DISABLED,
            )

            context = self.rbt.create_external_context(name=self.id())

            bank, _ = await Bank.Create(context, SINGLETON_BANK_ID)

            with self.assertRaises(Bank.SignUpAborted) as aborted:
                await bank.SignUp(context, account_id='jonathan')

            # The `Bank.Signup` method should fail as we attempt to call
            # `Account.Open`. The error should be propagated back to the caller.
            self.assertIn("Mock error", str(aborted.exception))

    async def test_transaction_aborts_when_catching_undeclared_errors(self):
        """Test that catching a failed call with an undeclared error aborts
        the transaction.
        """

        await self.rbt.up(
            Application(servicers=[BankServicer, AccountServicer]),
        )

        context = self.rbt.create_external_context(name=self.id())

        bank, _ = await Bank.Create(context, SINGLETON_BANK_ID)

        await bank.SignUp(context, account_id='jonathan')

        with self.assertRaises(Bank.TryCatchUndeclaredErrorAborted) as aborted:
            await bank.TryCatchUndeclaredError(context, account_id='jonathan')

        # TODO: better error message than just 'Transaction must abort'.
        self.assertIn('Transaction must abort', str(aborted.exception))

    async def test_transaction_not_aborts_when_catching_declared_errors(self):
        """Test that catching a declared error will not abort the transaction.
        """

        await self.rbt.up(
            Application(servicers=[BankServicer, AccountServicer]),
        )

        context = self.rbt.create_external_context(name=self.id())

        bank, _ = await Bank.Create(context, SINGLETON_BANK_ID)

        await bank.SignUp(context, account_id='jonathan')

        account = Account.ref('jonathan')

        # To test all possible calls that may be made _before_ or
        # _after_ a call within a transaction that raises a declared
        # error we list all of the permutations and then apply them.
        Operations = namedtuple(
            'Operations',
            ['read_before', 'write_before', 'read_after', 'write_after'],
        )

        # TODO: programatically generate these?
        all_possible_operations = [
            Operations(True, True, True, True),
            Operations(True, True, True, False),
            Operations(True, True, False, True),
            Operations(True, False, True, True),
            Operations(True, False, True, False),
            Operations(True, False, False, True),
            Operations(True, False, False, False),
            Operations(False, True, True, True),
            Operations(False, True, True, False),
            Operations(False, True, False, True),
            Operations(False, False, True, True),
            Operations(False, False, True, False),
            Operations(False, False, False, True),
            Operations(False, False, False, False),
        ]

        for operations in all_possible_operations:
            await bank.TryCatchDeclaredError(
                context,
                account_id='jonathan',
                read_before=operations.read_before,
                write_before=operations.write_before,
                write_after=operations.write_after,
                read_after=operations.read_after,
            )

            # Balance should be equal to the number of writes (before + after).
            response = await account.Balance(context)

            self.assertEqual(
                sum([operations.write_before, operations.write_after]),
                response.amount,
            )

            # Always make sure that we start with a balance of 0.
            if response.amount > 0:
                await account.Withdraw(context, amount=response.amount)

    async def test_nested_transaction_aborts_even_if_parent_does_not(self):
        """Test that if a nested transaction calls a successful writer but
        then aborts itself the parent transaction can still succeed
        but the writer will abort.
        """

        await self.rbt.up(
            Application(servicers=[BankServicer, AccountServicer]),
        )

        context = self.rbt.create_external_context(name=self.id())

        bank, _ = await Bank.Create(context, SINGLETON_BANK_ID)

        await bank.SignUp(context, account_id='jonathan', initial_deposit=7)

        response = await bank.TestNestedTransactionThatAborts(
            context,
            account_id='jonathan',
        )

        # Nested transaction should not have been able to update the balance.
        response = await Account.ref('jonathan').Balance(context)

        self.assertEqual(7, response.amount)

        # And nested transaction should not have been able to
        # construct a new account either.
        with self.assertRaises(Account.BalanceAborted) as aborted:
            await Account.ref('jonathan-nested').Balance(context)

        self.assertTrue(
            isinstance(aborted.exception.error, StateNotConstructed),
        )

        # But parent transaction should have still been able to
        # successfully construct a new account.
        response = await Account.ref('jonathan-parent').Balance(context)

        self.assertEqual(42, response.amount)

    async def test_unconstructed_reader_fails_during_transaction(self):
        """Call Bank.TestUnconstructedReaderFails from inside a
        transaction and see that it fails the transaction."""
        await self.rbt.up(
            Application(servicers=[BankServicer, AccountServicer]),
        )

        context = self.rbt.create_external_context(name=self.id())

        bank = Bank.ref(SINGLETON_BANK_ID)

        with self.assertRaises(
            Bank.TestUnconstructedReaderFailsAborted
        ) as aborted:
            await bank.TestUnconstructedReaderFails(context)

        self.assertEqual(
            type(aborted.exception.error), errors_pb2.StateNotConstructed
        )

    async def test_unconstructed_streaming_reader_fails_during_transaction(
        self
    ):
        """Call Bank.TestUnconstructedStreamingReaderFails from inside a
        transaction and see that it fails the transaction."""
        await self.rbt.up(
            Application(servicers=[BankServicer, AccountServicer]),
        )

        context = self.rbt.create_external_context(name=self.id())

        bank = Bank.ref(SINGLETON_BANK_ID)

        with self.assertRaises(
            Bank.TestUnconstructedStreamingReaderFailsAborted
        ) as aborted:
            await bank.TestUnconstructedStreamingReaderFails(context)

        self.assertEqual(
            type(aborted.exception.error), errors_pb2.StateNotConstructed
        )

    async def test_no_abort_if_no_prepare(self):
        """Test that participants does not ask the sidecar to abort
        transaction that has not been prepared.

        We do so by forcing an abort before prepare and observing that neither
        commit, prepare, or abort is called on the sidecar.
        """

        with self.expect_never_called(
            DatabaseClient.transaction_participant_prepare,
        ), self.expect_never_called(
            DatabaseClient.transaction_participant_commit,
        ), self.expect_never_called(
            DatabaseClient.transaction_participant_abort,
        ):
            # Re-use existing test where transaction fails before prepare.
            await self.test_unconstructed_streaming_reader_fails_during_transaction(
            )

    async def test_constructor_after_abort_from_unconstructed(self):
        """Test that we can still construct an actor after an aborted
        transaction due to the actor not yet being constructed.
        """
        await self.rbt.up(
            Application(servicers=[BankServicer, AccountServicer]),
        )

        context = self.rbt.create_external_context(name=self.id())

        bank = Bank.ref(SINGLETON_BANK_ID)

        with self.assertRaises(Bank.SignUpAborted) as aborted:
            await bank.SignUp(context, account_id='jonathan')

        self.assertEqual(
            type(aborted.exception.error), errors_pb2.StateNotConstructed
        )

        await Bank.Create(context, SINGLETON_BANK_ID)

    async def test_transactional_constructor(self):
        """Tests that we can call a transactional constructor, and that aborting
        leaves the object un-constructed.
        """

        class ConstructorServicer(GeneralServicer):

            def authorizer(self):
                return allow()

            async def ConstructorTransaction(
                self,
                context: TransactionContext,
                state: General.State,
                request: GeneralRequest,
            ) -> GeneralResponse:
                if literal_eval(request.content.get("abort", "False")):
                    raise Exception("You asked for it!")

                state.content.update({"yep": "it ran"})

                return GeneralResponse()

            async def Reader(
                self,
                context: ReaderContext,
                state: General.State,
                request: GeneralRequest,
            ) -> GeneralResponse:
                return GeneralResponse(content=state.content)

        await self.rbt.up(
            Application(servicers=[ConstructorServicer]),
        )
        context = self.rbt.create_external_context(name=self.id())

        # Successfully create, and confirm that we can see the state.
        item1, _ = await General.ConstructorTransaction(context, "item1")
        self.assertEqual(
            {"yep": "it ran"}, dict((await item1.Reader(context)).content)
        )

        # Abort the constructor, and confirm that we are un-constructed.
        with self.assertRaises(
            General.ConstructorTransactionAborted
        ) as ct_aborted:
            await General.ConstructorTransaction(
                context,
                "item2",
                content={"abort": "True"},
            )
        self.assertIn("You asked for it!", str(ct_aborted.exception))
        with self.assertRaises(General.ReaderAborted) as r_aborted:
            await General.ref("item2").Reader(context)
        self.assertTrue(
            isinstance(r_aborted.exception.error, StateNotConstructed)
        )

    async def test_unsupported_nested_transactions(self):
        """Tests that we will currently fail if a nested transaction and
        parent transaction are not mutually exclusive.
        """
        await self.rbt.up(
            Application(servicers=[AccountServicer, BankServicer])
        )

        context = self.rbt.create_external_context(name=self.id())

        bank, _ = await Bank.Create(context, SINGLETON_BANK_ID)

        try:
            await bank.TestUnsupportedNestedTransactions(
                context,
                type=bank_rbt.TestUnsupportedNestedTransactionsRequest.
                NESTED_TXN_SAME_STATE,
            )
        except Bank.TestUnsupportedNestedTransactionsAborted as aborted:
            assert (
                "Nested transactions must currently read/modify mutually exclusive "
                "state from their parent transactions. You are attempting to "
                f"modify '{bank.state_id}' of type 'tests.reboot.Bank' which is "
                "already used in a parent transaction. This restriction will be "
                "relaxed in a future release of Reboot. Do you have a use case "
                "where you are trying to do this? Please reach out "
                "to the maintainers and tell us about it!"
            ) in str(aborted)

        # Need to acknowledge idempotency uncertainty so that we
        # can continue running the test!
        context.acknowledge_idempotency_uncertainty()

        try:
            await bank.TestUnsupportedNestedTransactions(
                context,
                type=bank_rbt.TestUnsupportedNestedTransactionsRequest.
                NESTED_TXN_PARENT_WRITER,
            )
        except Bank.TestUnsupportedNestedTransactionsAborted as aborted:
            assert (
                "Parent transactions must currently read/modify mutually exclusive "
                "state from their nested transactions. You are attempting to "
                "modify 'jonathan' of type 'tests.reboot.Account' which is "
                "already used in a nested transaction. This restriction will be "
                "relaxed in a future release of Reboot. Do you have a use case "
                "where you are trying to do this? Please reach out "
                "to the maintainers and tell us about it!"
            ) in str(aborted)

    async def test_colocated_range_transaction_abort(self):
        """
        Regression test for https://github.com/reboot-dev/mono/issues/4019.

        `SortedMap` is the only consumer of `StateManager.colocated_range`, so
        we use `SortedMap` to test that `colocated_range` behaves correctly in
        the face of transaction aborts.
        """

        class SortedMapCallerServicer(GeneralServicer):

            def authorizer(self):
                return allow()

            # We need an implemented constructor.
            async def ConstructorWriter(
                self,
                context: WriterContext,
                state: General.State,
                request: GeneralRequest,
            ) -> GeneralResponse:
                return GeneralResponse()

            # We need a transaction that calls a SortedMap.
            async def Transaction(
                self,
                context: TransactionContext,
                state: General.State,
                request: GeneralRequest,
            ) -> GeneralResponse:
                sorted_map = SortedMap.ref(request.content["map-id"])
                try:
                    await sorted_map.Range(
                        context,
                        start_key=request.content["map-start-key"],
                        end_key=request.content["map-end-key"],
                        limit=1,
                    )
                except SortedMap.RangeAborted:
                    # InvalidRange is not a valid error for
                    # `General.Transaction`; translate it to a `GeneralError`.
                    raise General.TransactionAborted(GeneralError())
                return GeneralResponse()

        await self.rbt.up(
            Application(
                servicers=[SortedMapCallerServicer],
                libraries=[sorted_map_library()],
            ),
            effect_validation=EffectValidation.DISABLED,
        )
        context = self.rbt.create_external_context(
            name=self.id(),
            app_internal=True,
        )

        sorted_map_id = "sorted-map-id"

        await SortedMap.ref(sorted_map_id).Insert(
            context,
            entries={"bar": b"bar"},
        )

        general, _ = await General.ConstructorWriter(context)

        # We first call `General.Transaction` for a nonexistent key, which
        # will cause its `SortedMap.Get` call to fail, and therefore cause the
        # transaction to fail also.
        with self.assertRaises(General.TransactionAborted):
            await general.Transaction(
                context,
                content={
                    "map-id": sorted_map_id,
                    # Invalid empty range will cause the transaction to fail.
                    "map-start-key": "foo",
                    "map-end-key": "foo",
                },
            )

        # Start a fresh context, unaffected by previously aborted idempotent calls.
        context = self.rbt.create_external_context(name=self.id())
        general = General.ref(general.state_id)

        # Now do another `General.Transaction` with the same `SortedMap`, but
        # using a key that exists. That transaction should succeed.
        await general.Transaction(
            context,
            content={
                "map-id": sorted_map_id,
                # Valid range will allow the transaction to complete.
                "map-start-key": "bar",  # Existent key.
                "map-end-key": "yar",  # Comes after 'bar', so valid range.
            },
        )

    async def test_successful_transaction_no_trailing_metadata(self) -> None:
        """
        Tests that successful transactions don't leak transaction
        participants metadata to external callers.

        Regression test for https://github.com/reboot-dev/mono/issues/5081.
        """
        await self.rbt.up(
            Application(servicers=[AccountServicer, BankServicer]),
            local_envoy=True,
        )

        # Create a bank and an account to test with.
        context = self.rbt.create_external_context(name=self.id())
        bank, _ = await Bank.Create(context, SINGLETON_BANK_ID)
        await bank.SignUp(context, account_id='test-account')

        # Now use raw gRPC to call a transaction method, so we can check
        # for trailing metadata.
        async with grpc.aio.insecure_channel(
            self.rbt.url().removeprefix('http://')
        ) as channel:
            stub = bank_pb2_grpc.BankMethodsStub(channel)

            # Call a transaction method (SignUp).
            # State ID contains a slash, so it needs escaping.
            escaped_state_id = SINGLETON_BANK_ID.replace("/", "\\")
            state_ref = f'tests.reboot.Bank:{escaped_state_id}'
            call = stub.SignUp(
                bank_pb2.SignUpRequest(account_id='another-account'),
                metadata=((STATE_REF_HEADER, state_ref),),
            )
            await call

            # Check that no transaction participants metadata was sent.
            trailing_metadata_tuples = await call.trailing_metadata()
            trailing_metadata_keys = [
                key for key, _ in trailing_metadata_tuples
            ]
            self.assertNotIn(
                TRANSACTION_PARTICIPANTS_HEADER,
                trailing_metadata_keys,
                f"Expected no '{TRANSACTION_PARTICIPANTS_HEADER}' in "
                f"trailing metadata, but got: {trailing_metadata_tuples}",
            )
            self.assertNotIn(
                TRANSACTION_PARTICIPANTS_TO_ABORT_HEADER,
                trailing_metadata_keys,
                f"Expected no '{TRANSACTION_PARTICIPANTS_TO_ABORT_HEADER}' "
                f"in trailing metadata, but got: {trailing_metadata_tuples}",
            )

    async def test_failing_transaction_no_trailing_metadata(self) -> None:
        """
        Tests that failing transactions don't leak transaction
        participants metadata to external callers.

        Regression test for https://github.com/reboot-dev/mono/issues/5081.
        """
        await self.rbt.up(
            Application(servicers=[AccountServicer, BankServicer]),
            local_envoy=True,
        )

        # Create a bank to test with.
        context = self.rbt.create_external_context(name=self.id())
        bank, _ = await Bank.Create(context, SINGLETON_BANK_ID)

        # Now use raw gRPC to call a transaction method that will fail,
        # so we can check the trailing metadata.
        async with grpc.aio.insecure_channel(
            self.rbt.url().removeprefix('http://')
        ) as channel:
            stub = bank_pb2_grpc.BankMethodsStub(channel)

            # Call SignUp with a zero initial deposit, which will fail.
            # State ID contains a slash, so it needs escaping.
            escaped_state_id = SINGLETON_BANK_ID.replace("/", "\\")
            state_ref = f'tests.reboot.Bank:{escaped_state_id}'
            call = stub.SignUp(
                bank_pb2.SignUpRequest(
                    account_id='fail-account',
                    initial_deposit=0,  # This will cause failure.
                ),
                metadata=((STATE_REF_HEADER, state_ref),),
            )

            # Expect the call to fail.
            with self.assertRaises(grpc.aio.AioRpcError):
                await call

            # Check that no transaction participants metadata was sent
            # even on the failed call.
            trailing_metadata_tuples = await call.trailing_metadata()
            trailing_metadata_keys = [
                key for key, _ in trailing_metadata_tuples
            ]
            self.assertNotIn(
                TRANSACTION_PARTICIPANTS_HEADER,
                trailing_metadata_keys,
                f"Expected no '{TRANSACTION_PARTICIPANTS_HEADER}' in "
                f"trailing metadata on failed transaction, but got: "
                f"{trailing_metadata_tuples}",
            )
            self.assertNotIn(
                TRANSACTION_PARTICIPANTS_TO_ABORT_HEADER,
                trailing_metadata_keys,
                f"Expected no '{TRANSACTION_PARTICIPANTS_TO_ABORT_HEADER}' "
                f"in trailing metadata on failed transaction, but got: "
                f"{trailing_metadata_tuples}",
            )


if __name__ == '__main__':
    unittest.main(verbosity=2)
