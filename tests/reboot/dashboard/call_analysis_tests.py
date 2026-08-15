"""The dashboard works out what a method calls by reading it.

Without importing it: `rbt generate` may not have run, no servicer has
to exist, and the file may be half written. Only the source.
"""
import unittest
from rbt.dashboard.v1.dashboard_pb2 import Call, MethodCalls
from reboot.dashboard.call_analysis import analyze, parse

# Every servicer below is written against this, so that the tests read
# as the developer's files do: a state class imported from a generated
# module, which is the only way one is reachable.
IMPORTS = '''
from bank.v1.account_rbt import Account
from bank.v1.bank_rbt import Bank
'''


def _modules(**sources: str) -> dict:
    return {name: parse(name, source) for name, source in sources.items()}


def _analyze(**sources: str) -> dict[str, MethodCalls]:
    return analyze(_modules(**sources))


def _calls(analyses: dict[str, MethodCalls],
           key: str) -> list[tuple[str, str, str]]:
    """What one method calls, as tuples that read like the source."""
    return [
        (call.state_type, call.method, Call.How.Name(call.how))
        for call in analyses[key].calls
    ]


def _servicer(body: str, state: str = 'Account') -> str:
    return IMPORTS + f'''

class {state}Servicer({state}.Servicer):

    def authorizer(self):
        return allow()

{body}
'''


class CallAnalysisTest(unittest.TestCase):

    def test_a_chain_written_out_in_one_go(self) -> None:
        analyses = _analyze(
            servicer=_servicer(
                '''
    async def move(self, context, request):
        await Account.ref(request.id).withdraw(context, amount=1)
'''
            )
        )

        self.assertEqual(
            _calls(analyses, 'bank.v1.Account.move'),
            [('bank.v1.Account', 'withdraw', 'CALL')],
        )

    def test_a_reference_held_in_a_local(self) -> None:
        analyses = _analyze(
            servicer=_servicer(
                '''
    async def transfer(self, context, request):
        source = Account.ref(request.source)
        target = Account.ref(request.target)
        await source.withdraw(context, amount=request.amount)
        await target.deposit(context, amount=request.amount)
'''
            )
        )

        self.assertEqual(
            _calls(analyses, 'bank.v1.Account.transfer'),
            [
                ('bank.v1.Account', 'withdraw', 'CALL'),
                ('bank.v1.Account', 'deposit', 'CALL'),
            ],
        )

    def test_a_constructor_unpacked_into_a_reference(self) -> None:
        analyses = _analyze(
            servicer=_servicer(
                '''
    async def open(self, context, request):
        account, _ = await Account.open(context, request.id)
        await account.deposit(context, amount=request.initial)
'''
            )
        )

        self.assertEqual(
            _calls(analyses, 'bank.v1.Account.open'),
            [
                ('bank.v1.Account', 'open', 'CONSTRUCT'),
                ('bank.v1.Account', 'deposit', 'CALL'),
            ],
        )

    def test_a_constructor_whose_result_is_thrown_away(self) -> None:
        analyses = _analyze(
            servicer=_servicer(
                '''
    async def sign_up(self, context, request):
        await Account.create(context, request.id)
'''
            )
        )

        self.assertEqual(
            _calls(analyses, 'bank.v1.Account.sign_up'),
            [('bank.v1.Account', 'create', 'CONSTRUCT')],
        )

    def test_a_state_class_also_carries_types_that_construct_nothing(
        self
    ) -> None:
        """`Account.WithdrawAborted(...)` makes an error, not an
        account. A constructor is what takes the context first."""
        analyses = _analyze(
            servicer=_servicer(
                '''
    async def balance(self, context):
        if self.state.balance < 0:
            raise Account.WithdrawAborted(Overdraft(amount=1))
        return Account.BalanceResponse(amount=self.state.balance)
'''
            )
        )

        self.assertEqual(_calls(analyses, 'bank.v1.Account.balance'), [])

    def test_the_servicers_own_state(self) -> None:
        analyses = _analyze(
            servicer=_servicer(
                '''
    async def interest(self, context):
        await self.ref().schedule(when=timedelta(seconds=1)).interest(context)
'''
            )
        )

        self.assertEqual(
            _calls(analyses, 'bank.v1.Account.interest'),
            [('bank.v1.Account', 'interest', 'SCHEDULE')],
        )

    def test_every_way_of_reaching_a_method(self) -> None:
        analyses = _analyze(
            servicer=_servicer(
                '''
    async def every(self, context, request):
        await Account.ref(request.id).idempotently('once').deposit(context)
        await Account.ref(request.id).per_iteration('each').withdraw(context)
        await Account.ref(request.id).always().balance(context)
        await Account.forall(request.ids).balance(context)
        await Account.ref(request.id).spawn().interest(context)
        await Account.ref(request.id).until('settled').balance(context)
        async for update in Account.ref(request.id).reactively().balance(
            context
        ):
            pass
        await self.ref().read(context)
        await self.ref().write(context, lambda state: state)
'''
            )
        )

        self.assertEqual(
            _calls(analyses, 'bank.v1.Account.every'),
            [
                ('bank.v1.Account', 'deposit', 'CALL'),
                ('bank.v1.Account', 'withdraw', 'CALL'),
                ('bank.v1.Account', 'balance', 'CALL'),
                ('bank.v1.Account', 'interest', 'SPAWN'),
                ('bank.v1.Account', 'balance', 'UNTIL'),
                ('bank.v1.Account', 'balance', 'REACTIVELY'),
                ('bank.v1.Account', '', 'READ'),
                ('bank.v1.Account', '', 'WRITE'),
            ],
        )

    def test_a_call_made_of_every_id_at_once(self) -> None:
        """`forall` says which states are called, not how the method is
        reached, so it reads as the plain call it is."""
        analyses = _analyze(
            servicer=_servicer(
                '''
    async def balances(self, context, request):
        await Account.forall(request.ids).balance(context)
'''
            )
        )

        self.assertEqual(
            _calls(analyses, 'bank.v1.Account.balances'),
            [('bank.v1.Account', 'balance', 'CALL')],
        )

    def test_a_function_that_closes_over_the_context(self) -> None:
        """It is given no context, so nothing is passed to follow; what
        makes its calls findable is that it is read where what it
        closes over is known."""
        analyses = _analyze(
            servicer=_servicer(
                '''
    async def balances(self, context, request):

        async def balance_of(id):
            return await Account.ref(id).balance(context)

        return await asyncio.gather(*[balance_of(i) for i in request.ids])
'''
            )
        )

        self.assertEqual(
            _calls(analyses, 'bank.v1.Account.balances'),
            [('bank.v1.Account', 'balance', 'CALL')],
        )

    def test_the_same_call_written_twice_is_said_once(self) -> None:
        analyses = _analyze(
            servicer=_servicer(
                '''
    async def twice(self, context, request):
        await Account.ref(request.id).deposit(context, amount=1)
        await Account.ref(request.id).deposit(context, amount=2)
'''
            )
        )

        self.assertEqual(
            _calls(analyses, 'bank.v1.Account.twice'),
            [('bank.v1.Account', 'deposit', 'CALL')],
        )


if __name__ == '__main__':
    unittest.main()
