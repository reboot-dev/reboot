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

Where the walk stops is what makes this the developer's code rather
than somebody else's. A module resolves only if a root holds it, so
an import of an installed package leads nowhere, and no state type of
theirs is waiting on one: their API files declare none of those.

Read rather than imported, because importing an application means
having its generated code, its dependencies and its `sys.path`, and
the dashboard is meant to work before any of that exists. A file at a
time through `cooperatively`, so that the dashboard goes on answering
while a large one is walked.

And driven by the filesystem, because that is what it is a function
of: where a state type is implemented can only change when the
developer's source changes, so an edit under the roots is what wakes
this, and nothing else does.
"""
import ast
import hashlib
import os
from dataclasses import dataclass
from rbt.dashboard.v1.dashboard_pb2 import ServicerInfo
from rbt.dashboard.v1.dashboard_rbt import Implementation
from reboot.aio.contexts import WorkflowContext
from reboot.aio.cooperatively import cooperatively
from reboot.cli.common.watch import file_watcher
from typing import Optional

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


def _imports(module: ast.Module) -> list[str]:
    """Returns every module a file has imported.

    Modules come from every import, wherever it is written. One
    inside an `if` or a `try` imports its module just as one at the
    top of the file does, and guarding an import is common enough to
    be worth reading.

    Since we cannot tell whether `y` in `from x import y` is a module
    of its own or a name defined in `x`, `x.y` is listed as a module
    too. Adding that guess is safe because a module only becomes a
    file if a root holds one by that name, so `x.y` naming something
    that is not a module resolves to nothing and is dropped.
    """
    imported_modules: list[str] = []

    for node in ast.walk(module):
        # A relative import names no module of its own, and
        # `from . import x` has nowhere to be read from here.
        match node:
            case ast.Import(names=names):
                imported_modules.extend(alias.name for alias in names)
            case ast.ImportFrom(
                module=str(imported_module), level=0, names=names
            ):
                imported_modules.append(imported_module)
                for alias in names:
                    imported_modules.append(f'{imported_module}.{alias.name}')

    return imported_modules


def _resolve(imported_module: str, *, roots: list[str]) -> Optional[str]:
    """Returns the file a module names if one of `roots` contains it,
    and `None` otherwise.

    `None` is not a failure: the standard library and installed
    packages live outside every root, so `import asyncio` resolves to
    nothing and there is nothing to read.
    """
    relative = imported_module.replace('.', os.sep)

    for root in roots:
        for candidate in (
            os.path.join(root, relative + '.py'),
            os.path.join(root, relative, '__init__.py'),
        ):
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


@dataclass(frozen=True, kw_only=True)
class File:
    """What one of the developer's files was found to hold."""

    # Of the bytes the file held, saying whether parsing it again
    # would say anything new. Not `st_mtime_ns`, which is only as fine
    # as the kernel's coarse clock -- around ten milliseconds -- so a
    # save landing in the same tick as a read leaves an mtime that
    # says nothing happened.
    digest: bytes

    # Every module the file names, to be followed if a root holds it.
    imported_modules: list[str]

    # Every servicer the file defines.
    servicers: list[ServicerInfo]


def _digest(node: ast.AST) -> bytes:
    """Returns a digest of what a piece of syntax says.

    The digest is computed using `ast.dump` without attributes so that
    the lines and columns are left out, and thus a comment added above
    a method or arguments rewrapped across lines do not change the
    digest.
    """
    return hashlib.sha256(ast.dump(node,
                                   include_attributes=False).encode()).digest()


def _methods(class_definition: ast.ClassDef) -> list[ServicerInfo.Method]:
    """Returns the methods a class defines, in the order written."""
    methods = []

    for node in class_definition.body:
        match node:
            case (
                ast.FunctionDef(name=str(name)) |
                ast.AsyncFunctionDef(name=str(name))
            ):
                methods.append(
                    ServicerInfo.Method(name=name, digest=_digest(node))
                )

    return methods


def _parse(source: bytes, *, digest: bytes, filename: str) -> Optional[File]:
    """Returns what a file holds, and `None` when it will not parse.

    A file that will not parse is left unrecorded rather than recorded
    as empty, so that the next round parses it again: half-written is
    the normal state of a file somebody is typing into.
    """
    try:
        module: ast.Module = ast.parse(source)
    except SyntaxError:
        return None

    # First, and on its own: `ast.walk` is breadth-first, so a
    # top-level class comes out before an import nested in a `try`,
    # and every name must be known before any class is resolved.
    imported_modules = _imports(module)

    servicers = []

    for node in ast.walk(module):
        match node:
            case ast.ClassDef():
                state_type = _state_type_if_servicer(node)
                if state_type is not None:
                    servicers.append(
                        ServicerInfo(
                            state_type=state_type,
                            file=filename,
                            methods=_methods(node),
                        )
                    )

    return File(
        digest=digest,
        imported_modules=imported_modules,
        servicers=servicers,
    )


def servicers(files: dict[str, File]) -> list[ServicerInfo]:
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


async def files(
    *,
    application: str,
    roots: Optional[list[str]] = None,
    known: Optional[dict[str, File]] = None,
) -> dict[str, File]:
    """Returns what each file the developer's application reaches
    holds, keyed by the file, spelled the way they would open it.

    Only what it reaches: a file that has stopped being imported is
    absent, however recently it changed, and one that has started
    being imported is parsed for the first time.

    `known` is what a previous call returned, and spares this one from
    parsing a file whose bytes have not changed since. Parsing is the
    expensive part -- around fifty times what reading and hashing the
    bytes costs -- and an edit changes one file.

    `roots` are the directories a module may be found under, which is
    both how a module name becomes a file and where the developer's
    code is taken to end. It defaults to the application's own
    directory, which is what running the application puts first on its
    path.
    """
    if roots is None:
        roots = _roots(application)

    if known is None:
        known = {}

    reachable: dict[str, File] = {}

    pending = [application]

    while len(pending) > 0:
        # What the last round of imports led to.
        current, pending = pending, []

        # Parsing holds on to the interpreter for as long as it takes,
        # so a file at a time leaves the dashboard free to answer.
        async for filename in cooperatively(current):
            if filename in reachable:
                continue

            try:
                source: bytes = _read(filename)
            except OSError:
                continue

            digest = hashlib.sha256(source).digest()

            file = known.get(filename)

            if file is None or file.digest != digest:
                file = _parse(source, digest=digest, filename=filename)

            if file is None:
                continue

            reachable[filename] = file

            for imported_module in file.imported_modules:
                resolved = _resolve(imported_module, roots=roots)
                if resolved is not None:
                    pending.append(resolved)

    return reachable


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
            # made during the walk resolves `event` rather than
            # arriving while nothing is listening. A watch is consumed
            # by one event, so it is re-entered for each.
            async with watcher.watch(globs) as event:
                known = await files(
                    application=application, roots=roots, known=known
                )

                found = servicers(known)

                # Most edits change no servicer, and a write wakes every
                # browser reading `Get`, so one is only worth making
                # when the answer is different.
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
