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
from reboot.dashboard.backend.constants import PREFERENCES_ID
from reboot.dashboard.backend.main import application, initialize


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

    async def _read_preferences(self) -> bool:
        context = self.rbt.create_external_context(name=self.id())
        response = await Preferences.ref(PREFERENCES_ID).Get(context)
        return response.suppress_open_on_restart

    async def _set_suppress_open_on_restart(self, suppress: bool) -> None:
        """Makes the choice the dashboard's banner makes."""
        context = self.rbt.create_external_context(name=self.id())
        await Preferences.ref(PREFERENCES_ID).SetSuppressOpenOnRestart(
            context,
            suppress_open_on_restart=suppress,
        )

    async def _read_expanded_methods(self) -> list[str]:
        context = self.rbt.create_external_context(name=self.id())
        response = await Preferences.ref(PREFERENCES_ID).Get(context)
        return list(response.expanded_methods)

    async def _set_methods_expanded(
        self,
        state_type: str,
        methods: list[str],
        expanded: bool,
    ) -> None:
        """Makes the choice a method's toggle makes: one method for
        its own, every method of a state type for the state type's."""
        context = self.rbt.create_external_context(name=self.id())
        await Preferences.ref(PREFERENCES_ID).SetMethodsExpanded(
            context,
            state_type=state_type,
            methods=methods,
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
        self.assertFalse(await self._read_preferences())

    async def test_a_writer_leaves_alone_what_it_was_not_asked_about(
        self
    ) -> None:
        # The reason there are two writers rather than one that takes
        # both fields, and the reason `initialize` is careful: the
        # dashboard constructs on every `rbt dashboard`, and a page
        # that expands a state type must not write back a stale
        # answer to a question it was not asked.
        await self._set_suppress_open_on_restart(True)
        await self._set_methods_expanded('bank.v1.Account', ['deposit'], True)

        await initialize(self._initialize_context())

        self.assertTrue(await self._read_preferences())
        self.assertEqual(
            await self._read_expanded_methods(), ['bank.v1.Account.deposit']
        )

    async def test_what_is_expanded_is_a_sorted_set(self) -> None:
        # Two tabs can each send the same click, a page that
        # reconnects can send one it already sent, and a close can
        # arrive for something that was never open.
        await self._set_methods_expanded(
            'bank.v1.Account', ['open', 'deposit'], True
        )
        await self._set_methods_expanded('bank.v1.Account', ['deposit'], True)
        await self._set_methods_expanded('bank.v1.Bank', ['transfer'], True)

        await self._set_methods_expanded('bank.v1.Bank', ['transfer'], False)
        await self._set_methods_expanded('bank.v1.Never', ['gone'], False)

        # Sorted, so that the reactive read does not push a change to
        # every open page when the only difference is the order two
        # clicks happened to arrive in.
        self.assertEqual(
            await self._read_expanded_methods(),
            ['bank.v1.Account.deposit', 'bank.v1.Account.open'],
        )


if __name__ == '__main__':
    unittest.main()
