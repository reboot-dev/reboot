from hello_constructors.v1.hello_rbt import (
    CreateRequest,
    CreateResponse,
    Hello,
    MessagesRequest,
    MessagesResponse,
    SendRequest,
    SendResponse,
)
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext, WriterContext


class HelloServicer(Hello.Servicer):

    def authorizer(self):
        return allow()

    async def create(
        self,
        context: WriterContext,
        request: CreateRequest,
    ) -> CreateResponse:
        self.state.messages.extend([request.initial_message])
        return CreateResponse()

    async def messages(
        self,
        context: ReaderContext,
        request: MessagesRequest,
    ) -> MessagesResponse:
        return MessagesResponse(messages=self.state.messages)

    async def send(
        self,
        context: WriterContext,
        request: SendRequest,
    ) -> SendResponse:
        message = request.message
        self.state.messages.extend([message])
        return SendResponse()
