import asyncio
import unittest
import uuid
from datetime import datetime, timedelta
from rbt.v1alpha1 import errors_pb2, tasks_pb2
from reboot.aio.aborted import SystemAborted
from reboot.aio.applications import Application
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import (
    EffectValidation,
    ReaderContext,
    TransactionContext,
    WorkflowContext,
    WriterContext,
)
from reboot.aio.internals.tasks_cache import (
    TASKS_RESPONSES_CACHE_TARGET_CAPACITY,
)
from reboot.aio.internals.tasks_dispatcher import TasksDispatcher
from reboot.aio.tests import Reboot
from reboot.aio.types import StateRef
from reboot.aio.workflows import until_changes
from tests.reboot import echo_rbt
from tests.reboot.bank import SINGLETON_BANK_ID, AccountServicer, BankServicer
from tests.reboot.bank_rbt import Bank
from tests.reboot.echo_rbt import Echo
from tests.reboot.echo_servicers import MyEchoServicer
from tests.reboot.general_rbt import General, GeneralRequest, GeneralResponse
from tests.reboot.general_servicer import GeneralServicer
from tests.reboot.greeter_rbt import Greeter
from tests.reboot.greeter_servicers import MyGreeterServicer
from typing import Optional
from tzlocal import get_localzone
from unittest import mock

_ECHO_ID = StateRef.from_id(Echo.__state_type_name__, 'test-1234')


class TasksTestCase(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_search_and_replace_task(self) -> None:
        await self.rbt.up(Application(servicers=[MyEchoServicer]))

        context = self.rbt.create_external_context(name=self.id())

        message = "Hello, world!"

        # Implicitly construct an `Echo` instance by calling `Reply` so
        # we have text to search and replace!
        echo = Echo.ref('test-id')
        await echo.Reply(context, message=message)

        task = await echo.spawn().SearchAndReplace(
            context, search='Hello', replace='Goodbye'
        )

        search_and_replace_response = await task

        self.assertEqual(search_and_replace_response.replacements, 1)

        # Now let's replay the messages to ensure that our search and
        # replace task has done what it was supposed to do!
        replay_response = await echo.Replay(context)

        self.assertEqual(
            [message.replace('Hello', 'Goodbye')], replay_response.messages
        )

    async def test_fail_once_should_be_retried_task(self) -> None:
        await self.rbt.up(Application(servicers=[MyEchoServicer]))

        context = self.rbt.create_external_context(name=self.id())

        stub = echo_rbt.EchoWriterStub(context, state_ref=_ECHO_ID)

        fail_once_should_be_retried_response = await stub.FailOnceShouldBeRetried(
            echo_rbt.FailOnceShouldBeRetriedRequest(message='Retried!')
        )

        fail_once_should_be_retried_workflow_response = await Echo.FailOnceShouldBeRetriedWorkflowTask.retrieve(
            context,
            task_id=fail_once_should_be_retried_response.task_id,
        )

        self.assertEqual(
            fail_once_should_be_retried_workflow_response.message, 'Retried!'
        )

    async def test_too_many_tasks(self) -> None:
        await self.rbt.up(Application(servicers=[MyEchoServicer]))

        context = self.rbt.create_external_context(name=self.id())

        stub = echo_rbt.EchoWriterStub(context, state_ref=_ECHO_ID)

        with self.assertRaises(Echo.TooManyTasksAborted) as aborted:
            await stub.TooManyTasks(echo_rbt.TooManyTasksRequest())

        self.assertIn("Too many tasks", str(aborted.exception))

    async def test_failing_workflow_with_declared_error(self) -> None:
        await self.rbt.up(Application(servicers=[MyEchoServicer]))

        context = self.rbt.create_external_context(name=self.id())

        # Implicitly construct an `Echo` instance.
        echo = Echo.ref('test-id')
        await echo.Reply(context, message='Test started')

        # Test that a workflow can fail with a declared error.
        with self.assertRaises(Echo.FailingWorkflowAborted) as aborted:
            await echo.FailingWorkflow(
                context, failure_message="Nested error messages are reported"
            )

        # The "message" parameter to `FailingWorkflowAborted` should
        # appear on the client side.
        self.assertIn("This workflow always fails", str(aborted.exception))
        # And so should any fields set in the declared error.
        self.assertEqual(
            type(aborted.exception.error), echo_rbt.SpecifiedError
        )
        self.assertIn(
            "Nested error messages are reported", aborted.exception.error.error
        )

    async def test_raise_value_error_produces_unknown_error(self) -> None:
        await self.rbt.up(Application(servicers=[MyEchoServicer]))

        context = self.rbt.create_external_context(name=self.id())

        stub = echo_rbt.EchoWriterStub(context, state_ref=_ECHO_ID)

        # Test that `RaiseValueError`, since it raises an undeclared
        # `ValueError`, raises to the client a `RaiseValueErrorAborted`
        # with an `Unknown` error inside.
        with self.assertRaises(Echo.RaiseValueErrorAborted) as aborted:
            await stub.RaiseValueError(echo_rbt.RaiseValueErrorRequest())
        self.assertEqual(type(aborted.exception.error), errors_pb2.Unknown)

    async def test_cached_tasks(self) -> None:
        await self.rbt.up(Application(servicers=[MyEchoServicer]))

        context = self.rbt.create_external_context(name=self.id())

        message = "Hello, world!"

        # Implicitly construct an `Echo` instance by calling `Reply` so
        # we have text to search and replace!
        echo = Echo.ref('test-id')
        await echo.Reply(context, message=message)

        task = await echo.spawn().SearchAndReplace(
            context, search='Hello', replace='Goodbye'
        )

        search_and_replace_response = await task

        self.assertEqual(search_and_replace_response.replacements, 1)

        # Now run enough tasks so our first task gets evicted.

        for _ in range(0, TASKS_RESPONSES_CACHE_TARGET_CAPACITY):
            await (
                await echo.spawn().SearchAndReplace(
                    context, search='Hello', replace='Goodbye'
                )
            )

        # We should still be able to fetch the result for the original task via
        # the sidecar.
        search_and_replace_response = await Echo.SearchAndReplaceTask.retrieve(
            context,
            task_id=task.task_id,
        )
        self.assertEqual(search_and_replace_response.replacements, 1)

    async def test_fetch_unknown_task_response(self) -> None:
        await self.rbt.up(Application(servicers=[MyEchoServicer]))

        context = self.rbt.create_external_context(name=self.id())

        with self.assertRaises(SystemAborted) as aborted:
            state_type = MyEchoServicer.__state_type_name__
            await Echo.SearchAndReplaceTask.retrieve(
                context,
                task_id=tasks_pb2.TaskId(
                    state_type=state_type,
                    state_ref=StateRef.from_id(
                        state_type,
                        'test-1234',
                    ).to_str(),
                    task_uuid=b'this-is-not-real',
                ),
            )

        self.assertEqual(type(aborted.exception.error), errors_pb2.UnknownTask)

    async def test_spawn_task(self) -> None:
        revision = await self.rbt.up(Application(servicers=[MyEchoServicer]))

        context = self.rbt.create_external_context(name=self.id())

        message = "Hello, world!"

        # Implicitly construct an `Echo` instance by calling `Reply` so
        # we have text to search and replace!
        echo = Echo.ref('test-id')
        await echo.Reply(context, message=message)

        task = await echo.spawn(when=timedelta(seconds=3)).SearchAndReplace(
            context,
            search='Hello',
            replace='Goodbye',
        )

        await self.rbt.down()
        await self.rbt.up(revision=revision)

        try:
            search_and_replace_response = await asyncio.wait_for(
                task, timeout=20
            )
        except asyncio.TimeoutError:
            self.fail(
                "When using spawn with timedelta, the workflow task did not run within the intended time."
            )

        self.assertEqual(search_and_replace_response.replacements, 1)

        # TODO(benh): while this test ensures that we spawn a task,
        # we do not have a deterministic way to check that the task
        # actually waited until it was run (we don't control the
        # clock) and thus we should determine what the best way to
        # figure that out is.

    async def test_background_tasks_stopped_on_rbt_down_and_restarted_on_rbt_up(
        self
    ):
        """When we do an `rbt.down` running reboot tasks should be stopped.
        The tasks should similarly be successfully restarted when we do an
        `rbt.up`. This test tests exactly this, by mocking a long running
        background task and checking that the task is correctly stopped and
        restarted.
        """
        # The original methods that we will mock.
        SearchAndReplace = MyEchoServicer.SearchAndReplace
        dispatch = TasksDispatcher.dispatch

        # Signal used in the mocked `SearchAndReplaceTask` to stall the task
        # until we have done an `rbt.down`. This is done to simulate a long
        # running task and control the flow of the test.
        rbt_was_downed = asyncio.Event()

        # The set of all dispatched tasks populated by the mocked `dispatch`
        # function.
        asyncio_tasks: set[asyncio.Task] = set()

        # The number of times an asyncio tasks ends up calling user code. This
        # is used to check that the reboot task executes only once, despite
        # the task ending up being dispatched twice - once when it is created
        # and once when we recover the task on `rbt.up`.
        task_calls_to_user_code: int = 0

        def mock_dispatch(dispatcher, *args, **kwargs):
            """Mock the dispatch function to get a handle to the asyncio
            background task corresponding to the reboot task(s) we are
            scheduling.
            """
            # Call original dispatch function.
            result = dispatch(dispatcher, *args, **kwargs)

            # Extract created tasks.
            for task, _ in dispatcher._dispatched_tasks.values():
                asyncio_tasks.add(task)

            return result

        async def mock_SearchAndReplace(
            self,
            context,
            state,
            request,
        ):
            """Mock the `SearchAndReplaceTask` to allow stalling a task so we
            can do an `rbt.down` while the task is still running.
            """
            nonlocal task_calls_to_user_code

            # Stall the call until we have done an 'rbt.down'. The expectation
            # is that any tasks stuck here should be cancelled on `rbt.down` and
            # not retried.
            await rbt_was_downed.wait()

            # The reboot task runs as an asyncio task. We collect the names of
            # the asyncio task to check how many task actually ended up running
            # user code.
            current_task = asyncio.current_task()
            assert current_task is not None
            task_calls_to_user_code += 1

            return await SearchAndReplace(self, context, state, request)

        with mock.patch(
            'reboot.aio.internals.tasks_dispatcher.TasksDispatcher.dispatch',
            mock_dispatch,
        ), mock.patch(
            'tests.reboot.echo_servicers.MyEchoServicer.SearchAndReplace',
            mock_SearchAndReplace,
        ):
            # Start the reboot service and create a task as done in previous
            # tests too.
            revision = await self.rbt.up(
                Application(servicers=[MyEchoServicer]),
                effect_validation=EffectValidation.DISABLED,
            )

            context = self.rbt.create_external_context(name=self.id())

            message = "Hello, world!"

            # Implicitly construct an `Echo` instance by calling `Reply` so
            # we have text to search and replace!
            echo = Echo.ref('test-id')
            await echo.Reply(context, message=message)

            task = await echo.spawn().SearchAndReplace(
                context, search='Hello', replace='Goodbye'
            )

            # Bring down rbt and yield the event loop.
            await self.rbt.down()
            rbt_was_downed.set()

            # The hanging task should have been cancelled and never made it to
            # the part of the mock where we call the user code.
            self.assertGreater(len(asyncio_tasks), 0)
            await asyncio.wait(asyncio_tasks)

            self.assertEqual(task_calls_to_user_code, 0)

            # Bring up rbt again and wait for the task to finish.
            await self.rbt.up(revision=revision)

            search_and_replace_response = await task

            self.assertEqual(search_and_replace_response.replacements, 1)

            # There should be exactly one task that ran user code.
            self.assertEqual(task_calls_to_user_code, 1)

    async def test_idempotent_task(self) -> None:
        await self.rbt.up(Application(servicers=[MyEchoServicer]))

        context = self.rbt.create_external_context(name=self.id())

        message = "Hello, world!"

        # Implicitly construct an `Echo` instance by calling `Reply` so
        # we have text to search and replace!
        echo = Echo.ref('test-id')
        await echo.Reply(context, message=message)

        task1 = await (
            echo.idempotently('task').spawn().SearchAndReplace(
                context,
                search='Hello',
                replace='Goodbye',
            )
        )

        task2 = await (
            echo.idempotently('task').spawn().SearchAndReplace(
                context,
                search='Hello',
                replace='Goodbye',
            )
        )

        self.assertEqual(task1.task_id.task_uuid, task2.task_id.task_uuid)

    async def test_idempotent_task_after_recovery(self) -> None:
        revision = await self.rbt.up(Application(servicers=[MyEchoServicer]))

        context = self.rbt.create_external_context(name=self.id())

        message = "Hello, world!"

        # Implicitly construct an `Echo` instance by calling `Reply` so
        # we have text to search and replace!
        echo = Echo.ref('test-id')
        await echo.Reply(context, message=message)

        task1 = await (
            echo.idempotently('task').spawn().SearchAndReplace(
                context,
                search='Hello',
                replace='Goodbye',
            )
        )

        await self.rbt.down()
        await self.rbt.up(revision=revision)

        echo = Echo.ref(echo.state_id)

        task2 = await (
            echo.idempotently('task').spawn().SearchAndReplace(
                context,
                search='Hello',
                replace='Goodbye',
            )
        )

        self.assertEqual(task1.task_id.task_uuid, task2.task_id.task_uuid)

    async def test_ref_schedule_in_transaction(self) -> None:
        await self.rbt.up(
            Application(servicers=[BankServicer, AccountServicer])
        )

        context = self.rbt.create_external_context(name=self.id())

        bank, _ = await Bank.Create(context, SINGLETON_BANK_ID)

        response = await bank.SignUp(context, account_id='jonathan')

        await Bank.PostSignUpTask.retrieve(context, task_id=response.task_id)

    async def test_reactive_workflow_task(self) -> None:
        revision = await self.rbt.up(Application(servicers=[MyEchoServicer]))

        context = self.rbt.create_external_context(name=self.id())

        # Implicitly construct an `Echo` instance by calling `Reply` so
        # we have text to search and replace!
        echo = Echo.ref('test-id')
        await echo.Reply(context, message='Test started')

        # Create the reactive task and then asynchronously wait.
        task = await echo.spawn().ReactiveWorkflow(context)

        async def await_task():
            await task

        await_task_task = asyncio.create_task(await_task())

        await echo.WaitFor(context, message='Reactive workflow task started')

        self.assertFalse(await_task_task.done())

        # Demonstrate that the task is rerun after the recovery
        # but that its idempotency alias prevent double mutations.
        await self.rbt.down()
        await self.rbt.up(revision=revision)

        echo = Echo.ref(echo.state_id)

        await echo.Reply(context, message='Test down/up')

        await task

        replay_response = await echo.Replay(context)

        self.assertEqual(
            [
                'Test started',
                'Reactive workflow task started',
                'Test down/up',
                'Reactive workflow task down/up',
            ],
            replay_response.messages,
        )

    async def test_control_loop_workflow_task(self) -> None:
        revision = await self.rbt.up(Application(servicers=[MyEchoServicer]))

        context = self.rbt.create_external_context(name=self.id())

        # Implicitly construct an `Echo` instance by calling `Reply` so
        # we have text to search and replace!
        echo = Echo.ref('test-id')
        await echo.Reply(context, message='Test started')

        # Create the control loop task and then asynchronously wait.
        task = await echo.spawn().ControlLoop(context)

        async def await_task():
            await task

        await_task_task = asyncio.create_task(await_task())

        await echo.WaitFor(
            context,
            message='Control loop workflow task -- each iteration',
        )

        self.assertFalse(await_task_task.done())

        # Demonstrate that the task is rerun after the recovery
        # but that its idempotency alias prevent double mutations.
        await self.rbt.down()
        await self.rbt.up(revision=revision)

        echo = Echo.ref(echo.state_id)

        await echo.WaitFor(
            context,
            message='Control loop workflow task -- trigger',
        )

        await echo.Reply(context, message='Test after trigger')

        await task

        replay_response = await echo.Replay(context)

        self.assertEqual(
            [
                'Test started',
                'Control loop workflow task -- each iteration',
                'Control loop workflow task -- trigger',
                'Test after trigger',
                'Control loop workflow task -- each iteration',
            ],
            replay_response.messages,
        )

    async def test_at_most_once_workflow_task(self) -> None:
        await self.rbt.up(
            Application(servicers=[MyEchoServicer]),
            # Need to disable effect validation because this test
            # relies on setting some values on `MyEchoServicer`.
            effect_validation=EffectValidation.DISABLED,
        )

        context = self.rbt.create_external_context(name=self.id())

        # Implicitly construct an `Echo` instance by calling `Reply` so
        # we have text to search and replace!
        echo = Echo.ref('test-id')
        await echo.Reply(context, message='Test started')

        # Spawn "at most once" workflow task and asynchronously wait.
        task = await echo.spawn().AtMostOnceWorkflow(context)

        await task

    async def test_workflow_calling_workflow(self) -> None:
        await self.rbt.up(Application(servicers=[MyEchoServicer]))

        context = self.rbt.create_external_context(name=self.id())

        # Implicitly construct an `Echo` instance by calling `Reply` so
        # we have text to search and replace!
        echo = Echo.ref('test-id')
        await echo.Reply(context, message='Test started')

        # Test that we can call a workflow method using an
        # `ExternalContext` without using `spawn()`.
        response = await echo.idempotently().WorkflowCallingWorkflow(
            context, call_workflow=True
        )

        self.assertEqual(response.value, "Got value: Hi!")

    async def test_alpha_servicer_read_write_in_workflow(self) -> None:
        """
        Tests that a workflow using `alpha.Servicer` can use
        `self.ref().read()` and `self.ref().write()`.
        """
        await self.rbt.up(Application(servicers=[MyGreeterServicer]))

        context = self.rbt.create_external_context(name=self.id())

        greeter, _ = await Greeter.Create(
            context,
            title='Dr',
            name='Jonathan',
            adjective='best',
        )

        await greeter.Workflow(context)

    async def test_workflow_until_changes(self) -> None:
        """
        Tests that a workflow control loop can wait each iteration for
        changes.
        """
        callable_called_after_iteration_0 = asyncio.Event()

        calls = 0

        class WorkflowServicer(GeneralServicer):

            def authorizer(self):
                return allow()

            async def constructor_writer(
                self,
                context: WriterContext,
                state: General.State,
                request: GeneralRequest,
            ) -> GeneralResponse:
                return GeneralResponse()

            async def writer(
                self,
                context: WriterContext,
                state: General.State,
                request: GeneralRequest,
            ) -> GeneralResponse:
                state.content.update(request.content)
                return GeneralResponse()

            @classmethod
            async def workflow(
                cls,
                context: WorkflowContext,
                request: GeneralRequest,
            ) -> GeneralResponse:

                async def callable() -> General.State:
                    nonlocal calls
                    calls += 1

                    # To reliably be able to track the number of calls
                    # to this function we read the state _first_ so
                    # that we will return immediately after triggering
                    # `callable_called_after_iteration_0` vs racing to
                    # read the state while our call to `Writer` might
                    # be updating it.
                    state = await General.ref().read(context)

                    if context.task.iteration != 0:
                        callable_called_after_iteration_0.set()

                    return state

                async for iteration in context.loop("Test"):
                    state = await until_changes(
                        "State has changed",
                        context,
                        callable,
                    )

                    if iteration == 0:
                        assert len(state.content) == 0
                        continue

                    return GeneralResponse(content=state.content)

                raise AssertionError("unreachable")

        await self.rbt.up(
            Application(servicers=[WorkflowServicer]),
        )

        context = self.rbt.create_external_context(name=self.id())

        # Construct.
        g, _ = await General.ConstructorWriter(context)

        task = await g.spawn().Workflow(context)

        await callable_called_after_iteration_0.wait()

        content = {"hello": "world"}

        await g.Writer(context, content=content)

        response = await task

        self.assertEqual(content, response.content)

        # We expect 4 calls:
        #
        # 1 call for iteration 0 to execute.
        #
        # 2 calls for iteration 1 where the data hasn't changed (the
        # second call is due to eager retry of the reader methods that
        # the workflow has consumed: see #3152).
        #
        # 1 more call for iteration 1 to execute once the data has
        # changed.
        self.assertEqual(calls, 4)

    async def test_workflow_until_changes_syntactic_sugar(self) -> None:
        """
        Tests using the syntactic sugar of `until_changes`.
        """
        in_iteration_1 = asyncio.Event()

        class WorkflowServicer(GeneralServicer):

            def authorizer(self):
                return allow()

            async def constructor_writer(
                self,
                context: WriterContext,
                state: General.State,
                request: GeneralRequest,
            ) -> GeneralResponse:
                return GeneralResponse()

            async def writer(
                self,
                context: WriterContext,
                state: General.State,
                request: GeneralRequest,
            ) -> GeneralResponse:
                state.content.update(request.content)
                return GeneralResponse()

            @classmethod
            async def workflow(
                cls,
                context: WorkflowContext,
                request: GeneralRequest,
            ) -> GeneralResponse:

                async for iteration in context.loop("Test"):
                    if iteration == 1:
                        in_iteration_1.set()

                    state = await General.ref().until(
                        "State has changed",
                    ).read(context).changes()

                    if iteration == 0:
                        assert len(state.content) == 0
                        continue

                    return GeneralResponse(content=state.content)

                raise AssertionError("unreachable")

        await self.rbt.up(
            Application(servicers=[WorkflowServicer]),
        )

        context = self.rbt.create_external_context(name=self.id())

        # Construct.
        g, _ = await General.ConstructorWriter(context)

        task = await g.spawn().Workflow(context)

        await in_iteration_1.wait()

        content = {"hello": "world"}

        await g.Writer(context, content=content)

        response = await task

        self.assertEqual(content, response.content)

    async def test_spawn_with_specified_time(self) -> None:
        """
        Tests that using spawn on a workflow with an absolute time
        properly runs the task, regardless of whether the timestamp
        is in a non-UTC timezone and whether the timezone is even specified.
        """

        class WorkflowServicer(GeneralServicer):

            def authorizer(self):
                return allow()

            async def constructor_writer(
                self,
                context: WriterContext,
                state: General.State,
                request: GeneralRequest,
            ) -> GeneralResponse:
                return GeneralResponse()

            @classmethod
            async def workflow(
                cls,
                context: WorkflowContext,
                request: GeneralRequest,
            ) -> GeneralResponse:
                return GeneralResponse()

        await self.rbt.up(
            Application(servicers=[WorkflowServicer]),
        )

        context = self.rbt.create_external_context(name=self.id())

        # Construct.
        g, _ = await General.ConstructorWriter(context)

        # Spawn a workflow with an absolute time that includes the timezone.
        task = await g.spawn(when=datetime.now(tz=get_localzone())
                            ).Workflow(context)

        try:
            await asyncio.wait_for(task, timeout=20)
        except asyncio.TimeoutError:
            self.fail(
                "When using spawn with a timezone aware timestamp, the workflow task did not run immediately."
            )

        # Spawn a workflow with an absolute time that does not include the timezone.
        task = await g.spawn(when=datetime.now()).Workflow(context)

        try:
            await asyncio.wait_for(task, timeout=20)
        except asyncio.TimeoutError:
            self.fail(
                "When using spawn with a timezone unaware timestamp, the workflow task did not run immediately."
            )

    async def test_writer_schedule_with_specified_time(self) -> None:
        """
        Tests that using schedule on a weak reference with an absolute time
        properly runs the task, regardless of whether the timestamp is in a
        non-UTC timezone and whether the timezone is even specified.
        """

        ran_workflow_event_with_timezone = asyncio.Event()
        ran_workflow_event_without_timezone = asyncio.Event()

        class WorkflowServicer(GeneralServicer):

            def authorizer(self):
                return allow()

            async def constructor_writer(
                self,
                context: WriterContext,
                state: General.State,
                request: GeneralRequest,
            ) -> GeneralResponse:
                return GeneralResponse()

            async def writer(
                self,
                context: WriterContext,
                state: General.State,
                request: GeneralRequest,
            ) -> GeneralResponse:
                attach_timezone = request.content.get('timezone_attached')
                if attach_timezone:
                    await self.ref().schedule(
                        when=datetime.now(tz=get_localzone())
                    ).Workflow(
                        context,
                        content={'timezone_attached': attach_timezone},
                    )
                else:
                    await self.ref().schedule(when=datetime.now()).Workflow(
                        context,
                        content={'timezone_attached': attach_timezone},
                    )
                return GeneralResponse()

            @classmethod
            async def workflow(
                cls,
                context: WorkflowContext,
                request: GeneralRequest,
            ) -> GeneralResponse:
                attach_timezone = request.content.get('timezone_attached')
                if attach_timezone:
                    ran_workflow_event_with_timezone.set()
                else:
                    ran_workflow_event_without_timezone.set()
                return GeneralResponse()

        await self.rbt.up(
            Application(servicers=[WorkflowServicer]),
        )

        context = self.rbt.create_external_context(name=self.id())

        # Construct.
        g, _ = await General.ConstructorWriter(context)

        # Call Writer that will schedule a workflow with an absolute time that does not include the timezone.
        await g.Writer(context, content={'timezone_attached': ""})

        try:
            await asyncio.wait_for(
                ran_workflow_event_without_timezone.wait(), timeout=20
            )
        except asyncio.TimeoutError:
            self.fail(
                "When using schedule on a weak reference with a timezone unaware timestamp, the workflow task did not run immediately."
            )

        # Call Writer that will schedule a workflow with an absolute time that includes the timezone.
        await g.Writer(context, content={'timezone_attached': "True"})

        try:
            await asyncio.wait_for(
                ran_workflow_event_with_timezone.wait(), timeout=20
            )
        except asyncio.TimeoutError:
            self.fail(
                "When using schedule on a weak reference with a timezone aware timestamp, the workflow task did not run immediately."
            )

    async def test_schedule_with_specified_time(self) -> None:
        """
        Tests that using schedule in a transaction context with an
        absolute time properly runs the task, regardless of whether the timestamp
        is in a non-UTC timezone and whether the timezone is even specified. This
        test will cover different code paths than the test_writer_schedule_with_specified_time
        test because we are not constructing a weak reference.
        """

        ID = 'test-user'
        ran_workflow_event_with_timezone = asyncio.Event()
        ran_workflow_event_without_timezone = asyncio.Event()

        class WorkflowServicer(GeneralServicer):

            def authorizer(self):
                return allow()

            async def constructor_transaction(
                self,
                context: TransactionContext,
                state: General.State,
                request: GeneralRequest,
            ) -> GeneralResponse:
                return GeneralResponse()

            async def transaction(
                self,
                context: TransactionContext,
                state: General.State,
                request: GeneralRequest,
            ) -> GeneralResponse:
                attach_timezone = request.content.get('timezone_attached')
                if attach_timezone:
                    await General.ref(ID).schedule(
                        when=datetime.now(tz=get_localzone())
                    ).Workflow(
                        context,
                        content={'timezone_attached': attach_timezone}
                    )
                else:
                    await General.ref(ID).schedule(
                        when=datetime.now()
                    ).Workflow(
                        context,
                        content={'timezone_attached': attach_timezone}
                    )
                return GeneralResponse()

            @classmethod
            async def workflow(
                cls,
                context: WorkflowContext,
                request: GeneralRequest,
            ) -> GeneralResponse:
                attach_timezone = request.content.get('timezone_attached')
                if attach_timezone:
                    ran_workflow_event_with_timezone.set()
                else:
                    ran_workflow_event_without_timezone.set()
                return GeneralResponse()

        await self.rbt.up(
            Application(servicers=[WorkflowServicer]),
        )

        context = self.rbt.create_external_context(name=self.id())

        # Construct.
        g, _ = await General.ConstructorTransaction(context, ID)

        # Call Transaction that will schedule a workflow with an absolute time that does not include the timezone.
        await g.Transaction(context, content={'timezone_attached': ""})

        try:
            await asyncio.wait_for(
                ran_workflow_event_without_timezone.wait(), timeout=20
            )
        except asyncio.TimeoutError:
            self.fail(
                "When using schedule with a timezone unaware timestamp, the workflow task did not run immediately."
            )

        # Call Transaction that will schedule a workflow with an absolute time that includes the timezone.
        await g.Transaction(context, content={'timezone_attached': "True"})

        try:
            await asyncio.wait_for(
                ran_workflow_event_with_timezone.wait(), timeout=20
            )
        except asyncio.TimeoutError:
            self.fail(
                "When using schedule with a timezone aware timestamp, the workflow task did not run immediately."
            )

    async def test_writer_schedule_with_timedelta(self) -> None:
        """
        Tests that using schedule on a weak reference with a
        timedelta properly runs the task after the specified
        time has passed.
        """

        ran_workflow_event = asyncio.Event()

        class WorkflowServicer(GeneralServicer):

            def authorizer(self):
                return allow()

            async def constructor_writer(
                self,
                context: WriterContext,
                state: General.State,
                request: GeneralRequest,
            ) -> GeneralResponse:
                return GeneralResponse()

            async def transaction(
                self,
                context: TransactionContext,
                state: General.State,
                request: GeneralRequest,
            ) -> GeneralResponse:
                await self.ref().schedule(
                    when=timedelta(seconds=3),
                ).Workflow(context)
                return GeneralResponse()

            @classmethod
            async def workflow(
                cls,
                context: WorkflowContext,
                request: GeneralRequest,
            ) -> GeneralResponse:
                ran_workflow_event.set()
                return GeneralResponse()

        await self.rbt.up(
            Application(servicers=[WorkflowServicer]),
        )

        context = self.rbt.create_external_context(name=self.id())

        # Construct.
        g, _ = await General.ConstructorWriter(context)

        # Call Transaction that will schedule a workflow with a timedelta.
        await g.Transaction(context)

        try:
            await asyncio.wait_for(ran_workflow_event.wait(), timeout=20)
        except asyncio.TimeoutError:
            self.fail(
                "When using schedule on a weak reference with a timedelta, the workflow task did not run after the specified time."
            )

    async def test_schedule_with_timedelta(self) -> None:
        """
        Tests that using schedule on a workflow in a transaction context
        with a timedelta properly runs the task after the specified
        time has passed. This test will cover different code paths than
        the test_writer_schedule_with_timedelta test because we are not
        constructing a weak reference.
        """

        ID = 'test-user'
        ran_workflow_event = asyncio.Event()

        class WorkflowServicer(GeneralServicer):

            def authorizer(self):
                return allow()

            async def constructor_transaction(
                self,
                context: TransactionContext,
                state: General.State,
                request: GeneralRequest,
            ) -> GeneralResponse:
                return GeneralResponse()

            async def transaction(
                self,
                context: TransactionContext,
                state: General.State,
                request: GeneralRequest,
            ) -> GeneralResponse:
                await General.ref(ID).schedule(
                    when=timedelta(seconds=3),
                ).Workflow(context)
                return GeneralResponse()

            @classmethod
            async def workflow(
                cls,
                context: WorkflowContext,
                request: GeneralRequest,
            ) -> GeneralResponse:
                ran_workflow_event.set()
                return GeneralResponse()

        await self.rbt.up(
            Application(servicers=[WorkflowServicer]),
        )

        context = self.rbt.create_external_context(name=self.id())

        # Construct.
        g, _ = await General.ConstructorTransaction(context, ID)

        # Call Transaction that will schedule a workflow with a timedelta.
        await g.Transaction(context)

        try:
            await asyncio.wait_for(ran_workflow_event.wait(), timeout=20)
        except asyncio.TimeoutError:
            self.fail(
                "When using schedule with a timedelta, the workflow task did not run after the specified time."
            )

    async def test_workflow_id_propagated_to_writer_and_transaction(
        self,
    ) -> None:
        """
        Test that `context.workflow_id` is correctly set when a workflow
        calls a writer and a transaction.
        """
        writer_workflow_id_future: asyncio.Future[Optional[uuid.UUID]
                                                 ] = asyncio.Future()
        transaction_workflow_id_future: asyncio.Future[Optional[uuid.UUID]
                                                      ] = asyncio.Future()

        class TestServicer(GeneralServicer):

            def authorizer(self):
                return allow()

            async def constructor_writer(
                self,
                context: WriterContext,
                state: General.State,
                request: GeneralRequest,
            ) -> GeneralResponse:
                return GeneralResponse()

            async def writer(
                self,
                context: WriterContext,
                state: General.State,
                request: GeneralRequest,
            ) -> GeneralResponse:
                writer_workflow_id_future.set_result(context.workflow_id)
                return GeneralResponse()

            async def transaction(
                self,
                context: TransactionContext,
                state: General.State,
                request: GeneralRequest,
            ) -> GeneralResponse:
                transaction_workflow_id_future.set_result(context.workflow_id)
                return GeneralResponse()

            @classmethod
            async def workflow(
                cls,
                context: WorkflowContext,
                request: GeneralRequest,
            ) -> GeneralResponse:
                g = General.ref()
                await g.writer(context)
                await g.transaction(context)
                return GeneralResponse()

        await self.rbt.up(Application(servicers=[TestServicer]))

        context = self.rbt.create_external_context(name=self.id())

        # Construct.
        g, _ = await General.constructor_writer(context)

        # Run the workflow.
        await g.workflow(context)

        writer_workflow_id = await asyncio.wait_for(
            writer_workflow_id_future, timeout=10
        )
        transaction_workflow_id = await asyncio.wait_for(
            transaction_workflow_id_future, timeout=10
        )

        self.assertIsNotNone(writer_workflow_id)
        self.assertIsNotNone(transaction_workflow_id)

        # Both should have the same workflow ID since they were
        # called from the same workflow.
        self.assertEqual(writer_workflow_id, transaction_workflow_id)

    async def test_workflow_idempotent_writer_and_transaction_survive_recovery(
        self,
    ) -> None:
        """Test that a workflow's idempotent writer and transaction
        mutations are not re-executed after recovery via
        rbt.down() / rbt.up().
        """
        writer_and_transaction_called = asyncio.Event()
        proceed_after_down = asyncio.Event()

        writer_call_count = 0
        transaction_call_count = 0

        class TestServicer(GeneralServicer):

            def authorizer(self):
                return allow()

            async def constructor_writer(
                self,
                context: WriterContext,
                state: General.State,
                request: GeneralRequest,
            ) -> GeneralResponse:
                return GeneralResponse()

            async def writer(
                self,
                context: WriterContext,
                state: General.State,
                request: GeneralRequest,
            ) -> GeneralResponse:
                nonlocal writer_call_count
                writer_call_count += 1
                return GeneralResponse()

            async def transaction(
                self,
                context: TransactionContext,
                state: General.State,
                request: GeneralRequest,
            ) -> GeneralResponse:
                nonlocal transaction_call_count
                transaction_call_count += 1
                return GeneralResponse()

            async def reader(
                self,
                context: ReaderContext,
                state: General.State,
                request: GeneralRequest,
            ) -> GeneralResponse:
                return GeneralResponse()

            @classmethod
            async def workflow(
                cls,
                context: WorkflowContext,
                request: GeneralRequest,
            ) -> GeneralResponse:
                g = General.ref()

                # Make writer and transaction calls which are
                # idempotent by default.
                await g.writer(context)
                await g.transaction(context)

                # Signal that both have been called.
                writer_and_transaction_called.set()

                # Wait until the test tells us to proceed (after
                # `rbt.down()`/`rbt.up()`).
                await proceed_after_down.wait()

                return GeneralResponse()

        revision = await self.rbt.up(
            Application(servicers=[TestServicer]),
            # Need to disable effect validation because this test
            # relies on setting some nonlocal variables.
            effect_validation=EffectValidation.DISABLED,
        )

        context = self.rbt.create_external_context(name=self.id())

        # Construct.
        g, _ = await General.constructor_writer(context)

        # Spawn the workflow.
        task = await g.spawn().workflow(context)

        # Wait for both mutations to be called.
        await writer_and_transaction_called.wait()

        # Expecting only one call since effect validation is disabled.
        self.assertEqual(writer_call_count, 1)
        self.assertEqual(transaction_call_count, 1)

        # Simulate failure.
        await self.rbt.down()

        # Reset events for the re-run after recovery.
        writer_and_transaction_called.clear()

        await self.rbt.up(revision=revision)

        # Let the workflow proceed to completion.
        proceed_after_down.set()

        await task

        # We should have tried to call both mutations again.
        await writer_and_transaction_called.wait()

        # But they still should only have been called once (since
        # we've disabled effect validation) even after recovery
        # because we should properly recover workflow idempotent
        # mutations and thus not run them again.
        self.assertEqual(writer_call_count, 1)
        self.assertEqual(transaction_call_count, 1)

    async def test_control_loop_per_iteration_idempotency_survives_recovery(
        self,
    ) -> None:
        """
        Test that within a workflow control loop, per-iteration idempotent
        mutations are called exactly once per iteration even after a
        failure/recovery mid-iteration.

        The test runs a 2-iteration control loop where each iteration
        calls a writer. We bring the service down in the middle of
        iteration 0, bring it back up, and verify that:

        1. The writer from iteration 0 is NOT called again after
           recovery (idempotent).
        2. The writer for iteration 1 IS called (different
           iteration means a fresh idempotency scope).
        3. Each iteration's writer is called exactly once total.

        """
        # Track which iterations have called the writer and how
        # many times.
        iteration_0_call_count = 0
        iteration_1_call_count = 0

        iteration_0_writer_called = asyncio.Event()
        proceed_after_recovery = asyncio.Event()

        class TestServicer(GeneralServicer):

            def authorizer(self):
                return allow()

            async def constructor_writer(
                self,
                context: WriterContext,
                state: General.State,
                request: GeneralRequest,
            ) -> GeneralResponse:
                return GeneralResponse()

            async def writer(
                self,
                context: WriterContext,
                state: General.State,
                request: GeneralRequest,
            ) -> GeneralResponse:
                nonlocal iteration_0_call_count
                nonlocal iteration_1_call_count
                if context.workflow_iteration == 0:
                    iteration_0_call_count += 1
                elif context.workflow_iteration == 1:
                    iteration_1_call_count += 1
                return GeneralResponse()

            @classmethod
            async def workflow(
                cls,
                context: WorkflowContext,
                request: GeneralRequest,
            ) -> GeneralResponse:
                g = General.ref()

                async for iteration in context.loop("Test loop"):
                    # Within a control loop the generated code
                    # defaults to `per_iteration()` semantics, so each
                    # iteration gets a fresh idempotency key.
                    await g.writer(context)

                    if iteration == 0:
                        # Signal that iteration 0's writer has
                        # been called.
                        iteration_0_writer_called.set()

                        # Block until the test tells us to
                        # proceed (after recovery).
                        await proceed_after_recovery.wait()

                        # Move on to iteration 1.
                        continue

                    # Iteration 1: we're done.
                    break

                return GeneralResponse()

        revision = await self.rbt.up(
            Application(servicers=[TestServicer]),
            # Need to disable effect validation because this test
            # relies on setting some nonlocal variables.
            effect_validation=EffectValidation.DISABLED,
        )

        context = self.rbt.create_external_context(name=self.id())

        # Construct.
        g, _ = await General.constructor_writer(context)

        # Spawn the workflow.
        task = await g.spawn().workflow(context)

        # Wait for iteration 0's writer to be called.
        await iteration_0_writer_called.wait()

        self.assertEqual(iteration_0_call_count, 1)
        self.assertEqual(iteration_1_call_count, 0)

        # Simulate failure mid-iteration 0.
        await self.rbt.down()

        # Reset the event so we can detect the re-run.
        iteration_0_writer_called.clear()

        await self.rbt.up(revision=revision)

        # Let the workflow proceed past the recovery point.
        proceed_after_recovery.set()

        # Wait for the workflow to complete.
        await task

        # We should have re-executed iteration 0 because we failed in
        # the middle of it.
        await iteration_0_writer_called.wait()

        # But iteration 0's writer should not have been called again:
        # the recovery should have found the existing idempotent
        # mutation within the iteration and thus not re-executed it.
        self.assertEqual(iteration_0_call_count, 1)

        # Iteration 1's writer should now have been called exactly
        # once: it has a different per-iteration idempotency key.
        self.assertEqual(iteration_1_call_count, 1)

    async def test_control_loop_per_iteration_inline_write_and_read_idempotency(
        self,
    ) -> None:
        """
        Test that within a workflow control loop, per-iteration
        inline writers and readers correctly return memoized
        values and the writer function is only executed once per
        iteration, even when the iteration is re-run after
        recovery.

        The test runs a 2-iteration control loop where each
        iteration performs an inline write via
        `General.ref().per_iteration('alias').write(...)` and an
        inline read via
        `General.ref().per_iteration('alias').read(...)`. We
        bring the service down in the middle of iteration 0,
        bring it back up, and verify that:

        1. The inline writer from iteration 0 is NOT called
           again after recovery (its return value is memoized).
        2. The inline writer for iteration 1 IS called (different
           iteration means a fresh idempotency scope).
        3. The inline reader returns the state reflecting the
           write for that iteration.
        """
        iteration_0_write_count = 0
        iteration_1_write_count = 0

        iteration_0_writer_called = asyncio.Event()
        proceed_after_recovery = asyncio.Event()

        class TestServicer(GeneralServicer):

            def authorizer(self):
                return allow()

            async def constructor_writer(
                self,
                context: WriterContext,
                state: General.State,
                request: GeneralRequest,
            ) -> GeneralResponse:
                return GeneralResponse()

            @classmethod
            async def workflow(
                cls,
                context: WorkflowContext,
                request: GeneralRequest,
            ) -> GeneralResponse:
                g = General.ref()

                async for iteration in context.loop("Test loop"):

                    def wait_for_ready(state):
                        nonlocal iteration
                        return iteration == 0 or "iteration" in state.content

                    state = await g.until(
                        "Wait for ready",
                    ).read(context).satisfies(wait_for_ready)

                    if iteration == 0:
                        assert "iteration" not in state.content
                    elif iteration == 1:
                        assert "iteration" in state.content
                        assert state.content["iteration"] == "0"

                    async def write(state: General.State) -> str:
                        nonlocal iteration_0_write_count
                        nonlocal iteration_1_write_count
                        if iteration == 0:
                            iteration_0_write_count += 1
                        elif iteration == 1:
                            iteration_1_write_count += 1
                        state.content["iteration"] = str(iteration)
                        return str(iteration)

                    # Per-iteration inline write: should be
                    # called at most once per iteration.
                    result = await g.per_iteration(
                        "Do write",
                    ).write(context, write)

                    # The result should match what the writer returned
                    # (or the memoized value on re-run).
                    assert result == str(iteration)

                    # Per-iteration inline read: should reflect
                    # the state after the write.
                    state = await g.per_iteration("Do read").read(context)

                    assert "iteration" in state.content
                    assert state.content["iteration"] == str(iteration)

                    if iteration == 0:
                        # Signal that iteration 0's writer has been
                        # called.
                        iteration_0_writer_called.set()

                        # Block until the test tells us to proceed
                        # (after recovery).
                        await proceed_after_recovery.wait()

                        # Move on to iteration 1.
                        continue

                    # Iteration 1: we're done.
                    break

                return GeneralResponse()

        revision = await self.rbt.up(
            Application(servicers=[TestServicer]),
            # Need to disable effect validation because this
            # test relies on setting some nonlocal variables.
            effect_validation=EffectValidation.DISABLED,
        )

        context = self.rbt.create_external_context(name=self.id())

        # Construct.
        g, _ = await General.constructor_writer(context)

        # Spawn the workflow.
        task = await g.spawn().workflow(context)

        # Wait for iteration 0's inline writer to be called.
        await iteration_0_writer_called.wait()

        self.assertEqual(iteration_0_write_count, 1)
        self.assertEqual(iteration_1_write_count, 0)

        # Simulate failure mid-iteration 0.
        await self.rbt.down()

        # Reset the event so we can detect the re-run.
        iteration_0_writer_called.clear()

        await self.rbt.up(revision=revision)

        # Let the workflow proceed past the recovery point.
        proceed_after_recovery.set()

        # Wait for the workflow to complete.
        await task

        # We should have re-executed iteration 0 because we
        # failed in the middle of it.
        await iteration_0_writer_called.wait()

        # But iteration 0's inline writer should not have been
        # called again: the recovery should have found the
        # existing idempotent mutation and returned the memoized
        # result instead of re-executing the writer function.
        self.assertEqual(iteration_0_write_count, 1)

        # Iteration 1's inline writer should now have been
        # called exactly once: it has a different per-iteration
        # idempotency key.
        self.assertEqual(iteration_1_write_count, 1)

    async def test_workflow_on_iteration_on_method(self) -> None:
        """Both sync and async callables registered via
        `on_iteration_complete` and `on_method_complete` should run
        with the expected kwargs, with iteration callables firing
        every iteration and the method callable firing once with
        `retrying=False` on a normal return.
        """
        sync_iteration_calls: list[int] = []
        async_iteration_calls: list[int] = []
        sync_method_calls: list[bool] = []
        async_method_calls: list[bool] = []

        class TestServicer(GeneralServicer):

            def authorizer(self):
                return allow()

            async def constructor_writer(
                self,
                context: WriterContext,
                state: General.State,
                request: GeneralRequest,
            ) -> GeneralResponse:
                return GeneralResponse()

            @classmethod
            async def workflow(
                cls,
                context: WorkflowContext,
                request: GeneralRequest,
            ) -> GeneralResponse:

                def sync_on_iteration(*, iteration: int) -> None:
                    sync_iteration_calls.append(iteration)

                async def async_on_iteration(*, iteration: int) -> None:
                    async_iteration_calls.append(iteration)

                def sync_on_method(*, retrying: bool) -> None:
                    sync_method_calls.append(retrying)

                async def async_on_method(*, retrying: bool) -> None:
                    async_method_calls.append(retrying)

                context.on_iteration_complete(sync_on_iteration)
                context.on_iteration_complete(async_on_iteration)
                context.on_method_complete(sync_on_method)
                context.on_method_complete(async_on_method)

                async for iteration in context.loop("Test"):
                    if iteration == 2:
                        break

                return GeneralResponse()

        await self.rbt.up(
            Application(servicers=[TestServicer]),
            # Effect validation re-runs the workflow body, which
            # would double up our captures.
            effect_validation=EffectValidation.DISABLED,
        )

        context = self.rbt.create_external_context(name=self.id())

        g, _ = await General.constructor_writer(context)

        await g.workflow(context)

        # Iteration callables run after every iteration that completes
        # (i.e., iterations 0 and 1 -- iteration 2 `break`s before the
        # loop body finishes the iteration).
        self.assertEqual(sync_iteration_calls, [0, 1])
        self.assertEqual(async_iteration_calls, [0, 1])

        # Method callables run exactly once, with `retrying=False` on
        # a normal return.
        self.assertEqual(sync_method_calls, [False])
        self.assertEqual(async_method_calls, [False])

    async def test_workflow_on_iteration_on_method_with_effect_validation(
        self,
    ) -> None:
        """With effect validation ENABLED, the framework re-runs the
        workflow method body once to validate effects. Reboot does NOT
        do per-iteration effect validation: during the validation
        re-run, the control loop is expected to break/return at the
        last persisted iteration without executing any further
        iteration body. So:

        - `on_iteration_complete` runs ONCE for the real iteration
          that completed (during the validation re-run, the loop
          breaks before any iteration body finishes -- so no extra
          runs).
        - `on_method_complete` runs twice: the first attempt with
          `retrying=True` because the framework signals
          effect-validation re-run by raising
          `EffectValidationRetry` out of the method body, and the
          second attempt with `retrying=False` after the validation
          re-run returns normally.
        """
        iteration_calls: list[int] = []
        method_calls: list[bool] = []

        class TestServicer(GeneralServicer):

            def authorizer(self):
                return allow()

            async def constructor_writer(
                self,
                context: WriterContext,
                state: General.State,
                request: GeneralRequest,
            ) -> GeneralResponse:
                return GeneralResponse()

            @classmethod
            async def workflow(
                cls,
                context: WorkflowContext,
                request: GeneralRequest,
            ) -> GeneralResponse:

                def on_iteration(*, iteration: int) -> None:
                    iteration_calls.append(iteration)

                def on_method(*, retrying: bool) -> None:
                    method_calls.append(retrying)

                context.on_iteration_complete(on_iteration)
                context.on_method_complete(on_method)

                async for iteration in context.loop("Test"):
                    if iteration == 1:
                        break

                return GeneralResponse()

        await self.rbt.up(
            Application(servicers=[TestServicer]),
            # Effect validation is the default; pass it explicitly to
            # be obvious about what this test is exercising.
            effect_validation=EffectValidation.ENABLED,
        )

        context = self.rbt.create_external_context(name=self.id())

        g, _ = await General.constructor_writer(context)

        await g.workflow(context)

        # Iteration 0 completes for real; iteration 1's body `break`s
        # before completing. During effect validation the framework
        # re-runs the method body and the loop is expected to break at
        # the last persisted iteration (which is 1, where we break) --
        # so no iteration body re-runs to completion and no extra
        # `on_iteration_complete` call is made.
        self.assertEqual(iteration_calls, [0])

        # The method body runs twice. The first attempt ends with
        # `retrying=True` because the framework triggers the
        # validation re-run by raising `EffectValidationRetry` out of
        # the body; the second (validation) attempt returns normally
        # with `retrying=False`.
        self.assertEqual(method_calls, [True, False])

    async def test_workflow_iteration_complete_exception_retries_iteration(
        self,
    ) -> None:
        """If `on_iteration_complete` raises, the exception
        propagates out of the iteration body and the workflow
        method gets retried -- including this iteration, since
        the iteration counter has not yet been advanced.
        """
        # Track how many times we execute iteration 0. Without the
        # retry-includes-this-iteration semantics this would be 1;
        # with them it should be 2 (the iteration runs, the callable
        # raises, the iteration runs again, the callable succeeds).
        iteration_0_runs = 0
        iteration_1_runs = 0
        on_iteration_runs = 0

        class TestServicer(GeneralServicer):

            def authorizer(self):
                return allow()

            async def constructor_writer(
                self,
                context: WriterContext,
                state: General.State,
                request: GeneralRequest,
            ) -> GeneralResponse:
                return GeneralResponse()

            @classmethod
            async def workflow(
                cls,
                context: WorkflowContext,
                request: GeneralRequest,
            ) -> GeneralResponse:

                def on_iteration(*, iteration: int) -> None:
                    nonlocal on_iteration_runs
                    on_iteration_runs += 1
                    if iteration == 0 and on_iteration_runs == 1:
                        raise RuntimeError("Forcing retry of iteration 0")

                context.on_iteration_complete(on_iteration)

                async for iteration in context.loop("Test"):
                    nonlocal iteration_0_runs
                    nonlocal iteration_1_runs
                    if iteration == 0:
                        iteration_0_runs += 1
                    elif iteration == 1:
                        iteration_1_runs += 1
                        break

                return GeneralResponse()

        await self.rbt.up(
            Application(servicers=[TestServicer]),
            # Effect validation re-runs the workflow body, which would
            # double up our captures.
            effect_validation=EffectValidation.DISABLED,
        )

        context = self.rbt.create_external_context(name=self.id())

        g, _ = await General.constructor_writer(context)

        await g.workflow(context)

        # The exception fired by the callable was raised AFTER
        # iteration 0 completed but BEFORE iteration 0 was persisted,
        # so the workflow retries with iteration still at 0.
        self.assertEqual(iteration_0_runs, 2)
        # Iteration 1 only ever runs once.
        self.assertEqual(iteration_1_runs, 1)
        # The callable ran twice for iteration 0 (since once of them
        # raised) and never for iteration 1 because of `break`.
        self.assertEqual(on_iteration_runs, 2)

    async def test_workflow_method_complete_exception_retries_workflow(
        self,
    ) -> None:
        """If `on_method_complete` raises after a normal return,
        the exception propagates out of the method body and the
        workflow gets retried.
        """
        method_runs = 0
        on_method_runs = 0

        class TestServicer(GeneralServicer):

            def authorizer(self):
                return allow()

            async def constructor_writer(
                self,
                context: WriterContext,
                state: General.State,
                request: GeneralRequest,
            ) -> GeneralResponse:
                return GeneralResponse()

            @classmethod
            async def workflow(
                cls,
                context: WorkflowContext,
                request: GeneralRequest,
            ) -> GeneralResponse:
                nonlocal method_runs
                method_runs += 1

                def on_method(*, retrying: bool) -> None:
                    nonlocal on_method_runs
                    on_method_runs += 1
                    # Raise on the very first attempt to force a
                    # retry; subsequent attempts succeed.
                    if on_method_runs == 1:
                        raise RuntimeError("Forcing retry of workflow method")

                context.on_method_complete(on_method)

                return GeneralResponse()

        await self.rbt.up(
            Application(servicers=[TestServicer]),
            # Effect validation re-runs the workflow body, which would
            # double up our captures.
            effect_validation=EffectValidation.DISABLED,
        )

        context = self.rbt.create_external_context(name=self.id())

        g, _ = await General.constructor_writer(context)

        await g.workflow(context)

        # The method ran twice: once where the callable raised, then
        # once as part of the retry where the callable succeeded.
        self.assertEqual(method_runs, 2)
        self.assertEqual(on_method_runs, 2)


if __name__ == '__main__':
    unittest.main()
