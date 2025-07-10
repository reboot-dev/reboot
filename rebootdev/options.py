from google.protobuf.descriptor import (
    Descriptor,
    FileDescriptor,
    MethodDescriptor,
    ServiceDescriptor,
)
from google.protobuf.descriptor_pb2 import (
    FileOptions,
    MessageOptions,
    MethodOptions,
    ServiceOptions,
)
from rbt.v1alpha1 import options_pb2


def get_state_options(state: Descriptor) -> options_pb2.StateOptions:
    """
    Takes a proto descriptor for a Reboot state type, and extracts the
    reboot.StateOptions.
    """
    # This method must be called with a confirmed state type, i.e. one that has
    # the state option set.
    assert is_reboot_state(state)
    options: MessageOptions = state.GetOptions()
    # This is the proto API for accessing our custom options used in the
    # given `MessageOptions`.
    return options.Extensions[options_pb2.state]


def is_reboot_state(message: Descriptor) -> bool:
    """
    Check if the message is a Reboot state.

    A reboot state MUST have the StateOptions annotation.
    """
    options: MessageOptions = message.GetOptions()
    return options_pb2.state in options.Extensions


def get_method_options(method: MethodDescriptor) -> options_pb2.MethodOptions:
    """
    Takes a proto descriptor of options specified on a method, and extracts the
    reboot.MethodOptions, if such an option is set.
    """
    options: MethodOptions = method.GetOptions()
    # This is the proto API for accessing our custom options used in the
    # given `MethodOptions`. Returns an empty reboot.MethodOptions if no
    # option is set, which means its options will default to the proto
    # defaults for their field types.
    return options.Extensions[options_pb2.method]


def has_method_options(method: MethodDescriptor) -> bool:
    options: MethodOptions = method.GetOptions()
    return options_pb2.method in options.Extensions


def get_service_options(
    service: ServiceDescriptor
) -> options_pb2.ServiceOptions:
    """
    Takes a proto descriptor of options specified on a service, and extracts the
    reboot.ServiceOptions, if such an option is set.
    """
    options: ServiceOptions = service.GetOptions()
    # This is the proto API for accessing our custom options used in the
    # given `ServiceOptions`. Returns an empty reboot.ServiceOptions if no
    # option is set, which means its options will default to the proto
    # defaults for their field types.
    return options.Extensions[options_pb2.service]


def has_service_options(service: ServiceDescriptor) -> bool:
    options: ServiceOptions = service.GetOptions()
    return options_pb2.service in options.Extensions


def get_file_options(file: FileDescriptor) -> options_pb2.FileOptions:
    """Takes a file proto descriptor and extracts the reboot.FileOptions,
    if such an option is set.
    """
    options: FileOptions = file.GetOptions()
    # This is the proto API for accessing our custom options used in the
    # given `FileOptions`. Returns an empty reboot.FileOptions if no
    # option is set, which means its options will default to the proto
    # defaults for their field types.
    return options.Extensions[options_pb2.file]


def has_file_options(file: FileDescriptor) -> bool:
    options: FileOptions = file.GetOptions()
    return options_pb2.file in options.Extensions
