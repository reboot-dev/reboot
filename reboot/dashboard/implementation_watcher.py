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
than somebody else's. A module resolves to a file only if a root
holds it, so an import of an installed package leads nowhere.

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
import ast
import hashlib
import os
from dataclasses import dataclass, replace
from pathlib import Path
from rbt.dashboard.v1.dashboard_pb2 import ServicerInfo
from rbt.dashboard.v1.dashboard_rbt import Implementation
from reboot.aio.contexts import WorkflowContext
from reboot.aio.cooperatively import cooperatively
from reboot.cli.common.watch import file_watcher
from types import MappingProxyType
from typing import Mapping, Optional, Sequence

# A SHA-256 digest -- of a file's bytes, or of a method's syntax --
# saying whether what was digested has changed.
Digest = bytes

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


def _read(filename: str) -> bytes:
    with open(filename, 'rb') as file:
        return file.read()


@dataclass(frozen=True, kw_only=True)
class Imports:
    """What a file's imports may make Python load."""

    # Every module these imports may have Python load: `import a.b.c`
    # loads `a.b.c`; `from x import y` loads `x`, and `x.y` too when
    # `y` is a module of its own; a star import loads its module.
    # Each is tried as a file under the roots, which is how the rest
    # of the application's files are found.
    may_load: tuple[str, ...]


def _imports(
    module: ast.Module, *, directory: Optional[str] = None
) -> Imports:
    """Returns every module a file's imports may make Python load.

    Modules come from every import, wherever it is written. One
    inside an `if` or a `try` loads its module just as one at the
    top of the file does, and guarding an import is common enough to
    be worth reading.

    `directory` is where the file itself is, which is what a relative
    import is relative to; without it relative imports load nothing.
    """
    may_load: list[str] = []

    for node in ast.walk(module):
        match node:
            case ast.Import(names=names):
                may_load.extend(alias.name for alias in names)

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
                        # A star import loads only its module, which
                        # is already listed.
                        continue
                    # Since we cannot tell whether `y` in
                    # `from x import y` is a module of its own or a
                    # name defined in `x`, `x.y` may be loaded too.
                    # The guess is safe: a module only becomes a file
                    # if a root holds one by that name, so `x.y`
                    # naming something that is not a module resolves
                    # to nothing and is dropped.
                    may_load.append(_join(base, alias.name))

    return Imports(may_load=tuple(may_load))


def _try_find_file_of(module: str, *, roots: Sequence[str]) -> Optional[str]:
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
        if os.path.isfile(candidate):
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

    # What the previous iteration analyzed, so a file unchanged
    # since is neither parsed nor analyzed again.
    known: Mapping[str, File]

    # Parsed this iteration, not yet analyzed.
    parsed: Mapping[str, ParsedFile]

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
        known: Mapping[str, File],
    ) -> 'Files':
        """Returns the files an iteration starts from: nothing
        parsed, nothing analyzed."""
        return cls(
            roots=tuple(roots),
            known=MappingProxyType(dict(known)),
            parsed=MappingProxyType({}),
            analyzed=MappingProxyType({}),
            pending=frozenset(),
            digests=MappingProxyType({}),
        )

    def lookup(self, filename: str) -> Optional[ParsedFile | File]:
        """Returns what this iteration read for a file, wherever it
        lives -- `analyzed` or `parsed` -- and `None` when it has
        not read the file.

        By the file's absolute path, since a relative import spells
        a file one way and an absolute import another.
        """
        for entries in (self.analyzed, self.parsed):
            entry = entries.get(filename)
            if entry is not None:
                return entry

        absolute = Path(filename).absolute()
        for entries in (self.analyzed, self.parsed):
            for entry in entries.values():
                if Path(entry.filename).absolute() == absolute:
                    return entry

        return None

    def with_parsed_file(self, parsed: ParsedFile) -> 'Files':
        """Returns this with one more file parsed, into `parsed` and
        onto the frontier."""
        return replace(
            self,
            parsed=MappingProxyType({
                **self.parsed, parsed.filename: parsed
            }),
            pending=self.pending | {parsed.filename},
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

    def needs_reanalyzing(self, file: File, *,
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
                    current = hashlib.sha256(_read(filename)).digest()
                except OSError:
                    return True, files
                files = files.with_digest(filename, current)

            if current != previous_digest:
                return True, files

        return False, files

    def lookup_or_parse_filename(
        self, filename: str
    ) -> tuple[Optional[ParsedFile | File], 'Files']:
        """Returns a file as this iteration has it -- looked up among
        what is already read, verified against the previous iteration
        when unchanged, and otherwise read and parsed, joining
        `parsed`. `None` when it cannot be read or will not parse.
        """
        found = self.lookup(filename)
        if found is not None:
            return found, self

        files = self
        source: Optional[bytes] = None

        digest = files.digests.get(filename)
        if digest is None:
            try:
                source = _read(filename)
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
            reanalyze, files = files.needs_reanalyzing(known, digest=digest)
            if not reanalyze:
                return known, files.with_reused_known_file(known)

        # Parsing needs the bytes, which a check that recorded only
        # the digest did not keep.
        if source is None:
            try:
                source = _read(filename)
            except OSError:
                return None, files
            digest = hashlib.sha256(source).digest()
            files = files.with_digest(filename, digest)

        parsed = _parse(source, filename=filename, digest=digest)
        if parsed is None:
            return None, files

        return parsed, files.with_parsed_file(parsed)

    def lookup_or_parse_module(
        self, module: str
    ) -> tuple[Optional[ParsedFile | File], 'Files']:
        """Returns the file a module names as this iteration has it,
        and `None` when no root contains the module or the module is
        generated, which its name alone says. When it returns `None`,
        the files come back as they were: nothing found means
        nothing joined.
        """
        filename = _try_find_file_of(module, roots=self.roots)

        if filename is None or filename.endswith(GENERATED_SUFFIXES):
            return None, self

        return self.lookup_or_parse_filename(filename)

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
class Analysis:
    """One file's analysis in flight: what it has found, what it has
    read, and the calls of the method it is inside.

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

    @classmethod
    def create(cls, *, filename: str, files: Files) -> 'Analysis':
        """Returns the analysis a file starts from: nothing found,
        nothing read, no method begun."""
        return cls(
            filename=filename,
            files=files,
            dependencies=MappingProxyType({}),
        )

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


def _state_type_if_servicer(
    class_definition: ast.ClassDef,
) -> Optional[str]:
    """Returns the state type a class services, spelled the way the
    developer wrote it, and `None` when the class services nothing.

    A servicer says it by what it inherits: any dotted name ending
    in `.Servicer`, such as `Account.Servicer`, `rbt.Shop.Servicer`,
    or `Account.singleton.Servicer` for a singleton. Which state
    type the name in front refers to exactly takes type information,
    so it is recorded as written.
    """
    for base in class_definition.bases:
        match base:
            case ast.Attribute(value=value, attr='Servicer'):
                path = _path(value)
                if path is None:
                    continue
                if len(path) > 1 and path[-1] == 'singleton':
                    path = path[:-1]
                return '.'.join(path)

    return None


def _digest(node: ast.AST) -> Digest:
    """Returns a digest of what a piece of syntax says.

    The digest is computed using `ast.dump` without attributes so that
    the lines and columns are left out, and thus a comment added above
    a method or arguments rewrapped across lines do not change the
    digest.
    """
    return hashlib.sha256(ast.dump(node,
                                   include_attributes=False).encode()).digest()


def _depend_on_imports(parsed: ParsedFile, *, analysis: Analysis) -> Analysis:
    """Returns the analysis depending on the file behind every one
    of the file's imports: those are the files that can change what
    this one means. Each is read one hop, only for the digest
    recorded.

    For now every import is taken as used: tools like `ruff` keep
    unused imports out of real code, so checking which names are
    used would narrow little, and it can be narrowed later if this
    proves too eager."""
    for module in dict.fromkeys(parsed.imports.may_load):
        found, files = analysis.files.lookup_or_parse_module(module)
        if found is None:
            continue
        analysis = analysis.with_dependency(found, files=files)

    return analysis


def _analyze_file(filename: str, files: Files) -> Files:
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

    analysis = _depend_on_imports(parsed, analysis=analysis)

    servicers: list[ServicerInfo] = []

    for node in ast.walk(parsed.module):
        match node:
            case ast.ClassDef():
                state_type = _state_type_if_servicer(node)
                if state_type is None:
                    continue
                servicer = ServicerInfo(state_type=state_type, file=filename)
                for statement in node.body:
                    match statement:
                        case (
                            ast.FunctionDef(name=str(name)) |
                            ast.AsyncFunctionDef(name=str(name))
                        ):
                            servicer.methods.append(
                                ServicerInfo.Method(
                                    name=name, digest=_digest(statement)
                                )
                            )
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
    path.
    """
    if roots is None:
        roots = _roots(application)

    files = Files.create(roots=roots, known=known or {})

    _, files = files.lookup_or_parse_filename(application)

    while len(files.pending) > 0:
        # Parsing and analyzing hold on to the interpreter for as
        # long as they take, so a file at a time leaves the dashboard
        # free to answer.
        async for filename in cooperatively(files.pending):
            match files.parsed.get(filename):
                case ParsedFile():
                    files = _analyze_file(filename, files)
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
                _, files = files.lookup_or_parse_module(module)

    return dict(files.analyzed)


async def watch(context: WorkflowContext, *, application: str) -> None:
    """Returns only when the dashboard stops, recording the servicers
    in the developer's application for as long as it runs."""
    roots = _roots(application)
    globs = [os.path.join(root, SOURCE_GLOB) for root in roots]

    recorded: Optional[list[ServicerInfo]] = None
    known: dict[str, File] = {}

    with file_watcher() as watcher:
        async for iteration in context.loop('Watch the application'):
            # The watch is armed before anything is read, so a save
            # made during an iteration resolves `event` rather than
            # arriving while nothing is listening. A watch is
            # consumed by one event, so it is re-entered for each.
            async with watcher.watch(globs) as event:
                known = await analyze(
                    application=application, roots=roots, known=known
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
