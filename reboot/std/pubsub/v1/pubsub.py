from rbt.std.collections.queue.v1.queue_rbt import Queue
from rbt.std.pubsub.v1.pubsub_rbt import (
    BrokerRequest,
    BrokerResponse,
    PublishRequest,
    PublishResponse,
    SubscribeRequest,
    SubscribeResponse,
    Topic,
)
from reboot.std.collections.queue.v1 import queue
from reboot.std.item.v1.item import Item
from rebootdev.aio.auth.authorizers import allow
from rebootdev.aio.contexts import WorkflowContext, WriterContext
from rebootdev.aio.workflows import until


class TopicServicer(Topic.Servicer):

    def authorizer(self):
        return allow()

    async def Publish(
        self,
        context: WriterContext,
        request: PublishRequest,
    ) -> PublishResponse:
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

        items = request.items if len(request.items) > 0 else [
            Item(
                value=request.value if request.HasField("value") else None,
                bytes=request.bytes if request.HasField("bytes") else None,
                any=request.any if request.HasField("any") else None
            )
        ]

        # Add item(s) to topic.
        self.state.items.extend(items)

        # If this is a new topic, we'll need to schedule the broker.
        if not self.state.broker_started:
            await self.ref().schedule().Broker(context)
            self.state.broker_started = True

        return PublishResponse()

    async def Subscribe(
        self,
        context: WriterContext,
        request: SubscribeRequest,
    ) -> SubscribeResponse:
        # Add subscriber to topic.
        #
        self.state.queue_ids.append(request.queue_id)

        # If this is a new topic, we'll need to schedule the broker.
        if not self.state.broker_started:
            await self.ref().schedule().Broker(context)
            self.state.broker_started = True

        return SubscribeResponse()

    @classmethod
    async def Broker(
        cls,
        context: WorkflowContext,
        request: BrokerRequest,
    ) -> BrokerResponse:

        async for _ in context.loop("Broker"):

            async def have_items():

                async def slice_items(state):
                    if len(state.items) > 0:
                        items = state.items[:]
                        del state.items[:]
                        return list(state.queue_ids), items
                    return False

                return await Topic.ref().write(
                    context, slice_items, type=tuple
                )

            queue_ids, items = await until(
                "Have items",
                context,
                have_items,
                type=tuple,
            )

            await Queue.forall(queue_ids).Enqueue(context, items=items)

        return BrokerResponse()


def servicers():
    return [TopicServicer] + queue.servicers()
