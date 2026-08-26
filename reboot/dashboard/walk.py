"""Walks the developer's files: reads and parses each file the
entries reach through their imports, records what each parse
observed, and carries forward what an earlier walk already parsed
when the file is unchanged.
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
from rbt.dashboard.v1.dashboard_pb2 import File
from types import MappingProxyType
from typing import Generic, Mapping, Optional, Protocol, Sequence, TypeVar

# A SHA-256 digest -- of a file's bytes, or of a method's syntax --
# saying whether what was digested has changed.
Digest = bytes

# What one of a file's imports observed when the file was analyzed:
# which file was at its possible module path, in the spelling
# `_standardized_path` returns, and the digest of that file's bytes, each
# absent when there was no file. Aliased from where it is defined so
# that what an iteration records and what a restart reconstitutes
# from are one message.
Dependency = File.Dependency

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


class KnownFileProtocol(Protocol):
    """What the walk needs of a file a previous iteration recorded:
    enough to say whether it must be read again. Whatever else the
    record carries, the analysis that was made of the file, is the
    caller's, and comes back unchanged for a file the walk finds
    unchanged."""

    # The file this is, in the spelling `_standardized_path` returns.
    @property
    def filename(self) -> Path:
        ...

    # Of the bytes the file held, saying whether parsing it again
    # would say anything new.
    @property
    def digest(self) -> Digest:
        ...

    # What each import observed when this file was recorded, keyed
    # by possible module path. A change in which file is at a module
    # path, or in that file's bytes, is what calls for reading this
    # file again.
    @property
    def dependencies(self) -> Mapping[str, Dependency]:
        ...

    # The files outside every root that recording this file read,
    # with the digest each was read with. The walk never finds
    # these, so each is digested directly at the end of a walk.
    @property
    def external(self) -> tuple[Dependency, ...]:
        ...


# The caller's record of a file, whatever it carries beyond what the
# walk needs.
KnownFile = TypeVar('KnownFile', bound=KnownFileProtocol)


@dataclass(frozen=True, kw_only=True)
class Files(Generic[KnownFile]):
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
    known: Mapping[Path, KnownFile]

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
    unchanged: Mapping[Path, KnownFile]

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
        known: Mapping[Path, KnownFile],
    ) -> 'Files[KnownFile]':
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

    def with_parsed_file(self, parsed: ParsedFile) -> 'Files[KnownFile]':
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

    def with_unchanged_known_file(
        self,
        file: KnownFile,
    ) -> 'Files[KnownFile]':
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
    ) -> tuple[Optional[Digest], 'Files[KnownFile]']:
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
    ) -> 'Files[KnownFile]':
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


async def _walk(
    *,
    entries: Sequence[Path],
    roots: Sequence[Path],
    known: Mapping[Path, KnownFile],
) -> tuple[dict[Path, KnownFile], Mapping[Path, ParsedFile]]:
    """Returns the developer's files read for one iteration, as two
    maps keyed by the spelling `_standardized_path` returns:
    `unchanged`, the files whose
    carried analyses still stand, and `parsed`, the files to be
    analyzed. Whoever calls analyzes the parsed ones and merges what
    comes back with `unchanged`, which is the `known` a next
    iteration starts from.

    `entries` are the files the walk starts from: an application's
    entry point, or every file of a directory. Only what they reach
    is returned: a file that has stopped being imported is absent,
    however recently it changed, and one that has started being
    imported is parsed for the first time.

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
    files = Files.create(
        roots=roots,
        known=known,
    )

    # Everything reachable is read by one depth-first recursion from
    # each entry. Parsing is synchronous and blocks the Python event
    # loop, but every parse follows an awaited read of the same
    # file, so the loop turns between files and other dashboard
    # requests are not starved.
    for entry in entries:
        _, files = await files.lookup_or_parse_filename(
            _standardized_path(entry)
        )

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
    unchanged: dict[Path, KnownFile] = {}
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
