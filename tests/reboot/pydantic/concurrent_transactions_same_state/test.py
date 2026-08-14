import asyncio
import unittest
from reboot.aio.applications import Application
from reboot.aio.contexts import EffectValidation
from reboot.aio.tests import Reboot
from tests.reboot.pydantic.concurrent_transactions_same_state.servicer import (
    COUNTER_ID,
    CounterServicer,
    rendezvous,
)
from tests.reboot.pydantic.concurrent_transactions_same_state.servicer_api_rbt import (
    Counter,
)

# How many transactions to run at the same time against the one state.
CONCURRENCY = 20

# How many distinct states one transaction writes.
FANOUT = 5


class ConcurrentTransactionsOnOneStateTest(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(
            Application(servicers=[CounterServicer]),
            servers=1,
            # Re-running every writer to validate that its effects are
            # deterministic would obscure what these tests are about.
            effect_validation=EffectValidation.DISABLED,
        )
        self.context = self.rbt.create_external_context(name=self.id())
        await Counter.create(self.context, COUNTER_ID)

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_concurrent_transactions_that_never_write(self) -> None:
        """Transactions that never write still name their state as a
        participant, so running them at the same time against one
        state must not fail or take down the database."""
        counter = Counter.ref(COUNTER_ID)

        await asyncio.gather(
            *(counter.noop(self.context) for _ in range(CONCURRENCY))
        )

        # The state is untouched, but it must still be readable: if the
        # database server died, this read cannot succeed.
        response = await counter.get(self.context)
        self.assertEqual(response.count, 0)

    async def test_nested_transactions_on_one_state_are_parallel(self) -> None:
        """Nested transactions join their participant in shared mode,
        so many of them may be inside one state at the same time. The
        rendezvous only opens once every one of them has arrived, so
        this can only finish if they really do overlap."""
        outer_ids = [f"outer-{index}" for index in range(CONCURRENCY)]
        await asyncio.gather(
            *
            (Counter.create(self.context, outer_id) for outer_id in outer_ids)
        )

        rendezvous.reset(CONCURRENCY)

        await asyncio.gather(
            *(
                Counter.ref(outer_id).outer(self.context, peer_id=COUNTER_ID)
                for outer_id in outer_ids
            )
        )

        self.assertEqual(rendezvous.arrived, CONCURRENCY)

    async def test_transaction_writes_many_unrelated_states(self) -> None:
        """One transaction writing several distinct state refs. Each
        gets its own entry in the database's per-actor transaction
        map, so none of them may collide with another."""
        peer_ids = [f"peer-{index}" for index in range(FANOUT)]
        await asyncio.gather(
            *(Counter.create(self.context, peer_id) for peer_id in peer_ids)
        )

        await Counter.ref(COUNTER_ID).fanout(self.context, peer_ids=peer_ids)

        for peer_id in peer_ids:
            response = await Counter.ref(peer_id).get(self.context)
            self.assertEqual(response.count, 1, f"{peer_id} was not written")

    async def test_concurrent_transactions_over_disjoint_states(self) -> None:
        """Many transactions at once, each writing its own disjoint
        set of states, so no two of them share a state ref."""
        groups = [
            [f"group-{group}-{index}"
             for index in range(FANOUT)]
            for group in range(CONCURRENCY)
        ]
        await asyncio.gather(
            *(
                Counter.create(self.context, state_id) for state_id in
                [peer_id for group in groups for peer_id in group] + [
                    f"fanout-coordinator-{index}"
                    for index in range(CONCURRENCY)
                ]
            )
        )

        await asyncio.gather(
            *(
                Counter.ref(f"fanout-coordinator-{index}").fanout(
                    self.context,
                    peer_ids=group,
                ) for index, group in enumerate(groups)
            )
        )

        for group in groups:
            for peer_id in group:
                response = await Counter.ref(peer_id).get(self.context)
                self.assertEqual(
                    response.count, 1, f"{peer_id} was not written"
                )

    async def test_shared_transactions_on_one_ref_fanning_out(self) -> None:
        """Many transactions all coordinated on the SAME state ref —
        so they join it shared and never upgrade it — while each one's
        nested writers fan out to its own unrelated states."""
        groups = [
            [f"fan-{group}-{index}"
             for index in range(FANOUT)]
            for group in range(CONCURRENCY)
        ]
        await asyncio.gather(
            *(
                Counter.create(self.context, peer_id)
                for group in groups
                for peer_id in group
            )
        )

        await asyncio.gather(
            *(
                Counter.ref(COUNTER_ID).fanout(self.context, peer_ids=group)
                for group in groups
            )
        )

        for group in groups:
            for peer_id in group:
                response = await Counter.ref(peer_id).get(self.context)
                self.assertEqual(
                    response.count, 1, f"{peer_id} was not written"
                )

    async def test_concurrent_plain_writers(self) -> None:
        """The control: the same increments as plain writers rather
        than transactions. Writers take the state's exclusive lock for
        their whole call, so none of them may be lost."""
        counter = Counter.ref(COUNTER_ID)

        responses = await asyncio.gather(
            *(counter.increment(self.context) for _ in range(CONCURRENCY))
        )

        counts = sorted(response.count for response in responses)
        self.assertEqual(counts, list(range(1, CONCURRENCY + 1)))

        response = await counter.get(self.context)
        self.assertEqual(response.count, CONCURRENCY)

    async def test_sequential_transactions_that_write(self) -> None:
        """The same transactions, one strictly after another. If the
        bug needs contention, this must pass."""
        counter = Counter.ref(COUNTER_ID)

        responses = []
        for _ in range(CONCURRENCY):
            responses.append(
                await counter.transactionally_increment(self.context)
            )

        counts = sorted(response.count for response in responses)
        self.assertEqual(counts, list(range(1, CONCURRENCY + 1)))

        response = await counter.get(self.context)
        self.assertEqual(response.count, CONCURRENCY)

    async def test_concurrent_transactions_that_write(self) -> None:
        """The same shape, but each transaction writes its own state,
        which upgrades its participant lock to exclusive."""
        counter = Counter.ref(COUNTER_ID)

        responses = await asyncio.gather(
            *(
                counter.transactionally_increment(self.context)
                for _ in range(CONCURRENCY)
            )
        )

        # Every transaction that reported success must have produced a
        # distinct count: two transactions handing back the same count
        # means one of them was lost.
        counts = sorted(response.count for response in responses)
        self.assertEqual(counts, list(range(1, CONCURRENCY + 1)))

        response = await counter.get(self.context)
        self.assertEqual(response.count, CONCURRENCY)


if __name__ == '__main__':
    unittest.main(verbosity=2)
