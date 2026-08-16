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

And driven by the API rather than by the filesystem: a state type
declared, changed or withdrawn is what wakes this, and nothing else
does.
"""
import ast
import os
from rbt.dashboard.v1.dashboard_rbt import API
from reboot.aio.contexts import WorkflowContext
from reboot.aio.cooperatively import cooperatively
from reboot.aio.workflows import until_changes
from typing import Optional

GENERATED_SUFFIX = '_rbt'


def _parse(filename: str) -> ast.Module:
    with open(filename) as file:
        return ast.parse(file.read())


def _imports(
    module: ast.Module
) -> tuple[dict[str, tuple[str, str]], list[str]]:
    """Returns every symbol a file imported -- keyed by the name the
    file calls it, valued by the module it came from and its name
    there, so `Account` -> (`bank.v1.account_rbt`, `Account`) -- and
    beside it every module the file has imported.

    Symbols come from every import, wherever it is written. One inside
    an `if` or a `try` binds its name just as one at the top of the
    file does, and guarding an import is common enough to be worth
    reading. `ast.walk` yields the shallowest first, so a name bound
    at the top of the file wins over one bound inside something.

    Since we cannot tell whether `y` in `from x import y` is a module
    of its own or a name defined in `x`, `x.y` is listed as a module
    too. Adding that guess is safe because a module only becomes a
    file if a root holds one by that name, so `x.y` naming something
    that is not a module resolves to nothing and is dropped.
    """
    symbols: dict[str, tuple[str, str]] = {}
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
                    symbols.setdefault(
                        alias.asname or alias.name,
                        (imported_module, alias.name),
                    )
                    imported_modules.append(f'{imported_module}.{alias.name}')

    return symbols, imported_modules


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


def _state_type_if_servicer(
    class_definition: ast.ClassDef, *, symbols: dict[str, tuple[str, str]]
) -> Optional[str]:
    """Returns the state type a class services, if it says so.

    A servicer says it by what it inherits: `Account.Servicer`, or
    `Account.singleton.Servicer` for a singleton.
    """
    for base in class_definition.bases:
        match base:
            case (
                ast.Attribute(value=ast.Name(id=name), attr='Servicer') |
                ast.Attribute(
                    value=ast.
                    Attribute(value=ast.Name(id=name), attr='singleton'),
                    attr='Servicer',
                )
            ):
                match symbols.get(name):
                    case (str(imported_module), str(attribute)
                         ) if imported_module.endswith(GENERATED_SUFFIX):
                        package = imported_module.rsplit('.', 1)[0]
                        return f'{package}.{attribute}'

    return None


async def servicer_files(
    *,
    application: str,
    roots: Optional[list[str]] = None,
) -> tuple[dict[str, str], dict[str, str]]:
    """Returns where each state type's servicer is implemented, and
    why the rest could not be placed -- both keyed by state type,
    spelled the way `StateTypeInfo` spells it. A state type appears in
    one or the other, never both.

    The files are spelled the way the developer would open them. A
    state type in neither is one no servicer was found for, which a
    file that would not parse looks like too: which state type it
    implements is precisely what went unread.

    `roots` are the directories a module may be found under, which is
    both how a module name becomes a file and where the developer's
    code is taken to end. It defaults to the application's own
    directory, which is what running the application puts first on its
    path.
    """
    if roots is None:
        roots = [os.path.dirname(application)]

    files: dict[str, str] = {}
    errors: dict[str, str] = {}
    read: set[str] = set()

    pending = [application]

    while len(pending) > 0:
        # What the last round of imports led to.
        current, pending = pending, []

        # Parsing holds on to the interpreter for as long as it takes,
        # so a file at a time leaves the dashboard free to answer.
        async for filename in cooperatively(current):
            if filename in read:
                continue
            read.add(filename)

            try:
                module: ast.Module = _parse(filename)
            except (SyntaxError, OSError):
                # Nothing to say about it against a state type: which
                # one this file would have implemented is precisely
                # what went unread, so whatever it was falls through
                # to having no servicer found.
                continue

            # First, and on its own: `ast.walk` is breadth-first, so a
            # top-level class comes out before an import nested in a
            # `try`, and every name must be known before any class is
            # resolved.
            symbols, imported_modules = _imports(module)

            for node in ast.walk(module):
                match node:
                    case ast.ClassDef():
                        state_type = _state_type_if_servicer(
                            node, symbols=symbols
                        )
                        if state_type is None:
                            continue
                        if state_type in errors:
                            errors[state_type] += f' and {filename}'
                        elif state_type not in files:
                            files[state_type] = filename
                        elif files[state_type] != filename:
                            # Only one of them can be the servicer
                            # that runs, and following imports does
                            # not say which, so it is not placed.
                            errors[state_type] = (
                                'serviced by classes in '
                                f'{files.pop(state_type)} and {filename}'
                            )

            for imported_module in imported_modules:
                resolved = _resolve(imported_module, roots=roots)
                if resolved is not None:
                    pending.append(resolved)

    return files, errors


async def analyze(context: WorkflowContext, *, application: str) -> None:
    """Returns only when the dashboard stops, recording where each
    state type is implemented for as long as it runs."""

    async def state_types() -> list[str]:
        # Sorted, so that the same set of state types read twice
        # compares equal and does not read as a change.
        state = await API.ref().read(context)
        return sorted(state_type.name for state_type in state.state_types)

    async for iteration in context.loop('Analyze what is declared'):
        # Returns immediately the first time around, so the state
        # types already read are analyzed rather than waited on.
        await until_changes('Declared state types', context, state_types)

        files, errors = await servicer_files(application=application)

        async def record(state) -> None:
            for state_type in state.state_types:
                file = files.get(state_type.name)
                if file is not None:
                    state_type.servicer_file = file
                else:
                    # Said as a failure to find rather than as an
                    # absence: a servicer can be registered in ways
                    # this cannot follow -- imported dynamically, or
                    # made by a factory rather than written as a class
                    # -- so "there is none" would claim more than is
                    # known.
                    state_type.servicer_file_error = errors.get(
                        state_type.name,
                        'failed to find a servicer for this state type',
                    )

        # Written inline rather than through a method of its own: the
        # workflow runs on this very state.
        await API.ref().per_iteration(
            'Record where the state types are implemented'
        ).write(context, record)
