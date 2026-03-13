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
        f'tests.reboot.server.service_descriptor_validator_zod.{name}'
    )


class ServiceDescriptorValidatorZodTestCase(unittest.TestCase):
    """Test that backwards-incompatible changes to Zod-defined schemas
    produce user-friendly error messages using Reboot terminology."""

    original: FileDescriptorSet
    field_deleted: FileDescriptorSet
    field_type_changed: FileDescriptorSet
    method_deleted: FileDescriptorSet
    method_type_changed: FileDescriptorSet
    state_non_required_field: FileDescriptorSet
    required_field_added: FileDescriptorSet
    state_renamed: FileDescriptorSet
    request_non_required_field: FileDescriptorSet
    request_original: FileDescriptorSet
    request_field_deleted: FileDescriptorSet
    request_field_type_changed: FileDescriptorSet
    request_required_field_added: FileDescriptorSet

    @classmethod
    def setUpClass(cls) -> None:
        cls.original = get_descriptor_set('zod_state_original_api_pb2')
        cls.field_deleted = get_descriptor_set(
            'zod_state_field_deleted_api_pb2'
        )
        cls.field_type_changed = get_descriptor_set(
            'zod_state_field_type_changed_api_pb2'
        )
        cls.method_deleted = get_descriptor_set('zod_method_deleted_api_pb2')
        cls.method_type_changed = get_descriptor_set(
            'zod_method_type_changed_api_pb2'
        )
        cls.state_non_required_field = get_descriptor_set(
            'zod_state_non_required_field_api_pb2'
        )
        cls.required_field_added = get_descriptor_set(
            'zod_state_required_field_added_api_pb2'
        )
        cls.state_renamed = get_descriptor_set('zod_state_renamed_api_pb2')
        cls.request_original = get_descriptor_set(
            'zod_request_original_api_pb2'
        )
        cls.request_field_deleted = get_descriptor_set(
            'zod_request_field_deleted_api_pb2'
        )
        cls.request_field_type_changed = get_descriptor_set(
            'zod_request_field_type_changed_api_pb2'
        )
        cls.request_non_required_field = get_descriptor_set(
            'zod_request_non_required_field_api_pb2'
        )
        cls.request_required_field_added = get_descriptor_set(
            'zod_request_required_field_added_api_pb2'
        )

    def test_zod_state_deleted(self):
        """Zod schema deletion uses 'servicer type' terminology."""
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
            'servicer type `EchoZod` (from `tests/reboot/server'
            '/service_descriptor_validator_zod'
            '/zod_state_original_api.ts`) was deleted',
            errors[0],
        )

    def test_zod_method_deleted(self):
        """Zod method deletion shows camelCase method name and
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
            'Method `doSomething` was deleted from servicer type '
            '`EchoZod` (from `tests/reboot/server'
            '/service_descriptor_validator_zod'
            '/zod_state_original_api.ts`)',
            errors[0],
        )

    def test_zod_method_type_changed(self):
        """Zod method type change uses 'servicer type' terminology and
        shows camelCase method name."""
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
            'Reboot options for method `doSomething` of servicer type '
            '`EchoZod` (from `tests/reboot/server'
            '/service_descriptor_validator_zod'
            '/zod_state_original_api.ts`) updated from...\n'
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

    def test_zod_field_deleted(self):
        """Zod state field deletion shows the camelCase field name and
        'the state of servicer type' terminology."""
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
            'Field `myField` was removed from the state of servicer type '
            '`EchoZod` (from `tests/reboot/server'
            '/service_descriptor_validator_zod'
            '/zod_state_original_api.ts`). '
            'Removing fields is a backwards-incompatible change. '
            'To continue, restore the field or use `expunge` to '
            'clear all existing state data.',
            errors[0],
        )

    def test_zod_field_type_changed(self):
        """Zod state field type change uses 'the state of servicer type'
        terminology and shows the camelCase field name."""
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
            'Field `myField` in the state of servicer type '
            '`EchoZod` (from `tests/reboot/server'
            '/service_descriptor_validator_zod'
            '/zod_state_field_type_changed_api.ts`) '
            'has switched type from `string` to `bool`',
            errors[0],
        )

    def test_zod_request_field_deleted(self):
        """Zod request field deletion uses 'Zod schema' terminology
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
            'Field `myRequestField` was removed from Zod schema '
            '`EchoZodDoSomethingRequest` (from `tests/reboot/server'
            '/service_descriptor_validator_zod'
            '/zod_request_original_api.ts`). '
            'Removing fields is a backwards-incompatible change. '
            'To continue, restore the field or use `expunge` to '
            'clear all existing state data.',
            errors[0],
        )

    def test_zod_request_field_type_changed(self):
        """Zod request field type change uses 'Zod schema' terminology
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
            'Field `myRequestField` in Zod schema '
            '`EchoZodDoSomethingRequest` (from `tests/reboot/server'
            '/service_descriptor_validator_zod'
            '/zod_request_field_type_changed_api.ts`) '
            'has switched type from `string` to `bool`',
            errors[0],
        )

    def test_zod_required_field_added(self):
        """Adding a required field raises an error with Zod terminology."""
        with self.assertRaises(ProtoValidationError) as e:
            validate_descriptor_sets_are_backwards_compatible(
                self.original,
                self.required_field_added,
            )

        self.assertIsNotNone(e.exception.validation_errors)
        assert e.exception.validation_errors is not None  # for mypy
        errors = e.exception.validation_errors
        self.assertEqual(len(errors), 1)
        self.assertEqual(
            'Field `myNewField` was added to the state of servicer type '
            '`EchoZod` (from `tests/reboot/server'
            '/service_descriptor_validator_zod'
            '/zod_state_required_field_added_api.ts`) as a required field. '
            'Adding required fields is a backwards-incompatible change. '
            'To continue, add the field with a default value or use '
            '`expunge` to clear all existing state data.',
            errors[0],
        )

    def test_zod_optional_to_required(self):
        """Changing a field from optional to required raises an error."""
        with self.assertRaises(ProtoValidationError) as e:
            validate_descriptor_sets_are_backwards_compatible(
                self.state_non_required_field,
                self.original,
            )

        self.assertIsNotNone(e.exception.validation_errors)
        assert e.exception.validation_errors is not None  # for mypy
        errors = e.exception.validation_errors
        self.assertEqual(len(errors), 1)
        self.assertEqual(
            'Field `myField` in the state of servicer type '
            '`EchoZod` (from `tests/reboot/server'
            '/service_descriptor_validator_zod'
            '/zod_state_original_api.ts`) became required. This is a '
            'backwards-incompatible change. To continue, revert the '
            'change or use `expunge` to clear all existing state data.',
            errors[0],
        )

    def test_zod_required_to_optional(self):
        """Changing a field from required to optional raises an error."""
        with self.assertRaises(ProtoValidationError) as e:
            validate_descriptor_sets_are_backwards_compatible(
                self.original,
                self.state_non_required_field,
            )

        self.assertIsNotNone(e.exception.validation_errors)
        assert e.exception.validation_errors is not None  # for mypy
        errors = e.exception.validation_errors
        self.assertEqual(len(errors), 1)
        self.assertEqual(
            'Field `myField` in the state of servicer type '
            '`EchoZod` (from `tests/reboot/server'
            '/service_descriptor_validator_zod'
            '/zod_state_non_required_field_api.ts`) is not required '
            'anymore. This is a backwards-incompatible change. To '
            'continue, revert the change or use `expunge` to clear all '
            'existing state data.',
            errors[0],
        )

    def test_zod_request_required_field_added(self):
        """Adding a required request field raises an error with 'Zod
        schema' terminology."""
        with self.assertRaises(ProtoValidationError) as e:
            validate_descriptor_sets_are_backwards_compatible(
                self.request_original,
                self.request_required_field_added,
            )

        self.assertIsNotNone(e.exception.validation_errors)
        assert e.exception.validation_errors is not None  # for mypy
        errors = e.exception.validation_errors
        self.assertEqual(len(errors), 1)
        self.assertEqual(
            'Field `myNewRequestField` was added to Zod schema '
            '`EchoZodDoSomethingRequest` (from `tests/reboot/server'
            '/service_descriptor_validator_zod'
            '/zod_request_required_field_added_api.ts`) as a required '
            'field. Adding required fields is a backwards-incompatible '
            'change. To continue, add the field with a default value '
            'or use `expunge` to clear all existing state data.',
            errors[0],
        )

    def test_zod_request_optional_to_required(self):
        """Changing a request field from optional to required raises an
        error."""
        with self.assertRaises(ProtoValidationError) as e:
            validate_descriptor_sets_are_backwards_compatible(
                self.request_non_required_field,
                self.request_original,
            )

        self.assertIsNotNone(e.exception.validation_errors)
        assert e.exception.validation_errors is not None  # for mypy
        errors = e.exception.validation_errors
        self.assertEqual(len(errors), 1)
        self.assertEqual(
            'Field `myRequestField` in Zod schema '
            '`EchoZodDoSomethingRequest` (from `tests/reboot/server'
            '/service_descriptor_validator_zod'
            '/zod_request_original_api.ts`) became required. This is a '
            'backwards-incompatible change. To continue, revert the '
            'change or use `expunge` to clear all existing state data.',
            errors[0],
        )

    def test_zod_request_required_to_optional(self):
        """Changing a request field from required to optional raises an
        error."""
        with self.assertRaises(ProtoValidationError) as e:
            validate_descriptor_sets_are_backwards_compatible(
                self.request_original,
                self.request_non_required_field,
            )

        self.assertIsNotNone(e.exception.validation_errors)
        assert e.exception.validation_errors is not None  # for mypy
        errors = e.exception.validation_errors
        self.assertEqual(len(errors), 1)
        self.assertEqual(
            'Field `myRequestField` in Zod schema '
            '`EchoZodDoSomethingRequest` (from `tests/reboot/server'
            '/service_descriptor_validator_zod'
            '/zod_request_non_required_field_api.ts`) is not required '
            'anymore. This is a backwards-incompatible change. To '
            'continue, revert the change or use `expunge` to clear all '
            'existing state data.',
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
