import asyncio
import grpc
import os
import sys
import uuid
from cffi import FFI
from rbt.v1alpha1 import (
    application_metadata_pb2,
    database_pb2,
    database_pb2_grpc,
    tasks_pb2,
)
from rebootdev.aio.contexts import Participants
from rebootdev.aio.tracing import aio_client_interceptors
from rebootdev.aio.types import StateRef, StateTypeName
# TODO(benh): move this into a top-level 'grpc' module to be shared by
# both 'respect' and 'reboot'.
from rebootdev.grpc.options import make_retry_channel_options
from rebootdev.settings import MAX_DATABASE_GRPC_MESSAGE_LENGTH_BYTES
from typing import AsyncIterator, Mapping, Optional, cast, overload

_ffi = FFI()
_ffi.cdef(
    """
  typedef void DatabaseServer;

  // Note: server_info_proto is binary protobuf data that may contain
  // null bytes. The length parameter is required to avoid truncation at
  // embedded nulls.
  DatabaseServer* database_server_create(
    const char* state_directory,
    const char* server_info_proto,
    size_t server_info_length,
    int port
  );

  const char* database_server_address(const DatabaseServer* ss);

  void database_server_shutdown(DatabaseServer* ss);

  void database_server_wait(DatabaseServer* ss);

  void database_server_destroy(DatabaseServer* ss);
"""
)

# Bazel >= 6 will produce a 'libdatabase_native.dylib' for the MacOS and
# 'libdatabase_native.so' for Linux.
if sys.platform == "darwin":
    _lib = _ffi.dlopen(
        os.path.join(os.path.dirname(__file__), "libdatabase_native.dylib")
    )
else:
    _lib = _ffi.dlopen(
        os.path.join(os.path.dirname(__file__), "libdatabase_native.so")
    )


# TODO: Refactor into an `exceptions` module.
class DatabaseError(Exception):
    """Base exception for database related errors."""


class DatabaseServerFailed(DatabaseError):
    """Raised when the database server fails to start."""


class LoadError(DatabaseError):
    """Base exception for errors related to loading state from the database."""


class NonexistentTaskId(LoadError):
    """Raised when attempting to load a task response with a non-existent task
    id."""


class DatabaseServer:
    """Wrapper for the CFFI DatabaseServer."""

    def __init__(
        self,
        state_directory: str,
        server_info: database_pb2.ServerInfo,
        port: int = 0,
    ):
        assert len(server_info.shard_infos
                  ) > 0, ("Server info must contain at least one shard.")

        serialized = server_info.SerializeToString()

        # Pass explicit length to handle binary protobuf data. Protobuf
        # serialization contains null bytes, so we must pass the length
        # explicitly to avoid truncation when CFFI treats it as a C
        # string.
        self._ptr = _lib.database_server_create(
            state_directory.encode(), serialized, len(serialized), port
        )
        if self._ptr == _ffi.NULL:
            raise DatabaseServerFailed("Failed to create DatabaseServer")

    def __del__(self):
        if self._ptr != _ffi.NULL:
            _lib.database_server_destroy(self._ptr)
            self._ptr = _ffi.NULL

    @property
    def address(self) -> str:
        addr_ptr = _lib.database_server_address(self._ptr)
        if addr_ptr == _ffi.NULL:
            raise DatabaseError("DatabaseServer address is NULL")
        return _ffi.string(addr_ptr).decode()

    def _shutdown(self):
        _lib.database_server_shutdown(self._ptr)

    def _wait(self):
        _lib.database_server_wait(self._ptr)

    async def shutdown_and_wait(self):
        # `wait()` in particular is a long-running synchronous
        # operation, and because it's calling synchronous C++ code via
        # PyBind it can't be `async`. Run it in an executor to avoid
        # blocking the event loop.
        def do():
            self._shutdown()
            self._wait()

        loop = asyncio.get_running_loop()
        await loop.run_in_executor(executor=None, func=do)


# `SortedMap` is implemented using a series of special cases that we might
# selectively remove over time. See #2983 for more information.
SORTED_MAP_TYPE_NAME = StateTypeName("rbt.std.collections.v1.SortedMap")
SORTED_MAP_ENTRY_TYPE_NAME = StateTypeName(
    "rbt.std.collections.v1.SortedMapEntry"
)


class DatabaseClient:
    """Helper class for interacting with the reboot database."""

    def __init__(self, target: str):
        self._target = target
        self._stub: Optional[database_pb2_grpc.DatabaseStub] = None

    async def colocated_range(
        self,
        *,
        parent_state_ref: StateRef,
        start: Optional[StateRef] = None,
        end: Optional[StateRef] = None,
        limit: int,
        transaction: Optional[database_pb2.Transaction] = None,
    ) -> list[tuple[StateRef, bytes]]:
        """Attempt to load a page of colocated state machines from the database."""
        stub = await self._get_database_stub()
        response: database_pb2.ColocatedRangeResponse = await stub.ColocatedRange(
            database_pb2.ColocatedRangeRequest(
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
        transaction: Optional[database_pb2.Transaction] = None,
    ) -> list[tuple[StateRef, bytes]]:
        """Attempt to load a page of colocated state machines from the database."""
        stub = await self._get_database_stub()
        response: database_pb2.ColocatedReverseRangeResponse = await stub.ColocatedReverseRange(
            database_pb2.ColocatedReverseRangeRequest(
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

    async def load_actor_state(
        self,
        state_type: StateTypeName,
        state_ref: StateRef,
    ) -> Optional[bytes]:
        """Attempt to load state from database. Return None if state
         has not (yet) been stored.
        """
        stub = await self._get_database_stub()
        response: database_pb2.LoadResponse = await stub.Load(
            database_pb2.LoadRequest(
                actors=[
                    database_pb2.
                    Actor(state_type=state_type, state_ref=state_ref.to_str())
                ]
            )
        )
        if len(response.actors) > 1:
            raise LoadError(
                f'Expected one actor in LoadResponse; got {len(response.actors)}'
            )

        if len(response.actors) == 0:
            return None

        # Invariant: If an actor is filled in a LoadResponse, its state field is
        # also filled (although said state may itself be empty).
        assert response.actors[0].HasField('state')
        return response.actors[0].state

    async def load_task_response(
        self,
        task_id: tasks_pb2.TaskId,
    ) -> Optional[tuple[tasks_pb2.TaskResponseOrError, database_pb2.Task]]:
        """Attempt to load task response from database. Return None if task
         has no response stored yet. If the task doesn't exist yet, throw an
         error.
        """
        stub = await self._get_database_stub()
        response: database_pb2.LoadResponse = await stub.Load(
            database_pb2.LoadRequest(task_ids=[task_id])
        )

        if len(response.tasks) == 0:
            raise NonexistentTaskId()

        if len(response.tasks) > 1:
            raise LoadError(
                f'Expected one task in LoadResponse; got {len(response.tasks)}'
            )

        if response.tasks[0].status == database_pb2.Task.Status.COMPLETED:
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

    async def store(
        self,
        actor_upserts: list[database_pb2.Actor],
        task_upserts: list[database_pb2.Task],
        colocated_upserts: list[database_pb2.ColocatedUpsert],
        ensure_state_types_created: list[StateTypeName],
        transaction: Optional[database_pb2.Transaction] = None,
        idempotent_mutation: Optional[database_pb2.IdempotentMutation] = None,
        sync: bool = True,
    ) -> None:
        """Store actor state and task upserts after method completion."""
        # Don't bother making an expensive call if there isn't
        # anything to be done, which may be possible for inline
        # writers that are not idempotent and haven't modified their
        # state.
        if (
            len(actor_upserts) == 0 and len(task_upserts) == 0 and
            len(colocated_upserts) == 0 and
            len(ensure_state_types_created) == 0 and transaction is None and
            idempotent_mutation is None
        ):
            return

        stub = await self._get_database_stub()

        request = database_pb2.StoreRequest(
            actor_upserts=actor_upserts,
            task_upserts=task_upserts,
            colocated_upserts=colocated_upserts,
            transaction=transaction,
            idempotent_mutation=idempotent_mutation,
            ensure_state_types_created=ensure_state_types_created,
            sync=sync,
        )

        await stub.Store(request)

    @overload
    async def find(
        self,
        state_type: StateTypeName,
        *,
        start_id: Optional[str] = None,
        exclusive: bool = False,
        limit: int = 100,
        shard_ids: list[str],
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
        shard_ids: list[str],
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
        shard_ids: list[str],
    ) -> list[StateRef]:
        """
        Find actor references by state type and ID prefix/range.

        Args:
            state_type: The state type to search for.
            start_id: Start searching from this ID (forward pagination).
            until_id: Search backwards from this ID (backward pagination).
            exclusive: If True, exclude either start_id or until_id from results.
            limit: Maximum number of results to return.
            shard_ids: List of shard IDs to search within. Only state refs
                      belonging to these shards will be returned.

        Returns:
            List of StateRef objects matching the search criteria.

        Note:
            Only one of (start_id, until_id) should be specified.
        """
        stub = await self._get_database_stub()

        request = database_pb2.FindRequest(
            state_type=state_type,
            limit=limit,
        )

        # Add shard_ids to request.
        request.shard_ids.extend(shard_ids)

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

        response: database_pb2.FindResponse = await stub.Find(request)
        return [StateRef(ref) for ref in response.state_refs]

    async def transaction_coordinator_prepared(
        self,
        transaction_id: uuid.UUID,
        transaction_coordinator_state_ref: StateRef,
        participants: Participants,
    ) -> None:
        """Called by a transaction coordinator after it has successfully
        prepared a transaction, i.e., completed the first phase of two
        phase commit. After this RPC returns we should always be able
        to tell all the transaction participants that the transaction
        has committed.
        """
        stub = await self._get_database_stub()

        await stub.TransactionCoordinatorPrepared(
            database_pb2.TransactionCoordinatorPreparedRequest(
                transaction_id=transaction_id.bytes,
                prepared_transaction_coordinator=database_pb2.
                PreparedTransactionCoordinator(
                    state_ref=transaction_coordinator_state_ref.to_str(),
                    participants=participants.to_sidecar(),
                ),
            )
        )

    async def transaction_coordinator_cleanup(
        self,
        transaction_id: uuid.UUID,
        coordinator_state_ref: Optional[StateRef],
    ) -> None:
        """Called by a transaction coordinator after all participants
        have confirmed that a transaction has been committed.
        
        Args:
            transaction_id: The transaction UUID to clean up.
            coordinator_state_ref: State ref of the coordinator. Used to determine
                                 which shard contains the transaction data.
        """
        stub = await self._get_database_stub()

        request = database_pb2.TransactionCoordinatorCleanupRequest(
            transaction_id=transaction_id.bytes,
        )
        if coordinator_state_ref is not None:
            request.coordinator_state_ref = coordinator_state_ref.to_str()

        await stub.TransactionCoordinatorCleanup(request)

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
        stub = await self._get_database_stub()

        await stub.TransactionParticipantPrepare(
            database_pb2.TransactionParticipantPrepareRequest(
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
        stub = await self._get_database_stub()

        await stub.TransactionParticipantCommit(
            database_pb2.TransactionParticipantCommitRequest(
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
        stub = await self._get_database_stub()

        await stub.TransactionParticipantAbort(
            database_pb2.TransactionParticipantAbortRequest(
                state_type=state_type, state_ref=state_ref.to_str()
            )
        )

    async def recover(
        self,
        state_tags_by_state_type: dict[StateTypeName, str],
        shard_ids: list[str],
    ) -> database_pb2.RecoverResponse:
        """Attempt to recover server state after a potential restart.
        
        Args:
            state_tags_by_state_type: Mapping from state type names to state tags.
            shard_ids: List of shard IDs to recover from. Data from all specified
                      shards will be merged into a single response.
        """
        # To deal with network transfer limits we need to stream the
        # data from the database which we then aggregate into a single
        # response.
        #
        # TODO: propagate the stream of responses and require the
        # caller to process each batch to reduce memory consumption.
        assert len(shard_ids) > 0

        stub = await self._get_database_stub()

        request = database_pb2.RecoverRequest(
            state_tags_by_state_type=cast(
                Mapping[str, str], state_tags_by_state_type
            ),
            shard_ids=shard_ids,
        )
        response = database_pb2.RecoverResponse()
        async for partial in stub.Recover(request):
            response.MergeFrom(partial)

        return response

    async def export(
        self, state_type: StateTypeName, shard_ids: list[str]
    ) -> AsyncIterator[database_pb2.ExportItem]:
        # TODO: Should be streaming.
        stub = await self._get_database_stub()
        response = await stub.Export(
            database_pb2.ExportRequest(
                state_type=state_type,
                shard_ids=shard_ids,
            ),
        )
        for item in response.items:
            yield item

    async def get_application_metadata(
        self,
    ) -> Optional[application_metadata_pb2.ApplicationMetadata]:
        """Get application metadata from persistent storage."""
        stub = await self._get_database_stub()
        response = await stub.GetApplicationMetadata(
            database_pb2.GetApplicationMetadataRequest()
        )
        return response.metadata if response.HasField('metadata') else None

    async def store_application_metadata(
        self,
        metadata: application_metadata_pb2.ApplicationMetadata,
    ) -> None:
        """Store application metadata to persistent storage."""
        stub = await self._get_database_stub()
        await stub.StoreApplicationMetadata(
            database_pb2.StoreApplicationMetadataRequest(metadata=metadata)
        )

    @classmethod
    async def _make_database_channel(cls, target: str) -> grpc.aio.Channel:
        """
        Create a gRPC channel with options specific for the database.
        """
        # Basic validation of the 'target'; this has caught bugs where
        # the target ends up being malformed.
        assert ':' in target
        host, port_str = target.rsplit(':', 1)
        port = int(port_str)
        assert 0 <= port <= 65535

        channel = grpc.aio.insecure_channel(
            target,
            options=make_retry_channel_options(
                max_send_message_length=MAX_DATABASE_GRPC_MESSAGE_LENGTH_BYTES,
                max_receive_message_length=
                MAX_DATABASE_GRPC_MESSAGE_LENGTH_BYTES,
            ),
            interceptors=aio_client_interceptors(),
        )

        # See 'respect/clients/aio/object_store_client.py' for a
        # longer explanation of why we wait for 'channel_ready()'
        # here.
        await asyncio.wait_for(channel.channel_ready(), timeout=45)
        return channel

    async def _get_database_stub(self) -> database_pb2_grpc.DatabaseStub:
        if self._stub is None:
            channel = await DatabaseClient._make_database_channel(self._target)
            self._stub = database_pb2_grpc.DatabaseStub(channel)
        return self._stub
