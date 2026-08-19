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

Where the walk of the imports stops is what makes this the
developer's code rather than somebody else's. A module resolves to a
file only if a root holds it, so an import of an installed package
leads nowhere.

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
    """What a file's imports bound each of its names to."""

    @dataclass(frozen=True, kw_only=True)
    class Symbol:
        """What `from x import y [as z]` binds a name to: `y` of
        module `x` -- which may itself turn out to be a module."""

        # The module it was imported from.
        module: str

        # Its name there, which the local name may differ from.
        name: str

    # By the name the file calls it.
    bindings: Mapping[str, 'Import']

    # Every module these imports may have Python load: `import a.b.c`
    # loads `a.b.c`; `from x import y` loads `x`, and `x.y` too when
    # `y` is a module of its own; a star import loads its module.
    # Each is tried as a file under the roots, which is how the rest
    # of the application's files are found.
    may_load: tuple[str, ...]

    def try_resolve_module(self,
                           path: Sequence[str]) -> Optional[tuple[str, str]]:
        """Returns the module a dotted name refers into and the name
        it refers to there, and `None` when no binding answers."""
        head, *rest = path

        match self.bindings.get(head):
            case Imports.Symbol(module=module, name=name) if not rest:
                return module, name

        return None

    def try_resolve_state_type(self, path: Sequence[str]) -> Optional[str]:
        """Returns the state type a dotted name refers to, if where
        it was bound from is generated code."""
        resolved = self.try_resolve_module(path)

        if resolved is None:
            return None

        module, attribute = resolved

        # The `_rbt` module name alone says what a name from one is:
        # `Account` from `bank.v1.account_rbt` is `bank.v1.Account`.
        if not module.endswith(GENERATED_SUFFIX):
            return None

        return f"{module.rsplit('.', 1)[0]}.{attribute}"


# What one import bound a name to.
Import = Imports.Symbol


def _imports(module: ast.Module) -> Imports:
    """Returns what a file's imports bound each of its names to.

    Names come from every import, wherever it is written. One inside
    an `if` or a `try` binds its name just as one at the top of the
    file does, and guarding an import is common enough to be worth
    reading. `ast.walk` yields the shallowest first, so a name bound
    at the top of the file wins over one bound inside something.
    """
    bindings: dict[str, Import] = {}
    may_load: list[str] = []

    for node in ast.walk(module):
        match node:
            case ast.Import(names=names):
                may_load.extend(alias.name for alias in names)

            case ast.ImportFrom(module=str(from_module), level=0, names=names):
                may_load.append(from_module)

                for alias in names:
                    bindings.setdefault(
                        alias.asname or alias.name,
                        Imports.Symbol(module=from_module, name=alias.name),
                    )
                    # Since we cannot tell whether `y` in
                    # `from x import y` is a module of its own or a
                    # name defined in `x`, `x.y` may be loaded too.
                    # The guess is safe: a module only becomes a file
                    # if a root holds one by that name, so `x.y`
                    # naming something that is not a module resolves
                    # to nothing and is dropped.
                    may_load.append(_join(from_module, alias.name))

    return Imports(
        bindings=MappingProxyType(bindings),
        may_load=tuple(may_load),
    )


def _try_find_file_of(module: str, *, roots: Sequence[str]) -> Optional[str]:
    """Returns the file a module names if one of `roots` contains it,
    and `None` otherwise.

    `None` is not a failure: the standard library and installed
    packages live outside every root, so `import asyncio` resolves to
    nothing and there is nothing to read.
    """
    relative = module.replace('.', os.sep)

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


def _join(base: str, *parts: str) -> str:
    """Returns a module extended by more components."""
    return '.'.join([base, *parts])


@dataclass(frozen=True, kw_only=True)
class File:
    """What one of the developer's files was found to hold."""

    # Of the bytes the file held, saying whether parsing it again
    # would say anything new.
    digest: Digest

    # Every module the file's imports may have Python load, to be
    # followed if a root holds it.
    may_load: tuple[str, ...]

    # Every servicer the file defines.
    servicers: tuple[ServicerInfo, ...]


def _state_type_if_servicer(
    class_definition: ast.ClassDef, *, imports: Imports
) -> Optional[str]:
    """Returns the state type a class services, if it says so.

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
                state_type = imports.try_resolve_state_type(path)
                if state_type is not None:
                    return state_type

    return None


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
    """What analyzing one method's body has found so far.

    Immutable: carrying the analysis forward means holding the one a
    method below returned, so what anybody else holds is never
    changed under them.
    """

    # The state type the servicer this method is written in services,
    # which is what `self.ref()` refers to.
    state_type: str

    # What the file's imports bound each of its names to. The same
    # for the whole method, so carried untouched.
    imports: Imports

    # The Reboot calls found, in the order met. What the analysis is
    # for.
    calls: tuple[Call, ...]

    # What was met that the analysis does not follow, spelled the way
    # it was written, so whoever reads the calls can be told they are
    # likely incomplete rather than left to trust them.
    unsupported: tuple[str, ...]

    # What each name holds at the point the analysis has reached. A
    # `MappingProxyType`, so writing into it raises rather than
    # quietly leaking.
    locals: Mapping[str, Local]

    @classmethod
    def create(cls, *, state_type: str, imports: Imports) -> 'Analysis':
        """Returns the analysis everything starts from: nothing found,
        nothing bound."""
        return cls(
            state_type=state_type,
            imports=imports,
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


def _reboot_related(expression: ast.expr, *, analysis: Analysis) -> bool:
    """Returns whether anything in an expression touches something
    Reboot related: a `.ref` however it is reached, a name holding a
    reference or the context, or a name that refers to a state type.

    What ordinary Python does is never Reboot related, however little
    of it the analysis follows; this is what keeps the unsupported
    list evidence rather than noise.
    """
    for node in ast.walk(expression):
        match node:
            case ast.Attribute(attr='ref'):
                return True
            case ast.Name(id=str(name)):
                if name in analysis.locals:
                    return True
                state_type = analysis.imports.try_resolve_state_type([name])
                if state_type is not None:
                    return True

    return False


def _evaluate(expression: ast.expr, *,
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
            return _evaluate(value, analysis=analysis)

        case ast.Call(
            func=ast.Attribute(value=ast.Name(id='self'), attr='ref')
        ):
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
                state_type = analysis.imports.try_resolve_state_type(path)
                if state_type is not None:
                    return Reference(state_type=state_type), analysis

        case ast.Name(id=str(name)) if name in analysis.locals:
            # `another = account`, holding whatever `account` holds.
            return analysis.locals[name], analysis

    # Nothing this evaluates. Said out loud when the expression
    # touches something Reboot related -- whatever it does with it is
    # not followed, so the calls are likely incomplete -- and left
    # alone when it is ordinary Python, which was never claimed.
    if _reboot_related(expression, analysis=analysis):
        analysis = analysis.with_unsupported(expression)

    return None, analysis


def _assign(
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
        local, analysis = _evaluate(value, analysis=analysis)

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


def _analyze_method(
    method: ast.FunctionDef | ast.AsyncFunctionDef,
    *,
    state_type: str,
    imports: Imports,
) -> Analysis:
    """Returns the Reboot calls a method's body makes, in the order
    met.

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
    analysis = Analysis.create(state_type=state_type, imports=imports)

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
                analysis = _assign(statement, analysis=analysis)

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


def _parse(source: bytes, *, digest: Digest, filename: str) -> Optional[File]:
    """Returns what a file holds, and `None` when it will not parse.

    A file that will not parse is left unrecorded rather than recorded
    as empty, so that the next iteration parses it again: half-written
    is the normal state of a file somebody is typing into.
    """
    try:
        module: ast.Module = ast.parse(source)
    except SyntaxError:
        return None

    imports = _imports(module)

    servicers = []

    for node in ast.walk(module):
        match node:
            case ast.ClassDef():
                state_type = _state_type_if_servicer(node, imports=imports)
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
        may_load=imports.may_load,
        servicers=tuple(servicers),
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

            pending.extend(
                filename for filename in (
                    _try_find_file_of(module, roots=roots)
                    for module in file.may_load
                ) if filename is not None
            )

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
