# isort: skip_file
# flake8: noqa: F401

# THIS FILE IS GENERATED AND WILL BE OVERWRITTEN ON THE NEXT
# 'rbt generate' INVOCATION. DO NOT MODIFY THIS FILE DIRECTLY.
# However, feel free to copy-paste sections of this file into
# your own source files; that's what this file is here for!

from reboot.aio.contexts import (
    ReaderContext,
    WriterContext,
    WorkflowContext,
)
from datetime import timedelta
from typing import AsyncIterable
from tests.reboot.echo_rbt import (
    Echo,
    AtMostOnceWorkflowRequest,
    AtMostOnceWorkflowResponse,
    ControlLoopRequest,
    ControlLoopResponse,
    FailingWorkflowRequest,
    FailingWorkflowResponse,
    FailOnceShouldBeRetriedRequest,
    FailOnceShouldBeRetriedResponse,
    FailOnceShouldBeRetriedWorkflowRequest,
    FailOnceShouldBeRetriedWorkflowResponse,
    HangingRequest,
    HangingResponse,
    RaiseSpecifiedErrorRequest,
    RaiseSpecifiedErrorResponse,
    RaiseValueErrorRequest,
    RaiseValueErrorResponse,
    ReactiveWorkflowRequest,
    ReactiveWorkflowResponse,
    RegexStreamRequest,
    RegexStreamResponse,
    ReplayRequest,
    ReplayResponse,
    ReplyRequest,
    ReplyResponse,
    SearchAndReplaceRequest,
    SearchAndReplaceResponse,
    SpecifiedError,
    StreamRequest,
    StreamResponse,
    TooManyTasksRequest,
    TooManyTasksResponse,
    WaitForRequest,
    WaitForResponse,
    WorkflowCallingWorkflowRequest,
    WorkflowCallingWorkflowResponse,
)


class EchoServicer(Echo.singleton.Servicer):
    """
    An example of how to implement a Python servicer for the
    Echo service, using Reboot.
    You can copy-paste this servicer, or parts of it, to be the basis
    for the implementation of your own servicer.
    """

    async def reply(
        self,
        context: WriterContext,
        state: Echo.State,
        request: ReplyRequest,
    ) -> ReplyResponse:
        # TODO: implement your own business logic here!
        #
        # Update `state` as neccessary.
        #
        # state.field = ...
        #
        # return ReplyResponse()
        #
        # Read more about the writer methods in the Reboot documentation:
        # https://docs.reboot.dev/develop/implement/writers
        raise NotImplementedError

    async def replay(
        self,
        context: ReaderContext,
        state: Echo.State,
        request: ReplayRequest,
    ) -> ReplayResponse:
        # TODO: implement your own business logic here!
        #
        # Read more about the reader methods in the Reboot documentation:
        # https://docs.reboot.dev/develop/implement/readers
        raise NotImplementedError

        # TODO: fill in the response here.
        return ReplayResponse()

    async def wait_for(
        self,
        context: ReaderContext,
        states: AsyncIterable[Echo.State],
        request: WaitForRequest,
    ) -> WaitForResponse:
        # TODO: implement your own business logic here!
        #
        # Read more about the reader methods in the Reboot documentation:
        # https://docs.reboot.dev/develop/implement/readers
        raise NotImplementedError

        # TODO: receive state updates like this.
        async for state in states:
            print(state)

        # TODO: fill in the response here.
        return WaitForResponse()

    async def stream(
        self,
        context: ReaderContext,
        states: AsyncIterable[Echo.State],
        request: StreamRequest,
    ) -> AsyncIterable[StreamResponse]:
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
            yield StreamResponse()

    async def regex_stream(
        self,
        context: ReaderContext,
        states: AsyncIterable[Echo.State],
        requests: AsyncIterable[RegexStreamRequest],
    ) -> AsyncIterable[RegexStreamResponse]:
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
            yield RegexStreamResponse()

    async def search_and_replace(
        self,
        context: WriterContext,
        state: Echo.State,
        request: SearchAndReplaceRequest,
    ) -> SearchAndReplaceResponse:
        # TODO: implement your own business logic here!
        #
        # Update `state` as neccessary.
        #
        # state.field = ...
        #
        # return SearchAndReplaceResponse()
        #
        # Read more about the writer methods in the Reboot documentation:
        # https://docs.reboot.dev/develop/implement/writers
        raise NotImplementedError

    async def fail_once_should_be_retried(
        self,
        context: WriterContext,
        state: Echo.State,
        request: FailOnceShouldBeRetriedRequest,
    ) -> FailOnceShouldBeRetriedResponse:
        # TODO: implement your own business logic here!
        #
        # Update `state` as neccessary.
        #
        # state.field = ...
        #
        # return FailOnceShouldBeRetriedResponse()
        #
        # Read more about the writer methods in the Reboot documentation:
        # https://docs.reboot.dev/develop/implement/writers
        raise NotImplementedError

    @classmethod
    async def fail_once_should_be_retried_workflow(
        cls,
        context: WorkflowContext,
        request: FailOnceShouldBeRetriedWorkflowRequest,
    ) -> FailOnceShouldBeRetriedWorkflowResponse:
        # TODO: implement your own business logic here!
        # Read more about the workflow methods in the Reboot documentation:
        # https://docs.reboot.dev/develop/implement/workflows
        raise NotImplementedError

        # Here is how to create a control loop:
        # async for iteration in context.loop("Some control loop"):
        #     ...

        # TODO: fill in the response here.
        # return FailOnceShouldBeRetriedWorkflowResponse()

    async def too_many_tasks(
        self,
        context: WriterContext,
        state: Echo.State,
        request: TooManyTasksRequest,
    ) -> TooManyTasksResponse:
        # TODO: implement your own business logic here!
        #
        # Update `state` as neccessary.
        #
        # state.field = ...
        #
        # return TooManyTasksResponse()
        #
        # Read more about the writer methods in the Reboot documentation:
        # https://docs.reboot.dev/develop/implement/writers
        raise NotImplementedError

    @classmethod
    async def hanging(
        cls,
        context: WorkflowContext,
        request: HangingRequest,
    ) -> HangingResponse:
        # TODO: implement your own business logic here!
        # Read more about the workflow methods in the Reboot documentation:
        # https://docs.reboot.dev/develop/implement/workflows
        raise NotImplementedError

        # Here is how to create a control loop:
        # async for iteration in context.loop("Some control loop"):
        #     ...

        # TODO: fill in the response here.
        # return HangingResponse()

    @classmethod
    async def reactive_workflow(
        cls,
        context: WorkflowContext,
        request: ReactiveWorkflowRequest,
    ) -> ReactiveWorkflowResponse:
        # TODO: implement your own business logic here!
        # Read more about the workflow methods in the Reboot documentation:
        # https://docs.reboot.dev/develop/implement/workflows
        raise NotImplementedError

        # Here is how to create a control loop:
        # async for iteration in context.loop("Some control loop"):
        #     ...

        # TODO: fill in the response here.
        # return ReactiveWorkflowResponse()

    @classmethod
    async def control_loop(
        cls,
        context: WorkflowContext,
        request: ControlLoopRequest,
    ) -> ControlLoopResponse:
        # TODO: implement your own business logic here!
        # Read more about the workflow methods in the Reboot documentation:
        # https://docs.reboot.dev/develop/implement/workflows
        raise NotImplementedError

        # Here is how to create a control loop:
        # async for iteration in context.loop("Some control loop"):
        #     ...

        # TODO: fill in the response here.
        # return ControlLoopResponse()

    @classmethod
    async def at_most_once_workflow(
        cls,
        context: WorkflowContext,
        request: AtMostOnceWorkflowRequest,
    ) -> AtMostOnceWorkflowResponse:
        # TODO: implement your own business logic here!
        # Read more about the workflow methods in the Reboot documentation:
        # https://docs.reboot.dev/develop/implement/workflows
        raise NotImplementedError

        # Here is how to create a control loop:
        # async for iteration in context.loop("Some control loop"):
        #     ...

        # TODO: fill in the response here.
        # return AtMostOnceWorkflowResponse()

    @classmethod
    async def workflow_calling_workflow(
        cls,
        context: WorkflowContext,
        request: WorkflowCallingWorkflowRequest,
    ) -> WorkflowCallingWorkflowResponse:
        # TODO: implement your own business logic here!
        # Read more about the workflow methods in the Reboot documentation:
        # https://docs.reboot.dev/develop/implement/workflows
        raise NotImplementedError

        # Here is how to create a control loop:
        # async for iteration in context.loop("Some control loop"):
        #     ...

        # TODO: fill in the response here.
        # return WorkflowCallingWorkflowResponse()

    async def raise_value_error(
        self,
        context: WriterContext,
        state: Echo.State,
        request: RaiseValueErrorRequest,
    ) -> RaiseValueErrorResponse:
        # TODO: implement your own business logic here!
        #
        # Update `state` as neccessary.
        #
        # state.field = ...
        #
        # return RaiseValueErrorResponse()
        #
        # Read more about the writer methods in the Reboot documentation:
        # https://docs.reboot.dev/develop/implement/writers
        raise NotImplementedError

    async def raise_specified_error(
        self,
        context: WriterContext,
        state: Echo.State,
        request: RaiseSpecifiedErrorRequest,
    ) -> RaiseSpecifiedErrorResponse:
        # TODO: implement your own business logic here!
        #
        # Update `state` as neccessary.
        #
        # state.field = ...
        #
        # return RaiseSpecifiedErrorResponse()
        #
        # Read more about the writer methods in the Reboot documentation:
        # https://docs.reboot.dev/develop/implement/writers
        raise NotImplementedError

    @classmethod
    async def failing_workflow(
        cls,
        context: WorkflowContext,
        request: FailingWorkflowRequest,
    ) -> FailingWorkflowResponse:
        # TODO: implement your own business logic here!
        # Read more about the workflow methods in the Reboot documentation:
        # https://docs.reboot.dev/develop/implement/workflows
        raise NotImplementedError

        # Here is how to create a control loop:
        # async for iteration in context.loop("Some control loop"):
        #     ...

        # TODO: fill in the response here.
        # return FailingWorkflowResponse()
