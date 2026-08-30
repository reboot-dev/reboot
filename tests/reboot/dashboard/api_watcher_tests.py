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
from rbt.dashboard.v1.dashboard_pb2 import Change
from rbt.dashboard.v1.dashboard_rbt import API
from rbt.std.collections.ordered_map.v1.ordered_map_rbt import OrderedMap
from rbt.v1alpha1.pydantic.schema_pb2 import INTEGER, STRING
from reboot.aio.tests import Reboot
from reboot.dashboard.constants import (
    API_ID,
    CHANGELOG_ID,
    ENVVAR_RBT_API_DIRECTORY,
)
from reboot.dashboard.main import application
from reboot.dashboard.walk import _modified_at
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


def _named(change: Change) -> tuple[str, str]:
    """The name the change's arm carries, and which arm it is."""
    arm = change.WhichOneof('change')
    assert arm is not None
    return getattr(change, arm).name, arm


def _state_types_in(response) -> list[dict]:
    """Every state type the API files declare, as JSON, named the way
    the runtime names one: the file's package, then its name."""
    return [
        MessageToDict(state_type) | {
            'name': f'{api.package}.{state_type.name}'
        } for api in response.apis.values() for state_type in api.state_types
    ]


def _schemas_in(response) -> list:
    """Every model's schema the API files declare."""
    return [
        schema for api in response.apis.values()
        for schema in api.schemas.values()
    ]


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

    async def _start_dashboard(self) -> None:
        """Brings the dashboard up.

        Called by each test rather than in setup, so a test can write
        API files first and start the dashboard against files that
        already exist.
        """
        self.revision = await self.rbt.up(application(), local_envoy=True)
        self.url = f'http://127.0.0.1:{self.rbt.envoy_port()}'

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()
        self._environment.stop()
        self._directory.cleanup()

    def _write_api_file(self, directory: Path, name: str, state: str) -> None:
        path = directory / 'shop' / 'v1' / f'{name}.py'
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(SHOP.format(state=state))

    async def _wait_for_api(self, satisfied):
        """Returns the recorded API once it satisfies, reading again
        whenever it changes."""
        context = self.rbt.create_external_context(name=self.id())

        async for response in API.ref(API_ID).reactively().Get(context):
            if satisfied(response):
                return response

        raise AssertionError('never satisfied')

    async def _changelog_entries(self) -> list[Change]:
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
        return [Change.FromString(entry.bytes) for entry in response.entries]

    async def test_a_change_to_an_imported_file_reads_its_importer(
        self,
    ) -> None:
        """A file declaring nothing, imported by one that does, is a
        dependency of it: changing the imported file reads the
        importer again, so what it declares follows."""
        models = self.directory / 'shop' / 'v1' / 'models.py'
        models.parent.mkdir(parents=True, exist_ok=True)
        models.write_text(
            'from reboot.api import Field, Model\n'
            '\n'
            '\n'
            'class LookRequest(Model):\n'
            '    item: str = Field(tag=1)\n'
        )
        shop = self.directory / 'shop' / 'v1' / 'shop.py'
        shop.write_text(
            SHOP.format(state='Shop').replace(
                'class LookRequest(Model):\n    item: str = Field(tag=1)\n',
                'from shop.v1.models import LookRequest\n',
            )
        )

        await self._start_dashboard()
        await self._wait_for_api(lambda api: len(_state_types_in(api)) == 1)

        # A second field, in the imported file only.
        models.write_text(
            models.read_text() + '    quantity: int = Field(tag=2)\n'
        )

        api = await self._wait_for_api(
            lambda api: any(
                property.name == 'quantity' for schema in _schemas_in(api) for
                property in schema.properties
            )
        )
        self.assertIn('shop/v1/models.py', api.files)

    async def test_a_burst_of_saves_reads_every_saved_file(self) -> None:
        """Files saved together are all read, however many of the
        saves the watch heard: what to read is decided by walking
        the files, not by the event."""
        self._write_api_file(self.directory, 'shop', 'Shop')
        self._write_api_file(self.directory, 'depot', 'Depot')

        await self._start_dashboard()
        await self._wait_for_api(lambda api: len(_state_types_in(api)) == 2)

        self._write_api_file(self.directory, 'shop', 'Bazaar')
        self._write_api_file(self.directory, 'depot', 'Warehouse')

        await self._wait_for_api(
            lambda api: sorted(
                state['name'] for state in _state_types_in(api)
            ) == ['shop.v1.Bazaar', 'shop.v1.Warehouse']
        )

    async def test_a_file_that_will_not_read_says_so_beside_the_file(
        self,
    ) -> None:
        """Why a file could not be read is recorded against that file,
        beside the digest that spares reading it again unchanged."""
        self._write_api_file(self.directory, 'shop', 'Shop')
        broken = self.directory / 'shop' / 'v1' / 'depot.py'
        broken.write_text('this is not python(')

        await self._start_dashboard()
        # Both files read: the broken one, which sorts first, is
        # written before the other is read.
        api = await self._wait_for_api(
            lambda api: api.HasField('error') and len(_state_types_in(api)) ==
            1
        )

        self.assertTrue(api.files['shop/v1/depot.py'].HasField('error'))
        self.assertIn('SyntaxError', api.files['shop/v1/depot.py'].error)
        self.assertFalse(api.files['shop/v1/shop.py'].HasField('error'))
        self.assertEqual(
            [state['name'] for state in _state_types_in(api)],
            ['shop.v1.Shop'],
        )

    async def test_a_change_made_while_the_dashboard_was_down_is_history(
        self,
    ) -> None:
        """A dashboard brought back up reads what changed while it was
        down and records it: the state remembers what it last saw,
        and a restart is itself a reason to walk the files again
        rather than waiting for a save."""
        self._write_api_file(self.directory, 'shop', 'Shop')

        await self._start_dashboard()
        await self._wait_for_api(
            lambda api: len(_state_types_in(api)) == 1 and 'shop/v1/shop.py' in
            api.files
        )

        await self.rbt.down()

        self._write_api_file(self.directory, 'depot', 'Depot')

        await self.rbt.up(revision=self.revision)
        await self._wait_for_api(lambda api: len(_state_types_in(api)) == 2)

        # The first read recorded `Shop`, `LookRequest` and
        # `LookResponse`; the restart's read recorded what `depot.py`
        # declares.
        newest = await self._changelog_entries()

        self.assertEqual(
            sorted(_named(change) for change in newest[:3]),
            [
                ('shop.v1.Depot', 'state_type_added'),
                ('shop.v1.depot.LookRequest', 'data_type_added'),
                ('shop.v1.depot.LookResponse', 'data_type_added'),
            ],
        )

    async def test_a_restart_keeps_what_unchanged_files_declare(self) -> None:
        """A dashboard brought back up joins each file's state types
        back onto the file it recorded, so an edit to one file after
        the restart leaves what the other files declare in place. With
        the API directory spelled relative to the working directory,
        as `rbt dashboard --api-directory=api` spells it, which is how
        every filename the state records is spelled too."""
        working_directory = os.getcwd()
        os.chdir(self.directory)
        self.addCleanup(os.chdir, working_directory)
        with patch.dict(os.environ, {ENVVAR_RBT_API_DIRECTORY: 'api'}):
            api_directory = self.directory / 'api'
            self._write_api_file(api_directory, 'shop', 'Shop')
            self._write_api_file(api_directory, 'depot', 'Depot')

            await self._start_dashboard()
            await self._wait_for_api(
                lambda api: len(_state_types_in(api)) == 2
            )

            await self.rbt.down()
            await self.rbt.up(revision=self.revision)

            # An edit to one file, after the restart.
            path = api_directory / 'shop' / 'v1' / 'shop.py'
            path.write_text(
                SHOP.format(state='Shop').replace(
                    'class ShopState(Model):\n    name: str = Field(tag=1)\n',
                    'class ShopState(Model):\n'
                    '    name: str = Field(tag=1)\n'
                    '    quantity: int = Field(tag=2)\n',
                )
            )
            api = await self._wait_for_api(
                lambda api: any(
                    property.name == 'quantity' for schema in
                    _schemas_in(api) for property in schema.properties
                )
            )

            # `Depot`, in the file that did not change, is still there,
            # and was never recorded as removed.
            self.assertEqual(
                sorted(state['name'] for state in _state_types_in(api)),
                ['shop.v1.Depot', 'shop.v1.Shop'],
            )
            self.assertNotIn(
                ('shop.v1.Depot', 'state_type_removed'),
                [_named(change) for change in await self._changelog_entries()],
            )

    async def test_every_api_file_is_listed_with_when_it_was_modified(
        self,
    ) -> None:
        """Every candidate API file is recorded with its modification
        time, a file declaring no state type included, since its
        change is what makes generated code stale too."""
        self._write_api_file(self.directory, 'shop', 'Shop')
        helper = self.directory / 'shop' / 'v1' / 'helper.py'
        helper.write_text('SHARED = 1\n')

        await self._start_dashboard()
        api = await self._wait_for_api(lambda api: len(api.files) == 2)

        self.assertEqual(
            api.files['shop/v1/helper.py'].modified,
            _modified_at(helper),
        )
        self.assertEqual(
            api.files['shop/v1/shop.py'].modified,
            _modified_at(self.directory / 'shop' / 'v1' / 'shop.py'),
        )

    async def test_the_first_read_records_what_is_on_disk(self) -> None:
        self._write_api_file(self.directory, 'shop', 'Shop')

        await self._start_dashboard()
        await self._wait_for_api(lambda api: len(_state_types_in(api)) == 1)

        self.assertEqual(
            sorted(
                _named(change) for change in await self._changelog_entries()
            ),
            [
                ('shop.v1.Shop', 'state_type_added'),
                ('shop.v1.shop.LookRequest', 'data_type_added'),
                ('shop.v1.shop.LookResponse', 'data_type_added'),
            ],
        )

    async def test_fixing_a_file_broken_at_startup_is_history(self) -> None:
        # A file that was on disk but did not parse told the dashboard
        # nothing; what it turns out to declare once it does parse is
        # what the dashboard then sees added.
        path = self.directory / 'shop' / 'v1' / 'shop.py'
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text('this is not python(')

        await self._start_dashboard()

        # The dashboard says why rather than showing nothing.
        await self._wait_for_api(lambda api: api.HasField('error'))

        self._write_api_file(self.directory, 'shop', 'Shop')
        await self._wait_for_api(lambda api: len(_state_types_in(api)) == 1)

        # The state type and the two data types it declares.
        self.assertEqual(
            sorted(
                _named(change) for change in await self._changelog_entries()
            ),
            [
                ('shop.v1.Shop', 'state_type_added'),
                ('shop.v1.shop.LookRequest', 'data_type_added'),
                ('shop.v1.shop.LookResponse', 'data_type_added'),
            ],
        )

    async def test_a_type_added_after_startup_is_history(self) -> None:
        self._write_api_file(self.directory, 'shop', 'Shop')

        await self._start_dashboard()
        await self._wait_for_api(lambda api: len(_state_types_in(api)) == 1)

        # A second file, written while the dashboard is watching. Both
        # declare the same request and response types in the same
        # package, so those are not new; the state type is.
        self._write_api_file(self.directory, 'depot', 'Depot')
        await self._wait_for_api(lambda api: len(_state_types_in(api)) == 2)

        # The first read recorded `Shop`, `LookRequest` and `LookResponse`.
        # `depot.py` declares `Depot` and its own `LookRequest` and
        # `LookResponse`.
        *_, change = (await self._changelog_entries())[:3]

        self.assertEqual(change.WhichOneof('change'), 'state_type_added')
        self.assertEqual(change.state_type_added.name, 'shop.v1.Depot')
        self.assertEqual(change.state_type_added.filename, 'shop/v1/depot.py')

    async def test_the_same_file_changing_twice_is_two_changes(self) -> None:
        # Saving one file again is the ordinary thing to do, and each
        # save is a different change recorded under the same alias.
        # Reboot rejects an alias reused with a different request, so
        # the keys the changes are stored under cannot be part of it.
        self._write_api_file(self.directory, 'shop', 'Shop')

        await self._start_dashboard()
        await self._wait_for_api(lambda api: len(_state_types_in(api)) == 1)

        self._write_api_file(self.directory, 'shop', 'Bazaar')
        await self._wait_for_api(
            lambda api: [state['name'] for state in _state_types_in(api)] ==
            ['shop.v1.Bazaar']
        )

        self._write_api_file(self.directory, 'shop', 'Emporium')
        await self._wait_for_api(
            lambda api: [state['name'] for state in _state_types_in(api)] ==
            ['shop.v1.Emporium']
        )

        # The first read added three types; each save then added a
        # state type and removed the one before it.
        self.assertEqual(
            sorted(
                _named(change) for change in await self._changelog_entries()
            ),
            [
                ('shop.v1.Bazaar', 'state_type_added'),
                ('shop.v1.Bazaar', 'state_type_removed'),
                ('shop.v1.Emporium', 'state_type_added'),
                ('shop.v1.Shop', 'state_type_added'),
                ('shop.v1.Shop', 'state_type_removed'),
                ('shop.v1.shop.LookRequest', 'data_type_added'),
                ('shop.v1.shop.LookResponse', 'data_type_added'),
            ],
        )

    async def test_a_change_says_which_parts_changed(self) -> None:
        # What changed in a type is the second question anybody asks,
        # so a change names the methods and fields that changed and
        # which way each of them went.
        self._write_api_file(self.directory, 'shop', 'Shop')

        await self._start_dashboard()
        await self._wait_for_api(lambda api: len(_state_types_in(api)) == 1)

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
        await self._wait_for_api(
            lambda api: any(
                len(state_type['methods']) == 2
                for state_type in _state_types_in(api)
            )
        )

        # The first read recorded `Shop`, `LookRequest` and `LookResponse`.
        change, *_ = await self._changelog_entries()

        self.assertEqual(change.WhichOneof('change'), 'state_type_changed')
        self.assertEqual(change.state_type_changed.name, 'shop.v1.Shop')
        self.assertEqual(
            [
                (method.name, method.WhichOneof('change'))
                for method in change.state_type_changed.methods
            ],
            [('stock', 'added')],
        )
        self.assertEqual(list(change.state_type_changed.properties), [])

    async def test_a_change_names_the_state_models_properties(
        self,
    ) -> None:
        """A field added to the state model is named, the way a data
        type's property is, and the state model is marked changed."""
        self._write_api_file(self.directory, 'shop', 'Shop')

        await self._start_dashboard()
        await self._wait_for_api(lambda api: len(_state_types_in(api)) == 1)

        path = self.directory / 'shop' / 'v1' / 'shop.py'
        path.write_text(
            SHOP.format(state='Shop').replace(
                'class ShopState(Model):\n    name: str = Field(tag=1)\n',
                'class ShopState(Model):\n'
                '    name: str = Field(tag=1)\n'
                '    quantity: int = Field(tag=2)\n',
            )
        )

        await self._wait_for_api(
            lambda api: any(
                property.name == 'quantity' for schema in _schemas_in(api) for
                property in schema.properties
            )
        )

        # The first read recorded `Shop`, `LookRequest` and `LookResponse`.
        change, *_ = await self._changelog_entries()

        self.assertEqual(change.WhichOneof('change'), 'state_type_changed')
        self.assertEqual(
            [
                (property.tag, property.name, property.WhichOneof('change'))
                for property in change.state_type_changed.properties
            ],
            [(2, 'quantity', 'added')],
        )
        self.assertEqual(list(change.state_type_changed.methods), [])

    async def test_a_property_is_known_by_its_tag(self) -> None:
        """A property keeps its tag through a rename, so a field
        renamed and retyped in one save is one property renamed and
        its type changed, not a field removed and another added."""
        self._write_api_file(self.directory, 'shop', 'Shop')

        await self._start_dashboard()
        await self._wait_for_api(lambda api: len(_state_types_in(api)) == 1)

        path = self.directory / 'shop' / 'v1' / 'shop.py'
        path.write_text(
            SHOP.format(state='Shop').replace(
                'class ShopState(Model):\n    name: str = Field(tag=1)\n',
                'class ShopState(Model):\n    title: int = Field(tag=1)\n',
            )
        )

        await self._wait_for_api(
            lambda api: any(
                property.name == 'title' for schema in _schemas_in(api) for
                property in schema.properties
            )
        )

        # The first read recorded `Shop`, `LookRequest` and `LookResponse`.
        change, *_ = await self._changelog_entries()

        self.assertEqual(change.WhichOneof('change'), 'state_type_changed')
        renamed, retyped = change.state_type_changed.properties
        self.assertEqual(
            (renamed.tag, renamed.name, renamed.WhichOneof('change')),
            (1, 'title', 'renamed'),
        )
        self.assertEqual(
            (getattr(renamed.renamed, 'from'), renamed.renamed.to),
            ('name', 'title'),
        )
        self.assertEqual(
            (retyped.tag, retyped.name, retyped.WhichOneof('change')),
            (1, 'title', 'type'),
        )
        self.assertEqual(getattr(retyped.type, 'from').scalar, STRING)
        self.assertEqual(retyped.type.to.scalar, INTEGER)

    async def test_a_file_deleted_is_history(self) -> None:
        self._write_api_file(self.directory, 'shop', 'Shop')
        self._write_api_file(self.directory, 'depot', 'Depot')

        await self._start_dashboard()
        await self._wait_for_api(lambda api: len(_state_types_in(api)) == 2)

        (self.directory / 'shop' / 'v1' / 'depot.py').unlink()

        await self._wait_for_api(lambda api: len(_state_types_in(api)) == 1)

        # The first read recorded `Shop`, `Depot`, `LookRequest` and
        # `LookResponse`.
        # Everything `depot.py` declared is gone: `Depot` and its own
        # `LookRequest` and `LookResponse`.
        *_, change = (await self._changelog_entries())[:3]

        self.assertEqual(change.WhichOneof('change'), 'state_type_removed')
        self.assertEqual(change.state_type_removed.name, 'shop.v1.Depot')


if __name__ == '__main__':
    unittest.main()
