import time
from chat.v1.channel_rbt import (
    Channel,
    ChannelCreateRequest,
    ChannelCreateResponse,
    MessagesRequest,
    MessagesResponse,
    PostRequest,
    PostResponse,
)
from chat.v1.message_rbt import Message
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext, TransactionContext
from reboot.protobuf import as_str, from_str
from reboot.std.index.v1.index import Index
from reboot.std.pubsub.v1.pubsub import PubSub
from uuid import uuid4


def messages_id(state_id: str):
    return f"{state_id}-messages"


class ChannelServicer(Channel.Servicer):

    def authorizer(self):
        return allow()

    async def create(
        self,
        context: TransactionContext,
        request: ChannelCreateRequest,
    ) -> ChannelCreateResponse:
        await Index.create(
            context,
            messages_id(context.state_id),
            order=100,
        )
        return ChannelCreateResponse()

    async def post(
        self,
        context: TransactionContext,
        request: PostRequest,
    ) -> PostResponse:
        # Generate a unique ID for this message.
        message_id = str(uuid4())

        await Message.ref(message_id).edit(
            context,
            author=request.author,
            text=request.text,
        )

        await self._messages.insert(
            context,
            key=f'{round(time.time() * 1000)}',
            value=from_str(message_id),
        )

        await self._pub_sub.publish(
            context,
            topic="messages",
            value=from_str(message_id),
        )

        return PostResponse(message_id=message_id)

    async def messages(
        self,
        context: ReaderContext,
        request: MessagesRequest,
    ) -> MessagesResponse:
        response = await self._messages.reverse_range(
            context,
            limit=request.limit,
        )

        timestamps = [entry.key for entry in response.entries]
        message_ids = [as_str(entry.value) for entry in response.entries]

        responses = await Message.forall(message_ids).get(context)

        return MessagesResponse(
            messages={
                timestamps[i]: response.details
                for i, response in enumerate(responses)
            }
        )

    @property
    def _messages(self):
        return Index.ref(messages_id(self.ref().state_id))

    @property
    def _pub_sub(self):
        return PubSub.ref(f"{self.ref().state_id}-pub-sub")
