import asyncio
from typing import AsyncIterator, Iterable, TypeVar

ElementT = TypeVar("ElementT")


async def cooperatively(
    elements: Iterable[ElementT]
) -> AsyncIterator[ElementT]:
    """Returns an iterator over `elements` that leaves the event loop
    free between them.

    For work that is *not* waiting on anything -- parsing, hashing,
    encoding -- and so never gives the event loop a chance of its own.
    A servicer doing such work over a collection holds its process for
    as long as the whole collection takes, and everything else it
    serves waits that long.

    `concurrently` is the wrong tool for that: it exists to overlap
    work that waits, and its tasks are scheduled together, so the loop
    drains several of them before it looks at anything else. Measured
    over twelve parses of a 45KB file, `concurrently` left the loop
    unable to answer for 24ms at a stretch (15ms even limited to one
    at a time), against 6ms here -- and cost 30% more wall-clock in
    task machinery for work that has no waiting to overlap.

        async for path in cooperatively(paths):
            index(path)          # holds the interpreter; nothing waits

    The chunk is the unit of work handed in, so the loop is left free
    exactly as often as there are elements. Make them small enough
    that one of them is a delay nobody minds.
    """
    for element in elements:
        # The whole point: `await` on something that resolves without
        # suspending never reaches the event loop, so this has to be
        # something that does.
        await asyncio.sleep(0)
        yield element
