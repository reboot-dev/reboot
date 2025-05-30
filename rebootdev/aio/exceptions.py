from typing import Optional


class InputError(Exception):
    """
    Custom exception class used to handle errors related to user input.
    """

    def __init__(
        self,
        reason: str,
        causing_exception: Optional[Exception] = None,
        stack_trace: Optional[str] = None,
    ):
        """NOTE: a "causing" exception is any exception which is _not_ also an
        `InputError`. If you have an `InputError` just propagate it
        along, but use `causing_exception` to capture the error that
        has been deemed to cause an `InputError` (e.g., a `TypeError`
        or a `ValueError`, etc).
        """
        assert (
            causing_exception is None or
            not isinstance(causing_exception, InputError)
        ), f"You already have {type(causing_exception).__name__} which is an `InputError`, just propagate that along!"

        super().__init__(reason, causing_exception, stack_trace)

        self.reason = reason
        self.causing_exception = causing_exception
        self.stack_trace = stack_trace

    def __str__(self):
        result = f"{self.reason}"

        if self.causing_exception is not None:
            result += f" (caused by {type(self.causing_exception).__name__}: {self.causing_exception})"

        return result
