# isort: skip_file
# flake8: noqa: F401

# THIS FILE IS GENERATED AND WILL BE OVERWRITTEN ON THE NEXT
# 'rbt generate' INVOCATION. DO NOT MODIFY THIS FILE DIRECTLY.
# However, feel free to copy-paste sections of this file into
# your own source files; that's what this file is here for!

from reboot.aio.contexts import (
    ReaderContext,
    WriterContext,
    TransactionContext,
    WorkflowContext,
)
from datetime import timedelta
from typing import AsyncIterable
from tests.reboot.general_rbt import (
    General,
    GeneralError,
    GeneralRequest,
    GeneralResponse,
)


class GeneralServicer(General.singleton.Servicer):
    """
    An example of how to implement a Python servicer for the
    General service, using Reboot.
    You can copy-paste this servicer, or parts of it, to be the basis
    for the implementation of your own servicer.
    """

    async def constructor_transaction(
        self,
        context: TransactionContext,
        state: General.State,
        request: GeneralRequest,
    ) -> GeneralResponse:
        # TODO: implement your own business logic here!
        #
        # Update `state` as neccessary.
        #
        # state.field = ...
        #
        # return GeneralResponse()
        #
        # Read more about the transaction methods in the Reboot documentation:
        # https://docs.reboot.dev/develop/implement/transactions
        raise NotImplementedError

    async def constructor_writer(
        self,
        context: WriterContext,
        state: General.State,
        request: GeneralRequest,
    ) -> GeneralResponse:
        # TODO: implement your own business logic here!
        #
        # Update `state` as neccessary.
        #
        # state.field = ...
        #
        # return GeneralResponse()
        #
        # Read more about the writer methods in the Reboot documentation:
        # https://docs.reboot.dev/develop/implement/writers
        raise NotImplementedError

    async def reader(
        self,
        context: ReaderContext,
        state: General.State,
        request: GeneralRequest,
    ) -> GeneralResponse:
        # TODO: implement your own business logic here!
        #
        # Read more about the reader methods in the Reboot documentation:
        # https://docs.reboot.dev/develop/implement/readers
        raise NotImplementedError

        # TODO: fill in the response here.
        return GeneralResponse()

    async def writer(
        self,
        context: WriterContext,
        state: General.State,
        request: GeneralRequest,
    ) -> GeneralResponse:
        # TODO: implement your own business logic here!
        #
        # Update `state` as neccessary.
        #
        # state.field = ...
        #
        # return GeneralResponse()
        #
        # Read more about the writer methods in the Reboot documentation:
        # https://docs.reboot.dev/develop/implement/writers
        raise NotImplementedError

    async def transaction(
        self,
        context: TransactionContext,
        state: General.State,
        request: GeneralRequest,
    ) -> GeneralResponse:
        # TODO: implement your own business logic here!
        #
        # Update `state` as neccessary.
        #
        # state.field = ...
        #
        # return GeneralResponse()
        #
        # Read more about the transaction methods in the Reboot documentation:
        # https://docs.reboot.dev/develop/implement/transactions
        raise NotImplementedError

    @classmethod
    async def workflow(
        cls,
        context: WorkflowContext,
        request: GeneralRequest,
    ) -> GeneralResponse:
        # TODO: implement your own business logic here!
        # Read more about the workflow methods in the Reboot documentation:
        # https://docs.reboot.dev/develop/implement/workflows
        raise NotImplementedError

        # Here is how to create a control loop:
        # async for iteration in context.loop("Some control loop"):
        #     ...

        # TODO: fill in the response here.
        # return GeneralResponse()

    @classmethod
    async def second_workflow(
        cls,
        context: WorkflowContext,
        request: GeneralRequest,
    ) -> GeneralResponse:
        # TODO: implement your own business logic here!
        # Read more about the workflow methods in the Reboot documentation:
        # https://docs.reboot.dev/develop/implement/workflows
        raise NotImplementedError

        # Here is how to create a control loop:
        # async for iteration in context.loop("Some control loop"):
        #     ...

        # TODO: fill in the response here.
        # return GeneralResponse()

    async def server_streaming_reader(
        self,
        context: ReaderContext,
        states: AsyncIterable[General.State],
        request: GeneralRequest,
    ) -> AsyncIterable[GeneralResponse]:
        # TODO: implement your own business logic here!
        #
        # Read more about the reader methods in the Reboot documentation:
        # https://docs.reboot.dev/develop/implement/readers
        raise NotImplementedError

        # TODO: receive state updates like this.
        async for state in states:
            print(state)

        # TODO: then stream responses back to the client.
        for i in range(10):
            # TODO: fill in each response here.
            yield GeneralResponse()

    async def client_streaming_reader(
        self,
        context: ReaderContext,
        states: AsyncIterable[General.State],
        requests: AsyncIterable[GeneralRequest],
    ) -> GeneralResponse:
        # TODO: implement your own business logic here!
        #
        # Read more about the reader methods in the Reboot documentation:
        # https://docs.reboot.dev/develop/implement/readers
        raise NotImplementedError

        # TODO: receive state updates like this.
        async for state in states:
            print(state)

        # TODO: receive streaming requests like this.
        async for request in requests:
            print(request)

        # TODO: fill in the response here.
        return GeneralResponse()

    async def bidirectional_streaming_reader(
        self,
        context: ReaderContext,
        states: AsyncIterable[General.State],
        requests: AsyncIterable[GeneralRequest],
    ) -> AsyncIterable[GeneralResponse]:
        # TODO: implement your own business logic here!
        #
        # Read more about the reader methods in the Reboot documentation:
        # https://docs.reboot.dev/develop/implement/readers
        raise NotImplementedError

        # TODO: receive state updates like this.
        async for state in states:
            print(state)

        # TODO: receive streaming requests like this.
        async for request in requests:
            print(request)

        # TODO: then stream responses back to the client.
        for i in range(10):
            # TODO: fill in each response here.
            yield GeneralResponse()
