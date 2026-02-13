from chat.v1.message_rbt import (
    AddReactionRequest,
    AddReactionResponse,
    Details,
    EditRequest,
    EditResponse,
    GetRequest,
    GetResponse,
    Message,
    RemoveReactionRequest,
    RemoveReactionResponse,
)
from chat.v1.user_rbt import MessageReaction
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import (
    ReaderContext,
    TransactionContext,
    WriterContext,
)
from reboot.protobuf import pack
from reboot.std.index.v1.index import Index
from uuid7 import create as uuid7


class MessageServicer(Message.Servicer):

    def authorizer(self):
        return allow()

    async def edit(
        self,
        context: WriterContext,
        request: EditRequest,
    ) -> EditResponse:
        # We want people call this as the first function. Ensure pattern.
        if context.constructor:
            self.state.author = request.author
        else:
            assert self.state.author == request.author

        self.state.text = request.text

        return EditResponse()

    async def get(
        self,
        context: ReaderContext,
        request: GetRequest,
    ) -> GetResponse:
        return GetResponse(
            details=Details(
                id=context.state_id,
                author=self.state.author,
                text=self.state.text,
                reactions=self.state.reactions,
            )
        )

    async def add_reaction(
        self,
        context: TransactionContext,
        request: AddReactionRequest,
    ) -> AddReactionResponse:
        # Ignore if user already made reaction for `request.unicode`.
        if request.user in self.state.reactions[request.unicode].users:
            return AddReactionResponse()

        reaction_id = str(uuid7())

        snippet = ' '.join(self.state.text.split()[:3])

        if len(snippet) < len(self.state.text):
            snippet += "..."

        await self._user_messages_reactions.insert(
            context,
            key=reaction_id,
            any=pack(
                MessageReaction(
                    message_id=context.state_id,
                    unicode=request.unicode,
                    user=request.user,
                    snippet=snippet,
                ),
            ),
        )

        self.state.reactions[request.unicode].users[request.user] = reaction_id

        return AddReactionResponse()

    async def remove_reaction(
        self,
        context: TransactionContext,
        request: RemoveReactionRequest,
    ) -> RemoveReactionResponse:
        # Ignore if no reaction for `request.unicode` from user.
        if request.user not in self.state.reactions[request.unicode].users:
            return RemoveReactionResponse()

        reaction_id = self.state.reactions[request.unicode].users[request.user]

        await self._user_messages_reactions.remove(context, key=reaction_id)

        del self.state.reactions[request.unicode].users[request.user]

        # Remove if no more users have made a reaction with this unicode.
        if len(self.state.reactions[request.unicode].users) == 0:
            del self.state.reactions[request.unicode]

        return RemoveReactionResponse()

    @property
    def _user_messages_reactions(self):
        """
        Returns a reference to the `Index` holding message reactions for
        the user that authored this message.
        """
        return Index.ref(f'{self.state.author}-messages-reactions')
