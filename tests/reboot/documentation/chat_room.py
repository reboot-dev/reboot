import unittest
from rbt.v1alpha1.errors_pb2 import StateNotConstructed
from reboot.aio.applications import Application
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext, WriterContext
from reboot.aio.external import ExternalContext
from reboot.aio.tests import Reboot
from tests.reboot.documentation.chat_room_pydantic import (
    MessagesResponse,
    SendRequest,
)
from tests.reboot.documentation.chat_room_pydantic_rbt import ChatRoom


class ChatRoomServicer(ChatRoom.Servicer):

    def authorizer(self):
        return allow()

    async def messages(
        self,
        context: ReaderContext,
    ) -> MessagesResponse:
        return MessagesResponse(messages=self.state.messages or [])

    async def send(
        self,
        context: WriterContext,
        request: SendRequest,
    ) -> None:
        self.state.messages = [*(self.state.messages or []), request.message]


async def print_messages(
    chat_room: ChatRoom.WeakReference,
    context: ExternalContext,
) -> None:
    # The docs snippet: from `async for` through `break`.
    async for response, aborted in chat_room.reactively().messages(context):
        if aborted is not None:
            # The reader raised an error, e.g., the chat room does not
            # exist yet. The read continues and yields again once the
            # state changes.
            print(f"Could not read messages: {aborted}")
            continue
        assert response is not None
        print(response.messages)
        if "Hello, World!" in response.messages:
            break


class ChatRoomTest(unittest.IsolatedAsyncioTestCase):
    """Runs the reactive read that the "Calling readers reactively"
    section of `documentation/docs/call/from_outside_your_app.mdx`
    shows, so the snippet is real and tested. The `ChatRoom` is the
    Pydantic API definition in `chat_room_pydantic.py`, which the
    React docs show."""

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(Application(servicers=[ChatRoomServicer]))

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_read_messages_reactively(self) -> None:
        context = self.rbt.create_external_context(name=self.id())
        chat_room = ChatRoom.ref("reboot-chat-room")
        await chat_room.send(context, message="Hello, World!")
        await print_messages(chat_room, context)

    async def test_read_before_the_chat_room_exists(self) -> None:
        context = self.rbt.create_external_context(name=self.id())
        chat_room = ChatRoom.ref("another-chat-room")
        responses = chat_room.reactively().messages(context)
        response, aborted = await anext(responses)
        await responses.aclose()
        self.assertIsNone(response)
        assert aborted is not None
        self.assertIsInstance(aborted.error, StateNotConstructed)


if __name__ == '__main__':
    unittest.main()
