import grpc.aio
import time
from grpc_health.v1 import health_pb2, health_pb2_grpc
from rebootdev.aio.backoff import Backoff
from rebootdev.ssl.localhost import LOCALHOST_CRT_DATA
from typing import Callable, Optional

MAX_HEALTH_CHECK_BACKOFF_SECONDS = 5
HEALTH_CHECK_TIMEOUT_SECONDS = 180


async def do_health_check(
    application_url: str,
    application_id: Optional[str] = None,
    log_function: Callable[[str], None] = print,
    max_backoff_seconds: int = MAX_HEALTH_CHECK_BACKOFF_SECONDS,
    timeout_seconds: int = HEALTH_CHECK_TIMEOUT_SECONDS,
):
    """Perform health check with exponential backoff."""
    backoff = Backoff(max_backoff_seconds=max_backoff_seconds)
    start_time = time.time()

    app_identifier = None
    if application_id is not None:
        app_identifier = f"application '{application_id}'"
    else:
        app_identifier = f"application at {application_url}"

    while True:
        # Starting with a little backoff doesn't hurt (we don't expect the
        # app to be ready immediately), and simplifies the retry logic.
        await backoff()

        if time.time() - start_time > timeout_seconds:
            raise TimeoutError(
                f"Timed out waiting for {app_identifier} to become healthy."
            )

        if application_url.startswith("https://"):
            # We always use a dev certificate for TLS integration tests.
            assert 'dev.localhost.direct' in application_url
            channel = grpc.aio.secure_channel(
                application_url.removeprefix("https://"),
                grpc.ssl_channel_credentials(
                    root_certificates=LOCALHOST_CRT_DATA,
                ),
            )
        else:
            assert application_url.startswith("http://")
            channel = grpc.aio.insecure_channel(
                application_url.removeprefix("http://")
            )

        stub = health_pb2_grpc.HealthStub(channel)
        request = health_pb2.HealthCheckRequest()
        try:
            response = await stub.Check(request)
            if response.status != health_pb2.HealthCheckResponse.SERVING:
                continue
            log_function(f"{app_identifier.capitalize()} is ready!")
            break
        except grpc.aio.AioRpcError:
            log_function(f"{app_identifier.capitalize()} is not ready yet...")
            continue
        finally:
            await channel.close()
