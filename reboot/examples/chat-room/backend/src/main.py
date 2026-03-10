import asyncio
import logging
from chat_room.v1.chat_room_rbt import ChatRoom
from chat_room_servicer import ChatRoomServicer
from reboot.aio.applications import Application
from reboot.aio.external import InitializeContext

logging.basicConfig(level=logging.INFO)

EXAMPLE_STATE_MACHINE_ID = 'reboot-chat-room'


async def initialize(context: InitializeContext):
    chat_room = ChatRoom.ref(EXAMPLE_STATE_MACHINE_ID)

    # Implicitly construct state machine upon first write.
    await chat_room.send(
        context,
        message="Hello, World!",
    )

    logging.info('👋 Hello, World? Hello, Reboot! 👋')


async def main():
    await Application(
        servicers=[ChatRoomServicer],
        initialize=initialize,
    ).run()


if __name__ == '__main__':
    asyncio.run(main())
