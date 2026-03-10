import asyncio
import random


class Backoff:
    """Helper class for performing exponential backoff.

       Implementation of backoff borrowed from:
       https://github.com/grpc/proposal/blob/master/A6-client-retries.md#exponential-backoff
    """

    def __init__(
        self,
        *,
        initial_backoff_seconds=1,
        max_backoff_seconds=30,
        backoff_multiplier=2,
    ):
        self._initial_backoff_seconds = initial_backoff_seconds
        self._max_backoff_seconds = max_backoff_seconds
        self._backoff_multiplier = backoff_multiplier

        self._retry_attempts = 0

        self._next_backoff_seconds = 1.0

    def calculate_next_backoff(self) -> None:
        self._next_backoff_seconds = random.uniform(
            0,
            min(
                self._initial_backoff_seconds *
                (self._backoff_multiplier**(self._retry_attempts - 1)),
                self._max_backoff_seconds
            )
        )

    @property
    def next_backoff_seconds(self) -> float:
        return self._next_backoff_seconds

    def clear(self) -> None:
        self._retry_attempts = 0

    async def __call__(self):

        await asyncio.sleep(self._next_backoff_seconds)

        self._retry_attempts += 1

        self.calculate_next_backoff()
