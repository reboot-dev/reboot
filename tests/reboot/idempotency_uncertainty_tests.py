import asyncio
import unittest
from google.protobuf.message import Message
from rbt.v1alpha1.errors_pb2 import (
    TransactionShouldRetryWithoutBackoff,
    Unavailable,
)
from reboot.aio.aborted import SystemAborted
from reboot.aio.idempotency import (
    IdempotencyManager,
    IdempotencyUncertainError,
)
from reboot.aio.types import ServiceName, StateRef, StateTypeName
from reboot.api import Model


class DeclaresNothingAborted(SystemAborted):
    """Stands in for a generated per-method `Aborted` type whose method
    declares no errors of its own."""

    @classmethod
    def is_declared_error(cls, error: Message | Model) -> bool:
        return False


class UncertainMutationTestCase(unittest.IsolatedAsyncioTestCase):
    """
    Tests which failed mutations make an `IdempotencyManager`
    uncertain. A `Node.Insert` that splits creates its siblings
    concurrently, so a single failure can fail several mutations on one
    manager.
    """

    STATE_TYPE_NAME = StateTypeName("test.v1.Node")
    SERVICE_NAME = ServiceName("test.v1.NodeMethods")

    def _idempotently(self, manager: IdempotencyManager, *, state_id: str):
        """A mutation without idempotency on `state_id`."""
        return manager.idempotently(
            state_type_name=self.STATE_TYPE_NAME,
            state_ref=StateRef.from_id(self.STATE_TYPE_NAME, state_id),
            service_name=self.SERVICE_NAME,
            method="Create",
            mutation=True,
            request=None,
            metadata=None,
            idempotency=None,
            aborted_type=DeclaresNothingAborted,
        )

    def test_retryable_failures_do_not_become_uncertain(self):
        # Sibling `Create`s failing with a retryable abort must all
        # propagate that abort so the transaction is retried, rather
        # than being recorded as uncertain mutations.
        manager = IdempotencyManager()

        for state_id in ["sibling-1", "sibling-2", "sibling-3"]:
            with self.assertRaises(SystemAborted):
                with self._idempotently(manager, state_id=state_id):
                    raise SystemAborted(TransactionShouldRetryWithoutBackoff())

        # A later mutation must still be allowed, i.e., nothing was
        # recorded as uncertain.
        with self._idempotently(manager, state_id="sibling-4"):
            pass

    async def test_concurrent_failures_keep_the_first(self):
        # Both mutations are in flight before either fails, so both
        # get past the "are we uncertain?" check and both end up
        # recording uncertainty.
        manager = IdempotencyManager()

        first_exception = SystemAborted(Unavailable())
        second_exception = SystemAborted(Unavailable())

        first_begun = asyncio.Event()
        second_begun = asyncio.Event()
        first_fails = asyncio.Event()
        second_fails = asyncio.Event()

        async def mutate(state_id, exception, begun, fails):
            with self._idempotently(manager, state_id=state_id):
                begun.set()
                await fails.wait()
                raise exception

        first = asyncio.create_task(
            mutate("first", first_exception, first_begun, first_fails)
        )
        second = asyncio.create_task(
            mutate("second", second_exception, second_begun, second_fails)
        )

        await first_begun.wait()
        await second_begun.wait()

        # Both mutations are now inside `idempotently()`; fail them
        # one at a time so we know which of them failed first.
        first_fails.set()
        with self.assertRaises(SystemAborted) as raised:
            await first
        self.assertIs(raised.exception, first_exception)

        second_fails.set()
        with self.assertRaises(SystemAborted) as raised:
            await second
        self.assertIs(raised.exception, second_exception)

        # The first mutation to fail is the one we report as uncertain.
        with self.assertRaises(IdempotencyUncertainError) as raised:
            with self._idempotently(manager, state_id="later"):
                pass

        self.assertIn("'first'", str(raised.exception))

    def test_transport_failure_reports_uncertainty(self):
        # An `Unavailable` may or may not have mutated, so it makes the
        # manager uncertain and the next mutation is refused.
        manager = IdempotencyManager()

        with self.assertRaises(SystemAborted):
            with self._idempotently(manager, state_id="sibling-1"):
                raise SystemAborted(Unavailable())

        with self.assertRaises(IdempotencyUncertainError):
            with self._idempotently(manager, state_id="sibling-2"):
                pass


if __name__ == '__main__':
    unittest.main()
