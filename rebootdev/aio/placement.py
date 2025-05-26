import asyncio
import grpc.aio
import hashlib
import traceback
from abc import ABC, abstractmethod
from dataclasses import dataclass
from log.log import get_logger
from rbt.v1alpha1 import placement_planner_pb2, placement_planner_pb2_grpc
from rebootdev.aio.aborted import is_grpc_retryable_exception
from rebootdev.aio.backoff import Backoff
from rebootdev.aio.types import (
    ApplicationId,
    ConsensusId,
    PartitionId,
    RoutableAddress,
    ServiceName,
    ShardId,
    StateRef,
    StateTypeName,
)
from rebootdev.grpc.options import make_retry_channel_options
from typing import ClassVar, Iterable, Optional

logger = get_logger(__name__)


class UnknownApplicationError(RuntimeError):
    pass


class PlacementClient(ABC):

    def __init__(self):
        self._changed = asyncio.Event()

    @abstractmethod
    def shard_for_actor(
        self,
        application_id: ApplicationId,
        state_ref: StateRef,
    ) -> ShardId:
        """
        Given an actor ID, return the ID of the shard that the actor is served
        from.

        Raises `UnknownApplicationError` if the `application_id` is not known.
        """
        raise NotImplementedError()

    @abstractmethod
    def consensus_for_shard(self, shard_id: ShardId) -> ConsensusId:
        """
        Given a shard ID, return the consensus ID that is authoritative for this
        shard. Note that the returned information may be stale.
        """
        raise NotImplementedError()

    @abstractmethod
    def address_for_consensus(
        self,
        consensus_id: ConsensusId,
    ) -> RoutableAddress:
        """
        Given a consensus ID, return the routable address of the consensus.
        """
        raise NotImplementedError()

    @abstractmethod
    def known_application_ids(self) -> Iterable[ApplicationId]:
        """
        Returns a list of known application IDs. This may not be all application
        IDs served on the cluster, but if an application ID is included in this
        list it should be possible for the current application to address that
        other application in an RPC.
        """
        raise NotImplementedError()

    @abstractmethod
    def known_service_names(
        self, application_id: ApplicationId
    ) -> list[ServiceName]:
        """
        Return a list of service names known to be served by an application.

        Raises `UnknownApplicationError` if the `application_id` is not known.
        """
        raise NotImplementedError()

    @abstractmethod
    def known_state_type_names(
        self,
        application_id: ApplicationId,
    ) -> list[StateTypeName]:
        """
        Return a list of names for state types known to be served by the given
        application.

        Raises `UnknownApplicationError` if the `application_id` is not known.
        """
        raise NotImplementedError()

    @abstractmethod
    def known_consensuses(
        self,
        application_id: ApplicationId,
    ) -> list[ConsensusId]:
        """
        Return a list of all known consensus IDs for the given application.
        """
        raise NotImplementedError()

    def _mark_changed(self):
        """
        Mark that the placement information may have changed.

        Implementations MUST call this whenever placement information changes.
        """
        self._changed.set()
        # Immediately clear, so future callers to `wait_for_change()` will block
        # again.
        self._changed.clear()

    async def wait_for_change(self):
        """
        Returns once placement information may have changed.
        """
        await self._changed.wait()

    def consensus_for_actor(
        self,
        application_id: ApplicationId,
        state_ref: StateRef,
    ) -> ConsensusId:
        """
        Return the consensus ID that is authoritative for the given actor. Note
        that the returned information may be stale.

        Raises `UnknownApplicationError` if the `application_id` is not known.
        """
        assert isinstance(state_ref, StateRef)
        shard_id = self.shard_for_actor(application_id, state_ref)
        return self.consensus_for_shard(shard_id)

    def address_for_actor(
        self,
        application_id: ApplicationId,
        state_ref: StateRef,
    ) -> RoutableAddress:
        """
        Returns the routable address of the consensus that is authoritative for
        the given actor. Note that the returned information may be stale.

        Raises `UnknownApplicationError` if the `application_id` is not known.
        """
        consensus_id = self.consensus_for_actor(application_id, state_ref)
        return self.address_for_consensus(consensus_id)

    def partition_for_consensus(
        self,
        consensus_id: ConsensusId,
    ) -> PartitionId:
        # For now, every consensus has its own partition, and partition IDs are
        # the same as the consensus ID.
        return consensus_id

    async def start(self):
        pass

    async def stop(self):
        pass

    # TODO: so far all of these methods are read-only, but in the future we'll
    #       add methods that allow consensuses to provide feedback on their
    #       current state - for example about which shards are currently loaded,
    #       which are being handed off, where future ideal split points could
    #       be, and so forth.


@dataclass
class StaticPlacementClient(PlacementClient):
    """
    A placement client that always answers the same for all queries.

    Useful (for example) in settings where there is only ever one consensus, and
    we don't want to place load on the controller by learning about this one
    consensus by making RPCs, like in the (current) Reboot Cloud.
    """
    SHARD_ID: ClassVar[ShardId] = "myself"

    application_id: ApplicationId
    consensus_id: ConsensusId
    address: str

    def shard_for_actor(
        self,
        application_id: ApplicationId,
        state_ref: StateRef,
    ) -> ShardId:
        assert application_id == self.application_id
        return self.SHARD_ID

    def consensus_for_shard(self, shard_id: ShardId) -> ConsensusId:
        return self.consensus_id

    def address_for_consensus(
        self, consensus_id: ConsensusId
    ) -> RoutableAddress:
        assert consensus_id == self.consensus_id
        return self.address

    def known_application_ids(self) -> Iterable[ApplicationId]:
        return [self.application_id]

    def known_service_names(
        self, application_id: ApplicationId
    ) -> list[ServiceName]:
        return []

    def known_state_type_names(
        self, application_id: ApplicationId
    ) -> list[StateTypeName]:
        return []

    def known_consensuses(
        self,
        application_id: ApplicationId,
    ) -> list[ConsensusId]:
        return [self.consensus_id]


# TODO: Unify with `consensuses.Shard`.
@dataclass
class ShardMapEntry:
    shard_id: ShardId
    first_key: bytes


class PlanOnlyPlacementClient(PlacementClient):
    """
    An implementation of `PlacementClient` that talks directly to the placement
    planner, and which assumes the `Plan` it receives is also how the real world
    looks. This is useful only for situations where the plan does not change; if
    the plan were to change, then this client would have correctness issues in
    the period between when the plan is updated and when the real world adjusts
    to follow the new plan.
    """

    def __init__(self, placement_planner_address: RoutableAddress):
        super().__init__()
        self._placement_planner_address = placement_planner_address

        # The shard map stored for each application will be sorted by each
        # entry's `first_key`.
        self._shard_list_by_application: dict[ApplicationId,
                                              list[ShardMapEntry]] = {}
        self._consensus_by_shard: dict[ShardId, ConsensusId] = {}
        self._address_by_consensus: dict[ConsensusId, RoutableAddress] = {}
        self._services_by_application: dict[ApplicationId,
                                            list[ServiceName]] = {}
        self._state_types_by_application: dict[ApplicationId,
                                               set[StateTypeName]] = {}

        self._control_loop_task: Optional[asyncio.Task] = None
        # Plan versions are unsigned, so all valid plans are larger.
        self._version: int = -1

    def shard_for_actor(
        self,
        application_id: ApplicationId,
        state_ref: StateRef,
    ) -> ShardId:
        shard_list = self._shard_list_by_application.get(application_id)
        if shard_list is None or len(shard_list) == 0:
            raise UnknownApplicationError(application_id)
        assert shard_list[0].first_key == b"", str(shard_list)

        state_ref_hash: bytes = hashlib.sha1(
            state_ref.components()[0].to_str().encode("utf-8"),
        ).digest()
        for entry in reversed(shard_list):
            if entry.first_key <= state_ref_hash:
                return entry.shard_id

        # This cannot happen; the first entry in the shard list has been
        # asserted to be `b""`, which is always <= any other key.
        raise RuntimeError(
            "Unexpectedly reached end of shard list while looking for key "
            f"'{state_ref_hash.hex()}'."
        )

    def consensus_for_shard(self, shard_id: ShardId) -> ConsensusId:
        return self._consensus_by_shard[shard_id]

    def address_for_consensus(
        self,
        consensus_id: ConsensusId,
    ) -> RoutableAddress:
        return self._address_by_consensus[consensus_id]

    def known_application_ids(self) -> Iterable[ApplicationId]:
        return self._services_by_application.keys()

    def known_service_names(
        self,
        application_id: ApplicationId,
    ) -> list[ServiceName]:
        known_services = self._services_by_application.get(application_id)
        if known_services is None:
            raise UnknownApplicationError(application_id)
        return known_services

    def known_state_type_names(
        self,
        application_id: ApplicationId,
    ) -> list[StateTypeName]:
        known_state_types = self._state_types_by_application.get(
            application_id
        )
        if known_state_types is None:
            raise UnknownApplicationError(application_id)
        return list(known_state_types)

    def known_consensuses(
        self,
        application_id: ApplicationId,
    ) -> list[ConsensusId]:
        return list(self._address_by_consensus.keys())

    async def wait_for_version(self, version: int):
        while self._version < version:
            await self.wait_for_change()

    async def wait_for_change(self):
        # While waiting for changes, periodically check in on the control loop
        # to make sure it hasn't crashed/stopped/[...]. If the control loop does
        # crash, the error it throws has (probably) not yet been noticed by any
        # other part of the program - any errors it throws are only bubbled up
        # outside the control loop's task when that task is awaited, which only
        # happens once somebody calls `.stop()`.
        #
        # By periodically checking in on the control loop we can see and raise
        # the control loop's error in the main process. This way, instead of
        # e.g. hanging a test until it times out (and then possibly still never
        # seeing the error that caused the problem), we get the error, and we
        # get it quickly.

        async def raise_if_done():
            while True:
                self._raise_if_done()
                await asyncio.sleep(1.0)

        # To detect crashes in the control loop that would prevent the parent's
        # `wait_for_change()` from returning, we run a second task that
        # periodically checks if the control loop has stopped and re-raises its
        # error in that case.
        raise_if_done_task = asyncio.create_task(raise_if_done())
        wait_for_change_task = asyncio.create_task(super().wait_for_change())

        done, pending = await asyncio.wait(
            {raise_if_done_task, wait_for_change_task},
            return_when=asyncio.FIRST_COMPLETED,
        )

        for task in pending:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

        for task in done:
            # Re-raise any exception that could be thrown in a task.
            task.result()

    async def _handle_plan(
        self,
        plan: placement_planner_pb2.Plan,
        consensuses: Iterable[placement_planner_pb2.Consensus],
    ):
        # We won't `await` anything in the code below, therefore we'll never
        # yield the event loop to anyone else, so replacing the following state
        # variables will be perceived as atomic.
        self._shard_list_by_application = {}
        self._consensus_by_shard = {}
        self._address_by_consensus = {}
        self._services_by_application = {}
        self._state_types_by_application = {}
        for application in plan.applications:
            new_shard_list: list[ShardMapEntry] = []
            for shard in application.shards:
                # The shard map will always be sorted by `first_key`, because the
                # placement planner sends us the shards in that order.
                assert (
                    len(new_shard_list) == 0 or
                    new_shard_list[-1].first_key < shard.range.first_key
                ), str(plan)
                new_shard_list.append(
                    ShardMapEntry(
                        shard_id=shard.id,
                        first_key=shard.range.first_key,
                    )
                )
                self._consensus_by_shard[shard.id] = shard.consensus_id
            self._shard_list_by_application[application.id] = new_shard_list

            self._services_by_application[application.id] = [
                service.full_name for service in application.services
            ]
            self._state_types_by_application[application.id] = set(
                service.state_type_full_name
                for service in application.services
            )

        for consensus in consensuses:
            self._address_by_consensus[
                consensus.id
            ] = f"{consensus.address.host}:{consensus.address.port}"

        self._version = plan.version
        self._mark_changed()

    async def _control_loop(self):
        """
        Start the process of listening to the PlacementPlanner. Runs forever,
        except in case of errors. Must be called before the public methods can
        return useful values.
        """
        async with grpc.aio.insecure_channel(
            self._placement_planner_address,
            options=make_retry_channel_options()
        ) as channel:
            stub = placement_planner_pb2_grpc.PlacementPlannerStub(channel)
            request = placement_planner_pb2.ListenForPlanRequest()
            backoff = Backoff()
            while True:
                try:
                    async for response in stub.ListenForPlan(request):
                        await self._handle_plan(
                            response.plan, response.consensuses
                        )
                except asyncio.CancelledError:
                    # That's normal course of business, we're shutting down.
                    raise
                except BaseException as exception:
                    # We expect to get disconnected from the placement planner
                    # from time to time, e.g., when it is being updated, but we
                    # don't want that error to propagate, we just want to retry.
                    if is_grpc_retryable_exception(exception):
                        await backoff()
                        continue
                    traceback.print_exc()
                    raise

    def _raise_if_done(self):
        if self._control_loop_task is None:
            raise RuntimeError(
                "PlanOnlyPlacementClient control loop was never started"
            )
        elif self._control_loop_task.done():
            exception = self._control_loop_task.exception()
            if exception is not None:
                raise RuntimeError(
                    "PlanOnlyPlacementClient control loop failed"
                ) from exception
            else:
                raise RuntimeError(
                    "PlanOnlyPlacementClient control loop has stopped"
                )

    async def start(self):
        self._control_loop_task = asyncio.create_task(
            self._control_loop(),
            name=f'self._control_loop() in {__name__}',
        )
        # Wait for the very first plan to arrive.
        # The version number starts at `-1`, as soon as the first plan arrives
        # we'll have a version number >= 0.
        await self.wait_for_version(0)

    async def stop(self):
        self._raise_if_done()
        assert self._control_loop_task is not None
        try:
            if not self._control_loop_task.done():
                self._control_loop_task.cancel()

            await self._control_loop_task
        except (asyncio.exceptions.CancelledError, Exception):
            # The control loop's gRPC connection may have raised
            # some errors due to cancellation (from us or from
            # another component) - we're done using it now, so we
            # don't actually care.
            pass


# TODO: implement a `ControlledPlacementClient` that handles transitions between
#       plans gracefully, by listening to an intermediate control plane that
#       coordinates handoffs of shards between consensuses, and so forth.
