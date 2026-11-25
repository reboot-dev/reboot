import random
from hello_legacy_grpc.v1 import greeter_pb2, greeter_pb2_grpc
from hello_legacy_grpc.v1.greeter_rbt import RebootGreeter
from reboot.aio.interceptors import LegacyGrpcContext


class ProxyGreeterServicer(greeter_pb2_grpc.ProxyGreeterServicer):

    async def Greet(
        self,
        request: greeter_pb2.GreetRequest,
        legacy_context: LegacyGrpcContext,
    ) -> greeter_pb2.GreetResponse:
        # As part of a migration, one may want to slowly ramp up traffic to the
        # new Reboot service. This proxy servicer will forward traffic to
        # either the RebootGreeter or the DeprecatedGreeter with a 50/50
        # ratio.
        context = legacy_context.external_context(
            name="Call into `RebootGreeter`"
        )
        if random.random() < 0.5:
            # Route to RebootGreeter.
            reboot_greeter = RebootGreeter.ref("my-greeter")
            return await reboot_greeter.Greet(context, name=request.name)
        else:
            # Route to DeprecatedGreeter.
            async with context.legacy_grpc_channel() as channel:
                deprecated_greeter_stub = greeter_pb2_grpc.DeprecatedGreeterStub(
                    channel
                )

                return await deprecated_greeter_stub.Greet(request)
