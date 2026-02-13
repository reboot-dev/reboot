from chat_room.v1.chat_room_rbt import (
    ChatRoom,
    MessagesRequest,
    MessagesResponse,
    SendRequest,
    SendResponse,
)
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext, WriterContext


class ChatRoomServicer(ChatRoom.Servicer):

    def authorizer(self):
        return allow()

    async def messages(
        self,
        context: ReaderContext,
        request: MessagesRequest,
    ) -> MessagesResponse:
        return MessagesResponse(messages=self.state.messages)

    async def send(
        self,
        context: WriterContext,
        request: SendRequest,
    ) -> SendResponse:
        message = request.message
        self.state.messages.extend([message])
        return SendResponse()
