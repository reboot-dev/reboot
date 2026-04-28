import asyncio
import re
import uuid
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext, WorkflowContext, WriterContext
from reboot.aio.internals.tasks_dispatcher import DISPATCHED_TASKS_LIMIT
from reboot.aio.workflows import (
    AtMostOnceFailedBeforeCompleting,
    at_least_once_per_workflow,
    at_most_once,
    until,
)
from tests.reboot import echo_rbt
from tests.reboot.echo_servicer import Echo
from typing import AsyncIterable

# To make the test flow be clear and to avoid flakes we make the
# `Raise[Any]Error` methods hang after the first retry, so the amount of
# retries will be always defined as 1.
retry_budget = asyncio.Semaphore(1)


# To test our boilerplate code generator, instead of inheriting from
# `echo_rbt.Echo.Servicer` like a user normally would, we inherit from the
# boilerplate code generated into `echo_servicer.EchoServicer`. This is
# functionally insignificant, since the boilerplate `EchoServicer` doesn't add
# any functionality to the `Echo.Servicer` but merely summarizes it in a
# separate file, but from a testing perspective it helps ensure that the
# boilerplate code passes type checks and is correct.
class MyEchoServicer(Echo.singleton.Servicer):
    """Implementation of 'Echo' for use in tests."""

    _fail_once_should_be_retried_workflow_has_failed: bool = False
    _at_most_once_workflow_raised_some_exception: bool = False

    def authorizer(self):
        return allow()

    async def Reply(
        self,
        context: WriterContext,
        state: Echo.State,
        request: echo_rbt.ReplyRequest,
    ) -> echo_rbt.ReplyResponse:
        """Reply with an "echo" of the message in the request."""
        # Invariant within testing is that if we call `Reply` and
        # there aren't any messages yet than we must be constructing.
        assert (
            (context.constructor and len(state.messages) == 0) or
            (not context.constructor and len(state.messages) > 0)
        )

        # Ensure that we can't call or schedule another writer!
        #
        # NOTE: we are using `type: ignore` below so that we can
        # get past mypy and actually test what happens at runtime.
        try:
            await Echo.ref(
                str(uuid.uuid4()),
            ).Reply(context)  # type: ignore[arg-type, call-overload]
        except TypeError as error:
            assert (
                "reboot.aio.contexts.WriterContext is not an "
                "instance or subclass of one of the expected type(s): "
                "['reboot.aio.contexts.TransactionContext', "
                "'reboot.aio.contexts.WorkflowContext', "
                "'reboot.aio.external.ExternalContext']"
            ) in str(error)
        else:
            raise Exception('Should not be able to call another writer!')

        try:
            await Echo.ref(
                str(uuid.uuid4()),
            ).schedule().Reply(
                context
            )  # type: ignore[arg-type, call-overload]
        except TypeError as error:
            assert (
                "reboot.aio.contexts.WriterContext is not an "
                "instance or subclass of one of the expected type(s): "
                "['reboot.aio.contexts.TransactionContext']"
            ) in str(error)
        else:
            raise Exception('Should not be able to schedule another writer!')

        state.messages.append(request.message)

        return echo_rbt.ReplyResponse(message=request.message)

    async def Replay(
        self,
        context: ReaderContext,
        state: Echo.State,
        request: echo_rbt.ReplayRequest,
    ) -> echo_rbt.ReplayResponse:
        """Replays all of the messages that have been echo'ed."""
        return echo_rbt.ReplayResponse(messages=state.messages)

    async def WaitFor(
        self,
        context: ReaderContext,
        states: AsyncIterable[Echo.State],
        request: echo_rbt.WaitForRequest,
    ) -> echo_rbt.WaitForResponse:
        """Waits for a specific message to have been echo'ed."""
        async for state in states:
            if request.message in state.messages:
                return echo_rbt.WaitForResponse()
        raise RuntimeError(f"Message '{request.message}' was never echo'ed!")

    async def Stream(
        self,
        context: ReaderContext,
        states: AsyncIterable[Echo.State],
        request: echo_rbt.StreamRequest,
    ) -> AsyncIterable[echo_rbt.StreamResponse]:
        """Streams each message as it gets echo'ed."""
        index = 0
        async for state in states:
            for i in range(index, len(state.messages)):
                yield echo_rbt.StreamResponse(message=state.messages[i])
            index = len(state.messages)

    # NOTE: using a helper class so that we can read and write through
    # a reference to the regex in multiple coroutines.
    #
    # This also makes it easy to create a mock in tests that can track
    # when the value gets updated.
    class Regex:

        def __init__(self, value: str):
            self.value = value

        def update(self, value: str):
            self.value = value

    async def RegexStream(
        self,
        context: ReaderContext,
        states: AsyncIterable[Echo.State],
        requests: AsyncIterable[echo_rbt.RegexStreamRequest],
    ) -> AsyncIterable[echo_rbt.RegexStreamResponse]:
        """Streams each message as it gets echo'ed if it matches a regex."""
        regex = MyEchoServicer.Regex(r'.*')

        async def update_regex():
            async for request in requests:
                regex.update(request.regex)

        _ = asyncio.create_task(update_regex())

        index = 0
        async for state in states:
            for i in range(index, len(state.messages)):
                if re.search(regex.value, state.messages[i]) is not None:
                    yield echo_rbt.RegexStreamResponse(
                        message=state.messages[i]
                    )
            index = len(state.messages)

    async def SearchAndReplace(
        self,
        context: WriterContext,
        state: Echo.State,
        request: echo_rbt.SearchAndReplaceRequest,
    ) -> echo_rbt.SearchAndReplaceResponse:
        """Performs the search and replace task."""
        replacements = 0
        for i in range(len(state.messages)):
            replacements += state.messages[i].count(request.search)
            state.messages[i] = state.messages[i].replace(
                request.search, request.replace
            )

        return echo_rbt.SearchAndReplaceResponse(replacements=replacements)

    async def FailOnceShouldBeRetried(
        self,
        context: WriterContext,
        state: Echo.State,
        request: echo_rbt.FailOnceShouldBeRetriedRequest,
    ) -> echo_rbt.FailOnceShouldBeRetriedResponse:
        """Creates a task that will fail and should be retried."""
        fail_once_should_be_retried_task_id = (
            await self.ref().schedule().FailOnceShouldBeRetriedWorkflow(
                context, message=request.message
            )
        )

        # When we dispatch the task it should fail once!
        assert not self._fail_once_should_be_retried_workflow_has_failed

        return echo_rbt.FailOnceShouldBeRetriedResponse(
            task_id=fail_once_should_be_retried_task_id
        )

    @classmethod
    async def FailOnceShouldBeRetriedWorkflow(
        cls,
        context: WorkflowContext,
        request: echo_rbt.FailOnceShouldBeRetriedWorkflowRequest,
    ) -> echo_rbt.FailOnceShouldBeRetriedWorkflowResponse:
        """Tests that a task can raise and will be retried!"""
        if not cls._fail_once_should_be_retried_workflow_has_failed:
            cls._fail_once_should_be_retried_workflow_has_failed = True
            raise RuntimeError('Failing once!')

        return echo_rbt.FailOnceShouldBeRetriedWorkflowResponse(
            message=request.message
        )

    async def TooManyTasks(
        self,
        context: WriterContext,
        state: Echo.State,
        request: echo_rbt.TooManyTasksRequest,
    ) -> echo_rbt.TooManyTasksResponse:
        """Tests that we can't create too many tasks!"""
        for _ in range(0, DISPATCHED_TASKS_LIMIT + 1):
            await self.ref().schedule().FailOnceShouldBeRetriedWorkflow(
                context,
            )

        return echo_rbt.TooManyTasksResponse()

    @classmethod
    async def Hanging(
        cls,
        context: WorkflowContext,
        request: echo_rbt.HangingRequest,
    ) -> echo_rbt.HangingResponse:
        """Hangs indefinitely to test task restarts."""
        event = asyncio.Event()
        await event.wait()
        raise Exception('Should never get here!')

    @classmethod
    async def ReactiveWorkflow(
        cls,
        context: WorkflowContext,
        request: echo_rbt.ReactiveWorkflowRequest,
    ) -> echo_rbt.ReactiveWorkflowResponse:
        """A workflow task that trades messages back and forth with the test
        that is calling it in order to demonstrate retrying
        reactively.
        """
        # First test that we can call into a different `Echo`
        # explicitly using `.per_workflow()`, but only once.
        other = Echo.ref('other')
        await other.per_workflow().Reply(context, message='Per workflow')
        response = await other.Replay(context)
        assert response.messages == ['Per workflow']
        try:
            await other.per_workflow().Reply(context, message='Per workflow')
        except ValueError as error:
            assert (
                "To call 'tests.reboot.EchoMethods.Reply' "
                "of 'other' more than once using the same context an "
                "idempotency alias or key must be specified" in str(error)
            )
        else:
            raise Exception('Expecting exception!')

        # Always try and idempotently make this call, our test brings
        # the servicer down/up after waiting for this message so we
        # can test idempotency aliases across recovery.
        await Echo.ref().per_workflow("Reply 'start'").Reply(
            context,
            message='Reactive workflow task started',
        )

        VALUE = "Hello, value!"

        # NOTE: we're returning a non-boolean value from `until()` to
        # test that feature.
        async def number_of_messages_eq(n) -> str | bool:
            state = await Echo.ref().read(context)
            return VALUE if len(state.messages) == n else False

        async def messages_eq_3() -> str | bool:
            return await number_of_messages_eq(3)

        value = await until(
            'Number of messages equals 3',
            context,
            messages_eq_3,
        )

        assert value == VALUE

        await Echo.ref().per_workflow("Reply 'down/up'").Reply(
            context,
            message='Reactive workflow task down/up',
        )

        async def messages_eq_4() -> str | bool:
            return await number_of_messages_eq(4)

        value = await until(
            'Number of messages equals 4',
            context,
            messages_eq_4,
        )

        assert value == VALUE

        return echo_rbt.ReactiveWorkflowResponse()

    @classmethod
    async def ControlLoop(
        cls,
        context: WorkflowContext,
        request: echo_rbt.ControlLoopRequest,
    ) -> echo_rbt.ControlLoopResponse:
        """A workflow control loop that trades messages back and forth with
        the test that is calling it in order to demonstrate looping
        and retrying reactively.
        """
        async for iteration in context.loop("ControlLoop"):
            assert iteration <= 1, iteration
            read_state_run = False

            async def read_state() -> Echo.State:
                nonlocal read_state_run
                read_state_run = True
                return await Echo.ref().read(context)

            # We read the state and memoize it the first time so that on
            # subsequent iterations of this control loop (or more
            # generally on subsequent retries of a workflow) we'll always
            # return the state when the workflow started.
            #
            # NOTE: we could also do:
            #
            # state_the_first_time = await self.state.per_workflow().read(context)
            #
            # But we specifically want to test that doing
            # `self.state.read(context)` within a memoized block precludes
            # subsequent reads unless they have an explicit idempotency
            # alias.
            state_the_first_time = await at_least_once_per_workflow(
                'Read state the first time',
                context,
                read_state,
            )

            assert state_the_first_time.messages == ['Test started']

            # Test that reading without an explicit alias we'll get an
            # error that one is necessary. This is only relevant when we've
            # actually run the `read_state` memoized block above.
            if read_state_run:
                try:
                    await Echo.ref().read(context)
                except ValueError as error:
                    assert (
                        "To call inline reader of 'tests.reboot.Echo' of 'test-id' "
                        "more than once using the same context an idempotency alias "
                        "or key must be specified" in str(error)
                    )
                else:
                    raise Exception('Expecting exception!')

            # Test that we can call into a different `Echo` without
            # explicitly using `.idempotently()` and that it happens on
            # each iteration via `.per_iteration()` by default.
            other = Echo.ref('other')
            await other.Reply(context, message=f'#{iteration}')
            response = await other.Replay(context)
            if iteration == 0:
                assert response.messages == ['#0']
            else:
                assert response.messages == ['#0', '#1'], \
                    f"Expected ['#0', '#1'] but got {response.messages}"

            # Test that without an explicit alias passed via
            # `other.per_workflow*()` or `other.idempotently()` we'll get
            # an error that one is necessary.
            try:
                await other.Reply(context, message=f'#{iteration}')
            except ValueError as error:
                assert (
                    "To call 'tests.reboot.EchoMethods.Reply' "
                    "of 'other' more than once using the same context an "
                    "idempotency alias or key must be specified" in str(error)
                )
            else:
                raise Exception('Expecting exception!')

            # Always try and idempotently perform this inline write, our
            # test brings the servicer down/up after waiting for this
            # message so we can test idempotency aliases across recovery
            # _and_ across iterations.
            async def add_message(state: Echo.State) -> int:
                state.messages.append(
                    'Control loop workflow task -- each iteration'
                )
                return iteration

            result = await Echo.ref().per_iteration('Add message').write(
                context,
                add_message,
            )

            assert result == iteration

            async def has_message():
                state = await Echo.ref().always().read(context)
                if 'Test after trigger' not in state.messages:
                    await Echo.ref().per_workflow('Trigger').Reply(
                        context,
                        message='Control loop workflow task -- trigger',
                    )
                    return False
                return True

            # Reactively retry until we've gotten a message from the test.
            await until(
                "'Test after trigger' not in state.messages",
                context,
                has_message,
            )

            if iteration == 0:
                continue

            return echo_rbt.ControlLoopResponse()

        raise AssertionError("unreachable")

    @classmethod
    async def AtMostOnceWorkflow(
        cls,
        context: WorkflowContext,
        request: echo_rbt.AtMostOnceWorkflowRequest,
    ) -> echo_rbt.AtMostOnceWorkflowResponse:

        class SomeException(Exception):
            pass

        async def callable_that_raises_retryable_exception() -> int:
            if not cls._at_most_once_workflow_raised_some_exception:
                cls._at_most_once_workflow_raised_some_exception = True
                raise SomeException
            else:
                return 42

        result = await at_most_once(
            'Raise retryable exception, then return 42',
            context,
            callable_that_raises_retryable_exception,
            retryable_exceptions=[SomeException],
        )

        assert cls._at_most_once_workflow_raised_some_exception

        assert result == 42

        async def callable_that_raises_unretryable_exception():
            raise RuntimeError()

        try:
            await at_most_once(
                'Raise unretryable exception',
                context,
                callable_that_raises_unretryable_exception,
            )
        except RuntimeError:
            raise
        except AtMostOnceFailedBeforeCompleting:
            pass

        return echo_rbt.AtMostOnceWorkflowResponse()

    @classmethod
    async def WorkflowCallingWorkflow(
        cls,
        context: WorkflowContext,
        request: echo_rbt.WorkflowCallingWorkflowRequest,
    ) -> echo_rbt.WorkflowCallingWorkflowResponse:

        if not request.call_workflow:
            return echo_rbt.WorkflowCallingWorkflowResponse(value="Hi!")

        # Test that we can call a workflow method using an
        # `WorkflowContext` without using `spawn()` or
        # `per_workflow*()`.
        response = await Echo.ref().WorkflowCallingWorkflow(
            context, call_workflow=False
        )

        # Test that without an explicit alias passed via
        # `self.ref().per_workflow*()` or `self.ref().idempotently()`
        # we'll get an error that one is necessary.
        try:
            await Echo.ref().WorkflowCallingWorkflow(
                context, call_workflow=False
            )
        except ValueError as error:
            assert (
                "To call 'tests.reboot.EchoMethods.WorkflowCallingWorkflow' "
                "of 'test-id' more than once using the same context an "
                "idempotency alias or key must be specified" in str(error)
            )
        else:
            raise Exception('Expecting exception!')

        return echo_rbt.WorkflowCallingWorkflowResponse(
            value=f"Got value: {response.value}"
        )

    async def RaiseValueError(
        self,
        context: WriterContext,
        state: Echo.State,
        request: echo_rbt.RaiseValueErrorRequest,
    ) -> echo_rbt.RaiseValueErrorResponse:
        """Raises a ValueError."""
        await retry_budget.acquire()
        raise ValueError("Some value error")

    async def RaiseSpecifiedError(
        self,
        context: WriterContext,
        state: Echo.State,
        request: echo_rbt.RaiseSpecifiedErrorRequest,
    ) -> echo_rbt.RaiseSpecifiedErrorResponse:
        """Raises a specified error."""
        raise Echo.RaiseSpecifiedErrorAborted(
            echo_rbt.SpecifiedError(error="specified error")
        )

    @classmethod
    async def FailingWorkflow(
        cls,
        context: WorkflowContext,
        request: echo_rbt.FailingWorkflowRequest,
    ) -> echo_rbt.FailingWorkflowResponse:
        """A workflow that always fails with a declared error."""
        raise Echo.FailingWorkflowAborted(
            echo_rbt.SpecifiedError(error=request.failure_message),
            message="This workflow always fails",
        )
