"""Where a state type is implemented follows what the API declares.

The API files say which state types exist, so a state type appearing
is what sets the dashboard looking for the file that implements it.
"""
import os
import tempfile
import unittest
from pathlib import Path
from rbt.dashboard.v1.dashboard_rbt import API, Implementation
from reboot.aio.tests import Reboot
from reboot.dashboard.constants import (
    API_ID,
    ENVVAR_RBT_API_DIRECTORY,
    ENVVAR_RBT_APPLICATION,
    IMPLEMENTATION_ID,
)
from reboot.dashboard.implementation_watcher import servicer_files
from reboot.dashboard.main import application
from unittest.mock import patch

API_FILE = '''
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

api = API(
    {state}=Type(
        state={state}State,
        methods={state}Methods,
        description={description},
    )
)
'''

SERVICER = '''
from shop.v1.{module}_rbt import {state}


class {state}Servicer({state}.Servicer):

    async def look(self, context, request):
        pass
'''

SINGLETON = '''
from shop.v1.{module}_rbt import {state}


class {state}Servicer({state}.singleton.Servicer):

    async def stock(self, context, request):
        pass
'''

# The two the file-finding tests use, spelled out once.
SHOP = SERVICER.format(state='Shop', module='shop')
DEPOT = SINGLETON.format(state='Depot', module='depot')

APPLICATION = '''
from shop_servicer import ShopServicer
from reboot.aio.applications import Application


async def main():
    await Application(servicers=[ShopServicer]).run()
'''


class ImplementationWatcherTest(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        # Both are read when the application comes up, so they have to
        # exist and be named first.
        self._api = tempfile.TemporaryDirectory()
        self._source = tempfile.TemporaryDirectory()
        self.api = Path(self._api.name)
        self.source = Path(self._source.name)

        (self.source / 'shop_servicer.py').write_text(
            SERVICER.format(state='Shop', module='shop')
        )
        (self.source / 'main.py').write_text(APPLICATION)

        self._environment = patch.dict(
            os.environ,
            {
                ENVVAR_RBT_API_DIRECTORY: str(self.api),
                ENVVAR_RBT_APPLICATION: str(self.source / 'main.py'),
            },
        )
        self._environment.start()

        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(application(), local_envoy=True)

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()
        self._environment.stop()
        self._source.cleanup()
        self._api.cleanup()

    def _declare(
        self,
        name: str,
        *,
        state: str,
        description: str = 'None',
    ) -> None:
        path = self.api / 'shop' / 'v1' / f'{name}.py'
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            API_FILE.format(
                state=state,
                description='None'
                if description == 'None' else repr(description),
            )
        )

    async def _servicers(self, *, satisfied):
        """Returns the files recorded against each state type once
        they satisfy, reading again whenever they change.

        A list per state type, because two classes servicing one is
        two entries rather than anything the recording adjudicates.
        """
        context = self.rbt.create_external_context(name=self.id())

        async for response in Implementation.ref(IMPLEMENTATION_ID
                                                ).reactively().Get(context):
            servicers: dict[str, list[str]] = {}

            for servicer in response.servicers:
                servicers.setdefault(servicer.state_type,
                                     []).append(servicer.file)

            if satisfied(servicers):
                return servicers

        raise AssertionError('never satisfied')

    async def test_records_the_servicer_it_finds(self) -> None:
        servicers = await self._servicers(
            satisfied=lambda found: 'shop.v1.Shop' in found
        )

        self.assertEqual(
            servicers['shop.v1.Shop'],
            [str(self.source / 'shop_servicer.py')],
        )

    async def test_a_state_type_nothing_services(self) -> None:
        """A state type nothing services is one with no entry, which
        is how a reader tells it apart from one that was placed."""
        self._declare('depot', state='Depot')

        servicers = await self._servicers(
            satisfied=lambda found: 'shop.v1.Shop' in found
        )

        self.assertNotIn('shop.v1.Depot', servicers)

    async def test_a_state_type_two_classes_service(self) -> None:
        """Both files are recorded against it, rather than one being
        chosen between them."""
        (self.source / 'other_servicer.py').write_text(SHOP)
        (self.source / 'main.py').write_text(
            APPLICATION.replace(
                'from shop_servicer import ShopServicer',
                'from other_servicer import ShopServicer as Other\n'
                'from shop_servicer import ShopServicer',
            )
        )

        servicers = await self._servicers(
            satisfied=lambda found: len(found.get('shop.v1.Shop', [])) == 2
        )

        self.assertEqual(
            servicers['shop.v1.Shop'], [
                str(self.source / 'other_servicer.py'),
                str(self.source / 'shop_servicer.py'),
            ]
        )

    async def test_a_servicer_written_after_the_dashboard_started(
        self
    ) -> None:
        """The application is watched, so a servicer written while the
        dashboard runs is found without a restart."""
        await self._servicers(satisfied=lambda found: 'shop.v1.Shop' in found)

        (self.source / 'depot_servicer.py').write_text(DEPOT)
        (self.source / 'main.py').write_text(
            APPLICATION.replace(
                'from shop_servicer import ShopServicer',
                'from depot_servicer import DepotServicer\n'
                'from shop_servicer import ShopServicer',
            )
        )

        servicers = await self._servicers(
            satisfied=lambda found: 'shop.v1.Depot' in found
        )

        self.assertEqual(
            servicers['shop.v1.Depot'],
            [str(self.source / 'depot_servicer.py')],
        )

    async def test_what_is_declared_and_what_implements_it_are_separate(
        self
    ) -> None:
        """Read from different places by different workflows, and so
        recorded without either waiting on the other."""
        self._declare('shop', state='Shop')

        servicers = await self._servicers(
            satisfied=lambda found: 'shop.v1.Shop' in found
        )
        self.assertEqual(
            servicers['shop.v1.Shop'],
            [str(self.source / 'shop_servicer.py')],
        )

        context = self.rbt.create_external_context(name=self.id())

        async for response in API.ref(API_ID).reactively().Get(context):
            if any(
                state_type.name == 'shop.v1.Shop'
                for state_type in response.state_types
            ):
                return

        raise AssertionError("'shop.v1.Shop' was never declared")


class ServicerFilesTest(unittest.IsolatedAsyncioTestCase):
    """Which file implements which state type."""

    def setUp(self) -> None:
        self._directory = tempfile.TemporaryDirectory()
        self.directory = Path(self._directory.name)

    def tearDown(self) -> None:
        self._directory.cleanup()

    def _write(self, name: str, *, source: str) -> str:
        path = self.directory / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(source)
        return str(path)

    async def test_finds_the_file_a_state_type_is_implemented_in(self) -> None:
        self._write('shop_servicer.py', source=SHOP)
        application = self._write('main.py', source=APPLICATION)

        servicers = await servicer_files(application=application)

        self.assertEqual(
            servicers,
            [('shop.v1.Shop', str(self.directory / 'shop_servicer.py'))],
        )

    async def test_a_singleton_says_what_it_services_the_same_way(
        self
    ) -> None:
        self._write('depot_servicer.py', source=DEPOT)
        application = self._write(
            'main.py',
            source=APPLICATION.replace('shop_servicer',
                                       'depot_servicer').replace(
                                           'ShopServicer', 'DepotServicer'
                                       ),
        )

        servicers = await servicer_files(application=application)

        self.assertEqual(
            servicers,
            [('shop.v1.Depot', str(self.directory / 'depot_servicer.py'))],
        )

    async def test_several_state_types_in_one_file(self) -> None:
        """A file is named after at most one of the state types it
        implements, which is why the application is what says."""
        self._write('servicers.py', source=SHOP + DEPOT)
        application = self._write(
            'main.py', source='''
from servicers import DepotServicer, ShopServicer
from reboot.aio.applications import Application


async def main():
    await Application(servicers=[ShopServicer, DepotServicer]).run()
'''
        )

        servicers = await servicer_files(application=application)

        self.assertEqual(
            servicers, [
                ('shop.v1.Depot', str(self.directory / 'servicers.py')),
                ('shop.v1.Shop', str(self.directory / 'servicers.py')),
            ]
        )

    ###################################################################
    # Reached however the application reaches it.

    async def test_an_application_that_does_not_spell_out_its_servicers(
        self
    ) -> None:
        """Only running it would say what `servicers()` returns -- but
        its module had to be imported for it to be callable at all,
        which is enough."""
        self._write('servicers.py', source=SHOP)
        application = self._write(
            'main.py', source='''
from servicers import servicers
from reboot.aio.applications import Application


async def main():
    await Application(servicers=servicers()).run()
'''
        )

        servicers = await servicer_files(application=application)

        self.assertEqual(
            servicers,
            [('shop.v1.Shop', str(self.directory / 'servicers.py'))],
        )

    async def test_a_servicer_reached_through_another_module(self) -> None:
        """Imported by something imported by the application."""
        self._write('shop_servicer.py', source=SHOP)
        self._write(
            'servicers.py', source='from shop_servicer import ShopServicer\n'
        )
        application = self._write(
            'main.py', source='''
from servicers import ShopServicer
from reboot.aio.applications import Application


async def main():
    await Application(servicers=[ShopServicer]).run()
'''
        )

        servicers = await servicer_files(application=application)

        self.assertEqual(
            servicers,
            [('shop.v1.Shop', str(self.directory / 'shop_servicer.py'))],
        )

    async def test_an_import_that_is_not_at_the_top_of_the_file(self) -> None:
        """Guarding an import is common; it binds its name just the
        same."""
        self._write('shop_servicer.py', source=SHOP)
        application = self._write(
            'main.py', source='''
import os
from reboot.aio.applications import Application

if os.environ.get('LEGACY'):
    from legacy_servicer import ShopServicer
else:
    from shop_servicer import ShopServicer


async def main():
    await Application(servicers=[ShopServicer]).run()
'''
        )

        servicers = await servicer_files(application=application)

        self.assertEqual(
            servicers,
            [('shop.v1.Shop', str(self.directory / 'shop_servicer.py'))],
        )

    async def test_a_servicer_in_a_package(self) -> None:
        self._write('servicers/__init__.py', source='')
        self._write('servicers/shop.py', source=SHOP)
        application = self._write(
            'main.py', source='''
from servicers.shop import ShopServicer
from reboot.aio.applications import Application


async def main():
    await Application(servicers=[ShopServicer]).run()
'''
        )

        servicers = await servicer_files(application=application)

        self.assertEqual(
            servicers,
            [('shop.v1.Shop', str(self.directory / 'servicers' / 'shop.py'))],
        )

    ###################################################################
    # Where the walk stops.

    async def test_an_import_of_somebody_elses_package_leads_nowhere(
        self
    ) -> None:
        """A module no root holds is not the developer's code. Reading
        it is not the dashboard's business, and no state type of theirs
        is waiting for it."""
        elsewhere = tempfile.TemporaryDirectory()
        try:
            (Path(elsewhere.name) / 'library.py').write_text(SHOP)

            application = self._write(
                'main.py', source='''
from library import ShopServicer
from reboot.aio.applications import Application


async def main():
    await Application(servicers=[ShopServicer]).run()
'''
            )

            servicers = await servicer_files(application=application)

            self.assertEqual(servicers, [])

            # Named as a root, the very same import leads there.
            servicers = await servicer_files(
                application=application,
                roots=[str(self.directory), elsewhere.name],
            )
            self.assertEqual(
                servicers,
                [('shop.v1.Shop', str(Path(elsewhere.name) / 'library.py'))],
            )
        finally:
            elsewhere.cleanup()

    ###################################################################
    # What it cannot place.

    async def test_a_file_that_will_not_parse(self) -> None:
        """Its servicers go unfound, because which state types they
        service is precisely what went unread."""
        self._write('shop_servicer.py', source='class ShopServicer(')
        application = self._write('main.py', source=APPLICATION)

        servicers = await servicer_files(application=application)

        self.assertEqual(servicers, [])

    async def test_an_application_that_is_not_there(self) -> None:
        servicers = await servicer_files(
            application=str(self.directory / 'nowhere.py')
        )

        self.assertEqual(servicers, [])

    async def test_two_classes_servicing_the_same_state_type(self) -> None:
        """Both are recorded, rather than one being chosen between
        them: which one runs is not something this can see."""
        self._write('shop_servicer.py', source=SHOP)
        self._write('other_servicer.py', source=SHOP)
        application = self._write(
            'main.py', source='''
from other_servicer import ShopServicer as Other
from shop_servicer import ShopServicer
from reboot.aio.applications import Application


async def main():
    await Application(servicers=[ShopServicer]).run()
'''
        )

        servicers = await servicer_files(application=application)

        self.assertEqual(
            servicers, [
                ('shop.v1.Shop', str(self.directory / 'other_servicer.py')),
                ('shop.v1.Shop', str(self.directory / 'shop_servicer.py')),
            ]
        )

    async def test_a_class_that_services_nothing(self) -> None:
        """A class whose base names no generated module is not a
        servicer this can place."""
        self._write(
            'shop_servicer.py', source='''
class ShopServicer(SomethingElse):
    pass
'''
        )
        application = self._write('main.py', source=APPLICATION)

        servicers = await servicer_files(application=application)

        self.assertEqual(servicers, [])


if __name__ == '__main__':
    unittest.main()
