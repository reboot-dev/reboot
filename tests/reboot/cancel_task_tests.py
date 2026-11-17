import asyncio
import unittest
from rbt.v1alpha1 import errors_pb2, tasks_pb2
from reboot.aio.aborted import Aborted
from reboot.aio.applications import Application
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import (
    EffectValidation,
    ReaderContext,
    TransactionContext,
    WorkflowContext,
    WriterContext,
)
from reboot.aio.external import ExternalContext
from reboot.aio.internals.tasks_dispatcher import TasksDispatcher
from reboot.aio.tests import Reboot
from tests.reboot.general_rbt import (
    General,
    GeneralError,
    GeneralRequest,
    GeneralResponse,
)
from tests.reboot.general_servicer import GeneralServicer
from unittest import mock


def _task_id_content(task_id: tasks_pb2.TaskId) -> dict[str, str]:
    """The request content that carries `task_id` to the methods of
    `CancellingServicer`."""
    return {'task_id': task_id.SerializeToString().hex()}


def _task_id_from_content(request: GeneralRequest) -> tasks_pb2.TaskId:
    return tasks_pb2.TaskId.FromString(
        bytes.fromhex(request.content['task_id'])
    )


class CancellingServicer(GeneralServicer):
    """`Workflow` runs until it is cancelled; every other method cancels
    the task whose ID the request carries, and aborts afterwards if the
    request says so."""

    # Set once `Workflow` is running, and once it has been cancelled.
    workflow_started: asyncio.Event
    workflow_cancelled: asyncio.Event

    def authorizer(self):
        return allow()

    async def ConstructorWriter(
        self,
        context: WriterContext,
        state: General.State,
        request: GeneralRequest,
    ) -> GeneralResponse:
        return GeneralResponse()

    @classmethod
    async def Workflow(
        cls,
        context: WorkflowContext,
        request: GeneralRequest,
    ) -> GeneralResponse:
        cls.workflow_started.set()
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            cls.workflow_cancelled.set()
            raise
        raise Exception('Should never get here!')

    @classmethod
    async def SecondWorkflow(
        cls,
        context: WorkflowContext,
        request: GeneralRequest,
    ) -> GeneralResponse:
        await General.WorkflowTask.retrieve(
            context,
            task_id=_task_id_from_content(request),
        ).cancel()
        return GeneralResponse(content={'cancelled': 'true'})

    async def Reader(
        self,
        context: ReaderContext,
        state: General.State,
        request: GeneralRequest,
    ) -> GeneralResponse:
        await General.WorkflowTask.retrieve(
            context,
            task_id=_task_id_from_content(request),
        ).cancel()
        return GeneralResponse()

    async def Writer(
        self,
        context: WriterContext,
        state: General.State,
        request: GeneralRequest,
    ) -> GeneralResponse:
        await General.WorkflowTask.retrieve(
            context,
            task_id=_task_id_from_content(request),
        ).cancel()
        if request.content.get('abort') == 'true':
            raise ValueError('Aborting after cancelling')
        return GeneralResponse()

    async def Transaction(
        self,
        context: TransactionContext,
        state: General.State,
        request: GeneralRequest,
    ) -> GeneralResponse:
        await General.WorkflowTask.retrieve(
            context,
            task_id=_task_id_from_content(request),
        ).cancel()
        if request.content.get('abort') == 'true':
            raise General.TransactionAborted(GeneralError())
        return GeneralResponse()


class CancelTaskTestCase(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        CancellingServicer.workflow_started = asyncio.Event()
        CancellingServicer.workflow_cancelled = asyncio.Event()

        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def _spawn_workflow(
        self,
        effect_validation: EffectValidation = EffectValidation.DISABLED,
    ) -> tuple[ExternalContext, General.WeakReference, General.WorkflowTask]:
        """Serves `CancellingServicer` and spawns its `Workflow`,
        returning once the workflow is running."""
        await self.rbt.up(
            Application(servicers=[CancellingServicer]),
            effect_validation=effect_validation,
        )

        context = self.rbt.create_external_context(name=self.id())

        general, _ = await General.ConstructorWriter(context)

        task = await general.spawn().Workflow(context)

        await CancellingServicer.workflow_started.wait()

        return context, general, task

    async def _assert_cancelled(self, task: General.WorkflowTask) -> None:
        """Asserts that `task` was cancelled: the workflow saw the
        cancellation and the task finished with `Cancelled`."""
        with self.assertRaises(Aborted) as aborted:
            await task
        self.assertIsInstance(aborted.exception.error, errors_pb2.Cancelled)
        self.assertTrue(CancellingServicer.workflow_cancelled.is_set())

    async def test_cancel_from_workflow(self) -> None:
        context, general, task = await self._spawn_workflow()

        # `cancel()` from a workflow waits for the task to finish, so
        # the workflow has been cancelled once the canceller returns.
        response = await general.SecondWorkflow(
            context,
            content=_task_id_content(task.task_id),
        )
        self.assertEqual(response.content['cancelled'], 'true')
        self.assertTrue(CancellingServicer.workflow_cancelled.is_set())

        await self._assert_cancelled(task)

        # Cancelling a task that has already finished leaves it as is.
        await general.SecondWorkflow(
            context,
            content=_task_id_content(task.task_id),
        )

    async def test_cancel_from_writer(self) -> None:
        context, general, task = await self._spawn_workflow(
            effect_validation=EffectValidation.ENABLED,
        )

        # The writer runs twice to validate its effects; the
        # cancellation is an effect and so must be requested once.
        cancel_tasks = TasksDispatcher.cancel_tasks
        cancelled_task_ids: list[tasks_pb2.TaskId] = []

        def cancel_tasks_and_record(
            self: TasksDispatcher,
            task_ids: list[tasks_pb2.TaskId],
        ) -> None:
            cancelled_task_ids.extend(task_ids)
            cancel_tasks(self, task_ids)

        with mock.patch.object(
            TasksDispatcher,
            'cancel_tasks',
            cancel_tasks_and_record,
        ):
            await general.Writer(
                context,
                content=_task_id_content(task.task_id),
            )

            await self._assert_cancelled(task)

        self.assertEqual(cancelled_task_ids, [task.task_id])

    async def test_cancel_from_aborted_writer(self) -> None:
        context, general, task = await self._spawn_workflow()

        with self.assertRaises(Aborted):
            await general.Writer(
                context,
                content=_task_id_content(task.task_id) | {'abort': 'true'},
            )

        # The writer aborted, so its effects, the cancellation among
        # them, were dropped: the workflow is still running.
        await asyncio.sleep(1)
        self.assertFalse(CancellingServicer.workflow_cancelled.is_set())

        # A writer that completes does cancel it. The aborted call left
        # `context` unsure whether its mutation happened, so use a
        # fresh one.
        context = self.rbt.create_external_context(name=f'{self.id()}-2')
        general = General.ref(general.state_id)

        await general.Writer(
            context,
            content=_task_id_content(task.task_id),
        )

        await self._assert_cancelled(task)

    async def test_cancel_from_transaction(self) -> None:
        context, general, task = await self._spawn_workflow()

        await general.Transaction(
            context,
            content=_task_id_content(task.task_id),
        )

        await self._assert_cancelled(task)

    async def test_cancel_from_aborted_transaction(self) -> None:
        context, general, task = await self._spawn_workflow()

        with self.assertRaises(General.TransactionAborted):
            await general.Transaction(
                context,
                content=_task_id_content(task.task_id) | {'abort': 'true'},
            )

        # The transaction aborted, so its effects, the cancellation
        # among them, were dropped: the workflow is still running.
        await asyncio.sleep(1)
        self.assertFalse(CancellingServicer.workflow_cancelled.is_set())

        # A transaction that commits does cancel it.
        await general.Transaction(
            context,
            content=_task_id_content(task.task_id),
        )

        await self._assert_cancelled(task)

    async def test_cancel_from_reader_is_an_error(self) -> None:
        context, general, task = await self._spawn_workflow()

        with self.assertRaises(Aborted):
            await general.Reader(
                context,
                content=_task_id_content(task.task_id),
            )

        self.assertFalse(CancellingServicer.workflow_cancelled.is_set())


if __name__ == '__main__':
    unittest.main()
