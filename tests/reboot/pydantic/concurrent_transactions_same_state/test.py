import asyncio
import unittest
from reboot.aio.applications import Application
from reboot.aio.contexts import EffectValidation
from reboot.aio.tests import Reboot
from tests.reboot.pydantic.concurrent_transactions_same_state.servicer import (
    COUNTER_ID,
    CounterServicer,
    parked_increment_is_participant,
    parked_increment_may_write,
    rendezvous,
)
from tests.reboot.pydantic.concurrent_transactions_same_state.servicer_api_rbt import (
    Counter,
)

# How many transactions to run at the same time against one state.
CONCURRENCY = 20


class ConcurrentTransactionsOnOneStateTest(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(
            Application(servicers=[CounterServicer]),
            servers=1,
            # Effect validation re-runs a method to check that its
            # effects are deterministic. The re-run happens once a
            # test has already set its events, so a method that
            # parked on the first run does not park again and never
            # overlaps with the other transaction: the result would
            # come out right whether or not the runtime keeps its
            # per-state data per transaction.
            effect_validation=EffectValidation.DISABLED,
        )
        self.context = self.rbt.create_external_context(name=self.id())
        await Counter.create(self.context, COUNTER_ID)

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_nested_transactions_on_one_state_are_parallel(self) -> None:
        """Nested transactions take their participant's lock in
        shared mode, so many of them may be running inside one state
        at the same time. The rendezvous only opens once every one of
        them has arrived, so this can only finish if they really do
        overlap.

        The rendezvous counts the names it has seen rather than the
        arrivals, so a driver whose transaction aborted and was
        retried is still one arrival."""
        driver_ids = [f"driver-{index}" for index in range(CONCURRENCY)]
        await asyncio.gather(
            *(
                Counter.create(self.context, driver_id)
                for driver_id in driver_ids
            )
        )

        rendezvous.reset(CONCURRENCY)

        await asyncio.gather(
            *(
                Counter.ref(driver_id).call_inner(
                    self.context,
                    peer_id=COUNTER_ID,
                ) for driver_id in driver_ids
            )
        )

        self.assertEqual(len(rendezvous.arrived), CONCURRENCY)

    async def test_finishing_transaction_keeps_anothers_write(self) -> None:
        """A transaction's write survives another transaction on the
        same state finishing first.

        Both of them are nested, so neither carries an idempotency key
        and both are participants on `COUNTER_ID` at the same time.
        The test drives them into this order:

        1. `parked_increment` becomes a participant and then stops,
           having written nothing yet.
        2. `touch` becomes a participant on that same state and runs
           all the way to completion, writing nothing.
        3. `parked_increment` is released and does its increment.

        The count must then be 1. Whatever the runtime keeps per
        state for the duration of a call has to be kept per
        transaction as well: otherwise step 2 tears down what step 1
        set up, step 3 writes into something nothing else reads, and
        the increment is lost with no error reported anywhere.
        """
        await Counter.create(self.context, "writing-driver")
        await Counter.create(self.context, "touching-driver")

        parked_increment_is_participant.clear()
        parked_increment_may_write.clear()

        # Becomes a participant on the state, then parks before
        # writing anything.
        writing = asyncio.create_task(
            Counter.ref("writing-driver").call_parked_increment(
                self.context,
                peer_id=COUNTER_ID,
            )
        )
        await parked_increment_is_participant.wait()

        # Becomes a participant on the same state and runs all the way
        # to completion while the first transaction is still in flight.
        await Counter.ref("touching-driver").call_touch(
            self.context,
            peer_id=COUNTER_ID,
        )

        # Only now let the first transaction do its write.
        parked_increment_may_write.set()
        await writing

        response = await Counter.ref(COUNTER_ID).get(self.context)
        self.assertEqual(response.count, 1)


if __name__ == '__main__':
    unittest.main(verbosity=2)
