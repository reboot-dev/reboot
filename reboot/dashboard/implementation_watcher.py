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

Where following stops is what makes this the developer's code rather
than somebody else's. A module resolves to a file only if a root or a
package holds it, and a file a package holds is read for what its
imports bound, and nothing else.

Read rather than imported, because importing an application means
having its generated code, its dependencies and its `sys.path`, and
the dashboard is meant to work before any of that exists. A file at a
time through `cooperatively`, so that the dashboard goes on answering
while a large application is read.

And driven by the filesystem, because that is what it is a function
of: where a state type is implemented can only change when the
developer's source changes, so an edit under the roots is what wakes
this, and nothing else does.
"""
import aiofiles
import aiofiles.os
import ast
import hashlib
import os
import sys
from dataclasses import dataclass, replace
from pathlib import Path
from rbt.dashboard.v1.dashboard_pb2 import ServicerInfo
from rbt.dashboard.v1.dashboard_rbt import Implementation
from reboot.aio.contexts import WorkflowContext
from reboot.aio.cooperatively import cooperatively
from reboot.cli.common.watch import file_watcher
from types import MappingProxyType
from typing import Iterator, Mapping, Optional, Sequence

# A SHA-256 digest -- of a file's bytes, or of a method's syntax --
# saying whether what was digested has changed.
Digest = bytes

GENERATED_SUFFIX = '_rbt'

# Suffixes of the files `rbt generate` writes. Named so that a chain
# of imports is never followed into generated code by reading it --
# the `_rbt` module name alone says what a name from one is.
GENERATED_SUFFIXES = ('_rbt.py', '_pb2.py', '_pb2_grpc.py')

# Every file the developer might have written a servicer in, which is
# the rule `rbt generate` and `rbt dev run` both use for source.
SOURCE_GLOB = '**/*.py'


def _roots(application: str) -> list[str]:
    """Returns the directories the developer's modules are found
    under, which is what running the application puts first on its
    path."""
    return [os.path.dirname(application)]


async def _read(filename: str) -> bytes:
    async with aiofiles.open(filename, 'rb') as file:
        return await file.read()


def _is_file_within_directory(*, filename: str, directory: str) -> bool:
    """Returns whether a file is inside a directory, by their
    absolute paths, so the answer does not depend on how either was
    spelled."""
    return Path(filename).absolute().is_relative_to(Path(directory).absolute())


@dataclass(frozen=True, kw_only=True)
class Imports:
    """What a file's imports bound each of its names to."""

    @dataclass(frozen=True, kw_only=True)
    class Symbol:
        """What `from x import y [as z]` binds a name to: `y` of
        module `x` -- which may itself turn out to be a module."""

        # The module it was imported from.
        module: str

        # Its name there, which the local name may differ from.
        name: str

    @dataclass(frozen=True, kw_only=True)
    class Module:
        """What `import x [as y]` binds a name to: module `x`
        itself."""

        module: str

    # By the name the file calls it. A top-level `Alias = Name` binds
    # the alias to whatever `Name` was bound to.
    bindings: Mapping[str, 'Import']

    # The modules star-imported -- which bind no name, and so are
    # searched, last to first, when no binding answers.
    stars: tuple[str, ...]

    # Every module these imports may have Python load: `import a.b.c`
    # loads `a.b.c`; `from x import y` loads `x`, and `x.y` too when
    # `y` is a module of its own; a star import loads its module.
    # Each is tried as a file under the roots, which is how the rest
    # of the application's files are found.
    may_load: tuple[str, ...]

    def try_resolve_module(self,
                           path: Sequence[str]) -> Optional[tuple[str, str]]:
        """Returns the module a dotted name refers into and the name
        it refers to there, and `None` when no binding answers --
        which leaves the star imports, whose files this cannot read.
        """
        head, *rest = path

        match self.bindings.get(head):
            case Imports.Symbol(module=module, name=name):
                if rest:
                    # Used dotted: the code treats it as a module,
                    # and is believed.
                    return _join(module, name, *rest[:-1]), rest[-1]
                return module, name

            case Imports.Module(module=module) if rest:
                # A module alone is never more than a module, so a
                # name bound to one refers to something only with
                # more components.
                return _join(module, *rest[:-1]), rest[-1]

        return None

    async def try_resolve_state_type(
        self,
        path: Sequence[str],
        *,
        analysis: 'Analysis',
        visiting: frozenset[str] = frozenset(),
    ) -> tuple[Optional[str], 'Analysis']:
        """Returns the state type a dotted name refers to, if
        following where these imports bound it from ends in generated
        code, and the analysis carried forward, since answering may
        read files.

        Every file read becomes a dependency of the analysis whether
        or not a state type was found: a "no" that read it depends on
        it just the same, since a change to it may turn the "no" into
        a "yes". `visiting` is the files already being read through,
        which is what stops a circular import.
        """
        resolved = self.try_resolve_module(path)

        if resolved is None:
            # The name may be any star-imported module's. The last
            # star import wins in Python, so they are searched last
            # to first -- each file's own imports answering for the
            # names it may define.
            for star in reversed(self.stars):
                found, files = await analysis.files.lookup_or_parse_module(
                    star, include_packages_in_roots=True, visiting=visiting
                )
                if found is None:
                    continue
                analysis = analysis.with_dependency(found, files=files)
                state_type, analysis = await found.imports.try_resolve_state_type(
                    path,
                    analysis=analysis,
                    visiting=visiting | {found.filename},
                )
                if state_type is not None:
                    return state_type, analysis
            return None, analysis

        module, attribute = resolved

        # The `_rbt` module name alone says what a name from one is:
        # `Account` from `bank.v1.account_rbt` is `bank.v1.Account`.
        if module.endswith(GENERATED_SUFFIX):
            # A relative import spells its module as a path, but a
            # state type's name is dotted. In a file
            # `backend/src/shop/cart/servicer.py`:
            #
            #   from ..v1 import shop_rbt
            #     module -> `backend/src/shop/v1/shop_rbt`
            #
            # `Shop` from that module must still be named
            # `shop.v1.Shop`, the same as if it had been imported
            # as `shop.v1.shop_rbt`. The dots come back by cutting
            # the root off the front of the path: cutting
            # `backend/src` leaves `shop/v1/shop_rbt`, and joining
            # its parts with dots gives `shop.v1.shop_rbt`. If no
            # root contains the path, there is no way to spell the
            # name, so there is no answer.
            if os.sep in module:
                module_path = Path(module).absolute()
                for root in [*analysis.files.roots, *analysis.files.packages]:
                    directory = Path(root).absolute()
                    if module_path.is_relative_to(directory):
                        dotted = '.'.join(
                            module_path.relative_to(directory).parts
                        )
                        return (
                            f"{dotted.rsplit('.', 1)[0]}.{attribute}",
                            analysis,
                        )
                return None, analysis
            return f"{module.rsplit('.', 1)[0]}.{attribute}", analysis

        found, files = await analysis.files.lookup_or_parse_module(
            module, include_packages_in_roots=True, visiting=visiting
        )
        if found is None:
            return None, analysis

        analysis = analysis.with_dependency(found, files=files)

        # The rest of the chain resolves against the followed file's
        # own imports: theirs to answer.
        return await found.imports.try_resolve_state_type(
            [attribute],
            analysis=analysis,
            visiting=visiting | {found.filename},
        )


# What one import bound a name to.
Import = Imports.Symbol | Imports.Module


def _imports(
    module: ast.Module, *, directory: Optional[str] = None
) -> Imports:
    """Returns what a file's imports bound each of its names to.

    Names come from every import, wherever it is written. One inside
    an `if` or a `try` binds its name just as one at the top of the
    file does, and guarding an import is common enough to be worth
    reading. `ast.walk` yields the shallowest first, so a name bound
    at the top of the file wins over one bound inside something.

    `directory` is where the file itself is, which is what a relative
    import is relative to; without it relative imports bind nothing.
    """
    bindings: dict[str, Import] = {}
    stars: list[str] = []
    may_load: list[str] = []

    for node in ast.walk(module):
        match node:
            case ast.Import(names=names):
                for alias in names:
                    may_load.append(alias.name)
                    if alias.asname is not None:
                        bindings.setdefault(
                            alias.asname,
                            Imports.Module(module=alias.name),
                        )
                    else:
                        # `import a.b` binds `a`, and `a.b.Shop` is
                        # reached from it a component at a time.
                        first = alias.name.split('.', 1)[0]
                        bindings.setdefault(
                            first, Imports.Module(module=first)
                        )

            case ast.ImportFrom(
                module=from_module, level=int(level), names=names
            ):
                # Having a `level` means we have to determine what
                # file Python might load. For example, in a file
                # `shop/cart/servicer.py`:
                #
                #   from shop.cart.types import Item
                #     level 0 -> `shop.cart.types`
                #   from .types import Item
                #     level 1 -> `shop/cart/types`
                #   from ..api import Item
                #     level 2 -> `shop/api`
                #   from .. import api
                #     level 2, no module -> `shop`
                #
                # `level` counts the leading dots. No dots: keep the
                # module as written. One dot: start from the file's
                # own directory. Each extra dot: climb one parent.
                # If a module comes after the dots, it goes under
                # that directory: `..api` is `shop` plus `api`, so
                # `shop/api`. A relative import can only be spelled
                # as a path, and without a `directory` the dots
                # point at nothing, so the import binds nothing.
                if level == 0:
                    if from_module is None:
                        continue
                    base = from_module
                elif directory is not None:
                    climbed = directory
                    for _ in range(level - 1):
                        climbed = os.path.dirname(climbed)
                    if from_module is None:
                        base = climbed
                    else:
                        base = os.path.join(climbed, *from_module.split('.'))
                else:
                    continue

                may_load.append(base)

                for alias in names:
                    if alias.name == '*':
                        stars.append(base)
                        continue
                    bindings.setdefault(
                        alias.asname or alias.name,
                        Imports.Symbol(module=base, name=alias.name),
                    )
                    # Since we cannot tell whether `y` in
                    # `from x import y` is a module of its own or a
                    # name defined in `x`, `x.y` may be loaded too.
                    # The guess is safe: a module only becomes a file
                    # if a root holds one by that name, so `x.y`
                    # naming something that is not a module resolves
                    # to nothing and is dropped.
                    may_load.append(_join(base, alias.name))

    # A top-level `Alias = Name` binds `Alias` to whatever `Name` was
    # bound to. In written order, so an alias of an alias resolves
    # too. After the imports, whose bindings are what an alias copies.
    for statement in module.body:
        match statement:
            case ast.Assign(
                targets=[ast.Name(id=str(target))],
                value=ast.Name(id=str(value)),
            ):
                if value in bindings:
                    bindings[target] = bindings[value]

    return Imports(
        bindings=MappingProxyType(bindings),
        stars=tuple(stars),
        may_load=tuple(may_load),
    )


async def _try_find_file_of(module: str, *,
                            roots: Sequence[str]) -> Optional[str]:
    """Returns the file a module names if one of `roots` contains it,
    and `None` otherwise.

    A module spelled as a path -- what a relative import resolved to
    -- is looked for where it already points. `None` is not a failure:
    the standard library and installed packages live outside every
    root, so `import asyncio` resolves to nothing and there is nothing
    to read.
    """
    if os.sep in module:
        candidates = [
            module + '.py',
            os.path.join(module, '__init__.py'),
        ]
    else:
        relative = module.replace('.', os.sep)
        candidates = [
            os.path.join(root, relative + suffix)
            for root in roots
            for suffix in ('.py', os.sep + '__init__.py')
        ]

    for candidate in candidates:
        if await aiofiles.os.path.isfile(candidate):
            return candidate

    return None


def _path(expression: ast.expr) -> Optional[list[str]]:
    """Returns the dotted name an expression spells -- `rbt.Shop` as
    `['rbt', 'Shop']` -- and `None` when it does not spell one."""
    match expression:
        case ast.Name(id=str(name)):
            return [name]
        case ast.Attribute(value=value, attr=str(attribute)):
            prefix = _path(value)
            if prefix is not None:
                return prefix + [attribute]

    return None


def _join(base: str, *parts: str) -> str:
    """Returns a module extended by more components, joined the way
    the module is spelled: with dots for a dotted name, as a path for
    a path."""
    if os.sep in base:
        return os.path.join(base, *parts)
    return '.'.join([base, *parts])


@dataclass(frozen=True, kw_only=True)
class ParsedFile:
    """What parsing one file said, before any name in it is
    resolved."""

    # The file this is, spelled the way the developer would open it.
    filename: str

    # Of the bytes the file held, saying whether parsing it again
    # would say anything new.
    digest: Digest

    # What the file's imports bound each of its names to.
    imports: Imports

    # The syntax itself, so that a file parsed while resolving names
    # is not parsed again when its own servicers are looked for.
    module: ast.Module


@dataclass(frozen=True, kw_only=True)
class File:
    """What analyzing one of the developer's files found."""

    # The file this is, spelled the way the developer would open it.
    filename: str

    # Of the bytes the file held, saying whether parsing it again
    # would say anything new.
    digest: Digest

    # What the file's imports bound each of its names to.
    imports: Imports

    # The files this file depends on, by the digest each had when it
    # was read. If any of them changes, this file needs reanalyzing.
    dependencies: Mapping[str, Digest]

    # Every servicer the file defines.
    servicers: tuple[ServicerInfo, ...]


@dataclass(frozen=True, kw_only=True)
class Files:
    """The developer's files, as far as one iteration of the watch
    has taken them.

    An iteration is one call to `files()`, which `watch` makes each
    time a save wakes it.

    Immutable: carrying the iteration forward means holding the one a
    method below returned.
    """

    # Where the developer's modules are found: the application's own
    # directory. What an iteration is allowed to analyze.
    roots: tuple[str, ...]

    # Where installed code is found: `sys.path`. Followed for what a
    # name refers to, never analyzed.
    packages: tuple[str, ...]

    # What the previous iteration analyzed, so a file unchanged
    # since is neither parsed nor analyzed again.
    known: Mapping[str, File]

    # Parsed this iteration, not yet analyzed.
    parsed: Mapping[str, ParsedFile]

    # Parsed this iteration from the packages: read for what their
    # imports bound, and nothing else -- never analyzed.
    parsed_from_packages: Mapping[str, ParsedFile]

    # Analyzed: this iteration, each servicer and method resolved
    # against bytes as they are on disk right now -- or a previous
    # one, verified unchanged. What an iteration returns.
    analyzed: Mapping[str, File]

    # Reached this iteration, imports not yet followed. The loop's
    # frontier: every file enters once, when it is parsed or kept,
    # and leaves once, handled.
    pending: frozenset[str]

    # The digest of every file read this iteration, by filename --
    # including files that joined no other map. What spares a second
    # read of the same bytes. The bytes themselves are not kept: they
    # are needed again only when a file changed and must be parsed,
    # which a save makes rare, and the parse path reads its own.
    digests: Mapping[str, Digest]

    @classmethod
    def create(
        cls,
        *,
        roots: Sequence[str],
        packages: Sequence[str],
        known: Mapping[str, File],
    ) -> 'Files':
        """Returns the files an iteration starts from: nothing
        parsed, nothing analyzed."""
        return cls(
            roots=tuple(roots),
            packages=tuple(packages),
            known=MappingProxyType(dict(known)),
            parsed=MappingProxyType({}),
            parsed_from_packages=MappingProxyType({}),
            analyzed=MappingProxyType({}),
            pending=frozenset(),
            digests=MappingProxyType({}),
        )

    def lookup(self, filename: str) -> Optional[ParsedFile | File]:
        """Returns what this iteration read for a file, wherever it
        lives -- `analyzed`, `parsed` or `parsed_from_packages` --
        and `None` when it has not read the file.

        By the file's absolute path, since a relative import spells
        a file one way and an absolute import another.
        """
        for entries in (self.analyzed, self.parsed, self.parsed_from_packages):
            entry = entries.get(filename)
            if entry is not None:
                return entry

        absolute = Path(filename).absolute()
        for entries in (self.analyzed, self.parsed, self.parsed_from_packages):
            for entry in entries.values():
                if Path(entry.filename).absolute() == absolute:
                    return entry

        return None

    def with_parsed_file(self, parsed: ParsedFile) -> 'Files':
        """Returns this with one more file parsed -- into `parsed`
        and onto the frontier when a root holds it, into
        `parsed_from_packages` otherwise."""
        if any(
            _is_file_within_directory(
                filename=parsed.filename, directory=root
            ) for root in self.roots
        ):
            return replace(
                self,
                parsed=MappingProxyType(
                    {
                        **self.parsed, parsed.filename: parsed
                    }
                ),
                pending=self.pending | {parsed.filename},
            )

        return replace(
            self,
            parsed_from_packages=MappingProxyType(
                {
                    **self.parsed_from_packages, parsed.filename: parsed
                }
            ),
        )

    def with_reused_known_file(self, file: File) -> 'Files':
        """Returns this with a file the previous iteration analyzed
        kept: verified unchanged, so analyzed as it was -- and onto
        the frontier, its imports still to follow."""
        return replace(
            self,
            analyzed=MappingProxyType({
                **self.analyzed, file.filename: file
            }),
            pending=self.pending | {file.filename},
        )

    def with_analyzed_file(
        self,
        filename: str,
        *,
        dependencies: Mapping[str, Digest],
        servicers: Sequence[ServicerInfo],
    ) -> 'Files':
        """Returns this with a file analyzed: a `File` built from
        its `parsed` entry and what analyzing it found, moved to
        `analyzed`."""
        parsed = self.parsed[filename]

        file = File(
            filename=parsed.filename,
            digest=parsed.digest,
            imports=parsed.imports,
            dependencies=MappingProxyType(dict(dependencies)),
            servicers=tuple(servicers),
        )

        parsed_files = dict(self.parsed)
        del parsed_files[filename]

        return replace(
            self,
            parsed=MappingProxyType(parsed_files),
            analyzed=MappingProxyType({
                **self.analyzed, filename: file
            }),
        )

    def without_pending_file(self, filename: str) -> 'Files':
        """Returns this with a file taken off the frontier: analyzed,
        and its imports followed."""
        return replace(self, pending=self.pending - {filename})

    def with_digest(self, filename: str, digest: Digest) -> 'Files':
        """Returns this with the digest of one read file recorded, so
        a later question about the same bytes is answered without the
        disk."""
        return replace(
            self,
            digests=MappingProxyType({
                **self.digests, filename: digest
            }),
        )

    async def needs_reanalyzing(self, file: File, *,
                                digest: Digest) -> tuple[bool, 'Files']:
        """Returns whether a file the previous iteration analyzed
        cannot be reused -- its bytes changed, or a file it depends
        on did, including one that can no longer be read at all --
        and this with every digest read to answer recorded.

        A dependency already read this iteration, reached or merely
        digested, is checked against the digest recorded for it, so
        answering never reads the same bytes twice.
        """
        if digest != file.digest:
            return True, self

        files = self

        for filename, previous_digest in file.dependencies.items():
            found = files.lookup(filename)
            if found is not None:
                if found.digest != previous_digest:
                    return True, files
                continue

            current = files.digests.get(filename)
            if current is None:
                try:
                    current = hashlib.sha256(await _read(filename)).digest()
                except OSError:
                    return True, files
                files = files.with_digest(filename, current)

            if current != previous_digest:
                return True, files

        return False, files

    async def lookup_or_parse_filename(
        self, filename: str
    ) -> tuple[Optional[ParsedFile | File], 'Files']:
        """Returns a file as this iteration has it -- looked up among
        what is already read, verified against the previous iteration
        when unchanged, and otherwise read and parsed, joining
        `parsed` or `parsed_from_packages` by who contains it.
        `None` when it cannot be read or will not parse.
        """
        found = self.lookup(filename)
        if found is not None:
            return found, self

        files = self
        source: Optional[bytes] = None

        digest = files.digests.get(filename)
        if digest is None:
            try:
                source = await _read(filename)
            except OSError:
                return None, files
            digest = hashlib.sha256(source).digest()
            files = files.with_digest(filename, digest)

        known = files.known.get(filename)
        if known is None:
            # A relative import spells a file one way and an absolute
            # import another, so the previous iteration is searched
            # by absolute path too.
            absolute = Path(filename).absolute()
            for file in files.known.values():
                if Path(file.filename).absolute() == absolute:
                    known = file
                    break
        if known is not None:
            reanalyze, files = await files.needs_reanalyzing(
                known, digest=digest
            )
            if not reanalyze:
                return known, files.with_reused_known_file(known)

        # Parsing needs the bytes, which a check that recorded only
        # the digest did not keep.
        if source is None:
            try:
                source = await _read(filename)
            except OSError:
                return None, files
            digest = hashlib.sha256(source).digest()
            files = files.with_digest(filename, digest)

        parsed = _parse(source, filename=filename, digest=digest)
        if parsed is None:
            return None, files

        return parsed, files.with_parsed_file(parsed)

    async def lookup_or_parse_module(
        self,
        module: str,
        *,
        include_packages_in_roots: bool = False,
        visiting: frozenset[str] = frozenset(),
    ) -> tuple[Optional[ParsedFile | File], 'Files']:
        """Returns the file a module names as this iteration has it,
        and `None` when no searched root contains the module, the
        module is generated -- its name alone says what a name from
        one is -- or reading it would circle back to a file already
        being read through. When it returns `None`, the files come
        back as they were: nothing found means nothing joined.

        With `include_packages_in_roots`, the packages are searched
        after the roots, which is how a name is followed into
        installed code.
        """
        roots: Sequence[str] = self.roots
        if include_packages_in_roots:
            roots = [*roots, *self.packages]

        filename = await _try_find_file_of(module, roots=roots)

        if filename is None or filename.endswith(GENERATED_SUFFIXES):
            return None, self

        if filename in visiting:
            return None, self

        return await self.lookup_or_parse_filename(filename)

    def imports(self, filename: str) -> Optional[Imports]:
        """Returns what a file's imports bound, wherever this
        iteration read the file."""
        found = self.lookup(filename)
        return found.imports if found is not None else None


def _parse(source: bytes, *, filename: str,
           digest: Digest) -> Optional[ParsedFile]:
    """Returns what parsing one file said, and `None` when it will
    not parse.

    A file that will not parse is left unrecorded rather than recorded
    as empty, so that the next iteration parses it again: half-written
    is the normal state of a file somebody is typing into.
    """
    try:
        module: ast.Module = ast.parse(source)
    except SyntaxError:
        return None

    return ParsedFile(
        filename=filename,
        digest=digest,
        imports=_imports(
            module, directory=os.path.dirname(os.path.abspath(filename))
        ),
        module=module,
    )


@dataclass(frozen=True, kw_only=True)
class Reference:
    """A name holding a reference to one of the developer's state
    types, such as `Account.ref(id)` was assigned to."""

    # The state type referred to, spelled as `StateTypeInfo.name`.
    state_type: str


@dataclass(frozen=True, kw_only=True)
class Context:
    """A name holding the context a method was called with."""


# What a name in a method body was found to hold. A name holding
# anything else is not here at all: what it holds is not something
# this can say.
Local = Reference | Context


def _statements(node: ast.AST) -> Iterator[ast.stmt]:
    """Returns every statement under a node, in the order written.

    Depth first, unlike `ast.walk`, which is breadth first and so
    would yield an assignment at the top of a method after one nested
    inside an `if` further down.
    """
    for child in ast.iter_child_nodes(node):
        if isinstance(child, ast.stmt):
            yield child
        yield from _statements(child)


@dataclass(frozen=True, kw_only=True)
class Call:
    """One Reboot call a method's body was found to make."""

    # The state type the call is made on, spelled as
    # `StateTypeInfo.name`.
    state_type: str

    # The method called, as the developer wrote it.
    method: str


@dataclass(frozen=True, kw_only=True)
class Analysis:
    """One file's analysis in flight: what it has found, what it has
    read, and the method it is thinking in.

    Born when a file's analysis starts, finished into `Files` when
    the file is done. Immutable: carrying the analysis forward means
    keeping the one a method below returned, so nobody else's copy is
    ever changed under them.
    """

    # The file being analyzed, whose imports are what names resolve
    # against. Moves while a chain of imports is followed, since the
    # rest of a chain resolves against each followed file's own
    # imports, and comes back when the chain answers.
    filename: str

    # The developer's files, read and grown as the analysis resolves
    # names, and handed back to the iteration when the file is done.
    files: Files

    # The files the analysis's answers depend on, as read so far, by
    # the digest each had. If any of them changes, the file needs
    # analyzing again.
    dependencies: Mapping[str, Digest]

    # The state type the class being analyzed services, which is what
    # `self.ref()` refers to. `None` outside a servicer.
    state_type: Optional[str]

    # The Reboot calls the method being analyzed makes, in the order
    # met. Folded into the method's entry when the method is
    # recorded.
    calls: tuple[Call, ...]

    # What was met that the analysis does not follow, spelled the way
    # it was written, so whoever reads the calls can be told they are
    # likely incomplete rather than left to trust them.
    unsupported: tuple[str, ...]

    # What each of the method's names is bound to at the point the
    # analysis has reached. The working state the analysis thinks
    # with, dropped when the method is recorded. A
    # `MappingProxyType`, so writing into it raises rather than
    # quietly leaking.
    locals: Mapping[str, Local]

    @classmethod
    def create(cls, *, filename: str, files: Files) -> 'Analysis':
        """Returns the analysis a file starts from: nothing found,
        nothing read, no method begun."""
        return cls(
            filename=filename,
            files=files,
            dependencies=MappingProxyType({}),
            state_type=None,
            calls=(),
            unsupported=(),
            locals=MappingProxyType({}),
        )

    def imports(self) -> Imports:
        """Returns what the method's file's imports bound."""
        imports = self.files.imports(self.filename)
        assert imports is not None
        return imports

    def with_dependency(
        self, found: ParsedFile | File, *, files: Files
    ) -> 'Analysis':
        """Returns this analysis depending on one more file: the
        digest it was read with recorded, and the files grown by
        reading it carried forward."""
        return replace(
            self,
            dependencies=MappingProxyType(
                {
                    **self.dependencies, found.filename: found.digest
                }
            ),
            files=files,
        )

    def with_state_type(self, state_type: str) -> 'Analysis':
        """Returns this analysis inside a class servicing a state
        type: what `self.ref()` refers to until the class ends."""
        return replace(self, state_type=state_type)

    def with_method_reset(self) -> 'Analysis':
        """Returns this analysis with the method reset -- its calls,
        unsupported and locals cleared -- ready for the next
        method."""
        return replace(
            self,
            calls=(),
            unsupported=(),
            locals=MappingProxyType({}),
        )

    def with_local(self, name: str, local: Optional[Local]) -> 'Analysis':
        """Returns this analysis with `name` bound to `local`, or
        bound to nothing when `local` is `None` -- which is how a
        name assigned something the analysis cannot say stops being
        bound."""
        locals = dict(self.locals)

        if local is None:
            locals.pop(name, None)
        else:
            locals[name] = local

        return replace(self, locals=MappingProxyType(locals))

    def with_unsupported(self, unsupported: ast.AST) -> 'Analysis':
        """Returns this analysis with a piece of syntax recorded as
        unsupported, spelled the way it was written."""
        return replace(
            self,
            unsupported=self.unsupported + (ast.unparse(unsupported),),
        )


async def _state_type_if_servicer(
    class_definition: ast.ClassDef,
    *,
    analysis: Analysis,
) -> tuple[Optional[str], Analysis]:
    """Returns the state type a class services, if it says so, and
    the analysis carried forward, since answering may read files.

    A servicer says it by what it inherits: `Account.Servicer`, or
    `Account.singleton.Servicer` for a singleton, with `Account`
    reached by any dotted name that refers to a state type.
    """
    for base in class_definition.bases:
        match base:
            case ast.Attribute(value=value, attr='Servicer'):
                path = _path(value)
                if path is None:
                    continue
                if len(path) > 1 and path[-1] == 'singleton':
                    path = path[:-1]
                state_type, analysis = await analysis.imports(
                ).try_resolve_state_type(path, analysis=analysis)
                if state_type is not None:
                    return state_type, analysis

    return None, analysis


async def _reboot_related(expression: ast.expr, *,
                          analysis: Analysis) -> tuple[bool, Analysis]:
    """Returns whether anything in an expression touches something
    Reboot related -- a `.ref` however it is reached, a name holding
    a reference or the context, or a name that refers to a state type
    -- and the analysis carried forward, since answering may read
    files.

    What ordinary Python does is never Reboot related, however little
    of it the analysis follows; this is what keeps the unsupported
    list evidence rather than noise.
    """
    for node in ast.walk(expression):
        match node:
            case ast.Attribute(attr='ref'):
                return True, analysis
            case ast.Name(id=str(name)):
                if name in analysis.locals:
                    return True, analysis
                state_type, analysis = await analysis.imports(
                ).try_resolve_state_type([name], analysis=analysis)
                if state_type is not None:
                    return True, analysis

    return False, analysis


async def _evaluate(expression: ast.expr, *,
                    analysis: Analysis) -> tuple[Optional[Local], Analysis]:
    """Returns what an expression evaluates to, in the only terms the
    analysis knows -- a reference to a state type, or the context --
    and the analysis carried forward. `None` for the value, which is
    most expressions, means neither, so nothing can be said about a
    name it is assigned to or a call made on it.
    """
    match expression:
        case ast.Await(value=value):
            # Awaiting evaluates to what was awaited.
            return await _evaluate(value, analysis=analysis)

        case ast.Call(
            func=ast.Attribute(value=ast.Name(id='self'), attr='ref')
        ) if analysis.state_type is not None:
            # A servicer reaching the state it is servicing. Matched
            # before `Account.ref(id)` below, which would otherwise
            # match this too and find that `self` refers to no state
            # type.
            return Reference(state_type=analysis.state_type), analysis

        case ast.Call(func=ast.Attribute(value=receiver, attr='ref')):
            # `Account.ref(id)`, or `rbt.Shop.ref(id)` through a
            # module, the one way to name an existing state -- unless
            # the name refers to no state type, which falls through
            # to be flagged below: a `.ref` on something unresolvable
            # is almost certainly a reference being lost.
            path = _path(receiver)
            if path is not None:
                state_type, analysis = await analysis.imports(
                ).try_resolve_state_type(path, analysis=analysis)
                if state_type is not None:
                    return Reference(state_type=state_type), analysis

        case ast.Name(id=str(name)) if name in analysis.locals:
            # `another = account`, holding whatever `account` holds.
            return analysis.locals[name], analysis

    # Nothing this evaluates. Said out loud when the expression
    # touches something Reboot related -- whatever it does with it is
    # not followed, so the calls are likely incomplete -- and left
    # alone when it is ordinary Python, which was never claimed.
    related, analysis = await _reboot_related(expression, analysis=analysis)
    if related:
        analysis = analysis.with_unsupported(expression)

    return None, analysis


async def _assign(
    assign: ast.Assign | ast.AnnAssign | ast.AugAssign,
    *,
    analysis: Analysis,
) -> Analysis:
    """Returns the analysis carried past an assignment: each plain
    name bound, and an assignment with a target this cannot bind
    recorded as unsupported.

    A plain name is bound to what the value evaluates to, or stops
    being held when that is nothing -- which is what every augmented
    assignment does, since `x += y` makes `x` hold something no name
    was ever bound to. A bare annotation binds nothing. Any other
    target -- unpacked into a tuple, stored on an attribute or a
    subscript -- is not followed; every name inside one stops being
    held, since whatever it held before is no longer what it holds.
    """
    targets: list[ast.expr]
    value: Optional[ast.expr]

    match assign:
        case ast.Assign():
            targets = assign.targets
            value = assign.value
        case ast.AnnAssign():
            if assign.value is None:
                # A bare annotation binds nothing.
                return analysis
            targets = [assign.target]
            value = assign.value
        case ast.AugAssign():
            targets = [assign.target]
            value = None

    local: Optional[Local] = None

    if value is not None:
        local, analysis = await _evaluate(value, analysis=analysis)

    for target in targets:
        match target:
            case ast.Name(id=str(name)):
                analysis = analysis.with_local(name, local)
            case _:
                # A target this cannot bind: unpacked into a tuple,
                # stored on an attribute or a subscript. The names
                # inside it were assigned something all the same, so
                # each stops holding whatever it held before.
                for node in ast.walk(target):
                    match node:
                        case ast.Name(id=str(name)):
                            # `account` in `account, _ = ...`.
                            analysis = analysis.with_local(name, None)
                analysis = analysis.with_unsupported(assign)

    return analysis


async def _analyze_method(
    method: ast.FunctionDef | ast.AsyncFunctionDef,
    *,
    analysis: Analysis,
) -> Analysis:
    """Returns the analysis carried through one method's body, the
    Reboot calls it makes found in the order met.

    Statements are visited in the order written, saying what each
    name holds before moving to the next, so that when a call is met
    the name it is made through resolves to whatever it held at that
    point in the body. Tracking the names is not a result of its own;
    it is what makes a call through `account` mean a call on
    `bank.v1.Account`.

    The method's context is held first, from the parameter after
    `self`. A name assigned twice holds what it was assigned last,
    and one assigned something this cannot follow stops being held at
    all.

    A name is not a variable in any one scope: a comprehension or a
    nested function binds names of its own, and they are all taken
    together. Reboot code does not usually reuse a name for a
    reference and something else, and taking them together is what
    lets a reference reach a nested function that uses it.
    """
    # `self` first, then the context; a `@classmethod` takes `cls`
    # in its place, and a workflow or a task takes the context the
    # same way.
    arguments = method.args.posonlyargs + method.args.args

    if len(arguments) > 1 and arguments[0].arg in ('self', 'cls'):
        analysis = analysis.with_local(arguments[1].arg, Context())

    for statement in _statements(method):
        # TODO: Record the calls this statement makes, through what
        # each name holds right now -- before what it assigns is
        # bound, since a statement's value runs before its target.

        match statement:
            case ast.Assign() | ast.AnnAssign() | ast.AugAssign():
                analysis = await _assign(statement, analysis=analysis)

    return analysis


def _digest(node: ast.AST) -> Digest:
    """Returns a digest of what a piece of syntax says.

    The digest is computed using `ast.dump` without attributes so that
    the lines and columns are left out, and thus a comment added above
    a method or arguments rewrapped across lines do not change the
    digest.
    """
    return hashlib.sha256(ast.dump(node,
                                   include_attributes=False).encode()).digest()


async def _analyze_file(filename: str, files: Files) -> Files:
    """Returns the iteration carried past analyzing one `pending`
    file: every class saying what it services recorded, every method
    those classes define analyzed and recorded under them, and the
    file finished into `analyzed` with the files the analysis read
    depended on.

    One `Analysis` is carried through the whole file: the
    dependencies it accumulates are the file's, while the method
    resets as each one is recorded.
    """
    parsed = files.parsed[filename]

    analysis = Analysis.create(filename=filename, files=files)

    servicers: list[ServicerInfo] = []

    for node in ast.walk(parsed.module):
        match node:
            case ast.ClassDef():
                state_type, analysis = await _state_type_if_servicer(
                    node, analysis=analysis
                )
                if state_type is None:
                    continue
                servicer = ServicerInfo(state_type=state_type, file=filename)
                analysis = analysis.with_state_type(state_type)
                for statement in node.body:
                    match statement:
                        case (
                            ast.FunctionDef(name=str(name)) |
                            ast.AsyncFunctionDef(name=str(name))
                        ):
                            analysis = await _analyze_method(
                                statement, analysis=analysis
                            )
                            servicer.methods.append(
                                ServicerInfo.Method(
                                    name=name, digest=_digest(statement)
                                )
                            )
                            # Calls and unsupported fold in here once
                            # the proto has fields for them.
                            analysis = analysis.with_method_reset()
                servicers.append(servicer)

    return analysis.files.with_analyzed_file(
        filename,
        dependencies=dict(analysis.dependencies),
        servicers=servicers,
    )


def servicers(files: Mapping[str, File]) -> list[ServicerInfo]:
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


async def analyze(
    *,
    application: str,
    roots: Optional[Sequence[str]] = None,
    packages: Optional[Sequence[str]] = None,
    known: Optional[Mapping[str, File]] = None,
) -> dict[str, File]:
    """Returns what each file the developer's application reaches
    holds, keyed by the file, spelled the way they would open it.

    Only what it reaches: a file that has stopped being imported is
    absent, however recently it changed, and one that has started
    being imported is parsed for the first time.

    `known` is what a previous call returned, and spares this one
    from parsing and analyzing a file that has not changed since --
    neither in its own bytes nor in any file it depends on.

    `roots` are the directories a module may be found under, which is
    both how a module name becomes a file and where the developer's
    code is taken to end. It defaults to the application's own
    directory, which is what running the application puts first on its
    path. `packages` are directories installed code may be found
    under; a name is followed through them to the state type it
    refers to, but they are never analyzed.
    """
    if roots is None:
        roots = _roots(application)

    files = Files.create(
        roots=roots, packages=packages or [], known=known or {}
    )

    _, files = await files.lookup_or_parse_filename(application)

    while len(files.pending) > 0:
        # Parsing and analyzing hold on to the interpreter for as
        # long as they take, so a file at a time leaves the dashboard
        # free to answer.
        async for filename in cooperatively(files.pending):
            match files.parsed.get(filename):
                case ParsedFile():
                    files = await _analyze_file(filename, files)
                case None:
                    # Nothing to analyze: the file was kept because
                    # neither its bytes nor any of its dependencies
                    # changed, so the analysis it got when it last
                    # changed still stands, in `analyzed` already.
                    pass

            files = files.without_pending_file(filename)

            # Following the file's imports is how the rest of the
            # application is reached.
            imports = files.imports(filename)
            assert imports is not None

            for module in imports.may_load:
                _, files = await files.lookup_or_parse_module(module)

    return dict(files.analyzed)


async def watch(context: WorkflowContext, *, application: str) -> None:
    """Returns only when the dashboard stops, recording the servicers
    in the developer's application for as long as it runs."""
    roots = _roots(application)
    globs = [os.path.join(root, SOURCE_GLOB) for root in roots]

    # Where installed code may be found: this process runs in the
    # developer's environment, so its own path is theirs. A name is
    # followed through these to the state type it refers to -- the
    # std library re-exports its state types from plain modules --
    # but they are never analyzed or watched. A change to installed
    # code, such as a `pip install` while the dashboard runs, is
    # noticed on the next save under the roots, when the digests
    # recorded for package files no longer match; watching the
    # packages themselves would notice it immediately, and may be
    # worth doing someday.
    packages = [path for path in sys.path if path and os.path.isdir(path)]

    recorded: Optional[list[ServicerInfo]] = None
    known: dict[str, File] = {}

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
            async with watcher.watch(globs) as event:
                known = await analyze(
                    application=application,
                    roots=roots,
                    packages=packages,
                    known=known,
                )

                found = servicers(known)

                # Most edits change no servicer, and a write wakes
                # every browser reading `Get`, so one is only worth
                # making when the answer is different.
                if found != recorded:

                    async def record(state) -> None:
                        del state.servicers[:]
                        state.servicers.extend(found)

                    # Written inline rather than through a method of
                    # its own: the workflow runs on this very state.
                    await Implementation.ref().per_iteration(
                        'Record the servicers'
                    ).write(context, record)

                    # After the write, so that what is remembered is
                    # what was recorded and not what was about to be.
                    recorded = found

                # Which save wakes this, and when, is not
                # deterministic, and a replay may wait on a different
                # one. Nothing depends on that: an iteration parses
                # whatever has changed since the last and writes what
                # it finds, so one that runs at a different moment
                # writes the same answer or a newer one.
                await event
