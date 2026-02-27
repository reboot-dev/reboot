import multiprocessing
import unittest
from google.protobuf.descriptor_pb2 import FileDescriptorSet
from multiprocessing import forkserver
from reboot.server.service_descriptor_validator import (
    ProtoValidationError,
    validate_descriptor_sets_are_backwards_compatible,
)
from tests.reboot import test_helpers


def get_descriptor_set(name: str) -> FileDescriptorSet:
    """Fetch the descriptor set for the compiled pb2 with the given name.

    Wrapper around test_helpers.get_descriptor_set to add shared
    namespacing."""
    return test_helpers.get_descriptor_set(
        f'tests.reboot.server.service_descriptor_validator_pydantic.{name}'
    )


class ServiceDescriptorValidatorPydanticTestCase(unittest.TestCase):
    """Test that backwards-incompatible changes to Pydantic-defined schemas
    produce user-friendly error messages using Reboot terminology."""

    original: FileDescriptorSet
    field_deleted: FileDescriptorSet
    field_type_changed: FileDescriptorSet
    method_deleted: FileDescriptorSet
    method_type_changed: FileDescriptorSet
    state_renamed: FileDescriptorSet
    request_original: FileDescriptorSet
    request_field_deleted: FileDescriptorSet
    request_field_type_changed: FileDescriptorSet

    @classmethod
    def setUpClass(cls) -> None:
        cls.original = get_descriptor_set('pydantic_original_api_pb2')
        cls.field_deleted = get_descriptor_set(
            'pydantic_field_deleted_api_pb2'
        )
        cls.field_type_changed = get_descriptor_set(
            'pydantic_field_type_changed_api_pb2'
        )
        cls.method_deleted = get_descriptor_set(
            'pydantic_method_deleted_api_pb2'
        )
        cls.method_type_changed = get_descriptor_set(
            'pydantic_method_type_changed_api_pb2'
        )
        cls.state_renamed = get_descriptor_set(
            'pydantic_state_renamed_api_pb2'
        )
        cls.request_original = get_descriptor_set(
            'pydantic_request_original_api_pb2'
        )
        cls.request_field_deleted = get_descriptor_set(
            'pydantic_request_field_deleted_api_pb2'
        )
        cls.request_field_type_changed = get_descriptor_set(
            'pydantic_request_field_type_changed_api_pb2'
        )

    def test_pydantic_state_deleted(self):
        """Pydantic schema deletion uses 'servicer type' terminology."""
        with self.assertRaises(ProtoValidationError) as e:
            validate_descriptor_sets_are_backwards_compatible(
                self.original,
                self.state_renamed,
            )

        self.assertIsNotNone(e.exception.validation_errors)
        assert e.exception.validation_errors is not None  # for mypy
        errors = e.exception.validation_errors
        self.assertEqual(len(errors), 1)
        self.assertEqual(
            'servicer type `tests.reboot.server'
            '.service_descriptor_validator_pydantic'
            '.pydantic_original_api.EchoPydantic` '
            'was deleted',
            errors[0],
        )

    def test_pydantic_method_deleted(self):
        """Pydantic method deletion shows snake_case method name and
        'servicer type' terminology."""
        with self.assertRaises(ProtoValidationError) as e:
            validate_descriptor_sets_are_backwards_compatible(
                self.original,
                self.method_deleted,
            )

        self.assertIsNotNone(e.exception.validation_errors)
        assert e.exception.validation_errors is not None  # for mypy
        errors = e.exception.validation_errors
        self.assertEqual(len(errors), 1)
        self.assertEqual(
            'Method `do_something` was deleted from servicer type '
            '`tests.reboot.server'
            '.service_descriptor_validator_pydantic'
            '.pydantic_original_api.EchoPydantic`',
            errors[0],
        )

    def test_pydantic_method_type_changed(self):
        """Pydantic method type change uses 'servicer type' terminology
        and shows snake_case method name."""
        with self.assertRaises(ProtoValidationError) as e:
            validate_descriptor_sets_are_backwards_compatible(
                self.original,
                self.method_type_changed,
            )

        self.assertIsNotNone(e.exception.validation_errors)
        assert e.exception.validation_errors is not None  # for mypy
        errors = e.exception.validation_errors
        self.assertEqual(len(errors), 1)
        self.assertEqual(
            'Reboot options for method `do_something` of servicer type '
            '`tests.reboot.server.service_descriptor_validator_pydantic'
            '.pydantic_original_api.EchoPydantic` updated from...\n'
            '```\n'
            'writer {\n'
            '}\n'
            '```\n'
            'to...\n'
            '```\n'
            'reader {\n'
            '}\n'
            '```',
            errors[0],
        )

    def test_pydantic_field_deleted(self):
        """Pydantic state field deletion shows a single actionable error
        using 'the state of servicer type' terminology."""
        with self.assertRaises(ProtoValidationError) as e:
            validate_descriptor_sets_are_backwards_compatible(
                self.original,
                self.field_deleted,
            )

        self.assertIsNotNone(e.exception.validation_errors)
        assert e.exception.validation_errors is not None  # for mypy
        errors = e.exception.validation_errors
        self.assertEqual(len(errors), 1)
        self.assertEqual(
            'Field `my_field` was removed from the state of servicer type '
            '`tests.reboot.server'
            '.service_descriptor_validator_pydantic'
            '.pydantic_original_api.EchoPydantic`. '
            'Removing fields is a backwards-incompatible change. '
            'To continue, restore the field or use `expunge` to '
            'clear all existing state data.',
            errors[0],
        )

    def test_pydantic_field_type_changed(self):
        """Pydantic state field type change uses 'the state of servicer type'
        terminology and shows the snake_case field name."""
        with self.assertRaises(ProtoValidationError) as e:
            validate_descriptor_sets_are_backwards_compatible(
                self.original,
                self.field_type_changed,
            )

        self.assertIsNotNone(e.exception.validation_errors)
        assert e.exception.validation_errors is not None  # for mypy
        errors = e.exception.validation_errors
        self.assertEqual(len(errors), 1)
        self.assertEqual(
            'Field `my_field` in the state of servicer type '
            '`tests.reboot.server'
            '.service_descriptor_validator_pydantic'
            '.pydantic_field_type_changed_api.EchoPydantic` '
            'has switched type from `double` to `string`',
            errors[0],
        )

    def test_pydantic_request_field_deleted(self):
        """Pydantic request field deletion uses 'Pydantic model' terminology
        (not 'the state of servicer type') since the request is not the state."""
        with self.assertRaises(ProtoValidationError) as e:
            validate_descriptor_sets_are_backwards_compatible(
                self.request_original,
                self.request_field_deleted,
            )

        self.assertIsNotNone(e.exception.validation_errors)
        assert e.exception.validation_errors is not None  # for mypy
        errors = e.exception.validation_errors
        self.assertEqual(len(errors), 1)
        self.assertEqual(
            'Field `my_request_field` was removed from Pydantic model '
            '`tests.reboot.server'
            '.service_descriptor_validator_pydantic'
            '.pydantic_request_original_api'
            '.EchoPydanticDoSomethingRequest`. '
            'Removing fields is a backwards-incompatible change. '
            'To continue, restore the field or use `expunge` to '
            'clear all existing state data.',
            errors[0],
        )

    def test_pydantic_request_field_type_changed(self):
        """Pydantic request field type change uses 'Pydantic model' terminology
        (not 'the state of servicer type') since the request is not the state."""
        with self.assertRaises(ProtoValidationError) as e:
            validate_descriptor_sets_are_backwards_compatible(
                self.request_original,
                self.request_field_type_changed,
            )

        self.assertIsNotNone(e.exception.validation_errors)
        assert e.exception.validation_errors is not None  # for mypy
        errors = e.exception.validation_errors
        self.assertEqual(len(errors), 1)
        self.assertEqual(
            'Field `my_request_field` in Pydantic model '
            '`tests.reboot.server'
            '.service_descriptor_validator_pydantic'
            '.pydantic_request_field_type_changed_api'
            '.EchoPydanticDoSomethingRequest` '
            'has switched type from `double` to `string`',
            errors[0],
        )


if __name__ == '__main__':
    # `get_descriptor_set` might import multiple pb2 modules that define
    # variants of the same proto service. Python's protobuf adds all pb2
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
