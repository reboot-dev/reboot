import unittest
import uuid
from reboot.aio.applications import Application
from reboot.aio.external import ExternalContext
from reboot.aio.tests import Reboot
from tests.reboot.documentation.chat_room_rbt import ChatRoom
from tests.reboot.documentation.chat_room_servicer import ChatRoomServicer


# Validates the snippets used in
# `documentation/docs/learn_more/call/from_outside_your_app.mdx`.
class TestChatRoom(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_send_from_outside(self) -> None:
        await self.rbt.up(Application(servicers=[ChatRoomServicer]))

        # The URL of the application, e.g., "http://localhost:9991".
        url = self.rbt.url()
        id = "my-chat-room"

        context = ExternalContext(
            name="send message",
            url=url,
        )

        chat_room = ChatRoom.ref(id)

        response = await chat_room.send(context, message="Hello, World!")

        del response

        messages = (await chat_room.messages(context)).messages
        self.assertEqual(list(messages), ["Hello, World!"])

        context = ExternalContext(
            name="send message",
            url=url,
            idempotency_seed=uuid.UUID("123e4567-e89b-12d3-a456-426614174000"),
        )

        chat_room = ChatRoom.ref(id)

        await chat_room.send(context, message="Hello, again!")

        messages = (await chat_room.messages(context)).messages
        self.assertEqual(
            list(messages),
            ["Hello, World!", "Hello, again!"],
        )


if __name__ == '__main__':
    unittest.main()
