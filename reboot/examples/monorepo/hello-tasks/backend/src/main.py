import asyncio
import logging
from hello_servicer import HelloServicer
from hello_tasks.v1.hello_rbt import Hello
from reboot.aio.applications import Application
from reboot.aio.external import InitializeContext

logging.basicConfig(level=logging.INFO)

EXAMPLE_STATE_MACHINE_ID = 'reboot-hello'


async def initialize(context: InitializeContext):
    hello = Hello.ref(EXAMPLE_STATE_MACHINE_ID)

    logging.info("📬 Sending initial message if it isn't already...")

    send_response = await hello.send(
        context,
        message="Hello, World!",
    )

    logging.info("💌 Ensuring initial message was sent!")

    warning_response = await Hello.WarningTask.retrieve(
        context,
        task_id=send_response.task_id,
    )

    logging.info("⏱ Ensuring initial message was erased...")

    await Hello.EraseTask.retrieve(
        context,
        task_id=warning_response.task_id,
    )

    logging.info("🗑 Confirmed message erased.")


async def main():
    await Application(
        servicers=[HelloServicer],
        initialize=initialize,
    ).run()


if __name__ == '__main__':
    asyncio.run(main())
