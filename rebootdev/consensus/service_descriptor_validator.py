import importlib.metadata
from google.protobuf.descriptor import (
    Descriptor,
    FieldDescriptor,
    MethodDescriptor,
    ServiceDescriptor,
)
from google.protobuf.descriptor_pb2 import DescriptorProto, FileDescriptorSet
from google.protobuf.descriptor_pool import DescriptorPool
from google.protobuf.json_format import MessageToDict
from google.protobuf.unknown_fields import UnknownFieldSet
from packaging import version
from rbt.v1alpha1 import options_pb2
from rebootdev.aio.exceptions import InputError
from rebootdev.options import get_method_options, is_reboot_state
from typing import Any, Callable, Iterable, Optional

PathDiff = tuple[str, Any, Any]

DESCRIPTOR_OPTION_TO_STRING = {
    # The constants are defined in google/protobuf/descriptor.proto
    # See https://github.com/protocolbuffers/protobuf/blob/main/src/google/protobuf/descriptor.proto
    'type':
        {
            FieldDescriptor.TYPE_DOUBLE: "double",
            FieldDescriptor.TYPE_FLOAT: "float",
            FieldDescriptor.TYPE_INT64: "int64",
            FieldDescriptor.TYPE_UINT64: "uint64",
            FieldDescriptor.TYPE_INT32: "int32",
            FieldDescriptor.TYPE_FIXED64: "fixed64",
            FieldDescriptor.TYPE_FIXED32: "fixed32",
            FieldDescriptor.TYPE_BOOL: "bool",
            FieldDescriptor.TYPE_STRING: "string",
            FieldDescriptor.TYPE_GROUP: "group",
            FieldDescriptor.TYPE_MESSAGE: "message",
            FieldDescriptor.TYPE_BYTES: "bytes",
            FieldDescriptor.TYPE_UINT32: "uint32",
            FieldDescriptor.TYPE_ENUM: "enum",
            FieldDescriptor.TYPE_SFIXED32: "sfixed32",
            FieldDescriptor.TYPE_SFIXED64: "sfixed64",
            FieldDescriptor.TYPE_SINT32: "sint32",
            FieldDescriptor.TYPE_SINT64: "sint64",
        },
    'label':
        {
            # In proto3 'optional' is applied to the field by default, but it
            # would be misleading to use that term with users, since this
            # is NOT related to the 'optional' keyword that they actually
            # know and use. We agreed to use 'singular' unless the field is
            # repeated. If a user specifies 'optional' in a proto3 we shouldn't
            # care, because it is not a backwards-incompatible change.
            FieldDescriptor.LABEL_OPTIONAL:
                "singular",
            FieldDescriptor.LABEL_REQUIRED:
                "required",
            FieldDescriptor.LABEL_REPEATED:
                "repeated",
        },
}


def dict_diff(
    left: Any,
    right: Any,
    *,
    path: Optional[str] = None,
) -> list[PathDiff]:
    """Diff the given items (usually string-key dictionaries), and recurse to
    return a minimum set of differences.

    A difference is a `.` separated path into the dictionary, with the left and
    right hand side values.
    """
    if isinstance(left, dict) and isinstance(right, dict):
        return [
            diff for key in {*left.keys(), *right.keys()}
            for diff in dict_diff(
                left.get(key),
                right.get(key),
                path=(f"{path}.{key}" if path else str(key)),
            )
        ]
    if left == right:
        return []
    return [(path or "", left, right)]


def legal_diff_constructor_to_message(
    diff: PathDiff,
    old: options_pb2.MethodOptions,
    new: options_pb2.MethodOptions,
) -> bool:
    """Allows the migration from https://github.com/reboot-dev/mono/pull/2596.

    #2596 converted the `writer.constructor` and `transaction.constructor` fields from
    booleans to a struct. Afterwards, their field numbers were incremented from 1 to 2:
    so if we see the old boolean constructor field at 1, then we can allow the addition
    of the empty constructor marker.
    """
    if diff == ('writer.constructor', None, {}):
        return any(uf.field_number == 1 for uf in UnknownFieldSet(old.writer))
    elif diff == ('transaction.constructor', None, {}):
        return any(
            uf.field_number == 1 for uf in UnknownFieldSet(old.transaction)
        )
    return False


def legal_diff_task_to_message(
    diff: PathDiff,
    old: options_pb2.MethodOptions,
    new: options_pb2.MethodOptions,
) -> bool:
    """Allows the migration for https://github.com/reboot-dev/mono/pull/2578.

    #2578 converted the `task` fields from a boolean to a struct. Afterwards, its
    field number was additional incremented from 6 to 8: so if we see the old boolean
    task field at 6, then we can allow the addition of the empty task marker.
    """
    if diff != ('task', None, {}):
        return False
    return any(uf.field_number == 6 for uf in UnknownFieldSet(old))


LegalMethodOptionDiffPredicate = Callable[
    [PathDiff, options_pb2.MethodOptions, options_pb2.MethodOptions], bool]

_LEGAL_REBOOT_METHOD_OPTION_DIFFS: list[LegalMethodOptionDiffPredicate] = [
    legal_diff_constructor_to_message,
    legal_diff_task_to_message,
]

ProtoValidationErrorMessage = str


class ProtoValidationError(InputError):

    def __init__(
        self,
        reason: str,
        validation_errors: list[ProtoValidationErrorMessage],
        causing_exception: Optional[Exception] = None,
        stack_trace: Optional[str] = None,
    ):
        super().__init__(
            reason=reason,
            causing_exception=causing_exception,
            stack_trace=stack_trace,
        )
        self.validation_errors = validation_errors


def validate_descriptor_sets_are_backwards_compatible(
    original_file_descriptor_set: FileDescriptorSet,
    updated_file_descriptor_set: FileDescriptorSet
) -> None:
    """Go through state-message definitions in the given encoded
    FileDescriptorSets to ensure that there are no backwards-incompatible
    changes.
    Raises a combined Exception of all the exceptions found, if any. Successful
    completion of the method means a valid update."""
    # Ensure that we have a sufficient version of protobuf as there
    # have been bugs in previous versions that did not properly set
    # fields that we need to check backwards compatibility.
    found_protobuf_version = version.Version(
        importlib.metadata.version('protobuf')
    )
    required_protobuf_version = version.Version('4.21.11')

    if found_protobuf_version < required_protobuf_version:
        raise RuntimeError(
            f"protobuf version must be >= '{required_protobuf_version}', "
            f"found '{found_protobuf_version}'"
        )

    errors: list[str] = []
    original_states_by_name = _get_all_reboot_states_by_name(
        original_file_descriptor_set
    )
    updated_states_by_name = _get_all_reboot_states_by_name(
        updated_file_descriptor_set
    )
    for state_name, original_state_descriptor in original_states_by_name.items(
    ):
        try:
            updated_state_descriptor = updated_states_by_name[state_name]
        except KeyError:
            # The whole state was deleted.
            errors.append(f'State `{state_name}` was deleted')
            continue

        errors += _validate_methods_are_backwards_compatible(
            original_state_descriptor, updated_state_descriptor
        )

        errors += _validate_state_is_backwards_compatible(
            original_state_descriptor, updated_state_descriptor
        )

    if len(errors) > 0:
        raise ProtoValidationError(
            reason=(
                "Updated state or method definitions are not backwards compatible. "
                "Consider reverting backwards incompatible changes or, if you "
                "don't care about backwards compatibility, using `expunge` to "
                "clear all data from this app to begin with a clean slate."
            ),
            validation_errors=errors,
        )


def _get_all_reboot_states_by_name(
    file_descriptor_set: FileDescriptorSet
) -> dict[str, Descriptor]:
    descriptor_pool = DescriptorPool()
    states_by_name: dict[str, Descriptor] = {}
    for file_descriptor_proto in file_descriptor_set.file:
        # We can't add a file to a pool if it's already been added, so let's
        # first check if it's already there.
        try:
            file_descriptor = descriptor_pool.FindFileByName(
                file_descriptor_proto.name
            )
        except KeyError:
            file_descriptor = descriptor_pool.Add(file_descriptor_proto)
        # Merge the new file descriptor's list of messages with the combined
        # list.
        try:
            for message_name, message_descriptor in file_descriptor.message_types_by_name.items(
            ):
                if is_reboot_state(message_descriptor):
                    states_by_name[message_name] = message_descriptor

        except AttributeError:
            # This file descriptor has no messages. That's fine - maybe it's
            # just some messages that services depend on. Skip it.
            continue

    return states_by_name


def _validate_methods_are_backwards_compatible(
    original_state: Descriptor,
    updated_state: Descriptor,
) -> list[ProtoValidationErrorMessage]:
    """Validate the given updated Service against the original version to ensure
    that no relevant RPCs have backwards-incompatible changes in the updated
    version. Ignore methods not named in the method_names_filter set.
    Returns a list of all the Exceptions found, or an empty list if the change
    is valid."""

    # NOTE: We currently only support "inherent" methods on a service named
    # `${Message}Methods`: in future we might support defining additional
    # interfaces.
    def get_service_descriptor(state: Descriptor) -> ServiceDescriptor:
        service_name = f'{state.full_name}Methods'

        try:
            return state.file.pool.FindServiceByName(service_name)
        except KeyError:
            fallback_service_name = f'{state.full_name}Interface'
            try:
                # TODO(rjh): this is a fallback check that's required while we
                #            have services whose name is migrating from
                #            `[...]Interface` to `[...]Methods` as part of
                #            https://github.com/reboot-dev/mono/issues/3802.
                #            When that issue is complete, we can remove this.
                return state.file.pool.FindServiceByName(fallback_service_name)
            except KeyError:
                raise InputError(
                    f"Service `{service_name}` (or legacy variant, "
                    f"'{fallback_service_name}') not found in "
                    f"'{state.file.name}' or imported files"
                )

    original = get_service_descriptor(original_state)
    updated = get_service_descriptor(updated_state)

    exceptions: list[ProtoValidationErrorMessage] = []
    for method in original.methods_by_name.values():
        # Make sure the method is still present in the updated file.
        try:
            updated_method = updated.methods_by_name[method.name]
        except KeyError:
            exceptions.append(
                f'Method `{original.full_name}.{method.name}` was deleted'
            )
            continue

        # Run several validations and collect Exceptions from each.
        exceptions += _validate_reboot_options(
            original.full_name, method, updated_method
        )
        exceptions += _validate_request_response(
            original.full_name, method, updated_method
        )

    return exceptions


def _validate_reboot_options(
    service_name: str,
    original_method: MethodDescriptor,
    updated_method: MethodDescriptor,
) -> list[ProtoValidationErrorMessage]:
    """Compare the Reboot options for the original and updated methods to be
    sure there are no changes.
    Return a list of Exceptions describing any discrepancies. An empty list
    means equivalent options.
    """
    # Currently, we treat all changes as backwards-incompatible.
    original_reboot_options = get_method_options(original_method)
    updated_reboot_options = get_method_options(updated_method)
    diffs = dict_diff(
        MessageToDict(original_reboot_options),
        MessageToDict(updated_reboot_options)
    )
    # Filter out any legal differences.
    illegal_diffs = [
        d for d in diffs if not any(
            is_legal_diff(d, original_reboot_options, updated_reboot_options)
            for is_legal_diff in _LEGAL_REBOOT_METHOD_OPTION_DIFFS
        )
    ]
    if len(illegal_diffs) > 0:
        # TODO: Consider rendering each `illegal_diff`, rather than the entire
        #       structure.
        return [
            f'Reboot options for method `{service_name}.{original_method.name}` '
            'updated from...\n'
            '```\n'
            f'{str(original_reboot_options).strip()}\n'
            '```\n'
            'to...\n'
            '```\n'
            f'{str(updated_reboot_options).strip()}\n'
            '```'
        ]
    return []


def _validate_request_response(
    service_name: str,
    original_method: MethodDescriptor,
    updated_method: MethodDescriptor,
) -> list[ProtoValidationErrorMessage]:
    """Check that the two MethodDescriptors have the same request and response
    types with the same structures.
    Return a list of Exceptions describing any discrepancies. An empty list
    means equivalent method signatures.
    """
    return _compare_messages(
        original_method.input_type,
        updated_method.input_type,
        f"{service_name}.{original_method.name}",
    ) + _compare_messages(
        original_method.output_type,
        updated_method.output_type,
        f"{service_name}.{original_method.name}",
    )


def _compare_reserved_field_numbers(
    original_ranges: Iterable[DescriptorProto.ReservedRange],
    updated_ranges: Iterable[DescriptorProto.ReservedRange],
    original_message_name: str,
    where_message: str,
) -> list[ProtoValidationErrorMessage]:
    """
    Compare the reserved field numbers in the two given messages. If the updated
    field numbers are not a superset of the original field numbers, returns an
    error for every missing range.
    """
    exceptions: list[ProtoValidationErrorMessage] = []
    [reserved_range for reserved_range in original_ranges]

    original_ranges = sorted(original_ranges, key=lambda r: r.start)
    original_ranges_iter = iter(original_ranges)
    original_range: Optional[DescriptorProto.ReservedRange
                            ] = (next(original_ranges_iter, None))
    updated_ranges = sorted(updated_ranges, key=lambda r: r.start)
    updated_ranges_iter = iter(updated_ranges)
    updated_range: Optional[DescriptorProto.ReservedRange
                           ] = next(updated_ranges_iter, None)

    # As long as we still have original ranges to check...
    while original_range is not None:
        # The current `updated_range` must fall before, or overlap with the
        # start of, the current `original_range`. If it falls after, then we
        # have a missing range.
        if updated_range is None or updated_range.start > original_range.start:
            missing_start = original_range.start
            # Since users think of inclusive ranges, communicate the missing
            # range with an inclusive end.
            missing_end_inclusive = original_range.end - 1
            if updated_range is not None:
                # Perhaps the updated range does cover a part of the original
                # range. Only complain about the part that's missing.
                missing_end_inclusive = min(
                    missing_end_inclusive, updated_range.start - 1
                )
            exceptions.append(
                f'Field numbers {missing_start} to '
                f'{missing_end_inclusive} are no longer `reserved` in '
                f'message `{original_message_name}` ({where_message}).'
            )
            # If we were missing the whole original range, we move on to the
            # next original range, to see whether it was also removed.
            # If we were only missing part of the original range, we move on to
            # see whether the remaining part of the original range is fully
            # present.
            if (
                updated_range is None or
                original_range.end <= updated_range.start
            ):
                # The full original range was not covered by the updated range.
                original_range = next(original_ranges_iter, None)
            else:
                # Only part of the original range was missing.
                original_range.start = updated_range.start

        # If the updated range ends before the original range, then it covers
        # nothing. We can skip to the next updated range.
        elif updated_range.end <= original_range.start:
            updated_range = next(updated_ranges_iter, None)

        # If none of the above applied, then the original range must (partially)
        # cover the updated range, so we can declare victory for that (part of
        # the) updated range and move on to the next (part of the) original
        # range.
        else:
            assert updated_range.start <= original_range.start
            assert updated_range.end > original_range.start
            if updated_range.end < original_range.end:
                # The updated range ends before the original range ends, so we
                # need still check the remainder of the original range.
                original_range.start = updated_range.end
            else:
                # The updated range ends after the original range ends, so it
                # covers the whole original range. We can move on to the next
                # original range.
                original_range = next(original_ranges_iter, None)

    return exceptions


def _compare_messages(
    original_message: Descriptor,
    updated_message: Descriptor,
    # TODO(rjh): make sure the `source_name` is used in all of the error
    # messages produced by this function.
    source_name: str,
    processed_field_messages_names: list[str] = [],
) -> list[ProtoValidationErrorMessage]:
    """Check that the two messages have the same structure.
    Return a list of Exceptions describing any discrepancies. An empty list
    means equivalent options."""

    # Annoyingly, some information (notably the list of reserved field numbers
    # and names) is only accessible from the DescriptorProto, not the
    # Descriptor. So we have to convert the Descriptor to a DescriptorProto
    # first.
    original_message_proto = DescriptorProto()
    original_message.CopyToProto(original_message_proto)
    updated_message_proto = DescriptorProto()
    updated_message.CopyToProto(updated_message_proto)

    # What do we call the message(s) we're comparing? If it didn't change names,
    # it's easy. But if it changed names, we should hint the user that any
    # errors are possibly due to the change from one message type to another.
    where_message = f'in `{source_name}`'
    if original_message.name != updated_message.name:
        where_message = f'changed to `{updated_message.name}` {where_message}'

    # Check that none of the reserved fields in the original message were
    # removed.
    exceptions: list[ProtoValidationErrorMessage
                    ] = _compare_reserved_field_numbers(
                        original_message_proto.reserved_range,
                        updated_message_proto.reserved_range,
                        original_message_proto.name,
                        where_message,
                    )
    for reserved_name in original_message_proto.reserved_name:
        if reserved_name not in updated_message_proto.reserved_name:
            exceptions.append(
                f'Field name `{reserved_name}` is no longer `reserved` in '
                f'message `{original_message.name}` ({where_message}).'
            )

    for field_number, original_field in original_message.fields_by_number.items(
    ):
        try:
            updated_field = updated_message.fields_by_number[field_number]
        except KeyError:
            # This field has been deleted. That's a backwards compatible change,
            # but ONLY if the field number and name have now been `reserved`.
            field_number_reserved = False
            for reserved_range in updated_message_proto.reserved_range:
                field_number_reserved |= (
                    reserved_range.start <= field_number and
                    reserved_range.end > field_number
                )
            if not field_number_reserved:
                exceptions.append(
                    f'Field `{original_field.name}` was deleted from '
                    f'message `{original_message.name}` ({where_message}), '
                    'and its field number was not reserved. See: '
                    'https://protobuf.dev/programming-guides/proto3/#reserved'
                )

            if original_field.name not in updated_message_proto.reserved_name:
                exceptions.append(
                    f'Field `{original_field.name}` was deleted from '
                    f'message `{original_message.name}` ({where_message}), '
                    'and its field name was not reserved. See: '
                    'https://protobuf.dev/programming-guides/proto3/#reserved'
                )

            # Since this field doesn't exist anymore, there's nothing more to
            # validate about it. On to the next.
            continue

        contains_backwards_incompatible_changes = False

        # Every property in the FieldDescriptor needs to be the same.
        for property_name in ['type', 'label']:

            original_value = getattr(original_field, property_name)
            updated_value = getattr(updated_field, property_name)

            if original_value == updated_value:
                continue

            hint = (
                f'(relative to original message `{original_message.name}`) '
                if original_message.name != updated_message.name else ''
            )

            original_value_str = DESCRIPTOR_OPTION_TO_STRING[
                property_name].get(original_value, str(original_value))
            updated_value_str = DESCRIPTOR_OPTION_TO_STRING[property_name].get(
                updated_value, str(updated_value)
            )

            error_message = (
                f'Field `{updated_field.name}` in message `{updated_message.name}` '
                f'has switched {property_name} '
                f'{hint}'
                f'from `{original_value_str}` to `{updated_value_str}`'
            )

            exceptions += [error_message]

            contains_backwards_incompatible_changes = True

        if contains_backwards_incompatible_changes:
            # Even if this field was/is of `TYPE_MESSAGE`, it doesn't make sense
            # to keep looking deeper inside: if the "type" changed (e.g. from
            # `MyMessage` to `int`) we can't recurse into one side of the
            # comparison anyway, and if the field switched from `repeated` to
            # non-`repeated` or vice-versa it's unlikely that any further nested
            # errors would make things easier to debug.
            continue

        # If this field is a nested proto message and it is not processed yet,
        # descend into it recursively.
        if (
            original_field.type == FieldDescriptor.TYPE_MESSAGE and
            original_field.message_type.full_name
            not in processed_field_messages_names
        ):
            processed_field_messages_names.append(
                original_field.message_type.full_name
            )

            exceptions += _compare_messages(
                original_field.message_type,
                updated_field.message_type,
                source_name,
                processed_field_messages_names,
            )

    return exceptions


def _validate_state_is_backwards_compatible(
    original: Descriptor,
    updated: Descriptor,
) -> list[ProtoValidationErrorMessage]:
    try:
        return _compare_messages(
            original,
            updated,
            original.name,
        )
    except ValueError as e:
        return [str(e)]
