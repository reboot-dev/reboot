#!/usr/bin/env python3

import asyncio
import logging
import os
from datetime import timedelta
from reboot.aio.applications import Application
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import (
    ReaderContext,
    TransactionContext,
    WorkflowContext,
    WriterContext,
)
from reboot.aio.external import InitializeContext
from reboot.controller.settings import ENVVAR_REBOOT_MODE
from reboot.ping.ping_api import (
    DescribeResponse,
    DoPingPeriodicallyRequest,
    DoPingPeriodicallyResponse,
    DoPingResponse,
    DoPongResponse,
    NumPingsResponse,
    NumPongsResponse,
)
from reboot.ping.ping_api_rbt import Ping, Pong

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
        servicers=[PingServicer, PongServicer],
        # We choose to not call the initialization method
        # `initialize`, to exercise that that is allowed.
        initialize=start_periodic_ping,
    )
    await application.run()


if __name__ == '__main__':
    asyncio.run(main())
