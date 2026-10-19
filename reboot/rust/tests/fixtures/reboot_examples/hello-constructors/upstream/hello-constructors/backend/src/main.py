import asyncio
import logging
from hello_constructors.v1.hello_rbt import Hello
from hello_servicer import HelloServicer
from reboot.aio.applications import Application
from reboot.aio.external import InitializeContext

logging.basicConfig(level=logging.INFO)

EXAMPLE_STATE_MACHINE_ID = 'reboot-hello'


async def initialize(context: InitializeContext):
    # Explicitly create the state machine.
    hello, _ = await Hello.create(
        context,
        EXAMPLE_STATE_MACHINE_ID,
        initial_message="Welcome! This message was sent by a constructor.",
    )

    # Send a message.
    await hello.send(
        context,
        message="This message was sent after construction!",
    )

    messages_response = await hello.messages(context)
    print(
        f"After initialization, the Hello messages are: {messages_response.messages}"
    )


async def main():
    application = Application(
        servicers=[HelloServicer],
        initialize=initialize,
    )

    logging.info('👋 Hello, World? Hello, Reboot! 👋')

    await application.run()


if __name__ == '__main__':
    asyncio.run(main())
