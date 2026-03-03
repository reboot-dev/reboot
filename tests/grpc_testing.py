"""Helper functions for tests that use gRPC."""

from reboot.grpc.options import make_retry_channel_options
from typing import Any, Optional, Sequence, Tuple


def make_tests_retry_channel_options(
    *,
    service: str = '',
    method: str = '',
    authority: Optional[str] = None,
) -> Sequence[Tuple[str, Any]]:
    """Helper for creating a "retry channel options" that uses an extra
    large backoff multiplier to mitigate for the time it takes to
    bring up Kubernetes pods on our testing infrastructure which tends
    to be resource constrained and thus slow.

    """
    return make_retry_channel_options(
        service=service,
        method=method,
        backoff_multiplier=5,
        authority=authority,
    )
