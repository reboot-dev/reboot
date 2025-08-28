import asyncio
import grpc
import os
import uuid
from cffi import FFI
from rbt.v1alpha1 import sidecar_pb2, sidecar_pb2_grpc, tasks_pb2
from rebootdev.aio.contexts import Participants
from rebootdev.aio.tracing import aio_client_interceptors
from rebootdev.aio.types import StateRef, StateTypeName
# TODO(benh): move this into a top-level 'grpc' module to be shared by
# both 'respect' and 'reboot'.
from rebootdev.grpc.options import make_retry_channel_options
from rebootdev.settings import MAX_SIDECAR_GRPC_MESSAGE_LENGTH_BYTES
from typing import AsyncIterator, Optional, overload

_ffi = FFI()
_ffi.cdef(
    """
  typedef void SidecarServer;

  SidecarServer* sidecar_server_create(const char* db_path, const char* consensus_info_proto);

  const char* sidecar_server_address(const SidecarServer* ss);

  void sidecar_server_shutdown(SidecarServer* ss);

  void sidecar_server_wait(SidecarServer* ss);

  void sidecar_server_destroy(SidecarServer* ss);

  size_t sidecar_server_load_actor_state(SidecarServer* server, const char* request_bytes, size_t request_bytes_size, char** message_bytes, char** status_message);

  size_t sidecar_server_store(SidecarServer* server, const char* request_bytes, size_t request_bytes_size, char** status_message);

  void sidecar_server_delete_array(char* ptr);
"""
)
_lib = _ffi.dlopen(
    os.path.join(os.path.dirname(__file__), "libsidecar_native.so")
)


# TODO: Refactor into an `exceptions` module.
class SidecarError(Exception):
    """Base exception for sidecar related errors."""


class SidecarServerFailed(SidecarError):
    """Raised when the sidecar server fails to start."""


class LoadError(SidecarError):
    """Base exception for errors related to loading state from the sidecar."""


class NonexistentTaskId(LoadError):
    """Raised when attempting to load a task response with a non-existent task
    id."""


class SidecarServer:
    """Wrapper for the CFFI SidecarServer."""

    def __init__(
        self, db_path: str, consensus_info: sidecar_pb2.ConsensusInfo
    ):
        self._ptr = _lib.sidecar_server_create(
            db_path.encode(), consensus_info.SerializeToString()
        )
        if self._ptr == _ffi.NULL:
            raise SidecarServerFailed("Failed to create SidecarServer")

    def __del__(self):
        if self._ptr != _ffi.NULL:
            _lib.sidecar_server_destroy(self._ptr)
            self._ptr = _ffi.NULL

    @property
    def address(self) -> str:
        addr_ptr = _lib.sidecar_server_address(self._ptr)
        if addr_ptr == _ffi.NULL:
            raise SidecarError("SidecarServer address is NULL")
        return _ffi.string(addr_ptr).decode()

    def shutdown(self):
        _lib.sidecar_server_shutdown(self._ptr)

    def wait(self):
        _lib.sidecar_server_wait(self._ptr)

    def _load_actor_state(
        self,
        request: sidecar_pb2.LoadRequest,
    ) -> Optional[bytes]:
        message_bytes = _ffi.new("char**")
        status_message = _ffi.new("char**")

        request_bytes = request.SerializeToString()
        try:
            size = _lib.sidecar_server_load_actor_state(
                self._ptr,
                request_bytes,
                len(request_bytes),
                message_bytes,
                status_message,
            )

            if message_bytes[0] != _ffi.NULL:
                response = sidecar_pb2.LoadResponse()
                response_bytes = _ffi.unpack(message_bytes[0], size)
                response.ParseFromString(response_bytes)

                if (len(response.actors) == 0):
                    # No actor found.
                    return None

                assert len(response.actors) == 1
                assert (response.actors[0].HasField('state'))
                return response.actors[0].state
            else:
                # Generic gRPC error.
                assert status_message[0] != _ffi.NULL
                status = _ffi.unpack(status_message[0], size)
                # We know that the 'status_message[0]' is a 'char*',
                # so according to the docs 'unpack' will always
                # return a 'bytes' object.
                # https://cffi.readthedocs.io/en/latest/ref.html#ffi-string-ffi-unpack
                assert isinstance(status, bytes)
                raise SidecarError(
                    "Error while loading actor state (gRPC request "
                    f"failed): {status.decode() or 'unknown error'}"
                )
        finally:
            _lib.sidecar_server_delete_array(message_bytes[0])
            _lib.sidecar_server_delete_array(status_message[0])

    def load_actor_state(
        self,
        state_type: StateTypeName,
        state_ref: StateRef,
    ) -> Optional[bytes]:
        """Attempt to load state from sidecar. Return None if state
         has not (yet) been stored.
        """

        request = sidecar_pb2.LoadRequest(
            actors=[
                sidecar_pb2.Actor(
                    state_type=state_type,
                    state_ref=state_ref.ref,
                )
            ]
        )

        return self._load_actor_state(request)

    def _store(self, request: sidecar_pb2.StoreRequest) -> None:
        status_message = _ffi.new("char**")

        request_bytes = request.SerializeToString()
        try:
            size = _lib.sidecar_server_store(
                self._ptr,
                request_bytes,
                len(request_bytes),
                status_message,
            )

            if status_message[0] != _ffi.NULL:
                status = _ffi.unpack(status_message[0], size)
                # We know that the 'status_message[0]' is a 'char*',
                # so according to the docs 'unpack' will always
                # return a 'bytes' object.
                # https://cffi.readthedocs.io/en/latest/ref.html#ffi-string-ffi-unpack
                assert isinstance(status, bytes)
                raise SidecarError(
                    "Error while storing data in sidecar (gRPC request "
                    f"failed): {status.decode() or 'unknown error'}"
                )
        finally:
            _lib.sidecar_server_delete_array(status_message[0])

    def store(
        self,
        actor_upserts: list[sidecar_pb2.Actor],
        task_upserts: list[sidecar_pb2.Task],
        colocated_upserts: list[sidecar_pb2.ColocatedUpsert],
        ensure_state_types_created: list[StateTypeName],
        transaction: Optional[sidecar_pb2.Transaction] = None,
        idempotent_mutation: Optional[sidecar_pb2.IdempotentMutation] = None,
        sync: bool = True,
    ) -> None:
        request = sidecar_pb2.StoreRequest(
            actor_upserts=actor_upserts,
            task_upserts=task_upserts,
            colocated_upserts=colocated_upserts,
            transaction=transaction,
            idempotent_mutation=idempotent_mutation,
            ensure_state_types_created=ensure_state_types_created,
            sync=sync,
        )

        self._store(request)


# `SortedMap` is implemented using a series of special cases that we might
# selectively remove over time. See #2983 for more information.
SORTED_MAP_TYPE_NAME = StateTypeName("rbt.std.collections.v1.SortedMap")
SORTED_MAP_ENTRY_TYPE_NAME = StateTypeName(
    "rbt.std.collections.v1.SortedMapEntry"
)


class SidecarClient:
    """Helper class for interacting with the reboot sidecar."""

    def __init__(self, target: str):
        self._target = target
        self._stub: Optional[sidecar_pb2_grpc.SidecarStub] = None

    async def colocated_range(
        self,
        *,
        parent_state_ref: StateRef,
        start: Optional[StateRef] = None,
        end: Optional[StateRef] = None,
        limit: int,
        transaction: Optional[sidecar_pb2.Transaction] = None,
    ) -> list[tuple[StateRef, bytes]]:
        """Attempt to load a page of colocated state machines from the sidecar."""
        stub = await self._get_sidecar_stub()
        response: sidecar_pb2.ColocatedRangeResponse = await stub.ColocatedRange(
            sidecar_pb2.ColocatedRangeRequest(
                state_type=SORTED_MAP_ENTRY_TYPE_NAME,
                parent_state_ref=parent_state_ref.to_str(),
                start=(start.to_str() if start else None),
                end=(end.to_str() if end else None),
                transaction=transaction,
                limit=limit,
            )
        )
        assert len(response.keys) == len(response.values)
        return list(
            zip(
                (StateRef(state_ref) for state_ref in response.keys),
                response.values,
            )
        )

    async def colocated_reverse_range(
        self,
        *,
        parent_state_ref: StateRef,
        start: Optional[StateRef] = None,
        end: Optional[StateRef] = None,
        limit: int,
        transaction: Optional[sidecar_pb2.Transaction] = None,
    ) -> list[tuple[StateRef, bytes]]:
        """Attempt to load a page of colocated state machines from the sidecar."""
        stub = await self._get_sidecar_stub()
        response: sidecar_pb2.ColocatedReverseRangeResponse = await stub.ColocatedReverseRange(
            sidecar_pb2.ColocatedReverseRangeRequest(
                state_type=SORTED_MAP_ENTRY_TYPE_NAME,
                parent_state_ref=parent_state_ref.to_str(),
                start=(start.to_str() if start else None),
                end=(end.to_str() if end else None),
                transaction=transaction,
                limit=limit,
            )
        )
        assert len(response.keys) == len(response.values)
        return list(
            zip(
                (StateRef(state_ref) for state_ref in response.keys),
                response.values,
            )
        )

    async def load_task_response(
        self,
        task_id: tasks_pb2.TaskId,
    ) -> Optional[tuple[tasks_pb2.TaskResponseOrError, sidecar_pb2.Task]]:
        """Attempt to load task response from sidecar. Return None if task
         has no response stored yet. If the task doesn't exist yet, throw an
         error.
        """
        stub = await self._get_sidecar_stub()
        response: sidecar_pb2.LoadResponse = await stub.Load(
            sidecar_pb2.LoadRequest(task_ids=[task_id])
        )

        if len(response.tasks) == 0:
            raise NonexistentTaskId()

        if len(response.tasks) > 1:
            raise LoadError(
                f'Expected one task in LoadResponse; got {len(response.tasks)}'
            )

        if response.tasks[0].status == sidecar_pb2.Task.Status.COMPLETED:
            # Invariant: once a Task's status is COMPLETED, the task response
            # field is filled (although the response itself may be empty).
            if response.tasks[0].WhichOneof("response_or_error") == "response":
                return (
                    tasks_pb2.TaskResponseOrError(
                        response=response.tasks[0].response,
                    ),
                    response.tasks[0],
                )
            elif response.tasks[0].WhichOneof("response_or_error") == "error":
                return (
                    tasks_pb2.TaskResponseOrError(
                        error=response.tasks[0].error,
                    ),
                    response.tasks[0],
                )
            else:
                raise AssertionError(
                    "Completed Task did not have response or error."
                )
        else:
            return None

    @overload
    async def find(
        self,
        state_type: StateTypeName,
        *,
        start_id: Optional[str] = None,
        exclusive: bool = False,
        limit: int = 100,
    ) -> list[StateRef]:
        ...

    @overload
    async def find(
        self,
        state_type: StateTypeName,
        *,
        until_id: Optional[str] = None,
        exclusive: bool = False,
        limit: int = 100,
    ) -> list[StateRef]:
        ...

    async def find(
        self,
        state_type: StateTypeName,
        *,
        start_id: Optional[str] = None,
        until_id: Optional[str] = None,
        exclusive: bool = False,
        limit: int = 100,
    ) -> list[StateRef]:
        """
        Find actor references by state type and ID prefix/range.
        
        Args:
            state_type: The state type to search for.
            start_id: Start searching from this ID (forward pagination).
            until_id: Search backwards from this ID (backward pagination).
            exclusive: If True, exclude either start_id or until_id from results.
            limit: Maximum number of results to return.
            
        Returns:
            List of StateRef objects matching the search criteria.
            
        Note:
            Only one of (start_id, until_id) should be specified.
        """
        stub = await self._get_sidecar_stub()

        request = sidecar_pb2.FindRequest(
            state_type=state_type,
            limit=limit,
        )

        if start_id is not None:
            state_ref = StateRef.from_id_prefix(state_type, start_id)
            request.start.state_ref = state_ref.to_str()
            request.start.exclusive = exclusive
        elif until_id is not None:
            state_ref = StateRef.from_id_prefix(state_type, until_id)
            request.until.state_ref = state_ref.to_str()
            request.until.exclusive = exclusive
        else:
            raise AssertionError("Either start_id or until_id must be given.")

        response: sidecar_pb2.FindResponse = await stub.Find(request)
        return [StateRef(ref) for ref in response.state_refs]

    async def transaction_coordinator_prepared(
        self,
        transaction_id: uuid.UUID,
        participants: Participants,
    ) -> None:
        """Called by a transaction coordinator after it has successfully
        prepared a transaction, i.e., completed the first phase of two
        phase commit. After this RPC returns we should always be able
        to tell all the transaction participants that the transaction
        has committed.
        """
        stub = await self._get_sidecar_stub()

        await stub.TransactionCoordinatorPrepared(
            sidecar_pb2.TransactionCoordinatorPreparedRequest(
                transaction_id=transaction_id.bytes,
                participants=participants.to_sidecar(),
            )
        )

    async def transaction_coordinator_cleanup(
        self,
        transaction_id: uuid.UUID,
    ) -> None:
        """Called by a transaction coordinator after all participants
        have confirmed that a transaction has been committed.
        """
        stub = await self._get_sidecar_stub()

        await stub.TransactionCoordinatorCleanup(
            sidecar_pb2.TransactionCoordinatorCleanupRequest(
                transaction_id=transaction_id.bytes,
            )
        )

    async def transaction_participant_prepare(
        self, state_type: StateTypeName, state_ref: StateRef
    ) -> None:
        """Called by a transaction participant when they are
        prepared. Guarantees that the preparedness of this participant
        is persisted when the RPC returns, meaning that until
        'TransactionParticipantCommit()' or '...Abort()' is called,
        any call to 'Recover()' is guaranteed to return this
        transaction's information.
        """
        stub = await self._get_sidecar_stub()

        await stub.TransactionParticipantPrepare(
            sidecar_pb2.TransactionParticipantPrepareRequest(
                state_type=state_type, state_ref=state_ref.to_str()
            )
        )

    async def transaction_participant_commit(
        self, state_type: StateTypeName, state_ref: StateRef
    ) -> None:
        """Called by a transaction participant to commit its given
        transaction. The transaction must previously have been
        prepared via 'TransactionParticipantPrepare()'. The
        transaction is guaranteed to be persisted as committed when
        the RPC returns.
        """
        stub = await self._get_sidecar_stub()

        await stub.TransactionParticipantCommit(
            sidecar_pb2.TransactionParticipantCommitRequest(
                state_type=state_type, state_ref=state_ref.to_str()
            )
        )

    async def transaction_participant_abort(
        self, state_type: StateTypeName, state_ref: StateRef
    ) -> None:
        """Called by a transaction participant to abort its given
        transaction. The transaction MAY or MAY NOT have been prepared
        via 'TransactionParticipantPrepare()'. The transaction is
        guaranteed to be persisted as aborted when the RPC returns.
        """
        stub = await self._get_sidecar_stub()

        await stub.TransactionParticipantAbort(
            sidecar_pb2.TransactionParticipantAbortRequest(
                state_type=state_type, state_ref=state_ref.to_str()
            )
        )

    async def recover(
        self,
        state_tags_by_state_type: dict[StateTypeName, str],
    ) -> sidecar_pb2.RecoverResponse:
        """Attempt to recover server state after a potential restart."""
        # To deal with network transfer limits we need to stream the
        # data from the sidecar which we then aggregate into a single
        # response.
        #
        # TODO: propagate the stream of responses and require the
        # caller to process each batch to reduce memory consumption.
        response = sidecar_pb2.RecoverResponse()

        stub = await self._get_sidecar_stub()
        async for partial in stub.Recover(
            sidecar_pb2.RecoverRequest(
                state_tags_by_state_type=state_tags_by_state_type,
            ),
        ):
            response.MergeFrom(partial)

        return response

    async def export(
        self, state_type: StateTypeName
    ) -> AsyncIterator[sidecar_pb2.ExportItem]:
        # TODO: Should be streaming.
        stub = await self._get_sidecar_stub()
        response = await stub.Export(
            sidecar_pb2.ExportRequest(state_type=state_type),
        )
        for item in response.items:
            yield item

    @classmethod
    async def _make_sidecar_channel(cls, target: str) -> grpc.aio.Channel:
        """Create a gRPC channel with options specific for the sidecar."""
        channel = grpc.aio.insecure_channel(
            target,
            options=make_retry_channel_options(
                max_send_message_length=MAX_SIDECAR_GRPC_MESSAGE_LENGTH_BYTES,
                max_receive_message_length=
                MAX_SIDECAR_GRPC_MESSAGE_LENGTH_BYTES,
            ),
            interceptors=aio_client_interceptors(),
        )

        # See 'respect/clients/aio/object_store_client.py' for a
        # longer explanation of why we wait for 'channel_ready()'
        # here.
        await asyncio.wait_for(channel.channel_ready(), timeout=45)
        return channel

    async def _get_sidecar_stub(self) -> sidecar_pb2_grpc.SidecarStub:
        if self._stub is None:
            channel = await SidecarClient._make_sidecar_channel(self._target)
            self._stub = sidecar_pb2_grpc.SidecarStub(channel)
        return self._stub
