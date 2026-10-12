import logging
from google.protobuf.empty_pb2 import Empty
from hello_legacy_grpc.v1 import greeter_pb2, greeter_pb2_grpc
from hello_legacy_grpc.v1.greeter_rbt import (
    GetSalutationResponse,
    GreetRequest,
    GreetResponse,
    RebootGreeter,
)
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import (
    Context,
    ReaderContext,
    WorkflowContext,
    WriterContext,
)
from reboot.aio.workflows import at_most_once

logging.basicConfig(level=logging.INFO)


class RebootGreeterServicer(RebootGreeter.Servicer):

    def authorizer(self):
        return allow()

    async def _get_deprecated_salutation(self, context: Context) -> str:
        """Fetch a salutation from the deprecated Greeter service written in
        legacy gRPC."""
        # All legacy gRPC services hosted by Reboot can be reached via the
        # same channel.
        #
        # WARNING: Calls to legacy gRPC services will not get the same safety
        # guarantees as Reboot calls. Calls from Reboot state machines to
        # legacy services should be wrapped in Tasks if they represent
        # side-effects. See https://docs.reboot.dev/learn_more/side_effects.
        #
        # In this example, `DeprecatedGreeter`'s `GetSalutation` RPC
        # is a pure function, so it is safe to access from our context.
        async with context.legacy_grpc_channel() as channel:
            # Now that we have a channel for our legacy servicer, we can call
            # its gRPC methods in the standard gRPC fashion.
            deprecated_greeter_stub = greeter_pb2_grpc.DeprecatedGreeterStub(
                channel
            )

            salutation_response = await deprecated_greeter_stub.GetSalutation(
                Empty()
            )
            return salutation_response.salutation

    async def greet(
        self,
        context: WriterContext,
        request: GreetRequest,
    ) -> GreetResponse:
        salutation = await self._get_deprecated_salutation(context)
        self.state.num_greetings += 1

        pluralized_phrase = (
            "person has" if self.state.num_greetings == 1 else "people have"
        )
        return GreetResponse(
            message=f"{salutation}, {request.name}! "
            f"{self.state.num_greetings} {pluralized_phrase} been greeted today "
            f"by the Reboot service."
        )

    async def get_salutation(
        self,
        context: ReaderContext,
        request: Empty,
    ) -> GetSalutationResponse:
        # Imagine that this method is not yet implemented in this servicer!
        # It can call out to the deprecated gRPC servicer instead.
        salutation = await self._get_deprecated_salutation(context)
        return GetSalutationResponse(salutation=salutation)

    @classmethod
    async def initialize(
        cls,
        context: WorkflowContext,
        request: Empty,
    ):

        async def make_greetings():
            """Calls the ProxyGreeter service for a few greetings."""
            async with context.legacy_grpc_channel() as channel:
                proxy_greeter_stub = greeter_pb2_grpc.ProxyGreeterStub(channel)

                for i in range(10):
                    greet_response = await proxy_greeter_stub.Greet(
                        greeter_pb2.GreetRequest(name="legacy gRPC")
                    )
                    logging.info(
                        f"Received a greeting: '{greet_response.message}'"
                    )

        # We only want to make the greetings at-most-once.
        await at_most_once("make greetings", context, make_greetings)

        return Empty()
