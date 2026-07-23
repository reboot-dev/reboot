import asyncio
import unittest
from main import main as get_started_main
from reboot.aio.aborted import Aborted
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot
from servicers.counter import CounterServicer, UserServicer
from tests.reboot.documentation.ai_chat_counter_rbt import Counter, User

_OWNER_ID = "test-user"


class AiChatCounterTest(unittest.IsolatedAsyncioTestCase):
    """Exercises the `get_started` tutorial's `User` and `Counter`
    servicers so the code the docs pull from is real and tested."""

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(
            Application(servicers=[UserServicer, CounterServicer])
        )
        # A signed-in user, impersonated via a minted OAuth token whose
        # `user_id` matches the `User` state-id. Minting the token
        # constructs the `User`; the explicit `_authenticated` call
        # mirrors what a real sign-in does and is idempotent.
        self.context = await self.rbt.create_external_context_as(
            name=f"test-{self.id()}",
            user_id=_OWNER_ID,
        )
        await UserServicer._authenticated(self.context, state_id=_OWNER_ID)

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    def test_main_entrypoint_is_real_code(self) -> None:
        # The `main.py` snippet the docs pull must be importable code:
        # this resolves `from servicers.counter import ...` and gives a
        # runnable `main` coroutine.
        self.assertTrue(asyncio.iscoroutinefunction(get_started_main))

    async def test_create_increment_and_list(self) -> None:
        # Create a counter through the `User` transaction; it returns
        # the opaque `counter_id` the MCP client passes to later tools.
        create_response = await User.ref(_OWNER_ID).create_counter(
            self.context,
            description="clicks on the button",
        )
        counter = Counter.ref(create_response.counter_id)

        # A freshly created counter starts at zero.
        self.assertEqual((await counter.get(self.context)).value, 0)

        # Increment by an explicit amount, then by the default of one.
        await counter.increment(self.context, amount=5)
        await counter.increment(self.context)
        self.assertEqual((await counter.get(self.context)).value, 6)

        # The counter shows up in the owner's list with its
        # description.
        listed = await User.ref(_OWNER_ID).list_counters(self.context)
        self.assertEqual(len(listed.counters), 1)
        self.assertEqual(
            listed.counters[0].counter_id,
            create_response.counter_id,
        )
        self.assertEqual(
            listed.counters[0].description,
            "clicks on the button",
        )

    async def test_non_owner_cannot_read_counter(self) -> None:
        create_response = await User.ref(_OWNER_ID).create_counter(
            self.context,
            description="private counter",
        )

        # A second signed-in user, with a valid token but a different
        # `user_id`, must not be able to read a counter they do not
        # own: the `_caller_is_owner` authorizer refuses them. A fresh
        # `ref` is required per context.
        other_context = await self.rbt.create_external_context_as(
            name=f"other-{self.id()}",
            user_id="other-user",
        )
        with self.assertRaises(Aborted):
            await Counter.ref(create_response.counter_id).get(other_context)

        # The owner still can.
        owner_counter = Counter.ref(create_response.counter_id)
        self.assertEqual((await owner_counter.get(self.context)).value, 0)


if __name__ == "__main__":
    unittest.main()
