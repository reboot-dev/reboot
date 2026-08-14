import unittest
from google.protobuf.message import Message
from rbt.v1alpha1.errors_pb2 import (
    TransactionShouldRetryWithoutBackoff,
    Unavailable,
)
from reboot.aio.aborted import SystemAborted
from reboot.aio.idempotency import IdempotencyManager
from reboot.aio.types import ServiceName, StateRef, StateTypeName
from reboot.api import Model
from typing import Optional


class DeclaresNothingAborted(SystemAborted):
    """Stands in for a generated per-method `Aborted` type whose method
    declares no errors of its own."""

    @classmethod
    def is_declared_error(cls, error: Message | Model) -> bool:
        return False


class UncertainMutationTestCase(unittest.TestCase):
    """
    Tests which failed mutations make an `IdempotencyManager`
    uncertain. A `Node.Insert` that splits creates its siblings
    concurrently, so a single failure can fail several mutations on one
    manager.
    """

    STATE_TYPE_NAME = StateTypeName("test.v1.Node")
    SERVICE_NAME = ServiceName("test.v1.NodeMethods")

    def _mutate_and_raise(
        self,
        manager: IdempotencyManager,
        exception: Optional[BaseException],
        *,
        state_id: str,
    ) -> None:
        """Performs a mutation without idempotency, failing it with
        `exception` if one is given."""
        with manager.idempotently(
            state_type_name=self.STATE_TYPE_NAME,
            state_ref=StateRef.from_id(self.STATE_TYPE_NAME, state_id),
            service_name=self.SERVICE_NAME,
            method="Create",
            mutation=True,
            request=None,
            metadata=None,
            idempotency=None,
            aborted_type=DeclaresNothingAborted,
        ):
            if exception is not None:
                raise exception

    def test_concurrent_retryable_failures_do_not_become_uncertain(self):
        # Several sibling `Create`s failing with the same retryable
        # abort must all propagate that abort so the transaction is
        # retried, rather than the second one turning it into an
        # `AssertionError`.
        manager = IdempotencyManager()

        for state_id in ["sibling-1", "sibling-2", "sibling-3"]:
            with self.assertRaises(SystemAborted):
                self._mutate_and_raise(
                    manager,
                    SystemAborted(TransactionShouldRetryWithoutBackoff()),
                    state_id=state_id,
                )

        # A later mutation must still be allowed, i.e., nothing was
        # recorded as uncertain.
        self._mutate_and_raise(manager, None, state_id="sibling-4")

    def test_concurrent_transport_failures_report_uncertainty(self):
        # An `Unavailable` may or may not have mutated, so the first
        # failure makes the manager uncertain and the next mutation is
        # refused -- with an actionable error, not an `AssertionError`.
        manager = IdempotencyManager()

        with self.assertRaises(SystemAborted):
            self._mutate_and_raise(
                manager,
                SystemAborted(Unavailable()),
                state_id="sibling-1",
            )

        with self.assertRaises(Exception) as raised:
            self._mutate_and_raise(manager, None, state_id="sibling-2")

        self.assertNotIsInstance(raised.exception, AssertionError)


if __name__ == '__main__':
    unittest.main()
