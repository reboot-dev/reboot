import inspect
import logging
import unittest
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
from reboot.aio.internals.middleware import (
    _has_ever_explained_effect_validation,
)
from reboot.aio.tests import Reboot
from reboot.aio.workflows import at_least_once
from reboot.time import DateTimeWithTimeZone
from tests.reboot import general_rbt
from tests.reboot.general_rbt import General, GeneralRequest, GeneralResponse
from tests.reboot.general_servicer import GeneralServicer

_EFFECTS: list[str] = []
# Counts how many times the callable passed to `at_least_once` with
# `effect_validation=EffectValidation.DISABLED` is actually invoked.
_DIRECT_CALLS: int = 0


def record_effect() -> None:
    caller = inspect.stack()[1][3]
    _EFFECTS.append(caller)


# To test our boilerplate code generator, instead of inheriting from
# `general_rbt.General.Servicer` like a user normally would, we inherit from
# the boilerplate code generated into `general_servicer.GeneralServicer`. This
# is functionally insignificant, since the boilerplate `GeneralServicer` doesn't
# add any functionality to the `General.Servicer` but merely summarizes it in a
# separate file, but from a testing perspective it helps ensure that the
# boilerplate code passes type checks and is correct.
# We are covering transaction and constructor tests here.
class EffectServicer(GeneralServicer):
    """An implementation of the General interface which records an effect for each method call."""

    def authorizer(self):
        return allow()

    async def constructor_transaction(
        self,
        context: TransactionContext,
        state: General.State,
        request: GeneralRequest,
    ) -> GeneralResponse:
        record_effect()
        return GeneralResponse()

    async def constructor_writer(
        self,
        context: WriterContext,
        state: General.State,
        request: GeneralRequest,
    ) -> GeneralResponse:
        record_effect()
        return GeneralResponse()

    async def reader(
        self,
        context: ReaderContext,
        state: General.State,
        request: GeneralRequest,
    ) -> GeneralResponse:
        record_effect()
        return GeneralResponse()

    async def writer(
        self,
        context: WriterContext,
        state: General.State,
        request: GeneralRequest,
    ) -> GeneralResponse:
        record_effect()
        return GeneralResponse()

    async def transaction(
        self,
        context: TransactionContext,
        state: General.State,
        request: GeneralRequest,
    ) -> GeneralResponse:
        record_effect()
        general = General.ref(context.state_id)
        await general.Reader(context)
        await general.Writer(context)
        return GeneralResponse()

    @classmethod
    async def workflow(
        cls,
        context: WorkflowContext,
        request: GeneralRequest,
    ) -> GeneralResponse:
        record_effect()
        general = General.ref(context.state_id)
        await general.Reader(context)
        await general.Writer(context)
        return GeneralResponse()


class EffectValidationPerCallDisabledServicer(EffectServicer):
    """A servicer whose workflow explicitly calls `at_least_once` with
    `effect_validation=EffectValidation.DISABLED` so the callable is not
    re-run even when the context has effect validation enabled.
    """

    @classmethod
    async def workflow(
        cls,
        context: WorkflowContext,
        request: GeneralRequest,
    ) -> GeneralResponse:

        async def expensive_call() -> GeneralResponse:
            global _DIRECT_CALLS
            _DIRECT_CALLS += 1
            return GeneralResponse()

        return await at_least_once(
            "expensive_call",
            context,
            expensive_call,
            effect_validation=EffectValidation.DISABLED,
        )


class EffectValidationTestCase(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        self.reset_effects()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    def reset_effects(self) -> None:
        global _EFFECTS
        _EFFECTS = []

    def assert_effects(self, *args: str) -> None:
        expected = '\n'.join(args)
        actual = '\n'.join(_EFFECTS)
        self.assertEqual(
            _EFFECTS,
            list(args),
            msg=f"Expected:\n{expected}\n\nGot:\n{actual}",
        )

    async def up(self, effect_validation: EffectValidation) -> ExternalContext:
        await self.rbt.up(
            Application(servicers=[EffectServicer]),
            effect_validation=effect_validation,
        )
        return self.rbt.create_external_context(name=self.id())

    async def create(
        self, effect_validation: EffectValidation
    ) -> tuple[General.WeakReference, ExternalContext]:
        context = await self.up(effect_validation)
        general, _ = await General.ConstructorWriter(context)
        return general, context

    async def test_disabled(self) -> None:
        general, context = await self.create(EffectValidation.DISABLED)

        self.assert_effects("constructor_writer")

    async def test_quiet(self) -> None:
        # In the 'quiet' mode, we log every method call on the first run, and
        # after that we silence the logs for a while.
        # 'Fake' that we have already notified the user about the effect
        # validation, to force debug logging.
        _has_ever_explained_effect_validation['General.ConstructorWriter'
                                             ] = DateTimeWithTimeZone.now()
        with self.assertLogs(
            logger=general_rbt.logger, level=logging.DEBUG
        ) as lc:
            general, context = await self.create(EffectValidation.QUIET)

            filtered_records = [
                r for r in lc.records if "Re-running method" in r.msg
            ]
            self.assertEqual(1, len(filtered_records))
            self.assertEqual(logging.DEBUG, filtered_records[0].levelno)

        self.assert_effects("constructor_writer", "constructor_writer")

    async def test_enabled(self) -> None:
        with self.assertLogs(logger=general_rbt.logger) as lc:
            general, context = await self.create(EffectValidation.ENABLED)
            filtered_records = [
                r for r in lc.records if "Re-running method" in r.msg
            ]
            self.assertEqual(1, len(filtered_records))
            self.assertEqual(logging.INFO, filtered_records[0].levelno)

        self.assert_effects("constructor_writer", "constructor_writer")

    async def test_constructor_writer(self) -> None:
        general, context = await self.create(EffectValidation.ENABLED)

        self.assert_effects("constructor_writer", "constructor_writer")

    async def test_constructor_transaction(self) -> None:
        context = await self.up(EffectValidation.ENABLED)
        general, _ = await General.ConstructorTransaction(context)
        self.assert_effects(
            "constructor_transaction", "constructor_transaction"
        )

    async def test_reader(self) -> None:
        general, context = await self.create(EffectValidation.ENABLED)

        await general.Reader(context)

        self.assert_effects(
            "constructor_writer", "constructor_writer", "reader", "reader"
        )

    async def test_writer(self) -> None:
        general, context = await self.create(EffectValidation.ENABLED)

        await general.Writer(context)

        self.assert_effects(
            "constructor_writer", "constructor_writer", "writer", "writer"
        )

    async def test_transaction(self) -> None:
        general, context = await self.create(EffectValidation.ENABLED)

        await general.Transaction(context)

        self.assert_effects(
            "constructor_writer", "constructor_writer", "transaction",
            "reader", "writer", "transaction", "reader", "writer"
        )

    async def test_task_reader(self) -> None:
        general, context = await self.create(EffectValidation.ENABLED)

        await (await general.spawn().Reader(context))

        self.assert_effects(
            "constructor_writer", "constructor_writer", "reader", "reader"
        )

    async def test_task_writer(self) -> None:
        general, context = await self.create(EffectValidation.ENABLED)

        await (await general.spawn().Writer(context))

        self.assert_effects(
            "constructor_writer", "constructor_writer", "writer", "writer"
        )

    async def test_task_transaction(self) -> None:
        general, context = await self.create(EffectValidation.ENABLED)

        await (await general.spawn().Transaction(context))

        # A transaction only retries at the root, and none of the methods that
        # it calls should internally retry.
        self.assert_effects(
            "constructor_writer",
            "constructor_writer",
            "transaction",
            "reader",
            "writer",
            "transaction",
            "reader",
            "writer",
        )

    async def test_task_workflow(self) -> None:
        general, context = await self.create(EffectValidation.ENABLED)

        await (await general.spawn().Workflow(context))

        # Similar to a transaction, a workflow retries at the root.
        # But workflows additionally:
        # 1. Inject idempotency of writers, and memoization of readers.
        # 2. Re-use `React`/`Querier` infrastructure in the second attempt, and
        #    so do not re-call reader methods whose results haven't changed.
        # ... and so do not re-run any inner methods on their second attempt.
        self.assert_effects(
            "constructor_writer",
            "constructor_writer",
            "workflow",
            "reader",
            # This second call to the `Reader` is due to `memoize`
            # effect validation: `callable_validating_effects` inside of
            # the default `at_least_once` readers behavior.
            "reader",
            # There is no second call to the `Writer`, since the
            # workflow idempotency ensures that the second attempt of
            # the workflow re-uses the result of the first `Writer`
            # call instead of making a second call to the `Writer` and
            # we don't retry writers inside a workflow.
            "writer",
            "workflow",
        )

    async def test_react_query(self) -> None:
        general, context = await self.create(EffectValidation.ENABLED)

        # Receive one message response.
        async for response in general.reactively().Reader(context):
            break
        else:
            raise AssertionError("No responses returned by Query.")

        self.assert_effects(
            "constructor_writer",
            "constructor_writer",
            "reader",
            "reader",
        )

    async def test_at_least_once_per_call_effect_validation_disabled(
        self,
    ) -> None:
        # Verify that `effect_validation=EffectValidation.DISABLED` on a
        # specific `at_least_once` call prevents the callable from being
        # re-run even when the context has effect validation enabled
        # globally.
        global _DIRECT_CALLS
        _DIRECT_CALLS = 0

        await self.rbt.up(
            Application(
                servicers=[EffectValidationPerCallDisabledServicer],
            ),
            effect_validation=EffectValidation.ENABLED,
        )
        context = self.rbt.create_external_context(name=self.id())
        general, _ = await General.ConstructorWriter(context)
        await (await general.spawn().Workflow(context))

        self.assertEqual(1, _DIRECT_CALLS)


if __name__ == '__main__':
    unittest.main()
