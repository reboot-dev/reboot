import asyncio
import unittest
from datetime import datetime, timedelta
from rbt.v1alpha1 import errors_pb2, tasks_pb2
from reboot.aio.aborted import SystemAborted
from reboot.aio.applications import Application
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import (
    EffectValidation,
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

                async def callable():
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
                        type=General.State,
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


if __name__ == '__main__':
    unittest.main()
