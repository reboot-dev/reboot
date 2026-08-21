"""`rbt dev run` opens a dashboard when nobody is looking at one.

The dashboard page subscribes to `Presence` for as long as it is open,
so the question the CLI asks is who is looking right now, which
reopens a dashboard the developer closed and never puts a second tab in
front of one they left up. It asks a second question first: whether the
developer clicked the dashboard's "Don't reopen this dashboard on
restart" banner, which is remembered in `Preferences`.

The page's own subscription and its banner are exercised in
`dashboard_tests`; here the subscriber and the choice are made
directly, so these tests need no browser.
"""
import asyncio
import unittest
from rbt.dashboard.v1.dashboard_rbt import Preferences
from rbt.std.presence.subscriber.v1.subscriber_rbt import Subscriber
from rbt.std.presence.v1.presence_rbt import Presence
from rbt.v1alpha1.errors_pb2 import NotFound
from reboot.aio.tests import Reboot
from reboot.cli.commands.dev import _open_dashboard_once
from reboot.dashboard.constants import (
    DASHBOARD_PATH,
    PREFERENCES_ID,
    PRESENCE_ID,
)
from reboot.dashboard.main import application
from unittest.mock import patch


class OpenDashboardTest(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(application(), local_envoy=True)
        self.url = f'http://127.0.0.1:{self.rbt.envoy_port()}'
        self.dashboard_url = f'{self.url}{DASHBOARD_PATH}/'
        self._connections: list[asyncio.Task] = []

    async def asyncTearDown(self) -> None:
        for connection in self._connections:
            connection.cancel()
        await self.rbt.stop()

    async def _view(self, subscriber_id: str) -> None:
        """Subscribes as a page would, and stays subscribed.

        `Connect` never returns, and `Toggle` has to land after it, so
        the two run concurrently and `Toggle` is retried until the
        connection it depends on exists, the same handshake
        `reboot/std/react/presence` performs in the browser.
        """
        context = self.rbt.create_external_context(name=self.id())
        subscriber = Subscriber.ref(subscriber_id)
        nonce = subscriber_id

        await subscriber.idempotently().Create(context)

        self._connections.append(
            asyncio.create_task(subscriber.Connect(context, nonce=nonce))
        )

        attempt = 0
        while True:
            try:
                await subscriber.idempotently(
                    f'Attempt {attempt}',
                ).Toggle(context, nonce=nonce)
                break
            except Subscriber.ToggleAborted as aborted:
                if not isinstance(aborted.error, NotFound):
                    raise
                attempt += 1

        await Presence.ref(PRESENCE_ID).Subscribe(
            context,
            subscriber_id=subscriber_id,
        )

    async def _suppress_reopening(self, suppress: bool) -> None:
        """Makes the choice the dashboard's banner makes."""
        context = self.rbt.create_external_context(name=self.id())
        await Preferences.ref(PREFERENCES_ID).SetSuppressOpenOnRestart(
            context,
            suppress_open_on_restart=suppress,
        )

    async def _viewers(self) -> list[str]:
        context = self.rbt.create_external_context(name=self.id())
        try:
            response = await Presence.ref(PRESENCE_ID).List(context)
            return list(response.subscriber_ids)
        except Presence.ListAborted:
            return []

    async def test_opens_when_nobody_is_looking(self) -> None:
        self.assertEqual(await self._viewers(), [])

        with patch('webbrowser.open', return_value=True) as browser:
            await _open_dashboard_once(dashboard_url=self.url, forced=False)

        # The browser gets the dashboard's path; `ExternalContext` only
        # ever sees the origin, which is all it accepts.
        browser.assert_called_once_with(self.dashboard_url)

    async def test_does_not_open_when_somebody_is_looking(self) -> None:
        await self._view('a-tab-that-is-open')
        self.assertEqual(await self._viewers(), ['a-tab-that-is-open'])

        with patch('webbrowser.open', return_value=True) as browser:
            with patch('reboot.cli.common.terminal.info') as told:
                await _open_dashboard_once(
                    dashboard_url=self.url,
                    forced=False,
                )

        browser.assert_not_called()

        # And it must say so: the tab being counted may be behind
        # another window, so a run that opens nothing and explains
        # nothing is indistinguishable from a broken one.
        told.assert_called_once()
        self.assertIn('--open-dashboard', told.call_args.args[0])
        self.assertIn(self.dashboard_url, told.call_args.args[0])

    async def test_opens_again_once_the_last_viewer_has_gone(self) -> None:
        await self._view('a-tab-that-closes')

        for connection in self._connections:
            connection.cancel()
        self._connections = []

        # Cancelling `Connect` is the only signal presence has, and it
        # reaches the subscriber list by way of `WaitForDisconnect`
        # untoggling and `Watch` then dropping the subscriber, so wait
        # for the list rather than assuming the cancellation was
        # enough.
        while await self._viewers() != []:
            await asyncio.sleep(0.1)

        with patch('webbrowser.open', return_value=True) as browser:
            await _open_dashboard_once(dashboard_url=self.url, forced=False)

        browser.assert_called_once_with(self.dashboard_url)

    async def test_does_not_open_when_the_developer_asked_it_not_to(
        self
    ) -> None:
        # Nobody is looking at a dashboard, so the only thing keeping
        # one from opening is the choice the banner recorded.
        await self._suppress_reopening(True)

        with patch('webbrowser.open', return_value=True) as browser:
            with patch('reboot.cli.common.terminal.info') as told:
                await _open_dashboard_once(
                    dashboard_url=self.url,
                    forced=False,
                )

        browser.assert_not_called()

        # And it must say how to get one anyway, since a choice made
        # in an earlier `rbt dev run` is not something the developer
        # is looking at now.
        told.assert_called_once()
        self.assertIn('--open-dashboard', told.call_args.args[0])
        self.assertIn(self.dashboard_url, told.call_args.args[0])

        # The second banner undoes the first, so a developer who
        # clicked once is not stuck with it.
        await self._suppress_reopening(False)

        with patch('webbrowser.open', return_value=True) as browser:
            await _open_dashboard_once(dashboard_url=self.url, forced=False)

        browser.assert_called_once_with(self.dashboard_url)

    async def test_forcing_opens_whatever_would_have_held_it_back(
        self
    ) -> None:
        # Both of the things that stop an opening at once, so that
        # `--open-dashboard` means what it says regardless of which
        # one is in the way.
        await self._view('a-tab-that-is-open')
        await self._suppress_reopening(True)

        with patch('webbrowser.open', return_value=True) as browser:
            await _open_dashboard_once(dashboard_url=self.url, forced=True)

        browser.assert_called_once_with(self.dashboard_url)

    async def test_says_where_the_dashboard_is_when_none_could_be_opened(
        self
    ) -> None:
        # `webbrowser.open` returns `False` rather than raising when
        # there is nothing to open, which is the headless case. Nothing
        # was shown, so the developer is told the address instead.
        with patch('webbrowser.open', return_value=False):
            with patch('reboot.cli.common.terminal.warn') as warned:
                await _open_dashboard_once(
                    dashboard_url=self.url,
                    forced=False,
                )

        warned.assert_called_once()
        self.assertIn(self.dashboard_url, warned.call_args.args[0])


if __name__ == '__main__':
    unittest.main()
