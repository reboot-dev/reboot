"""What `reboot.bdd.grammar.parse` makes of each built-in step's
text: which built-in step it is, and the parts the step takes."""
import unittest
from rbt.v1alpha1.bdd.grammar_pb2 import Assertion
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
            'the `Bank` for "test-bank" gets a `transfer` with '
            '`from_account_id=${first_account_id}` and `amount=250.0` '
            'spawned with its task id saved as `transfer_task_id`'
        )
        assert syntax is not None
        self.assertEqual(syntax.WhichOneof('step'), 'gets')
        gets = syntax.gets
        self.assertEqual(gets.state.type, 'Bank')
        self.assertEqual(gets.state.id, 'test-bank')
        self.assertEqual(gets.method, 'transfer')
        self.assertEqual(
            [
                (assignment.path, assignment.value.json)
                for assignment in gets.assignments
            ],
            [
                ('from_account_id', '${first_account_id}'),
                ('amount', '250.0'),
            ],
        )
        self.assertEqual(gets.task_id_saved_as, 'transfer_task_id')

        syntax = parse('a `Account` for "alice" gets created via `open`')
        assert syntax is not None
        self.assertEqual(syntax.WhichOneof('step'), 'gets_created_via')
        self.assertEqual(len(syntax.gets_created_via.assignments), 0)

        syntax = parse(
            'the `Account` for "alice" gets a `deposit` with `amount=1`'
        )
        assert syntax is not None
        self.assertFalse(syntax.gets.HasField('task_id_saved_as'))

        # Either article, as English reads.
        syntax = parse('the `Customer` for "c" gets an `open_account`')
        assert syntax is not None
        self.assertEqual(syntax.gets.method, 'open_account')
        syntax = parse('the `Account` for "a" attempts an `overdraw`')
        assert syntax is not None
        self.assertEqual(syntax.attempts.method, 'overdraw')

    def test_predicates_and_saves(self) -> None:
        syntax = parse(
            '`all_customer_ids` on the `Bank` for "b" has '
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
            '`get` on the `Account` for "a" has `owner` saved as `o`'
        )
        assert syntax is not None
        self.assertEqual(syntax.WhichOneof('step'), 'has_saved_as')
        self.assertEqual(
            [(save.path, save.name) for save in syntax.has_saved_as.saves],
            [('owner', 'o')],
        )

    def test_a_state_id_can_be_a_variable(self) -> None:
        syntax = parse(
            '`balance` on the `Account` for "${first_account_id}" has '
            '`amount=750.0`'
        )
        assert syntax is not None
        self.assertEqual(syntax.has.state.id, '${first_account_id}')

    def test_a_task_completing_recalls_its_id(self) -> None:
        syntax = parse(
            'the `deposit` task with id "${deposit_task_id}" of the '
            '`Account` completes within 30 seconds'
        )
        assert syntax is not None
        self.assertEqual(syntax.WhichOneof('step'), 'task_completes')
        task_completes = syntax.task_completes
        self.assertEqual(task_completes.method, 'deposit')
        self.assertEqual(task_completes.task_id_saved_as, 'deposit_task_id')
        self.assertEqual(task_completes.state_type, 'Account')
        self.assertEqual(task_completes.seconds, 30.0)

        # A wait bound not of the grammar's form is not a syntax.
        self.assertIsNone(
            parse(
                'the `deposit` task with id "${deposit_task_id}" of the '
                '`Account` completes within 30s'
            )
        )

    def test_eventually_has(self) -> None:
        syntax = parse(
            '`balance` on the `Account` for "alice" eventually has '
            '`amount=1` within 2.5 seconds'
        )
        assert syntax is not None
        self.assertEqual(syntax.WhichOneof('step'), 'eventually_has')
        self.assertEqual(syntax.eventually_has.seconds, 2.5)
        self.assertEqual(len(syntax.eventually_has.assertions), 1)

    def test_aborts(self) -> None:
        syntax = parse('the attempt aborts with `OverdraftError`')
        assert syntax is not None
        self.assertEqual(syntax.WhichOneof('step'), 'attempt_aborts_with')
        self.assertEqual(
            syntax.attempt_aborts_with.error_type, 'OverdraftError'
        )
        self.assertEqual(len(syntax.attempt_aborts_with.assertions), 0)

        syntax = parse(
            '`withdraw` on the `Account` for "alice" aborts with '
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
            'the resulting `account_id` is saved as `alice_account_id`'
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

        syntax = parse('the authenticated user is "alice"')
        assert syntax is not None
        self.assertEqual(syntax.authenticated_user_is.user_id, 'alice')

        syntax = parse('the user is unauthenticated')
        assert syntax is not None
        self.assertEqual(syntax.WhichOneof('step'), 'user_is_unauthenticated')

        syntax = parse('the bearer token is "S3CR3T!"')
        assert syntax is not None
        self.assertEqual(syntax.bearer_token_is.bearer_token, 'S3CR3T!')

    def test_a_step_the_grammar_does_not_define_is_none(self) -> None:
        self.assertIsNone(parse('the welcome email was sent'))


if __name__ == '__main__':
    unittest.main()
