import asyncio
import grpc.aio
import os
import unittest
from datetime import timedelta
from google.protobuf import any_pb2
from google.rpc import status_pb2
from rbt.v1alpha1 import errors_pb2, tasks_pb2, tasks_pb2_grpc
from reboot.aio.aborted import Aborted, SystemAborted
from reboot.aio.applications import Application
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import WorkflowContext, WriterContext
from reboot.aio.external import ExternalContext
from reboot.aio.headers import (
    AUTHORIZATION_HEADER,
    SERVER_ID_HEADER,
    STATE_REF_HEADER,
)
from reboot.aio.internals.tasks_dispatcher import Backoff
from reboot.aio.tests import Reboot
from reboot.aio.types import StateRef, StateTypeName
from reboot.settings import ENVVAR_SECRET_REBOOT_ADMIN_TOKEN
from reboot.ssl.localhost import LOCALHOST_CRT_DATA
from tests.reboot.echo_rbt import Echo, SpecifiedError
from tests.reboot.echo_servicers import MyEchoServicer, retry_budget
from tests.reboot.general_rbt import General, GeneralRequest, GeneralResponse
from tests.reboot.general_servicer import GeneralServicer
from unittest.mock import patch

TEST_SECRET_REBOOT_ADMIN_TOKEN = 'test-admin-secret'


class TasksServicerTestCase(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        os.environ[ENVVAR_SECRET_REBOOT_ADMIN_TOKEN
                  ] = TEST_SECRET_REBOOT_ADMIN_TOKEN

        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def _check_tasks(
        self,
        tasks: list[tasks_pb2.TaskInfo],
        stub: tasks_pb2_grpc.TasksStub,
    ):
        list_tasks_response = await stub.ListTasks(
            tasks_pb2.ListTasksRequest(),
            metadata=(
                (
                    AUTHORIZATION_HEADER,
                    f'Bearer {TEST_SECRET_REBOOT_ADMIN_TOKEN}'
                ),
            ),
        )

        self.assertEqual(len(tasks), len(list_tasks_response.tasks))

        for task_info in list_tasks_response.tasks:
            # Because we can't predict the exact timestamps, only
            # confirm that they are present.
            self.assertGreater(task_info.occurred_at.seconds, 0)
            self.assertGreater(task_info.scheduled_at.seconds, 0)

            # Perform the rest of the comparison without timestamps.
            task_info.occurred_at.Clear()
            task_info.scheduled_at.Clear()

        for task_info in tasks:
            task_info.occurred_at.Clear()
            task_info.scheduled_at.Clear()

        # NOTE: despite the name, this assertion checks that the
        #       contents of the tasks are equal (only disregarding
        #       order).
        self.assertCountEqual(tasks, list_tasks_response.tasks)

    async def _cancel_task(
        self,
        stub: tasks_pb2_grpc.TasksStub,
        task_id: tasks_pb2.TaskId,
        response_statuses: list[tasks_pb2.CancelTaskResponse.Status.ValueType
                               ] = [tasks_pb2.CancelTaskResponse.Status.OK],
    ):
        cancel_task_response = await stub.CancelTask(
            tasks_pb2.CancelTaskRequest(
                task_id=task_id,
            ),
            metadata=(
                (STATE_REF_HEADER, task_id.state_ref),
                (
                    AUTHORIZATION_HEADER,
                    f'Bearer {TEST_SECRET_REBOOT_ADMIN_TOKEN}'
                ),
            ),
        )

        self.assertIn(
            cancel_task_response.status,
            response_statuses,
        )

    async def _wait_task(
        self,
        stub: tasks_pb2_grpc.TasksStub,
        task_id: tasks_pb2.TaskId,
        error: bool = False,
    ):
        wait_response = await stub.Wait(
            tasks_pb2.WaitRequest(task_id=task_id),
            metadata=(
                (STATE_REF_HEADER, task_id.state_ref),
                (
                    AUTHORIZATION_HEADER,
                    f'Bearer {TEST_SECRET_REBOOT_ADMIN_TOKEN}'
                ),
            ),
        )
        self.assertEqual(
            wait_response.response_or_error.WhichOneof('response_or_error'),
            'error' if error else 'response',
        )

    async def _check_tasks_with_retry(
        self,
        tasks: list[tasks_pb2.TaskInfo],
        stub: tasks_pb2_grpc.TasksStub,
        timeout: float = 5.0,
    ):
        """Retry `_check_tasks` until it succeeds or we time out."""
        for _ in range(int(timeout * 10)):
            try:
                await self._check_tasks(tasks, stub)
                return
            except AssertionError:
                await asyncio.sleep(0.1)
        # Last try, will fail with assertion.
        await self._check_tasks(tasks, stub)

    # NOTE: For all tests we override timestamp to be empty.

    async def test_tasks_aggregation(self) -> None:
        """Tests that tasks can be aggregated from all servers."""

        # First bring up a service and start a task.
        revision = await self.rbt.up(
            Application(servicers=[MyEchoServicer]),
            local_envoy=True,
            local_envoy_tls=True,  # For SSL/TLS test coverage.
            # The default is that we'll start multiple servers, so
            # aggregation will be necessary.
        )

        context = ExternalContext(
            name=self.id(), url=self.rbt.https_localhost_direct_url()
        )

        NUM_OF_TASKS = 10
        tasks: list[tasks_pb2.TaskInfo] = []

        for i in range(NUM_OF_TASKS):
            echo = Echo.ref(f'test-{i}')
            task = await echo.spawn().Hanging(context)
            tasks.append(
                tasks_pb2.TaskInfo(
                    task_id=task.task_id,
                    status=tasks_pb2.TaskInfo.Status.STARTED,
                    iterations=0,
                    num_runs_failed_recently=0,
                    method='Hanging',
                )
            )

        # Check that the created tasks are pending and stored under different
        # servers.
        channel = grpc.aio.secure_channel(
            self.rbt.localhost_direct_endpoint(),
            credentials=grpc.ssl_channel_credentials(
                root_certificates=LOCALHOST_CRT_DATA,
            ),
        )
        stub = tasks_pb2_grpc.TasksStub(channel)

        for server in self.rbt._placement_client.known_servers(
            revision.config.application_id()
        ):
            list_tasks_response = await stub.ListTasks(
                tasks_pb2.ListTasksRequest(only_server_id=server),
                metadata=(
                    (SERVER_ID_HEADER, server),
                    (
                        AUTHORIZATION_HEADER,
                        f'Bearer {TEST_SECRET_REBOOT_ADMIN_TOKEN}'
                    ),
                ),
            )
            self.assertLess(len(list_tasks_response.tasks), NUM_OF_TASKS)

        # Get all tasks from all servers.
        await self._check_tasks(tasks, stub)

    async def test_cancel_hanging_task(self) -> None:
        # First bring up a service and start a task.
        await self.rbt.up(
            Application(servicers=[MyEchoServicer]),
            local_envoy=True,
            local_envoy_tls=True,  # For SSL/TLS test coverage.
        )

        context = ExternalContext(
            name=self.id(), url=self.rbt.https_localhost_direct_url()
        )

        state_type = StateTypeName("tests.reboot.Echo")

        echo = Echo.ref('test-cancel')
        task = await echo.spawn().Hanging(context)
        task_id = task.task_id

        channel = grpc.aio.secure_channel(
            self.rbt.localhost_direct_endpoint(),
            credentials=grpc.ssl_channel_credentials(
                root_certificates=LOCALHOST_CRT_DATA,
            ),
        )
        stub = tasks_pb2_grpc.TasksStub(channel)

        # Get all tasks.
        await self._check_tasks(
            [
                tasks_pb2.TaskInfo(
                    task_id=task_id,
                    status=tasks_pb2.TaskInfo.Status.STARTED,
                    iterations=0,
                    num_runs_failed_recently=0,
                    method='Hanging',
                )
            ],
            stub,
        )

        # Cancel the task.
        await self._cancel_task(stub, task_id)

        # Confirm that waiting on the Task raises a cancelled error, which
        # additionally assures that the Task has actually completed before
        # we proceed to listing pending tasks.
        await self._wait_task(stub, task_id, True)

        # Try to cancel the task again. It should fail, since the task should be
        # already cancelled.
        await self._cancel_task(
            stub,
            task_id,
            [
                tasks_pb2.CancelTaskResponse.Status.NOT_FOUND,
                tasks_pb2.CancelTaskResponse.Status.CANCELLING
            ],
        )

        # Try to cancel some non-existing task.
        await self._cancel_task(
            stub,
            tasks_pb2.TaskId(
                state_type=state_type,
                state_ref=f"{state_type}:non-existing-state"
            ),
            [tasks_pb2.CancelTaskResponse.Status.NOT_FOUND],
        )

        # Check that the task is no longer pending.
        await self._check_tasks(
            [
                tasks_pb2.TaskInfo(
                    task_id=task_id,
                    status=tasks_pb2.TaskInfo.Status.CANCELLED,
                    iterations=0,
                    num_runs_failed_recently=0,
                    method='Hanging',
                )
            ],
            stub,
        )

    async def test_cancel_raising_task(self) -> None:

        # To avoid the race between a task scheduled in a retry loop and the task
        # is actually retried, we mock the Backoff class to never retry the
        # task, so that we can be sure that task is in SCHEDULED_RETRY state.
        class MockBackoff(Backoff):

            async def __call__(self):
                event = asyncio.Event()
                await event.wait()

        async def check_raised_error(
            stub: tasks_pb2_grpc.TasksStub,
            task_id: tasks_pb2.TaskId,
            expected_error: Aborted,
        ):
            wait_response = await stub.Wait(
                tasks_pb2.WaitRequest(task_id=task_id),
                metadata=(
                    (STATE_REF_HEADER, task_id.state_ref),
                    (
                        AUTHORIZATION_HEADER,
                        f'Bearer {TEST_SECRET_REBOOT_ADMIN_TOKEN}'
                    ),
                ),
            )

            assert wait_response.response_or_error.WhichOneof(
                'response_or_error'
            ) == 'error'

            any_result: any_pb2.Any = wait_response.response_or_error.error
            self.assertTrue(any_result.Is(status_pb2.Status.DESCRIPTOR))
            raised_status = status_pb2.Status()
            any_result.Unpack(raised_status)
            self.assertEqual(expected_error.to_status(), raised_status)

        with patch(
            'reboot.aio.internals.tasks_dispatcher.Backoff', MockBackoff
        ):
            # First bring up a service and start a task.
            await self.rbt.up(
                Application(servicers=[MyEchoServicer]),
                local_envoy=True,
                local_envoy_tls=True,  # For SSL/TLS test coverage.
            )

            external_context = ExternalContext(
                name=self.id(), url=self.rbt.https_localhost_direct_url()
            )

            state_type = StateTypeName("tests.reboot.Echo")

            echo = Echo.ref('test-cancel')
            value_error_task = await echo.spawn().RaiseValueError(
                external_context,
            )

            channel = external_context.channel_manager.get_channel_to_state(
                state_type, StateRef.from_id(state_type, "test-cancel")
            )
            stub = tasks_pb2_grpc.TasksStub(channel)

            async def wait_for_semaphore(retry_budget):
                while not retry_budget.locked():
                    await asyncio.sleep(0.1)

            # Wait for first invocation of the 'RaiseValueError', so that
            # we can be sure that we are in a retry loop and we have retried only
            # once, see comment in the 'echo_servicers.py'.
            await wait_for_semaphore(retry_budget)

            await self._check_tasks(
                [
                    tasks_pb2.TaskInfo(
                        task_id=value_error_task.task_id,
                        status=tasks_pb2.TaskInfo.Status.SCHEDULED_RETRY,
                        iterations=0,
                        num_runs_failed_recently=1,
                        method='RaiseValueError',
                    )
                ],
                stub,
            )

            await self._cancel_task(stub, value_error_task.task_id)

            await self._wait_task(stub, value_error_task.task_id, True)

            with self.assertRaises(Echo.RaiseValueErrorAborted) as aborted:
                await value_error_task
            self.assertEqual(aborted.exception.error, errors_pb2.Cancelled())
            # It's important that the string of the exception is useful,
            # since that's likely to be shown to developers.
            self.assertIn(
                "the task running 'RaiseValueError' was cancelled",
                str(aborted.exception),
            )

            await self._check_tasks(
                [
                    tasks_pb2.TaskInfo(
                        task_id=value_error_task.task_id,
                        status=tasks_pb2.TaskInfo.Status.CANCELLED,
                        iterations=0,
                        num_runs_failed_recently=1,
                        method='RaiseValueError',
                    )
                ],
                stub,
            )

            specified_error_task = await echo.spawn().RaiseSpecifiedError(
                external_context,
            )

            # Make sure that the task was aborted as expected.
            await self._wait_task(stub, specified_error_task.task_id, True)

            await self._check_tasks(
                [
                    tasks_pb2.TaskInfo(
                        task_id=value_error_task.task_id,
                        status=tasks_pb2.TaskInfo.Status.CANCELLED,
                        iterations=0,
                        num_runs_failed_recently=1,
                        method='RaiseValueError',
                    ),
                    tasks_pb2.TaskInfo(
                        task_id=specified_error_task.task_id,
                        status=tasks_pb2.TaskInfo.Status.ABORTED,
                        iterations=0,
                        num_runs_failed_recently=0,
                        method='RaiseSpecifiedError',
                    )
                ],
                stub,
            )

            await check_raised_error(
                stub,
                specified_error_task.task_id,
                Echo.RaiseSpecifiedErrorAborted(
                    SpecifiedError(error='specified error'),
                ),
            )

    async def test_wrong_task_id_task(self):
        await self.rbt.up(
            Application(servicers=[MyEchoServicer]),
            local_envoy=True,
            local_envoy_tls=True,  # For SSL/TLS test coverage.
        )

        external_context = ExternalContext(
            name=self.id(), url=self.rbt.https_localhost_direct_url()
        )

        echo = Echo.ref('test-cancel')

        replay_task = await echo.spawn().Replay(
            external_context,
        )

        specified_error_task_with_wrong_task_id = Echo.RaiseSpecifiedErrorTask.retrieve(
            external_context,
            task_id=replay_task.task_id,
        )

        with self.assertRaises(SystemAborted) as e:
            await specified_error_task_with_wrong_task_id

        self.assertIn(
            "aborted with 'InvalidArgument':",
            str(e.exception),
        )

        self.assertIn(
            "has a response of type 'tests.reboot.ReplayResponse' but expecting type "
            "'tests.reboot.echo_pb2.RaiseSpecifiedErrorResponse'; are you waiting on a task "
            "of the correct method?",
            str(e.exception),
        )

    async def test_stream_matches_list_tasks(self) -> None:
        """Tests that the responses from ListTasksStream match ListTasks."""

        # First bring up a service and start a task.
        await self.rbt.up(
            Application(servicers=[MyEchoServicer]),
            local_envoy=True,
            local_envoy_tls=True,  # For SSL/TLS test coverage.
        )

        context = ExternalContext(
            name=self.id(), url=self.rbt.https_localhost_direct_url()
        )

        # Spawn a task to ensure the list is not empty.
        echo = Echo.ref('test-current-tasks')
        _ = await echo.spawn().Hanging(context)

        channel = grpc.aio.secure_channel(
            self.rbt.localhost_direct_endpoint(),
            credentials=grpc.ssl_channel_credentials(
                root_certificates=LOCALHOST_CRT_DATA,
            ),
        )
        stub = tasks_pb2_grpc.TasksStub(channel)

        # Get the response from a unary ListTasks call.
        list_tasks_response = await stub.ListTasks(
            tasks_pb2.ListTasksRequest(),
            metadata=(
                (
                    AUTHORIZATION_HEADER,
                    f'Bearer {TEST_SECRET_REBOOT_ADMIN_TOKEN}'
                ),
            ),
        )

        # Get the first response from the ListTasksStream stream.
        list_tasks_stream = stub.ListTasksStream(
            tasks_pb2.ListTasksRequest(),
            metadata=(
                (
                    AUTHORIZATION_HEADER,
                    f'Bearer {TEST_SECRET_REBOOT_ADMIN_TOKEN}'
                ),
            ),
        )

        first_stream_response = None
        second_stream_response = None

        try:

            async def get_updates():
                nonlocal first_stream_response, second_stream_response
                async for r in list_tasks_stream:
                    if first_stream_response is None and len(r.tasks) == 1:
                        first_stream_response = r

                        # Now that we have the first response, spawn the
                        # second task.
                        echo2 = Echo.ref('test-current-tasks-2')
                        _ = await echo2.spawn().Hanging(context)

                    elif first_stream_response is not None and len(
                        r.tasks
                    ) == 2:
                        second_stream_response = r
                        break  # We have what we need.

            await asyncio.wait_for(get_updates(), timeout=10.0)
        except asyncio.TimeoutError:
            self.fail("Timed out waiting for ListTasksStream stream.")

        list_tasks_stream.cancel()

        assert first_stream_response is not None
        for task_info in list_tasks_response.tasks:
            task_info.occurred_at.Clear()
            task_info.scheduled_at.Clear()
        for task_info in first_stream_response.tasks:
            task_info.occurred_at.Clear()
            task_info.scheduled_at.Clear()
        self.assertCountEqual(
            list_tasks_response.tasks,
            first_stream_response.tasks,
        )

        assert second_stream_response is not None
        list_tasks_response_2 = await stub.ListTasks(
            tasks_pb2.ListTasksRequest(),
            metadata=(
                (
                    AUTHORIZATION_HEADER,
                    f'Bearer {TEST_SECRET_REBOOT_ADMIN_TOKEN}'
                ),
            ),
        )
        for task_info in list_tasks_response_2.tasks:
            task_info.occurred_at.Clear()
            task_info.scheduled_at.Clear()
        for task_info in second_stream_response.tasks:
            task_info.occurred_at.Clear()
            task_info.scheduled_at.Clear()
        self.assertCountEqual(
            list_tasks_response_2.tasks,
            second_stream_response.tasks,
        )

    async def test_scheduled_iteration(self) -> None:
        """Tests that a task in a loop has the SCHEDULED_ITERATION state."""

        workflow_started = asyncio.Event()
        workflow_can_proceed = asyncio.Event()

        class Servicer(GeneralServicer):

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
                workflow_started.set()
                async for _ in context.loop(
                    "Scheduled loop test",
                    interval=timedelta(
                        # Long interval to stay in state `SCHEDULED_ITERATION`.
                        days=1
                    ),
                ):
                    await workflow_can_proceed.wait()

                return GeneralResponse()

        # First bring up a service and start a task.
        await self.rbt.up(
            Application(servicers=[Servicer]),
            local_envoy=True,
            local_envoy_tls=True,
        )

        context = self.rbt.create_external_context(name=self.id())

        general, _ = await General.ConstructorWriter(
            context, "scheduled-loop-test"
        )
        task = await general.spawn().Workflow(context)

        await workflow_started.wait()

        channel = grpc.aio.secure_channel(
            self.rbt.localhost_direct_endpoint(),
            credentials=grpc.ssl_channel_credentials(
                root_certificates=LOCALHOST_CRT_DATA,
            ),
        )
        stub = tasks_pb2_grpc.TasksStub(channel)

        await self._check_tasks_with_retry(
            [
                tasks_pb2.TaskInfo(
                    task_id=task.task_id,
                    status=tasks_pb2.TaskInfo.Status.STARTED,
                    iterations=0,
                    method='Workflow',
                    num_runs_failed_recently=0,
                )
            ],
            stub,
        )

        workflow_can_proceed.set()

        # After the first iteration, it should be in SCHEDULED_ITERATION
        await self._check_tasks_with_retry(
            [
                tasks_pb2.TaskInfo(
                    task_id=task.task_id,
                    status=tasks_pb2.TaskInfo.Status.SCHEDULED_ITERATION,
                    iterations=1,
                    method='Workflow',
                    num_runs_failed_recently=0,
                )
            ],
            stub,
        )

        # Cancel the task to avoid it hanging around.
        await self._cancel_task(stub, task.task_id)

    async def test_iteration_count(self) -> None:
        """Tests that a task in a loop counts its iterations correctly."""

        NUM_ITERATIONS = 5

        class Servicer(GeneralServicer):

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
                async for i in context.loop(
                    "Scheduled loop test",
                    # No interval; tight loop.
                ):
                    # `i` is zero-indexed, so we must add 1 to get the
                    # number of iterations so far.
                    if i + 1 >= NUM_ITERATIONS:
                        break

                return GeneralResponse()

        # Bring up a service and start the task that loops.
        await self.rbt.up(
            Application(servicers=[Servicer]),
            local_envoy=True,
            local_envoy_tls=True,
        )

        context = self.rbt.create_external_context(name=self.id())

        general, _ = await General.ConstructorWriter(
            context, "test_iteration_count"
        )
        task = await general.spawn().Workflow(context)

        # After the task completes, it should have run NUM_ITERATIONS times.
        await task
        channel = grpc.aio.secure_channel(
            self.rbt.localhost_direct_endpoint(),
            credentials=grpc.ssl_channel_credentials(
                root_certificates=LOCALHOST_CRT_DATA,
            ),
        )
        stub = tasks_pb2_grpc.TasksStub(channel)
        await self._check_tasks(
            [
                tasks_pb2.TaskInfo(
                    task_id=task.task_id,
                    status=tasks_pb2.TaskInfo.Status.COMPLETED,
                    iterations=NUM_ITERATIONS,
                    method='Workflow',
                    num_runs_failed_recently=0,
                )
            ],
            stub,
        )


if __name__ == '__main__':
    unittest.main()
