from chat.v1.user_rbt import (
    AddChatbotRequest,
    AddChatbotResponse,
    AddRequest,
    AddResponse,
    CreateRequest,
    CreateResponse,
    ListChatbotsRequest,
    ListChatbotsResponse,
    ListRequest,
    ListResponse,
    MessageReaction,
    MessagesReactionsRequest,
    MessagesReactionsResponse,
    User,
    Users,
)
from chatbot.v1.chatbot_rbt import Chatbot
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import (
    ReaderContext,
    TransactionContext,
    WriterContext,
)
from reboot.protobuf import unpack
from reboot.std.index.v1.index import Index

USERS_SINGLETON = "(singleton)"


class UsersServicer(Users.Servicer):

    def authorizer(self):
        return allow()

    async def add(
        self,
        context: WriterContext,
        request: AddRequest,
    ) -> AddResponse:
        self.state.users.append(request.user)
        return AddResponse()

    async def list(
        self,
        context: ReaderContext,
        request: ListRequest,
    ) -> ListResponse:
        return ListResponse(users=self.state.users)


class UserServicer(User.Servicer):

    def authorizer(self):
        return allow()

    async def create(
        self,
        context: TransactionContext,
        request: CreateRequest,
    ) -> CreateResponse:
        if context.constructor:
            users = Users.ref(USERS_SINGLETON)
            await users.add(context, user=context.state_id)
            await Index.create(
                context,
                self._messages_reactions.state_id,
                order=100,
            )

        return CreateResponse()

    async def messages_reactions(
        self,
        context: ReaderContext,
        request: MessagesReactionsRequest,
    ):
        # Fetch all reactions to user's messages.
        response = await self._messages_reactions.reverse_range(
            context,
            limit=request.limit,
        )

        reactions = {
            entry.key: unpack(entry.any, MessageReaction)
            for entry in response.entries
        }

        return MessagesReactionsResponse(reactions=reactions)

    async def add_chatbot(
        self,
        context: TransactionContext,
        request: AddChatbotRequest,
    ) -> AddChatbotResponse:

        chatbot, _ = await Chatbot.create(
            context,
            name=request.name,
            channel_id=request.channel_id,
            prompt=request.prompt,
            human_in_the_loop=request.human_in_the_loop,
        )

        self.state.chatbot_ids.append(chatbot.state_id)

        return AddChatbotResponse()

    async def list_chatbots(
        self,
        context: ReaderContext,
        request: ListChatbotsRequest,
    ) -> ListChatbotsResponse:
        return ListChatbotsResponse(chatbot_ids=self.state.chatbot_ids)

    @property
    def _messages_reactions(self):
        return Index.ref(f'{self.ref().state_id}-messages-reactions')
