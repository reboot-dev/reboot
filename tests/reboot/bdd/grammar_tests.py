"""What `reboot.bdd.grammar.parse` makes of each built-in step's
text: which built-in step it is, and the parts the step takes."""
import unittest
from rbt.v1alpha1.bdd.grammar_pb2 import Assertion, Element
from reboot.bdd.grammar import parse


def _assertion(assertion: Assertion) -> tuple[str, str, str]:
    """An assertion as which arm it is, its path, and its value's
    JSON."""
    arm = assertion.WhichOneof('assertion')
    assert arm is not None
    clause = getattr(assertion, arm)
    value = {
        'equals': lambda: clause.value,
        'containing': lambda: clause.argument,
        'of_length': lambda: clause.length,
    }[arm]()
    return arm, clause.path, value.json


class ReadTest(unittest.TestCase):

    def test_a_call_with_assignments(self) -> None:
        syntax = parse(
            '"u" spawns a `transfer` with '
            '`from_account_id=<first_account_id>` and `amount=250.0` on '
            '`Bank` of "test-bank"'
        )
        assert syntax is not None
        self.assertEqual(syntax.WhichOneof('step'), 'does')
        does = syntax.does
        self.assertTrue(does.spawned)
        self.assertEqual(does.user, 'u')
        self.assertEqual(does.state.type, 'Bank')
        self.assertEqual(does.state.id, 'test-bank')
        self.assertEqual(does.method, 'transfer')
        self.assertEqual(
            [
                (assignment.path, assignment.value.json)
                for assignment in does.assignments
            ],
            [
                ('from_account_id', '<first_account_id>'),
                ('amount', '250.0'),
            ],
        )
        syntax = parse('the resulting task id is saved as "transfer_task_id"')
        assert syntax is not None
        self.assertEqual(
            syntax.resulting_task_id_is_saved_as.name, 'transfer_task_id'
        )

        syntax = parse('"u" creates an `Account` of "alice" via `open`')
        assert syntax is not None
        self.assertEqual(syntax.WhichOneof('step'), 'creates_via')
        self.assertEqual(syntax.creates_via.user, 'u')
        self.assertEqual(syntax.creates_via.state.id, 'alice')
        self.assertEqual(syntax.creates_via.method, 'open')
        self.assertEqual(len(syntax.creates_via.assignments), 0)

        # A factory may make the id up, which the next step saves.
        syntax = parse(
            '"u" creates an `Account` via `open` with `initial_balance=1`'
        )
        assert syntax is not None
        self.assertEqual(syntax.creates_via.state.type, 'Account')
        self.assertEqual(syntax.creates_via.state.id, '')
        syntax = parse('the resulting state id is saved as "account_id"')
        assert syntax is not None
        self.assertEqual(
            syntax.resulting_state_id_is_saved_as.name, 'account_id'
        )

        syntax = parse(
            '"u" does a `deposit` with `amount=1` on `Account` of "alice"'
        )
        assert syntax is not None
        self.assertFalse(syntax.does.spawned)

        # Either article, as English reads.
        syntax = parse('"u" does an `open_account` on `Customer` of "c"')
        assert syntax is not None
        self.assertEqual(syntax.does.method, 'open_account')
        syntax = parse('"u" attempts an `overdraw` on `Account` of "a"')
        assert syntax is not None
        self.assertEqual(syntax.attempts.method, 'overdraw')
        self.assertEqual(syntax.attempts.user, 'u')

    def test_predicates_and_saves(self) -> None:
        syntax = parse(
            'as "u", `all_customer_ids` on the `Bank` for "b" has '
            '`customer_ids` of length `2` and '
            '`customer_ids` containing `"test@reboot.dev"` and '
            '`total=3`'
        )
        assert syntax is not None
        self.assertEqual(syntax.WhichOneof('step'), 'has')
        self.assertEqual(syntax.has.method, 'all_customer_ids')
        self.assertEqual(
            [_assertion(assertion) for assertion in syntax.has.assertions],
            [
                ('of_length', 'customer_ids', '2'),
                ('containing', 'customer_ids', '"test@reboot.dev"'),
                ('equals', 'total', '3'),
            ],
        )

        syntax = parse(
            'as "u", `get` on the `Account` for "a" has `owner` saved as "o"'
        )
        assert syntax is not None
        self.assertEqual(syntax.WhichOneof('step'), 'has_saved_as')
        self.assertEqual(
            [(save.path, save.name) for save in syntax.has_saved_as.saves],
            [('owner', 'o')],
        )

    def test_a_state_id_can_be_a_variable(self) -> None:
        syntax = parse(
            'as "u", `balance` on the `Account` for "<first_account_id>" has '
            '`amount=750.0`'
        )
        assert syntax is not None
        self.assertEqual(syntax.has.state.id, '<first_account_id>')

    def test_a_task_completing_recalls_its_id(self) -> None:
        syntax = parse(
            '"u" awaits the `deposit` task "<deposit_task_id>" on `Account` '
            'within 30 seconds'
        )
        assert syntax is not None
        self.assertEqual(syntax.WhichOneof('step'), 'awaits_task')
        awaits_task = syntax.awaits_task
        self.assertEqual(awaits_task.user, 'u')
        self.assertEqual(awaits_task.method, 'deposit')
        self.assertEqual(awaits_task.task_id_saved_as, 'deposit_task_id')
        self.assertEqual(awaits_task.state_type, 'Account')
        self.assertEqual(awaits_task.seconds, 30.0)

        # A wait bound not of the grammar's form is not a syntax.
        self.assertIsNone(
            parse(
                '"u" awaits the `deposit` task "<deposit_task_id>" on '
                '`Account` within 30s'
            )
        )

    def test_eventually_has(self) -> None:
        syntax = parse(
            'as "u", `balance` on the `Account` for "alice" eventually has '
            '`amount=1` within 2.5 seconds'
        )
        assert syntax is not None
        self.assertEqual(syntax.WhichOneof('step'), 'eventually_has')
        self.assertEqual(syntax.eventually_has.seconds, 2.5)
        self.assertEqual(len(syntax.eventually_has.assertions), 1)

    def test_a_read_says_the_reader_properties(self) -> None:
        syntax = parse(
            'as "u", `has_at_least` with `amount=50` on the `Account` for '
            '"alice" has `enough=true`'
        )
        assert syntax is not None
        self.assertEqual(syntax.WhichOneof('step'), 'has')
        self.assertEqual(
            [(a.path, a.value.json) for a in syntax.has.arguments],
            [('amount', '50')],
        )
        self.assertEqual(len(syntax.has.assertions), 1)

        syntax = parse(
            'as "u", `has_at_least` with `amount=50` on the `Account` for '
            '"alice" eventually has `enough=true` within 5 seconds'
        )
        assert syntax is not None
        self.assertEqual(syntax.WhichOneof('step'), 'eventually_has')
        self.assertEqual(len(syntax.eventually_has.arguments), 1)

        syntax = parse(
            'as "u", `has_at_least` with `amount=50` on the `Account` for '
            '"alice" has `enough` saved as "covered"'
        )
        assert syntax is not None
        self.assertEqual(syntax.WhichOneof('step'), 'has_saved_as')
        self.assertEqual(len(syntax.has_saved_as.arguments), 1)

        syntax = parse(
            'as "u", `has_at_least` with `amount=50` on the `Account` for '
            '"alice" aborts with `Unauthenticated`'
        )
        assert syntax is not None
        self.assertEqual(syntax.WhichOneof('step'), 'aborts_with')
        self.assertEqual(len(syntax.aborts_with.arguments), 1)

    def test_aborts(self) -> None:
        syntax = parse('the attempt aborts with `OverdraftError`')
        assert syntax is not None
        self.assertEqual(syntax.WhichOneof('step'), 'attempt_aborts_with')
        self.assertEqual(
            syntax.attempt_aborts_with.error_type, 'OverdraftError'
        )
        self.assertEqual(len(syntax.attempt_aborts_with.assertions), 0)

        syntax = parse(
            'as "u", `withdraw` on the `Account` for "alice" aborts with '
            '`OverdraftError` with `amount=50.50`'
        )
        assert syntax is not None
        self.assertEqual(syntax.WhichOneof('step'), 'aborts_with')
        self.assertEqual(syntax.aborts_with.error_type, 'OverdraftError')
        self.assertEqual(
            [_assertion(a) for a in syntax.aborts_with.assertions],
            [('equals', 'amount', '50.50')],
        )

    def test_results(self) -> None:
        syntax = parse('the result has `amount=10.0`')
        assert syntax is not None
        self.assertEqual(syntax.WhichOneof('step'), 'result_has')

        syntax = parse(
            'the resulting `account_id` is saved as "alice_account_id"'
        )
        assert syntax is not None
        self.assertEqual(syntax.WhichOneof('step'), 'resulting_is_saved_as')
        self.assertEqual(syntax.resulting_is_saved_as.save.path, 'account_id')
        self.assertEqual(
            syntax.resulting_is_saved_as.save.name, 'alice_account_id'
        )

    def test_identity_and_application_steps(self) -> None:
        syntax = parse('the "bank" application is up')
        assert syntax is not None
        self.assertEqual(syntax.application_is_up.name, 'bank')

        syntax = parse('the application is up')
        assert syntax is not None
        self.assertEqual(syntax.WhichOneof('step'), 'application_is_up')
        self.assertFalse(syntax.application_is_up.HasField('name'))

        syntax = parse('"alice" is an authenticated user')
        assert syntax is not None
        self.assertEqual(syntax.is_an_authenticated_user.user_id, 'alice')

        syntax = parse('"admin" has the bearer token "S3CR3T!"')
        assert syntax is not None
        self.assertEqual(syntax.has_bearer_token.user_id, 'admin')
        self.assertEqual(syntax.has_bearer_token.bearer_token, 'S3CR3T!')

        syntax = parse('"bob" is an unauthenticated user')
        assert syntax is not None
        self.assertEqual(syntax.is_an_unauthenticated_user.user_id, 'bob')

        # A shared context, like every call, says who.
        self.assertIsNone(parse('a shared context'))
        syntax = parse('as "alice", a shared context')
        assert syntax is not None
        self.assertEqual(syntax.WhichOneof('step'), 'shared_context')
        self.assertEqual(syntax.shared_context.user, 'alice')

    def test_a_step_names_who_calls(self) -> None:
        """A call starts with the user it calls as and a read with
        'as "...",'; a step with neither is no step of the grammar."""
        syntax = parse(
            '"alice" does a `deposit` with `amount=1` on `Account` of "a"'
        )
        assert syntax is not None
        self.assertEqual(syntax.does.user, 'alice')
        self.assertEqual(syntax.does.state.id, 'a')

        self.assertIsNone(
            parse('does a `deposit` with `amount=1` on `Account` of "a"')
        )
        self.assertIsNone(
            parse('the `Account` for "a" gets a `deposit` with `amount=1`')
        )

        syntax = parse(
            'as "bob", `balance` on the `Account` for "a" has `balance=1`'
        )
        assert syntax is not None
        self.assertEqual(syntax.has.user, 'bob')
        self.assertIsNone(
            parse('`balance` on the `Account` for "a" has `balance=1`')
        )

        syntax = parse(
            'as "bob", `balance` on the `Account` for "a" aborts with '
            '`PermissionDenied`'
        )
        assert syntax is not None
        self.assertEqual(syntax.aborts_with.user, 'bob')

        syntax = parse('"bob" creates an `Account` of "a" via `open`')
        assert syntax is not None
        self.assertEqual(syntax.creates_via.user, 'bob')

    def test_web_app_steps(self) -> None:
        syntax = parse('"alice" opens the web app')
        assert syntax is not None
        self.assertEqual(syntax.opens_web_app.user, 'alice')
        self.assertFalse(syntax.opens_web_app.HasField('path'))

        syntax = parse('"alice" opens the web app at "/accounts"')
        assert syntax is not None
        self.assertEqual(syntax.opens_web_app.path, '/accounts')

        syntax = parse(
            '"alice" clicks the "Open Account" button in the web app'
        )
        assert syntax is not None
        self.assertEqual(syntax.clicks_in_web_app.user, 'alice')
        self.assertEqual(
            syntax.clicks_in_web_app.element.role, Element.Role.BUTTON
        )
        self.assertEqual(syntax.clicks_in_web_app.element.name, 'Open Account')
        # A role outside the closed list is no step of the grammar.
        self.assertIsNone(
            parse('"alice" clicks the "Open Account" widget in the web app')
        )

        syntax = parse(
            '"alice" fills "Initial Deposit ($)" in the web app with `1000`'
        )
        assert syntax is not None
        self.assertEqual(syntax.fills_in_web_app.label, 'Initial Deposit ($)')
        self.assertEqual(syntax.fills_in_web_app.value.json, '1000')

        syntax = parse(
            '"alice" selects "<first_account_id>" in "From Account" in the '
            'web app'
        )
        assert syntax is not None
        self.assertEqual(
            syntax.selects_in_web_app.option, '<first_account_id>'
        )
        self.assertEqual(syntax.selects_in_web_app.label, 'From Account')

        syntax = parse('"alice" unchecks "Remember me" in the web app')
        assert syntax is not None
        self.assertFalse(syntax.checks_in_web_app.checked)

        syntax = parse('"alice" presses "Enter" in the web app')
        assert syntax is not None
        self.assertEqual(syntax.presses_in_web_app.key, 'Enter')

        syntax = parse('"alice" sees "Signed in as alice" in the web app')
        assert syntax is not None
        self.assertEqual(syntax.sees_in_web_app.text, 'Signed in as alice')
        self.assertFalse(syntax.sees_in_web_app.HasField('within'))
        self.assertFalse(syntax.sees_in_web_app.negated)
        self.assertFalse(syntax.sees_in_web_app.HasField('seconds'))

        syntax = parse(
            '"alice" eventually sees "$1000" in the "Your Accounts" table in '
            'the web app within 10 seconds'
        )
        assert syntax is not None
        self.assertEqual(
            syntax.sees_in_web_app.within.role, Element.Role.TABLE
        )
        self.assertEqual(syntax.sees_in_web_app.within.name, 'Your Accounts')
        self.assertEqual(syntax.sees_in_web_app.seconds, 10)

        syntax = parse('"alice" does not see "pending" in the web app')
        assert syntax is not None
        self.assertTrue(syntax.sees_in_web_app.negated)

        syntax = parse(
            '"alice" sees the "Transfer Funds" button in the web app is '
            'disabled'
        )
        assert syntax is not None
        self.assertFalse(syntax.sees_enabled_in_web_app.enabled)
        self.assertEqual(
            syntax.sees_enabled_in_web_app.element.name, 'Transfer Funds'
        )

        syntax = parse('"alice" sees the web app at "/accounts/<account_id>"')
        assert syntax is not None
        self.assertEqual(syntax.sees_web_app_at.path, '/accounts/<account_id>')

        syntax = parse(
            '"alice" saves the text of the "account-id" element in the web '
            'app as "account_id"'
        )
        assert syntax is not None
        self.assertEqual(syntax.saves_text_in_web_app_as.test_id, 'account-id')
        self.assertEqual(syntax.saves_text_in_web_app_as.name, 'account_id')

    def test_signing_in_and_out(self) -> None:
        """A user is signed in to or out of the web app, saving the
        user id signing in gave them if the step says so."""
        syntax = parse('"alice" is signed in to the web app')
        assert syntax is not None
        self.assertEqual(syntax.WhichOneof('step'), 'is_signed_in_to_web_app')
        self.assertEqual(syntax.is_signed_in_to_web_app.user, 'alice')
        self.assertFalse(syntax.is_signed_in_to_web_app.HasField('saved_as'))

        syntax = parse(
            '"alice" is signed in to the web app with their user id saved '
            'as "alice_user_id"'
        )
        assert syntax is not None
        self.assertEqual(
            syntax.is_signed_in_to_web_app.saved_as, 'alice_user_id'
        )

        syntax = parse('"alice" is signed out of the web app')
        assert syntax is not None
        self.assertEqual(syntax.is_signed_out_of_web_app.user, 'alice')

        # Signing in is clicked through the app, so no step does it.
        self.assertIsNone(parse('"alice" signs in as "Alice"'))

    def test_a_step_the_grammar_does_not_define_is_none(self) -> None:
        self.assertIsNone(parse('the welcome email was sent'))


if __name__ == '__main__':
    unittest.main()
