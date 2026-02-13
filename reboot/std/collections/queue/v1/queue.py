from rbt.std.collections.queue.v1.queue_rbt import (
    DequeueRequest,
    DequeueResponse,
    EmptyRequest,
    EmptyResponse,
    EnqueueRequest,
    EnqueueResponse,
    Queue,
)
from reboot.std.collections.queue.v1.uuid7 import uuid7
from reboot.std.collections.v1 import sorted_map
from reboot.std.collections.v1.sorted_map import SortedMap
from reboot.std.item.v1.item import Item
from rebootdev.aio.auth.authorizers import allow
from rebootdev.aio.contexts import (
    ReaderContext,
    TransactionContext,
    WorkflowContext,
)
from rebootdev.aio.workflows import until
from uuid import uuid4

# The number of items a bulk `Dequeue` without an `at_most` number set
# will return.
DEFAULT_BULK_COUNT = 64


class QueueServicer(Queue.Servicer):

    def authorizer(self):
        return allow()

    @property
    def _map(self):
        """
        This will work for readers, writers, and transactions, but not a
        workflow. See PR#5021 for discussion.
        """
        # By default, the proto sets it to empty string. This means we haven't
        # constructed the SortedMap.
        # Can't use `context.constructor` in calling methods (rather than empty
        # string check) because the first access point might be the workflow,
        # and workflows run with `context.constructor=False` *and* subsequent
        # transactions also run with `context.constructor=False`.
        if self.state.sorted_map_id == "":
            self.state.sorted_map_id = str(uuid4())
        return SortedMap.ref(self.state.sorted_map_id)

    async def enqueue(
        self,
        context: TransactionContext,
        request: EnqueueRequest,
    ) -> EnqueueResponse:
        """
        Enqueue Item(s) into the queue.
        """
        if sum(
            [
                request.HasField("value"),
                request.HasField("bytes"),
                request.HasField("any"),
                len(request.items) > 0,
            ]
        ) != 1:
            raise TypeError(
                "Only one of `value`, `bytes`, `any`, or `items` should be set"
            )

        items: list[Item] = request.items if len(request.items) > 0 else [
            Item(
                value=request.value if request.HasField("value") else None,
                bytes=request.bytes if request.HasField("bytes") else None,
                any=request.any if request.HasField("any") else None,
            ),
        ]

        await self._map.insert(
            context,
            entries={str(uuid7()): item.SerializeToString() for item in items},
        )

        return EnqueueResponse()

    @classmethod
    async def dequeue(
        cls,
        context: WorkflowContext,
        request: DequeueRequest,
    ) -> DequeueResponse:
        """
        Dequeues up to `at_most` items. Will block until it has at least one
        item to return.
        """

        async def have_items():
            # Check if it's empty.
            response = await Queue.ref().empty(context)

            if response.empty:
                return False

            # There are items, run a transaction to retrieve them.
            # We've already calculated `limit` from `at_most`, so use that.
            response = await Queue.ref().try_dequeue(
                context,
                bulk=request.bulk,
                at_most=(
                    request.at_most if request.HasField("at_most") else None
                ),
            )

            # Need to double check that there are items because some
            # other request might have taken the items on the queue while
            # we were fetching.
            if response == DequeueResponse():
                return False
            else:
                return response

        response = await until(
            "Have items", context, have_items, type=DequeueResponse
        )
        return response

    async def try_dequeue(
        self,
        context: TransactionContext,
        request: DequeueRequest,
    ) -> DequeueResponse:
        """
        Dequeues items. If there are no items, it will return an empty response.
        """
        # This check is needed for a couple reasons.
        # 1. `context.constructor` doesn't work here because if you call into the
        #   workflow first, that runs with `context.constructor=False` *and*
        #   subsequent transactions also run with `context.constructor=False`.
        # 2. If `range` is the first thing called on the SortedMap, we get a
        #   `StateNotConstructed` error.
        # Instead, rely on the proto setting it to empty string by default.
        # This means we haven't constructed the SortedMap.
        if self.state.sorted_map_id == "":
            return DequeueResponse()

        # SortedMap.range requires a `limit`.
        limit = 1
        if request.bulk:
            limit = (
                request.at_most
                if request.HasField("at_most") else DEFAULT_BULK_COUNT
            )

        response = await self._map.range(
            context,
            limit=limit,
        )

        # If there are none, return empty response.
        if len(response.entries) == 0:
            return DequeueResponse()

        # Format the items we will return.
        items = [Item.FromString(entry.value) for entry in response.entries]

        # Remove the entries from the underlying SortedMap.
        keys_to_remove = [entry.key for entry in response.entries]
        await self._map.remove(context, keys=keys_to_remove)

        # If it wasn't a bulk request, make it an item.
        if not request.bulk:
            assert (len(items) == 1)
            item = items[0]
            return DequeueResponse(
                value=item.value if item.HasField("value") else None,
                bytes=item.bytes if item.HasField("bytes") else None,
                any=item.any if item.HasField("any") else None,
            )
        else:
            return DequeueResponse(items=items)

    async def empty(
        self,
        context: ReaderContext,
        request: EmptyRequest,
    ) -> EmptyResponse:
        # If there is no sorted map, it's definitely empty.
        # Not a writer, so can't use `_map` which might try to set it.
        if self.state.sorted_map_id == "":
            return EmptyResponse(empty=True)

        response = await self._map.range(
            context,
            limit=1,
        )

        return EmptyResponse(empty=(len(response.entries) == 0))


def servicers():
    return [QueueServicer] + sorted_map.servicers()
