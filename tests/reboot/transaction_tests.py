import asyncio
import contextlib
import grpc
import log.log
import logging
import reboot.aio.internals.channel_manager
import unittest
from ast import literal_eval
from collections import namedtuple
from rbt.v1alpha1 import errors_pb2, transactions_pb2
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
    Headers,
)
from reboot.aio.state_managers import Lock, SidecarStateManager, StateManager
from reboot.aio.stubs import UnaryRetriedCall
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

        bank, _ = await Bank.factory.Create(context, SINGLETON_BANK_ID)

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

        bank, _ = await Bank.factory.Create(context, SINGLETON_BANK_ID)

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

            bank, _ = await Bank.factory.Create(context, SINGLETON_BANK_ID)

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
                return transactions_pb2.PrepareResponse(abort=True)
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

            bank, _ = await Bank.factory.Create(context, SINGLETON_BANK_ID)

            with self.assertRaises(Bank.SignUpAborted):
                await bank.SignUp(context, account_id='jonathan')

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
                return transactions_pb2.PrepareResponse(abort=True)
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

            bank, _ = await Bank.factory.Create(context, SINGLETON_BANK_ID)

            with self.assertRaises(Bank.SignUpAborted):
                await bank.SignUp(context, account_id='jonathan')

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
                    return transactions_pb2.PrepareResponse(abort=True)
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

            bank, _ = await Bank.factory.Create(context, SINGLETON_BANK_ID)

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

            bank, _ = await Bank.factory.Create(context, SINGLETON_BANK_ID)

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

    async def test_participant_restart_retries_transaction(self) -> None:
        """Tests that if a participant server restarts after a
        transaction has started but before the prepare phase, the
        participant detects the restart via timestamp comparison
        and returns Unavailable, causing the client to
        automatically retry the transaction with the same
        idempotency key."""
        # Get a reference to the real
        # `_transaction_coordinator_prepare` so we can call it after
        # restarting the participant server.
        transaction_coordinator_prepare = (
            SidecarStateManager._transaction_coordinator_prepare
        )

        account_ref = StateRef.from_id(
            Account.__state_type_name__, 'jonathan-2345'
        )

        restarted = False

        async def mock_transaction_coordinator_prepare(
            state_manager,
            *,
            application_id,
            channel_manager,
            transaction_id,
            participants,
        ):
            nonlocal restarted
            if not restarted:
                # Restart the `Account` (participant) server before
                # sending `Prepare` RPCs. This simulates a participant
                # crash between the writer phase and the prepare
                # phase: the new server will have a recovery timestamp
                # after the transaction's UUIDv7 timestamp, so the
                # `Prepare` handler will detect the gap and return
                # `Unavailable`.
                account_server = await self.rbt.server_stop(account_server_id)
                await self.rbt.server_start(account_server)
                restarted = True

            return await transaction_coordinator_prepare(
                state_manager,
                application_id=application_id,
                channel_manager=channel_manager,
                transaction_id=transaction_id,
                participants=participants,
            )

        # Track when `_should_retry` is called with an `Unavailable`
        # error, proving that the participant's restart detection
        # triggered a retryable error that propagated all the way to
        # the client.
        should_retry = UnaryRetriedCall._should_retry
        retried_unavailable = asyncio.Event()

        def mock_should_retry(unary_retried_call, error):
            if error.code() == grpc.StatusCode.UNAVAILABLE:
                retried_unavailable.set()
            return should_retry(unary_retried_call, error)

        with mock.patch(
            'reboot.aio.state_managers.SidecarStateManager.'
            '_transaction_coordinator_prepare',
            mock_transaction_coordinator_prepare,
        ), mock.patch(
            'reboot.aio.stubs.UnaryRetriedCall._should_retry',
            mock_should_retry,
        ):
            await self.rbt.up(
                Application(servicers=[AccountServicer, BankServicer]),
                local_envoy=True,
                local_envoy_tls=True,
                servers=2,
            )

            context = self.rbt.create_external_context(name=self.id())

            bank, _ = await Bank.factory.Create(context, SINGLETON_BANK_ID)

            # Confirm that `Bank` and `Account` are on different
            # servers so we can restart just the participant.
            _, account_server_id = await self.rbt.unique_servers(
                bank._state_ref,
                account_ref,
            )

            # The first attempt will fail because the participant
            # restarted; the framework automatically retries because
            # the error is `Unavailable`, reusing the same idempotency
            # key.
            await bank.SignUp(context, account_id=account_ref.id)

            # Verify that the retry was triggered by the `Unavailable`
            # error from restart detection.
            self.assertTrue(retried_unavailable.is_set())

    async def test_uuid4_coordinator_with_updated_participant(self) -> None:
        """Tests that a coordinator without a database timestamp (simulating a
        legacy server) creates UUIDv4 transaction IDs, and the
        participant correctly falls back to the legacy flow (storing
        at join time, writing every intermediate state) even though
        the participant has a recovery timestamp and supports restart
        detection.
        """
        transaction_participant_store = (
            SidecarStateManager.transaction_participant_store
        )
        participant_store_count = 0

        async def mock_transaction_participant_store(
            state_manager,
            transaction,
        ):
            nonlocal participant_store_count
            participant_store_count += 1
            return await transaction_participant_store(
                state_manager,
                transaction,
            )

        with mock.patch(
            'reboot.aio.state_managers.SidecarStateManager'
            '.latest_timestamp_ms',
            new_callable=mock.PropertyMock,
            return_value=None,
        ), mock.patch(
            'reboot.aio.state_managers.SidecarStateManager'
            '.transaction_participant_store',
            mock_transaction_participant_store,
        ):
            await self.rbt.up(
                Application(servicers=[AccountServicer, BankServicer]),
            )

            context = self.rbt.create_external_context(name=self.id())

            bank, _ = await Bank.factory.Create(context, SINGLETON_BANK_ID)

            await bank.SignUp(context, account_id='jonathan')

            # Legacy flow: `transaction_participant_store` must have
            # been called at join time for each participant. We don't
            # assert an exact count because effect validation re-runs
            # the handler (creating fresh transactions that store
            # again), and scheduled tasks like `PostOpen` and
            # `PostSignUp` may or may not have started running before
            # this assertion executes.
            self.assertGreater(participant_store_count, 0)

    async def test_uuid7_coordinator_with_legacy_participant(self) -> None:
        """Tests that a coordinator sending UUIDv7 transaction IDs works
        correctly when participants cannot use restart detection
        (simulating a legacy server without a recovery timestamp),
        falling back to the legacy flow of storing at join time and
        writing every intermediate state.
        """
        transaction_participant_store = (
            SidecarStateManager.transaction_participant_store
        )
        participant_store_count = 0

        async def mock_transaction_participant_store(
            state_manager,
            transaction,
        ):
            nonlocal participant_store_count
            participant_store_count += 1
            return await transaction_participant_store(
                state_manager,
                transaction,
            )

        with mock.patch(
            'reboot.aio.state_managers.SidecarStateManager'
            '._can_use_restart_detection',
            return_value=False,
        ), mock.patch(
            'reboot.aio.state_managers.SidecarStateManager'
            '.transaction_participant_store',
            mock_transaction_participant_store,
        ):
            await self.rbt.up(
                Application(servicers=[AccountServicer, BankServicer]),
            )

            context = self.rbt.create_external_context(name=self.id())

            bank, _ = await Bank.factory.Create(context, SINGLETON_BANK_ID)

            await bank.SignUp(context, account_id='jonathan')

            # Legacy flow: `transaction_participant_store` must have
            # been called at join time for each participant. We don't
            # assert an exact count because effect validation re-runs
            # the handler (creating fresh transactions that store
            # again), and scheduled tasks like `PostOpen` and
            # `PostSignUp` may or may not have started running before
            # this assertion executes.
            self.assertGreater(participant_store_count, 0)

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

            bank, _ = await Bank.factory.Create(context, SINGLETON_BANK_ID)

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

    async def test_read_only_transaction_elides_account_participants(
        self,
    ) -> None:
        """A read-only transaction (`Bank.Transferrable`) classifies its
        account sub-participants as read-only (mode='shared', no
        idempotency key on the reader sub-RPC, restart-detection
        eligible). At Prepare time those accounts hit the elision
        branch in `transaction_participant_prepare`: they commit
        themselves in memory, release the shared lock, and forget the
        transaction. The coordinator's commit-phase
        (`participants.should_commit()`) excludes them, so they never
        receive a `Commit` RPC.

        The `Bank` itself does have an idempotency key (this is a
        user-initiated RPC), so its idempotent mutation must be
        persisted — it goes through the normal Prepare + Commit
        cycle.
        """
        prepare = SidecarStateManager.Prepare
        commit = SidecarStateManager.Commit

        # We know exactly which Prepare/Commit RPCs the Transferrable
        # transaction should produce: one Prepare each on 'alice',
        # 'bob', and the Bank, and one Commit on the Bank only (the
        # accounts are elided at Prepare and must never receive a
        # Commit). Each expected RPC gets an event that is set on
        # arrival; any Prepare/Commit that isn't expected — wrong
        # state, or a duplicate — is recorded in `unexpected` and
        # fails the test. The expectations are populated only once the
        # setup transactions below have drained (and only then is
        # `track` set).
        expected_prepares: dict[StateRef, asyncio.Event] = {}
        expected_commits: dict[StateRef, asyncio.Event] = {}
        unexpected: list[str] = []
        track = False

        async def mock_prepare(state_manager, request, grpc_context):
            if track:
                state_ref = Headers.from_grpc_context(grpc_context).state_ref
                event = expected_prepares.get(state_ref)
                if event is None or event.is_set():
                    unexpected.append(f"Prepare on '{state_ref.to_str()}'")
                else:
                    event.set()
            return await prepare(state_manager, request, grpc_context)

        async def mock_commit(state_manager, request, grpc_context):
            if track:
                state_ref = Headers.from_grpc_context(grpc_context).state_ref
                event = expected_commits.get(state_ref)
                if event is None or event.is_set():
                    unexpected.append(f"Commit on '{state_ref.to_str()}'")
                else:
                    event.set()
            return await commit(state_manager, request, grpc_context)

        alice_account_ref = StateRef.from_id(
            Account.__state_type_name__, 'alice'
        )
        bob_account_ref = StateRef.from_id(Account.__state_type_name__, 'bob')

        with mock.patch(
            'reboot.aio.state_managers.SidecarStateManager.Prepare',
            mock_prepare,
        ), mock.patch(
            'reboot.aio.state_managers.SidecarStateManager.Commit',
            mock_commit,
        ):
            await self.rbt.up(
                Application(servicers=[AccountServicer, BankServicer]),
            )
            context = self.rbt.create_external_context(name=self.id())

            bank, _ = await Bank.factory.Create(context, SINGLETON_BANK_ID)
            await bank.SignUp(
                context, account_id=alice_account_ref.id, initial_deposit=100
            )
            await bank.SignUp(
                context, account_id=bob_account_ref.id, initial_deposit=200
            )

            # Reading a state waits for any prepared-but-not-yet-
            # committed transaction on it to complete, and
            # `AssetsUnderManagement` reads the Bank and every
            # account, so once it returns the setup transactions'
            # commit phases have fully drained and no further
            # Prepare/Commit RPCs are coming from them.
            await bank.AssetsUnderManagement(
                context,
                wait_for_amount_at_least=0,
            )

            expected_prepares[alice_account_ref] = asyncio.Event()
            expected_prepares[bob_account_ref] = asyncio.Event()

            expected_prepares[bank._state_ref] = asyncio.Event()
            expected_commits[bank._state_ref] = asyncio.Event()

            track = True

            response = await bank.Transferrable(
                context,
                from_account_id=alice_account_ref.id,
                to_account_id=bob_account_ref.id,
                amount=50,
            )
            self.assertTrue(response.transferrable)

            # Every Prepare runs before `Transferrable` returns.
            for state_ref, event in expected_prepares.items():
                self.assertTrue(
                    event.is_set(),
                    f"Expected a Prepare on '{state_ref.to_str()}'",
                )

            # The Bank's Commit (it's a write committer: its
            # idempotent mutation must persist) runs in the
            # coordinator's fire-and-forget commit control loop;
            # wait for it.
            await expected_commits[bank._state_ref].wait()

            self.assertEqual([], unexpected)

    async def test_recovery_skips_re_prepare_for_elided_read_only_participants(
        self,
    ) -> None:
        """A read-only-transaction's account participants have elided
        and forgotten the transaction by the time Prepare returned, so
        recovery must never contact them again: they would respond
        with `abort=True restart_detected` (no in-memory transaction
        matches), falsely aborting the whole transaction. The
        `Participants.read_only` map persisted at Prepare time is what
        protects them: recovery's commit phase only contacts
        `participants.should_commit()`, which excludes them.

        This test exercises that path: it pins commit to fail (so the
        coordinator's commit-loop keeps retrying), runs a
        `Transferrable`, then kills and restarts the coordinator
        server. By the time the first Commit was attempted the
        transaction was durably prepared (the commit control loop
        writes `preparing=False` before any Commit), so recovery
        skips re-Prepare entirely and proceeds straight to the commit
        phase, committing the Bank (the only write committer). The
        account must see no further Prepare or Commit traffic at all;
        any such RPC lands in `unexpected` and fails the test.
        """
        prepare = SidecarStateManager.Prepare
        commit = SidecarStateManager.Commit

        # Exact expected Prepare/Commit RPCs, as in
        # `test_read_only_transaction_elides_account_participants`:
        # each expected RPC gets an event that is set on arrival;
        # any Prepare/Commit that isn't expected — wrong state, or
        # a duplicate — is recorded in `unexpected` and fails the
        # test. The Transferrable below should produce one Prepare
        # each on the account and the Bank; recovery then goes
        # straight to the commit phase (the transaction is durably
        # prepared by the time the first Commit was attempted), so
        # the only other expected RPC is the Bank's single
        # successful Commit after the restart.
        expected_prepares: dict[StateRef, asyncio.Event] = {}
        expected_commits: dict[StateRef, asyncio.Event] = {}
        unexpected: list[str] = []
        track = False

        async def mock_prepare(state_manager, request, grpc_context):
            if track:
                state_ref = Headers.from_grpc_context(grpc_context).state_ref
                event = expected_prepares.get(state_ref)
                if event is None or event.is_set():
                    unexpected.append(f"Prepare on '{state_ref.to_str()}'")
                else:
                    event.set()
            return await prepare(state_manager, request, grpc_context)

        # Fail commit so the coordinator's commit-loop retries
        # indefinitely until we kill the server. This keeps the
        # crash window for recovery open. We only enable failure
        # once the setup transactions have fully drained (see the
        # `AssetsUnderManagement` read below), so the only commit
        # we ever fail is the Transferrable transaction's.
        # `commit_failed` proves the Bank's commit was actually
        # attempted, so we know we kill the server in the right
        # window.
        fail_commit = False
        commit_failed = asyncio.Event()

        async def mock_commit(state_manager, request, grpc_context):
            state_ref = Headers.from_grpc_context(grpc_context).state_ref
            if fail_commit:
                if state_ref in expected_commits:
                    commit_failed.set()
                raise RuntimeError('Mock commit failure')
            if track:
                event = expected_commits.get(state_ref)
                if event is None or event.is_set():
                    unexpected.append(f"Commit on '{state_ref.to_str()}'")
                else:
                    event.set()
            return await commit(state_manager, request, grpc_context)

        account_ref = StateRef.from_id(
            Account.__state_type_name__, 'jonathan-2345'
        )

        with mock.patch(
            'reboot.aio.state_managers.SidecarStateManager.Prepare',
            mock_prepare,
        ), mock.patch(
            'reboot.aio.state_managers.SidecarStateManager.Commit',
            mock_commit,
        ):
            await self.rbt.up(
                Application(servicers=[AccountServicer, BankServicer]),
                local_envoy=True,
                local_envoy_tls=True,
                servers=2,
            )
            context = self.rbt.create_external_context(name=self.id())

            bank, _ = await Bank.factory.Create(context, SINGLETON_BANK_ID)

            # Bank and Account on different servers (the existing
            # recovery tests rely on this and we want the same
            # topology so killing the bank server doesn't also kill
            # the account server).
            bank_server_id, account_server_id = (
                await self.rbt.unique_servers(
                    bank._state_ref,
                    account_ref,
                )
            )

            await bank.SignUp(context, account_id=account_ref.id)

            # Reading a state waits for any prepared-but-not-yet-
            # committed transaction on it to complete, and
            # `AssetsUnderManagement` reads the Bank and the account,
            # so once it returns the setup transactions' commit phases
            # have fully drained and no further Prepare/Commit RPCs
            # are coming from them.
            await bank.AssetsUnderManagement(
                context,
                wait_for_amount_at_least=0,
            )

            expected_prepares[account_ref] = asyncio.Event()
            expected_prepares[bank._state_ref] = asyncio.Event()
            expected_commits[bank._state_ref] = asyncio.Event()

            track = True
            fail_commit = True

            response = await bank.Transferrable(
                context,
                from_account_id=account_ref.id,
                to_account_id=account_ref.id,
                amount=0,
            )
            self.assertTrue(response.transferrable)

            # Both Prepares ran before `Transferrable` returned
            # (the account's exactly once — a duplicate would have
            # landed in `unexpected`).
            for state_ref, event in expected_prepares.items():
                self.assertTrue(
                    event.is_set(),
                    f"Expected a Prepare on '{state_ref.to_str()}'",
                )

            # Wait for the commit loop to have failed at least
            # once (proving Bank's commit was actually attempted)
            # so we know we're killing the server in the right
            # window.
            await commit_failed.wait()

            # Kill the coordinator's server (Bank). Account stays
            # up so a buggy recovery that DOES try to re-Prepare
            # (or Commit) it would actually reach the account, and
            # — since the account's expected-Prepare event is
            # already set — we'd see it in `unexpected`.
            bank_server = await self.rbt.server_stop(bank_server_id)

            # Disable the commit-failure switch so recovery can
            # complete normally once Bank's server comes back up.
            fail_commit = False
            await self.rbt.server_start(bank_server)

            # Recovery has completed once the Bank's commit for
            # the Transferrable transaction succeeds.
            await expected_commits[bank._state_ref].wait()

        # The account must not have been re-Prepared during
        # recovery (nor any other unexpected Prepare/Commit
        # observed).
        self.assertEqual([], unexpected)

    async def test_transaction_recovery_after_coordinator_preparing(
        self,
    ) -> None:
        """Tests recovery when a coordinator crashed after it wrote its
        participant list to the database (with `preparing=True`) and
        all the participants prepared, but before it wrote that it was
        'prepared'. After restarting both coordinator and
        participants, recovery re-prepares all participants and
        completes the transaction.
        """
        account_ref = StateRef.from_id(
            Account.__state_type_name__, 'jonathan-2345'
        )

        # Mock `transaction_coordinator_prepared` to always fail,
        # simulating a crash after the coordinator has written its
        # participants _and_ all of the participants have prepared.
        async def mock_transaction_coordinator_prepared(
            database_client, *args, **kwargs
        ):
            raise RuntimeError('Simulating a coordinator crash')

        with mock.patch(
            'reboot.server.database.DatabaseClient'
            '.transaction_coordinator_prepared',
            mock_transaction_coordinator_prepared,
        ):
            await self.rbt.up(
                Application(servicers=[AccountServicer, BankServicer]),
                local_envoy=True,
                local_envoy_tls=True,
                servers=2,
            )
            context = self.rbt.create_external_context(name=self.id())

            bank, _ = await Bank.factory.Create(context, SINGLETON_BANK_ID)

            # Confirm that `Bank` and `Account` are on different
            # servers so we exercise cross-server recovery.
            bank_server_id, account_server_id = await self.rbt.unique_servers(
                bank._state_ref,
                account_ref,
            )

            # This transaction will succeed from the caller's
            # perspective (coordinator wrote down participants and all
            # participant's have prepared). The commit control loop
            # starts in the background but will keep failing due to
            # our mock.
            await bank.SignUp(context, account_id=account_ref.id)

            # Stop both servers. The coordinator has a
            # `preparing=True` record in the database. The
            # participants have prepared RocksDB transaction.
            bank_server = await self.rbt.server_stop(bank_server_id)
            account_server = await self.rbt.server_stop(account_server_id)

        # Now restart without the mocks. Recovery should find the
        # `preparing=True` coordinator record, try to (re-)prepare all
        # participants, and be able to commit!
        await self.rbt.server_start(bank_server)
        await self.rbt.server_start(account_server)

        # Verify the transaction committed: the account should be
        # constructed and allow mutations (i.e., not still be within a
        # transaction).
        jonathan = Account.ref(account_ref.id)
        await jonathan.Deposit(context, amount=100)

        # And we should be able to do more transactions on the bank.
        bank = Bank.ref(SINGLETON_BANK_ID)
        await bank.SignUp(context, account_id='ben')

    async def test_transaction_abort_after_coordinator_preparing(self) -> None:
        """Tests that if both (a) the coordinator crashes _after_ it has
        stored its participants and `preparing=True` to the database
        and (b) the participant crashes _before_ it is able to
        prepare, then recovery will correctly abort the transaction.
        """
        account_ref = StateRef.from_id(
            Account.__state_type_name__, 'jonathan-2345'
        )

        # Track when we know the 'preparing' record is durable in the
        # database.
        transaction_coordinator_prepare_done = asyncio.Event()
        transaction_coordinator_prepare = (
            DatabaseClient.transaction_coordinator_prepare
        )

        async def mock_transaction_coordinator_prepare(
            database_client, *args, **kwargs
        ):
            await transaction_coordinator_prepare(
                database_client, *args, **kwargs
            )
            transaction_coordinator_prepare_done.set()
            # Now hang forever until we restart the servers.
            await asyncio.Event().wait()

        # Mock participant prepare RPCs to hang forever, simulating a
        # crash before participants prepare.
        async def mock_transaction_participant_prepare(
            database_client, *args, **kwargs
        ):
            await asyncio.Event().wait()

        with mock.patch(
            'reboot.server.database.DatabaseClient'
            '.transaction_coordinator_prepare',
            mock_transaction_coordinator_prepare,
        ), mock.patch(
            'reboot.server.database.DatabaseClient'
            '.transaction_participant_prepare',
            mock_transaction_participant_prepare,
        ), mock.patch(
            # When the bank server is stopped below the `SignUp` RPC
            # should fail. In the event that the failure is
            # `UNAVAILABLE` we don't want to retry because we'll retry
            # forever since the server is stopped. Instead, we have
            # the mock return `False`.
            'reboot.aio.stubs.UnaryRetriedCall._should_retry',
            lambda *args, **kwargs: False
        ):
            await self.rbt.up(
                Application(servicers=[AccountServicer, BankServicer]),
                local_envoy=True,
                local_envoy_tls=True,
                servers=2,
            )
            context = self.rbt.create_external_context(name=self.id())

            bank, _ = await Bank.factory.Create(context, SINGLETON_BANK_ID)

            bank_server_id, account_server_id = await self.rbt.unique_servers(
                bank._state_ref,
                account_ref,
            )

            # Run `SignUp` in the background. It will hang because
            # participant prepare is mocked to hang.
            async def sign_up():
                await bank.SignUp(context, account_id=account_ref.id)

            sign_up_task = asyncio.create_task(sign_up())

            # Wait for the coordinator to have written the
            # participants and `preparing=True` to the database.
            await transaction_coordinator_prepare_done.wait()

            # Stop both servers. The coordinator has a record of the
            # transaction as "preparing". The participant never
            # prepared (no durable transaction).
            bank_server = await self.rbt.server_stop(bank_server_id)
            account_server = await self.rbt.server_stop(account_server_id)

            # The RPC should fail because the server was stopped, and
            # we've mocked it so that it doesn't retry so we know we
            # can try a new fresh transaction after recovery below.
            with self.assertRaises(Bank.SignUpAborted):
                await sign_up_task

            context.acknowledge_idempotency_uncertainty()

        # Now restart without the mocks. Recovery should find the
        # 'preparing' record, re-prepare, get a definitive error from
        # the participant (which has restarted and has no durable
        # prepared state), and abort the transaction.
        await self.rbt.server_start(bank_server)
        await self.rbt.server_start(account_server)

        # Verify that the transaction was aborted by running a new
        # transaction that creates the same account — if the old
        # transaction had committed, this would fail because the
        # account would already exist.
        bank = Bank.ref(SINGLETON_BANK_ID)
        await bank.SignUp(context, account_id=account_ref.id)

        # Verify the account works.
        jonathan = Account.ref(account_ref.id)
        await jonathan.Deposit(context, amount=100)

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

            bank, _ = await Bank.factory.Create(context, SINGLETON_BANK_ID)

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

            bank, _ = await Bank.factory.Create(context, SINGLETON_BANK_ID)

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
                self.assertTrue(transaction.unrecoverable_abort)
                self.assertFalse(context.transaction_unrecoverable_abort)
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
                self.assertFalse(transaction.unrecoverable_abort)
                self.assertFalse(context.transaction_unrecoverable_abort)

        with self.get_transactionally_patch(
            check_transactionally
        ), self.expect_call_raises_anything_but_assertion_error(
            bank_rbt.BankServicerMiddleware.Transferrable
        ):
            await self.rbt.up(
                Application(servicers=[BankServicer, AccountServicer]),
            )

            context = self.rbt.create_external_context(name=self.id())

            bank, _ = await Bank.factory.Create(context, SINGLETON_BANK_ID)

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
                self.assertTrue(transaction.unrecoverable_abort)
                self.assertTrue(context.transaction_unrecoverable_abort)
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
                self.assertTrue(transaction.unrecoverable_abort)
                self.assertFalse(context.transaction_unrecoverable_abort)

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

            bank, _ = await Bank.factory.Create(context, SINGLETON_BANK_ID)

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
                self.assertTrue(transaction.unrecoverable_abort)
                self.assertTrue(context.transaction_unrecoverable_abort)
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
                self.assertTrue(transaction.unrecoverable_abort)
                self.assertFalse(context.transaction_unrecoverable_abort)

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

            bank, _ = await Bank.factory.Create(context, SINGLETON_BANK_ID)

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

        bank, _ = await Bank.factory.Create(context, SINGLETON_BANK_ID)

        await bank.SignUp(context, account_id='jonathan')

        with self.assertRaises(Bank.TryCatchUndeclaredErrorAborted) as aborted:
            await bank.TryCatchUndeclaredError(context, account_id='jonathan')

        # TODO: better error message than just 'Transaction must abort'.
        self.assertIn('Transaction must abort', str(aborted.exception))

    async def test_nested_catch_undeclared_aborts_root(self):
        """Test that a nested transaction which catches an undeclared
        error from a sub-call and continues still aborts the whole
        (root) transaction. The nested transaction returns normally, but
        the caught undeclared error left it unrecoverable, so doom
        propagation must make the root abort rather than commit.
        """

        await self.rbt.up(
            Application(servicers=[BankServicer, AccountServicer]),
        )

        context = self.rbt.create_external_context(name=self.id())

        bank, _ = await Bank.factory.Create(context, SINGLETON_BANK_ID)

        await bank.SignUp(context, account_id='jonathan')

        with self.assertRaises(
            Bank.TestNestedCatchUndeclaredAborted
        ) as aborted:
            await bank.TestNestedCatchUndeclared(
                context, account_id='jonathan'
            )

        self.assertIn('Transaction must abort', str(aborted.exception))

    async def test_nested_read_only_doomed_subtree_aborts_root(self):
        """Test that a three-level, entirely read-only tree where the
        doom is buried still aborts the root. A read-only nested
        transaction aborts with an undeclared error, an intermediate
        transaction catches it and returns normally, and the root never
        learns (via its own context flag) that the subtree is doomed.
        Every participant is read-only, so the root would otherwise take
        the all-read-only two phase commit elision and silently commit;
        doom propagation must make it abort instead.
        """

        await self.rbt.up(
            Application(servicers=[BankServicer, AccountServicer]),
        )

        context = self.rbt.create_external_context(name=self.id())

        bank, _ = await Bank.factory.Create(context, SINGLETON_BANK_ID)

        await bank.SignUp(context, account_id='catcher')
        await bank.SignUp(context, account_id='thrower')

        with self.assertRaises(
            Bank.TestNestedReadOnlyDoomedSubtreeAborted
        ) as aborted:
            await bank.TestNestedReadOnlyDoomedSubtree(
                context,
                catcher_account_id='catcher',
                thrower_account_id='thrower',
            )

        self.assertIn('Transaction must abort', str(aborted.exception))

    async def test_transaction_not_aborts_when_catching_declared_errors(self):
        """Test that catching a declared error will not abort the transaction.
        """

        await self.rbt.up(
            Application(servicers=[BankServicer, AccountServicer]),
        )

        context = self.rbt.create_external_context(name=self.id())

        bank, _ = await Bank.factory.Create(context, SINGLETON_BANK_ID)

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

        bank, _ = await Bank.factory.Create(context, SINGLETON_BANK_ID)

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

    async def test_inherited_ownership_abort(self):
        """Test that when a nested transaction aborts a state that an
        _intermediate_ transaction never touched (so ownership is
        inherited back up the tree on abort), the rest of the
        transaction can still use that state. Regression test for a
        deadlock where the aborted nested transaction left the
        intermediate transaction owning the state without a record to
        relinquish it.
        """
        await self.rbt.up(
            Application(servicers=[BankServicer, AccountServicer]),
        )

        context = self.rbt.create_external_context(name=self.id())

        bank, _ = await Bank.factory.Create(context, SINGLETON_BANK_ID)

        # Opens 'inherited' (balance 10), then via a nested transaction
        # that does NOT touch 'inherited' calls a deeper nested
        # transaction that writes and aborts 'inherited', then deposits
        # 5 into 'inherited'.
        await bank.TestInheritedOwnershipAbort(context, account_id='inherited')

        # The aborted nested transaction's write must have been dropped
        # (10 + 5, not 10 + 10 + 5).
        response = await Account.ref('inherited').Balance(context)
        self.assertEqual(15, response.amount)

        # And the account the aborted nested transaction tried to
        # construct must not exist.
        with self.assertRaises(Account.BalanceAborted) as aborted:
            await Account.ref('inherited-nested').Balance(context)

        self.assertTrue(
            isinstance(aborted.exception.error, StateNotConstructed),
        )

    async def test_retain_read_lock_after_declared_abort(self):
        """Test that when a nested transaction reads a state and then
        aborts with a declared error that escapes to a catching caller,
        the root transaction keeps the state read-locked so a concurrent
        writer can not change the value the caller observed before the
        root commits.
        """
        from tests.reboot.bank import (
            retain_read_lock_nested_aborted,
            retain_read_lock_release,
        )

        # These module-level events coordinate the servicer with us;
        # make sure they start clear (they persist across test methods).
        retain_read_lock_nested_aborted.clear()
        retain_read_lock_release.clear()

        # Detect when the concurrent writer reaches the per-state
        # exclusive lock acquisition so that we only release the root
        # transaction once the writer is genuinely contending for the
        # retained read lock. We only start watching after the root has
        # parked, so the only exclusive acquisition we observe is the
        # writer's.
        watching = False
        real_acquire_exclusive = Lock.acquire_exclusive
        writer_reached_lock = asyncio.Event()

        async def mock_acquire_exclusive(lock, *args, **kwargs):
            if watching:
                writer_reached_lock.set()
            return await real_acquire_exclusive(lock, *args, **kwargs)

        with mock.patch(
            'reboot.aio.state_managers.Lock.acquire_exclusive',
            mock_acquire_exclusive,
        ):
            # Disable effect validation so that the transaction body
            # (which coordinates with us via module-level events) runs
            # exactly once.
            await self.rbt.up(
                Application(servicers=[BankServicer, AccountServicer]),
                effect_validation=EffectValidation.DISABLED,
            )

            context = self.rbt.create_external_context(name=self.id())

            bank, _ = await Bank.factory.Create(context, SINGLETON_BANK_ID)

            await bank.SignUp(
                context, account_id='retainacct', initial_deposit=10
            )

            # The root transaction reads 'retainacct' via a nested
            # transaction that declared-aborts, then (once we release
            # it) reads the balance again.
            root_task = asyncio.create_task(
                bank.TestRetainReadLockAfterDeclaredAbort(
                    context,
                    account_id='retainacct',
                )
            )

            # Wait until the root has aborted the nested transaction and
            # thus retained the read lock on 'retainacct'.
            await retain_read_lock_nested_aborted.wait()

            # Now launch a concurrent writer (a separate transaction)
            # that must block on the retained read lock.
            watching = True
            deposit_context = self.rbt.create_external_context(
                name=self.id() + '-deposit'
            )
            deposit_task = asyncio.create_task(
                Account.ref('retainacct').Deposit(deposit_context, amount=5)
            )

            # Wait until the writer is contending for the exclusive lock
            # before letting the root read the balance again.
            await writer_reached_lock.wait()

            # Release the root: it reads the balance (which must still be
            # the value the nested transaction observed since the writer
            # is blocked) and commits.
            retain_read_lock_release.set()

            response = await root_task
            self.assertEqual(10, response.amount)

            # Only once the root has committed (releasing the read lock)
            # can the writer proceed.
            await deposit_task

            self.assertEqual(
                15,
                (await Account.ref('retainacct').Balance(context)).amount,
            )

    async def test_prepare_waits_for_nested_abort_rollback(self):
        """A participant must not prepare while a nested (sub)transaction
        still owns it. When a nested transaction writes a remote state
        and then declared-aborts, the root must wait for that state's
        rollback (`RelinquishOwnership`) to land before preparing it,
        otherwise it would persist the aborted write. Here we delay the
        rollback past the root's prepare and assert that prepare parks
        on the still-nested ownership until the rollback lands.
        """
        real_relinquish = SidecarStateManager.RelinquishOwnership
        real_wait_ownership = StateManager.Transaction.wait_ownership

        relinquish_blocked = asyncio.Event()
        release_relinquish = asyncio.Event()
        prepare_parked = asyncio.Event()

        async def mock_relinquish_ownership(
            state_manager, request, grpc_context
        ):
            # Hold up the aborted nested transaction's rollback of
            # 'prepwait' so that the root's prepare reaches it first.
            headers = Headers.from_grpc_context(grpc_context)
            if (
                request.aborted and headers.state_id == 'prepwait' and
                not relinquish_blocked.is_set()
            ):
                relinquish_blocked.set()
                await release_relinquish.wait()
            return await real_relinquish(state_manager, request, grpc_context)

        async def mock_wait_ownership(transaction, condition, *args, **kwargs):
            # Once 'prepwait's rollback is blocked, the next ownership
            # wait whose condition is unmet is the prepare-wait parking
            # on the still-nested owner.
            if relinquish_blocked.is_set() and not condition():
                prepare_parked.set()
            return await real_wait_ownership(
                transaction, condition, *args, **kwargs
            )

        with mock.patch(
            'reboot.aio.state_managers.SidecarStateManager.RelinquishOwnership',
            mock_relinquish_ownership,
        ), mock.patch(
            'reboot.aio.state_managers.StateManager.Transaction.wait_ownership',
            mock_wait_ownership,
        ):
            # Disable effect validation so the transaction body runs
            # exactly once (otherwise a re-run would abort and fan out a
            # second time, past our one-shot block).
            await self.rbt.up(
                Application(servicers=[BankServicer, AccountServicer]),
                effect_validation=EffectValidation.DISABLED,
            )

            context = self.rbt.create_external_context(name=self.id())

            bank, _ = await Bank.factory.Create(context, SINGLETON_BANK_ID)

            root_task = asyncio.create_task(
                bank.TestPrepareWaitForNestedAbortRollback(
                    context,
                    remote_account_id='prepwait',
                    amount=50,
                )
            )

            # The nested transaction has aborted and 'prepwait's rollback
            # is blocked; the root proceeds to prepare 'prepwait' and
            # must park on the still-nested ownership.
            await prepare_parked.wait()
            self.assertFalse(root_task.done())

            # Let the rollback land: prepare now drains and the root
            # commits.
            release_relinquish.set()
            await root_task

            # The nested deposit must have been rolled back before
            # 'prepwait' was prepared: it has only its opening balance.
            response = await Account.ref('prepwait').Balance(context)
            self.assertEqual(100, response.amount)

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

        await Bank.factory.Create(context, SINGLETON_BANK_ID)

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
        item1, _ = await General.factory.ConstructorTransaction(
            context, "item1"
        )
        self.assertEqual(
            {"yep": "it ran"}, dict((await item1.Reader(context)).content)
        )

        # Abort the constructor, and confirm that we are un-constructed.
        with self.assertRaises(
            General.ConstructorTransactionAborted
        ) as ct_aborted:
            await General.factory.ConstructorTransaction(
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

    async def test_constructor_transaction_without_writes_persists(self):
        """Tests that a transactional constructor whose body does not mutate
        the state still persists, so the actor exists afterwards. The body
        produces no state mutation, so the all-read-only 2PC elision must not
        treat the transaction as read-only and drop the construction.
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
                # Deliberately leave `state` at its default: the
                # construction itself is the only effect.
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

        item, _ = await General.factory.ConstructorTransaction(context, "item")

        # The actor must be constructed: reading it must succeed rather
        # than abort with `StateNotConstructed`.
        self.assertEqual({}, dict((await item.Reader(context)).content))

    async def test_nested_transactions(self):
        """Tests that a nested transaction and parent transaction may
        read/modify shared state (previously unsupported shapes).
        """
        await self.rbt.up(
            Application(servicers=[AccountServicer, BankServicer])
        )

        context = self.rbt.create_external_context(name=self.id())

        bank, _ = await Bank.factory.Create(context, SINGLETON_BANK_ID)

        # A nested transaction (`Bank.Transfer`) on the same `Bank`
        # state as the parent transaction, also modifying accounts
        # the parent opened.
        await bank.TestNestedTransactions(
            context,
            type=bank_rbt.TestNestedTransactionsRequest.NESTED_TXN_SAME_STATE,
        )

        response = await Account.ref('jonathan-same-state').Balance(context)
        self.assertEqual(1, response.amount)

        response = await Account.ref('ben-same-state').Balance(context)
        self.assertEqual(1, response.amount)

        # The parent transaction modifies account state that a nested
        # transaction (`Bank.Transfer`) modified, exercising the
        # `RelinquishOwnership` after the nested transaction
        # completes.
        await bank.TestNestedTransactions(
            context,
            type=bank_rbt.TestNestedTransactionsRequest.
            NESTED_TXN_PARENT_WRITER,
        )

        response = await Account.ref('jonathan-parent-writer').Balance(context)
        self.assertEqual(6, response.amount)

        response = await Account.ref('ben-parent-writer').Balance(context)
        self.assertEqual(1, response.amount)

        # A nested transaction that aborts after modifying state
        # shared with the parent restores that state to its value
        # from before the nested transaction; the parent catches the
        # error, continues, and commits.
        await bank.TestNestedTransactions(
            context,
            type=bank_rbt.TestNestedTransactionsRequest.
            NESTED_TXN_SHARED_WRITE_ABORT,
        )

        # The accounts keep the values from before the aborted
        # nested transaction (`Bank.Transfer`) modified them.
        response = await Account.ref('jonathan-shared-write-abort'
                                    ).Balance(context)
        self.assertEqual(1, response.amount)

        response = await Account.ref('ben-shared-write-abort').Balance(context)
        self.assertEqual(0, response.amount)

        # A nested transaction that aborts after only _reading_ state
        # does not abort that state: the parent can still use (and
        # even modify) it and commit.
        await bank.SignUp(
            context,
            account_id='jonathan-read-only-abort',
            initial_deposit=7,
        )

        await bank.TestNestedTransactions(
            context,
            type=bank_rbt.TestNestedTransactionsRequest.
            NESTED_TXN_READ_ONLY_ABORT,
        )

        response = await Account.ref('jonathan-read-only-abort'
                                    ).Balance(context)
        self.assertEqual(12, response.amount)

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

        general, _ = await General.factory.ConstructorWriter(context)

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
        bank, _ = await Bank.factory.Create(context, SINGLETON_BANK_ID)
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
        bank, _ = await Bank.factory.Create(context, SINGLETON_BANK_ID)

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


if __name__ == '__main__':
    unittest.main(verbosity=2)
