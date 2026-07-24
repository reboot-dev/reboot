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
from reboot.aio.applications import Library
from reboot.aio.auth.authorizers import AuthorizerRule, allow
from reboot.aio.concurrently import concurrently
from reboot.aio.contexts import WorkflowContext, WriterContext
from reboot.aio.workflows import until
from reboot.std.collections.queue.v1 import queue
from reboot.std.collections.queue.v1.queue import QUEUE_LIBRARY_NAME
from reboot.std.item.v1.item import Item
from typing import Optional


class TopicServicer(Topic.Servicer):

    # Singleton authorizer as class variable.
    # Discussion here for singleton authorizer vs subclassing the servicer:
    # https://github.com/reboot-dev/mono/pull/5140#issuecomment-3667592432
    _authorizer: Optional[Topic.Authorizer | AuthorizerRule] = None

    def authorizer(self):
        if self._authorizer:
            return self._authorizer
        else:
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

            async def have_items() -> bool | tuple[list[str], list[Item]]:

                async def slice_items(
                    state,
                ) -> bool | tuple[list[str], list[Item]]:
                    if len(state.items) > 0:
                        items = state.items[:]
                        del state.items[:]
                        return list(state.queue_ids), items
                    return False

                return await Topic.ref().write(context, slice_items)

            queue_ids, items = await until(
                "Have items",
                context,
                have_items,
            )

            await concurrently(
                Queue.ref(queue_id).Enqueue(context, items=items)
                for queue_id in queue_ids
            )

        return BrokerResponse()


PUBSUB_LIBRARY_NAME = "reboot.std.pubsub.v1.pubsub"


class PubSubLibrary(Library):
    name = PUBSUB_LIBRARY_NAME

    def __init__(
        self,
        authorizer: Optional[Topic.Authorizer | AuthorizerRule] = None,
    ):
        TopicServicer._authorizer = authorizer

    def servicers(self):
        return [TopicServicer]

    def requirements(self):
        return [QUEUE_LIBRARY_NAME]


def servicers():
    return [TopicServicer] + queue.servicers()


def pubsub_library(
    authorizer: Optional[Topic.Authorizer | AuthorizerRule] = None
):
    return PubSubLibrary(authorizer)
