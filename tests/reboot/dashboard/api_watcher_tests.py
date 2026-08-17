"""State types appear as the developer writes their API files.

The dashboard is up before the application exists, so this is the
first thing a dashboard can show: not what is running, but what has
been written so far.
"""
import asyncio
import os
import tempfile
import unittest
from google.protobuf.json_format import MessageToDict
from pathlib import Path
from rbt.dashboard.v1.dashboard_rbt import API
from reboot.aio.tests import Reboot
from reboot.dashboard.constants import API_ID, ENVVAR_RBT_API_DIRECTORY
from reboot.dashboard.main import application
from typing import Optional
from unittest.mock import patch

SHOP = '''
from reboot.api import API, Field, Methods, Model, Reader, Type


class {state}State(Model):
    name: str = Field(tag=1)


class LookRequest(Model):
    item: str = Field(tag=1)


class LookResponse(Model):
    found: bool = Field(tag=1)


{state}Methods = Methods(
    look=Reader(
        request=LookRequest,
        response=LookResponse,
        description=None,
        mcp=None,
    ),
)

api = API({state}=Type(state={state}State, methods={state}Methods))
'''


def _read(response) -> list[dict]:
    """The state types the description carries, as JSON."""
    if not response.HasField('state_types'):
        return []
    return MessageToDict(response.state_types)


class APIWatcherTest(unittest.IsolatedAsyncioTestCase):

    watcher: Optional[asyncio.Task] = None

    async def asyncSetUp(self) -> None:
        # The workflow reads the directory when the application comes
        # up, so it has to exist and be named first.
        self._directory = tempfile.TemporaryDirectory()
        self.directory = Path(self._directory.name)
        self._environment = patch.dict(
            os.environ,
            {ENVVAR_RBT_API_DIRECTORY: str(self.directory)},
        )
        self._environment.start()

        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(application(), local_envoy=True)
        self.url = f'http://127.0.0.1:{self.rbt.envoy_port()}'

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()
        self._environment.stop()
        self._directory.cleanup()

    def _write(self, directory: Path, name: str, state: str) -> None:
        path = directory / 'shop' / 'v1' / f'{name}.py'
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(SHOP.format(state=state))

    async def _wait_for(self, satisfied):
        while True:
            context = self.rbt.create_external_context(name=self.id())
            try:
                response = await API.ref(API_ID).Get(context)
                if satisfied(response):
                    return response
            except Exception:
                pass
            await asyncio.sleep(0.1)

    async def test_types_appear_as_files_are_written(self) -> None:
        # The workflow is already watching: it was scheduled when the
        # application came up.
        self._write(self.directory, 'shop', 'Shop')

        response = await self._wait_for(lambda api: len(_read(api)) == 1)
        self.assertEqual(
            [state['name'] for state in _read(response)],
            ['shop.v1.Shop'],
        )
        self.assertFalse(response.HasField('error'))

        self._write(self.directory, 'depot', 'Depot')

        response = await self._wait_for(lambda api: len(_read(api)) == 2)
        self.assertEqual(
            sorted(state['name'] for state in _read(response)),
            ['shop.v1.Depot', 'shop.v1.Shop'],
        )


if __name__ == '__main__':
    unittest.main()
