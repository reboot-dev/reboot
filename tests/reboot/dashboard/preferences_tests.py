"""`Preferences` has a value before anybody has chosen one.

The dashboard's banner renders from a reactive read of `Preferences`,
and a reader aborts with `StateNotConstructed` until something has
written, so the dashboard application writes the defaults at
startup. That write must not undo a choice the developer already
made, because it runs on every start of `rbt dashboard`, which is
exactly when a click from an earlier run has to survive.

The banner that does the clicking is exercised in `dashboard_tests`,
and what `rbt dev run` does with the answer in `open_dashboard_tests`.
"""
import unittest
import uuid
from rbt.dashboard.v1.dashboard_rbt import Preferences
from reboot.aio.external import InitializeContext
from reboot.aio.tests import Reboot
from reboot.dashboard.constants import PREFERENCES_ID
from reboot.dashboard.main import application, initialize


class PreferencesTest(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(application(), local_envoy=True)
        self.url = f'http://127.0.0.1:{self.rbt.envoy_port()}'

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    def _initialize_context(self) -> InitializeContext:
        """A restart's context, seeded as
        `Reboot.create_initialize_context` seeds it."""
        return InitializeContext(
            name=self.id(),
            url=self.url,
            idempotency_seed=uuid.uuid5(
                uuid.NAMESPACE_DNS, 'anonymous.rbt.dev'
            ),
        )

    async def _get(self) -> bool:
        context = self.rbt.create_external_context(name=self.id())
        response = await Preferences.ref(PREFERENCES_ID).Get(context)
        return response.suppress_open_on_restart

    async def _set_suppress(self, suppress: bool) -> None:
        """Makes the choice the dashboard's banner makes."""
        context = self.rbt.create_external_context(name=self.id())
        await Preferences.ref(PREFERENCES_ID).SetSuppressOpenOnRestart(
            context,
            suppress_open_on_restart=suppress,
        )

    async def _expanded(self) -> list[str]:
        context = self.rbt.create_external_context(name=self.id())
        response = await Preferences.ref(PREFERENCES_ID).Get(context)
        return list(response.expanded_state_types)

    async def _set_expanded(self, state_type: str, expanded: bool) -> None:
        """Makes the choice a state type's `Expand details` makes."""
        context = self.rbt.create_external_context(name=self.id())
        await Preferences.ref(PREFERENCES_ID).SetExpanded(
            context,
            state_type=state_type,
            expanded=expanded,
        )

    async def test_starting_writes_a_default_that_can_be_read(self) -> None:
        # The application's `initialize` constructed `Preferences`
        # when it came up; a reader would otherwise abort with
        # `StateNotConstructed`, and a page that loaded first would
        # have nothing to render its banner from.
        #
        # False, so that somebody who has never clicked the banner gets
        # a dashboard opened for them.
        self.assertFalse(await self._get())

    async def test_a_writer_leaves_alone_what_it_was_not_asked_about(
        self
    ) -> None:
        # The reason there are two writers rather than one that takes
        # both fields, and the reason `initialize` is careful: the
        # dashboard constructs on every `rbt dashboard`, and a page
        # that expands a state type must not write back a stale
        # answer to a question it was not asked.
        await self._set_suppress(True)
        await self._set_expanded('bank.v1.Account', True)

        await initialize(self._initialize_context())

        self.assertTrue(await self._get())
        self.assertEqual(await self._expanded(), ['bank.v1.Account'])

    async def test_what_is_expanded_is_a_sorted_set(self) -> None:
        # Two tabs can each send the same click, a page that
        # reconnects can send one it already sent, and a collapse can
        # arrive for something that was never open.
        await self._set_expanded('bank.v1.Customer', True)
        await self._set_expanded('bank.v1.Account', True)
        await self._set_expanded('bank.v1.Account', True)
        await self._set_expanded('bank.v1.Bank', True)

        await self._set_expanded('bank.v1.Bank', False)
        await self._set_expanded('bank.v1.Never', False)

        # Sorted, so that the reactive read does not push a change to
        # every open page when the only difference is the order two
        # clicks happened to arrive in.
        self.assertEqual(
            await self._expanded(),
            ['bank.v1.Account', 'bank.v1.Customer'],
        )


if __name__ == '__main__':
    unittest.main()
