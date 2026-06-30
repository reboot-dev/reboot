import argparse
import grpc
from google.protobuf import json_format
from google.protobuf.struct_pb2 import Struct
from rbt.v1alpha1.inspect import inspect_pb2, inspect_pb2_grpc
from reboot.aio.external import ExternalContext
from reboot.aio.headers import AUTHORIZATION_HEADER, STATE_REF_HEADER
from reboot.aio.types import StateRef, StateTypeName
from reboot.cli.common import terminal
from reboot.cli.common.admin_credential import (
    add_admin_credential_args,
    resolve_admin_credential,
)
from reboot.cli.common.rc import ArgumentParser, add_common_channel_args
from typing import Optional


def inspect_subcommands() -> list[str]:
    return [
        'inspect type list',
        'inspect state list',
        'inspect state get',
    ]


def register_inspect(parser: ArgumentParser):
    """Register the 'inspect' subcommand with the given parser."""

    def _add_common_args(subcommand):
        add_common_channel_args(subcommand)
        add_admin_credential_args(subcommand)

    _add_common_args(parser.subcommand('inspect type list'))

    state_list = parser.subcommand('inspect state list')
    _add_common_args(state_list)
    state_list.add_argument(
        '--type',
        type=str,
        help="the full name of the state type to list state IDs for",
        required=True,
    )

    state_get = parser.subcommand('inspect state get')
    _add_common_args(state_get)
    state_get.add_argument(
        '--type',
        type=str,
        help="the full name of the state type of the state to get",
        required=True,
    )
    state_get.add_argument(
        '--id',
        type=str,
        help="the ID of the state to get",
        required=True,
    )


def _metadata(args: argparse.Namespace) -> tuple[tuple[str, str], ...]:
    """Construct the gRPC metadata carrying the admin credential."""
    credential = resolve_admin_credential(args)
    return ((AUTHORIZATION_HEADER, f"Bearer {credential}"),)


# IMPORTANT: callers must bind the stub returned by `_stub(...)` to a
# local and keep it alive for the whole duration of the RPC (e.g. across
# the `async for` that drains a server stream). The stub holds the only
# reference to the underlying gRPC channel; if the stub is left
# anonymous (`_stub(args).SomeStreamingCall(...)`) it becomes
# unreachable as soon as the call object is created, and
# garbage-collecting it tears the channel down mid-call. For a
# server-streaming RPC the call then wedges forever at
# `initiate_unary_stream` (it never even receives the first message),
# which looks like `rbt inspect` hanging.
def _stub(args: argparse.Namespace) -> inspect_pb2_grpc.InspectStub:
    context = ExternalContext(name="reboot-cli", url=args.application_url)
    return inspect_pb2_grpc.InspectStub(context.legacy_grpc_channel())


async def inspect_type_list(args: argparse.Namespace) -> None:
    """Implementation of the 'inspect type list' subcommand."""
    try:
        # Bind the stub to a local so the channel stays alive for the
        # whole stream (see the note on `_stub`).
        stub = _stub(args)
        async for response in stub.GetStateTypes(
            inspect_pb2.GetStateTypesRequest(),
            metadata=_metadata(args),
        ):
            # The server sends the list of state types once and then
            # holds the stream open to signal restarts; print that first
            # response and return rather than waiting for further ones.
            for state_type in response.state_types:
                terminal.info(state_type)
            return
    except grpc.aio.AioRpcError as e:
        terminal.fail(f"Failed to list state types: {e.details()}")


async def inspect_state_list(args: argparse.Namespace) -> None:
    """Implementation of the 'inspect state list' subcommand."""
    try:
        # Bind the stub to a local so the channel stays alive for the
        # whole stream (see the note on `_stub`).
        stub = _stub(args)
        async for response in stub.ListStates(
            inspect_pb2.ListStatesRequest(state_type=args.type),
            metadata=_metadata(args),
        ):
            # `ListStates` streams a fresh overview whenever the set of
            # states changes; the first response is already a complete
            # view across all servers, so print it and return rather
            # than waiting for further ones.
            for state_info in response.state_infos:
                terminal.info(state_info.state_id)
            return
    except grpc.aio.AioRpcError as e:
        terminal.fail(f"Failed to list states: {e.details()}")


async def inspect_state_get(args: argparse.Namespace) -> None:
    """Implementation of the 'inspect state get' subcommand."""
    try:
        state_ref = StateRef.from_id(StateTypeName(args.type), args.id)
    except Exception as e:
        terminal.fail(f"Invalid state reference: {e}")

    # `GetState` takes no parameters in its request body; the state to
    # fetch is identified (and the call routed) via the
    # `x-reboot-state-ref` header.
    state_ref_header = (STATE_REF_HEADER, state_ref.to_str())
    metadata = _metadata(args) + (state_ref_header,)

    # Accumulate chunks in a `bytearray` (amortized O(1) extend) rather
    # than repeatedly concatenating `bytes` (which would be O(n^2)).
    data = bytearray()
    try:
        # Bind the stub to a local so the channel stays alive for the
        # whole stream (see the note on `_stub`).
        stub = _stub(args)
        # `GetState` streams a fresh snapshot whenever the state changes,
        # each snapshot split into `total` chunks to stay under the max
        # gRPC message size. Reassemble just the first complete snapshot,
        # then break and return rather than waiting for further ones.
        async for response in stub.GetState(
            inspect_pb2.GetStateRequest(),
            metadata=metadata,
        ):
            data += response.data
            if response.chunk + 1 == response.total:
                break
    except grpc.aio.AioRpcError as e:
        terminal.fail(f"Failed to get state: {e.details()}")

    struct = Struct()
    struct.ParseFromString(bytes(data))
    terminal.info(json_format.MessageToJson(struct))


async def handle_inspect_subcommand(
    args: argparse.Namespace,
) -> Optional[int]:
    if args.subcommand == 'inspect type list':
        await inspect_type_list(args)
        return 0
    elif args.subcommand == 'inspect state list':
        await inspect_state_list(args)
        return 0
    elif args.subcommand == 'inspect state get':
        await inspect_state_get(args)
        return 0
    return None
