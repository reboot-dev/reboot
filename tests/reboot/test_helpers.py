import importlib
import multiprocessing
import os
from google.protobuf.descriptor_pb2 import FileDescriptorSet
from reboot.helpers import add_file_descriptor_to_file_descriptor_set


def read_lines_from_file(file_path: str) -> list[str]:
    """ Returns a list containing every line of the file found at the given
    path.
    """
    current_path = os.path.dirname(__file__)
    full_path = os.path.join(current_path, file_path)
    with open(full_path, 'r') as file:
        return file.readlines()


def _import_pb2_and_create_descriptor_set(
    name: str,
    result_queue: multiprocessing.Queue,
) -> None:
    """Helper to import the pb2 with the given name, extract its FileDescriptor,
    and add it (along with any dependencies) to a FileDescriptorSet."""
    descriptor_set = FileDescriptorSet()
    module = importlib.import_module(name)
    file_descriptor = getattr(module, 'DESCRIPTOR')
    add_file_descriptor_to_file_descriptor_set(
        descriptor_set, file_descriptor, []
    )
    result_queue.put(descriptor_set)


def get_descriptor_set(name: str) -> FileDescriptorSet:
    """Fetch the descriptor set for the compiled pb2 with the given name.

    Because Python adds all its pb2 imports to the same default descriptor pool,
    and several tests explicitly want to redefine the same service in multiple
    imports to test validation and versioning, there will be errors if we import
    these pb2s normally. Thus, we import each one in a separate process so that
    they will get their own memory and default descriptor pools. From there, we
    can extract FileDescriptors safely.

    ATTENTION: this method will SYNCHRONOUSLY BLOCK for a long time; do not call
               this method from `asyncio` code.
    """

    mp_context = multiprocessing.get_context()
    assert mp_context.get_start_method() == 'forkserver'
    result_queue = mp_context.Queue()

    # Start a fresh process every time, to make sure the descriptor pool is
    # entirely clean. We especially avoid using `ProcessPoolExecutor`, which
    # can freeze in Python versions before 3.12.1:
    # https://github.com/python/cpython/issues/105829
    process = mp_context.Process(
        target=_import_pb2_and_create_descriptor_set,
        args=(name, result_queue),
    )

    process.start()

    result = result_queue.get()

    process.join()
    return result


def combine_descriptor_sets(
    *descriptor_sets: FileDescriptorSet,
) -> FileDescriptorSet:
    """Combine multiple `FileDescriptorSet`s into one."""
    result = FileDescriptorSet()
    seen: set[str] = set()
    for descriptor_set in descriptor_sets:
        for file_proto in descriptor_set.file:
            if file_proto.name not in seen:
                result.file.append(file_proto)
                seen.add(file_proto.name)
    return result
