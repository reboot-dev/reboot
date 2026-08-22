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
class extends: a servicer is a class with a base whose definition
leads into a file `rbt generate` wrote, and the state type is the
name the generator writes there as `__state_type_name__`. Until
`rbt generate` has written it, the base resolves to nothing, and the
servicer waits unrecorded; `generated` is what tells the dashboard to
suggest running it.

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
import asyncio
import hashlib
import io
import os
import tokenize
from dataclasses import dataclass, replace
from pathlib import Path
from rbt.dashboard.v1.dashboard_pb2 import ServicerInfo
from rbt.dashboard.v1.dashboard_rbt import Implementation
from reboot.aio.contexts import WorkflowContext
from reboot.aio.cooperatively import cooperatively
from reboot.cli.common.watch import file_watcher
from reboot.dashboard.pyright import Pyright
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


def _roots(application: Path) -> list[Path]:
    """Returns the directories the developer's modules are found
    under, which is what running the application puts first on its
    path."""
    return [application.parent]


async def _read(filename: Path) -> bytes:
    async with aiofiles.open(filename, 'rb') as file:
        return await file.read()


def _imports(
    syntax: ast.Module,
    *,
    directory: Optional[Path] = None,
) -> tuple[str, ...]:
    """Returns every module a file's imports may make Python load:
    `import a.b.c` loads `a.b.c`; `from x import y` loads `x`, and
    `x.y` too when `y` is a module of its own; a star import loads
    its module. Each is tried as a file under the roots, which is how
    the rest of the application's files are found.

    Modules come from every import, wherever it is written. One
    inside an `if` or a `try` loads its module just as one at the
    top of the file does, and guarding an import is common enough to
    be worth reading.

    `directory` is where the file itself is, which is what a relative
    import is relative to; without it relative imports load nothing.
    """
    imports: list[str] = []

    for node in ast.walk(syntax):
        match node:
            case ast.Import(names=names):
                imports.extend(alias.name for alias in names)

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
                        climbed = climbed.parent
                    if from_module is None:
                        base = str(climbed)
                    else:
                        base = str(climbed.joinpath(*from_module.split('.')))
                else:
                    continue

                imports.append(base)

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
                    imports.append(_join(base, alias.name))

    return tuple(imports)


async def _try_find_file_of(
    module: str,
    *,
    roots: Sequence[Path],
) -> Optional[Path]:
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
            Path(module + '.py'),
            Path(module) / '__init__.py',
        ]
    else:
        relative = module.replace('.', os.sep)
        candidates = [
            root / (relative + suffix)
            for root in roots
            for suffix in ('.py', os.sep + '__init__.py')
        ]

    for candidate in candidates:
        if await aiofiles.os.path.isfile(candidate):
            return candidate

    return None


def _join(base: str, *parts: str) -> str:
    """Returns a module extended by more components, joined the way
    the module is spelled: with dots for a dotted name, as a path for
    a path."""
    if os.sep in base:
        return os.path.join(base, *parts)
    return '.'.join([base, *parts])


@dataclass(frozen=True, kw_only=True)
class Dependency:
    """What one of a file's imports observed when the file was
    analyzed."""

    # The file the module resolved to, or `None` when no file could be
    # found or it was outside the roots (e.g., installed or
    # generated). Note that we don't look for files outside of the
    # roots so failing to find a file doesn't necessarily mean that
    # the file is outside of the roots, it might be that the file just
    # hasn't been crated yet but will be shortly.
    filename: Optional[Path]

    # The digest of the bytes `filename` was read with, or `None` if
    # `filename` is `None` or the file could not be read.
    digest: Optional[Digest]


@dataclass(frozen=True, kw_only=True)
class ParsedFile:
    """What parsing one file said, before any name in it is
    resolved."""

    # The file this is, resolved: the one spelling every route to
    # the file, a relative import, an absolute one, or a symlink,
    # arrives at.
    filename: Path

    # Of the bytes the file held, saying whether parsing it again
    # would say anything new.
    digest: Digest

    # What each import observed, keyed by the module as the import
    # spells it, recorded as the parse follows them depth first.
    # What this file's analysis leans on, and what later says whether
    # a carried analysis can still be trusted: a change in what a
    # module resolves to, or in the resolved file's bytes, is what
    # calls for reanalyzing.
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

    # The file this is, resolved: the one spelling every route to
    # the file, a relative import, an absolute one, or a symlink,
    # arrives at.
    filename: Path

    # Of the bytes the file held, saying whether parsing it again
    # would say anything new.
    digest: Digest

    # What each import observed when this file was analyzed, keyed
    # by the module as the import spells it. A change in what a
    # module resolves to, or in the resolved file's bytes, is what
    # calls for reanalyzing this file.
    dependencies: Mapping[str, Dependency]

    # Every servicer the file defines, resolved: which state type each
    # services and the calls each method makes.
    servicers: tuple[ServicerInfo, ...]


@dataclass(frozen=True, kw_only=True)
class Files:
    """The developer's files, as far as one iteration of the watch
    has taken them.

    An iteration is one call to `walk`, which `watch` makes each
    time a save wakes it.

    Immutable: carrying the iteration forward means holding the one a
    method below returned.
    """

    # Where the developer's modules are found: the application's own
    # directory. What an iteration is allowed to analyze.
    roots: tuple[Path, ...]

    # What the previous iteration analyzed, keyed by resolved path,
    # so that a relative import's spelling of a file and an absolute
    # import's find the same record. A file unchanged since is
    # neither parsed nor analyzed again.
    known: Mapping[Path, AnalyzedFile]

    # Parsed this iteration, not yet analyzed. Keyed by resolved
    # path, like every map here, so that every spelling of one file,
    # through a relative import, an absolute one, or a symlink, finds
    # the same entry.
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

    # Files that every imported module maps to, e.g., `'shop.cart'` to
    # `/app/shop/cart.py`, or to `None` when it is not a file of the
    # developer's own code, i.e., it lives elsewhere (the standard
    # library, an installed package), it is generated code, or it does
    # not exist at all yet.
    resolutions: Mapping[str, Optional[Path]]

    # Every dependency read this iteration, keyed by the module as
    # imports spell it: which file the module turned out to be and
    # the digest of its bytes, `None` for each that there is not.
    # Recorded once per module, as the walk first follows it; what a
    # file's recorded `dependencies` are compared against.
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

    def matches(self, module: str, dependency: Dependency) -> bool:
        """Returns whether this iteration found a file for `module`
        that matches `dependency`: the same file with the same
        bytes, or no file both then and now. `False` says the file
        that recorded `dependency` needs reanalyzing: the module
        became a different file (created, deleted, or shadowed), or
        the same file with different bytes (edited, or newly
        broken). Bytes that would not parse compare like any others,
        half-written being the normal state of a file somebody is
        typing into: analyzed against exactly those bytes, a file
        stays decided until they change.
        """
        filename = self.resolutions[module]

        # Two files sitting in `unchanged` can not disagree about
        # the dependency's bytes: the recorded digest came from the
        # same walk that placed the dependency in `known`, and any
        # change since moved the dependency to `parsed`.
        assert (
            filename is None or filename != dependency.filename or
            filename not in self.unchanged or
            self.unchanged[filename].digest == dependency.digest
        )

        return self.dependencies[module] == dependency

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
        must be resolved, which is the one spelling a file has here.
        """
        assert filename.is_absolute(
        ), "Expecting the filename to already be resolved"

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
            for module in known.dependencies:
                # An import that leads to no file is fine here: if it
                # used to lead to a file this one recorded as a
                # dependency, that dependency is now in no map, which
                # is what seeds this file for reanalysis when the
                # walk ends, and the save that fixes or removes the
                # import starts another iteration.
                files = await files.lookup_or_parse_module(module)
            return known.digest, files

        parse = Parse.from_bytes(source)
        if parse is None:
            return digest, files

        imports = _imports(parse.syntax, directory=filename.parent)

        files = replace(
            files,
            visiting=MappingProxyType({
                **files.visiting,
                filename: digest,
            }),
        )

        # Following an import and depending on it are the same event:
        # each of the file's imports is followed depth first, and
        # what each observed is grabbed from `files.dependencies`,
        # keyed by the module. A module resolving to nothing is
        # observed too: recording it is what makes the module
        # starting to resolve a change.
        for module in imports:
            files = await files.lookup_or_parse_module(module)

        parsed = ParsedFile(
            filename=filename,
            digest=digest,
            dependencies=MappingProxyType(
                {module: files.dependencies[module] for module in imports}
            ),
            syntax=parse.syntax,
            text=parse.text,
        )

        return digest, files.with_parsed_file(parsed)

    async def lookup_or_parse_module(
        self,
        module: str,
    ) -> 'Files':
        """Follows a module to its file, met the way this walk has
        it, recording what the import observed in `dependencies`,
        once per module. What the module resolved to joins
        `resolutions`, which spares finding its file again; a module
        resolves to no file the walk follows when no root contains
        it, or when it is generated, which its name alone says.
        """
        files = self

        if module in files.dependencies:
            return files

        if module not in files.resolutions:
            filename = await _try_find_file_of(
                module,
                roots=files.roots,
            )
            if (
                filename is not None and
                filename.name.endswith(GENERATED_SUFFIXES)
            ):
                filename = None
            if filename is not None:
                filename = filename.resolve()
            files = replace(
                files,
                resolutions=MappingProxyType(
                    {
                        **files.resolutions,
                        module: filename,
                    }
                ),
            )

        filename = files.resolutions[module]
        digest: Optional[Digest] = None
        if filename is not None:
            # Found a file, recurse.
            digest, files = await files.lookup_or_parse_filename(filename)

        return replace(
            files,
            dependencies=MappingProxyType(
                {
                    **files.dependencies,
                    module:
                        Dependency(filename=filename, digest=digest),
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


@dataclass(frozen=True, kw_only=True)
class Analysis:
    """One iteration's analysis: what the walk read, for the asking.

    Only read: the walk already read, parsed and recorded everything,
    so analyzing grows nothing here.
    """

    # What the walk parsed, each file to be analyzed.
    parsed: Mapping[Path, ParsedFile]

    # Answers what the names written in the files refer to, synced
    # with every file's text as the walk read it.
    pyright: Pyright


async def _analyze_file(
    filename: Path,
    analysis: Analysis,
) -> AnalyzedFile:
    """Returns one parsed file analyzed: a `AnalyzedFile` built from its
    `ParsedFile` -- the dependencies the parse recorded come along --
    and every servicer the file defines."""
    parsed = analysis.parsed[filename]

    servicers: list[ServicerInfo] = []

    return AnalyzedFile(
        filename=parsed.filename,
        digest=parsed.digest,
        dependencies=parsed.dependencies,
        servicers=tuple(servicers),
    )


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


async def _generated_files(
    directory: Path,
) -> Mapping[Path, tuple[int, int, int]]:
    """Returns every file of generated code under a directory, by
    when it was last written, how big it is and which inode it is,
    which is enough to say whether `rbt generate` wrote since it was
    last asked."""

    def scan() -> dict[Path, tuple[int, int, int]]:
        found: dict[Path, tuple[int, int, int]] = {}
        for path in directory.glob(SOURCE_GLOB):
            if not path.name.endswith(GENERATED_SUFFIXES):
                continue
            try:
                status = path.stat()
            except OSError:
                continue
            found[path] = (
                # All three are needed: mtimes tick coarsely
                # (milliseconds or worse), so a rewrite landing within
                # one tick of the last look keeps the same mtime and
                # only a size or inode change shows it, and a
                # generator writes a new file and renames it into
                # place, so even a same-size rewrite is a new inode.
                status.st_mtime_ns,
                status.st_size,
                status.st_ino,
            )
        return found

    # Globbing and statting wait on the disk so to not block the event
    # loop we use a thread.
    return await asyncio.to_thread(scan)


async def walk(
    *,
    application: Path,
    roots: Optional[Sequence[Path]] = None,
    known: Optional[Mapping[Path, AnalyzedFile]] = None,
) -> tuple[dict[Path, AnalyzedFile], Mapping[Path, ParsedFile]]:
    """Returns the developer's files read for one iteration, as two
    maps keyed by resolved path: `unchanged`, the files whose
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
    code is taken to end. It defaults to the application's own
    directory, which is what running the application puts first on its
    path.
    """
    application = application.resolve()

    if roots is None:
        roots = _roots(application)

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
    for filename, file in files.unchanged.items():
        # Want to add all `dependency`'s to `dependents` so we need to
        # do this in its own separate loop because the other loop
        # breaks after finding a single reason that an unchanged file
        # needs to be reanalyzed.
        for dependency in file.dependencies.values():
            if dependency.filename is not None:
                dependents.setdefault(
                    dependency.filename,
                    [],
                ).append(filename)

        for module, dependency in file.dependencies.items():
            if not files.matches(module, dependency):
                # `dependency` read in the last iteration does not
                # match with what was read in this iteration, so we
                # need to reanalyze this unchanged file.
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
                        module: files.dependencies[module]
                        for module in file.dependencies
                    }
                ),
                syntax=parse.syntax,
                text=parse.text,
            )
        else:
            unchanged[filename] = file

    return unchanged, parsed


async def analyze(
    *,
    parsed: Mapping[Path, ParsedFile],
    pyright: Pyright,
    generated_directory: Optional[Path],
) -> dict[Path, AnalyzedFile]:
    """Returns what each file a walk read holds, keyed by resolved
    path the way the walk keys everything.

    Whatever the walk parsed is analyzed, asking pyright as the
    analysis goes; whoever calls merges what comes back with the
    `unchanged` the walk returned, whose carried analyses still
    stand.

    `generated_directory` is where `rbt generate` writes Python code;
    a `_rbt` module anywhere else belongs to an installed package,
    and `None` means no `_rbt` module is the developer's own.
    """
    analysis = Analysis(parsed=parsed, pyright=pyright)

    analyzed: dict[Path, AnalyzedFile] = {}

    # Analyzing is synchronous in this file's own work, so a file at
    # a time leaves the dashboard free to answer.
    async for filename in cooperatively(parsed):
        analyzed[filename] = await _analyze_file(filename, analysis)

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
    scanned or watched, pyright resolves no `_rbt` module so we
    shouldn't ever find a servicer and thus the analysis won't return
    any."""
    roots = _roots(application)
    globs = [str(root / SOURCE_GLOB) for root in roots]
    if generated_directory is not None:
        globs.append(str(generated_directory / SOURCE_GLOB))

    # The servicers as last recorded. `None` rather than an empty list
    # until this run's first write because the state persisted by a
    # previous run may be stale and if we start with an empty list and
    # what we get back from analysis is also an empty list then we
    # won't update state which would be incorrect if previously we had
    # stored servicers. Initializing to `None` ensures we'll always do
    # at least one write when this workflow is resumed.
    servicers: Optional[list[ServicerInfo]] = None
    known: dict[Path, AnalyzedFile] = {}
    generated_files: Mapping[Path, tuple[int, int, int]] = {}

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
                # No directory and an empty directory contain the
                # same generated files: none.
                generated_files_now = (
                    await _generated_files(generated_directory)
                    if generated_directory is not None else {}
                )

                # Every carried analysis leaned on the generated
                # code, which no `dependencies` record, so any
                # change to it means everything is walked and
                # analyzed again.
                if generated_files_now != generated_files:
                    known = {}

                unchanged, parsed = await walk(
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
                    paths=(
                        [*roots, generated_directory]
                        if generated_directory is not None else list(roots)
                    ),
                )
                try:
                    analyzed = await analyze(
                        parsed=parsed,
                        pyright=pyright,
                        generated_directory=generated_directory,
                    )
                finally:
                    await pyright.stop()

                known = {**unchanged, **analyzed}

                servicers_now = extract_and_sort_servicers(known)

                # A write wakes every browser reading `Get`, so one
                # is only made when something below differs.
                if (
                    # A servicer was added, removed, or moved to
                    # another file, which is the very thing the
                    # dashboard shows.
                    servicers_now != servicers or
                    # Generated code appeared for the first time or
                    # was deleted, which flips whether the dashboard
                    # suggests running `rbt generate`. The previous
                    # iteration's flag comes from its scan, which is
                    # why `generated_files` is only assigned below,
                    # after this comparison.
                    (len(generated_files_now) > 0)
                    != (len(generated_files) > 0)
                ):

                    async def record(state) -> None:
                        del state.servicers[:]
                        state.servicers.extend(servicers_now)
                        state.generated = len(generated_files_now) > 0

                    await Implementation.ref().per_iteration(
                        'Record the servicers'
                    ).write(context, record)

                    # After the write, so that what is remembered is
                    # what was recorded.
                    servicers = servicers_now

                generated_files = generated_files_now

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
