import grpc.aio
import random
from google.protobuf.empty_pb2 import Empty
from hello_legacy_grpc.v1 import greeter_pb2, greeter_pb2_grpc
from reboot.aio.auth.authorizers import allow


class DeprecatedGreeterServicer(greeter_pb2_grpc.DeprecatedGreeterServicer):

    def authorizer(self):
        return allow()

    async def Greet(
        self,
        request: greeter_pb2.GreetRequest,
        context: grpc.aio.ServicerContext,
    ) -> greeter_pb2.GreetResponse:
        salutation_response = await self.GetSalutation(Empty(), context)
        return greeter_pb2.GreetResponse(
            message=f"{salutation_response.salutation}, {request.name}!"
        )

    async def GetSalutation(
        self,
        request: Empty,
        context: grpc.aio.ServicerContext,
    ) -> greeter_pb2.GetSalutationResponse:
        SALUTATIONS = ["Hello", "Hi", "Ahoy there", "Greetings", "Bonjour"]
        return greeter_pb2.GetSalutationResponse(
            salutation=random.choice(SALUTATIONS)
        )
