"""Where a state type is implemented follows what the API declares.

The API files say which state types exist, so a state type appearing
is what sets the dashboard looking for the file that implements it.
"""
import tempfile
import unittest
from pathlib import Path
from reboot.dashboard.implementation_watcher import AnalyzedFile, analyze, walk
from reboot.dashboard.pyright import Pyright
from typing import Optional

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

# The shape of a generated module, as far as resolving a state type
# needs: the state type's class and its servicer bases carrying the
# state type's name as `__state_type_name__`, and the `Servicer`
# aliases a servicer's base leads through.
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

        self.pyright = Pyright()
        await self.pyright.start(
            root=self.directory,
            paths=[self.directory, self.generated],
        )

    async def asyncTearDown(self) -> None:
        await self.pyright.stop()
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
        pyright the test runs; the walk syncs it every file it
        parses."""
        unchanged, parsed = await walk(
            application=application,
            roots=roots,
            known=known or {},
        )

        analyzed = await analyze(
            parsed=parsed,
            pyright=self.pyright,
            generated_directory=self.generated,
        )

        # Which files this iteration parsed, for asserting that a
        # file was or was not reanalyzed.
        self.parsed = parsed

        return {**unchanged, **analyzed}

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
        """The analysis of a file leaned on everything in the closure
        of its imports, so a change anywhere down the chain parses
        the file again."""
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
