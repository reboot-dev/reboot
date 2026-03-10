from chat.v1.channel_rbt import Channel
from chat.v1.message_rbt import Message
from chatbot.v1.chatbot_rbt import (
    ApproveRequest,
    ApproveResponse,
    Chatbot,
    ControlLoopRequest,
    CreateRequest,
    CreateResponse,
    DenyRequest,
    DenyResponse,
    GetRequest,
    GetResponse,
    ListPostsForApprovalRequest,
    ListPostsForApprovalResponse,
    Post,
)
from langchain.chat_models import init_chat_model
from pydantic import BaseModel
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import (
    ReaderContext,
    TransactionContext,
    WorkflowContext,
    WriterContext,
)
from reboot.aio.workflows import at_most_once
from reboot.protobuf import as_str, to_json
from reboot.std.collections.queue.v1.queue import Queue
from reboot.std.index.v1.index import Index
from reboot.std.pubsub.v1.pubsub import PubSub
from uuid import uuid4


class ChatbotResponse(BaseModel):
    should_respond: bool
    response: str


llm = init_chat_model(
    "anthropic:claude-3-5-sonnet-latest",
).with_structured_output(ChatbotResponse)


class ChatbotServicer(Chatbot.Servicer):

    def authorizer(self):
        return allow()

    async def get(
        self,
        context: ReaderContext,
        request: GetRequest,
    ) -> GetResponse:
        return GetResponse(chatbot=self.state)

    async def create(
        self,
        context: TransactionContext,
        request: CreateRequest,
    ) -> CreateResponse:
        self.state.channel_id = request.channel_id
        self.state.human_in_the_loop = request.human_in_the_loop
        self.state.name = request.name
        self.state.prompt = request.prompt

        # Schedule our control loop.
        await self.ref().schedule().control_loop(
            context,
            name=request.name,
            channel_id=request.channel_id,
            prompt=request.prompt,
            human_in_the_loop=request.human_in_the_loop,
        )

        # Create our messages reactions index so folks can react to
        # our messages.
        await Index.create(
            context,
            f'{request.name}-messages-reactions',
            order=100,
        )

        return CreateResponse()

    async def list_posts_for_approval(
        self,
        context: ReaderContext,
        request: ListPostsForApprovalRequest,
    ) -> ListPostsForApprovalResponse:
        return ListPostsForApprovalResponse(
            posts=self.state.posts_for_approval,
        )

    async def approve(
        self,
        context: TransactionContext,
        request: ApproveRequest,
    ) -> ApproveResponse:
        for i in range(len(self.state.posts_for_approval)):
            post = self.state.posts_for_approval[i]
            if post.id == request.id:
                channel = Channel.ref(self.state.channel_id)
                await channel.post(context, author=post.author, text=post.text)
                del self.state.posts_for_approval[i]
                break

        # TODO: return an error if the post was never found?

        return ApproveResponse()

    async def deny(
        self,
        context: WriterContext,
        request: DenyRequest,
    ) -> DenyResponse:
        for i in range(len(self.state.posts_for_approval)):
            post = self.state.posts_for_approval[i]
            if post.id == request.id:
                del self.state.posts_for_approval[i]
                break

        return DenyResponse()

    @classmethod
    async def control_loop(
        cls,
        context: WorkflowContext,
        request: ControlLoopRequest,
    ):
        channel = Channel.ref(request.channel_id)
        pub_sub = PubSub.ref(f"{request.channel_id}-pub-sub")
        queue = Queue.ref(f"{context.state_id}-messages-queue")

        await pub_sub.subscribe(
            context,
            topic="messages",
            queue_id=queue.state_id,
        )

        async for iteration in context.loop("Control loop"):

            dequeue = await queue.dequeue(context, bulk=True)

            # Expecting a bunch of message IDs.
            message_ids = [as_str(item.value) for item in dequeue.items]

            # Get each message's "details".
            messages = [
                get.details
                for get in await Message.forall(message_ids).get(context)
            ]

            # Filter out messages from us.
            messages = [
                message for message in messages
                if message.author != request.name
            ]

            # Check if there are any messages excluding those from us.
            if len(messages) == 0:
                continue

            async def generate() -> ChatbotResponse:
                return await llm.ainvoke(
                    [
                        {
                            "role": "system",
                            "content": request.prompt,
                        }, {
                            "role": "user",
                            "content":
                                "Here are the latest messages in JSON: "
                                f"{to_json(messages)}"
                        }
                    ]
                )

            try:
                response = await at_most_once(
                    "Generate", context, generate, type=ChatbotResponse
                )

                if response.should_respond:
                    text = response.response

                    if request.human_in_the_loop:

                        async def add_post_for_approval(state):
                            state.posts_for_approval.append(
                                Post(
                                    id=str(uuid4()),
                                    author=request.name,
                                    text=text,
                                ),
                            )

                        await Chatbot.ref().write(
                            context,
                            add_post_for_approval,
                        )
                    else:
                        await channel.post(
                            context,
                            author=request.name,
                            text=text,
                        )
            except:
                import traceback
                traceback.print_exc()
                continue
