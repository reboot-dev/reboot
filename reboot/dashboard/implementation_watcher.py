"""How each of the developer's state types is implemented, kept up
to date for as long as the dashboard runs.

Their API files say which state types exist and nothing about where
one is implemented; the name does not say either, since `servicers.py`
may implement several and is named after none of them. What says is
the application, where the servicers are registered -- so this starts
at its entry point and follows its imports, collecting every class
that says what it services:

    class AccountServicer(Account.Servicer):

Following the imports rather than reading the list handed to
`Application`, because a servicer reaches it by any number of routes
-- `servicers=servicers()`, a list built elsewhere, a name rebound
behind a conditional import -- which have one thing in common: the
file defining the servicer had to be imported for any of them to run.

Which state type a class services is type information -- its base
may be spelled `Account.Servicer`, assigned to another name first, or
imported from anywhere -- so pyright is asked about every base every
class extends: a servicer is a class with a base whose type is
defined in a file `rbt generate` wrote, and the state type is the
name the generator writes there as `__state_type_name__`. Until
`rbt generate` has written it, the base resolves to nothing, and the
servicer waits unrecorded; `needs_generate` is what tells the
dashboard to suggest running it.

Where following stops is what makes this the developer's code rather
than somebody else's. A module resolves to a file only if a root
holds it, so an import of an installed package leads nowhere.

Read rather than imported, because importing an application means
having its generated code, its dependencies and its `sys.path`, and
the dashboard is meant to work before any of that exists. A file at a
time either way, so that the dashboard goes on answering while a
large application is read: every parse follows an awaited read of the
same file, and the analysis takes a file at a time through
`cooperatively`.

And driven by the filesystem, because that is what it is a function
of: where a state type is implemented can only change when the
developer's source changes, so an edit under the roots is what wakes
this, and nothing else does.
"""
import aiofiles
import aiofiles.os
import ast
import hashlib
import io
import os
import tokenize
from dataclasses import dataclass, replace
from pathlib import Path
from rbt.dashboard.v1.dashboard_pb2 import FileInfo
from rbt.dashboard.v1.dashboard_pb2 import \
    Implementation as ImplementationState
from rbt.dashboard.v1.dashboard_pb2 import ServicerInfo
from rbt.dashboard.v1.dashboard_rbt import Implementation
from reboot.aio.contexts import WorkflowContext
from reboot.aio.cooperatively import cooperatively
from reboot.cli.common.watch import file_watcher
from reboot.dashboard.pyright import Location, Pyright
from types import MappingProxyType
from typing import Mapping, Optional, Sequence

# A SHA-256 digest -- of a file's bytes, or of a method's syntax --
# saying whether what was digested has changed.
Digest = bytes

# What one of a file's imports observed when the file was analyzed:
# which file was at its possible module path, in the spelling
# `_standardized_path` returns, and the digest of that file's bytes, each
# absent when there was no file. Aliased from where it is defined so
# that what an iteration records and what a restart reconstitutes
# from are one message.
Dependency = FileInfo.Dependency

# One Reboot call a method's implementation makes: which state type,
# which method, and how the call is reached. Aliased from where it
# is defined so that what an analysis records and what a reader
# reads are one message.
Call = ServicerInfo.Method.Call

# Suffixes of the files `rbt generate` writes. Walked, digested and
# carried like any other file, so that a change to one reanalyzes
# exactly the files that used it when they were analyzed; never
# analyzed for servicers themselves, since the generator writes
# none.
GENERATED_SUFFIXES = ('_rbt.py', '_pb2.py', '_pb2_grpc.py')

# Every file the developer might have written a servicer in, which is
# the rule `rbt generate` and `rbt dev run` both use for source.
SOURCE_GLOB = '**/*.py'


def _standardized_path(filename: Path) -> Path:
    """Returns the path spelled the way the standard here says:
    resolved, then made relative to the working directory for a file
    under it, and left absolute for any other file. E.g.
    `backend/src/shop_servicer.py` for a file of the project, and
    `/usr/lib/python3.12/asyncio/__init__.py` for one outside it.

    Resolving first is what makes every route to one file, such as
    through a symlink, spell it the same way. A file under the working
    directory moves with the project, so its relative spelling stays
    true after the project directory is moved or renamed; a file
    anywhere else does not move with the project, so its absolute
    spelling is what stays true.
    """
    resolved = filename.resolve()
    try:
        return resolved.relative_to(Path.cwd())
    except ValueError:
        return resolved


def _anchored(path: Path) -> str:
    """Returns a possible module path anchored at one exact place,
    e.g. `./backend/db` for `from .db import connect` written in
    `backend`: `./`-marked under the working directory, and absolute
    anywhere else, so that it can never be mistaken for a module
    path that is searched under the roots."""
    spelled = os.path.normpath(str(path))
    if os.path.isabs(spelled):
        return spelled
    return '.' + os.sep + spelled


async def _read(filename: Path) -> bytes:
    async with aiofiles.open(filename, 'rb') as file:
        return await file.read()


def _extract_possible_module_paths_from_imports(
    syntax: ast.Module,
    *,
    directory: Path,
) -> tuple[str, ...]:
    """Returns, for each import the file writes, the possible
    module paths it determines: the path of the file the import may
    load, with the `.py` or `/__init__.py` always left off, and, for
    a dotted import, the root left off too. E.g. `import
    shop.v1.shop_rbt` determines `shop/v1/shop_rbt`, tried under
    each root; `from .db import connect` written in `backend`
    determines `./backend/db`, which says exactly where; and either
    also determines a possible module path for each imported name,
    such as `shop/v1/shop_rbt/Shop`, since `Shop` may be a module of
    its own. A file may exist at a possible module path or not;
    recording the path either way is what lets a later iteration
    notice the answer changing.

    Possible module paths come from every import, wherever they are
    written. One inside an `if` or a `try` loads its file just as
    one at the top of the file does, and guarding an import is
    common enough to be worth reading.

    `directory` is where the file itself is, which is what a
    relative import is relative to.
    """
    module_paths: list[str] = []

    for node in ast.walk(syntax):
        match node:
            case ast.Import(names=names):
                module_paths.extend(
                    alias.name.replace('.', os.sep) for alias in names
                )

            case ast.ImportFrom(
                module=from_module, level=int(level), names=names
            ):
                # Having a `level` means the import is relative and
                # determines an anchored module path. For example,
                # in a file `shop/cart/servicer.py`:
                #
                #   from shop.cart.types import Item
                #     level 0 -> `shop/cart/types`, searched
                #   from .types import Item
                #     level 1 -> `./shop/cart/types`, anchored
                #   from ..api import Item
                #     level 2 -> `./shop/api`, anchored
                #   from .. import api
                #     level 2, no module -> `./shop`, anchored
                #
                # `level` counts the leading dots. No dots: the
                # module's dots become the path, searched under each
                # root. One dot: start from the file's own
                # directory. Each extra dot: climb one parent. If a
                # module comes after the dots, it goes under that
                # directory.
                if level == 0:
                    if from_module is None:
                        continue
                    base = from_module.replace('.', os.sep)
                else:
                    target = directory
                    for _ in range(level - 1):
                        target = target.parent
                    if from_module is None:
                        base = _anchored(target)
                    else:
                        base = _anchored(
                            target.joinpath(*from_module.split('.'))
                        )

                module_paths.append(base)

                for alias in names:
                    if alias.name == '*':
                        # A star import loads only its module,
                        # whose module path is already listed.
                        continue
                    # Since we cannot tell whether `y` in
                    # `from x import y` is a module of its own or a
                    # name defined in `x`, `x/y` is possible too.
                    # The guess is safe: a file either exists at the
                    # module path or the path records nothing.
                    module_paths.append(os.path.join(base, alias.name))

    return tuple(module_paths)


async def _try_resolve_module_path(
    module_path: str,
    *,
    roots: Sequence[Path],
) -> Optional[Path]:
    """Returns the file at a possible module path when there is
    one, and `None` otherwise.

    This is the path half of Python's import rules, the half its
    finder does. An anchored module path, marked `./` or absolute,
    which is what a relative import determines, is completed only
    where it points. Any other module path is completed under each
    root in order, the way Python completes a dotted import under
    each `sys.path` entry. Within one place a package wins over a
    module of the same name, `helper/__init__.py` before
    `helper.py`, the way Python's finder checks directories first.
    What an import means past the filesystem, such as
    `from helper import x` preferring an `x` defined in
    `helper/__init__.py` over a `helper/x` module, is not decided
    here: both possibilities are recorded and pyright answers during
    analysis.

    `None` is not a failure: the standard library and installed
    packages live outside every root, so `import asyncio` completes
    to nothing and there is nothing to read.
    """
    if module_path.startswith('.' + os.sep) or os.path.isabs(module_path):
        candidates = [
            Path(module_path) / '__init__.py',
            Path(module_path + '.py'),
        ]
    else:
        candidates = [
            root / (module_path + suffix)
            for root in roots
            for suffix in (os.sep + '__init__.py', '.py')
        ]

    for candidate in candidates:
        if await aiofiles.os.path.isfile(candidate):
            return candidate

    return None


@dataclass(frozen=True, kw_only=True)
class ParsedFile:
    """What parsing one file said, before any name in it is
    resolved."""

    # The file this is, in the spelling `_standardized_path` returns: the
    # one spelling every route to the file, a relative import, an
    # absolute one, or a symlink, arrives at.
    filename: Path

    # Of the bytes the file held, saying whether parsing it again
    # would say anything new.
    digest: Digest

    # What each import observed, keyed by possible module path, e.g.
    # `shop/v1/shop_rbt`, recorded as the parse follows them depth
    # first. These are the files this file's analysis read, and what
    # later says whether a carried analysis can still be trusted: a
    # change in which file is at a module path, or in that file's
    # bytes, is what calls for reanalyzing.
    #
    # For now every import is taken as a dependency: tools like
    # `ruff` keep unused imports out of real code, so checking which
    # imported names are used would narrow little, and it can be
    # narrowed later if this proves too eager.
    dependencies: Mapping[str, Dependency]

    # The syntax itself, so that a file parsed while resolving names
    # is not parsed again when its own servicers are looked for.
    syntax: ast.Module

    # The decoded text the syntax was parsed from, for syncing with
    # pyright before the analysis asks about the file, so that the
    # answers are about exactly this text.
    text: str


@dataclass(frozen=True, kw_only=True)
class AnalyzedFile:
    """What analyzing one of the developer's files found."""

    # The file this is, in the spelling `_standardized_path` returns: the
    # one spelling every route to the file, a relative import, an
    # absolute one, or a symlink, arrives at.
    filename: Path

    # Of the bytes the file held, saying whether parsing it again
    # would say anything new.
    digest: Digest

    # What each import observed when this file was analyzed, keyed
    # by possible module path, e.g. `shop/v1/shop_rbt`. A change in
    # which file is at a module path, or in that file's bytes, is
    # what calls for reanalyzing this file.
    dependencies: Mapping[str, Dependency]

    # The files outside every root this file's analysis read, with
    # the digest each was read with. The walk never finds these, so
    # each is digested directly at the end of a walk, and a change
    # is what calls for reanalyzing this file.
    external: tuple[Dependency, ...]

    # Every servicer the file defines, resolved: which state type each
    # services and the calls each method makes.
    servicers: tuple[ServicerInfo, ...]


@dataclass(frozen=True, kw_only=True)
class Files:
    """The developer's files, as far as one iteration of the watch
    has taken them.

    An iteration is one call to `_walk`, which `watch` makes each
    time a save wakes it.

    Immutable: carrying the iteration forward means holding the one a
    method below returned.
    """

    # Where the developer's modules are found: the application's own
    # directory. What an iteration is allowed to analyze.
    roots: tuple[Path, ...]

    # What the previous iteration analyzed, keyed by the spelling
    # `_standardized_path` returns, so that every route to a file finds
    # the same record. A file unchanged since is neither parsed nor
    # analyzed again.
    known: Mapping[Path, AnalyzedFile]

    # Parsed this iteration, not yet analyzed. Keyed by the spelling
    # `_standardized_path` returns, like every map here, so that every
    # route to one file, through a relative import, an absolute one,
    # or a symlink, finds the same entry.
    parsed: Mapping[Path, ParsedFile]

    # Files whose bytes are unchanged since the previous iteration,
    # each carrying the analysis it got when it last changed. Being
    # here says only that: whether the carried analysis still stands
    # is decided at the end of the walk, where the ones that need to
    # be reparsed join `parsed` and the rest become the iteration's
    # `known`.
    unchanged: Mapping[Path, AnalyzedFile]

    # Files whose bytes are read but whose imports are still being
    # followed, above us in the walk's recursion, by the digest of
    # those bytes. What a cycle of imports meets: the file is
    # recorded as a dependency by its digest, already in hand,
    # rather than read again or recursed into forever. Only grows: a
    # finished file is found in `unchanged` or `parsed` before this
    # is ever consulted.
    visiting: Mapping[Path, Digest]

    # The file found at every possible module path met this
    # iteration, e.g. `'shop/v1/shop_rbt'` to
    # `backend/api/shop/v1/shop_rbt.py`, or `None` when there is no
    # file at the module path under any root, i.e., it names code
    # that lives elsewhere (the standard library, an installed
    # package), or a file that does not exist at all yet.
    resolutions: Mapping[str, Optional[Path]]

    # Every dependency read this iteration, keyed by possible module
    # path, e.g. `'shop/v1/shop_rbt'` or `'./backend/db'`: which
    # file was at the module path and the digest of its bytes, each
    # absent when there was no file. Recorded once per module path,
    # as the walk first follows it; what a file's recorded
    # `dependencies` are compared against.
    dependencies: Mapping[str, Dependency]

    @classmethod
    def create(
        cls,
        *,
        roots: Sequence[Path],
        known: Mapping[Path, AnalyzedFile],
    ) -> 'Files':
        """Returns the files an iteration starts from: nothing
        parsed, nothing analyzed."""
        return cls(
            roots=tuple(roots),
            known=MappingProxyType(
                {file.filename: file for file in known.values()}
            ),
            parsed=MappingProxyType({}),
            unchanged=MappingProxyType({}),
            visiting=MappingProxyType({}),
            resolutions=MappingProxyType({}),
            dependencies=MappingProxyType({}),
        )

    def with_parsed_file(self, parsed: ParsedFile) -> 'Files':
        """Returns this with one more file parsed, into `parsed`."""
        # A file is parsed or unchanged, never both.
        assert parsed.filename not in self.unchanged
        return replace(
            self,
            parsed=MappingProxyType({
                **self.parsed,
                parsed.filename: parsed,
            }),
        )

    def with_unchanged_known_file(self, file: AnalyzedFile) -> 'Files':
        """Returns this with a file the previous iteration analyzed
        verified unchanged, the analysis it carries along with it."""
        # A file is parsed or unchanged, never both.
        assert file.filename not in self.parsed
        return replace(
            self,
            unchanged=MappingProxyType(
                {
                    **self.unchanged,
                    file.filename: file,
                }
            ),
        )

    def matches(
        self,
        module_path: str,
        dependency: Dependency,
    ) -> bool:
        """Returns whether this iteration found a file for a
        possible module path, e.g. `shop/v1/shop_rbt`, that matches
        `dependency`: the same file with the same bytes, or no file
        both then and now. `False` says the file that recorded
        `dependency` needs reanalyzing: a different file is at the
        module path (created, deleted, or shadowed), or the same
        file has different bytes (edited, or newly broken). Bytes
        that would not parse compare like any others, half-written
        being the normal state of a file somebody is typing into:
        analyzed against exactly those bytes, a file stays decided
        until they change.
        """
        filename = self.resolutions[module_path]

        # Two files sitting in `unchanged` can not disagree about
        # the dependency's bytes: the recorded digest came from the
        # same walk that placed the dependency in `known`, and any
        # change since moved the dependency to `parsed`.
        assert (
            filename is None or str(filename) != dependency.filename or
            filename not in self.unchanged or
            self.unchanged[filename].digest == dependency.digest
        )

        return self.dependencies[module_path] == dependency

    async def lookup_or_parse_filename(
        self,
        filename: Path,
    ) -> tuple[Optional[Digest], 'Files']:
        """Returns the digest of the file's bytes, met the way this
        walk has it: looked up among what is already read; taken as
        unchanged, its carried analysis along, when its bytes are
        the same as the previous iteration's; or read and parsed,
        its own imports followed depth first and recorded as its
        dependencies, joining `parsed`. Bytes that will not decode
        or parse come back digested all the same, joining nothing; a
        file that cannot be read comes back as `None`. `filename`
        must be in the spelling `_standardized_path` returns, the
        way every filename here is.
        """
        assert filename == _standardized_path(filename), (
            'Expecting the filename in the standardized spelling'
        )

        files = self

        found = files.parsed.get(filename) or files.unchanged.get(filename)
        if found is not None:
            # We've either already parsed this file or determined it
            # hasn't been changed so stop the recursion and return.
            return found.digest, files

        if filename in files.visiting:
            # A cycle of imports: the file is mid-parse above us, and
            # its bytes are read and digested, which is all being a
            # dependency takes.
            return files.visiting[filename], files

        try:
            source = await _read(filename)
        except OSError:
            return None, files

        digest = hashlib.sha256(source).digest()

        known = files.known.get(filename)
        if known is not None and known.digest == digest:
            # The bytes are unchanged, so the file joins `unchanged`
            # with the analysis it carries; whether that analysis
            # still stands is decided after the walk, once every
            # changed file is in hand. Its imports are still
            # followed, which is what reaches the rest of the
            # application.
            files = files.with_unchanged_known_file(known)
            for module_path in known.dependencies:
                # A module path with no file at it is fine here:
                # if a file this one recorded as a dependency is
                # gone, that dependency no longer matches, which is
                # what seeds this file for reanalysis when the walk
                # ends, and the save that fixes or removes the
                # import starts another iteration.
                files = await files.lookup_or_parse_module_path(module_path)
            return known.digest, files

        parse = Parse.from_bytes(source)
        if parse is None:
            return digest, files

        module_paths = _extract_possible_module_paths_from_imports(
            parse.syntax,
            directory=filename.parent,
        )

        files = replace(
            files,
            visiting=MappingProxyType({
                **files.visiting,
                filename: digest,
            }),
        )

        # Following an import and depending on it are the same event:
        # each of the file's possible module paths is followed depth
        # first, and what each observed is grabbed from
        # `files.dependencies`, keyed by the module path. A module
        # path with no file at it is observed too: recording it is
        # what makes a file appearing there a change.
        for module_path in module_paths:
            files = await files.lookup_or_parse_module_path(module_path)

        parsed = ParsedFile(
            filename=filename,
            digest=digest,
            dependencies=MappingProxyType(
                {
                    module_path: files.dependencies[module_path]
                    for module_path in module_paths
                }
            ),
            syntax=parse.syntax,
            text=parse.text,
        )

        return digest, files.with_parsed_file(parsed)

    async def lookup_or_parse_module_path(
        self,
        module_path: str,
    ) -> 'Files':
        """Follows a possible module path, e.g. `shop/v1/shop_rbt`
        or `./backend/db`, to its file, met the way this walk has
        it, recording what the import observed in `dependencies`,
        once per module path. Which file is at the module path joins
        `resolutions`, which spares finding it again; there is no
        file at a module path when no root has one, which is what
        code outside the roots, such as the standard library, and
        code that does not exist yet both look like.
        """
        files = self

        if module_path in files.dependencies:
            return files

        if module_path not in files.resolutions:
            filename = await _try_resolve_module_path(
                module_path,
                roots=files.roots,
            )
            if filename is not None:
                filename = _standardized_path(filename)
            files = replace(
                files,
                resolutions=MappingProxyType(
                    {
                        **files.resolutions,
                        module_path: filename,
                    }
                ),
            )

        filename = files.resolutions[module_path]
        dependency = Dependency()
        if filename is not None:
            # Found a file, recurse.
            digest, files = await files.lookup_or_parse_filename(filename)
            dependency.filename = str(filename)
            if digest is not None:
                dependency.digest = digest

        return replace(
            files,
            dependencies=MappingProxyType(
                {
                    **files.dependencies,
                    module_path: dependency,
                }
            ),
        )


@dataclass(frozen=True, kw_only=True)
class Parse:
    """One file's bytes parsed."""

    # The decoded text, as Python reads the bytes: the encoding a
    # coding declaration or a byte order mark declares is honored.
    text: str

    # The text's syntax.
    syntax: ast.Module

    @classmethod
    def from_bytes(cls, source: bytes) -> Optional['Parse']:
        """Returns a file's bytes parsed, and `None` for bytes that
        will not decode or will not parse, half-written being the
        normal state of a file somebody is typing into."""
        try:
            encoding, _ = tokenize.detect_encoding(io.BytesIO(source).readline)
            text = source.decode(encoding)
            return cls(text=text, syntax=ast.parse(text))
        except (SyntaxError, UnicodeDecodeError, ValueError):
            return None


def _position_at_last_character(
    node: ast.Name | ast.Attribute,
) -> tuple[int, int]:
    """Returns a line counting from one and the column of the last
    character of the name, e.g. of the final `r` in `Shop.Servicer`.

    The column is `end_col_offset - 1` because `end_col_offset` is
    the column after the name's last character, e.g. the `)` after a
    base, and a question asked there would not be about the name.
    """
    # Every node from `ast.parse` carries its end position; only a
    # node built by hand can lack one.
    assert node.end_lineno is not None
    assert node.end_col_offset is not None
    return node.end_lineno, node.end_col_offset - 1


def _digest(node: ast.AST) -> Digest:
    """Returns a digest of what a piece of syntax says.

    The digest is computed using `ast.dump` without attributes so that
    the lines and columns are left out, and thus a comment added above
    a method or arguments rewrapped across lines do not change the
    digest. E.g. a method whose `pass` gains a comment above it or
    whose arguments are laid out one per line digests the same, while
    one whose `pass` becomes `return None` digests differently.
    """
    return hashlib.sha256(
        ast.dump(node, include_attributes=False).encode(),
    ).digest()


def _try_find_state_type_name(class_definition: ast.ClassDef) -> Optional[str]:
    """Returns the state type a class of generated code belongs to,
    spelled as `StateTypeInfo.name`, which the generator writes into
    the class as `__state_type_name__`, and `None` for a class
    without one. E.g. `'shop.v1.Shop'` for a class containing
    `__state_type_name__ = StateTypeName('shop.v1.Shop')`."""
    for statement in class_definition.body:
        match statement:
            case ast.Assign(
                targets=[ast.Name(id='__state_type_name__')],
                value=(
                    ast.Call(args=[ast.Constant(value=str(name))]) |
                    ast.Constant(value=str(name))
                ),
            ):
                return name

    return None


@dataclass(frozen=True, kw_only=True)
class StateTypeDefinition:
    """A line defining a state type's own class, the one named
    after the state type, e.g. the generator's `class Shop:` for
    `shop.v1.Shop`."""

    # The state type, spelled as `StateTypeInfo.name`, e.g.
    # `shop.v1.Shop`.
    state_type: str


@dataclass(frozen=True, kw_only=True)
class BaseServicerDefinition:
    """A line defining a servicer base class of generated code: a
    class carrying `__state_type_name__` itself while named unlike
    the state type, e.g. the generator's
    `class ShopBaseServicer:`."""

    # The state type, spelled as `StateTypeInfo.name`, e.g.
    # `shop.v1.Shop`.
    state_type: str


@dataclass(frozen=True, kw_only=True)
class ServicerDefinition:
    """A line defining a servicer class: a class whose state type
    comes through a base defined in the same module, e.g. the
    generator's `class ShopServicer(ShopBaseServicer):`."""

    # The state type, spelled as `StateTypeInfo.name`, e.g.
    # `shop.v1.Shop`.
    state_type: str


# What a line defining a class may be, as far as finding state
# types takes.
@dataclass(frozen=True, kw_only=True)
class MethodDefinition:
    """A line defining a method stub of a state type: on its
    `WeakReference`, the class of a reference to it, or on the
    state type's own class, where the generator writes the
    constructors. What a call made through any reference, or a
    construction, is defined by."""

    # The state type, spelled as `StateTypeInfo.name`, e.g.
    # `shop.v1.Shop`.
    state_type: str

    # The method name, spelled as the developer calls it, e.g. `look`.
    name: str

    # How a call defined here is reached, which is where the stub
    # is written: e.g. `CONSTRUCT` for one on the state type's own
    # class, and `SCHEDULE` for one inside its
    # `WeakReference._Schedule`.
    how: 'Call.How.ValueType'


GeneratedDefinition = (
    StateTypeDefinition | BaseServicerDefinition | ServicerDefinition |
    MethodDefinition
)

# How a call whose stub is defined in each class the generator
# nests inside a `WeakReference` or the state type's class is
# reached: through `.schedule(when=...)`, `.spawn(when=...)`, or
# `.forall(ids)`; for `.idempotently(...)`, a plain call or a
# construction made idempotent.
HOWS_BY_CLASS_NAME = {
    '_ConstructIdempotently': Call.How.CONSTRUCT,
    '_Forall': Call.How.FORALL,
    '_Idempotently': Call.How.CALL,
    '_Schedule': Call.How.SCHEDULE,
    '_SelfIdempotently': Call.How.CALL,
    '_SelfSchedule': Call.How.SCHEDULE,
    '_Spawn': Call.How.SPAWN,
    '_Until': Call.How.UNTIL,
}


def _takes_context_second(
    method: ast.FunctionDef | ast.AsyncFunctionDef,
) -> bool:
    """Returns whether a def takes `__context__` as its second
    parameter, the spelling only the generator's method stubs use:
    e.g. `Greet(__this__, __context__, ...)` does, and the
    machinery around the stubs, such as `schedule(self, when=...)`,
    does not."""
    arguments = method.args.args
    return len(arguments) >= 2 and arguments[1].arg == '__context__'


def _generated_definitions(
    syntax: ast.Module,
) -> Mapping[int, GeneratedDefinition]:
    """Returns what each line of a `_rbt` module defines: a class
    carrying a state type defines it, as the state type's own
    class, a servicer base, or a servicer. A line defining anything
    else has no entry, since state types are defined by nothing but
    the generator's code.

    One pass in the module's own order, which is the order the
    generator writes: a servicer base is written above the
    servicers extending it, so a servicer's base is already known
    when the servicer is met."""
    definitions: dict[int, GeneratedDefinition] = {}

    # The servicer bases met so far, by class name, which is where
    # a servicer's base leads.
    base_servicer_definitions: dict[str, BaseServicerDefinition] = {}

    for statement in syntax.body:
        match statement:
            case ast.ClassDef(name=str(name)) if (
                name.endswith('BaseServicer') and
                (state_type :=
                 _try_find_state_type_name(statement)) is not None
            ):
                definition = BaseServicerDefinition(state_type=state_type)
                base_servicer_definitions[name] = definition
                definitions[statement.lineno] = definition

            case ast.ClassDef(name=str(name)) if name.endswith('Servicer'):
                # One hop is all the generator writes: a servicer's
                # base carries `__state_type_name__` itself.
                for base in statement.bases:
                    match base:
                        case ast.Name(id=str(base_name)) if (
                            base_servicer :=
                            base_servicer_definitions.get(base_name)
                        ) is not None:
                            definitions[statement.lineno] = (
                                ServicerDefinition(
                                    state_type=base_servicer.state_type,
                                )
                            )
                            break

            case ast.ClassDef(name=str(name)) if (
                (state_type := _try_find_state_type_name(statement))
                is not None and state_type.split('.')[-1] == name
            ):
                definitions[statement.lineno] = StateTypeDefinition(
                    state_type=state_type,
                )

                # The state type's class defines the constructor
                # stubs, e.g.
                # `async def Create(__cls__, __context__, ...)`;
                # its `WeakReference`, the class of a reference to
                # it, defines the method stubs a reference is
                # called with, one def per overload; and the
                # classes inside the `WeakReference` named in
                # `HOWS_BY_CLASS_NAME` define the same stubs as
                # reached each way, `_ConstructIdempotently` the
                # constructors made idempotent. Every stub
                # is told apart from the machinery around it, such
                # as `ref` and `schedule` themselves, by the
                # `__context__` parameter only the generator's
                # stubs take second.
                for inner in statement.body:
                    match inner:
                        case (ast.FunctionDef() | ast.AsyncFunctionDef()
                             ) if _takes_context_second(inner):
                            definitions[inner.lineno] = MethodDefinition(
                                state_type=state_type,
                                name=inner.name,
                                how=Call.How.CONSTRUCT,
                            )

                        case ast.ClassDef(
                        ) if (inner.name in HOWS_BY_CLASS_NAME):
                            for node in inner.body:
                                match node:
                                    case (
                                        ast.FunctionDef() |
                                        ast.AsyncFunctionDef()
                                    ) if _takes_context_second(node):
                                        definitions[node.lineno] = (
                                            MethodDefinition(
                                                state_type=state_type,
                                                name=node.name,
                                                how=HOWS_BY_CLASS_NAME[
                                                    inner.name],
                                            )
                                        )

                        case ast.ClassDef(name='WeakReference'):
                            for node in inner.body:
                                match node:
                                    case (
                                        ast.FunctionDef() |
                                        ast.AsyncFunctionDef()
                                    ) if _takes_context_second(node):
                                        definitions[node.lineno] = (
                                            MethodDefinition(
                                                state_type=state_type,
                                                name=node.name,
                                                how=Call.How.CALL,
                                            )
                                        )

                                    case ast.ClassDef(
                                    ) if (node.name in HOWS_BY_CLASS_NAME):
                                        how = HOWS_BY_CLASS_NAME[node.name]
                                        for scheduled in node.body:
                                            match scheduled:
                                                case (
                                                    ast.FunctionDef() |
                                                    ast.AsyncFunctionDef()
                                                ) if (
                                                    _takes_context_second(
                                                        scheduled
                                                    )
                                                ):
                                                    definitions[
                                                        scheduled.lineno] = (
                                                            MethodDefinition(
                                                                state_type=
                                                                state_type,
                                                                name=scheduled.
                                                                name,
                                                                how=how,
                                                            )
                                                        )

    return MappingProxyType(definitions)


@dataclass(frozen=True, kw_only=True)
class GeneratedFile:
    """What reading one `_rbt` module during an analysis said."""

    # What each line of the module defines, empty when the file
    # could not be read or would not parse.
    definitions: Mapping[int, GeneratedDefinition]

    # The dependency each file whose analysis reads this module
    # records in its `external`: present only for a module outside
    # every root, which the walk never finds or digests, and always
    # carrying a digest of bytes actually read.
    external: Optional[Dependency]


@dataclass(frozen=True, kw_only=True)
class HelperDefinition:
    """A line defining a function or method in code the generator
    did not write: the developer's own, or an installed package's.
    What a call that is not a Reboot call may be defined by, and
    whose body may make Reboot calls of its own."""

    # The file the function is defined in, in the spelling
    # `_standardized_path` returns.
    filename: Path

    # The decoded text of that file, for syncing with pyright before
    # the analysis asks about the function's body.
    text: str

    # The function's syntax, which is what analyzing it walks.
    syntax: ast.FunctionDef | ast.AsyncFunctionDef


@dataclass(frozen=True, kw_only=True)
class HelperFile:
    """What reading one module the generator did not write during
    an analysis said."""

    # What each line of the module defines, empty when the file
    # could not be read or would not parse.
    definitions: Mapping[int, HelperDefinition]

    # The dependency each file whose analysis reads this module
    # records in its `external`: present only for a module outside
    # every root, which the walk never finds or digests, and always
    # carrying a digest of bytes actually read.
    external: Optional[Dependency]


def _helper_definitions(
    filename: Path,
    parse: Parse,
) -> Mapping[int, HelperDefinition]:
    """Returns what each line of a module the generator did not write
    defines: every function and method, wherever it is nested, by
    the line its `def` is on, which is the line pyright places its
    definition at. A line defining anything else has no entry."""
    return MappingProxyType(
        {
            node.lineno:
                HelperDefinition(
                    filename=filename,
                    text=parse.text,
                    syntax=node,
                )
            for node in ast.walk(parse.syntax)
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        }
    )


@dataclass(frozen=True, kw_only=True)
class Analysis:
    """One iteration's analysis: what the walk read, for the asking.

    Immutable: carrying the analysis forward means holding the one a
    method below returned.
    """

    # What the walk parsed, each file to be analyzed, whose text is
    # what pyright is asked about.
    parsed: Mapping[Path, ParsedFile]

    # Answers what the code written in the files means, handed each
    # file's text as it is asked about.
    pyright: Pyright

    # The directories the walk walked, in the spelling
    # `_standardized_path` returns. A file under none of them is
    # somebody else's code, which the walk does not digest, so
    # reading one is recorded in `external`.
    roots: tuple[Path, ...]

    # Every `_rbt` module read so far, keyed by the spelling
    # `_standardized_path` returns: read, parsed and indexed at
    # most once per analysis.
    reads: Mapping[Path, GeneratedFile]

    # Every module the generator did not write read so far, keyed
    # by the spelling `_standardized_path` returns: read, parsed and
    # indexed at most once per analysis.
    helpers: Mapping[Path, HelperFile]

    # The dependencies on files outside every root read since the
    # map was last emptied, keyed by filename in the spelling
    # `_standardized_path` returns. Emptied by `_analyze_file` for
    # each file it analyzes, so that what gathers is what analyzing
    # that one file read.
    external: Mapping[str, Dependency]

    async def _parse(
        self,
        filename: Path,
    ) -> tuple[Optional[Parse], Optional[Dependency]]:
        """Returns a file parsed, and the dependency a file whose
        analysis read it records when it is outside every root. The
        parse comes from the walk when the walk reached the file,
        and from the disk otherwise; it is `None` for a file that
        could not be read or would not parse, and the dependency is
        `None` for a file under a root, or one that could not be
        read, since a dependency always carries a digest of bytes
        actually read."""
        parsed = self.parsed.get(filename)
        if parsed is not None:
            return Parse(text=parsed.text, syntax=parsed.syntax), None

        try:
            source = await _read(filename)
        except OSError:
            return None, None

        external: Optional[Dependency] = None
        if not any(filename.is_relative_to(root) for root in self.roots):
            external = Dependency(
                filename=str(filename),
                digest=hashlib.sha256(source).digest(),
            )

        return Parse.from_bytes(source), external

    def _with_external_dependency(
        self,
        dependency: Optional[Dependency],
    ) -> 'Analysis':
        """Returns the analysis with a dependency joined to
        `external`, and unchanged for `None`. Joined on every read,
        cached or not, because several files being analyzed may all
        read the one file, and each records the dependency."""
        if dependency is None:
            return self
        return replace(
            self,
            external=MappingProxyType(
                {
                    **self.external,
                    dependency.filename: dependency,
                }
            ),
        )

    async def generated_definition_at(
        self,
        location: Location,
    ) -> tuple[Optional[GeneratedDefinition], 'Analysis']:
        """Returns what a `_rbt` module defines at a location, and
        `None` for a location anywhere else, since state types are
        defined by nothing but the generator's code. The module is
        read, parsed and indexed at most once per analysis."""
        analysis = self

        # The only definitions we return are those in generated
        # `_rbt.py` modules, either one in our generated directory or
        # one inside an installed package that ships generated code,
        # e.g., such as the standard library.
        if not location.filename.name.endswith('_rbt.py'):
            return None, analysis

        # Standardized because pyright spells its locations
        # absolutely, while everything here is keyed by the
        # spelling `_standardized_path` returns.
        filename = _standardized_path(location.filename)

        read = analysis.reads.get(filename)
        if read is None:
            parse, external = await analysis._parse(filename)
            read = GeneratedFile(
                definitions=(
                    _generated_definitions(parse.syntax)
                    if parse is not None else MappingProxyType({})
                ),
                external=external,
            )
            analysis = replace(
                analysis,
                reads=MappingProxyType({
                    **analysis.reads,
                    filename: read,
                }),
            )

        analysis = analysis._with_external_dependency(read.external)

        return read.definitions.get(location.line), analysis

    async def helper_definition_at(
        self,
        location: Location,
    ) -> tuple[Optional[HelperDefinition], 'Analysis']:
        """Returns the function a module the generator did not write
        defines at a location, and `None` for a location that
        defines no function, or that is in a stub, whose functions
        have no bodies to follow. The module is read, parsed and
        indexed at most once per analysis."""
        analysis = self

        if location.filename.suffix != '.py':
            return None, analysis

        # Standardized because pyright spells its locations
        # absolutely, while everything here is keyed by the
        # spelling `_standardized_path` returns.
        filename = _standardized_path(location.filename)

        helper = analysis.helpers.get(filename)
        if helper is None:
            parse, external = await analysis._parse(filename)
            helper = HelperFile(
                definitions=(
                    _helper_definitions(filename, parse)
                    if parse is not None else MappingProxyType({})
                ),
                external=external,
            )
            analysis = replace(
                analysis,
                helpers=MappingProxyType(
                    {
                        **analysis.helpers,
                        filename: helper,
                    }
                ),
            )

        analysis = analysis._with_external_dependency(helper.external)

        return helper.definitions.get(location.line), analysis


async def _generated_definition_at(
    filename: Path,
    line: int,
    character: int,
    *,
    analysis: Analysis,
) -> tuple[Optional[GeneratedDefinition], Analysis]:
    """Returns the definition the type of the expression at a position
    resolves to, when that class carries a state type, and `None`
    otherwise.

    Pyright says where the expression's type is defined, resolving
    however the expression gets there: through the generator's
    `Servicer: TypeAlias = ShopServicer`, a chain of assignments, a
    name imported from anywhere, or a function's return type. What
    the file it names defines at that line, indexed once per file,
    is the answer."""
    location = await analysis.pyright.type_definition_at(
        filename=filename,
        line=line,
        character=character,
        text=analysis.parsed[filename].text,
    )
    if location is None:
        # TODO: use pyright having no answer as the signal to tell
        # the developer the expression could not be resolved, so
        # that a servicer the dashboard does not show is never
        # missing silently.
        return None, analysis

    return await analysis.generated_definition_at(location)


async def _analyze_function(
    function: ast.FunctionDef | ast.AsyncFunctionDef,
    *,
    filename: Path,
    text: str,
    analysis: Analysis,
    visited: frozenset[tuple[Path, int]],
) -> tuple[list[Call], list[str], Analysis]:
    """Returns the Reboot calls a function's body makes, itself or
    through the functions it calls, and the calls it makes that are
    ambiguous.

    A Reboot call is one whose own definition pyright places at a
    method stub of a state type. However the reference was come by,
    taken with `ref`, held in a variable, or received from
    elsewhere, the called method's definition is the same, so one
    question decides.

    A call defined by a function the generator did not write, the
    developer's own or an installed package's, is followed: that
    function's body is analyzed the same way and its calls are the
    caller's, flattened, with no record of the function they came
    through. Whether a context reaches the function is never asked,
    since each Reboot call is recognized at its own call site, so a
    context that arrives inside a dataclass or a closure is followed
    like one passed directly. `visited` is every function on the
    way here, by file and line, so that functions calling each
    other are followed once.

    An ambiguous call is one with no definition pyright can say, or
    one whose definition is no function: a stub's, which has no body
    to follow, or a class's. A call whose definition is the
    generator's own machinery, such as the `ref` or `schedule`
    inside a chain, or the standard library's, is neither.
    """
    calls: list[Call] = []
    ambiguous: list[str] = []

    for node in ast.walk(function):
        match node:
            case ast.Call(func=(ast.Attribute() | ast.Name()) as callee):
                pass
            case _:
                continue

        line, character = _position_at_last_character(callee)

        location = await analysis.pyright.definition_at(
            filename=filename,
            line=line,
            character=character,
            text=text,
        )
        if location is None:
            ambiguous.append(ast.unparse(callee))
            continue

        # Nothing in the standard library takes a context, so a call
        # into it can neither be nor reach a Reboot call.
        if location.standard_library:
            continue

        if location.filename.name.endswith('_rbt.py'):
            definition, analysis = await analysis.generated_definition_at(
                location
            )

            match definition:
                case MethodDefinition(
                    state_type=state_type,
                    name=name,
                    how=how,
                ):
                    calls.append(
                        Call(state_type=state_type, method=name, how=how)
                    )
            continue

        helper, analysis = await analysis.helper_definition_at(location)
        if helper is None:
            ambiguous.append(ast.unparse(callee))
            continue

        key = (helper.filename, helper.syntax.lineno)
        if key in visited:
            continue

        helper_calls, helper_ambiguous, analysis = await _analyze_function(
            helper.syntax,
            filename=helper.filename,
            text=helper.text,
            analysis=analysis,
            visited=visited | {key},
        )
        calls.extend(helper_calls)
        ambiguous.extend(helper_ambiguous)

    return calls, ambiguous, analysis


async def _analyze_class(
    class_definition: ast.ClassDef,
    *,
    filename: Path,
    analysis: Analysis,
) -> tuple[Optional[ServicerInfo], Analysis]:
    """Returns the servicer a class is, and `None` when it is not
    one.

    A servicer is a class with a base referring to a state type's
    `Servicer`, however the base is spelled: `Account.Servicer`, a
    name it was assigned to first, or a name imported from another
    file. Which state type that is, pyright answers; a base whose
    name it cannot yet place, most often because `rbt generate` has
    not run since the state type was declared, services nothing yet,
    and waits.
    """
    # Each base is tried in turn: e.g. for
    # `class ShopServicer(Mixin, Shop.Servicer):` first `Mixin`,
    # whose type is no state type's class, then `Shop.Servicer`,
    # whose type answers `shop.v1.Shop`.
    for base in class_definition.bases:
        match base:
            case ast.Name() | ast.Attribute():
                line, character = _position_at_last_character(base)
            case _:
                # A base that is not a name, such as a call, has no
                # position to ask about.
                continue

        # Try to resolve the base class to a Reboot specific
        # definition, or `None` if it couldn't be resolved or is not
        # Reboot specific.
        definition, analysis = await _generated_definition_at(
            filename,
            line,
            character,
            analysis=analysis,
        )

        # Only a `ServicerDefinition` makes the class a servicer:
        # the correct spellings of a servicer's base,
        # `Shop.Servicer` and `ShopServicer`, both have the
        # servicer class as their type. A `BaseServicerDefinition`
        # or a `StateTypeDefinition` is a base spelled incorrectly,
        # e.g. `ShopBaseServicer` or `Shop` extended directly.
        #
        # TODO: use a base landing on a `BaseServicerDefinition` or
        # a `StateTypeDefinition` as the signal to tell the
        # developer the class extends the wrong thing.
        if not isinstance(definition, ServicerDefinition):
            continue

        servicer = ServicerInfo(
            state_type=definition.state_type,
            file=str(filename),
            line=class_definition.lineno,
            character=class_definition.col_offset,
        )

        for statement in class_definition.body:
            match statement:
                case (
                    ast.FunctionDef(name=str(name)) |
                    ast.AsyncFunctionDef(name=str(name))
                ):
                    calls, ambiguous, analysis = await _analyze_function(
                        statement,
                        filename=filename,
                        text=analysis.parsed[filename].text,
                        analysis=analysis,
                        visited=frozenset({(filename, statement.lineno)}),
                    )
                    servicer.methods.append(
                        ServicerInfo.Method(
                            name=name,
                            digest=_digest(statement),
                            calls=calls,
                            ambiguous=ambiguous,
                        )
                    )

        return servicer, analysis

    return None, analysis


async def _analyze_file(
    filename: Path,
    analysis: Analysis,
) -> tuple[AnalyzedFile, Analysis]:
    """Returns one parsed file analyzed: an `AnalyzedFile` built
    from its `ParsedFile` -- the dependencies the parse recorded --
    with the external files the analysis read and every servicer
    the file defines."""
    parsed = analysis.parsed[filename]

    # A generated file defines no servicer, the generator writes
    # none, so only the developer's own files are searched.
    if filename.name.endswith(GENERATED_SUFFIXES):
        return AnalyzedFile(
            filename=parsed.filename,
            digest=parsed.digest,
            dependencies=parsed.dependencies,
            external=(),
            servicers=(),
        ), analysis

    # Emptied so that what gathers in `external` below is what
    # analyzing this one file read.
    analysis = replace(analysis, external=MappingProxyType({}))

    servicers: list[ServicerInfo] = []

    for node in ast.walk(parsed.syntax):
        match node:
            case ast.ClassDef():
                servicer, analysis = await _analyze_class(
                    node,
                    filename=filename,
                    analysis=analysis,
                )
                if servicer is not None:
                    servicers.append(servicer)

    # Discarded so that pyright holds only what analyzing one file
    # asked about, rather than accumulating every file asked about
    # across an analysis; the next file syncs what it asks about.
    for synced in analysis.pyright.synced():
        await analysis.pyright.discard(filename=synced)

    return AnalyzedFile(
        filename=parsed.filename,
        digest=parsed.digest,
        dependencies=parsed.dependencies,
        external=tuple(
            dependency for _, dependency in sorted(analysis.external.items())
        ),
        servicers=tuple(servicers),
    ), analysis


def extract_and_sort_servicers(
    files: Mapping[Path, AnalyzedFile],
) -> list[ServicerInfo]:
    """Returns every servicer found, sorted by the state type it
    services and the file it is written in.

    A state type appearing twice is two classes servicing it, which is
    for whoever reads this to make of what they will; a state type not
    appearing at all is one no servicer was found for, which a file
    that would not parse looks like too.
    """
    return sorted(
        (servicer for file in files.values() for servicer in file.servicers),
        key=lambda servicer: (servicer.state_type, servicer.file),
    )


def _resolves_externally(
    module_path: str,
    external: Sequence[Dependency],
) -> bool:
    """Returns whether a possible module path names one of the
    external files an analysis read, e.g. `shop/v1/ext_rbt` for an
    installed `/.../site-packages/shop/v1/ext_rbt.py`: the file is
    the module path completed with `.py` or `/__init__.py` under
    some directory."""
    return any(
        dependency.filename.endswith(os.sep + module_path +
                                     '.py') or dependency.filename.
        endswith(os.sep + module_path + os.sep + '__init__.py')
        for dependency in external
    )


def _reconstitute_known(
    state: ImplementationState,
) -> dict[Path, AnalyzedFile]:
    """Returns the analyzed files a previous run recorded, joined
    back together from the state: each `FileInfo` with the servicers
    recorded for its file. What a restarted watch starts from, so
    that only files that changed while the dashboard was down are
    parsed and analyzed again."""
    servicers: dict[str, list[ServicerInfo]] = {}
    for servicer in state.servicers:
        servicers.setdefault(servicer.file, []).append(servicer)

    return {
        Path(filename):
            AnalyzedFile(
                filename=Path(filename),
                digest=file.digest,
                dependencies=MappingProxyType(dict(file.dependencies)),
                external=tuple(file.external),
                servicers=tuple(servicers.get(filename, [])),
            ) for filename, file in state.files.items()
    }


async def _walk(
    *,
    application: Path,
    roots: Sequence[Path],
    known: Optional[Mapping[Path, AnalyzedFile]] = None,
) -> tuple[dict[Path, AnalyzedFile], Mapping[Path, ParsedFile]]:
    """Returns the developer's files read for one iteration, as two
    maps keyed by the spelling `_standardized_path` returns:
    `unchanged`, the files whose
    carried analyses still stand, and `parsed`, the files to be
    analyzed. Whoever calls analyzes the parsed ones and merges what
    comes back with `unchanged`, which is the `known` a next
    iteration starts from.

    Only what the application reaches is returned: a file that has
    stopped being imported is absent, however recently it changed,
    and one that has started being imported is parsed for the first
    time.

    Everything is read here, before anything is asked of pyright,
    and each `ParsedFile` carries the text it was parsed from, so
    that whatever the analysis asks pyright about a file, it can
    sync first and ask about exactly the text this walk parsed.

    `known` is what a previous iteration's analysis returned, and
    spares the walk from parsing a file that has not changed since --
    neither in its own bytes nor in any file its analysis depended
    on, however many dependencies away.

    `roots` are the directories a module may be found under, which is
    both how a module name becomes a file and where the developer's
    code is taken to end.

    """
    application = _standardized_path(application)

    files = Files.create(
        roots=roots,
        known=known or {},
    )

    # Everything reachable is read by one depth-first recursion from
    # the application's file. Parsing is synchronous and blocks the
    # Python event loop, but every parse follows an awaited read of
    # the same file, so the loop turns between files and other
    # dashboard requests are not starved.
    _, files = await files.lookup_or_parse_filename(application)

    # Whether each unchanged file needs to be analyzed can be decided
    # now we know all the parsed files (which is a collection of both
    # known files that were changed and new files).
    #
    # First we start by generating an inverted dependency graph in
    # `dependents`, where for each unchanged file's dependencies we
    # store the files that depend on it.
    #
    # We also determine the seed of the unchanged files who's
    # immediate dependencies already determine that it needs to be
    # reanalyzed.
    dependents: dict[Path, list[Path]] = {}
    needs_reanalysis: set[Path] = set()

    # The digest of each external file met below, each file read
    # once however many analyses read it.
    external_digests: dict[str, Optional[Digest]] = {}

    for filename, file in files.unchanged.items():
        # Want to add all `dependency`'s to `dependents` so we need to
        # do this in its own separate loop because the other loop
        # breaks after finding a single reason that an unchanged file
        # needs to be reanalyzed.
        for dependency in file.dependencies.values():
            if dependency.HasField('filename'):
                dependents.setdefault(
                    Path(dependency.filename),
                    [],
                ).append(filename)

        for module_path, dependency in file.dependencies.items():
            if not files.matches(module_path, dependency):
                # `dependency` read in the last iteration does not
                # match with what was read in this iteration, so we
                # need to reanalyze this unchanged file.
                needs_reanalysis.add(filename)
                break

        if filename in needs_reanalysis:
            continue

        # The walk never finds a file outside every root, so each
        # one this file's analysis read is checked directly: read
        # and digested, a change seeding this file for reanalysis.
        # A file that can no longer be read digests as `None`,
        # which never equals a recorded digest, so it counts as
        # changed.
        for dependency in file.external:
            if dependency.filename not in external_digests:
                try:
                    external_digests[dependency.filename] = (
                        hashlib.sha256(await _read(Path(dependency.filename))
                                      ).digest()
                    )
                except OSError:
                    external_digests[dependency.filename] = None
            # Recorded from bytes actually read, so the digest is
            # always present.
            assert dependency.HasField('digest')
            if external_digests[dependency.filename] != dependency.digest:
                needs_reanalysis.add(filename)
                break

    # We now know which unchanged files need to be reanalyzed from
    # their direct dependencies, but what about all of the unchanged
    # files who still need to be reanalyzed even though their direct
    # dependencies do not? To find all of those unchanged files we
    # need to follow `dependents` out from the files already found,
    # since a file that needs to be reanalyzed makes every file
    # depending on it need reanalyzing too, however many imports
    # away. Said another way, we need to walk backward from all the
    # files in `needs_reanalysis` and add every file that depends on
    # it, and then every file that depends on those files, and so
    # forth and so on. We use `unprocessed` to continue this reverse
    # traversal so each file is processed exactly once until every
    # found file's dependents have been added.
    unprocessed = set(needs_reanalysis)
    while unprocessed:
        for dependent in dependents.get(unprocessed.pop(), []):
            if dependent not in needs_reanalysis:
                needs_reanalysis.add(dependent)
                unprocessed.add(dependent)

    # Each unchanged file is now decided: any that need to be
    # reanalyzed is read and parsed again, and the rest are just
    # returned as `unchanged`.
    unchanged: dict[Path, AnalyzedFile] = {}
    parsed = dict(files.parsed)
    for filename, file in files.unchanged.items():
        if filename in needs_reanalysis:
            # A file that cannot be read right now, possible if our
            # walk is racing with a concurrent file deletion, is not
            # added to either `known` oor `parsed`. This means it
            # won't get analyzed but that is okay because that same
            # deletion's event is already pending, so the next
            # iteration will start another walk and we'll converge
            # correctly.
            try:
                source = await _read(file.filename)
            except OSError:
                continue

            digest = hashlib.sha256(source).digest()

            parse = Parse.from_bytes(source)
            if parse is None:
                # Bytes that will not parse right now, possible if our
                # walk is racing with a concurrent modification to the
                # file that makes it invalid syntax, is not added to
                # either `known` or `parsed`. That concurrent
                # modification will be detected by our watch so the
                # next iteration will start another walk and we'll
                # converge correctly.
                continue

            parsed[filename] = ParsedFile(
                filename=file.filename,
                digest=digest,
                # Since this file was unchanged we just need the latest
                # filename + digest for its dependencies.
                dependencies=MappingProxyType(
                    {
                        module_path: files.dependencies[module_path]
                        for module_path in file.dependencies
                    }
                ),
                syntax=parse.syntax,
                text=parse.text,
            )
        else:
            unchanged[filename] = file

    return unchanged, parsed


async def _analyze(
    *,
    parsed: Mapping[Path, ParsedFile],
    pyright: Pyright,
    roots: Sequence[Path],
) -> dict[Path, AnalyzedFile]:
    """Returns what each file a walk read holds, keyed by the
    spelling `_standardized_path` returns, the way the walk keys
    everything.

    Whatever the walk parsed is analyzed, asking pyright as the
    analysis goes; whoever calls merges what comes back with the
    `unchanged` the walk returned, whose carried analyses still
    stand.

    `roots` are the walk's own, in the spelling `_standardized_path`
    returns: the directories the developer's code is under. A file
    the analysis reads outside all of them, such as an installed
    package's `_rbt` module, is recorded as a dependency of every
    file whose analysis read it, so that a change to it reanalyzes
    exactly those files.
    """
    analysis = Analysis(
        parsed=parsed,
        pyright=pyright,
        roots=tuple(roots),
        reads=MappingProxyType({}),
        helpers=MappingProxyType({}),
        external=MappingProxyType({}),
    )

    analyzed: dict[Path, AnalyzedFile] = {}

    # Analyzing is synchronous in this file's own work, so a file at
    # a time leaves the dashboard free to answer.
    async for filename in cooperatively(parsed):
        analyzed[filename], analysis = await _analyze_file(
            filename,
            analysis,
        )

    return analyzed


async def watch(
    context: WorkflowContext,
    *,
    application: Path,
    generated_directory: Optional[Path],
) -> None:
    """Returns only when the dashboard stops, recording the servicers
    in the developer's application for as long as it runs.

    `generated_directory` is where `rbt generate` writes Python code,
    which is where the state types the servicers service are defined.
    If `generated_directory` is `None` then no generated files are
    walked or watched, pyright resolves no `_rbt` module so we
    shouldn't ever find a servicer and thus the analysis won't return
    any."""
    application = _standardized_path(application)

    # Roots are compared, with `is_relative_to`, against filenames
    # kept in the spelling `_standardized_path` returns, and two
    # paths only compare when both are spelled the same way, so
    # they are standardized here, once, for the walk and the
    # analysis both. The application's own directory is what
    # running the application puts first on its path; the generated
    # directory is a root like any other: generated files are
    # walked and digested like the developer's own.
    roots = [application.parent]
    if generated_directory is not None:
        roots.append(_standardized_path(generated_directory))

    globs = [str(root / SOURCE_GLOB) for root in roots]

    # What a previous run recorded: starting from it, only files
    # that changed while the dashboard was down are parsed and
    # analyzed again, and an iteration that reproduces exactly what
    # the state already records writes nothing.
    state = await Implementation.ref().always().read(context)
    known = _reconstitute_known(state)

    with file_watcher() as watcher:
        async for iteration in context.loop('Watch the application'):
            # The watch is armed before anything is read, so a save
            # made during an iteration resolves `event` rather than
            # arriving while nothing is listening. A watch is
            # consumed by one event, so it is re-entered for each.
            #
            # The arming is also why a save landing mid-iteration is
            # safe. The iteration may record a torn snapshot -- one
            # file read before the save and another after -- but the
            # save's event is already waiting, so the next iteration
            # begins at once, and any file kept against a stale
            # dependency digest fails its check there and is analyzed
            # again.
            # A file outside every root is watched by its exact
            # path, so that a change to one, such as `pip`
            # upgrading an installed package, wakes an iteration
            # the way a save does. Rebuilt at every arming, so the
            # watched set follows what the analyses read.
            external_globs = sorted(
                {
                    dependency.filename
                    for file in known.values()
                    for dependency in file.external
                }
            )

            async with watcher.watch(globs + external_globs) as event:
                unchanged, parsed = await _walk(
                    application=application,
                    roots=roots,
                    known=known,
                )

                # A fresh pyright for every analysis, so that it
                # reads every file the way the disk has it right
                # now: generated code, installed packages and the
                # developer's own files alike, with nothing
                # remembered from an earlier iteration to go stale.
                # Rooted where the dashboard runs, which is the
                # developer's working directory, the one both the
                # application and the generated directory may be
                # given as relative to; a moved working directory
                # is re-rooted here by the next iteration.
                #
                # TODO: keep one pyright running across iterations
                # and send `workspace/didChangeWatchedFiles` built
                # from the generated files' fingerprint diff
                # instead of starting anew, sparing the start and
                # the cold analysis per iteration. That first takes
                # verifying that pyright does not ignore
                # notifications for files it never registered
                # watchers over, and accounting for the working
                # directory moving, which today is handled by every
                # iteration's fresh start being rooted at the
                # current directory and would again take a restart.
                pyright = Pyright()
                await pyright.start(
                    root=Path.cwd(),
                    paths=list(roots),
                )
                try:
                    analyzed = await _analyze(
                        parsed=parsed,
                        pyright=pyright,
                        roots=roots,
                    )
                finally:
                    await pyright.stop()

                known_now = {**unchanged, **analyzed}

                # Everything the state records, the servicers,
                # `needs_generate` and the files, is derived from
                # the analyzed files, so comparing those is
                # comparing all of it. A write wakes every browser
                # reading `Get`, so one is only made when they
                # differ.
                if known_now != known:
                    servicers = extract_and_sort_servicers(known_now)

                    # The file messages the write below records,
                    # built, along with `needs_generate`, before the
                    # write so that the state is not held open while
                    # the files are iterated. `needs_generate` is
                    # whether some file imports generated code that
                    # has no file: a dependency whose possible
                    # module path ends the way `rbt generate` names
                    # modules, recorded with no file at it, which is
                    # what tells the dashboard to suggest running
                    # `rbt generate`.
                    suffixes = tuple(
                        suffix.removesuffix('.py')
                        for suffix in GENERATED_SUFFIXES
                    )
                    needs_generate = False
                    files: dict[str, FileInfo] = {}
                    for filename, file in known_now.items():
                        if not needs_generate:
                            # Check if we need an `rbt generate` by
                            # seeing if this file depends on any thing
                            # that appears to be generated that we
                            # could not resolve under the roots or
                            # among the external files its analysis
                            # read.
                            needs_generate = any(
                                not dependency.HasField('filename') and os.path
                                .basename(module_path).endswith(suffixes) and
                                not _resolves_externally(
                                    module_path,
                                    file.external,
                                ) for module_path, dependency in
                                file.dependencies.items()
                            )
                        files[str(filename)] = FileInfo(
                            digest=file.digest,
                            dependencies=file.dependencies,
                            external=file.external,
                        )

                    async def record(state) -> None:
                        del state.servicers[:]
                        state.servicers.extend(servicers)
                        state.needs_generate = needs_generate

                        # A file that changes after this write is
                        # simply parsed again by a restarted walk,
                        # which its digest says.
                        state.files.clear()
                        for filename, file_info in files.items():
                            state.files[filename].CopyFrom(file_info)

                    await Implementation.ref().per_iteration(
                        'Record the servicers'
                    ).write(context, record)

                    known = known_now

                # `event` resolves when a `.py` file matching `globs`
                # (so under the roots or the generated directory), is
                # written, created, deleted, or renamed, e.g., the
                # developer saving a file in their editor or running
                # `rbt generate`, and that starts the next
                # iteration. The same iteration can be woken by
                # different changes on different runs: after a
                # dashboard restart this workflow replays from the top
                # and waits here on whatever change comes next, not on
                # the change the original run woke to. That is safe
                # because the event is only a wake-up: every decision
                # above, what to parse, what to record, is made by
                # reading the disk when the iteration runs, so an
                # iteration woken at a different moment records what
                # is true at that moment.
                await event
