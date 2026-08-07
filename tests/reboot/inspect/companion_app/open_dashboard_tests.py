"""`rbt dev run` opens a dashboard the first time and not again.

The companion records that it opened one. Reading that record, rather
than asking who is looking right now, keeps the decision independent
of whether a browser's disconnect ever reaches the server -- which it
does not through a forwarded port, where a departed viewer looks
present indefinitely.
"""
import unittest
from rbt.inspect.companion_app.v1.dashboard_rbt import Dashboard
from reboot.aio.tests import Reboot
from reboot.cli.commands.dev import _open_dashboard_once
from reboot.inspect.companion_app.constants import DASHBOARD_ID, DASHBOARD_PATH
from reboot.inspect.companion_app.main import application
from unittest.mock import patch


class OpenDashboardTest(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(application(), local_envoy=True)
        self.url = f'http://127.0.0.1:{self.rbt.envoy_port()}'
        self.dashboard_url = f'{self.url}{DASHBOARD_PATH}/'

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def _opened(self) -> bool:
        context = self.rbt.create_external_context(name=self.id())
        try:
            return (await Dashboard.ref(DASHBOARD_ID).Opened(context)).opened
        except Exception:
            return False

    async def test_opens_the_first_time_and_not_again(self) -> None:
        self.assertFalse(await self._opened())

        with patch('webbrowser.open', return_value=True) as browser:
            await _open_dashboard_once(companion_url=self.url, forced=False)

        # The browser gets the dashboard's path; `ExternalContext` only
        # ever sees the origin, which is all it accepts.
        browser.assert_called_once_with(self.dashboard_url)
        self.assertTrue(await self._opened())

        # A second run -- a restart, a hot reload, anything -- must
        # leave the developer alone.
        with patch('webbrowser.open', return_value=True) as browser:
            await _open_dashboard_once(companion_url=self.url, forced=False)

        browser.assert_not_called()

    async def test_forcing_opens_even_though_one_was_opened_before(
        self
    ) -> None:
        with patch('webbrowser.open', return_value=True):
            await _open_dashboard_once(companion_url=self.url, forced=False)

        self.assertTrue(await self._opened())

        with patch('webbrowser.open', return_value=True) as browser:
            await _open_dashboard_once(companion_url=self.url, forced=True)

        browser.assert_called_once_with(self.dashboard_url)

    async def test_nothing_is_recorded_when_no_browser_could_be_opened(
        self
    ) -> None:
        # `webbrowser.open` returns `False` rather than raising when
        # there is nothing to open, which is the headless case. Nothing
        # was shown, so nothing should be remembered -- otherwise the
        # developer would never get a dashboard.
        with patch('webbrowser.open', return_value=False):
            with patch('reboot.cli.common.terminal.warn') as warned:
                await _open_dashboard_once(
                    companion_url=self.url,
                    forced=False,
                )

        warned.assert_called_once()
        self.assertIn(self.dashboard_url, warned.call_args.args[0])
        self.assertFalse(await self._opened())


if __name__ == '__main__':
    unittest.main()
