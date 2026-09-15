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
servicer waits unrecorded; the generated directory is listed beside
the servicers, so that whoever reads both can tell a state type with
nothing generated for it.

The same walk finds the agents the application runs. A run of one is
a call whose definition lands on one of Reboot's `Agent` entry
points -- `run`, `iter`, `run_stream`, `run_stream_events` -- and
which agent is run is what pyright says the receiver of that call is
bound to: a construction of Reboot's `Agent` with a string literal
`name=`, at the top level of a module, which says the agent's name,
its model and the prompt it is given. Whatever is not followed -- a
run of any other agent, what a run is given on top of its agent -- is
recorded as a hazard instead, so that nothing the analysis could not
see is silently missing.

An agent's tools are found in every file the walk analyzes: a
function whose decorator pyright says is the `tool` or `tool_plain`
of Reboot's `Agent`, registered on the agent the decorator's receiver
resolves to the same way a run's does. Each tool's body is analyzed
exactly as a servicer method's is, so what the model can reach
through an agent is recorded beside what the application calls
itself. A tool registered by calling `tool` rather than decorating
is not found.

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
import ast
import asyncio
import hashlib
from dataclasses import dataclass, replace
from functools import partial
from google.protobuf.timestamp_pb2 import Timestamp
from pathlib import Path
from rbt.dashboard.v1.dashboard_pb2 import Agent, Change
from rbt.dashboard.v1.dashboard_pb2 import Dashboard as DashboardState
from rbt.dashboard.v1.dashboard_pb2 import File, Generated, Hazard, Servicer
from rbt.dashboard.v1.dashboard_rbt import Dashboard
from reboot.aio.contexts import WorkflowContext
from reboot.aio.cooperatively import cooperatively
from reboot.aio.workflows import at_least_once
from reboot.cli.common.watch import file_watcher
from reboot.dashboard.backend.changelog import code_changes_between
from reboot.dashboard.backend.check import timed
from reboot.dashboard.backend.pyright import Location, Pyright
from reboot.dashboard.backend.walk import (
    GENERATED_SUFFIXES,
    SOURCE_GLOB,
    Dependency,
    Digest,
    Parse,
    ParsedFile,
    _modified_at,
    _read,
    _standardized_path,
    _walk,
)
from types import MappingProxyType
from typing import Mapping, Optional, Sequence

# Where Reboot's `Agent` is written, as the last parts of the path
# pyright answers with, so that the module is recognized wherever
# `reboot` is installed. What tells a run of an agent from any other
# call: the call's own definition is one of the methods below,
# whichever way the agent was come by.
AGENT_MODULE = ('reboot', 'agents', 'pydantic_ai', '_agent.py')

# The methods of `Agent` a run is made through, which is what a
# run's own definition lands on. `run_sync` and `run_stream_sync` are
# not here: a Reboot `Agent` raises on both, since a workflow is
# always async.
RUN_NAMES = ('run', 'iter', 'run_stream', 'run_stream_events')

# The keyword arguments that, given to a run, change what its agent is
# or can reach, which the analysis does not follow, so that a run
# given any of them says so; see `Agent.Run.Hazard.RunArguments`.
RUN_ARGUMENTS = ('toolsets', 'model', 'instructions')

# The methods of `Agent` a tool is registered with, which is what a
# decorator registering one lands on.
TOOL_REGISTRATION_NAMES = ('tool', 'tool_plain')

# The keyword arguments that, given where an agent is constructed or
# where a tool is registered, give tools or hide them, which the
# analysis does not follow, so that the agent or the tool says so; see
# `Agent.Hazard.ConstructorArguments` and
# `Agent.Tool.Hazard.ToolArguments`.
CONSTRUCTOR_ARGUMENTS = ('tools', 'toolsets', 'prepare_tools')
TOOL_ARGUMENTS = ('prepare',)

# The version of what the analysis records, which the dashboard's
# state records beside it. Counted up whenever the analysis starts
# recording something it did not, or records something differently:
# a file that has not changed is otherwise carried forward as an
# earlier analysis recorded it, which never says the new thing.
CODE_ANALYSIS_VERSION = 1


def _is_agent_module(filename: Path) -> bool:
    """Returns whether a file is the module Reboot's `Agent` is
    written in, which is what makes a call to something defined
    there a run of an agent rather than a call of the developer's
    own."""
    return filename.parts[-len(AGENT_MODULE):] == AGENT_MODULE


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
    servicers: tuple[Servicer, ...]

    # Every agent the file's servicers and tools run, one per name,
    # wherever each is defined; see `Agent`.
    agents: tuple[Agent, ...]

    # Every tool the file registers on an agent; see `Agent.Tool`.
    tools: tuple[Agent.Tool, ...]

    # Every top-level hazard the file's analysis recorded; see
    # `Hazard`.
    hazards: tuple[Hazard, ...]


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
    spelled as the generator writes it into the class, e.g.
    `'shop.v1.Shop'` for a class containing
    `__state_type_name__ = StateTypeName('shop.v1.Shop')`, and
    `None` for a class without one."""
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

    # The state type, spelled as `__state_type_name__` spells it,
    # e.g. `shop.v1.Shop`.
    state_type: str


@dataclass(frozen=True, kw_only=True)
class BaseServicerDefinition:
    """A line defining a servicer base class of generated code: a
    class carrying `__state_type_name__` itself while named unlike
    the state type, e.g. the generator's
    `class ShopBaseServicer:`."""

    # The state type, spelled as `__state_type_name__` spells it,
    # e.g. `shop.v1.Shop`.
    state_type: str


@dataclass(frozen=True, kw_only=True)
class ServicerDefinition:
    """A line defining a servicer class: a class whose state type
    comes through a base defined in the same module, e.g. the
    generator's `class ShopServicer(ShopBaseServicer):`."""

    # The state type, spelled as `__state_type_name__` spells it,
    # e.g. `shop.v1.Shop`.
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

    # The state type, spelled as `__state_type_name__` spells it,
    # e.g. `shop.v1.Shop`.
    state_type: str

    # The method name, spelled as the developer calls it, e.g. `look`.
    name: str

    # How a call defined here is reached, which is where the stub
    # is written: e.g. `CONSTRUCT` for one on the state type's own
    # class, and `SCHEDULE` for one inside its
    # `WeakReference._Schedule`.
    how: 'Servicer.Method.Call.How.ValueType'


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
    '_ConstructIdempotently': Servicer.Method.Call.How.CONSTRUCT,
    '_Forall': Servicer.Method.Call.How.FORALL,
    '_Idempotently': Servicer.Method.Call.How.CALL,
    '_Schedule': Servicer.Method.Call.How.SCHEDULE,
    '_SelfIdempotently': Servicer.Method.Call.How.CALL,
    '_SelfSchedule': Servicer.Method.Call.How.SCHEDULE,
    '_Spawn': Servicer.Method.Call.How.SPAWN,
    '_Until': Servicer.Method.Call.How.UNTIL,
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


def _method_definitions_in(
    body: Sequence[ast.stmt],
    *,
    state_type: str,
    how: Servicer.Method.Call.How.ValueType,
) -> dict[int, MethodDefinition]:
    """Returns the method stubs a class body defines, by line: each
    def taking `__context__` second, and each alias the generator
    writes for one after it, e.g. `add_to_cart = AddToCart`, under
    the name the developer calls."""
    definitions: dict[int, MethodDefinition] = {}
    stubs: set[str] = set()
    for node in body:
        match node:
            case (ast.FunctionDef() |
                  ast.AsyncFunctionDef()) if _takes_context_second(node):
                stubs.add(node.name)
                definitions[node.lineno] = MethodDefinition(
                    state_type=state_type,
                    name=node.name,
                    how=how,
                )
            case ast.Assign(
                targets=[ast.Name(id=str(alias))],
                value=ast.Name(id=str(stub)),
            ) if stub in stubs:
                definitions[node.lineno] = MethodDefinition(
                    state_type=state_type,
                    name=alias,
                    how=how,
                )
    return definitions


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
                # stubs take second. An alias written after a stub,
                # `add_to_cart = AddToCart`, defines the same method
                # under the name the developer calls.
                definitions.update(
                    _method_definitions_in(
                        statement.body,
                        state_type=state_type,
                        how=Servicer.Method.Call.How.CONSTRUCT,
                    )
                )
                for inner in statement.body:
                    match inner:
                        case ast.ClassDef(
                        ) if (inner.name in HOWS_BY_CLASS_NAME):
                            definitions.update(
                                _method_definitions_in(
                                    inner.body,
                                    state_type=state_type,
                                    how=HOWS_BY_CLASS_NAME[inner.name],
                                )
                            )

                        case ast.ClassDef(name='WeakReference'):
                            definitions.update(
                                _method_definitions_in(
                                    inner.body,
                                    state_type=state_type,
                                    how=Servicer.Method.Call.How.CALL,
                                )
                            )
                            for node in inner.body:
                                match node:
                                    case ast.ClassDef(
                                    ) if (node.name in HOWS_BY_CLASS_NAME):
                                        definitions.update(
                                            _method_definitions_in(
                                                node.body,
                                                state_type=state_type,
                                                how=HOWS_BY_CLASS_NAME[
                                                    node.name],
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


def _keyword_argument_value(call: ast.Call, name: str) -> Optional[ast.expr]:
    """Returns what a call passes a keyword argument, and `None` for
    one it does not pass."""
    for keyword in call.keywords:
        if keyword.arg == name:
            return keyword.value
    return None


def _try_constant_string(node: Optional[ast.expr]) -> Optional[str]:
    """Returns the string an expression is, and `None` for an
    expression that is anything else: a name, an f-string, a call.
    Adjacent string literals are one expression, so a prompt written
    across a screenful of quoted lines reads as the one string the
    developer meant."""
    match node:
        case ast.Constant(value=str(value)):
            return value
    return None


def _elements(node: Optional[ast.expr]) -> list[ast.expr]:
    """Returns what a list or a tuple written out holds, and nothing
    for anything else, such as a name the elements were gathered
    under."""
    match node:
        case ast.List(elts=elements) | ast.Tuple(elts=elements):
            return list(elements)
    return []


def _constant_strings(node: Optional[ast.expr]) -> list[str]:
    """Returns the strings an expression is: the one it is, or every
    one written out in the list or tuple it is."""
    string = _try_constant_string(node)
    if string is not None:
        return [string]
    return [
        string for element in _elements(node)
        if (string := _try_constant_string(element)) is not None
    ]


@dataclass(frozen=True, kw_only=True)
class AgentDefinition:
    """A line an agent is bound on, e.g.
    `librarian = Agent('anthropic:claude-sonnet-4-6', name='librarian')`,
    with everything the construction says about it.
    """

    # The file the agent is defined in, spelled as `Agent.filename`
    # spells it, and whether that file is outside every root, e.g. in
    # an installed package; see `Agent.external`.
    filename: str
    external: bool

    # The `name` the agent is constructed with, which tells it from
    # every other agent; see `Agent.name`.
    name: str

    # What its construction says, each absent when it says nothing a
    # literal can be read from.
    model: Optional[str]
    system_prompt: tuple[str, ...]
    instructions: tuple[str, ...]
    description: Optional[str]

    # Everything the construction gives the agent that the analysis
    # does not follow; see `Agent.hazards`.
    hazards: tuple[Agent.Hazard, ...]


def _agent_definition(
    call: ast.Call,
    *,
    name: str,
    filename: str,
    external: bool,
) -> AgentDefinition:
    """Returns what a construction of Reboot's `Agent` says the agent
    is: only literals are read. What it gives the agent that is not
    followed, tools it passes or hides, is said instead."""
    # The model is the first argument, wherever it is passed:
    # `Agent('anthropic:claude-sonnet-4-6')` or `Agent(model=...)`.
    model = _keyword_argument_value(call, 'model')
    if model is None and len(call.args) > 0:
        model = call.args[0]

    return AgentDefinition(
        filename=filename,
        external=external,
        name=name,
        model=_try_constant_string(model),
        system_prompt=tuple(
            _constant_strings(_keyword_argument_value(call, 'system_prompt'))
        ),
        instructions=tuple(
            _constant_strings(_keyword_argument_value(call, 'instructions'))
        ),
        description=_try_constant_string(
            _keyword_argument_value(call, 'description')
        ),
        hazards=(
            (
                Agent.Hazard(
                    filename=filename,
                    constructor_arguments=(
                        Agent.Hazard.ConstructorArguments(
                            call=ast.unparse(call),
                        )
                    ),
                ),
            ) if any(
                keyword.arg in CONSTRUCTOR_ARGUMENTS
                for keyword in call.keywords
            ) else ()
        ),
    )


def _possible_agent_definitions(parse: Parse) -> Mapping[int, ast.Call]:
    """Returns every possible agent definition in a module: the call
    each name at the top level of it is bound to, by the line the
    assignment is written on, which is the line pyright places the
    definition of the name at. Which of them is an agent definition is
    known only once a run leads to one; see
    `Analysis.agent_definition_at`.

    Only a name bound exactly once at the top level is indexed:
    pyright places every use of a name bound more than once at its
    first binding, whichever one the use holds, so reading any of them
    risks recording a run of one agent as a run of another.
    """
    possible_agent_definitions: dict[int, tuple[str, ast.Call]] = {}

    # How many times each name is assigned at the top level.
    assigned: dict[str, int] = {}

    for statement in parse.syntax.body:
        match statement:
            case ast.Assign(targets=targets):
                for target in targets:
                    if isinstance(target, ast.Name):
                        assigned[target.id] = assigned.get(target.id, 0) + 1
            case ast.AnnAssign(target=ast.Name(id=str(name))):
                assigned[name] = assigned.get(name, 0) + 1

        match statement:
            case ast.Assign(
                targets=[ast.Name(id=str(bound_to))],
                value=ast.Call() as call,
            ) | ast.AnnAssign(
                target=ast.Name(id=str(bound_to)),
                value=ast.Call() as call,
            ):
                possible_agent_definitions[statement.lineno] = (bound_to, call)

    return MappingProxyType(
        {
            line: call
            for line, (bound_to, call) in possible_agent_definitions.items()
            if assigned[bound_to] == 1
        }
    )


@dataclass(frozen=True, kw_only=True)
class AgentFile:
    """What reading one file a run's agent is bound in during an
    analysis said."""

    # The file's text, which pyright is handed when asked what a call
    # in it constructs; empty when the file could not be read or would
    # not parse.
    text: str

    # Every possible agent definition in the file, by line; see
    # `_possible_agent_definitions`.
    possible_agent_definitions: Mapping[int, ast.Call]

    # The agent each line asked about so far is bound to, and `None`
    # for a line that binds none, so that each is asked about at most
    # once per analysis.
    definitions: Mapping[int, Optional[AgentDefinition]]

    # The dependency each file whose analysis reads this file
    # records in its `external`: present only for a file outside
    # every root, which the walk never finds or digests, and always
    # carrying a digest of bytes actually read.
    external: Optional[Dependency]


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

    # Every file a run's agent was found bound in so far, keyed the
    # same way, read at most once per analysis.
    agent_files: Mapping[Path, AgentFile]

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
            source, modified = await _read(filename)
        except OSError:
            return None, None

        external: Optional[Dependency] = None
        if not any(filename.is_relative_to(root) for root in self.roots):
            external = Dependency(
                filename=str(filename),
                digest=hashlib.sha256(source).digest(),
            )

        parse = Parse.from_bytes(
            source,
            digest=hashlib.sha256(source).digest(),
            modified=modified,
        )
        return (parse if isinstance(parse, Parse) else None), external

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

    async def agent_definition_at(
        self,
        location: Location,
    ) -> tuple[Optional[AgentDefinition], 'Analysis']:
        """Returns the agent bound at a location, and `None` for a
        location that binds none the analysis can read.

        Asked only where pyright places the binding of what a run is
        made on, so what is bound there is an agent; what is left to
        know is whether it is bound to a construction of Reboot's
        `Agent` itself, rather than something that returns one, such
        as a factory, whose arguments say what the factory is given.
        Pyright answers that, and the construction's literal
        arguments say what the agent is. The file is read at most once,
        and each location asked about at most once, per analysis."""
        if location.filename.suffix != '.py':
            return None, self

        # Standardized because pyright spells its locations
        # absolutely, while everything here is keyed by the
        # spelling `_standardized_path` returns.
        filename = _standardized_path(location.filename)

        agent_file, analysis = await self._agent_file(filename)
        if location.line in agent_file.definitions:
            return agent_file.definitions[location.line], analysis

        agent_definition: Optional[AgentDefinition] = None
        match agent_file.possible_agent_definitions.get(location.line):
            case ast.Call(
                func=(ast.Name() | ast.Attribute()) as callee,
            ) as call:
                line, character = _position_at_last_character(callee)
                callee_location = await analysis.pyright.definition_at(
                    filename=filename,
                    line=line,
                    character=character,
                    text=agent_file.text,
                )
                name = _try_constant_string(
                    _keyword_argument_value(call, 'name')
                )
                if (
                    callee_location is not None and
                    _is_agent_module(callee_location.filename) and
                    name is not None
                ):
                    agent_definition = _agent_definition(
                        call,
                        name=name,
                        filename=(
                            str(filename) if agent_file.external is None else
                            agent_file.external.filename
                        ),
                        external=agent_file.external is not None,
                    )

        analysis = replace(
            analysis,
            agent_files=MappingProxyType(
                {
                    **analysis.agent_files,
                    filename:
                        replace(
                            agent_file,
                            definitions=MappingProxyType(
                                {
                                    **agent_file.definitions,
                                    location.line:
                                        agent_definition,
                                }
                            ),
                        ),
                }
            ),
        )

        return agent_definition, analysis

    async def _agent_file(
        self,
        filename: Path,
    ) -> tuple[AgentFile, 'Analysis']:
        """Returns what reading a file said, reading and parsing it the
        first time it is asked about."""
        analysis = self

        agent_file = analysis.agent_files.get(filename)
        if agent_file is None:
            parse, external = await analysis._parse(filename)
            agent_file = AgentFile(
                text='' if parse is None else parse.text,
                possible_agent_definitions=(
                    MappingProxyType({})
                    if parse is None else _possible_agent_definitions(parse)
                ),
                definitions=MappingProxyType({}),
                external=external,
            )
            analysis = replace(
                analysis,
                agent_files=MappingProxyType(
                    {
                        **analysis.agent_files,
                        filename: agent_file,
                    }
                ),
            )

        analysis = analysis._with_external_dependency(agent_file.external)

        return agent_file, analysis


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


@dataclass(frozen=True, kw_only=True)
class Findings:
    """What analyzing one function's body found, which is what a
    servicer method and an agent's tool each record of what they
    do."""

    calls: tuple[Servicer.Method.Call, ...]
    runs: tuple[Agent.Run, ...]
    hazards: tuple[Servicer.Method.Hazard, ...]

    # The agent each run in `runs` is made on.
    agents: tuple[Agent, ...]


def _ambiguous_call(
    callee: ast.expr,
    *,
    filename: Path,
) -> Servicer.Method.Hazard:
    """Returns the hazard a call the analysis could not resolve is; see
    `Servicer.Method.Hazard.AmbiguousCall`."""
    return Servicer.Method.Hazard(
        filename=str(filename),
        ambiguous_call=Servicer.Method.Hazard.AmbiguousCall(
            callee=ast.unparse(callee),
        ),
    )


async def _analyze_function(
    function: ast.FunctionDef | ast.AsyncFunctionDef,
    *,
    filename: Path,
    text: str,
    analysis: Analysis,
    visited: frozenset[tuple[Path, int]],
) -> tuple[Findings, Analysis]:
    """Returns what a function's body does, itself or through the
    functions it calls: the Reboot calls it makes, the agents it
    runs, and what it does that is not followed, the calls it makes
    that are ambiguous included.

    A Reboot call is one whose own definition pyright places at a
    method stub of a state type. However the reference was come by,
    taken with `ref`, held in a variable, or received from
    elsewhere, the called method's definition is the same, so one
    question decides.

    A run of an agent is the same question answered by one of
    `Agent`'s entry points, `run`, `iter`, `run_stream` or
    `run_stream_events`, in the module Reboot writes them in. Which
    agent is run is what the receiver of the call resolves to, an
    `Agent(...)` with a literal `name=` at the top level of a module,
    whose name the run records, and which is recorded among the
    agents the function runs. What a run is given on top of its
    agent is not followed, but recorded on the run, and a
    run whose agent cannot be resolved is recorded as a hazard of the
    function; see `Agent.Run.Hazard` and `Servicer.Method.Hazard`.

    A call defined by a function the generator did not write, the
    developer's own or an installed package's, is followed: that
    function's body is analyzed the same way and its calls are the
    caller's, flattened, with no record of the function they came
    through. Whether a context reaches a function is never asked,
    since each Reboot call is recognized at its own call site, so a
    context that arrives inside a dataclass or a closure is followed
    like one passed directly. A nested function or a lambda is
    walked as part of the body it is written in, whether or not
    anything is seen to call it: nearly everything written is
    called, so assuming so costs nothing. `visited` is every
    function already walked on the way here, by file and line, so
    that functions calling each other are followed once.

    An ambiguous call, a hazard like any other, is one with no
    definition pyright can say, one
    whose definition is no function: a stub's, which has no body to
    follow, or a class's, and one into Reboot's agents module that is
    not a run. A call whose definition is the generator's own
    machinery, such as the `ref` or `schedule` inside a chain, or the
    standard library's, is neither.
    """
    calls: list[Servicer.Method.Call] = []
    runs: list[Agent.Run] = []
    hazards: list[Servicer.Method.Hazard] = []
    agents: list[Agent] = []

    # The function itself is walked here, and everything defined
    # in it with it: an `async def inner` written in the body, or a
    # lambda bound to a name. A call to either lands inside the
    # function, and is not followed again.
    visited = visited | {(filename, function.lineno)}
    assert function.end_lineno is not None
    span = range(function.lineno, function.end_lineno + 1)

    # The function's own decorators run where it is defined, not when
    # it is called, so what they call is not what the function does:
    # the `librarian.tool(prepare=...)` a tool is registered with, say.
    decorators = {
        id(node)
        for decorator in function.decorator_list
        for node in ast.walk(decorator)
    }

    for node in ast.walk(function):
        match node:
            case ast.Call(
                func=(ast.Attribute() | ast.Name()) as callee,
            ) if id(node) not in decorators:
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
            hazards.append(_ambiguous_call(callee, filename=filename))
            continue

        # Nothing in the standard library takes a context, so a call
        # into it can neither be nor reach a Reboot call.
        if location.standard_library:
            continue

        # Defined inside this very function, so already walked.
        if (
            location.line in span and
            _standardized_path(location.filename) == filename
        ):
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
                        Servicer.Method.Call(
                            state_type=state_type, method=name, how=how
                        )
                    )
            continue

        helper, analysis = await analysis.helper_definition_at(location)
        if helper is None:
            hazards.append(_ambiguous_call(callee, filename=filename))
            continue

        if _is_agent_module(location.filename):
            # Anything in Reboot's agents module but a run is not
            # followed, so it is ambiguous like any call that is not.
            if helper.syntax.name not in RUN_NAMES:
                hazards.append(_ambiguous_call(callee, filename=filename))
                continue

            agent_definition, analysis = await _agent_definition_at(
                callee,
                filename=filename,
                text=text,
                analysis=analysis,
            )
            if agent_definition is None:
                hazards.append(
                    Servicer.Method.Hazard(
                        filename=str(filename),
                        run_on_unresolved_agent=(
                            Servicer.Method.Hazard.RunOnUnresolvedAgent(
                                callee=ast.unparse(callee),
                            )
                        ),
                    )
                )
                continue

            # What the run is given on top of its agent by its own
            # arguments is not followed, but said on the run.
            run_hazards: list[Agent.Run.Hazard] = []
            if any(keyword.arg in RUN_ARGUMENTS for keyword in node.keywords):
                run_hazards.append(
                    Agent.Run.Hazard(
                        filename=str(filename),
                        run_arguments=Agent.Run.Hazard.RunArguments(
                            call=ast.unparse(node),
                        ),
                    )
                )

            runs.append(
                Agent.Run(
                    agent=agent_definition.name,
                    hazards=run_hazards,
                )
            )
            agents.append(
                Agent(
                    name=agent_definition.name,
                    filename=agent_definition.filename,
                    external=agent_definition.external,
                    model=agent_definition.model,
                    system_prompt=agent_definition.system_prompt,
                    instructions=agent_definition.instructions,
                    description=agent_definition.description,
                    hazards=agent_definition.hazards,
                )
            )
            continue

        key = (helper.filename, helper.syntax.lineno)
        if key in visited:
            continue

        helper_findings, analysis = await _analyze_function(
            helper.syntax,
            filename=helper.filename,
            text=helper.text,
            analysis=analysis,
            visited=visited | {key},
        )
        calls.extend(helper_findings.calls)
        runs.extend(helper_findings.runs)
        hazards.extend(helper_findings.hazards)
        agents.extend(helper_findings.agents)

    return Findings(
        calls=tuple(calls),
        runs=tuple(runs),
        hazards=tuple(hazards),
        agents=tuple(agents),
    ), analysis


async def _agent_definition_at(
    callee: ast.expr,
    *,
    filename: Path,
    text: str,
    analysis: Analysis,
) -> tuple[Optional[AgentDefinition], Analysis]:
    """Returns the agent a run is made on, from what the run calls,
    e.g. `librarian.run` of `librarian.run(...)`, when the receiver is
    bound to a construction of Reboot's `Agent` with a string literal
    `name=` at the top level of a module, and `None` otherwise.

    Pyright says where the receiver is defined, resolving however the
    agent gets there: a name in this file, one imported from another,
    or an attribute of something held. What is bound there is the
    answer; see `Analysis.agent_definition_at`. A run reached any
    other way, e.g. `Agent(...).run(...)`, is made on nothing that can
    be resolved to an agent. `text` is the text of the file the run is
    written in, which may be a helper's rather than a file being
    analyzed."""
    match callee:
        case ast.Attribute(value=(ast.Name() | ast.Attribute()) as receiver):
            pass
        case _:
            return None, analysis

    line, character = _position_at_last_character(receiver)
    location = await analysis.pyright.definition_at(
        filename=filename,
        line=line,
        character=character,
        text=text,
    )
    if location is None:
        return None, analysis

    return await analysis.agent_definition_at(location)


async def _analyze_tool(
    function: ast.FunctionDef | ast.AsyncFunctionDef,
    decorator: ast.expr,
    *,
    filename: Path,
    text: str,
    analysis: Analysis,
) -> tuple[
    Optional[Agent.Tool],
    tuple[Agent, ...],
    Optional[Hazard],
    Analysis,
]:
    """Returns the tool a decorator registers a function as, with the
    agents the tool runs, when the decorator is the `tool` or
    `tool_plain` of Reboot's `Agent`; and `None` otherwise, or, for a
    tool registered on an agent that cannot be resolved, the hazard
    that says so.

    Both forms are read, the bare `@librarian.tool` and the
    parametrized `@librarian.tool(retries=2)`, whose literal `name=`
    and `description=`, if it gives them, are what the model is told.
    Whether it is a registration at all, pyright answers, from what
    the decorator calls, however it is spelled.
    """
    match decorator:
        case ast.Call(func=(ast.Name() | ast.Attribute()) as registration):
            arguments: Optional[ast.Call] = decorator
        case ast.Name() | ast.Attribute() as registration:
            arguments = None
        case _:
            return None, (), None, analysis

    line, character = _position_at_last_character(registration)
    location = await analysis.pyright.definition_at(
        filename=filename,
        line=line,
        character=character,
        text=text,
    )
    if location is None or not _is_agent_module(location.filename):
        return None, (), None, analysis

    helper, analysis = await analysis.helper_definition_at(location)
    if helper is None or helper.syntax.name not in TOOL_REGISTRATION_NAMES:
        return None, (), None, analysis

    agent_definition, analysis = await _agent_definition_at(
        registration,
        filename=filename,
        text=text,
        analysis=analysis,
    )
    if agent_definition is None:
        return None, (), Hazard(
            filename=str(filename),
            tool_on_unresolved_agent=(
                Hazard.ToolOnUnresolvedAgent(
                    registration=ast.unparse(registration),
                )
            ),
        ), analysis

    findings, analysis = await _analyze_function(
        function,
        filename=filename,
        text=text,
        analysis=analysis,
        visited=frozenset(),
    )

    return Agent.Tool(
        agent=agent_definition.name,
        filename=str(filename),
        name=(
            None if arguments is None else
            _try_constant_string(_keyword_argument_value(arguments, 'name'))
        ) or function.name,
        description=(
            (
                None if arguments is None else _try_constant_string(
                    _keyword_argument_value(arguments, 'description')
                )
            ) or ast.get_docstring(function) or None
        ),
        calls=findings.calls,
        runs=findings.runs,
        hazards=[
            *(
                [
                    Agent.Tool.Hazard(
                        filename=str(filename),
                        tool_arguments=Agent.Tool.Hazard.ToolArguments(
                            call=ast.unparse(arguments),
                        ),
                    ),
                ] if arguments is not None and any(
                    keyword.arg in TOOL_ARGUMENTS
                    for keyword in arguments.keywords
                ) else []
            ),
            *(
                Agent.Tool.Hazard(filename=hazard.filename, method=hazard)
                for hazard in findings.hazards
            ),
        ],
    ), findings.agents, None, analysis


async def _analyze_class(
    class_definition: ast.ClassDef,
    *,
    filename: Path,
    analysis: Analysis,
) -> tuple[Optional[Servicer], tuple[Agent, ...], Analysis]:
    """Returns the servicer a class is, and `None` when it is not
    one, with the agent each run its methods make is made on.

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

        servicer = Servicer(
            state_type=definition.state_type,
            filename=str(filename),
        )
        agents: list[Agent] = []

        for statement in class_definition.body:
            match statement:
                case (
                    ast.FunctionDef(name=str(name)) |
                    ast.AsyncFunctionDef(name=str(name))
                ):
                    findings, analysis = await _analyze_function(
                        statement,
                        filename=filename,
                        text=analysis.parsed[filename].text,
                        analysis=analysis,
                        visited=frozenset(),
                    )
                    servicer.methods.append(
                        Servicer.Method(
                            name=name,
                            digest=_digest(statement),
                            calls=findings.calls,
                            runs=findings.runs,
                            hazards=findings.hazards,
                        )
                    )
                    agents.extend(findings.agents)

        return servicer, tuple(agents), analysis

    return None, (), analysis


async def _analyze_file(
    filename: Path,
    analysis: Analysis,
) -> tuple[AnalyzedFile, Analysis]:
    """Returns one parsed file analyzed: an `AnalyzedFile` built
    from its `ParsedFile` -- the dependencies the parse recorded --
    with the external files the analysis read, every servicer the
    file defines, every tool it registers on an agent, and every agent
    its servicers and tools run."""
    parsed = analysis.parsed[filename]

    # A generated file defines no servicer and runs no agent, the
    # generator writes neither, so only the developer's own files
    # are searched.
    if filename.name.endswith(GENERATED_SUFFIXES):
        return AnalyzedFile(
            filename=parsed.filename,
            digest=parsed.digest,
            dependencies=parsed.dependencies,
            external=(),
            servicers=(),
            agents=(),
            tools=(),
            hazards=(),
        ), analysis

    # Emptied so that what gathers in `external` below is what
    # analyzing this one file read.
    analysis = replace(analysis, external=MappingProxyType({}))

    servicers: list[Servicer] = []

    # Every agent the file's servicers and tools run, one per name.
    agents: dict[str, Agent] = {}

    tools: list[Agent.Tool] = []
    hazards: list[Hazard] = []

    for node in ast.walk(parsed.syntax):
        match node:
            case ast.ClassDef():
                servicer, class_agents, analysis = await _analyze_class(
                    node,
                    filename=filename,
                    analysis=analysis,
                )
                if servicer is not None:
                    servicers.append(servicer)
                for class_agent in class_agents:
                    agents.setdefault(class_agent.name, class_agent)

            # Every function, wherever it is written, may be registered
            # as a tool by any of its decorators.
            case ast.FunctionDef() | ast.AsyncFunctionDef():
                for decorator in node.decorator_list:
                    tool, tool_agents, hazard, analysis = (
                        await _analyze_tool(
                            node,
                            decorator,
                            filename=filename,
                            text=parsed.text,
                            analysis=analysis,
                        )
                    )
                    if tool is not None:
                        tools.append(tool)
                    if hazard is not None:
                        hazards.append(hazard)
                    for tool_agent in tool_agents:
                        agents.setdefault(tool_agent.name, tool_agent)

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
        agents=tuple(agents.values()),
        tools=tuple(tools),
        hazards=tuple(hazards),
    ), analysis


def extract_and_sort_servicers(
    files: Mapping[Path, AnalyzedFile],
) -> list[Servicer]:
    """Returns every servicer found, sorted by the state type it
    services and the file it is written in.

    A state type appearing twice is two classes servicing it, which is
    for whoever reads this to make of what they will; a state type not
    appearing at all is one no servicer was found for, which a file
    that would not parse looks like too.
    """
    return sorted(
        (servicer for file in files.values() for servicer in file.servicers),
        key=lambda servicer: (servicer.state_type, servicer.filename),
    )


def extract_and_sort_agents(
    files: Mapping[Path, AnalyzedFile],
) -> list[Agent]:
    """Returns every agent found, one per name, sorted by name.

    An agent run in more than one file is found by each, every one
    saying the same thing about it, since each read the same
    construction; see `Agent`.
    """
    agents: dict[str, Agent] = {}
    for file in files.values():
        for agent in file.agents:
            agents.setdefault(agent.name, agent)
    return sorted(agents.values(), key=lambda agent: agent.name)


def extract_and_sort_tools(
    files: Mapping[Path, AnalyzedFile],
) -> list[Agent.Tool]:
    """Returns every tool found, sorted by the agent it is registered
    on, its name and the file it is written in; see `Agent.Tool`."""
    return sorted(
        (tool for file in files.values() for tool in file.tools),
        key=lambda tool: (tool.agent, tool.name, tool.filename),
    )


def extract_and_sort_hazards(
    files: Mapping[Path, AnalyzedFile],
) -> list[Hazard]:
    """Returns every top-level hazard found, sorted by the file it is
    written in, and within a file in the order the file's analysis met
    them; see `Hazard`."""
    return sorted(
        (hazard for file in files.values() for hazard in file.hazards),
        key=lambda hazard: hazard.filename,
    )


def _reconstitute_known(
    state: DashboardState,
) -> dict[Path, AnalyzedFile]:
    """Returns the analyzed files a previous run recorded, joined
    back together from the state: each `File` with the servicers
    recorded for its file. What a restarted watch starts from, so
    that only files that changed while the dashboard was down are
    parsed and analyzed again."""
    servicers: dict[str, list[Servicer]] = {}
    for servicer in state.servicers:
        servicers.setdefault(servicer.filename, []).append(servicer)

    tools: dict[str, list[Agent.Tool]] = {}
    for tool in state.tools:
        tools.setdefault(tool.filename, []).append(tool)

    hazards: dict[str, list[Hazard]] = {}
    for hazard in state.hazards:
        hazards.setdefault(hazard.filename, []).append(hazard)

    # Each agent is recorded once, by name; a file's agents are the
    # ones its servicers and its tools run.
    agents = {agent.name: agent for agent in state.agents}

    return {
        Path(filename):
            AnalyzedFile(
                filename=Path(filename),
                digest=file.digest,
                dependencies=MappingProxyType(dict(file.dependencies)),
                external=tuple(file.external),
                servicers=tuple(servicers.get(filename, [])),
                agents=tuple(
                    {
                        run.agent: agents[run.agent]
                        for runs in [
                            *(
                                method.runs
                                for servicer in servicers.get(filename, [])
                                for method in servicer.methods
                            ),
                            *(tool.runs
                              for tool in tools.get(filename, [])),
                        ]
                        for run in runs
                        if run.agent in agents
                    }.values()
                ),
                tools=tuple(tools.get(filename, [])),
                hazards=tuple(hazards.get(filename, [])),
            ) for filename, file in state.code_files.items()
    }


def _known_from(state: DashboardState) -> dict[Path, AnalyzedFile]:
    """Returns what a restarted watch starts from: the analyzed files
    the state records, joined back together by `_reconstitute_known`.

    Recorded by an analysis of another version, which may not record
    what this one does, each is kept -- so that what changes is still
    told apart from what was there all along -- but without the digest
    that says it need not be analyzed again, so every file is.
    """
    known = _reconstitute_known(state)
    if state.code_analysis_version == CODE_ANALYSIS_VERSION:
        return known
    return {
        filename: replace(file, digest=b'') for filename, file in known.items()
    }


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
        agent_files=MappingProxyType({}),
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


# How a generated module records which API it was generated from:
# its fifth line, after the four tool directives the generator always
# writes first, as `reboot/templates/reboot.py.j2` writes it, which
# is where this spelling and this line number have to match.
_API_DIGEST_PREFIX = b'# Generated from an API digesting to '
_API_DIGEST_LINE = 5


async def _try_extract_api_digest(path: Path) -> Optional[str]:
    """Returns the digest a generated module records having been
    generated from, and `None` when it records none: one generated
    from a `.proto`, or by a Reboot before digests were recorded."""
    line = b''
    async with aiofiles.open(path, 'rb') as file:
        for _ in range(_API_DIGEST_LINE):
            line = await file.readline()
    if not line.startswith(_API_DIGEST_PREFIX):
        return None
    return line[len(_API_DIGEST_PREFIX):].rstrip(b'.\r\n').decode()


async def _list_generated(
    generated_directory: Optional[Path],
) -> Mapping[str, Generated]:
    """Returns every `_rbt` module under the generated directory, the
    one `rbt generate` writes per API file, keyed by its path
    relative to the directory, e.g. `shop/v1/shop_rbt.py`, with the
    time it was last modified and the digest it records having been
    generated from; and nothing for no directory. Listed off the
    event loop, since a large directory takes a while to walk and
    stat."""
    if generated_directory is None:
        return MappingProxyType({})

    def listing() -> dict[Path, Timestamp]:
        return {
            path: _modified_at(path)
            for path in generated_directory.glob('**/*_rbt.py')
            if path.is_file()
        }

    generated: dict[str, Generated] = {}
    for path, modified in (await asyncio.to_thread(listing)).items():
        generated[path.relative_to(generated_directory).as_posix()] = (
            Generated(
                modified=modified,
                api_digest=await _try_extract_api_digest(path),
            )
        )

    return MappingProxyType(generated)


async def _walk_and_analyze(
    *,
    application: Path,
    roots: list[Path],
    generated_directory: Optional[Path],
    known: Mapping[Path, AnalyzedFile],
    generated: Mapping[str, Generated],
) -> tuple[Optional[dict[Path, AnalyzedFile]], dict[str, Generated],
           list[Change]]:
    """Walks and analyzes the application and lists the generated
    directory: what one iteration of the watch reads off the disk.

    Returns what is known now, what the generated directory holds
    now and what changed; and `None` for an analysis that reproduces
    exactly what `known` already records, which writes nothing.
    """
    unchanged, parsed, _, _ = await _walk(
        entries=[application],
        roots=roots,
        known=known,
    )

    # A fresh pyright for every analysis, so that it reads every
    # file the way the disk has it right now: generated code,
    # installed packages and the developer's own files alike, with
    # nothing remembered from an earlier iteration to go stale.
    # Rooted where the dashboard runs, which is the developer's
    # working directory, the one both the application and the
    # generated directory may be given as relative to; a moved
    # working directory is re-rooted here by the next iteration.
    #
    # TODO: keep one pyright running across iterations and send
    # `workspace/didChangeWatchedFiles` built from the generated
    # files' fingerprint diff instead of starting anew, sparing the
    # start and the cold analysis per iteration. That first takes
    # verifying that pyright does not ignore notifications for
    # files it never registered watchers over, and accounting for
    # the working directory moving, which today is handled by every
    # iteration's fresh start being rooted at the current directory
    # and would again take a restart.
    # Absolute, since pyright does not resolve `extraPaths` against
    # the root; a root outside the working directory is absolute
    # already, and joining leaves it alone.
    pyright = Pyright()
    await pyright.start(
        root=Path.cwd(),
        extra_paths=[Path.cwd() / root for root in roots],
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

    generated_now = await _list_generated(generated_directory)

    # Everything else the state records, the servicers and the
    # files, is derived from the analyzed files, so comparing those
    # and the listing is comparing all of it.
    if known_now == known and generated_now == generated:
        return None, {}, []

    # The result is memoized with `pickle`, which cannot serialize
    # a `MappingProxyType`, so each file's mappings are plain.
    known_now = {
        filename: replace(file, dependencies=dict(file.dependencies))
        for filename, file in known_now.items()
    }

    changes = list(
        code_changes_between(
            extract_and_sort_servicers(known),
            extract_and_sort_servicers(known_now),
        )
    )

    return known_now, dict(generated_now), changes


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
        generated_directory = _standardized_path(generated_directory)
        roots.append(generated_directory)

    globs = [str(root / SOURCE_GLOB) for root in roots]

    # What a previous run recorded: starting from it, only files
    # that changed while the dashboard was down are parsed and
    # analyzed again, and an iteration that reproduces exactly what
    # the state already records writes nothing.
    state = await Dashboard.ref().always().read(context)
    known: Mapping[Path, AnalyzedFile] = _known_from(state)
    generated: Mapping[str, Generated] = state.generated

    # Whether this process has yet to wait for a save: a restart
    # is itself a reason to analyze the application again.
    restarted = True

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
                # Memoized per iteration, so a workflow restarted
                # mid-iteration records the same `Update` it was
                # recording, which is what the idempotency of the
                # write needs.
                analyzed, check = await at_least_once(
                    'Walk and analyze',
                    context,
                    partial(
                        timed,
                        partial(
                            _walk_and_analyze,
                            application=application,
                            roots=roots,
                            generated_directory=generated_directory,
                            known=known,
                            generated=generated,
                        ),
                    ),
                )
                known_now, generated_now, changes = analyzed

                # A write wakes every browser reading `Get`, so one
                # is only made when the analysis found a difference. We
                # include the check so that it is recorded atomically
                # with the changes; a check that found none is recorded
                # on its own.
                if known_now is not None:
                    servicers = extract_and_sort_servicers(known_now)
                    agents = extract_and_sort_agents(known_now)
                    tools = extract_and_sort_tools(known_now)
                    hazards = (extract_and_sort_hazards(known_now))

                    # The file messages the write below records,
                    # built before the write so that the state is
                    # not held open while the files are iterated.
                    files = {
                        str(filename):
                            File(
                                digest=file.digest,
                                dependencies=file.dependencies,
                                external=file.external,
                            ) for filename, file in known_now.items()
                    }

                    # A file that changes after this write is
                    # simply parsed again by a restarted walk,
                    # which its digest says.
                    await Dashboard.ref().per_iteration('Update').UpdateCode(
                        context,
                        servicers=servicers,
                        agents=agents,
                        tools=tools,
                        hazards=hazards,
                        code_analysis_version=CODE_ANALYSIS_VERSION,
                        code_files=files,
                        generated=dict(generated_now),
                        changes=changes,
                        check=check,
                    )

                    known = known_now
                    generated = generated_now
                else:
                    await Dashboard.ref().per_iteration('Check').RecordCheck(
                        context,
                        code=check,
                    )

                # If we're restarting this workflow we might be in
                # an iteration that has already memoized
                # `_walk_and_analyze` and thus we don't want to wait
                # on an `event` because there may be changes that we
                # want to analyze and handle immediately. Thus, we
                # always go to the next iteration immediately when
                # we've `restarted`. Worse case we have an iteration
                # where `known_now` is `None` so we just wait on the
                # `event`.
                if restarted:
                    restarted = False
                    continue

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
