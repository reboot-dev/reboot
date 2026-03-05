import unittest
from chat_room.v1.chat_room_rbt import ChatRoom
from chat_room_servicer import ChatRoomServicer
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot


class TestHello(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_chat_room(self) -> None:
        await self.rbt.up(Application(servicers=[ChatRoomServicer]))

        context = self.rbt.create_external_context(name=f"test-{self.id()}")

        chat_room = ChatRoom.ref("testing-chat-room")

        await chat_room.send(context, message="Hello, World")

        response: ChatRoom.MessagesResponse = await chat_room.messages(context)
        self.assertEqual(response.messages, ["Hello, World"])

        await chat_room.send(context, message="Hello, Reboot!")
        await chat_room.send(context, message="Hello, Peace of Mind!")
        response = await chat_room.messages(context)
        self.assertEqual(
            response.messages,
            [
                "Hello, World",
                "Hello, Reboot!",
                "Hello, Peace of Mind!",
            ],
        )
