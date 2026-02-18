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

        # TODO: rather than passing `initial_deposit` to the opened
        # account we could consider calling `Bank.Transfer` once nested
        # transactions don't need to be mutually exclusive.
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
            assert context.transaction_must_abort
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
            assert not context.transaction_must_abort
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

    async def test_unsupported_nested_transactions(
        self,
        context: TransactionContext,
        request: bank_rbt.TestUnsupportedNestedTransactionsRequest,
    ) -> Empty:
        jonathan, _ = await Account.open(
            context,
            'jonathan',
            Options(bearer_token=context.caller_bearer_token),
        )

        if (
            request.type == bank_rbt.TestUnsupportedNestedTransactionsRequest.
            NESTED_TXN_SAME_STATE
        ):
            await self.ref(
                bearer_token=context.caller_bearer_token,
            ).transfer(
                context,
                from_account_id='jonathan',
                to_account_id='ben',
                amount=1,
            )
        elif (
            request.type == bank_rbt.TestUnsupportedNestedTransactionsRequest.
            NESTED_TXN_PARENT_WRITER
        ):
            await jonathan.deposit(context, amount=1)

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
