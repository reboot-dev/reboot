import unittest
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot
from tests.reboot.pydantic.nested_transaction_same_state.servicer import (
    NESTED_WROTE,
    NOT_OBSERVED,
    NOT_WRITTEN,
    OUTER_WROTE,
    WRITER_WROTE,
    NestedServicer,
)
from tests.reboot.pydantic.nested_transaction_same_state.servicer_api import (
    GetResponse,
    OuterTransactionResponse,
)
from tests.reboot.pydantic.nested_transaction_same_state.servicer_api_rbt import (
    Nested,
)


class NestedTransactionSameStateTest(unittest.IsolatedAsyncioTestCase):
    """A transaction, a transaction nested in it on the same state
    instance, and a writer the outer transaction calls afterwards all
    write one field each. Every assertion names both the call whose
    write is at stake and the call doing the observing, so a failure
    says which write was lost and who failed to see it."""

    # Show a failing comparison in full: a truncated one hides the
    # very field whose write went missing.
    maxDiff = None

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(
            Application(servicers=[NestedServicer]),
            servers=1,
        )
        self.context = self.rbt.create_external_context(name=self.id())

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_writer_without_a_nested_transaction(self) -> None:
        """A writer called by a transaction updates the transaction's
        state. This is the baseline: it holds with no nested
        transaction in play, and must keep holding once there is
        one."""
        nested = Nested.ref("writer-only")

        response = await nested.outer_transaction(
            self.context,
            call_nested_transaction=False,
            call_writer=True,
        )

        self.assertEqual(
            response,
            OuterTransactionResponse(
                outers_write_seen_by_nested=NOT_OBSERVED,
                nesteds_write_seen_by_outer=NOT_WRITTEN,
                writers_write_seen_by_outer=WRITER_WROTE,
                outers_write_seen_by_outer=OUTER_WROTE,
            ),
        )

        self.assertEqual(
            await nested.get(self.context),
            GetResponse(
                written_by_outer=OUTER_WROTE,
                written_by_nested=NOT_WRITTEN,
                written_by_writer=WRITER_WROTE,
            ),
        )

    async def test_nested_transaction(self) -> None:
        """A nested transaction on the same state instance sees what
        its caller wrote, and its own write reaches both the caller
        and the committed state."""
        nested = Nested.ref("nested")

        response = await nested.outer_transaction(
            self.context,
            call_nested_transaction=True,
            call_writer=False,
        )

        self.assertEqual(
            response,
            OuterTransactionResponse(
                outers_write_seen_by_nested=OUTER_WROTE,
                nesteds_write_seen_by_outer=NESTED_WROTE,
                writers_write_seen_by_outer=NOT_OBSERVED,
                outers_write_seen_by_outer=OUTER_WROTE,
            ),
        )

        self.assertEqual(
            await nested.get(self.context),
            GetResponse(
                written_by_outer=OUTER_WROTE,
                written_by_nested=NESTED_WROTE,
                written_by_writer=NOT_WRITTEN,
            ),
        )

    async def test_writer_after_a_nested_transaction(self) -> None:
        """A writer called once a nested transaction has returned
        still updates its caller's state, and every write survives to
        the commit."""
        nested = Nested.ref("nested-then-writer")

        response = await nested.outer_transaction(
            self.context,
            call_nested_transaction=True,
            call_writer=True,
        )

        self.assertEqual(
            response,
            OuterTransactionResponse(
                outers_write_seen_by_nested=OUTER_WROTE,
                nesteds_write_seen_by_outer=NESTED_WROTE,
                writers_write_seen_by_outer=WRITER_WROTE,
                outers_write_seen_by_outer=OUTER_WROTE,
            ),
        )

        self.assertEqual(
            await nested.get(self.context),
            GetResponse(
                written_by_outer=OUTER_WROTE,
                written_by_nested=NESTED_WROTE,
                written_by_writer=WRITER_WROTE,
            ),
        )


if __name__ == '__main__':
    unittest.main(verbosity=2)
