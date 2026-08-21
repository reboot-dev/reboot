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
from rbt.std.collections.ordered_map.v1.ordered_map_rbt import OrderedMap
from reboot.aio.tests import Reboot
from reboot.dashboard.constants import (
    API_ID,
    CHANGELOG_ID,
    ENVVAR_RBT_API_DIRECTORY,
)
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

    async def _up(self) -> None:
        """Brings the dashboard up.

        Called by each test rather than in setup, so a test can write
        API files first and start the dashboard against files that
        already exist.
        """
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

    async def _history(self) -> list[dict]:
        """What the dashboard has noticed, newest first."""
        context = self.rbt.create_external_context(name=self.id())
        try:
            response = await OrderedMap.ref(CHANGELOG_ID).ReverseRange(
                context,
                limit=100,
            )
        except Exception:
            # Nothing has been recorded, so the map does not exist.
            return []
        return [MessageToDict(entry.value) for entry in response.entries]

    async def test_what_was_already_on_disk_is_not_history(self) -> None:
        self._write(self.directory, 'shop', 'Shop')

        await self._up()
        await self._wait_for(lambda api: len(_read(api)) == 1)

        self.assertEqual(await self._history(), [])

    async def test_fixing_a_file_broken_at_startup_is_not_history(
        self
    ) -> None:
        # A file that was already on disk but did not parse told the
        # dashboard nothing, so what it turns out to declare once it
        # does parse is what it already declared. Fixing a typo is not
        # adding everything in the file.
        path = self.directory / 'shop' / 'v1' / 'shop.py'
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text('this is not python(')

        await self._up()

        # The dashboard says why rather than showing nothing.
        await self._wait_for(lambda api: api.HasField('error'))

        self._write(self.directory, 'shop', 'Shop')
        await self._wait_for(lambda api: len(_read(api)) == 1)

        # Long enough that a change would have been recorded by now.
        await asyncio.sleep(2)

        self.assertEqual(await self._history(), [])

    async def test_a_type_added_after_startup_is_history(self) -> None:
        self._write(self.directory, 'shop', 'Shop')

        await self._up()
        await self._wait_for(lambda api: len(_read(api)) == 1)

        # A second file, written while the dashboard is watching. Both
        # declare the same request and response types in the same
        # package, so those are not new; the state type is.
        self._write(self.directory, 'depot', 'Depot')
        await self._wait_for(lambda api: len(_read(api)) == 2)

        while len(await self._history()) == 0:
            await asyncio.sleep(0.1)

        [change] = await self._history()

        self.assertEqual(change['id'], 'shop.v1.Depot')
        self.assertEqual(change['change'], 'added')
        # Which page it came from, so a row can link to it.
        self.assertEqual(change['kind'], 'state')
        self.assertTrue(change['file'].endswith('shop/v1/depot.py'))

    async def test_the_same_file_changing_twice_is_two_changes(self) -> None:
        # Saving one file again is the ordinary thing to do, and each
        # save is a different change recorded under the same alias.
        # Reboot rejects an alias reused with a different request, so
        # the keys the changes are stored under cannot be part of it.
        self._write(self.directory, 'shop', 'Shop')

        await self._up()
        await self._wait_for(lambda api: len(_read(api)) == 1)

        self._write(self.directory, 'shop', 'Bazaar')
        await self._wait_for(
            lambda api: [state['name'] for state in _read(api)] ==
            ['shop.v1.Bazaar']
        )

        self._write(self.directory, 'shop', 'Emporium')
        await self._wait_for(
            lambda api: [state['name'] for state in _read(api)] ==
            ['shop.v1.Emporium']
        )

        while len(await self._history()) < 4:
            await asyncio.sleep(0.1)

        # Each save added a state type and removed the one before it.
        self.assertEqual(
            sorted(
                (change['id'], change['change'])
                for change in await self._history()
            ),
            [
                ('shop.v1.Bazaar', 'added'),
                ('shop.v1.Bazaar', 'removed'),
                ('shop.v1.Emporium', 'added'),
                ('shop.v1.Shop', 'removed'),
            ],
        )

    async def test_a_change_says_which_parts_moved(self) -> None:
        # What changed in a type is the second question anybody asks,
        # so a change names the methods and fields that moved and
        # which way each of them went.
        self._write(self.directory, 'shop', 'Shop')

        await self._up()
        await self._wait_for(lambda api: len(_read(api)) == 1)

        # The same state type, with a second method.
        path = self.directory / 'shop' / 'v1' / 'shop.py'
        path.write_text(
            SHOP.format(state='Shop').replace(
                '    look=Reader(',
                '    stock=Reader(\n'
                '        request=LookRequest,\n'
                '        response=LookResponse,\n'
                '        description=None,\n'
                '        mcp=None,\n'
                '    ),\n'
                '    look=Reader(',
            )
        )

        while len(await self._history()) == 0:
            await asyncio.sleep(0.1)

        [change] = await self._history()

        self.assertEqual(change['id'], 'shop.v1.Shop')
        self.assertEqual(change['change'], 'changed')
        self.assertEqual(
            change['moved'],
            [{
                'name': 'stock',
                'change': 'added',
                'part': 'method'
            }]
        )

    async def test_a_file_deleted_is_history(self) -> None:
        self._write(self.directory, 'shop', 'Shop')
        self._write(self.directory, 'depot', 'Depot')

        await self._up()
        await self._wait_for(lambda api: len(_read(api)) == 2)

        (self.directory / 'shop' / 'v1' / 'depot.py').unlink()

        await self._wait_for(lambda api: len(_read(api)) == 1)

        while len(await self._history()) == 0:
            await asyncio.sleep(0.1)

        [change] = await self._history()

        self.assertEqual(change['id'], 'shop.v1.Depot')
        self.assertEqual(change['change'], 'removed')


if __name__ == '__main__':
    unittest.main()
