import asyncio
from datetime import datetime, timedelta
from reboot.aio.applications import Application
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import WorkflowContext, WriterContext
from reboot.aio.external import InitializeContext
from reboot.aio.workflows import until
from reboot.std.collections.v1.sorted_map import SortedMap
from tests.reboot.documentation.task_rbt import (
    OpenLaterRequest,
    PauseServiceRequest,
    PauseServiceResponse,
    ReadStateRequest,
    ReadStateResponse,
    TestTask,
    TwoEmailsRequest,
)


class TestTaskServicer(TestTask.Servicer):

    def authorizer(self):
        return allow()

    async def open_later(
        self,
        context: WriterContext,
        request: OpenLaterRequest,
    ):
        self.state.customerName = request.customerName

        now = datetime.now()
        when = now + timedelta(hours=1)

        await self.ref().schedule(
            when=when,
        ).welcome_email(context)

    @classmethod
    async def two_emails(
        cls,
        context: WorkflowContext,
        request: TwoEmailsRequest,
    ):
        now = datetime.now()

        # This task might complete before or after next.
        _ = await TestTask.ref().spawn(
            when=now + timedelta(hours=1),
        ).welcome_email(context)

        # This task might complete before or after previous.
        _ = await TestTask.ref().spawn(
            when=now + timedelta(hours=1),
        ).welcome_email(context)

    @classmethod
    async def read_state(
        cls,
        context: WorkflowContext,
        request: ReadStateRequest,
    ) -> ReadStateResponse:
        snapshot = await TestTask.ref().read(context)
        return ReadStateResponse(
            snapshot=snapshot,
        )

    @classmethod
    async def pause_service(
        cls,
        context: WorkflowContext,
        request: PauseServiceRequest,
    ) -> PauseServiceResponse:

        async def increment(state):
            state.iteration += 1

        await TestTask.ref().idempotently(
            "Finally, increment the number of iterations",
        ).write(
            context,
            increment,
        )

        # Won't execute again because same idempotency alias!
        await TestTask.ref().idempotently(
            "Finally, increment the number of iterations",
        ).write(
            context,
            increment,
        )

        async def have_messages():
            state = await TestTask.ref().read(context)
            return len(state.messages) > 0

        await until("Have messages", context, have_messages)

        async def value_is_stored():
            map = SortedMap.ref("someId")
            response = await map.get(context, key="someKey")
            return response.value if response.HasField("value") else False

        value = await until(
            "Value is stored",
            context,
            value_is_stored,
            type=bytes,
        )

        del value

        return PauseServiceResponse()


async def initialize(context: InitializeContext):
    await TestTask.create(context, "task")


# These tests are different from the other tests in this directory in that do not
# serve to test our system, instead they serve only to be examples in our
# documentation.


# Documentation examples notoriously go stale, as APIs can shift rapidly while
# docs are not pinned to individual versions. To prevent documentation drift and
# to make sure our users have a good experience, we strive to have every piece of
# code in our documentation be a tested, working piece of code that the user can
# `copy / paste` into their environment and it will just work.
async def main():
    application = Application(
        servicers=[TestTaskServicer],
    )
    await application.run()


if __name__ == '__main__':
    asyncio.run(main())
