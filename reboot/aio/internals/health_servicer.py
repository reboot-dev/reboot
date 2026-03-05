import grpc
import websockets
from grpc_health.v1 import health_pb2, health_pb2_grpc
from typing import Optional


class HealthServicer(health_pb2_grpc.HealthServicer):
    """
    Custom implementation of the gRPC Health Checking Protocol.

    This servicer implements the standard health checking service defined in
    https://github.com/grpc/grpc/blob/master/doc/health-checking.md

    The service reports NOT_SERVING until `start()` is called, after which it
    reports SERVING. Future enhancements will add custom logic to verify
    in-depth health.
    """

    def __init__(self):
        super().__init__()
        self._websocket_port: Optional[int] = None

    def add_to_server(self, server: grpc.aio.Server) -> None:
        """Add this servicer to the given gRPC server."""
        health_pb2_grpc.add_HealthServicer_to_server(self, server)

    def start(self, websocket_port: int) -> None:
        """
        Mark the service as ready to serve.

        Called when the server has completed initialization and is ready to
        accept requests. After this is called, health checks will return
        SERVING status.
        """
        self._websocket_port = websocket_port

    async def Check(
        self,
        request: health_pb2.HealthCheckRequest,
        grpc_context: grpc.aio.ServicerContext,
    ) -> health_pb2.HealthCheckResponse:
        """
        Returns `SERVING` if gRPC and websocket servers are operational.

        Returns NOT_SERVING until `start()` has been called. On
        receiving a request (itself proof that the gRPC server is alive)
        each health check performs a _websocket_ health check to verify
        the React websocket server is also operational. Returns SERVING
        if the websocket health check succeeds, NOT_SERVING otherwise.
        """
        # Only report healthy if we've been started.
        if self._websocket_port is None:
            return health_pb2.HealthCheckResponse(
                status=health_pb2.HealthCheckResponse.NOT_SERVING
            )

        # Verify the websocket server is operational by making a health
        # check request.
        try:
            uri = f"ws://localhost:{self._websocket_port}/React/HealthCheck"
            async with websockets.connect(uri) as websocket:
                # Receive the health check response.
                response_bytes = await websocket.recv()
                response = health_pb2.HealthCheckResponse()
                response.ParseFromString(response_bytes)

                # Return the status from the websocket health check.
                return response
        except Exception:
            # If we can't connect to the websocket or don't get a valid
            # response, report NOT_SERVING.
            return health_pb2.HealthCheckResponse(
                status=health_pb2.HealthCheckResponse.NOT_SERVING
            )

    async def Watch(
        self,
        request: health_pb2.HealthCheckRequest,
        grpc_context: grpc.aio.ServicerContext,
    ):
        raise NotImplementedError()
