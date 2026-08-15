"""The dashboard works out what a method calls by reading it.

Without importing it: `rbt generate` may not have run, no servicer has
to exist, and the file may be half written. Only the source.
"""
import unittest
from rbt.dashboard.v1.dashboard_pb2 import Call, MethodCalls, Unanalyzed
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


def _unanalyzed(analyses: dict[str, MethodCalls],
                key: str) -> list[tuple[str, str]]:
    return [
        (Unanalyzed.Why.Name(entry.why), entry.expression)
        for entry in analyses[key].unanalyzed
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
        self.assertEqual(_unanalyzed(analyses, 'bank.v1.Account.balance'), [])

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

    def test_a_reference_kept_behind_a_property(self) -> None:
        """Naming a state an application uses throughout by keeping a
        reference behind a property is the ordinary way to write it, so
        a call through one is as much a call as writing the reference
        out would have been."""
        analyses = _analyze(
            servicer=_servicer(
                '''
    @property
    def index(self):
        return Bank.ref('index')

    async def record(self, context, request):
        await self.index.note(context, what=request.what)
'''
            )
        )

        self.assertEqual(
            _calls(analyses, 'bank.v1.Account.record'),
            [('bank.v1.Bank', 'note', 'CALL')],
        )

        # And the property is not itself one of the state's methods.
        self.assertNotIn('bank.v1.Account.index', analyses)

    def test_a_state_from_the_standard_library(self) -> None:
        """Its states are declared under `rbt.std.` but imported from
        the `reboot.std.` module that wraps each one."""
        analyses = _analyze(
            servicer=_servicer(
                '''
    async def record(self, context, request):
        await SortedMap.ref('index').insert(context, entries={})
'''
            ).replace(
                'from bank.v1.bank_rbt import Bank',
                'from reboot.std.collections.v1.sorted_map import SortedMap',
            )
        )

        self.assertEqual(
            _calls(analyses, 'bank.v1.Account.record'),
            [('rbt.std.collections.v1.SortedMap', 'insert', 'CALL')],
        )

    def test_a_state_class_another_file_imported_first(self) -> None:
        analyses = _analyze(
            servicer=_servicer(
                '''
    async def look(self, context, request):
        await Depot.ref(request.id).stock(context)
'''
            ).replace(
                'from bank.v1.bank_rbt import Bank',
                'from depot_servicer import Depot',
            ),
            depot_servicer='from bank.v1.depot_rbt import Depot\n',
        )

        self.assertEqual(
            _calls(analyses, 'bank.v1.Account.look'),
            [('bank.v1.Depot', 'stock', 'CALL')],
        )

    def test_a_generated_module_imported_whole(self) -> None:
        analyses = _analyze(
            servicer=_servicer(
                '''
    async def notify(self, context, request):
        await mail.Message.Send(context, request.id, recipient=request.to)
'''
            ).replace(
                'from bank.v1.bank_rbt import Bank',
                'from bank.v1 import mail_rbt as mail',
            )
        )

        self.assertEqual(
            _calls(analyses, 'bank.v1.Account.notify'),
            [('bank.v1.Message', 'Send', 'CONSTRUCT')],
        )

    def test_a_helper_in_the_same_file(self) -> None:
        analyses = _analyze(
            servicer=_servicer(
                '''
    async def move(self, context, request):
        await _transfer(context, request.amount)
''' + '''

async def _transfer(context, amount):
    await Account.ref('a').withdraw(context, amount=amount)
'''
            )
        )

        self.assertEqual(
            _calls(analyses, 'bank.v1.Account.move'),
            [('bank.v1.Account', 'withdraw', 'CALL')],
        )

    def test_a_helper_in_another_file(self) -> None:
        analyses = _analyze(
            servicer=_servicer(
                '''
    async def move(self, context, request):
        await transfer(context, request.amount)
'''
            ).replace(
                'from bank.v1.bank_rbt import Bank',
                'from helpers import transfer',
            ),
            helpers=IMPORTS + '''

async def transfer(context, amount):
    await Account.ref('a').withdraw(context, amount=amount)
''',
        )

        self.assertEqual(
            _calls(analyses, 'bank.v1.Account.move'),
            [('bank.v1.Account', 'withdraw', 'CALL')],
        )

    def test_a_helper_reached_through_its_module(self) -> None:
        analyses = _analyze(
            servicer=_servicer(
                '''
    async def move(self, context, request):
        await helpers.transfer(context, request.amount)
'''
            ).replace(
                'from bank.v1.bank_rbt import Bank',
                'import helpers',
            ),
            helpers=IMPORTS + '''

async def transfer(context, amount):
    await Account.ref('a').withdraw(context, amount=amount)
''',
        )

        self.assertEqual(
            _calls(analyses, 'bank.v1.Account.move'),
            [('bank.v1.Account', 'withdraw', 'CALL')],
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

    def test_a_helper_that_calls_itself(self) -> None:
        analyses = _analyze(
            servicer=_servicer(
                '''
    async def sweep(self, context, request):
        await _sweep(context, request.id)
''' + '''

async def _sweep(context, id):
    await Account.ref(id).withdraw(context, amount=1)
    await _sweep(context, id)
'''
            )
        )

        self.assertEqual(
            _calls(analyses, 'bank.v1.Account.sweep'),
            [('bank.v1.Account', 'withdraw', 'CALL')],
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

    ###################################################################
    # What it cannot follow.

    def test_a_context_reaching_a_function_it_cannot_read(self) -> None:
        analyses = _analyze(
            servicer=_servicer(
                '''
    async def move(self, context, request):
        await elsewhere.transfer(context, request.amount)
'''
            )
        )

        self.assertEqual(_calls(analyses, 'bank.v1.Account.move'), [])
        self.assertEqual(
            _unanalyzed(analyses, 'bank.v1.Account.move'),
            [
                (
                    'CONTEXT_PASSED_TO_UNKNOWN_FUNCTION',
                    'elsewhere.transfer(context, request.amount)',
                ),
            ],
        )

    def test_a_reference_stored_where_it_cannot_be_followed(self) -> None:
        analyses = _analyze(
            servicer=_servicer(
                '''
    async def keep(self, context, request):
        self.account = Account.ref(request.id)
'''
            )
        )

        self.assertEqual(
            _unanalyzed(analyses, 'bank.v1.Account.keep'),
            [('REFERENCE_ESCAPED', 'self.account')],
        )

    def test_a_reference_put_into_a_container(self) -> None:
        analyses = _analyze(
            servicer=_servicer(
                '''
    async def gather(self, context, request):
        accounts = [Account.ref(id) for id in request.ids]
'''
            )
        )

        self.assertEqual(
            _unanalyzed(analyses, 'bank.v1.Account.gather'),
            [('REFERENCE_ESCAPED', 'Account.ref(id)')],
        )

    def test_a_method_the_source_does_not_spell(self) -> None:
        analyses = _analyze(
            servicer=_servicer(
                '''
    async def dynamic(self, context, request):
        await getattr(Account.ref(request.id), request.method)(context)
'''
            )
        )

        self.assertEqual(
            _unanalyzed(analyses, 'bank.v1.Account.dynamic'),
            [
                (
                    'UNKNOWN_METHOD',
                    'getattr(Account.ref(request.id), request.method)',
                ),
            ],
        )

    def test_ordinary_python_is_not_reported(self) -> None:
        """Everything the analysis never claimed to follow would drown
        out the little it genuinely could not."""
        analyses = _analyze(
            servicer=_servicer(
                '''
    async def ordinary(self, context, request):
        logging.info('a balance was read')
        total = sum(entry.amount for entry in self.state.entries)
        self.state.balance = round(total, 2)
        return Account.BalanceResponse(amount=self.state.balance)
'''
            )
        )

        self.assertEqual(_calls(analyses, 'bank.v1.Account.ordinary'), [])
        self.assertEqual(_unanalyzed(analyses, 'bank.v1.Account.ordinary'), [])


if __name__ == '__main__':
    unittest.main()
