#!/usr/bin/env python3

import asyncio
import logging
import os
from datetime import timedelta
from reboot.aio.applications import Application
from reboot.aio.auth.authorizers import allow
from reboot.aio.auth.oauth_providers import Anonymous
from reboot.aio.contexts import (
    ReaderContext,
    TransactionContext,
    WorkflowContext,
    WriterContext,
)
from reboot.aio.external import InitializeContext
from reboot.controller.settings import ENVVAR_REBOOT_MODE
from reboot.ping.ping_api import (
    CounterEntry,
    CreateCounterRequest,
    CreateCounterResponse,
    DescribeResponse,
    DescriptionResponse,
    DoPingPeriodicallyRequest,
    DoPingPeriodicallyResponse,
    DoPingResponse,
    DoPongResponse,
    IncrementResponse,
    ListCountersResponse,
    NumPingsResponse,
    NumPongsResponse,
    ValueResponse,
    WhoAmIResponse,
)
from reboot.ping.ping_api_rbt import Counter, Ping, Pong, User

logging.basicConfig(level=logging.INFO)


def example_ping_ref(index: int) -> Ping.WeakReference:
    return Ping.ref(f"example-pinger-{index:02d}")


class PingServicer(Ping.Servicer):

    def authorizer(self):
        return allow()

    async def do_ping(
        self,
        context: TransactionContext,
    ) -> DoPingResponse:
        self.state.num_pings += 1
        # Print a log line so that tests can verify log propagation.
        print(
            f"Ping('{context.state_id}'): pinged"
            f" {self.state.num_pings} times."
        )

        # Call Pong.do_pong with the same state ID.
        pong = Pong.ref(context.state_id)
        await pong.do_pong(context)

        return DoPingResponse(num_pings=self.state.num_pings)

    @classmethod
    async def do_ping_periodically(
        cls,
        context: WorkflowContext,
        request: DoPingPeriodicallyRequest,
    ) -> DoPingPeriodicallyResponse:
        async for iteration in context.loop(
            "Ping periodically",
            interval=timedelta(seconds=request.period_seconds),
        ):
            await Ping.ref().do_ping(context)
            pings_sent = iteration + 1  # `iteration` starts at 0.
            if pings_sent >= request.num_pings:
                break

        state = await Ping.ref().read(context)
        return DoPingPeriodicallyResponse(num_pings=state.num_pings)

    async def describe(
        self,
        context: ReaderContext,
    ) -> DescribeResponse:
        return DescribeResponse(
            text=(
                f"Pinger '{context.state_id}' has pinged "
                f"{self.state.num_pings} times."
            )
        )

    async def num_pings(
        self,
        context: ReaderContext,
    ) -> NumPingsResponse:
        return NumPingsResponse(num_pings=self.state.num_pings)


class PongServicer(Pong.Servicer):

    def authorizer(self):
        return allow()

    async def do_pong(
        self,
        context: WriterContext,
    ) -> DoPongResponse:
        self.state.num_pongs += 1
        print(
            f"Pong('{context.state_id}'): ponged"
            f" {self.state.num_pongs} times."
        )
        return DoPongResponse(num_pongs=self.state.num_pongs)

    async def num_pongs(
        self,
        context: ReaderContext,
    ) -> NumPongsResponse:
        return NumPongsResponse(num_pongs=self.state.num_pongs)


class UserServicer(User.Servicer):

    async def create_counter(
        self,
        context: TransactionContext,
        request: CreateCounterRequest,
    ) -> CreateCounterResponse:
        counter, _ = await Counter.create(
            context, description=request.description
        )
        self.state.counter_ids.append(counter.state_id)
        return CreateCounterResponse(
            counter_id=counter.state_id,
        )

    async def list_counters(
        self,
        context: ReaderContext,
    ) -> ListCountersResponse:
        counters = []
        for counter_id in self.state.counter_ids:
            response = await Counter.ref(counter_id).description(context)
            counters.append(
                CounterEntry(
                    counter_id=counter_id,
                    description=response.description,
                )
            )
        return ListCountersResponse(counters=counters)

    async def whoami(self, context: ReaderContext) -> WhoAmIResponse:
        user_id = context.auth.user_id if context.auth else "unauthenticated"
        return WhoAmIResponse(user_id=user_id)


class CounterServicer(Counter.Servicer):

    def authorizer(self):
        return allow()

    async def create(
        self,
        context: WriterContext,
        request: CreateCounterRequest,
    ) -> None:
        self.state.description = request.description

    async def description(
        self,
        context: ReaderContext,
    ) -> DescriptionResponse:
        return DescriptionResponse(
            description=self.state.description,
        )

    async def increment(
        self,
        context: WriterContext,
    ) -> IncrementResponse:
        self.state.value += 1
        print(
            f"Counter('{context.state_id}'): incremented to {self.state.value} "
            f"by user '{context.auth.user_id if context.auth else None}'"
        )
        return IncrementResponse(value=self.state.value)

    async def value(
        self,
        context: ReaderContext,
    ) -> ValueResponse:
        return ValueResponse(value=self.state.value)


async def start_periodic_ping(context: InitializeContext):
    """
    Initializes a long-running 'DoPingPeriodically' task.
    """
    # Run 16 pingers, so that we can see the work of servicing these
    # pingers distribute across servers.
    for i in range(16):
        ping = example_ping_ref(i)
        # Run this task every time the application restarts, to
        # provide the developer with some activity to observe every
        # time the application changes.
        await ping.always().spawn(
            when=timedelta(seconds=10.0),
        ).do_ping_periodically(
            context,
            num_pings=6,
            period_seconds=10.0,
        )


async def main():
    # The tests in `cluster_tests.py` rely on us printing something
    # that always shows up when starting this program, even in a
    # config pod. They then need to be able to determine whether the
    # output was from a config pod or a regular pod, so we print the
    # current mode.
    print(
        "This 'ping' application is in mode: "
        f"'{os.environ.get(ENVVAR_REBOOT_MODE)}'"
    )

    application = Application(
        servicers=[
            PingServicer,
            PongServicer,
            UserServicer,
            CounterServicer,
        ],
        # We choose to not call the initialization method
        # `initialize`, to exercise that that is allowed.
        initialize=start_periodic_ping,
        oauth=Anonymous(
            # Set a short access token TTL so that most manual tests
            # with this app naturally also exercise the access token
            # refresh flow.
            access_token_ttl_seconds=30,
        ),
    )
    await application.run()


if __name__ == '__main__':
    asyncio.run(main())
