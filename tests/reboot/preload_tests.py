import unittest
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot
from reboot.server.database import DatabaseClient
from tests.reboot.bank import SINGLETON_BANK_ID, AccountServicer, BankServicer
from tests.reboot.bank_rbt import Account, Bank
from unittest import mock


class PreloadTestCase(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_preload_eliminates_load_actor_state_rpc(self) -> None:
        """After restart, a request for a state that is in the database but
        not cached in memory should trigger exactly one `Preload` RPC
        and zero `Load` RPCs — the preloaded bytes are consumed by
        `_load()`."""
        revision = await self.rbt.up(
            Application(servicers=[AccountServicer, BankServicer])
        )

        context = self.rbt.create_external_context(name=self.id())

        bank, _ = await Bank.create(context, SINGLETON_BANK_ID)

        await bank.sign_up(
            context,
            account_id="alice",
            initial_deposit=100,
        )

        # Restart to force eviction of any in-memory cache.
        await self.rbt.down()
        await self.rbt.up(revision=revision)

        load_actor_state = DatabaseClient.load_actor_state
        load_actor_state_calls = 0

        async def mock_load_actor_state(database_client, *args, **kwargs):
            nonlocal load_actor_state_calls
            load_actor_state_calls += 1
            return await load_actor_state(database_client, *args, **kwargs)

        with mock.patch(
            "reboot.server.database.DatabaseClient.load_actor_state",
            mock_load_actor_state,
        ):
            # Reader request: the middleware fires `preload()` before
            # `_load()` runs, so `_load()` finds the preloaded bytes
            # and never calls `load_actor_state`.
            alice = Account.ref("alice")
            balance = await alice.balance(context)
            self.assertEqual(balance.amount, 100)

        self.assertEqual(load_actor_state_calls, 0)

    async def test_preload_eliminates_recover_idempotent_mutations_rpc(
        self
    ) -> None:
        """After restart, a writer request for a state should trigger exactly
        one `Preload` RPC and zero `RecoverIdempotentMutations` RPCs —
        the preloaded mutations are consumed by
        `check_for_idempotent_mutation()`."""
        revision = await self.rbt.up(
            Application(servicers=[AccountServicer, BankServicer])
        )

        context = self.rbt.create_external_context(name=self.id())

        bank, _ = await Bank.create(context, SINGLETON_BANK_ID)

        await bank.sign_up(
            context,
            account_id="alice",
            initial_deposit=100,
        )

        # Restart to force eviction of any in-memory cache (including
        # the idempotent mutations bloom filter / cache).
        await self.rbt.down()
        await self.rbt.up(revision=revision)

        recover_idempotent_mutations = (
            DatabaseClient.recover_idempotent_mutations
        )
        recover_idempotent_mutations_calls = 0

        async def mock_recover_idempotent_mutations(
            database_client, *args, **kwargs
        ):
            nonlocal recover_idempotent_mutations_calls
            recover_idempotent_mutations_calls += 1
            return await recover_idempotent_mutations(
                database_client, *args, **kwargs
            )

        with mock.patch(
            "reboot.server.database.DatabaseClient"
            ".recover_idempotent_mutations",
            mock_recover_idempotent_mutations,
        ):
            # Writer request with idempotency: the middleware fires
            # `preload()` (which loads both state and mutations) then
            # calls `check_for_idempotent_mutation()`, which finds the
            # preloaded mutations future and never calls
            # `recover_idempotent_mutations`.
            alice = Account.ref("alice")
            await alice.deposit(context, amount=50)

        self.assertEqual(recover_idempotent_mutations_calls, 0)

    async def test_preload_failure_falls_back_to_own_rpcs(self) -> None:
        """If the `Preload` RPC raises, consumers fall back to their own
        `Load` / `RecoverIdempotentMutations` RPCs and the request
        still succeeds.
        """
        revision = await self.rbt.up(
            Application(servicers=[AccountServicer, BankServicer])
        )

        context = self.rbt.create_external_context(name=self.id())

        bank, _ = await Bank.create(context, SINGLETON_BANK_ID)

        await bank.sign_up(
            context,
            account_id="alice",
            initial_deposit=100,
        )

        # Restart to force eviction of any in-memory cache.
        await self.rbt.down()
        await self.rbt.up(revision=revision)

        load_actor_state = DatabaseClient.load_actor_state
        load_actor_state_calls = 0

        async def mock_load_actor_state(database_client, *args, **kwargs):
            nonlocal load_actor_state_calls
            load_actor_state_calls += 1
            return await load_actor_state(database_client, *args, **kwargs)

        async def mock_preload(database_client, *args, **kwargs):
            raise RuntimeError("Mock preload failure")

        with mock.patch(
            "reboot.server.database.DatabaseClient.preload",
            mock_preload,
        ), mock.patch(
            "reboot.server.database.DatabaseClient.load_actor_state",
            mock_load_actor_state,
        ):
            # Reader request: preload fails, `_load()` catches the
            # `RuntimeError` from awaiting the future, falls back to
            # its own `load_actor_state` RPC.
            alice = Account.ref("alice")
            balance = await alice.balance(context)
            self.assertEqual(balance.amount, 100)

        # Fallback path was taken, but we have 2 calls because of
        # effect validation.
        self.assertEqual(load_actor_state_calls, 2)

    async def test_preload_is_noop_when_state_is_cached(self) -> None:
        """A second request for a state that's already cached in memory
        should not trigger any `Preload` RPC at all."""
        await self.rbt.up(
            Application(servicers=[AccountServicer, BankServicer])
        )

        context = self.rbt.create_external_context(name=self.id())

        bank, _ = await Bank.create(context, SINGLETON_BANK_ID)

        await bank.sign_up(
            context,
            account_id="alice",
            initial_deposit=100,
        )

        # The first read populates `_states["Account"]["alice"]`.
        alice = Account.ref("alice")
        await alice.balance(context)

        preload = DatabaseClient.preload
        preload_calls = 0

        async def mock_preload(database_client, *args, **kwargs):
            nonlocal preload_calls
            preload_calls += 1
            return await preload(database_client, *args, **kwargs)

        with mock.patch(
            "reboot.server.database.DatabaseClient.preload",
            mock_preload,
        ):
            # Second reader request. Middleware calls
            # `preload("Account", "alice")`, which short-circuits
            # because "alice" is already in `_states`. No RPC.
            await alice.balance(context)

        self.assertEqual(preload_calls, 0)

    async def test_preload_is_noop_when_idempotent_mutations_are_cached(
        self
    ) -> None:
        """A second request for a state whose idempotent mutations
        are already cached in memory should not trigger any `Preload`
        RPC."""
        await self.rbt.up(
            Application(servicers=[AccountServicer, BankServicer])
        )

        context = self.rbt.create_external_context(name=self.id())

        bank, _ = await Bank.create(context, SINGLETON_BANK_ID)

        await bank.sign_up(
            context,
            account_id="alice",
            initial_deposit=100,
        )

        # The first writer with idempotency populates
        # `_idempotent_mutations["Account"]["alice"]`.
        alice = Account.ref("alice")
        await alice.idempotently("Deposit #1").deposit(context, amount=50)

        preload = DatabaseClient.preload
        preload_calls = 0

        async def mock_preload(database_client, *args, **kwargs):
            nonlocal preload_calls
            preload_calls += 1
            return await preload(database_client, *args, **kwargs)

        with mock.patch(
            "reboot.server.database.DatabaseClient.preload",
            mock_preload,
        ):
            # Second writer request. Middleware calls
            # `preload("Account", "alice")`, which short-circuits
            # because "alice" is already in both `_states` and
            # `_idempotent_mutations`. No RPC.
            await alice.idempotently("Deposit #2").deposit(context, amount=25)

        self.assertEqual(preload_calls, 0)


if __name__ == "__main__":
    unittest.main()
