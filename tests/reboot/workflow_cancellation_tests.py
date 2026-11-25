"""Tests for the cancellation semantics of workflows: cancellation is
delivered as `asyncio.CancelledError` only at suspension points
(`until`, `sleep`, the start of a control loop iteration) or after a
step that is in flight has completed, cleanup in an `except
asyncio.CancelledError` block uses the same primitives as any other
code, and where the cancellation landed is recorded so that a retry
of the workflow lands it in the same place.
"""

import asyncio
import unittest
from datetime import timedelta
from rbt.v1alpha1 import errors_pb2
from reboot.aio.applications import Application
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import (
    EffectValidation,
    WorkflowContext,
    WriterContext,
)
from reboot.aio.tests import Reboot
from reboot.aio.workflows import at_least_once, sleep, until
from tests.reboot.general_rbt import General, GeneralRequest, GeneralResponse
from tests.reboot.general_servicer import GeneralServicer

# How long a test waits for the workflow to reach a point we control.
TIMEOUT_SECONDS = 20

# The tests below count how often the function passed to a step ran;
# effect validation would (deliberately) run each of them twice.
EFFECT_VALIDATION = EffectValidation.DISABLED


class WorkflowCancellationTestCase(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def assert_cancelled(self, task) -> None:
        """Asserts that awaiting `task` reports that it was cancelled."""
        with self.assertRaises(General.WorkflowAborted) as aborted:
            await task
        self.assertEqual(type(aborted.exception.error), errors_pb2.Cancelled)

    async def test_cancel_delivered_at_until_then_cleanup_runs(self) -> None:
        """A workflow suspended in an `until` sees `CancelledError` there,
        its cleanup steps run, and the task finishes as cancelled."""
        opened: list[int] = []
        cleaned_up: list[int] = []
        after_until: list[int] = []
        waiting = asyncio.Event()

        class Servicer(GeneralServicer):

            def authorizer(self):
                return allow()

            async def ConstructorWriter(
                self,
                context: WriterContext,
                state: General.State,
                request: GeneralRequest,
            ) -> GeneralResponse:
                return GeneralResponse()

            async def Workflow(
                self,
                context: WorkflowContext,
                request: GeneralRequest,
            ) -> GeneralResponse:

                async def open_ticket() -> int:
                    opened.append(1)
                    return 42

                ticket = await at_least_once('open', context, open_ticket)

                try:

                    async def technician_assigned() -> bool:
                        state = await General.ref().read(context)
                        waiting.set()
                        return 'technician' in state.content

                    await until(
                        'technician assigned',
                        context,
                        technician_assigned,
                    )
                except asyncio.CancelledError:

                    async def cancel_ticket() -> None:
                        cleaned_up.append(ticket)

                    await at_least_once('cancel', context, cancel_ticket)
                    raise

                after_until.append(1)
                return GeneralResponse()

        await self.rbt.up(
            Application(servicers=[Servicer]),
            effect_validation=EFFECT_VALIDATION,
        )

        context = self.rbt.create_external_context(
            name=self.id(),
            app_internal=True,
        )

        general, _ = await General.ConstructorWriter(context)

        task = await general.spawn().Workflow(context)

        await asyncio.wait_for(waiting.wait(), timeout=TIMEOUT_SECONDS)

        # Returns once the workflow has finished, swallowing the
        # `Cancelled` outcome.
        await asyncio.wait_for(task.cancel(), timeout=TIMEOUT_SECONDS)

        self.assertEqual(opened, [1])
        self.assertEqual(cleaned_up, [42])
        self.assertEqual(after_until, [])

        await self.assert_cancelled(task)

        # Cancelling a task that has already finished is a no-op.
        await task.cancel()

    async def test_step_in_flight_is_shielded(self) -> None:
        """A cancellation requested while a step runs is delivered only
        after the step has completed (and its result is memoized), and
        the cleanup sees that result."""
        step_started = asyncio.Event()
        step_may_finish = asyncio.Event()
        step_interrupted: list[bool] = []
        after_step: list[int] = []
        cleaned_up: list[int] = []

        class Servicer(GeneralServicer):

            def authorizer(self):
                return allow()

            async def ConstructorWriter(
                self,
                context: WriterContext,
                state: General.State,
                request: GeneralRequest,
            ) -> GeneralResponse:
                return GeneralResponse()

            async def Workflow(
                self,
                context: WorkflowContext,
                request: GeneralRequest,
            ) -> GeneralResponse:
                ticket = 0
                try:

                    async def open_ticket() -> int:
                        step_started.set()
                        try:
                            await step_may_finish.wait()
                        except asyncio.CancelledError:
                            step_interrupted.append(True)
                            raise
                        return 7

                    ticket = await at_least_once('open', context, open_ticket)
                    after_step.append(ticket)
                except asyncio.CancelledError:

                    async def cancel_ticket() -> None:
                        cleaned_up.append(ticket)

                    await at_least_once('cancel', context, cancel_ticket)
                    raise

                return GeneralResponse()

        await self.rbt.up(
            Application(servicers=[Servicer]),
            effect_validation=EFFECT_VALIDATION,
        )

        context = self.rbt.create_external_context(
            name=self.id(),
            app_internal=True,
        )

        general, _ = await General.ConstructorWriter(context)

        task = await general.spawn().Workflow(context)

        await asyncio.wait_for(step_started.wait(), timeout=TIMEOUT_SECONDS)

        cancel = asyncio.create_task(task.cancel())

        # Give the cancellation request ample time to reach the
        # workflow: the step must keep running regardless.
        await asyncio.sleep(2)

        self.assertFalse(cancel.done())
        self.assertEqual(step_interrupted, [])

        step_may_finish.set()

        await asyncio.wait_for(cancel, timeout=TIMEOUT_SECONDS)

        # The step completed, but the workflow never got its result:
        # the cancellation was raised right after the step instead.
        self.assertEqual(step_interrupted, [])
        self.assertEqual(after_step, [])
        # The cleanup ran with the step's memoized result, i.e., the
        # step was not run again.
        self.assertEqual(cleaned_up, [7])

        await self.assert_cancelled(task)

    async def test_replay_delivers_cancellation_at_same_point(self) -> None:
        """A workflow that crashes while cleaning up after a cancellation
        is recovered, replays to the same `except` block with its
        cleanup steps memoized, and finishes the cleanup."""
        opened: list[int] = []
        condition_checked = asyncio.Event()
        cleanup_entered: list[int] = []
        cleanup_first_step: list[int] = []
        cleanup_second_step: list[int] = []
        cleanup_blocked = asyncio.Event()
        cleanup_may_continue = asyncio.Event()

        class Servicer(GeneralServicer):

            def authorizer(self):
                return allow()

            async def ConstructorWriter(
                self,
                context: WriterContext,
                state: General.State,
                request: GeneralRequest,
            ) -> GeneralResponse:
                return GeneralResponse()

            async def Workflow(
                self,
                context: WorkflowContext,
                request: GeneralRequest,
            ) -> GeneralResponse:

                async def open_ticket() -> int:
                    opened.append(1)
                    return 42

                ticket = await at_least_once('open', context, open_ticket)

                try:

                    async def technician_assigned() -> bool:
                        state = await General.ref().read(context)
                        condition_checked.set()
                        return 'technician' in state.content

                    await until(
                        'technician assigned',
                        context,
                        technician_assigned,
                    )
                except asyncio.CancelledError:
                    cleanup_entered.append(1)

                    async def cancel_ticket() -> None:
                        cleanup_first_step.append(ticket)

                    await at_least_once('cancel', context, cancel_ticket)

                    # Hold the cleanup here (the first time) so that
                    # the test can bring the application down in the
                    # middle of it.
                    cleanup_blocked.set()
                    await cleanup_may_continue.wait()

                    async def release_reservation() -> None:
                        cleanup_second_step.append(ticket)

                    await at_least_once(
                        'release', context, release_reservation
                    )
                    raise

                return GeneralResponse()

        revision = await self.rbt.up(
            Application(servicers=[Servicer]),
            effect_validation=EFFECT_VALIDATION,
        )

        context = self.rbt.create_external_context(
            name=self.id(),
            app_internal=True,
        )

        general, _ = await General.ConstructorWriter(context)

        task = await general.spawn().Workflow(context)

        await asyncio.wait_for(
            condition_checked.wait(), timeout=TIMEOUT_SECONDS
        )

        # Request cancellation (in the background, as `cancel()` also
        # waits for the task to finish, which it won't before we
        # bring the application back up).
        cancel = asyncio.create_task(task.cancel())

        await asyncio.wait_for(
            cleanup_blocked.wait(), timeout=TIMEOUT_SECONDS
        )

        self.assertEqual(cleanup_entered, [1])
        self.assertEqual(cleanup_first_step, [42])
        self.assertEqual(cleanup_second_step, [])

        # "Crash" in the middle of the cleanup.
        await self.rbt.down()

        cancel.cancel()
        try:
            await cancel
        except BaseException:
            pass

        cleanup_may_continue.set()

        await self.rbt.up(revision=revision)

        await self.assert_cancelled(
            asyncio.wait_for(
                General.WorkflowTask.retrieve(context, task_id=task.task_id),
                timeout=TIMEOUT_SECONDS,
            )
        )

        # The replay landed in the same `except` block (without
        # running the `until` condition again, which would have set
        # `condition_checked` -- it is checked below by the count of
        # `cleanup_entered`), with the first cleanup step memoized and
        # the second one run.
        self.assertEqual(opened, [1])
        self.assertEqual(cleanup_entered, [1, 1])
        self.assertEqual(cleanup_first_step, [42])
        self.assertEqual(cleanup_second_step, [42])

    async def test_cancel_before_scheduled_start(self) -> None:
        """A task cancelled before its scheduled start time never runs."""
        ran: list[int] = []

        class Servicer(GeneralServicer):

            def authorizer(self):
                return allow()

            async def ConstructorWriter(
                self,
                context: WriterContext,
                state: General.State,
                request: GeneralRequest,
            ) -> GeneralResponse:
                return GeneralResponse()

            async def Workflow(
                self,
                context: WorkflowContext,
                request: GeneralRequest,
            ) -> GeneralResponse:
                ran.append(1)
                return GeneralResponse()

        await self.rbt.up(
            Application(servicers=[Servicer]),
            effect_validation=EFFECT_VALIDATION,
        )

        context = self.rbt.create_external_context(
            name=self.id(),
            app_internal=True,
        )

        general, _ = await General.ConstructorWriter(context)

        task = await general.spawn(when=timedelta(hours=1)).Workflow(context)

        await asyncio.wait_for(task.cancel(), timeout=TIMEOUT_SECONDS)

        self.assertEqual(ran, [])

        await self.assert_cancelled(task)

    async def test_sleep(self) -> None:
        """`sleep` is a suspension point: a short one completes, a long one
        is where a cancellation is delivered."""
        slept: list[str] = []
        sleeping = asyncio.Event()
        cleaned_up: list[int] = []

        class Servicer(GeneralServicer):

            def authorizer(self):
                return allow()

            async def ConstructorWriter(
                self,
                context: WriterContext,
                state: General.State,
                request: GeneralRequest,
            ) -> GeneralResponse:
                return GeneralResponse()

            async def Workflow(
                self,
                context: WorkflowContext,
                request: GeneralRequest,
            ) -> GeneralResponse:
                await sleep('short nap', context, 0.1)
                slept.append('short')

                await sleep('another short nap', context, timedelta(
                    milliseconds=100
                ))
                slept.append('another short')

                try:
                    sleeping.set()
                    await sleep('long nap', context, timedelta(hours=1))
                    slept.append('long')
                except asyncio.CancelledError:

                    async def cleanup() -> None:
                        cleaned_up.append(1)

                    await at_least_once('cleanup', context, cleanup)
                    raise

                return GeneralResponse()

        await self.rbt.up(
            Application(servicers=[Servicer]),
            effect_validation=EFFECT_VALIDATION,
        )

        context = self.rbt.create_external_context(
            name=self.id(),
            app_internal=True,
        )

        general, _ = await General.ConstructorWriter(context)

        task = await general.spawn().Workflow(context)

        await asyncio.wait_for(sleeping.wait(), timeout=TIMEOUT_SECONDS)

        await asyncio.wait_for(task.cancel(), timeout=TIMEOUT_SECONDS)

        self.assertEqual(slept, ['short', 'another short'])
        self.assertEqual(cleaned_up, [1])

        await self.assert_cancelled(task)

    async def test_catching_cancellation_and_returning(self) -> None:
        """A workflow may catch the cancellation and return a value, which
        is then the task's outcome."""
        waiting = asyncio.Event()

        class Servicer(GeneralServicer):

            def authorizer(self):
                return allow()

            async def ConstructorWriter(
                self,
                context: WriterContext,
                state: General.State,
                request: GeneralRequest,
            ) -> GeneralResponse:
                return GeneralResponse()

            async def Workflow(
                self,
                context: WorkflowContext,
                request: GeneralRequest,
            ) -> GeneralResponse:
                try:

                    async def never() -> bool:
                        await General.ref().read(context)
                        waiting.set()
                        return False

                    await until('never', context, never)
                except asyncio.CancelledError:
                    return GeneralResponse()

                raise AssertionError('unreachable')

        await self.rbt.up(
            Application(servicers=[Servicer]),
            effect_validation=EFFECT_VALIDATION,
        )

        context = self.rbt.create_external_context(
            name=self.id(),
            app_internal=True,
        )

        general, _ = await General.ConstructorWriter(context)

        task = await general.spawn().Workflow(context)

        await asyncio.wait_for(waiting.wait(), timeout=TIMEOUT_SECONDS)

        await asyncio.wait_for(task.cancel(), timeout=TIMEOUT_SECONDS)

        # The task finished with a response, not as cancelled.
        self.assertEqual(type(await task), GeneralResponse)

    async def test_cancel_delivered_at_start_of_loop_iteration(self) -> None:
        """A control loop idling between iterations is a suspension point:
        the cancellation is delivered at the start of the next iteration,
        into the `except` block around the loop."""
        iterations: list[int] = []
        cleaned_up: list[int] = []
        first_iteration_done = asyncio.Event()

        class Servicer(GeneralServicer):

            def authorizer(self):
                return allow()

            async def ConstructorWriter(
                self,
                context: WriterContext,
                state: General.State,
                request: GeneralRequest,
            ) -> GeneralResponse:
                return GeneralResponse()

            async def Workflow(
                self,
                context: WorkflowContext,
                request: GeneralRequest,
            ) -> GeneralResponse:
                try:
                    async for iteration in context.loop(
                        'poll',
                        interval=timedelta(hours=1),
                    ):

                        async def poll() -> int:
                            iterations.append(iteration)
                            return iteration

                        await at_least_once('poll', context, poll)

                        first_iteration_done.set()
                except asyncio.CancelledError:

                    async def cleanup() -> None:
                        cleaned_up.append(len(iterations))

                    await at_least_once('cleanup', context, cleanup)
                    raise

                raise AssertionError('unreachable')

        await self.rbt.up(
            Application(servicers=[Servicer]),
            effect_validation=EFFECT_VALIDATION,
        )

        context = self.rbt.create_external_context(
            name=self.id(),
            app_internal=True,
        )

        general, _ = await General.ConstructorWriter(context)

        task = await general.spawn().Workflow(context)

        await asyncio.wait_for(
            first_iteration_done.wait(), timeout=TIMEOUT_SECONDS
        )

        await asyncio.wait_for(task.cancel(), timeout=TIMEOUT_SECONDS)

        self.assertEqual(iterations, [0])
        self.assertEqual(cleaned_up, [1])

        await self.assert_cancelled(task)


if __name__ == '__main__':
    unittest.main()
