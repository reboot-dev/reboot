"""Finds the Reboot calls the developer's methods make.

Reads their source rather than importing it. Importing would need the
application's `sys.path` and its generated `_rbt` modules, which is to
say a tree that builds; the dashboard is meant to work before one
does, and a half-written file is the normal case while someone is
typing.

Nothing here needs the generated code anyway. A state type only
becomes reachable by importing a generated module, and
`from bank.v1.account_rbt import Account` names `bank.v1.Account`
outright -- the same spelling the API files produce.

What the analysis cannot follow it records, as `Unanalyzed`, so that
what it does not know is visible rather than merely missing.
"""
import ast
import os
from dataclasses import dataclass
from rbt.dashboard.v1.dashboard_pb2 import Call, MethodCalls
from typing import Optional, Union

# The suffix a generated Python module carries. A name imported from
# one is a state type, and the package it came from qualifies it.
GENERATED_SUFFIX = '_rbt'

# Chain methods that say when or how a call happens without changing
# what is called, so a call written through them still names a state
# type and a method.
_IDEMPOTENCY_MODIFIERS = frozenset(
    [
        'idempotently',
        'per_workflow',
        'per_iteration',
        'always',
    ]
)

# Chain methods that a call is still written through, but which say
# enough about the call to be worth reporting on their own.
_HOW_MODIFIERS: dict[str, 'Call.How.ValueType'] = {
    'reactively': Call.REACTIVELY,
    'until': Call.UNTIL,
    'schedule': Call.SCHEDULE,
    'spawn': Call.SPAWN,
}

# Class methods that hand back a reference without calling anything.
_REFERENCE_ENTRIES = frozenset(['ref', 'forall'])

# Reference methods that reach the state itself rather than one of its
# methods, and so name no method.
_STATE_TERMINALS: dict[str, 'Call.How.ValueType'] = {
    'read': Call.READ,
    'write': Call.WRITE,
}

# What a servicer class defines that is not one of its state's
# methods.
_NOT_A_METHOD = frozenset(['authorizer'])


class _Context:
    """The context a Reboot method is given, or anything bound from
    it. Passing one to a function is what makes that function worth
    following: it is how the function can make a call of its own."""


_CONTEXT = _Context()


@dataclass(frozen=True)
class _StateClass:
    """A generated state class, such as the `Account` bound by
    `from bank.v1.account_rbt import Account`."""
    state_type: str


@dataclass(frozen=True)
class _Reference:
    """A reference to a state, and how far along the chain between the
    reference and a method the source has got."""
    state_type: str
    how: 'Call.How.ValueType'


@dataclass(frozen=True)
class _Constructed:
    """What a constructor hands back: a reference, and a response."""
    state_type: str


@dataclass(frozen=True)
class _Servicer:
    """The `self` of a servicer method."""
    state_type: str
    module: str
    name: str


_Value = Union[_StateClass, _Reference, _Constructed, _Servicer, _Context,
               None]

_Function = Union[ast.FunctionDef, ast.AsyncFunctionDef]


def method_key(state_type: str, method: str) -> str:
    """Names one method the way `Analysis`es are keyed."""
    return f'{state_type}.{method}'


@dataclass
class Module:
    """One of the developer's source files, parsed."""

    # Dotted, relative to the source directory, e.g. `bank_servicer`.
    name: str

    # State classes this file imported, by the name it calls them:
    # `Account` -> `bank.v1.Account`.
    state_classes: dict[str, str]

    # Names this file imported from another file in the same tree, by
    # the name it calls them: `helper` -> (`helpers`, `do_transfer`).
    imports: dict[str, tuple[str, str]]

    # Whole modules this file imported, by the name it calls them:
    # `helpers` -> `helpers`.
    modules: dict[str, str]

    functions: dict[str, _Function]
    classes: dict[str, ast.ClassDef]


def _state_type(module_name: str, name: str) -> Optional[str]:
    """The state type a name imported from `module_name` refers to,
    if `module_name` is a generated module.

    `bank.v1.account_rbt` and `Account` give `bank.v1.Account`: the
    package qualifies the name, exactly as the directory of an API
    file qualifies what it declares.
    """
    if not module_name.endswith(GENERATED_SUFFIX):
        return None

    if '.' not in module_name:
        return name

    return f'{module_name.rsplit(".", 1)[0]}.{name}'


def parse(name: str, source: str) -> Module:
    """Reads one source file. Raises `SyntaxError` on a file that is
    half written, which is for the caller to report."""
    tree = ast.parse(source)

    module = Module(
        name=name,
        state_classes={},
        imports={},
        modules={},
        functions={},
        classes={},
    )

    for statement in tree.body:
        match statement:
            case ast.Import(names=names):
                for alias in names:
                    module.modules[alias.asname or alias.name] = alias.name

            # A relative import names no module of its own, and
            # `from . import x` has nowhere to be read from here.
            case ast.ImportFrom(module=str(imported), level=0, names=names):
                for alias in names:
                    bound = alias.asname or alias.name
                    state_type = _state_type(imported, alias.name)
                    if state_type is not None:
                        module.state_classes[bound] = state_type
                    else:
                        module.imports[bound] = (imported, alias.name)

            case ast.FunctionDef(name=name) | ast.AsyncFunctionDef(name=name):
                module.functions[name] = statement

            case ast.ClassDef(name=name):
                module.classes[name] = statement

    return module


def _servicer_state_type(
    class_definition: ast.ClassDef,
    module: Module,
) -> Optional[str]:
    """The state type a class services, if it services one.

    A servicer says so by what it inherits: `Account.Servicer`, or
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
                state_type = module.state_classes.get(name)
                if state_type is not None:
                    return state_type

    return None


class _MethodAnalyzer:
    """Finds what one method calls."""

    def __init__(self, modules: dict[str, Module]):
        self._modules = modules
        self._calls: list[Call] = []

    def analyze(
        self,
        module: Module,
        servicer: _Servicer,
        method: _Function,
    ) -> MethodCalls:
        environment = self._parameters(method, servicer)

        self._statements(method.body, module, environment)

        return MethodCalls(
            state_type=servicer.state_type,
            method=method.name,
            calls=_unique(self._calls),
        )

    def _parameters(
        self,
        function: _Function,
        servicer: Optional[_Servicer],
    ) -> dict[str, _Value]:
        """Binds a method's parameters.

        A Reboot method takes its context first, after `self` or `cls`.
        """
        environment: dict[str, _Value] = {}

        names = [argument.arg for argument in function.args.args]

        if servicer is not None and len(names) > 0:
            if names[0] in ('self', 'cls'):
                environment[names[0]] = servicer
                names = names[1:]
            if len(names) > 0:
                environment[names[0]] = _CONTEXT

        return environment

    ###################################################################
    # Statements.

    def _statements(
        self,
        statements: list[ast.stmt],
        module: Module,
        environment: dict[str, _Value],
    ) -> None:
        for statement in statements:
            self._statement(statement, module, environment)

    def _statement(
        self,
        statement: ast.stmt,
        module: Module,
        environment: dict[str, _Value],
    ) -> None:
        match statement:
            case ast.Assign(targets=targets, value=value_node):
                value = self._expression(value_node, module, environment)
                for target in targets:
                    self._bind(target, value, module, environment)

            case ast.AnnAssign(target=target, value=ast.expr() as value_node):
                value = self._expression(value_node, module, environment)
                self._bind(target, value, module, environment)

            # `x += y` leaves `x` whatever it already was, so
            # evaluating `y` is all there is to do.
            case ast.AugAssign(value=value_node):
                self._expression(value_node, module, environment)

            case ast.Return(value=ast.expr() as value_node):
                self._expression(value_node, module, environment)

            # A function written inside a method can use the context it
            # closes over, so it is read here, where what it closes
            # over is known.
            case (
                ast.FunctionDef(args=args, body=body) |
                ast.AsyncFunctionDef(args=args, body=body)
            ):
                nested = dict(environment)
                for parameter in args.args:
                    nested.pop(parameter.arg, None)
                self._statements(body, module, nested)

            case (
                ast.
                For(iter=iterated, target=target, body=body, orelse=orelse) |
                ast.AsyncFor(
                    iter=iterated, target=target, body=body, orelse=orelse
                )
            ):
                self._expression(iterated, module, environment)
                self._bind(target, None, module, environment)
                self._statements(body, module, environment)
                self._statements(orelse, module, environment)

            case (
                ast.With(items=items, body=body) |
                ast.AsyncWith(items=items, body=body)
            ):
                for item in items:
                    value = self._expression(
                        item.context_expr, module, environment
                    )
                    match item.optional_vars:
                        case ast.expr() as target:
                            self._bind(target, value, module, environment)
                self._statements(body, module, environment)

            case ast.Try(
                body=body, handlers=handlers, orelse=orelse,
                finalbody=finalbody
            ):
                self._statements(body, module, environment)
                for handler in handlers:
                    self._statements(handler.body, module, environment)
                self._statements(orelse, module, environment)
                self._statements(finalbody, module, environment)

            case (
                ast.If(test=test, body=body, orelse=orelse) |
                ast.While(test=test, body=body, orelse=orelse)
            ):
                self._expression(test, module, environment)
                self._statements(body, module, environment)
                self._statements(orelse, module, environment)

            # A class written inside a method defines methods of its
            # own, which are not this method's to read.
            case ast.ClassDef():
                pass

            case _:
                for child in ast.iter_child_nodes(statement):
                    match child:
                        case ast.expr():
                            self._expression(child, module, environment)

    def _bind(
        self,
        target: ast.expr,
        value: _Value,
        module: Module,
        environment: dict[str, _Value],
    ) -> None:
        match target:
            case ast.Name(id=name):
                environment[name] = value

            # A constructor hands back a reference and a response, so
            # `account, _ = await Account.open(context, id)` binds a
            # reference to the first name.
            case ast.Tuple(elts=elements) | ast.List(elts=elements):
                for index, element in enumerate(elements):
                    element_value: _Value = None
                    match value:
                        case _Constructed(state_type=state_type) if index == 0:
                            element_value = _Reference(state_type, Call.CALL)
                    self._bind(element, element_value, module, environment)

    ###################################################################
    # Expressions.

    def _expression(
        self,
        node: ast.expr,
        module: Module,
        environment: dict[str, _Value],
    ) -> _Value:
        """What an expression is worth to the analysis, recording any
        calls written inside it along the way."""
        match node:
            case ast.Await(value=awaited):
                return self._expression(awaited, module, environment)

            case ast.Name(id=name):
                if name in environment:
                    return environment[name]
                state_type = module.state_classes.get(name)
                return None if state_type is None else _StateClass(state_type)

            case ast.Call():
                return self._call(node, module, environment)

            case ast.Attribute(value=value_node):
                self._expression(value_node, module, environment)
                return None

            case ast.Subscript(value=value_node, slice=index):
                value = self._expression(value_node, module, environment)
                self._expression(index, module, environment)
                # The reference half of what a constructor handed back.
                match value, index:
                    case _Constructed(state_type=state_type
                                     ), ast.Constant(value=0):
                        return _Reference(state_type, Call.CALL)
                return None

            case (
                ast.List(elts=elements) | ast.Tuple(elts=elements) |
                ast.Set(elts=elements)
            ):
                for element in elements:
                    self._expression(element, module, environment)
                return None

            case ast.Dict(keys=keys, values=values):
                for key in keys:
                    # A `**rest` in a dict display names no key.
                    match key:
                        case ast.expr():
                            self._expression(key, module, environment)
                for value_node in values:
                    self._expression(value_node, module, environment)
                return None

            case (
                ast.ListComp(generators=generators, elt=element) |
                ast.SetComp(generators=generators, elt=element) |
                ast.GeneratorExp(generators=generators, elt=element)
            ):
                self._comprehension(generators, [element], module, environment)
                return None

            case ast.DictComp(
                generators=generators, key=key, value=value_node
            ):
                self._comprehension(
                    generators, [key, value_node], module, environment
                )
                return None

            case ast.Lambda(args=args, body=body):
                nested = dict(environment)
                for parameter in args.args:
                    nested.pop(parameter.arg, None)
                self._expression(body, module, nested)
                return None

            # Anything else is walked into rather than understood, so
            # that a call written inside it is still found.
            case _:
                for child in ast.iter_child_nodes(node):
                    match child:
                        case ast.expr():
                            self._expression(child, module, environment)
                return None

    def _comprehension(
        self,
        generators: list[ast.comprehension],
        elements: list[ast.expr],
        module: Module,
        environment: dict[str, _Value],
    ) -> None:
        nested = dict(environment)
        for generator in generators:
            self._expression(generator.iter, module, nested)
            self._bind(generator.target, None, module, nested)
            for condition in generator.ifs:
                self._expression(condition, module, nested)
        for element in elements:
            self._expression(element, module, nested)

    ###################################################################
    # Calls.

    def _call(
        self,
        node: ast.Call,
        module: Module,
        environment: dict[str, _Value],
    ) -> _Value:
        # Once, up front: evaluating an argument is what finds a call
        # written inside it, and doing it twice would find it twice.
        arguments = _Arguments(
            positional=[
                self._expression(argument, module, environment)
                for argument in node.args
            ],
            keyword={
                keyword.arg:
                    self._expression(keyword.value, module, environment)
                for keyword in node.keywords
                if keyword.arg is not None
            },
        )

        match node.func:
            case ast.Attribute(value=value_node, attr=attribute):
                receiver = self._expression(value_node, module, environment)
                return self._receiver_call(
                    node, receiver, attribute, arguments, module, environment
                )

            case ast.Name(id=name):
                return self._named_call(
                    node, name, arguments, module, environment
                )

            case _:
                self._expression(node.func, module, environment)
                return None

    def _receiver_call(
        self,
        node: ast.Call,
        receiver: _Value,
        attribute: str,
        arguments: '_Arguments',
        module: Module,
        environment: dict[str, _Value],
    ) -> _Value:
        match receiver:
            case _StateClass(state_type=state_type):
                if attribute in _REFERENCE_ENTRIES:
                    return _Reference(state_type, Call.CALL)

                if attribute in _IDEMPOTENCY_MODIFIERS:
                    # `Account.per_workflow('open').open(context)`:
                    # still the class, still about to construct.
                    return receiver

                if not arguments.takes_context:
                    # A state class carries its request, response and
                    # error types too, and `Account.WithdrawAborted(...)`
                    # makes one of those rather than an account. A
                    # constructor is what takes the context first.
                    return None

                self._called(state_type, attribute, Call.CONSTRUCT)
                return _Constructed(state_type)

            case _Reference(state_type=state_type, how=how):
                if attribute in _IDEMPOTENCY_MODIFIERS:
                    return receiver

                modified = _HOW_MODIFIERS.get(attribute)
                if modified is not None:
                    return _Reference(state_type, modified)

                terminal = _STATE_TERMINALS.get(attribute)
                if terminal is not None:
                    self._called(state_type, '', terminal)
                    return None

                self._called(state_type, attribute, how)
                return None

            case _Servicer(state_type=state_type):
                if attribute == 'ref':
                    return _Reference(state_type, Call.CALL)
                return None

            # The context's own API, such as `context.loop(...)`, is
            # not a call to a state.
            case _Context():
                return None

            case _:
                return None

    def _named_call(
        self,
        node: ast.Call,
        name: str,
        arguments: '_Arguments',
        module: Module,
        environment: dict[str, _Value],
    ) -> _Value:
        # Calling a state class itself is not something the generated
        # code offers; nothing to say about it.
        return None

    def _called(
        self,
        state_type: str,
        method: str,
        how: 'Call.How.ValueType',
    ) -> None:
        self._calls.append(Call(state_type=state_type, method=method, how=how))


@dataclass(frozen=True)
class _Arguments:
    """What a call was given, already evaluated."""
    positional: list[_Value]
    keyword: dict[str, _Value]

    @property
    def takes_context(self) -> bool:
        """Whether a context comes first, which is how every Reboot
        method is called and how a constructor is told apart from the
        request and error types a state class also carries."""
        return len(self.positional) > 0 and self.positional[0] is _CONTEXT


def _unique(messages: list) -> list:
    """The same list without repeats, in the order they were found.

    A method that calls the same thing twice says nothing more than one
    that calls it once.
    """
    seen: set[bytes] = set()
    unique = []
    for message in messages:
        serialized = message.SerializeToString(deterministic=True)
        if serialized not in seen:
            seen.add(serialized)
            unique.append(message)
    return unique


def analyze(modules: dict[str, Module]) -> dict[str, MethodCalls]:
    """Analyzes every servicer method in a tree of parsed files."""
    analyses: dict[str, MethodCalls] = {}

    for module in modules.values():
        for class_definition in module.classes.values():
            state_type = _servicer_state_type(class_definition, module)
            if state_type is None:
                continue

            servicer = _Servicer(
                state_type=state_type,
                module=module.name,
                name=class_definition.name,
            )

            for statement in class_definition.body:
                match statement:
                    case (
                        ast.FunctionDef(name=name) |
                        ast.AsyncFunctionDef(name=name)
                    ) if (
                        name not in _NOT_A_METHOD and not name.startswith('_')
                    ):
                        pass
                    case _:
                        continue

                key = method_key(state_type, name)

                analyses[key] = _MethodAnalyzer(modules).analyze(
                    module, servicer, statement
                )

    return analyses


def module_name(filename: str) -> str:
    """The dotted name a source file goes by, relative to the source
    directory it was found in."""
    return filename.rsplit('.py', 1)[0].replace(os.sep, '.')
