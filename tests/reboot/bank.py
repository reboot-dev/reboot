import asyncio
import grpc
# ISSUE(https://github.com/reboot-dev/mono/issues/1136): what's our logging
# story for user applications?
import logging
import uuid
from google.protobuf.empty_pb2 import Empty
from rbt.v1alpha1.errors_pb2 import Unavailable
from reboot.aio.aborted import SystemAborted
from reboot.aio.auth.authorizers import allow
from reboot.aio.backoff import Backoff
from reboot.aio.call import Options
from reboot.aio.contexts import (
    ReaderContext,
    TransactionContext,
    WriterContext,
)
from reboot.aio.headers import APPLICATION_ID_HEADER
from tests.reboot import bank_pb2, bank_pb2_grpc, bank_rbt
from tests.reboot.bank_rbt import Account, Bank
from typing import AsyncIterable

# The `Bank` state machine is a singleton, so we give it a fixed ID.
# TODO(rjh): once singletons are a fully-supported concept, make `Bank` one.
#
# Using a '/' in the state name to test the escaping of slashes in
# state IDs.
SINGLETON_BANK_ID = "(singleton)/bank"

# Coordination events for `test_retain_read_lock_after_declared_abort`:
# the servicer signals once it has aborted its nested transaction (and
# thus retained the read lock), then waits for the test to launch a
# concurrent writer before reading the balance again.
retain_read_lock_nested_aborted = asyncio.Event()
retain_read_lock_release = asyncio.Event()


# The `AccountServicer` is a `Singleton` servicer, since it need to
# support state streaming.
class AccountServicer(Account.singleton.Servicer):

    def authorizer(self):
        return allow()

    async def deposit(
        self,
        context: WriterContext,
        state: Account.State,
        request: bank_rbt.DepositRequest,
    ) -> bank_rbt.DepositResponse:
        # Test that `context.constructor` is correctly being set.
        assert not context.constructor

        if request.amount == 0:
            raise Account.DepositAborted(bank_rbt.ZeroDepositError())
        state.balance += request.amount
        return bank_rbt.DepositResponse()

    async def open(
        self,
        context: TransactionContext,
        state: Account.State,
        request: bank_rbt.OpenRequest,
    ) -> bank_rbt.OpenResponse:
        # Test that `context.constructor` is correctly being set.
        assert context.constructor

        if (
            request.HasField('initial_deposit') and
            request.initial_deposit == 0
        ):
            raise Account.OpenAborted(bank_rbt.ZeroDepositError())

        state.balance = request.initial_deposit

        # We create a task just for testing tasks within a transaction.
        await self.ref(
            bearer_token=context.caller_bearer_token,
        ).schedule().post_open(context)

        return bank_rbt.OpenResponse()

    async def post_open(
        self,
        context: WriterContext,
        state: Account.State,
        request: bank_rbt.PostOpenRequest,
    ) -> bank_rbt.PostOpenResponse:
        logging.info(f'PostOpen request: {request}')
        return bank_rbt.PostOpenResponse()

    async def withdraw(
        self,
        context: WriterContext,
        state: Account.State,
        request: bank_rbt.WithdrawRequest,
    ) -> bank_rbt.WithdrawResponse:
        state.balance -= request.amount
        if state.balance < 0:
            raise Account.WithdrawAborted(
                bank_rbt.OverdraftError(amount=-state.balance),
            )
        return bank_rbt.WithdrawResponse()

    async def balance(
        self,
        context: ReaderContext,
        state: Account.State,
        request: bank_rbt.BalanceRequest,
    ) -> bank_rbt.BalanceResponse:
        return bank_rbt.BalanceResponse(amount=state.balance)

    async def throw_exception(
        self,
        context: WriterContext,
        state: Account.State,
        request: bank_rbt.ThrowExceptionRequest,
    ) -> bank_rbt.ThrowExceptionResponse:
        raise ValueError('Jazz hands!')

    async def mimic_unavailable(
        self,
        context: ReaderContext,
        state: Account.State,
        request: bank_rbt.MimicUnavailableRequest,
    ) -> Empty:
        # Only mimic the `Unavailable` error if the account has a low
        # balance. This lets tests "deactivate" this unavailability by
        # depositing money, allowing them to test that retries of
        # requests that prevously failed with `Unavailable` can succeed.
        if state.balance > 0:
            return Empty()

        # Mimic a system error that came due to an `Unavailable` that
        # we'd want to propagate to the client so they retry.
        if request.system:
            raise SystemAborted(Unavailable())

        # Mimic calling `Balance` on another account which was
        # `Unavailable` which should propagate.
        raise Account.BalanceAborted(Unavailable())

    async def fail(
        self,
        context: ReaderContext,
        state: Account.State,
        request: bank_rbt.FailRequest,
    ) -> bank_rbt.FailResponse:
        raise Account.FailAborted(bank_rbt.UserError())

    async def stream_state_updates(
        self,
        context: ReaderContext,
        states: AsyncIterable[Account.State],
        request: bank_rbt.StreamStateUpdatesRequest,
    ) -> AsyncIterable[bank_rbt.StreamStateUpdatesResponse]:

        async for state in states:
            yield bank_rbt.StreamStateUpdatesResponse(state=state)

    async def test_nested_transaction_that_aborts(
        self,
        context: TransactionContext,
        state: Account.State,
        request: Empty,
    ) -> Empty:
        # We abort below so this should not take effect.
        state.balance += 10

        # We abort below so this call should also not take effect.
        await Account.open(context, f'{context.state_id}-nested')

        raise Account.TestNestedTransactionThatAbortsAborted(
            bank_rbt.UserError()
        )

    async def test_read_only_nested_transaction_that_aborts(
        self,
        context: TransactionContext,
        state: Account.State,
        request: Empty,
    ) -> Empty:
        # We don't modify any state before aborting so this nested
        # transaction's participants stay read-only and must not be
        # aborted.
        raise Account.TestReadOnlyNestedTransactionThatAbortsAborted(
            bank_rbt.UserError()
        )

    async def read_only_undeclared_abort(
        self,
        context: TransactionContext,
        state: Account.State,
        request: Empty,
    ) -> Empty:
        # A read-only transaction (we never modify `state`) that aborts
        # with an _undeclared_ (hence unrecoverable) error.
        raise ValueError('Jazz hands!')

    async def catch_read_only_undeclared(
        self,
        context: TransactionContext,
        state: Account.State,
        request: bank_rbt.CatchReadOnlyUndeclaredRequest,
    ) -> Empty:
        # Call a read-only transaction that aborts undeclared and catch
        # the (unrecoverable) error, then return normally. We never
        # modify our own `state`, so every participant in this subtree
        # is read-only.
        try:
            await Account.ref(request.callee_account_id
                             ).read_only_undeclared_abort(context)
        except Account.ReadOnlyUndeclaredAbortAborted:
            pass

        return Empty()


class BankServicer(Bank.Servicer):

    def authorizer(self):
        return allow()

    async def create(
        self,
        context: WriterContext,
        request: Empty,
    ) -> Empty:
        # Enforce the singleton existence of only one Bank instance: check that
        # the state being constructed has the only valid ID.
        if context.state_id != SINGLETON_BANK_ID:
            raise ValueError(
                "Bank.Create can only be called on the state machine with ID "
                f"'{SINGLETON_BANK_ID}'"
            )

        return Empty()

    async def sign_up(
        self,
        context: TransactionContext,
        request: bank_rbt.SignUpRequest,
    ) -> bank_rbt.SignUpResponse:
        if request.account_id in self.state.account_ids:
            raise ValueError(f"Account '{request.account_id}' already exists!")

        self.state.account_ids.append(request.account_id)

        # NOTE: testing nested transactions by calling `Account.Open`.
        #
        # Also, we deposit some money into the account via
        # `request.initial_deposit` to be able to distinguish in a
        # test between a default account value of 0 and an account
        # that is created through this signup flow.

        # Since we may manually retry the following call, we must
        # provide idempotency, which we do via passing the string
        # alias 'open'.
        await Account.idempotently('open').open(
            context,
            request.account_id,
            Options(bearer_token=context.caller_bearer_token),
            initial_deposit=(
                request.initial_deposit
                if request.HasField('initial_deposit') else None
            ),
        )

        # For testing purposes, call the 'open' method again - so that it's always
        # called twice, and idempotency is demonstrated.
        account, _ = await Account.idempotently('open').open(
            context,
            request.account_id,
            Options(bearer_token=context.caller_bearer_token),
            initial_deposit=(
                request.initial_deposit
                if request.HasField('initial_deposit') else None
            ),
        )

        # NOTE: nested transactions no longer need to read/modify
        # mutually exclusive state, so this could also be done by
        # calling `Bank.Transfer` (see
        # `test_nested_transactions` which exercises
        # exactly that shape).
        if request.HasField('initial_deposit_transfer_from_account_id'):
            from_account = Account.ref(
                request.initial_deposit_transfer_from_account_id
            )

            await from_account.Withdraw(
                context,
                amount=request.initial_deposit,
            )

        # Tests that we can schedule a task via `self.ref()`.
        task_id = await self.ref(
            bearer_token=context.caller_bearer_token,
        ).schedule().post_sign_up(context)

        return bank_rbt.SignUpResponse(task_id=task_id)

    async def await_post_sign_up(
        self,
        context: ReaderContext,
        request: bank_rbt.AwaitPostSignUpRequest,
    ) -> Empty:
        await bank_rbt.Bank.PostSignUpTask.retrieve(
            context,
            task_id=request.task_id,
        )
        return Empty()

    async def post_sign_up(
        self,
        context: ReaderContext,
        request: Empty,
    ) -> Empty:
        return Empty()

    async def transferrable(
        self,
        context: TransactionContext,
        request: bank_rbt.TransferrableRequest,
    ) -> bank_rbt.TransferrableResponse:
        bearer_token = context.caller_bearer_token
        from_account = Account.ref(
            request.from_account_id,
            bearer_token=bearer_token,
        )

        balance_response: bank_rbt.BalanceResponse = await from_account.balance(
            context,
        )

        transferrable = balance_response.amount >= request.amount

        # We check the 'to_account' balance simply as means of
        # ensuring the account actually exists.
        to_account = Account.ref(
            request.to_account_id,
            bearer_token=context.caller_bearer_token,
        )

        await to_account.balance(context)

        # NOTE: we're asserting that the from and to accounts are part
        # of state _after_ we've tried to make RPCs to them because if
        # those are successful then they could only have been
        # constructed via the 'SignUp' transaction.
        assert request.from_account_id in self.state.account_ids, (
            f"From account '{request.from_account_id}' does not exist"
        )

        assert request.to_account_id in self.state.account_ids, (
            f"To account '{request.to_account_id}' does not exist"
        )

        return bank_rbt.TransferrableResponse(transferrable=transferrable)

    async def transfer(
        self,
        context: TransactionContext,
        request: bank_rbt.TransferRequest,
    ) -> bank_rbt.TransferResponse:
        from_account = Account.ref(
            request.from_account_id,
            bearer_token=context.caller_bearer_token,
        )
        to_account = Account.ref(
            request.to_account_id,
            bearer_token=context.caller_bearer_token,
        )
        await from_account.withdraw(context, amount=request.amount)
        await to_account.deposit(context, amount=request.amount)
        return bank_rbt.TransferResponse()

    async def assets_under_management(
        self,
        context: ReaderContext,
        request: bank_rbt.AssetsUnderManagementRequest,
    ) -> bank_rbt.AssetsUnderManagementResponse:
        backoff = Backoff()

        while True:
            balance_calls: list[asyncio.Task[bank_rbt.BalanceResponse]] = []
            account_ids = list(self.state.account_ids)
            logging.info(
                f'Assessing balances for {len(account_ids)} accounts)'
            )
            for account_id in account_ids:
                account = Account.ref(account_id)
                balance_calls.append(
                    asyncio.create_task(account.balance(context))
                )

            logging.debug('Waiting for responses...')
            balance_responses = await asyncio.gather(*balance_calls)
            total = sum(
                balance_response.amount
                for balance_response in balance_responses
            )
            logging.debug(f'Done. Sum total: {total}')

            if total < request.wait_for_amount_at_least:
                await backoff()
                continue

            # Call a reader on the account that we know will fail to test
            # that everything else just keeps working when this is a
            # reactive call.
            if len(account_ids) > 0:
                account = Account.ref(
                    account_ids[0],
                    bearer_token=context.caller_bearer_token,
                )
                try:
                    await account.fail(context)
                except Account.FailAborted as aborted:
                    assert isinstance(aborted.error, bank_rbt.UserError)

            return bank_rbt.AssetsUnderManagementResponse(
                amount=total, num_accounts=len(balance_responses)
            )

    async def try_catch_undeclared_error(
        self,
        context: TransactionContext,
        request: bank_rbt.TryCatchUndeclaredErrorRequest,
    ) -> Empty:

        account = Account.ref(request.account_id)

        try:
            await account.throw_exception(
                context,
                Options(bearer_token=context.caller_bearer_token),
            )
        except Account.ThrowExceptionAborted as aborted:
            assert 'Jazz hands!' in str(aborted)

            # At present, even if the exception is caught and handled, the
            # transaction will still be set to abort.
            assert context.transaction_unrecoverable_abort
        else:
            raise RuntimeError('Expecting to abort!')

        return Empty()

    async def try_catch_declared_error(
        self,
        context: TransactionContext,
        request: bank_rbt.TryCatchDeclaredErrorRequest,
    ) -> Empty:

        account = Account.ref(request.account_id)

        balance = 0

        if request.read_before:
            response = await account.balance(context)
            assert balance == response.amount

        if request.write_before:
            await account.deposit(context, amount=1)
            balance += 1

        try:
            await account.withdraw(
                context,
                Options(bearer_token=context.caller_bearer_token),
                amount=balance + 1,
            )
        except Account.WithdrawAborted as aborted:
            assert isinstance(aborted.error, bank_rbt.OverdraftError)
            # Since this is a declared error, we can catch the
            # exception and allow the transaction to not abort.
            assert not context.transaction_unrecoverable_abort
        else:
            raise RuntimeError('Expecting to abort!')

        if request.write_after:
            await account.deposit(context, amount=1)

        if request.read_after:
            await account.balance(context)

        return Empty()

    async def test_unconstructed_reader_fails(
        self,
        context: TransactionContext,
        request: bank_rbt.TestUnconstructedReaderFailsRequest,
    ) -> bank_rbt.TestUnconstructedReaderFailsResponse:
        """Call reader on an unconstructed account.

        This should fail.
        """
        account = Account.ref(
            str(uuid.uuid4()),
            bearer_token=context.caller_bearer_token,
        )

        await account.balance(context)

        return bank_rbt.TestUnconstructedReaderFailsResponse()

    async def TestUnconstructedStreamingReaderFails(
        self,
        context: TransactionContext,
        request: bank_rbt.TestUnconstructedStreamingReaderFailsRequest,
    ) -> bank_rbt.TestUnconstructedStreamingReaderFailsResponse:
        """Call streaming reader on an unconstructed account.

        This should fail.
        """
        account = Account.ref(
            str(uuid.uuid4()),
            bearer_token=context.caller_bearer_token,
        )

        async for _ in account.stream_state_updates(context):
            break

        return bank_rbt.TestUnconstructedStreamingReaderFailsResponse()

    async def test_undeclared_error(
        self,
        context: ReaderContext,
        request: bank_rbt.TestUndeclaredErrorRequest,
    ) -> bank_rbt.TestUndeclaredErrorResponse:
        # Induce an `AttributeError` by accessing a property that
        # doesn't exist.
        request.this_field_does_not_exist

        return bank_rbt.TestUndeclaredErrorResponse()

    async def test_nested_transaction_that_aborts(
        self,
        context: TransactionContext,
        request: bank_rbt.TestNestedTransactionThatAbortsRequest,
    ) -> Empty:

        account = Account.ref(request.account_id)

        # Read the account's balance _before_ calling the nested
        # transaction so that this transaction also participates in
        # (shares) the account's state; since we only read it while
        # unmodified the nested transaction's abort must not cascade
        # to us.
        await account.balance(context)

        try:
            await account.test_nested_transaction_that_aborts(context)
        except Account.TestNestedTransactionThatAbortsAborted as aborted:
            assert isinstance(aborted.error, bank_rbt.UserError)
        else:
            raise RuntimeError('Expecting to abort!')

        account, response = await Account.open(
            context,
            f'{request.account_id}-parent',
            initial_deposit=42,
        )

        return Empty()

    async def test_inherited_ownership_abort(
        self,
        context: TransactionContext,
        request: bank_rbt.TestInheritedOwnershipAbortRequest,
    ) -> Empty:
        # We (the root transaction) first join the account by opening
        # it.
        account, _ = await Account.open(
            context,
            request.account_id,
            initial_deposit=10,
        )

        # Call a nested transaction that, via a _deeper_ nested
        # transaction, writes and aborts the account WITHOUT us
        # touching the account ourselves, so when the deeper nested
        # transaction aborts, ownership of the account is inherited
        # back to us (its abort returns ownership to whoever owned it
        # before it, i.e., us).
        await self.ref().test_inherited_ownership_abort_nested(
            context,
            account_id=request.account_id,
        )

        # Now touch the account again. The aborted nested transaction
        # must have returned ownership to us (and not left us owning it
        # without a record to relinquish), otherwise this would block
        # forever waiting to claim ownership.
        await account.deposit(context, amount=5)

        return Empty()

    async def test_inherited_ownership_abort_nested(
        self,
        context: TransactionContext,
        request: bank_rbt.TestInheritedOwnershipAbortRequest,
    ) -> Empty:
        # Call a nested transaction that writes the account and aborts,
        # WITHOUT touching the account ourselves, so ownership of it is
        # inherited back to _our_ caller (not us) when it aborts.
        account = Account.ref(request.account_id)
        try:
            await account.test_nested_transaction_that_aborts(context)
        except Account.TestNestedTransactionThatAbortsAborted as aborted:
            assert isinstance(aborted.error, bank_rbt.UserError)
        else:
            raise RuntimeError('Expecting to abort!')

        return Empty()

    async def test_retain_read_lock_after_declared_abort(
        self,
        context: TransactionContext,
        request: bank_rbt.TestRetainReadLockAfterDeclaredAbortRequest,
    ) -> bank_rbt.TestRetainReadLockAfterDeclaredAbortResponse:
        account = Account.ref(request.account_id)

        # Call a nested transaction that reads the account and then
        # aborts with a declared error, which we catch and continue
        # past. Because that error escaped to us, the account must stay
        # read-locked by us (the root transaction) at the value the
        # nested transaction observed, so a concurrent writer can not
        # change it out from under us before we commit.
        try:
            await account.test_read_only_nested_transaction_that_aborts(
                context
            )
        except Account.TestReadOnlyNestedTransactionThatAbortsAborted \
                as aborted:
            assert isinstance(aborted.error, bank_rbt.UserError)
        else:
            raise RuntimeError('Expecting to abort!')

        # Let the test know we've retained the read lock, then wait for
        # it to launch a concurrent writer (which must block on our read
        # lock) before we read the balance again.
        retain_read_lock_nested_aborted.set()
        await retain_read_lock_release.wait()

        # The balance must be unchanged: the concurrent writer is
        # blocked on the read lock we retained from the aborted nested
        # transaction.
        response = await account.balance(context)

        return bank_rbt.TestRetainReadLockAfterDeclaredAbortResponse(
            amount=response.amount,
        )

    async def test_nested_catch_undeclared(
        self,
        context: TransactionContext,
        request: bank_rbt.TestNestedCatchUndeclaredRequest,
    ) -> Empty:
        # Call, as a nested transaction, a transaction that catches an
        # undeclared error from a sub-call and continues. Even though
        # the nested transaction returns normally, the caught undeclared
        # error leaves the transaction unrecoverable, so the whole
        # (root) transaction must still abort.
        bank = Bank.ref(SINGLETON_BANK_ID)
        await bank.try_catch_undeclared_error(
            context,
            account_id=request.account_id,
        )

        return Empty()

    async def test_nested_read_only_doomed_subtree(
        self,
        context: TransactionContext,
        request: bank_rbt.TestNestedReadOnlyDoomedSubtreeRequest,
    ) -> Empty:
        # Root of a three-level, entirely read-only tree. We call the
        # "catcher", which calls a read-only transaction that aborts
        # undeclared and catches it, then returns normally. We never
        # learn (via our own context flag) that the subtree is doomed,
        # and every participant is read-only — so without doom
        # propagation we would take the all-read-only two phase commit
        # elision and wrongly commit.
        await Account.ref(request.catcher_account_id
                         ).catch_read_only_undeclared(
                             context,
                             callee_account_id=request.thrower_account_id,
                         )

        return Empty()

    async def test_prepare_wait_for_nested_abort_rollback(
        self,
        context: TransactionContext,
        request: bank_rbt.TestPrepareWaitForNestedAbortRollbackRequest,
    ) -> Empty:
        # Open the remote account with a known balance so that the
        # nested transaction below shares (rather than constructs) it.
        await Account.open(
            context,
            request.remote_account_id,
            initial_deposit=100,
        )

        # Call a nested transaction that deposits into the remote
        # account and then aborts with a declared error, which we catch
        # and continue past. The nested transaction's write to the
        # remote account is relinquished via a `RelinquishOwnership`
        # RPC; we (the root) must not prepare that account until the
        # rollback has landed, otherwise we would persist the aborted
        # deposit.
        try:
            await self.ref().deposit_remote_then_abort(
                context,
                remote_account_id=request.remote_account_id,
                amount=request.amount,
            )
        except Bank.DepositRemoteThenAbortAborted as aborted:
            assert isinstance(aborted.error, bank_rbt.UserError)
        else:
            raise RuntimeError('Expecting to abort!')

        return Empty()

    async def deposit_remote_then_abort(
        self,
        context: TransactionContext,
        request: bank_rbt.DepositRemoteThenAbortRequest,
    ) -> Empty:
        # Write a _remote_ account (not our own coordinator state, so
        # the rollback travels via `RelinquishOwnership`) and then abort
        # with a declared error so our caller can catch it.
        await Account.ref(request.remote_account_id).deposit(
            context,
            amount=request.amount,
        )

        raise Bank.DepositRemoteThenAbortAborted(bank_rbt.UserError())

    async def test_calling_legacy_grpc_service(
        self,
        context: TransactionContext,
        request: bank_rbt.TestCallingLegacyGrpcServiceRequest,
    ) -> bank_rbt.TestCallingLegacyGrpcServiceResponse:
        # Call the legacy gRPC service.

        # WARNING: Calling an external service such as a legacy gRPC service is
        # strictly not transactional. This is a demonstration of that it can be
        # done, and it should be viewed as an escape-hatch rather than a best
        # practice.
        # TODO: Consider adding better error handling in case we break this in
        # the future.
        async with context.legacy_grpc_channel() as channel:
            # Create the legacy stub.
            legacy_grpc_stub = bank_pb2_grpc.LegacyRedTapeStub(channel)

            # Test that we can call the method.
            await legacy_grpc_stub.Compliance(
                bank_pb2.ComplianceRequest(),
                # Pass the application ID header explicitly as it cannot be
                # deduced from the gateway address `reboot-system`.
                metadata=((APPLICATION_ID_HEADER, context.application_id),),
            )

        return bank_rbt.TestCallingLegacyGrpcServiceResponse()

    async def test_nested_transactions(
        self,
        context: TransactionContext,
        request: bank_rbt.TestNestedTransactionsRequest,
    ) -> Empty:
        # Nested transactions may now read/modify state shared with
        # their ancestors; this method exercises the two previously
        # unsupported shapes. Each shape uses its own account ids
        # since this method gets called once per shape.
        if (
            request.type ==
            bank_rbt.TestNestedTransactionsRequest.NESTED_TXN_SAME_STATE
        ):
            await Account.open(
                context,
                'jonathan-same-state',
                Options(bearer_token=context.caller_bearer_token),
                initial_deposit=2,
            )
            await Account.open(
                context,
                'ben-same-state',
                Options(bearer_token=context.caller_bearer_token),
            )
            # A nested transaction on the SAME `Bank` state as this
            # parent transaction which also modifies the accounts
            # opened above.
            await self.ref(
                bearer_token=context.caller_bearer_token,
            ).transfer(
                context,
                from_account_id='jonathan-same-state',
                to_account_id='ben-same-state',
                amount=1,
            )
        elif (
            request.type ==
            bank_rbt.TestNestedTransactionsRequest.NESTED_TXN_PARENT_WRITER
        ):
            jonathan, _ = await Account.open(
                context,
                'jonathan-parent-writer',
                Options(bearer_token=context.caller_bearer_token),
                initial_deposit=2,
            )
            await Account.open(
                context,
                'ben-parent-writer',
                Options(bearer_token=context.caller_bearer_token),
            )
            await self.ref(
                bearer_token=context.caller_bearer_token,
            ).transfer(
                context,
                from_account_id='jonathan-parent-writer',
                to_account_id='ben-parent-writer',
                amount=1,
            )
            # The parent transaction modifies state that the nested
            # transaction above also modified.
            await jonathan.deposit(context, amount=5)
        elif (
            request.type == bank_rbt.TestNestedTransactionsRequest.
            NESTED_TXN_SHARED_WRITE_ABORT
        ):
            await Account.open(
                context,
                'jonathan-shared-write-abort',
                Options(bearer_token=context.caller_bearer_token),
                initial_deposit=1,
            )
            await Account.open(
                context,
                'ben-shared-write-abort',
                Options(bearer_token=context.caller_bearer_token),
            )
            # This nested transaction will abort (with a declared
            # overdraft error) due to insufficient funds, restoring
            # the accounts above to their values from before it; we
            # catch the error, continue, and commit.
            try:
                await self.ref(
                    bearer_token=context.caller_bearer_token,
                ).transfer(
                    context,
                    from_account_id='jonathan-shared-write-abort',
                    to_account_id='ben-shared-write-abort',
                    amount=100,
                )
            except Bank.TransferAborted as aborted:
                assert isinstance(aborted.error, bank_rbt.OverdraftError)
            else:
                raise RuntimeError('Expecting to abort!')
        elif (
            request.type ==
            bank_rbt.TestNestedTransactionsRequest.NESTED_TXN_READ_ONLY_ABORT
        ):
            account = Account.ref('jonathan-read-only-abort')

            TestReadOnlyNestedTransactionThatAbortsAborted = (
                Account.TestReadOnlyNestedTransactionThatAbortsAborted
            )
            try:
                await account.test_read_only_nested_transaction_that_aborts(
                    context
                )
            except TestReadOnlyNestedTransactionThatAbortsAborted as aborted:
                assert isinstance(aborted.error, bank_rbt.UserError)
            else:
                raise RuntimeError('Expecting to abort!')

            # The aborted nested transaction only _read_ the account
            # so the account is not aborted and we can still use (and
            # even modify) it.
            await account.deposit(context, amount=5)

        return Empty()

    async def test_reactive_method_call(
        self, context: ReaderContext, request: Empty
    ) -> Empty:
        # Call a method reactively, and see that we don't crash.
        account = Account.ref(self.state.account_ids[0])
        async for _ in account.reactively().balance(context):
            # Yay, that worked.
            break

        return Empty()

    async def mimic_unavailable(
        self,
        context: ReaderContext,
        request: bank_rbt.MimicUnavailableRequest,
    ) -> Empty:
        account = Account.ref(request.account_id)
        return await account.mimic_unavailable(context, system=request.system)


class LegacyRedTapeServicer(bank_pb2_grpc.LegacyRedTapeServicer):

    async def Compliance(
        self,
        request: bank_pb2.ComplianceRequest,
        context: grpc.aio.ServicerContext,
    ) -> bank_pb2.ComplianceResponse:
        # Do nothing, but return an empty response.
        return bank_pb2.ComplianceResponse()
