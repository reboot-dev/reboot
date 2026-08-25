"""Where a state type is implemented follows what the API declares.

The API files say which state types exist, so a state type appearing
is what sets the dashboard looking for the file that implements it.
"""
import ast
import hashlib
import os
import tempfile
import unittest
from pathlib import Path
from rbt.dashboard.v1.dashboard_pb2 import \
    Implementation as ImplementationState
from rbt.dashboard.v1.dashboard_pb2 import ServicerInfo
from rbt.dashboard.v1.dashboard_rbt import API, Implementation
from reboot.aio.tests import Reboot
from reboot.dashboard.constants import (
    API_ID,
    ENVVAR_RBT_API_DIRECTORY,
    ENVVAR_RBT_APPLICATION,
    ENVVAR_RBT_GENERATED_DIRECTORY,
    IMPLEMENTATION_ID,
)
from reboot.dashboard.implementation_watcher import (
    AnalyzedFile,
    MethodDefinition,
    _analyze,
    _generated_definitions,
    _reconstitute_known,
    _walk,
    extract_and_sort_servicers,
)
from reboot.dashboard.main import application
from reboot.dashboard.pyright import Pyright
from typing import Optional
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

# The shape of a generated module, as far as the analysis needs:
# the state type's class and its servicer bases carrying the state
# type's name as `__state_type_name__`, the `Servicer` aliases a
# servicer's base leads through, and the `WeakReference` defining
# the methods a reference is called with.
GENERATED = '''
from typing import TypeAlias


def StateTypeName(name):
    return name


class {state}BaseServicer:

    __state_type_name__ = StateTypeName('shop.v1.{state}')


class {state}Servicer({state}BaseServicer):
    pass


class {state}SingletonServicer({state}BaseServicer):
    pass


class {state}Singleton:

    Servicer: TypeAlias = {state}SingletonServicer


class {state}:

    __state_type_name__ = StateTypeName('shop.v1.{state}')

    Servicer: TypeAlias = {state}Servicer

    singleton: TypeAlias = {state}Singleton

    class WeakReference:

        class _Schedule:

            async def look(
                __this__,
                __context__,
                request=None,
            ):
                pass

        class _Spawn:

            async def look(
                __this__,
                __context__,
                request=None,
            ):
                pass

        class _Idempotently:

            async def look(
                __this__,
                __context__,
                request=None,
            ):
                pass

        class _Until:

            async def look(
                __this__,
                __context__,
                request=None,
            ):
                pass

        async def look(
            __this__,
            __context__,
            request=None,
        ):
            pass

        def schedule(self, when=None) -> '{state}.WeakReference._Schedule':
            return {state}.WeakReference._Schedule()

        def spawn(self, when=None) -> '{state}.WeakReference._Spawn':
            return {state}.WeakReference._Spawn()

        def idempotently(self, alias=None) -> '{state}.WeakReference._Idempotently':
            return {state}.WeakReference._Idempotently()

        def until(self, alias) -> '{state}.WeakReference._Until':
            return {state}.WeakReference._Until()

    @classmethod
    def ref(cls, state_id) -> '{state}.WeakReference':
        return {state}.WeakReference()

    @classmethod
    async def make(
        __cls__,
        __context__,
        state_id=None,
    ):
        pass

    class _ConstructIdempotently:

        async def make(
            __this__,
            __context__,
            state_id=None,
        ):
            pass

    @classmethod
    def idempotently(cls, alias=None) -> '{state}._ConstructIdempotently':
        return {state}._ConstructIdempotently()

    class _Forall:

        async def look(
            __this__,
            __context__,
            request=None,
        ):
            pass

    @classmethod
    def forall(cls, ids) -> '{state}._Forall':
        return {state}._Forall()
'''


def _write_generated(directory: Path) -> None:
    """Writes what `rbt generate` would: the generated modules the
    fixtures import their state types from."""
    for module, state in (('shop', 'Shop'), ('depot', 'Depot')):
        path = directory / 'shop' / 'v1' / f'{module}_rbt.py'
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(GENERATED.format(state=state))


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
        self._generated = tempfile.TemporaryDirectory()
        self.api = Path(self._api.name)
        self.source = Path(self._source.name).resolve()
        self.generated = Path(self._generated.name)

        (self.source / 'shop_servicer.py').write_text(
            SERVICER.format(state='Shop', module='shop')
        )
        (self.source / 'main.py').write_text(APPLICATION)

        self._environment = patch.dict(
            os.environ,
            {
                ENVVAR_RBT_API_DIRECTORY: str(self.api),
                ENVVAR_RBT_APPLICATION: str(self.source / 'main.py'),
                ENVVAR_RBT_GENERATED_DIRECTORY: str(self.generated),
            },
        )
        self._environment.start()

        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(application(), local_envoy=True)

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()
        self._environment.stop()
        self._generated.cleanup()
        self._source.cleanup()
        self._api.cleanup()

    def _generate(self) -> None:
        """Writes the generated modules, the way running
        `rbt generate` would."""
        _write_generated(self.generated)

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

    async def _implementation(self, *, satisfied):
        """Returns the recorded implementation once it satisfies,
        reading again whenever it changes."""
        context = self.rbt.create_external_context(name=self.id())

        async for response in Implementation.ref(IMPLEMENTATION_ID
                                                ).reactively().Get(context):
            if satisfied(response):
                return response

        raise AssertionError('never satisfied')

    async def test_records_the_servicer_it_finds(self) -> None:
        self._generate()

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
        self._generate()

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
        self._generate()
        self._declare('depot', state='Depot')

        found = await self._servicers(
            satisfied=lambda found: 'shop.v1.Shop' in found
        )

        self.assertNotIn('shop.v1.Depot', found)

    async def test_a_state_type_two_classes_service(self) -> None:
        """Both files are recorded against it, rather than one being
        chosen between them."""
        self._generate()
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
        self,
    ) -> None:
        """The application is watched, so a servicer written while the
        dashboard runs is found without a restart."""
        self._generate()
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
        self,
    ) -> None:
        """Read from different places by different workflows, and so
        recorded without either waiting on the other."""
        self._generate()
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

    async def test_generate_running_while_the_dashboard_runs(self) -> None:
        """`rbt generate` writing its code is what ties the waiting
        servicers to their state types, and `needs_generate` is what
        tells the dashboard to suggest running it."""
        response = await self._implementation(
            satisfied=lambda response: response.needs_generate
        )
        self.assertEqual(list(response.servicers), [])

        self._generate()

        response = await self._implementation(
            satisfied=lambda response: not response.needs_generate and
            len(response.servicers) > 0
        )
        self.assertEqual(
            [servicer.state_type for servicer in response.servicers],
            ['shop.v1.Shop'],
        )


class GoldenDefinitionsTest(unittest.TestCase):
    """What `_generated_definitions` reads off the generator's real output."""

    def test_the_golden_module_defines_exactly_its_methods(self) -> None:
        """The `MethodDefinition`s of the golden `_rbt` module are
        exactly the methods `greeter.proto` declares, reached each
        way the analysis supports, so a template change that hides
        method stubs (under reporting) or lets the machinery around
        them in (over reporting) breaks this test rather than only
        the dashboard."""
        golden = Path(__file__).parent.parent / 'greeter_rbt.golden.py'

        all_definitions = _generated_definitions(ast.parse(golden.read_text()))

        definitions = [
            definition for definition in all_definitions.values()
            if isinstance(definition, MethodDefinition)
        ]

        methods = {
            'ConstructAndStoreRecursiveMessage',
            'DangerousFields',
            'FailWithAborted',
            'FailWithException',
            'GetWholeState',
            'Greet',
            'ReadRecursiveMessage',
            'SetAdjective',
            'StoreRecursiveMessage',
            'TestLongRunningFetch',
            'TestLongRunningWriter',
            'TransactionSetAdjective',
            'TryToConstructContext',
            'TryToConstructExternalContext',
            'Workflow',
        }

        names_by_how: dict[int, set[str]] = {}
        for definition in definitions:
            names_by_how.setdefault(
                definition.how,
                set(),
            ).add(definition.name)

        Call = ServicerInfo.Method.Call
        self.assertEqual(
            names_by_how,
            {
                Call.How.CALL:
                    methods,
                Call.How.SCHEDULE:
                    methods,
                Call.How.SPAWN:
                    methods,
                # A workflow is scheduled, never called across all
                # of a state type's states, so `forall` leaves it
                # out.
                Call.How.FORALL:
                    methods - {'Workflow'},
                # Awaiting until a condition holds only makes sense
                # for what can be read, so `until` carries only the
                # reader methods.
                Call.How.UNTIL:
                    {
                        'FailWithAborted',
                        'FailWithException',
                        'GetWholeState',
                        'Greet',
                        'ReadRecursiveMessage',
                        'TestLongRunningFetch',
                        'TryToConstructContext',
                        'TryToConstructExternalContext',
                    },
                Call.How.CONSTRUCT: {'Create'},
            },
        )
        self.assertEqual(
            {definition.state_type for definition in definitions},
            {'tests.reboot.Greeter'},
        )


class ServicerFilesTest(unittest.IsolatedAsyncioTestCase):
    """Which file implements which state type."""

    async def asyncSetUp(self) -> None:
        self._directory = tempfile.TemporaryDirectory()
        # Resolved because the maps under test key files by resolved
        # path, and a temporary directory may sit behind a symlink.
        self.directory = Path(self._directory.name).resolve()
        self._generated_directory = tempfile.TemporaryDirectory()
        self.generated = Path(self._generated_directory.name).resolve()
        _write_generated(self.generated)

        # An installed package's state type: its `_rbt` module is
        # resolvable but not under the generated directory.
        (self.directory /
         'sorted_rbt.py').write_text(GENERATED.format(state='Sorted'))

        # An installed package outside every root the walk walks:
        # its `_rbt` module is resolvable only through pyright.
        self._installed_directory = tempfile.TemporaryDirectory()
        self.installed = Path(self._installed_directory.name).resolve()
        installed = self.installed / 'shop' / 'v1' / 'ext_rbt.py'
        installed.parent.mkdir(parents=True)
        installed.write_text(GENERATED.format(state='Ext'))

        # The generator's actual output, checked in as a golden and
        # rewritten with the templates by `make goldens`, so that
        # resolving is tested against the real templates and not
        # only this file's imitation of them. Written before pyright
        # starts, the way every generated file is in `watch`, where
        # a generated change restarts pyright.
        golden = Path(__file__).parent.parent / 'greeter_rbt.golden.py'
        target = self.generated / 'tests' / 'reboot' / 'greeter_rbt.py'
        target.parent.mkdir(parents=True)
        target.write_text(golden.read_text())

        self.pyright = Pyright()
        await self.pyright.start(
            root=self.directory,
            paths=[self.directory, self.generated, self.installed],
        )

    async def asyncTearDown(self) -> None:
        await self.pyright.stop()
        self._installed_directory.cleanup()
        self._generated_directory.cleanup()
        self._directory.cleanup()

    def _write(self, name: str, *, source: str) -> Path:
        path = self.directory / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(source)
        return path

    async def _analyze(
        self,
        application: Path,
        known: Optional[dict[Path, AnalyzedFile]] = None,
        roots: Optional[list[Path]] = None,
    ) -> dict[Path, AnalyzedFile]:
        """Returns the analysis of an application, asked of the one
        pyright the test runs."""
        if roots is None:
            roots = [application.parent]
        roots = [*roots, self.generated]

        unchanged, parsed = await _walk(
            application=application,
            roots=roots,
            known=known or {},
        )

        analyzed = await _analyze(
            parsed=parsed,
            pyright=self.pyright,
            roots=roots,
        )

        # Which files this iteration parsed, for asserting that a
        # file was or was not reanalyzed.
        self.parsed = parsed

        return {**unchanged, **analyzed}

    async def test_a_method_records_the_calls_it_makes(self) -> None:
        """A call is recorded when its definition lands on a method
        stub of a state type, however the reference is held; a call
        defined by a function or method of the developer's own is
        followed, and what that makes is recorded flat; a call with
        no definition pyright can say is recorded as ambiguous; and
        a call into the generator's machinery, such as the `ref`
        inside a chain, or into the standard library, is neither."""
        servicer = self._write(
            'shop_servicer.py',
            source=(
                'import asyncio\n'
                'from shop.v1.depot_rbt import Depot\n'
                'from shop.v1.shop_rbt import Shop\n'
                '\n'
                '\n'
                'def helper(context):\n'
                "    return Depot.ref('h').look(context)\n"
                '\n'
                '\n'
                'class ShopServicer(Shop.Servicer):\n'
                '\n'
                '    async def look(self, context, request):\n'
                "        depot = Depot.ref('d')\n"
                '        await depot.look(context)\n'
                "        await Shop.ref('s').look(context)\n"
                "        await Depot.make(context, 'd')\n"
                '        await depot.schedule().look(context)\n'
                '        await depot.spawn().look(context)\n'
                "        await depot.idempotently('i').look(context)\n"
                "        await Depot.idempotently('i').make(context)\n"
                "        await Depot.forall(['a']).look(context)\n"
                "        await depot.until('u').look(context)\n"
                '        helper(context)\n'
                '        self.notify(context)\n'
                '        undefined(context)\n'
                '        print(len(request.ids))\n'
                '        await asyncio.sleep(0)\n'
                '\n'
                '    async def notify(self, context):\n'
                "        await Shop.ref('n').look(context)\n"
            ),
        )
        application = self._write('main.py', source=APPLICATION)

        found = await self._analyze(application)

        [found_servicer] = found[servicer].servicers
        method, notify = found_servicer.methods
        Call = ServicerInfo.Method.Call
        self.assertEqual(
            [
                (call.state_type, call.method, call.how)
                for call in method.calls
            ],
            [
                # First the two followed calls: `ast.walk` is
                # breadth-first, and `helper(context)` is a call
                # one level shallower than an awaited one.
                # Through `helper`.
                ('shop.v1.Depot', 'look', Call.How.CALL),
                # Through `self.notify`.
                ('shop.v1.Shop', 'look', Call.How.CALL),
                ('shop.v1.Depot', 'look', Call.How.CALL),
                ('shop.v1.Shop', 'look', Call.How.CALL),
                ('shop.v1.Depot', 'make', Call.How.CONSTRUCT),
                ('shop.v1.Depot', 'look', Call.How.SCHEDULE),
                ('shop.v1.Depot', 'look', Call.How.SPAWN),
                ('shop.v1.Depot', 'look', Call.How.CALL),
                ('shop.v1.Depot', 'make', Call.How.CONSTRUCT),
                ('shop.v1.Depot', 'look', Call.How.FORALL),
                ('shop.v1.Depot', 'look', Call.How.UNTIL),
            ],
        )
        self.assertEqual(list(method.ambiguous), ['undefined'])
        self.assertEqual(
            [
                (call.state_type, call.method, call.how)
                for call in notify.calls
            ],
            [('shop.v1.Shop', 'look', Call.How.CALL)],
        )

    async def test_a_helper_in_another_file_is_followed(self) -> None:
        """A call defined in another of the developer's files is
        followed there, and the file, an import, is a dependency the
        way any import is."""
        helpers = self._write(
            'helpers.py',
            source=(
                'from shop.v1.depot_rbt import Depot\n'
                '\n'
                '\n'
                'async def restock(context, id):\n'
                "    await Depot.ref(id).look(context)\n"
            ),
        )
        servicer = self._write(
            'shop_servicer.py',
            source=(
                'from helpers import restock\n'
                'from shop.v1.shop_rbt import Shop\n'
                '\n'
                '\n'
                'class ShopServicer(Shop.Servicer):\n'
                '\n'
                '    async def look(self, context, request):\n'
                "        await restock(context, 'd')\n"
            ),
        )
        application = self._write('main.py', source=APPLICATION)

        found = await self._analyze(application)

        [found_servicer] = found[servicer].servicers
        [method] = found_servicer.methods
        Call = ServicerInfo.Method.Call
        self.assertEqual(
            [
                (call.state_type, call.method, call.how)
                for call in method.calls
            ],
            [('shop.v1.Depot', 'look', Call.How.CALL)],
        )
        self.assertEqual(list(method.ambiguous), [])
        self.assertIn('helpers', found[servicer].dependencies)
        self.assertEqual(found[servicer].external, ())
        del helpers

    async def test_nested_functions_and_lambdas_are_walked(self) -> None:
        """A function or lambda written inside a method is part of
        the body walked, however it is then used, e.g. gathered,
        and calling the nested function does not walk it again."""
        servicer = self._write(
            'shop_servicer.py',
            source=(
                'import asyncio\n'
                'from shop.v1.depot_rbt import Depot\n'
                'from shop.v1.shop_rbt import Shop\n'
                '\n'
                '\n'
                'class ShopServicer(Shop.Servicer):\n'
                '\n'
                '    async def look(self, context, request):\n'
                '        async def inner(id):\n'
                '            await Depot.ref(id).look(context)\n'
                '\n'
                "        later = lambda: Shop.ref('l').look(context)\n"
                '        await asyncio.gather(inner(1), inner(2), later())\n'
            ),
        )
        application = self._write('main.py', source=APPLICATION)

        found = await self._analyze(application)

        [found_servicer] = found[servicer].servicers
        [method] = found_servicer.methods
        Call = ServicerInfo.Method.Call
        self.assertEqual(
            [
                (call.state_type, call.method, call.how)
                for call in method.calls
            ],
            [
                # The lambda's call first: `ast.walk` is
                # breadth-first and the lambda's body is shallower
                # than the awaited call inside `inner`.
                ('shop.v1.Shop', 'look', Call.How.CALL),
                ('shop.v1.Depot', 'look', Call.How.CALL),
            ],
        )
        self.assertEqual(list(method.ambiguous), [])

    async def test_helpers_calling_each_other_are_followed_once(
        self,
    ) -> None:
        """Functions calling each other, a method calling itself
        among them, are each followed once, and every Reboot call
        on the way is recorded once."""
        servicer = self._write(
            'shop_servicer.py',
            source=(
                'from shop.v1.depot_rbt import Depot\n'
                'from shop.v1.shop_rbt import Shop\n'
                '\n'
                '\n'
                'async def ping(context):\n'
                "    await Depot.ref('p').look(context)\n"
                '    await pong(context)\n'
                '\n'
                '\n'
                'async def pong(context):\n'
                "    await Shop.ref('p').look(context)\n"
                '    await ping(context)\n'
                '\n'
                '\n'
                'class ShopServicer(Shop.Servicer):\n'
                '\n'
                '    async def look(self, context, request):\n'
                '        await ping(context)\n'
                '        await self.look(context, request)\n'
            ),
        )
        application = self._write('main.py', source=APPLICATION)

        found = await self._analyze(application)

        [found_servicer] = found[servicer].servicers
        [method] = found_servicer.methods
        Call = ServicerInfo.Method.Call
        self.assertEqual(
            [
                (call.state_type, call.method, call.how)
                for call in method.calls
            ],
            [
                ('shop.v1.Depot', 'look', Call.How.CALL),
                ('shop.v1.Shop', 'look', Call.How.CALL),
            ],
        )
        self.assertEqual(list(method.ambiguous), [])

    async def test_an_installed_helper_is_followed_and_recorded(
        self,
    ) -> None:
        """A call defined in an installed package, outside every
        root, is followed there, since a package may make Reboot
        calls of its own with a context it is handed, and the file
        is recorded in `external` the way an installed `_rbt` module
        is."""
        installed = self.installed / 'shop' / 'v1' / 'helpers.py'
        installed.write_text(
            'from shop.v1.ext_rbt import Ext\n'
            '\n'
            '\n'
            'async def restock(context, id):\n'
            "    await Ext.ref(id).look(context)\n"
        )
        servicer = self._write(
            'shop_servicer.py',
            source=(
                'from shop.v1.helpers import restock\n'
                'from shop.v1.shop_rbt import Shop\n'
                '\n'
                '\n'
                'class ShopServicer(Shop.Servicer):\n'
                '\n'
                '    async def look(self, context, request):\n'
                "        await restock(context, 'd')\n"
            ),
        )
        application = self._write('main.py', source=APPLICATION)

        found = await self._analyze(application)

        [found_servicer] = found[servicer].servicers
        [method] = found_servicer.methods
        Call = ServicerInfo.Method.Call
        self.assertEqual(
            [
                (call.state_type, call.method, call.how)
                for call in method.calls
            ],
            [('shop.v1.Ext', 'look', Call.How.CALL)],
        )
        self.assertEqual(list(method.ambiguous), [])
        self.assertEqual(
            {
                dependency.filename: dependency.digest
                for dependency in found[servicer].external
            },
            {
                str(installed):
                    hashlib.sha256(installed.read_bytes()).digest(),
                str(self.installed / 'shop' / 'v1' / 'ext_rbt.py'):
                    hashlib.sha256(
                        (self.installed / 'shop' / 'v1' /
                         'ext_rbt.py').read_bytes()
                    ).digest(),
            },
        )

    async def test_a_base_from_a_function_return_type_is_resolved(
        self,
    ) -> None:
        """Pyright resolves the type of a base however the base got
        its value, so a servicer base returned by a function is
        followed through the function's return type."""
        servicer = self._write(
            'dynamic_servicer.py',
            source=(
                'from shop.v1.shop_rbt import ShopServicer\n'
                '\n'
                '\n'
                'def make_base() -> type[ShopServicer]:\n'
                '    return ShopServicer\n'
                '\n'
                '\n'
                'Base = make_base()\n'
                '\n'
                '\n'
                'class DynamicServicer(Base):\n'
                '\n'
                '    async def look(self, context, request):\n'
                '        pass\n'
            ),
        )
        application = self._write(
            'main.py',
            source='import dynamic_servicer\n',
        )

        found = await self._analyze(application)

        self.assertEqual(
            [info.state_type for info in found[servicer].servicers],
            ['shop.v1.Shop'],
        )

    async def test_an_incorrectly_extended_base_is_no_servicer(
        self,
    ) -> None:
        """A servicer extends `Shop.Servicer` or `ShopServicer`;
        a class extending the servicer base or the state type
        directly is spelled incorrectly and services nothing."""
        servicer = self._write(
            'wrong_servicer.py',
            source=(
                'from shop.v1.shop_rbt import Shop, ShopBaseServicer\n'
                '\n'
                '\n'
                'class FirstServicer(ShopBaseServicer):\n'
                '    pass\n'
                '\n'
                '\n'
                'class SecondServicer(Shop):\n'
                '    pass\n'
            ),
        )
        application = self._write(
            'main.py',
            source='import wrong_servicer\n',
        )

        found = await self._analyze(application)

        self.assertEqual(found[servicer].servicers, ())

    async def test_an_installed_module_is_recorded_as_a_dependency(
        self,
    ) -> None:
        """A `_rbt` module outside every root, the way an installed
        package ships one, is recorded in `external`, with its file
        and digest, against the file whose analysis read it."""
        servicer = self._write(
            'ext_servicer.py',
            source=SERVICER.format(state='Ext', module='ext'),
        )
        application = self._write(
            'main.py',
            source='import ext_servicer\n',
        )

        found = await self._analyze(application)

        installed = self.installed / 'shop' / 'v1' / 'ext_rbt.py'
        [dependency] = [
            dependency for dependency in found[servicer].external
            if dependency.filename == str(installed)
        ]
        self.assertEqual(
            dependency.digest,
            hashlib.sha256(installed.read_bytes()).digest(),
        )
        self.assertEqual(
            [info.state_type for info in found[servicer].servicers],
            ['shop.v1.Ext'],
        )

    async def test_a_changed_installed_module_reanalyzes_its_readers(
        self,
    ) -> None:
        """Rewriting an installed `_rbt` module, the way upgrading
        its package does, reanalyzes exactly the files whose
        analyses read it."""
        servicer = self._write(
            'ext_servicer.py',
            source=SERVICER.format(state='Ext', module='ext'),
        )
        bystander = self._write('shop_servicer.py', source=SHOP)
        application = self._write(
            'main.py',
            source='import ext_servicer\nimport shop_servicer\n',
        )

        found = await self._analyze(application)

        installed = self.installed / 'shop' / 'v1' / 'ext_rbt.py'
        installed.write_text(
            GENERATED.format(state='Ext').replace(
                "'shop.v1.Ext'",
                "'shop.v1.Renamed'",
            )
        )

        found = await self._analyze(application, known=found)

        self.assertIn(servicer, self.parsed)
        self.assertNotIn(bystander, self.parsed)
        self.assertEqual(
            [info.state_type for info in found[servicer].servicers],
            ['shop.v1.Renamed'],
        )

    async def test_a_package_wins_over_a_module_of_the_same_name(
        self,
    ) -> None:
        """Python's finder checks directories before files, so
        `helper/` beats `helper.py` sitting beside it in the same
        root, and the dependency records the package's
        `__init__.py`."""
        self._write('helper.py', source='VALUE = 1\n')
        package = self._write('helper/__init__.py', source='VALUE = 2\n')
        servicer = self._write(
            'shop_servicer.py',
            source=SHOP + '\nimport helper\n',
        )
        application = self._write('main.py', source=APPLICATION)

        found = await self._analyze(application)

        self.assertEqual(
            found[servicer].dependencies['helper'].filename,
            str(package),
        )

    async def test_a_file_under_the_working_directory_stores_relative(
        self,
    ) -> None:
        """Paths under the working directory are kept relative to
        it, so that they stay true when the project directory is
        moved or renamed."""
        self._write('helper.py', source='VALUE = 1\n')
        self._write(
            'shop_servicer.py',
            source=SHOP + '\nimport helper\n',
        )
        self._write('main.py', source=APPLICATION)

        original = Path.cwd()
        os.chdir(self.directory)
        try:
            found = await self._analyze(Path('main.py'))
        finally:
            os.chdir(original)

        self.assertEqual(
            found[Path('shop_servicer.py')].dependencies['helper'].filename,
            'helper.py',
        )

    async def test_reconstituting_keeps_stored_spellings(self) -> None:
        """What a previous run recorded comes back keyed by the
        stored spelling, with the servicers recorded for each file
        joined back on."""
        state = ImplementationState()
        file = state.files['backend/x.py']
        file.digest = b'digest'
        file.dependencies['helper'].filename = 'helper.py'
        servicer = state.servicers.add()
        servicer.state_type = 'shop.v1.Shop'
        servicer.file = 'backend/x.py'

        known = _reconstitute_known(state)

        analyzed = known[Path('backend/x.py')]
        self.assertEqual(analyzed.filename, Path('backend/x.py'))
        self.assertEqual(analyzed.digest, b'digest')
        self.assertEqual(
            analyzed.dependencies['helper'].filename,
            'helper.py',
        )
        self.assertEqual(
            [servicer.state_type for servicer in analyzed.servicers],
            ['shop.v1.Shop'],
        )

    def _state_types_and_files(
        self,
        files: dict[Path, AnalyzedFile],
    ) -> list[tuple[str, str]]:
        """Returns every servicer as the state type it services and
        the file it is written in."""
        return [
            (servicer.state_type, servicer.file)
            for servicer in extract_and_sort_servicers(files)
        ]

    async def test_finds_the_file_a_state_type_is_implemented_in(self) -> None:
        self._write('shop_servicer.py', source=SHOP)
        application = self._write('main.py', source=APPLICATION)

        found = self._state_types_and_files(await self._analyze(application))

        self.assertEqual(
            found,
            [('shop.v1.Shop', str(self.directory / 'shop_servicer.py'))],
        )

    async def test_a_singleton_says_what_it_services_the_same_way(
        self,
    ) -> None:
        self._write('depot_servicer.py', source=DEPOT)
        application = self._write(
            'main.py',
            source=APPLICATION.replace('shop_servicer',
                                       'depot_servicer').replace(
                                           'ShopServicer', 'DepotServicer'
                                       ),
        )

        found = self._state_types_and_files(await self._analyze(application))

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

        found = self._state_types_and_files(await self._analyze(application))

        self.assertEqual(
            found, [
                ('shop.v1.Depot', str(self.directory / 'servicers.py')),
                ('shop.v1.Shop', str(self.directory / 'servicers.py')),
            ]
        )

    ###################################################################
    # Reached however the application reaches it.

    async def test_an_application_that_does_not_spell_out_its_servicers(
        self,
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

        found = self._state_types_and_files(await self._analyze(application))

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

        found = self._state_types_and_files(await self._analyze(application))

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

        found = self._state_types_and_files(await self._analyze(application))

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

        found = self._state_types_and_files(await self._analyze(application))

        self.assertEqual(
            found,
            [('shop.v1.Shop', str(self.directory / 'servicers' / 'shop.py'))],
        )

    async def test_a_servicer_reached_through_a_relative_import(self) -> None:
        self._write('package/__init__.py', source='')
        self._write('package/shop_servicer.py', source=SHOP)
        self._write(
            'package/servicers.py',
            source='from .shop_servicer import ShopServicer\n',
        )
        application = self._write(
            'main.py',
            source=APPLICATION.replace(
                'from shop_servicer import ShopServicer',
                'from package.servicers import ShopServicer',
            ),
        )

        found = self._state_types_and_files(await self._analyze(application))

        self.assertEqual(
            found,
            [
                (
                    'shop.v1.Shop',
                    str(self.directory / 'package' / 'shop_servicer.py'),
                )
            ],
        )

    ###################################################################
    # Where the walk stops.

    async def test_an_import_of_somebody_elses_package_leads_nowhere(
        self,
    ) -> None:
        """A module no root holds is not the developer's code. Reading
        it is not the dashboard's business, and no state type of theirs
        is waiting for it."""
        elsewhere = tempfile.TemporaryDirectory()
        try:
            elsewhere_directory = Path(elsewhere.name).resolve()
            (elsewhere_directory / 'library.py').write_text(SHOP)

            application = self._write(
                'main.py', source='''
from library import ShopServicer
from reboot.aio.applications import Application


async def main():
    await Application(servicers=[ShopServicer]).run()
'''
            )

            found = self._state_types_and_files(
                await self._analyze(application)
            )

            self.assertEqual(found, [])

            # Named as a root, the very same import leads there.
            found = self._state_types_and_files(
                await self._analyze(
                    application,
                    roots=[self.directory, elsewhere_directory],
                )
            )
            self.assertEqual(
                found,
                [('shop.v1.Shop', str(elsewhere_directory / 'library.py'))],
            )
        finally:
            elsewhere.cleanup()

    ###################################################################
    # Followed to the state type however it is reached.

    async def test_a_state_type_reached_through_its_module(self) -> None:
        """However the state type is spelled, what it refers to is
        the answer -- here through a module alias."""
        self._write(
            'shop_servicer.py', source='''
import shop.v1.shop_rbt as rbt


class ShopServicer(rbt.Shop.Servicer):

    async def look(self, context, request):
        pass
'''
        )
        application = self._write('main.py', source=APPLICATION)

        found = self._state_types_and_files(await self._analyze(application))

        self.assertEqual(
            found,
            [(
                'shop.v1.Shop',
                str(self.directory / 'shop_servicer.py'),
            )],
        )

    async def test_an_aliased_state_type_still_resolves(self) -> None:
        """`import ... as` respells the name; what it refers to does
        not move."""
        self._write(
            'shop_servicer.py',
            source=SHOP.replace(
                'from shop.v1.shop_rbt import Shop',
                'from shop.v1.shop_rbt import Shop as S',
            ).replace('(Shop.Servicer)', '(S.Servicer)'),
        )
        application = self._write('main.py', source=APPLICATION)

        found = self._state_types_and_files(await self._analyze(application))

        self.assertEqual(
            found,
            [(
                'shop.v1.Shop',
                str(self.directory / 'shop_servicer.py'),
            )],
        )

    async def test_a_servicer_through_an_assigned_alias(self) -> None:
        """`MyServicer = Shop.Servicer` respells the base; what it
        refers to does not move."""
        self._write(
            'shop_servicer.py',
            source=SHOP.replace(
                'class ShopServicer(Shop.Servicer):',
                'MyServicer = Shop.Servicer\n'
                '\n'
                '\n'
                'class ShopServicer(MyServicer):',
            ),
        )
        application = self._write('main.py', source=APPLICATION)

        found = self._state_types_and_files(await self._analyze(application))

        self.assertEqual(
            found,
            [(
                'shop.v1.Shop',
                str(self.directory / 'shop_servicer.py'),
            )],
        )

    async def test_a_servicer_through_an_alias_in_another_file(
        self,
    ) -> None:
        self._write(
            'aliases.py',
            source='from shop.v1.shop_rbt import Shop\n'
            '\n'
            'MyServicer = Shop.Servicer\n',
        )
        self._write(
            'shop_servicer.py',
            source=SHOP.replace(
                'from shop.v1.shop_rbt import Shop',
                'from aliases import MyServicer',
            ).replace(
                'class ShopServicer(Shop.Servicer):',
                'class ShopServicer(MyServicer):',
            ),
        )
        application = self._write('main.py', source=APPLICATION)

        found = self._state_types_and_files(await self._analyze(application))

        self.assertEqual(
            found,
            [(
                'shop.v1.Shop',
                str(self.directory / 'shop_servicer.py'),
            )],
        )

    async def test_a_file_in_an_older_encoding(self) -> None:
        """A coding declaration is honored the way Python honors it,
        so a file that is not UTF-8 still gets its servicers found."""
        (self.directory / 'shop_servicer.py').write_bytes(
            ('# -*- coding: latin-1 -*-\n# caf\u00e9\n' +
             SHOP).encode('latin-1')
        )
        application = self._write('main.py', source=APPLICATION)

        found = self._state_types_and_files(await self._analyze(application))

        self.assertEqual(
            found,
            [(
                'shop.v1.Shop',
                str(self.directory / 'shop_servicer.py'),
            )],
        )

    async def test_a_servicer_for_an_installed_state_type(self) -> None:
        """A state type's `_rbt` module may be inside an installed
        package rather than under the application's generated
        directory, the way the standard library ships its
        collections."""
        self._write(
            'shop_servicer.py',
            source=SHOP.replace(
                'from shop.v1.shop_rbt import Shop',
                'from sorted_rbt import Sorted',
            ).replace('(Shop.Servicer)', '(Sorted.Servicer)'),
        )
        application = self._write('main.py', source=APPLICATION)

        found = self._state_types_and_files(await self._analyze(application))

        self.assertEqual(
            found,
            [(
                'shop.v1.Sorted',
                str(self.directory / 'shop_servicer.py'),
            )],
        )

    async def test_a_state_type_from_the_generators_real_output(
        self,
    ) -> None:
        """Resolved against the golden `_rbt` module the generator
        actually wrote, so a template change that breaks resolving
        breaks this test rather than only the dashboard."""
        servicer = self._write(
            'greeter_servicer.py', source='''
from tests.reboot.greeter_rbt import Greeter


class GreeterServicer(Greeter.Servicer):

    async def create(self, context, request):
        pass
'''
        )
        application = self._write(
            'main.py',
            source=APPLICATION.replace(
                'shop_servicer',
                'greeter_servicer',
            ).replace('ShopServicer', 'GreeterServicer'),
        )

        found = self._state_types_and_files(await self._analyze(application))

        self.assertEqual(
            found,
            [('tests.reboot.Greeter', str(servicer))],
        )

    async def test_a_call_through_the_generators_real_output(
        self,
    ) -> None:
        """Calls resolved against the golden `_rbt` module the
        generator actually wrote, however the reference is held:
        taken with `ref` inline or into a variable, or the
        servicer's own through `self.ref()`. A template change to
        the `WeakReference` spellings breaks this test rather than
        only the dashboard."""
        servicer = self._write(
            'greeter_servicer.py', source='''
from tests.reboot.greeter_rbt import Greeter


class GreeterServicer(Greeter.Servicer):

    async def create(self, context, request):
        greeter = Greeter.ref('g')
        me = self.ref()
        await greeter.Greet(context)
        await Greeter.ref('g').SetAdjective(context)
        await me.SetAdjective(context)
        await self.ref().Greet(context)
        await Greeter.Create(context)
        await greeter.schedule().SetAdjective(context)
        await me.schedule().Greet(context)
        await me.spawn().SetAdjective(context)
        await me.idempotently('i').Greet(context)
        await Greeter.idempotently('i').Create(context)
        await me.per_workflow().Greet(context)
        await Greeter.per_workflow().Create(context)
        await Greeter.forall(['g']).SetAdjective(context)
        await me.until('u').Greet(context)
'''
        )
        application = self._write(
            'main.py',
            source=APPLICATION.replace(
                'shop_servicer',
                'greeter_servicer',
            ).replace('ShopServicer', 'GreeterServicer'),
        )

        found = await self._analyze(application)

        [found_servicer] = found[servicer].servicers
        [method] = found_servicer.methods
        Call = ServicerInfo.Method.Call
        self.assertEqual(
            [
                (call.state_type, call.method, call.how)
                for call in method.calls
            ],
            [
                ('tests.reboot.Greeter', 'Greet', Call.How.CALL),
                ('tests.reboot.Greeter', 'SetAdjective', Call.How.CALL),
                ('tests.reboot.Greeter', 'SetAdjective', Call.How.CALL),
                ('tests.reboot.Greeter', 'Greet', Call.How.CALL),
                ('tests.reboot.Greeter', 'Create', Call.How.CONSTRUCT),
                ('tests.reboot.Greeter', 'SetAdjective', Call.How.SCHEDULE),
                ('tests.reboot.Greeter', 'Greet', Call.How.SCHEDULE),
                ('tests.reboot.Greeter', 'SetAdjective', Call.How.SPAWN),
                ('tests.reboot.Greeter', 'Greet', Call.How.CALL),
                ('tests.reboot.Greeter', 'Create', Call.How.CONSTRUCT),
                ('tests.reboot.Greeter', 'Greet', Call.How.CALL),
                ('tests.reboot.Greeter', 'Create', Call.How.CONSTRUCT),
                ('tests.reboot.Greeter', 'SetAdjective', Call.How.FORALL),
                ('tests.reboot.Greeter', 'Greet', Call.How.UNTIL),
            ],
        )
        self.assertEqual(list(method.ambiguous), [])

    async def test_a_state_type_that_is_not_generated_yet(self) -> None:
        """A name pyright cannot resolve services nothing yet: its
        generated module is exactly what has not been written."""
        self._write(
            'shop_servicer.py',
            source=SHOP.replace(
                'from shop.v1.shop_rbt import Shop',
                'from warehouse.v1.warehouse_rbt import Shop',
            ),
        )
        application = self._write('main.py', source=APPLICATION)

        found = self._state_types_and_files(await self._analyze(application))

        self.assertEqual(found, [])

    async def test_a_base_defined_outside_generated_code(self) -> None:
        """Resolving is not enough: the state type has to be defined
        in code `rbt generate` wrote."""
        self._write(
            'shop_servicer.py', source='''
class Local:

    class Servicer:
        pass


class ShopServicer(Local.Servicer):
    pass
'''
        )
        application = self._write('main.py', source=APPLICATION)

        found = self._state_types_and_files(await self._analyze(application))

        self.assertEqual(found, [])

    ###################################################################
    # The methods each servicer defines.

    async def test_records_the_methods_a_servicer_defines(self) -> None:
        self._write('shop_servicer.py', source=SHOP)
        application = self._write('main.py', source=APPLICATION)

        found = extract_and_sort_servicers(await self._analyze(application))

        self.assertEqual(
            [method.name for method in found[0].methods], ['look']
        )

    async def test_where_the_servicer_is_written(self) -> None:
        """The line and column of the class, for a reader to be taken
        to it."""
        servicer_file = self._write('shop_servicer.py', source=SHOP)
        application = self._write('main.py', source=APPLICATION)

        found = extract_and_sort_servicers(await self._analyze(application))

        lines = servicer_file.read_text().splitlines()
        line = lines.index('class ShopServicer(Shop.Servicer):') + 1
        self.assertEqual((found[0].line, found[0].character), (line, 0))

    async def test_a_method_reformatted_digests_the_same(self) -> None:
        """The digest is over what the method says, so laying it out
        differently or writing a comment in it is not a change."""
        self._write('shop_servicer.py', source=SHOP)
        application = self._write('main.py', source=APPLICATION)

        before = extract_and_sort_servicers(await self._analyze(application))

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

        after = extract_and_sort_servicers(await self._analyze(application))

        self.assertEqual(
            [method.digest for method in after[0].methods],
            [method.digest for method in before[0].methods],
        )

    async def test_a_method_whose_body_changes_digests_differently(
        self,
    ) -> None:
        self._write('shop_servicer.py', source=SHOP)
        application = self._write('main.py', source=APPLICATION)

        before = extract_and_sort_servicers(await self._analyze(application))

        self._write(
            'shop_servicer.py',
            source=SHOP.replace('        pass', '        return None'),
        )

        after = extract_and_sort_servicers(await self._analyze(application))

        self.assertNotEqual(
            after[0].methods[0].digest,
            before[0].methods[0].digest,
        )

    ###################################################################
    # What changes between iterations.

    async def test_a_file_written_with_other_bytes_is_parsed_again(
        self,
    ) -> None:
        """Even with the mtime it was read with put back, which is
        what a save landing in the same clock tick leaves behind."""
        servicer = self._write('shop_servicer.py', source=SHOP)
        application = self._write('main.py', source=APPLICATION)

        modified = os.stat(servicer).st_mtime_ns
        known = await self._analyze(application)

        servicer.write_text(DEPOT)
        os.utime(servicer, ns=(modified, modified))

        found = self._state_types_and_files(
            await self._analyze(application, known=known)
        )

        self.assertEqual(found, [('shop.v1.Depot', str(servicer))])

    async def test_a_servicer_that_stops_being_imported_is_dropped(
        self,
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

        known = await self._analyze(application)
        self.assertEqual(len(extract_and_sort_servicers(known)), 2)

        self._write('main.py', source=APPLICATION)

        found = self._state_types_and_files(
            await self._analyze(application, known=known)
        )

        self.assertEqual(
            found,
            [('shop.v1.Shop', str(self.directory / 'shop_servicer.py'))],
        )

    async def test_a_servicer_that_starts_being_imported_is_found(
        self,
    ) -> None:
        self._write('shop_servicer.py', source=SHOP)
        application = self._write('main.py', source=APPLICATION)

        known = await self._analyze(application)

        self._write('depot_servicer.py', source=DEPOT)
        self._write(
            'main.py',
            source=APPLICATION.replace(
                'from shop_servicer import ShopServicer',
                'from depot_servicer import DepotServicer\n'
                'from shop_servicer import ShopServicer',
            ),
        )

        found = self._state_types_and_files(
            await self._analyze(application, known=known)
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

        found = self._state_types_and_files(await self._analyze(application))

        self.assertEqual(found, [])

    async def test_an_application_that_is_not_there(self) -> None:
        found = self._state_types_and_files(
            await self._analyze(self.directory / 'nowhere.py')
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

        found = self._state_types_and_files(await self._analyze(application))

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

        found = self._state_types_and_files(await self._analyze(application))

        self.assertEqual(found, [])

    async def test_every_import_is_a_dependency(self) -> None:
        helper = self._write('helper.py', source='VALUE = 1\n')
        servicer = self._write(
            'shop_servicer.py',
            source=SHOP + '\nimport helper\n',
        )
        application = self._write('main.py', source=APPLICATION)

        found = await self._analyze(application)

        self.assertEqual(
            found[servicer].dependencies['helper'].filename,
            str(helper),
        )

    async def test_files_importing_each_other(self) -> None:
        """A cycle of imports ends where it began: each file records
        the other as a dependency, by its digest."""
        one = self._write(
            'one.py',
            source='import two\n' + SHOP,
        )
        two = self._write('two.py', source='import one\n')
        application = self._write(
            'main.py',
            source=APPLICATION.replace('shop_servicer', 'one'),
        )

        found = await self._analyze(application)

        self.assertEqual(
            found[one].dependencies['two'].filename,
            str(two),
        )
        self.assertEqual(
            found[two].dependencies['one'].filename,
            str(one),
        )

    async def test_a_change_reaching_a_cycle_reanalyzes_its_members(
        self,
    ) -> None:
        """A file in a cycle of imports is parsed again when the
        cycle reaches a change, even though its own bytes are
        unchanged."""
        one = self._write(
            'one.py',
            source='import two\nimport helper\n' + SHOP,
        )
        two = self._write('two.py', source='import one\n')
        self._write('helper.py', source='VALUE = 1\n')
        application = self._write(
            'main.py',
            source=APPLICATION.replace('shop_servicer', 'one'),
        )

        known = await self._analyze(application)

        self._write('helper.py', source='VALUE = 2\n')

        await self._analyze(application, known=known)

        self.assertIn(one, self.parsed)
        self.assertIn(two, self.parsed)

    async def test_a_file_written_with_the_same_bytes_is_not_parsed_again(
        self,
    ) -> None:
        """Identical bytes are nothing to parse, which is only
        observable as the parsing not happening."""
        servicer = self._write('shop_servicer.py', source=SHOP)
        application = self._write('main.py', source=APPLICATION)

        known = await self._analyze(application)

        servicer.write_text(SHOP)

        await self._analyze(application, known=known)

        self.assertEqual({}, dict(self.parsed))

    async def test_a_dependency_that_stops_parsing_then_parses_again(
        self,
    ) -> None:
        """A dependency saved half-written reanalyzes its dependents
        once, against exactly the broken bytes; the save that makes
        it parse again reanalyzes them again."""
        helper = self._write('helper.py', source='VALUE = 1\n')
        servicer = self._write(
            'shop_servicer.py',
            source=SHOP + '\nimport helper\n',
        )
        application = self._write('main.py', source=APPLICATION)

        known = await self._analyze(application)

        self._write('helper.py', source='def broken(:\n')

        known = await self._analyze(application, known=known)

        # The dependent was reanalyzed and records the dependency as
        # broken, by the digest of the broken bytes; the broken file
        # itself was analyzed as nothing.
        self.assertIn(servicer, known)
        self.assertNotIn(helper, known)
        self.assertTrue(
            known[servicer].dependencies['helper'].HasField('digest')
        )

        self._write('helper.py', source='VALUE = 2\n')

        await self._analyze(application, known=known)

        self.assertIn(servicer, self.parsed)

    async def test_a_dependency_still_broken_the_same_way_is_no_change(
        self,
    ) -> None:
        """A dependent analyzed against a dependency's exact broken
        bytes stays decided while those bytes stay."""
        self._write('helper.py', source='VALUE = 1\n')
        servicer = self._write(
            'shop_servicer.py',
            source=SHOP + '\nimport helper\n',
        )
        application = self._write('main.py', source=APPLICATION)

        known = await self._analyze(application)

        self._write('helper.py', source='def broken(:\n')

        known = await self._analyze(application, known=known)

        await self._analyze(application, known=known)

        self.assertNotIn(servicer, self.parsed)

    async def test_a_deleted_dependency_settles_until_it_returns(
        self,
    ) -> None:
        """A deleted dependency reanalyzes its dependents once,
        recording it as absent; staying absent is then no change,
        and the file returning reanalyzes them again."""
        helper = self._write('helper.py', source='VALUE = 1\n')
        servicer = self._write(
            'shop_servicer.py',
            source=SHOP + '\nimport helper\n',
        )
        application = self._write('main.py', source=APPLICATION)

        known = await self._analyze(application)

        helper.unlink()

        known = await self._analyze(application, known=known)

        # The dependent was reanalyzed and records the module as
        # resolving to nothing.
        self.assertIn(servicer, known)
        self.assertNotIn(helper, known)
        self.assertFalse(
            known[servicer].dependencies['helper'].HasField('filename')
        )

        known = await self._analyze(application, known=known)

        self.assertNotIn(servicer, self.parsed)

        self._write('helper.py', source='VALUE = 2\n')

        await self._analyze(application, known=known)

        self.assertIn(servicer, self.parsed)

    async def test_an_import_that_starts_resolving_reanalyzes(
        self,
    ) -> None:
        """An import written before the file it names exists records
        the module as resolving to nothing; the file being created
        reanalyzes the importer."""
        servicer = self._write(
            'shop_servicer.py',
            source=SHOP + '\nimport helper\n',
        )
        application = self._write('main.py', source=APPLICATION)

        known = await self._analyze(application)

        self.assertFalse(
            known[servicer].dependencies['helper'].HasField('filename')
        )

        self._write('helper.py', source='VALUE = 1\n')

        known = await self._analyze(application, known=known)

        self.assertIn(servicer, self.parsed)

    async def test_a_change_two_imports_away_reanalyzes(self) -> None:
        """The analysis of a file read everything in the closure of
        its imports, so a change anywhere down the chain parses the
        file again."""
        self._write('helper.py', source='import deeper\n')
        self._write('deeper.py', source='VALUE = 1\n')
        servicer = self._write(
            'shop_servicer.py',
            source=SHOP + '\nimport helper\n',
        )
        application = self._write('main.py', source=APPLICATION)

        known = await self._analyze(application)

        self._write('deeper.py', source='VALUE = 2\n')

        await self._analyze(application, known=known)

        self.assertIn(servicer, self.parsed)


if __name__ == '__main__':
    unittest.main()
