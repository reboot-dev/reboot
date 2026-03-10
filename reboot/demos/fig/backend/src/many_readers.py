import argparse
import asyncio
from fig.v1.fig_rbt import Fig, FigBoard
from reboot.aio.external import ExternalContext
from typing import Optional

FIG_BOARD_ID = 'fig-board-for-now-singleton'


async def simulate_reactive_browser_reader(port: Optional[int]):
    context = ExternalContext(
        name='harness',
        url=(
            f'http://localhost:{port}'
            if port is not None else 'http://localhost:9991'
        ),
    )

    async def reactively_print_fig_position(fig_id: str):
        fig = Fig.ref(fig_id)
        async for response in fig.reactively().get_position(context):
            print(f"{fig_id}: {response}")

    fig_board = FigBoard.ref(FIG_BOARD_ID)

    fig_tasks = {}

    async for response in fig_board.reactively().list(context):

        for fig_id in response.fig_ids:
            if fig_id not in fig_tasks:
                fig_tasks[fig_id] = asyncio.create_task(
                    reactively_print_fig_position(fig_id)
                )

        old_fig_tasks = fig_tasks

        fig_tasks = {}

        for (fig_id, fig_task) in old_fig_tasks.items():
            if fig_id not in response.fig_ids:
                fig_task.cancel()
            else:
                fig_tasks[fig_id] = fig_task


async def main(num_readers: int, port: Optional[int]):

    await asyncio.gather(
        *[simulate_reactive_browser_reader(port) for i in range(num_readers)]
    )


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--num-readers",
        type=int,
        help="the number of times we start all Fig readers for a FigBoard.",
        required=False,
    )
    parser.add_argument(
        "--port",
        type=int,
        required=False,
    )
    args = parser.parse_args()
    try:
        asyncio.run(main(args.num_readers or 10, args.port))
    except KeyboardInterrupt:
        # Don't print an exception and stack trace if the user does a
        # Ctrl-C.
        pass
        # Ctrl-C.
        pass
