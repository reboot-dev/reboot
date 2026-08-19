"""Where a state type is implemented follows what the API declares.

The API files say which state types exist, so a state type appearing
is what sets the dashboard looking for the file that implements it.
"""
import ast
import os
import tempfile
import unittest
from pathlib import Path
from rbt.dashboard.v1.dashboard_pb2 import ServicerInfo
from rbt.dashboard.v1.dashboard_rbt import API, Implementation
from reboot.aio.tests import Reboot
from reboot.dashboard import implementation_watcher
from reboot.dashboard.constants import (
    API_ID,
    ENVVAR_RBT_API_DIRECTORY,
    ENVVAR_RBT_APPLICATION,
    IMPLEMENTATION_ID,
)
from reboot.dashboard.implementation_watcher import File, analyze, servicers
from reboot.dashboard.main import application
from typing import Mapping
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


def _state_types_and_files(files: dict[str, File]) -> list[tuple[str, str]]:
    """Returns every servicer as the state type it services and the
    file it is written in."""
    return [
        (servicer.state_type, servicer.file) for servicer in servicers(files)
    ]


class AnalyzeTest(unittest.TestCase):
    """What analyzing a method's body found.

    Nothing records calls yet, so these observe the analysis through
    what each name held when the body ended."""

    def _analyze(self, body: str) -> implementation_watcher.Analysis:
        module = ast.parse(
            SERVICER.format(state='Shop', module='shop').replace(
                '    async def look(self, context, request):\n        pass',
                '    async def look(self, context, request):\n' + body,
            )
        )
        imports = implementation_watcher._imports(module)

        for node in ast.walk(module):
            match node:
                case ast.AsyncFunctionDef(name='look'):
                    return implementation_watcher._analyze_method(
                        node,
                        state_type='shop.v1.Shop',
                        imports=imports,
                    )

        raise AssertionError('no method to analyze')

    def _locals(self, body: str) -> Mapping[str, implementation_watcher.Local]:
        return self._analyze(body).locals

    def test_the_context_is_the_parameter_after_self(self) -> None:
        self.assertEqual(
            self._locals('        pass'),
            {'context': implementation_watcher.Context()},
        )

    def test_a_reference_to_another_state_type(self) -> None:
        names = self._locals(
            '        from shop.v1.depot_rbt import Depot\n'
            '        depot = Depot.ref(request.depot)'
        )

        self.assertEqual(
            names['depot'],
            implementation_watcher.Reference(state_type='shop.v1.Depot'),
        )

    def test_a_reference_to_the_state_being_serviced(self) -> None:
        names = self._locals('        shop = self.ref()')

        self.assertEqual(
            names['shop'],
            implementation_watcher.Reference(state_type='shop.v1.Shop'),
        )

    def test_a_name_holding_what_another_holds(self) -> None:
        names = self._locals(
            '        shop = self.ref()\n'
            '        same = shop'
        )

        self.assertEqual(names['same'], names['shop'])

    def test_a_name_assigned_something_it_cannot_follow(self) -> None:
        """Held until it is not: assigning over a reference with
        something unreadable stops it being a reference."""
        names = self._locals(
            '        shop = self.ref()\n'
            '        shop = whatever()'
        )

        self.assertNotIn('shop', names)

    def test_a_name_bound_inside_a_block(self) -> None:
        """Names are taken together rather than by scope, so one bound
        inside an `if` is held the same way."""
        names = self._locals(
            '        if request.wanted:\n'
            '            shop = self.ref()'
        )

        self.assertEqual(
            names['shop'],
            implementation_watcher.Reference(state_type='shop.v1.Shop'),
        )

    def test_a_name_holding_nothing_it_can_say(self) -> None:
        names = self._locals('        total = request.a + request.b')

        self.assertNotIn('total', names)

    def test_an_assignment_it_cannot_bind_is_unsupported(self) -> None:
        """Said as written, so a reader of the calls can be told they
        are likely incomplete and find why. Twice here: the context
        flows into a call that is not followed, and the unpacking is a
        target that cannot be bound."""
        analysis = self._analyze('        account, _ = whatever(context)')

        self.assertEqual(
            analysis.unsupported, (
                'whatever(context)',
                '(account, _) = whatever(context)',
            )
        )

    def test_an_unbindable_target_stops_its_names_being_held(self) -> None:
        """`account` no longer holds the reference: whatever the
        unpacking gave it is not something this followed."""
        analysis = self._analyze(
            '        account = self.ref()\n'
            '        account, _ = whatever(context)'
        )

        self.assertNotIn('account', analysis.locals)

    def test_an_annotated_assignment_binds_the_same_way(self) -> None:
        names = self._analyze('        shop: object = self.ref()').locals

        self.assertEqual(
            names['shop'],
            implementation_watcher.Reference(state_type='shop.v1.Shop'),
        )

    def test_a_bare_annotation_binds_nothing(self) -> None:
        analysis = self._analyze(
            '        shop = self.ref()\n'
            '        shop: object'
        )

        self.assertEqual(
            analysis.locals['shop'],
            implementation_watcher.Reference(state_type='shop.v1.Shop'),
        )
        self.assertEqual(analysis.unsupported, ())

    def test_an_augmented_assignment_stops_a_name_being_held(self) -> None:
        """`x += y` makes `x` hold something no name was ever bound
        to, whatever the two held."""
        analysis = self._analyze(
            '        shop = self.ref()\n'
            '        shop += request.a'
        )

        self.assertNotIn('shop', analysis.locals)
        self.assertEqual(analysis.unsupported, ())

    def test_a_ref_on_something_unresolvable_is_unsupported(self) -> None:
        """Almost certainly a reference being lost, however it was
        reached."""
        analysis = self._analyze("        shop = stores.Shop.ref('a')")

        self.assertEqual(analysis.unsupported, ("stores.Shop.ref('a')",))
        self.assertNotIn('shop', analysis.locals)

    def test_a_state_type_used_some_other_way_is_unsupported(self) -> None:
        analysis = self._analyze('        shop = Shop.open(context)')

        self.assertEqual(analysis.unsupported, ('Shop.open(context)',))

    def test_the_context_reaching_an_unfollowed_call_is_unsupported(
        self
    ) -> None:
        analysis = self._analyze('        result = self._helper(context)')

        self.assertEqual(analysis.unsupported, ('self._helper(context)',))

    def test_an_ordinary_assignment_is_not_unsupported(self) -> None:
        analysis = self._analyze('        total = request.a + request.b')

        self.assertEqual(analysis.unsupported, ())


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
        """Returns the servicers recorded against each state type
        once they satisfy, reading again whenever they change.

        A list per state type, because two classes servicing one is
        two entries rather than anything the recording adjudicates.
        """
        context = self.rbt.create_external_context(name=self.id())

        async for response in Implementation.ref(IMPLEMENTATION_ID
                                                ).reactively().Get(context):
            found: dict[str, list[ServicerInfo]] = {}

            for servicer in response.servicers:
                found.setdefault(servicer.state_type, []).append(servicer)

            if satisfied(found):
                return found

        raise AssertionError('never satisfied')

    async def test_records_the_servicer_it_finds(self) -> None:
        found = await self._servicers(
            satisfied=lambda found: 'shop.v1.Shop' in found
        )

        self.assertEqual(
            [servicer.file for servicer in found['shop.v1.Shop']],
            [str(self.source / 'shop_servicer.py')],
        )

    async def test_the_methods_reach_the_state(self) -> None:
        """What the browser will join against what the API files say
        each state type declares."""
        found = await self._servicers(
            satisfied=lambda found: 'shop.v1.Shop' in found
        )

        self.assertEqual(
            [method.name for method in found['shop.v1.Shop'][0].methods],
            ['look'],
        )

    async def test_a_state_type_nothing_services(self) -> None:
        """A state type nothing services is one with no entry, which
        is how a reader tells it apart from one a servicer was found
        for."""
        self._declare('depot', state='Depot')

        found = await self._servicers(
            satisfied=lambda found: 'shop.v1.Shop' in found
        )

        self.assertNotIn('shop.v1.Depot', found)

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

        found = await self._servicers(
            satisfied=lambda found: len(found.get('shop.v1.Shop', [])) == 2
        )

        self.assertEqual(
            [servicer.file for servicer in found['shop.v1.Shop']], [
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

        found = await self._servicers(
            satisfied=lambda found: 'shop.v1.Depot' in found
        )

        self.assertEqual(
            [servicer.file for servicer in found['shop.v1.Depot']],
            [str(self.source / 'depot_servicer.py')],
        )

    async def test_what_is_declared_and_what_implements_it_are_separate(
        self
    ) -> None:
        """Read from different places by different workflows, and so
        recorded without either waiting on the other."""
        self._declare('shop', state='Shop')

        found = await self._servicers(
            satisfied=lambda found: 'shop.v1.Shop' in found
        )
        self.assertEqual(
            [servicer.file for servicer in found['shop.v1.Shop']],
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

        found = _state_types_and_files(await analyze(application=application))

        self.assertEqual(
            found,
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

        found = _state_types_and_files(await analyze(application=application))

        self.assertEqual(
            found,
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

        found = _state_types_and_files(await analyze(application=application))

        self.assertEqual(
            found, [
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

        found = _state_types_and_files(await analyze(application=application))

        self.assertEqual(
            found,
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

        found = _state_types_and_files(await analyze(application=application))

        self.assertEqual(
            found,
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

        found = _state_types_and_files(await analyze(application=application))

        self.assertEqual(
            found,
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

        found = _state_types_and_files(await analyze(application=application))

        self.assertEqual(
            found,
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

            found = _state_types_and_files(
                await analyze(application=application)
            )

            self.assertEqual(found, [])

            # Named as a root, the very same import leads there.
            found = _state_types_and_files(
                await analyze(
                    application=application,
                    roots=[str(self.directory), elsewhere.name],
                )
            )
            self.assertEqual(
                found,
                [('shop.v1.Shop', str(Path(elsewhere.name) / 'library.py'))],
            )
        finally:
            elsewhere.cleanup()

    ###################################################################
    # The methods each servicer defines.

    async def test_records_the_methods_a_servicer_defines(self) -> None:
        self._write('shop_servicer.py', source=SHOP)
        application = self._write('main.py', source=APPLICATION)

        found = servicers(await analyze(application=application))

        self.assertEqual(
            [method.name for method in found[0].methods], ['look']
        )

    async def test_a_method_reformatted_digests_the_same(self) -> None:
        """The digest is over what the method says, so laying it out
        differently or writing a comment in it is not a change."""
        self._write('shop_servicer.py', source=SHOP)
        application = self._write('main.py', source=APPLICATION)

        before = servicers(await analyze(application=application))

        self._write(
            'shop_servicer.py',
            source=SHOP.replace(
                'async def look(self, context, request):\n        pass',
                'async def look(\n'
                '        self,\n'
                '        context,\n'
                '        request,\n'
                '    ):\n'
                '        # Nothing to look up yet.\n'
                '        pass',
            ),
        )

        after = servicers(await analyze(application=application))

        self.assertEqual(
            [method.digest for method in after[0].methods],
            [method.digest for method in before[0].methods],
        )

    async def test_a_method_whose_body_changes_digests_differently(
        self
    ) -> None:
        self._write('shop_servicer.py', source=SHOP)
        application = self._write('main.py', source=APPLICATION)

        before = servicers(await analyze(application=application))

        self._write(
            'shop_servicer.py',
            source=SHOP.replace('        pass', '        return None'),
        )

        after = servicers(await analyze(application=application))

        self.assertNotEqual(
            after[0].methods[0].digest,
            before[0].methods[0].digest,
        )

    ###################################################################
    # Parse again only what has changed.

    async def test_a_file_written_with_the_same_bytes_is_not_parsed_again(
        self
    ) -> None:
        """Identical bytes are nothing to parse, which is only
        observable as the parsing not happening."""
        servicer = self._write('shop_servicer.py', source=SHOP)
        application = self._write('main.py', source=APPLICATION)

        known = await analyze(application=application)

        Path(servicer).write_text(SHOP)

        with patch.object(
            implementation_watcher,
            '_parse',
            wraps=implementation_watcher._parse,
        ) as parse:
            await analyze(application=application, known=known)

        parse.assert_not_called()

    async def test_a_file_written_with_other_bytes_is_parsed_again(
        self
    ) -> None:
        """Even with the mtime it was read with put back, which is
        what a save landing in the same clock tick leaves behind."""
        servicer = self._write('shop_servicer.py', source=SHOP)
        application = self._write('main.py', source=APPLICATION)

        modified = os.stat(servicer).st_mtime_ns
        known = await analyze(application=application)

        Path(servicer).write_text(DEPOT)
        os.utime(servicer, ns=(modified, modified))

        found = _state_types_and_files(
            await analyze(application=application, known=known)
        )

        self.assertEqual(found, [('shop.v1.Depot', servicer)])

    async def test_a_servicer_that_stops_being_imported_is_dropped(
        self
    ) -> None:
        """However recently it changed: what the application reaches
        is what it registers."""
        self._write('shop_servicer.py', source=SHOP)
        self._write('depot_servicer.py', source=DEPOT)
        application = self._write(
            'main.py',
            source=APPLICATION.replace(
                'from shop_servicer import ShopServicer',
                'from depot_servicer import DepotServicer\n'
                'from shop_servicer import ShopServicer',
            ),
        )

        known = await analyze(application=application)
        self.assertEqual(len(servicers(known)), 2)

        self._write('main.py', source=APPLICATION)

        found = _state_types_and_files(
            await analyze(application=application, known=known)
        )

        self.assertEqual(
            found,
            [('shop.v1.Shop', str(self.directory / 'shop_servicer.py'))],
        )

    async def test_a_servicer_that_starts_being_imported_is_found(
        self
    ) -> None:
        self._write('shop_servicer.py', source=SHOP)
        application = self._write('main.py', source=APPLICATION)

        known = await analyze(application=application)

        self._write('depot_servicer.py', source=DEPOT)
        self._write(
            'main.py',
            source=APPLICATION.replace(
                'from shop_servicer import ShopServicer',
                'from depot_servicer import DepotServicer\n'
                'from shop_servicer import ShopServicer',
            ),
        )

        found = _state_types_and_files(
            await analyze(application=application, known=known)
        )

        self.assertEqual(
            found, [
                ('shop.v1.Depot', str(self.directory / 'depot_servicer.py')),
                ('shop.v1.Shop', str(self.directory / 'shop_servicer.py')),
            ]
        )

    ###################################################################
    # What it finds no servicer for.

    async def test_a_file_that_will_not_parse(self) -> None:
        """Its servicers go unfound, because which state types they
        service is precisely what went unread."""
        self._write('shop_servicer.py', source='class ShopServicer(')
        application = self._write('main.py', source=APPLICATION)

        found = _state_types_and_files(await analyze(application=application))

        self.assertEqual(found, [])

    async def test_an_application_that_is_not_there(self) -> None:
        found = _state_types_and_files(
            await analyze(application=str(self.directory / 'nowhere.py'))
        )

        self.assertEqual(found, [])

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

        found = _state_types_and_files(await analyze(application=application))

        self.assertEqual(
            found, [
                ('shop.v1.Shop', str(self.directory / 'other_servicer.py')),
                ('shop.v1.Shop', str(self.directory / 'shop_servicer.py')),
            ]
        )

    async def test_a_class_that_services_nothing(self) -> None:
        """A class whose base names no generated module is not one
        this recognizes as a servicer."""
        self._write(
            'shop_servicer.py', source='''
class ShopServicer(SomethingElse):
    pass
'''
        )
        application = self._write('main.py', source=APPLICATION)

        found = _state_types_and_files(await analyze(application=application))

        self.assertEqual(found, [])


if __name__ == '__main__':
    unittest.main()
