import multiprocessing
import unittest
from google.protobuf.descriptor_pb2 import DescriptorProto, FileDescriptorSet
from multiprocessing import forkserver
from reboot.server.service_descriptor_validator import (
    ProtoValidationError,
    SchemaType,
    _compare_reserved_field_numbers,
    dict_diff,
    validate_descriptor_sets_are_backwards_compatible,
)
from tests.reboot import test_helpers
from tests.reboot.test_helpers import combine_descriptor_sets


def get_descriptor_set(name: str) -> FileDescriptorSet:
    """Fetch the descriptor set for the compiled pb2 with the given name.

    Wrapper around test_helpers.get_descriptor_set to add shared
    namespacing."""
    return test_helpers.get_descriptor_set(
        f'tests.reboot.server.service_descriptor_validator_proto.{name}'
    )


class ServiceDescriptorValidatorProtoTestCase(unittest.TestCase):
    """Run several different combinations of original ServiceDescriptor,
    updated ServiceDescriptor, and method filter set through our
    ServiceDescriptor change validation to test that the correct errors are
    raised."""

    original: FileDescriptorSet
    replay_deleted: FileDescriptorSet
    empty_input_type: FileDescriptorSet
    empty_reserved_input_type: FileDescriptorSet
    hello_added: FileDescriptorSet
    nested_repeated_string_input_type: FileDescriptorSet
    nested_single_string_input_type: FileDescriptorSet
    output_type_changed: FileDescriptorSet
    replay_option_changed: FileDescriptorSet
    replay_type_changed: FileDescriptorSet
    two_fields_input_type: FileDescriptorSet
    enum_two_options_input_type: FileDescriptorSet
    enum_three_options_input_type: FileDescriptorSet
    state_message_name_changed: FileDescriptorSet
    state_message_changed: FileDescriptorSet
    state_message_new_field: FileDescriptorSet
    recursion_in_state: FileDescriptorSet
    legacy_service_name: FileDescriptorSet
    echo_with_message: FileDescriptorSet
    echo_with_message_id: FileDescriptorSet
    reply_transaction: FileDescriptorSet
    reply_writer_constructor: FileDescriptorSet
    reply_transaction_constructor: FileDescriptorSet
    errors_added: FileDescriptorSet
    mcp_added: FileDescriptorSet
    mcp_changed: FileDescriptorSet
    original_other_package: FileDescriptorSet
    replay_deleted_other_package: FileDescriptorSet

    @classmethod
    def setUpClass(cls) -> None:
        # Extract several FileDescriptorSets for the validation function to
        # compare.
        cls.original = get_descriptor_set('echo_original_pb2')
        cls.replay_deleted = get_descriptor_set('echo_replay_deleted_pb2')
        cls.empty_input_type = get_descriptor_set('echo_empty_input_type_pb2')
        cls.empty_reserved_input_type = get_descriptor_set(
            'echo_empty_reserved_input_type_pb2'
        )
        cls.hello_added = get_descriptor_set('echo_hello_added_pb2')
        cls.nested_repeated_string_input_type = get_descriptor_set(
            'echo_nested_repeated_string_input_type_pb2'
        )
        cls.nested_single_string_input_type = get_descriptor_set(
            'echo_nested_single_string_input_type_pb2'
        )
        cls.output_type_changed = get_descriptor_set(
            'echo_output_type_changed_pb2'
        )
        cls.replay_option_changed = get_descriptor_set(
            'echo_replay_option_changed_pb2'
        )
        cls.replay_type_changed = get_descriptor_set(
            'echo_replay_type_changed_pb2'
        )
        cls.two_fields_input_type = get_descriptor_set(
            'echo_two_fields_input_type_pb2'
        )
        cls.enum_two_options_input_type = get_descriptor_set(
            'echo_enum_two_options_input_type_pb2'
        )
        cls.enum_three_options_input_type = get_descriptor_set(
            'echo_enum_three_options_input_type_pb2'
        )
        cls.state_message_name_changed = get_descriptor_set(
            'echo_state_message_name_changed_pb2'
        )
        cls.state_message_changed = get_descriptor_set(
            'echo_state_message_changed_pb2'
        )
        cls.state_message_new_field = get_descriptor_set(
            'echo_state_message_new_field_pb2'
        )
        cls.recursion_in_state = get_descriptor_set('echo_recursion_pb2')
        cls.legacy_service_name = get_descriptor_set(
            'echo_legacy_service_name_pb2'
        )
        cls.echo_with_message = get_descriptor_set('echo_with_message_pb2')
        cls.echo_with_message_id = get_descriptor_set(
            'echo_with_message_id_pb2'
        )
        cls.reply_transaction = get_descriptor_set(
            'echo_reply_transaction_pb2'
        )
        cls.reply_writer_constructor = get_descriptor_set(
            'echo_reply_writer_constructor_pb2'
        )
        cls.reply_transaction_constructor = get_descriptor_set(
            'echo_reply_transaction_constructor_pb2'
        )
        cls.errors_added = get_descriptor_set('echo_errors_added_pb2')
        cls.mcp_added = get_descriptor_set('echo_mcp_added_pb2')
        cls.mcp_changed = get_descriptor_set('echo_mcp_changed_pb2')
        cls.original_other_package = get_descriptor_set(
            'echo_original_other_package_pb2'
        )
        cls.replay_deleted_other_package = get_descriptor_set(
            'echo_replay_deleted_other_package_pb2'
        )

    def test_no_change(self):
        """Test that an unchanged ServiceDescriptor has no errors."""
        # If there are errors, this function will raise.
        validate_descriptor_sets_are_backwards_compatible(
            self.original, self.original
        )

    def test_removed_method(self):
        """Test that removing a method produces an error."""
        with self.assertRaises(ProtoValidationError) as e:
            validate_descriptor_sets_are_backwards_compatible(
                self.original,
                self.replay_deleted,
            )

        # Pull out the nested errors for further inspection.
        self.assertIsNotNone(e.exception.validation_errors)
        assert e.exception.validation_errors is not None  # for mypy
        errors = e.exception.validation_errors
        self.assertEqual(len(errors), 1)
        self.assertEqual(
            'Method `tests.reboot.server.service_descriptor_validator_'
            'proto.EchoMethods.Replay` was deleted',
            errors[0],
        )

    def test_added_method(self):
        """Test that adding a new method has no errors."""
        # If there are errors, this function will raise.
        validate_descriptor_sets_are_backwards_compatible(
            self.replay_deleted,
            self.original,
        )

    def test_changed_method_type(self):
        """Test that changing the Reboot type of a method produces an
        error."""
        with self.assertRaises(ProtoValidationError) as e:
            validate_descriptor_sets_are_backwards_compatible(
                self.original,
                self.replay_type_changed,
            )

        # Pull out the nested errors for further inspection.
        self.assertIsNotNone(e.exception.validation_errors)
        assert e.exception.validation_errors is not None  # for mypy
        errors = e.exception.validation_errors
        self.assertEqual(len(errors), 1)
        self.assertEqual(
            'Reboot options for method `tests.reboot.server.service_'
            'descriptor_validator_proto.EchoMethods'
            '.Replay` updated from...\n'
            '```\n'
            'reader {\n'
            '}\n'
            '```\n'
            'to...\n'
            '```\n'
            'writer {\n'
            '}\n'
            '```',
            errors[0],
        )

    def test_changed_method_option(self):
        """Test that changing the Reboot options of a method produces an
        error."""
        with self.assertRaises(ProtoValidationError) as e:
            validate_descriptor_sets_are_backwards_compatible(
                self.original,
                self.replay_option_changed,
            )

        # Pull out the nested errors for further inspection.
        self.assertIsNotNone(e.exception.validation_errors)
        assert e.exception.validation_errors is not None  # for mypy
        errors = e.exception.validation_errors
        self.assertEqual(len(errors), 1)
        self.assertEqual(
            'Reboot options for method `tests.reboot.server.service_'
            'descriptor_validator_proto.EchoMethods'
            '.Replay` updated from...\n'
            '```\n'
            'reader {\n'
            '}\n'
            '```\n'
            'to...\n'
            '```\n'
            'reader {\n'
            '  state: STREAMING\n'
            '}\n'
            '```',
            errors[0],
        )

    def test_changed_method_input_type_field_deleted(self):
        """Test that changing the input type of a method by deleting a field
        produces an error if the field number and name were not reserved."""
        with self.assertRaises(ProtoValidationError) as e:
            validate_descriptor_sets_are_backwards_compatible(
                self.original,
                self.empty_input_type,
            )

        # Pull out the nested errors for further inspection.
        self.assertIsNotNone(e.exception.validation_errors)
        assert e.exception.validation_errors is not None  # for mypy
        errors = e.exception.validation_errors
        self.assertEqual(len(errors), 2)
        self.assertIn(
            'Field `string_field` was deleted from message `SingleStringField` '
            '(changed to `EmptyMessage` in `tests.reboot.server.'
            'service_descriptor_validator_proto.EchoMethods.Reply`), '
            'and its field number was not reserved.',
            errors[0],
        )
        self.assertIn(
            'Field `string_field` was deleted from message `SingleStringField` '
            '(changed to `EmptyMessage` in `tests.reboot.server.'
            'service_descriptor_validator_proto.EchoMethods.Reply`), '
            'and its field name was not reserved.',
            errors[1],
        )

    def test_changed_method_input_type_field_deleted_reserved(self):
        """Test that changing the input type of a method by deleting a field
        and reserving its field number and name produces no errors (this is a
        backwards compatible change)."""
        validate_descriptor_sets_are_backwards_compatible(
            self.original,
            self.empty_reserved_input_type,
        )

    def test_changed_method_input_type_field_deleted_partially_reserved(self):
        """Test that changing the input type of a method by deleting a field
        and reserving its field number and name produces no errors (this is a
        backwards compatible change)."""
        with self.assertRaises(ProtoValidationError) as e:
            validate_descriptor_sets_are_backwards_compatible(
                self.two_fields_input_type,
                self.empty_reserved_input_type,
            )

        # Pull out the nested errors for further inspection.
        self.assertIsNotNone(e.exception.validation_errors)
        assert e.exception.validation_errors is not None  # for mypy
        errors = e.exception.validation_errors
        self.assertEqual(len(errors), 2, errors)
        self.assertIn(
            'Field `new_first_field` was deleted from message `TwoFields` '
            '(changed to `EmptyMessageWithReserved` in `tests.reboot.'
            'server.service_descriptor_validator_proto.EchoMethods'
            '.Reply`), and its field name was not reserved.',
            errors[0],
        )
        self.assertIn(
            'Field `string_field` was deleted from message `TwoFields` '
            '(changed to `EmptyMessageWithReserved` in `tests.reboot.'
            'server.service_descriptor_validator_proto.EchoMethods'
            '.Reply`), and its field number was not reserved.',
            errors[1],
        )

    def test_changed_method_input_type_reserved_deleted(self):
        """Test that changing the input type of a method by removing a
        `reserved` field number or field name is not permitted."""
        with self.assertRaises(ProtoValidationError) as e:
            validate_descriptor_sets_are_backwards_compatible(
                self.empty_reserved_input_type,
                self.empty_input_type,
            )

        # Pull out the nested errors for further inspection.
        self.assertIsNotNone(e.exception.validation_errors)
        assert e.exception.validation_errors is not None  # for mypy
        errors = e.exception.validation_errors
        self.assertEqual(len(errors), 2)
        self.assertIn(
            'Field numbers 1 to 1 are no longer `reserved` in message '
            '`EmptyMessageWithReserved` (changed to `EmptyMessage` '
            'in `tests.reboot.server.'
            'service_descriptor_validator_proto.EchoMethods.Reply`).',
            errors[0],
        )
        self.assertIn(
            'Field name `string_field` is no longer `reserved` in '
            'message `EmptyMessageWithReserved` (changed to '
            '`EmptyMessage` in `tests.reboot.server.'
            'service_descriptor_validator_proto.EchoMethods.Reply`).',
            errors[1],
        )

    def test_changed_method_input_type_field_added(self):
        """Test that changing the input type of a method by adding a field
        produces no error."""
        validate_descriptor_sets_are_backwards_compatible(
            self.empty_input_type,
            self.original,
        )

    def test_changed_method_input_type_string_to_message(self):
        """Test that changing the input type of a method by changing a field
        type produces an error."""
        with self.assertRaises(ProtoValidationError) as e:
            validate_descriptor_sets_are_backwards_compatible(
                self.original,
                self.nested_single_string_input_type,
            )

        # Pull out the nested errors for further inspection.
        self.assertIsNotNone(e.exception.validation_errors)
        assert e.exception.validation_errors is not None  # for mypy
        errors = e.exception.validation_errors
        self.assertEqual(len(errors), 1)
        self.assertEqual(
            'Field `string_field` in message `NestedSingleStringField` '
            'has switched type '
            '(relative to original message `SingleStringField`) '
            'from `string` to `message`',
            errors[0],
        )

    def test_changed_method_input_type_nested_field_message(self):
        """Test that changing a nested message structure for a field on the
        input type of a method produces an error."""
        with self.assertRaises(ProtoValidationError) as e:
            validate_descriptor_sets_are_backwards_compatible(
                self.nested_repeated_string_input_type,
                self.nested_single_string_input_type,
            )

        # Pull out the nested errors for further inspection.
        self.assertIsNotNone(e.exception.validation_errors)
        assert e.exception.validation_errors is not None  # for mypy
        errors = e.exception.validation_errors
        self.assertEqual(len(errors), 1)
        self.assertEqual(
            'Field `string_field` in message `SingleStringField` '
            'has switched label '
            '(relative to original message `RepeatedStringField`) '
            'from `repeated` to `singular`', errors[0]
        )

    def test_changed_method_output_type_single_to_repeated_field(self):
        """Test that changing the output type of a method, and switching a
        field from single to repeated, produces an error."""
        with self.assertRaises(ProtoValidationError) as e:
            validate_descriptor_sets_are_backwards_compatible(
                self.original,
                self.output_type_changed,
            )

        # Pull out the nested errors for further inspection.
        self.assertIsNotNone(e.exception.validation_errors)
        assert e.exception.validation_errors is not None  # for mypy
        errors = e.exception.validation_errors
        self.assertEqual(len(errors), 1)
        self.assertEqual(
            'Field `string_field` in message `RepeatedStringField` '
            'has switched label '
            '(relative to original message `SingleStringField`) '
            'from `singular` to `repeated`',
            errors[0],
        )

    def test_enum_option_added(self):
        """Test that changing the input type of a method by adding an enum
        field does not produce an error."""
        validate_descriptor_sets_are_backwards_compatible(
            self.enum_two_options_input_type,
            self.enum_three_options_input_type,
        )

    def test_enum_field_deleted(self):
        """Test that changing the input type of a method by deleting an enum
        field does not produce an error."""
        validate_descriptor_sets_are_backwards_compatible(
            self.enum_three_options_input_type,
            self.enum_two_options_input_type,
        )

    def test_multiple_changes(self):
        with self.assertRaises(ProtoValidationError) as e:
            validate_descriptor_sets_are_backwards_compatible(
                self.hello_added,
                self.replay_option_changed,
            )

        # Pull out the nested errors for further inspection.
        self.assertIsNotNone(e.exception.validation_errors)
        assert e.exception.validation_errors is not None  # for mypy
        errors = e.exception.validation_errors
        # The Hello RPC has been deleted and the Replay RPC has been changed.
        self.assertEqual(len(errors), 2)
        self.assertEqual(
            'Reboot options for method `tests.reboot.server.service_'
            'descriptor_validator_proto.EchoMethods.'
            'Replay` updated from...\n'
            '```\n'
            'reader {\n'
            '}\n'
            '```\n'
            'to...\n'
            '```\n'
            'reader {\n'
            '  state: STREAMING\n'
            '}\n'
            '```',
            errors[0],
        )
        self.assertEqual(
            'Method `tests.reboot.server.service_descriptor_validator_'
            'proto.EchoMethods.'
            'Hello` was deleted',
            errors[1],
        )

    def test_state_message_name_changed(self):
        """Test that we rename or moving a state message fails."""
        with self.assertRaises(ProtoValidationError) as e:
            validate_descriptor_sets_are_backwards_compatible(
                self.original,
                self.state_message_name_changed,
            )

        assert e.exception.validation_errors is not None
        errors = e.exception.validation_errors
        # The state message was renamed.
        self.assertEqual(len(errors), 1)
        self.assertEqual(
            'State `tests.reboot.server.service_descriptor_validator'
            '_proto.Echo` was deleted',
            errors[0],
        )

    def test_state_message_new_field(self):
        """Test that we can make valid change to state message."""
        validate_descriptor_sets_are_backwards_compatible(
            self.original,
            self.state_message_new_field,
        )

    def test_state_message_changed(self):
        """Test that we catch invalid changes to state message."""
        with self.assertRaises(ProtoValidationError) as e:
            validate_descriptor_sets_are_backwards_compatible(
                self.original,
                self.state_message_changed,
            )

        # Pull out the nested errors for further inspection.
        assert e.exception.validation_errors is not None
        errors = e.exception.validation_errors

        # We have renamed field 1 and changed the type, that's two violations
        # of backwards compatibility.
        self.assertEqual(len(errors), 2)
        self.assertEqual(
            'Field `dummy` in message `Echo` has switched type '
            'from `string` to `bool`',
            errors[0],
        )
        self.assertEqual(
            'Field `dummy` in message `Echo` has switched label '
            'from `repeated` to `singular`',
            errors[1],
        )

    def test_compare_reserved_field_numbers(self):

        def range(
            start: int, end_inclusive: int
        ) -> DescriptorProto.ReservedRange:
            # NOTE: when we write a range in a proto, e.g. "1 to 10", the
            # end of the range is _inclusive_. However, the
            # `ReservedRange.end` is _exclusive_ (!!). We do that conversion
            # here.
            return DescriptorProto.ReservedRange(
                start=start, end=end_inclusive + 1
            )

        def test(
            before: list[DescriptorProto.ReservedRange],
            after: list[DescriptorProto.ReservedRange],
            expected_errors: list[str]
        ):
            errors = _compare_reserved_field_numbers(
                before,
                after,
                'TestMessage',
                '(in test)',
                SchemaType.PROTO,
            )
            self.assertEqual(len(expected_errors), len(errors), errors)
            for expected_error, error in zip(expected_errors, errors):
                self.assertIn(expected_error, error)

        # No changes.
        test(before=[range(1, 1)], after=[range(1, 1)], expected_errors=[])
        test(before=[range(1, 10)], after=[range(1, 10)], expected_errors=[])

        # Legal changes.
        test(before=[range(1, 1)], after=[range(1, 10)], expected_errors=[])
        test(
            before=[range(1, 10)],
            after=[range(1, 10), range(20, 30)],  # Additional range.
            expected_errors=[],
        )
        test(
            before=[range(1, 10)],
            after=[range(1, 5), range(6, 10)],  # Range was split.
            expected_errors=[],
        )
        test(
            before=[range(5, 10)],
            after=[range(3, 7), range(8, 13)],  # Range was split and extended.
            expected_errors=[],
        )
        test(
            before=[range(5, 10), range(10, 15)],  # Adjacent ranges.
            after=[range(5, 15)],  # Ranges were merged.
            expected_errors=[],
        )
        test(
            before=[range(5, 10), range(15, 20)],  # Non-adjacent ranges.
            after=[range(5, 20)],  # Ranges were merged.
            expected_errors=[],
        )
        test(
            before=[range(5, 10), range(15, 20)],  # Non-adjacent ranges.
            after=[range(5, 17), range(17, 25)],  # Expanded ranges.
            expected_errors=[],
        )

        # Illegal changes, single range.
        test(
            before=[range(1, 1)],
            after=[],
            expected_errors=["Field numbers 1 to 1 are no longer `reserved`"],
        )
        test(
            before=[range(1, 10)],
            after=[],
            expected_errors=["Field numbers 1 to 10 are no longer `reserved`"],
        )
        test(
            before=[range(1, 10)],
            after=[range(1, 9)],  # Range shrunk on one end, by one.
            expected_errors=[
                "Field numbers 10 to 10 are no longer `reserved`"
            ],
        )
        test(
            before=[range(1, 10)],
            after=[range(1, 5)],  # Range shrunk on one end, by more.
            expected_errors=["Field numbers 6 to 10 are no longer `reserved`"],
        )
        test(
            before=[range(1, 10)],
            after=[range(5, 10)],  # Range shrunk on other end.
            expected_errors=["Field numbers 1 to 4 are no longer `reserved`"],
        )
        test(
            before=[range(1, 10)],
            after=[range(3, 7)],  # Range shrunk on both ends.
            expected_errors=[
                "Field numbers 1 to 2 are no longer `reserved`",
                "Field numbers 8 to 10 are no longer `reserved`",
            ],
        )
        test(
            before=[range(1, 10)],
            after=[range(1, 4), range(6, 10)],  # Range split, missing middle.
            expected_errors=[
                "Field numbers 5 to 5 are no longer `reserved`",
            ],
        )

        # Illegal changes, multiple ranges.
        test(
            before=[range(1, 10), range(15, 20)],
            after=[range(3, 7), range(15, 20)],  # Only one range changed.
            expected_errors=[
                "Field numbers 1 to 2 are no longer `reserved`",
                "Field numbers 8 to 10 are no longer `reserved`",
            ],
        )
        test(
            before=[range(1, 10), range(15, 20)],
            after=[range(1, 10), range(14, 17)],  # Other range changed.
            expected_errors=[
                "Field numbers 18 to 20 are no longer `reserved`",
            ],
        )
        test(
            before=[range(1, 10), range(15, 20)],
            after=[range(3, 7), range(14, 17)],  # Both ranges changed.
            expected_errors=[
                "Field numbers 1 to 2 are no longer `reserved`",
                "Field numbers 8 to 10 are no longer `reserved`",
                "Field numbers 18 to 20 are no longer `reserved`",
            ],
        )

    def test_dict_diff(self):
        """Tests that dict_diff generates useful diffs for nested
        collections."""

        def assert_dict_diff(left, right, expected) -> None:
            self.assertEqual(dict_diff(left, right), expected)

        assert_dict_diff({}, {}, [])
        assert_dict_diff(1, 2, [("", 1, 2)])
        assert_dict_diff({"key": 1}, {"key": 1}, [])
        assert_dict_diff({"key": 1}, {"key": 2}, [("key", 1, 2)])
        assert_dict_diff(
            {"parent": {
                "child": 1
            }}, {"parent": {
                "child": 2
            }}, [("parent.child", 1, 2)]
        )

    def test_no_infinite_loop_in_recursion(self):
        validate_descriptor_sets_are_backwards_compatible(
            self.recursion_in_state,
            self.recursion_in_state,
        )

    def test_legacy_service_name(self):
        # For a time period, we permit a rename of `[...]Interface` to
        # `[...]Methods` without backwards compatibility errors.
        validate_descriptor_sets_are_backwards_compatible(
            self.legacy_service_name,
            self.original,
        )

    def test_message_field(self):
        with self.assertRaises(ProtoValidationError) as e:
            validate_descriptor_sets_are_backwards_compatible(
                self.echo_with_message,
                self.echo_with_message_id,
            )

        self.assertIsNotNone(e.exception.validation_errors)
        assert e.exception.validation_errors is not None  # for mypy
        errors = e.exception.validation_errors
        self.assertEqual(len(errors), 2)
        self.assertEqual(
            'Field `message_id` in message `Message` '
            'has switched type '
            'from `string` to `int64`',
            errors[0],
        )
        self.assertEqual(
            'Field `message` in message `Message` '
            'has switched type '
            'from `message` to `string`',
            errors[1],
        )

    def test_legal_method_type_change(self):
        # Conversion from `Writer` to `Transaction`.
        validate_descriptor_sets_are_backwards_compatible(
            self.original,
            self.reply_transaction,
        )

        # Conversion from `Transaction` to `Writer`.
        validate_descriptor_sets_are_backwards_compatible(
            self.reply_transaction,
            self.original,
        )

    def test_legal_method_type_change_with_constructor(self):
        """Test that writer<->transaction is legal when both have the
        same sub-options (e.g., `constructor`)."""
        # `Writer` with constructor -> `Transaction` with constructor.
        validate_descriptor_sets_are_backwards_compatible(
            self.reply_writer_constructor,
            self.reply_transaction_constructor,
        )

        # `Transaction` with constructor -> `Writer` with constructor.
        validate_descriptor_sets_are_backwards_compatible(
            self.reply_transaction_constructor,
            self.reply_writer_constructor,
        )

    def test_illegal_method_type_change_with_mismatched_options(self):
        """Test that writer<->transaction is illegal when sub-options
        differ (e.g., one has `constructor` and the other doesn't)."""
        # `Writer` no constructor -> `Transaction` with constructor.
        with self.assertRaises(ProtoValidationError):
            validate_descriptor_sets_are_backwards_compatible(
                self.original,
                self.reply_transaction_constructor,
            )

        # `Writer` with constructor -> `Transaction` no constructor.
        with self.assertRaises(ProtoValidationError):
            validate_descriptor_sets_are_backwards_compatible(
                self.reply_writer_constructor,
                self.reply_transaction,
            )

    def test_errors_added(self):
        """Test that adding declared errors to a method is allowed."""
        validate_descriptor_sets_are_backwards_compatible(
            self.original,
            self.errors_added,
        )

    def test_errors_removed(self):
        """Test that removing declared errors from a method is allowed."""
        validate_descriptor_sets_are_backwards_compatible(
            self.errors_added,
            self.original,
        )

    def test_mcp_added(self):
        """Test that adding MCP options to a method is allowed."""
        validate_descriptor_sets_are_backwards_compatible(
            self.original,
            self.mcp_added,
        )

    def test_mcp_removed(self):
        """Test that removing MCP options from a method is allowed."""
        validate_descriptor_sets_are_backwards_compatible(
            self.mcp_added,
            self.original,
        )

    def test_mcp_changed(self):
        """Test that changing MCP options on a method is allowed."""
        validate_descriptor_sets_are_backwards_compatible(
            self.mcp_added,
            self.mcp_changed,
        )

    def test_same_state_name_different_packages(self):
        """Test that a backwards-incompatible change in one package is
        not masked by another package's state sharing the same simple
        message name.

        `echo_original_pb2` (package `...proto`) and
        `echo_original_other_package_pb2` (package `...proto_other`) both
        define a state called `Echo`. When both are present in a
        combined `FileDescriptorSet`, the validator must key states by
        their fully-qualified names.
        """

        # Both packages have `Echo` with `Reply` and `Replay`.
        original = combine_descriptor_sets(
            self.original, self.original_other_package
        )
        # Remove `Replay` from the first package.
        updated = combine_descriptor_sets(
            self.replay_deleted, self.original_other_package
        )

        with self.assertRaises(ProtoValidationError) as context:
            validate_descriptor_sets_are_backwards_compatible(
                original, updated
            )

        errors = context.exception.validation_errors
        assert errors is not None
        # The first package's `Replay` method was deleted.
        self.assertEqual(len(errors), 1)
        self.assertIn(
            'Method `tests.reboot.server.service_descriptor_validator_'
            'proto.EchoMethods.Replay` was deleted',
            errors[0],
        )

    def test_same_name_no_errors_when_added(self):
        """Test that no errors are reported when two packages share a
        state name but technically are not backwards compatible.
        """

        # The first package has `Echo` with `Reply` and `Replay`, the
        # second package has `Echo` with only `Reply`.
        updated = combine_descriptor_sets(
            self.original, self.replay_deleted_other_package
        )

        validate_descriptor_sets_are_backwards_compatible(
            self.original, updated
        )


if __name__ == '__main__':
    # `get_descriptor_set` might import multiple pb2 modules that define
    # variants of the same proto service (`echo_original_pb2` and
    # `echo_replay_deleted_pb2`). Python's protobuf adds all pb2
    # imports to a single global descriptor pool, so importing both
    # in the same process would cause descriptor conflicts. We use
    # `multiprocessing` (via `get_descriptor_set()`) to import each
    # pb2 in an isolated subprocess.
    #
    # The `forkserver` start method must be initialized early,
    # before any other threads are started, to avoid issues with
    # forking after threads have started.
    # See https://bugs.python.org/issue43285.
    multiprocessing.set_start_method('forkserver')
    forkserver.ensure_running()
    unittest.main()
