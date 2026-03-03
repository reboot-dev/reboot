import argparse
import os
import re
import shlex
import sys
import weakref
from abc import ABC, abstractmethod
from collections import defaultdict
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from reboot.cli import terminal
from typing import Any, Callable, Optional

# Type aliases to help better understand types.
Subcommand = str
Config = str
Flag = str
Flags = defaultdict[tuple[Subcommand, Optional[Config]], list[Flag]]

# String representing flags for "common" expansion.
COMMON_PATTERN = '...'

# Regular expressions for matching lines in the .rc file.
#
# A line in the .rc file consists of a subcommand, an optional config, and a
# list of arguments.
#
# A subcommand is either a sequence of words separated by spaces, e.g., 'foo bar
# baz' or the COMMON_PATTERN above.
# Each word in a sequence must start with a letter and can contain letters,
# numbers, and hyphens. A word can not start with a hyphen or a number.
SUBCOMMAND_REGEX = '(%s|%s)' % (
    re.escape(COMMON_PATTERN),
    r'([a-zA-Z][a-zA-Z0-9-]*(?:\s+[a-zA-Z][a-zA-Z0-9-]*)*)',
)
# A config starts with a letter but can contain letters, numbers, and hyphens.
CONFIG_REGEX = r'[a-zA-Z][a-zA-Z0-9-]*'
# An argument is a sequence of non-space characters.
ARGUMENTS_REGEX = r'(([^\s]+)\s*)+'


class StoreOnceActionBase(argparse.Action):
    """Base class for argparse Actions that only allow a flag to be set once."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        # Record which `namespace`s we've seen `self.dest` in. We can't just check
        # whether or not the flag is `None` in `namespace` (e.g., via
        # `getattr(namespace, ...)` because it might not be `None` if there is a default
        # value.
        #
        # We use a list of `weakref.ref` to defend against potential reuse of object `id`s,
        # while avoiding keeping `namespace` objects alive unnecessarily. We don't use
        # `WeakSet` because `namespace` objects are not hashable.
        self._already_seen_for_namespace: list[weakref.ref] = []

    def _is_duplicate(self, namespace) -> bool:
        """Check if this namespace has already had the flag set."""
        namespace_ref = weakref.ref(namespace)
        return namespace_ref in self._already_seen_for_namespace

    def _mark_seen_and_store(self, namespace, values):
        """Mark this namespace as having seen the flag."""
        self._already_seen_for_namespace.append(weakref.ref(namespace))
        setattr(namespace, self.dest, values)


class StoreOnceAction(StoreOnceActionBase):
    """Helper action that ensures that only one instance of a flag that is
    not meant to be repeated is present.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

    def __call__(self, parser, namespace, values, option_string=None):
        if self._is_duplicate(namespace):
            parser.error(self._error())
        else:
            self._mark_seen_and_store(namespace, values)

    def _error(self) -> str:
        return (
            f"the flag '--{self.dest.replace('_', '-')}' was set multiple "
            "times; it can only be set once, including in the `.rbtrc` file"
        )


class StoreOnceIncludingEnvvarsActionBase(StoreOnceAction):
    """Helper action that ensures that only one instance of a flag that is
    not meant to be repeated is present, including environment variables.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

    def _envvar_error_str(self, envvar_names: list[str]) -> str:
        return (
            " or in the environment variable" +
            ("s" if len(envvar_names) > 1 else "") + " '" +
            "' or '".join(envvar_names) + "'"
        )


class StoreOnceIncludingEnvvarsAction(StoreOnceIncludingEnvvarsActionBase):

    def __init__(
        self,
        envvar_names: list[str],
        **kwargs,
    ):
        assert len(envvar_names) > 0
        super().__init__(**kwargs)
        self._envvar_names = envvar_names

    def _error(self) -> str:
        return (super()._error() + self._envvar_error_str(self._envvar_names))


def store_once_including_envvars_action_factory(
    envvar_names: list[str]
) -> Callable[[], StoreOnceIncludingEnvvarsAction]:

    def _make(**kwargs):
        return StoreOnceIncludingEnvvarsAction(
            envvar_names=envvar_names, **kwargs
        )

    return _make


class TransformerError(ValueError):
    """Raised when a transformer fails to transform a value."""

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class BaseTransformer(ABC):
    """Base class a transformer.

    When an argument is being parsed, a transformer can modify the
    user-provided flag values to take a different shape than the original input.
    For example, a transformer could make all letters in a flag value uppercase,
    or split a comma separated string, e.g., `'string,of,words'.split(',')`.
    """

    @abstractmethod
    def transform(self, value: str) -> Any:
        raise NotImplementedError


class NonEmptyStringTransformer(BaseTransformer):
    """A transformer that ensures a string is not empty."""

    def __init__(self, argument: str):
        self._argument = argument

    def transform(self, value: str) -> Any:
        if not value.strip():
            raise TransformerError(
                f"The argument '{self._argument}' must be a non-empty string"
            )
        return value


class MakePathAbsoluteTransformer(BaseTransformer):
    """A transformer that makes a relative path absolute."""

    def __init__(self, argument: str, root: Path):
        self._argument = argument
        self._root = root

    def transform(self, value: str) -> Path:
        path = Path(value)
        if path.is_absolute():
            return path
        return self._root / path


def _subparser_name(subcommand: str) -> str:
    # Due to confusing error message when somebody typing wrong
    # invocation (i.e. 'rbt dev'), we need to store the subcommand in
    # the namespace not as 'dev', but 'dev subcommand' and we want to
    # hide it from a user.
    return f'{subcommand} subcommand'


class _Parser(ABC):
    """Helper class that encapsulates an `argparse.ArgumentParser` so that
    we can control how arguments are added and to validate them for
    correctness and consistency with other args.
    """

    _parser: argparse.ArgumentParser
    _subparsers: Optional[argparse._SubParsersAction]

    _argument_types: dict[str, type]

    def __init__(self, parser: argparse.ArgumentParser, cwd: Path):
        self._parser = parser
        self._cwd = cwd
        self._subparsers = None
        self._argument_types: dict[str, type] = {}
        self._transformers: dict[str, Optional[BaseTransformer]] = {}
        # Maps: environment variable name to the argument it sets.
        self._arg_by_envvar_name: dict[str, str] = {}

    def add_argument(
        self,
        name: str,
        *,
        type: type,
        help: str,
        repeatable: bool = False,
        environment_variables: Optional[list[str]] = None,
        required: Optional[bool] = None,
        default: Optional[Any] = None,
        transformer: Optional[BaseTransformer] = None,
        choices: Optional[list] = None,
        non_empty_string: bool = False,
        action: Optional[Callable] = None,
    ) -> None:
        """Adds an argument. Unlike `argparse.ArgumentParser` this requires
        `type` and `help` so that we ensure we create a better
        experience for our end users, and it allows `environment_variables` to
        allow users to pass arguments via environment variables instead of on
        the command line.
        """
        if environment_variables is None:
            environment_variables = []

        if name.startswith('-') and not name.startswith('--'):
            raise ValueError(
                f"Invalid argument '{name}': flags must start "
                "with '--' not '-'"
            )

        elif name.startswith('--') and '_' in name:
            raise ValueError(
                f"Invalid argument '{name}': flags must use kebab case"
            )

        elif repeatable and default is not None:
            raise ValueError(
                f"Invalid argument '{name}': can not be "
                "'repeatable' and have a 'default'"
            )

        elif repeatable and type == bool:
            raise ValueError(
                f"Invalid argument '{name}': 'bool' "
                "arguments can not be 'repeatable'"
            )

        if type != str and non_empty_string:
            raise ValueError(
                f"Invalid argument '{name}': 'non_empty_string' "
                "can only be used with 'str' arguments"
            )

        if non_empty_string and transformer is not None:
            raise ValueError(
                f"Invalid argument '{name}': 'non_empty_string' "
                "can not be used with a 'transformer', consider your "
                "transformer to ensure the string is not empty"
            )

        if len(environment_variables) > 0:
            help += (
                "; can also be set via environment variable" +
                ("s" if len(environment_variables) > 1 else "") + " '" +
                "' or '".join(environment_variables) + "'"
            )

        kwargs: dict[str, Any] = {
            'type': type,
            'help': help,
            'choices': choices,
        }

        if type is bool:
            kwargs['action'] = argparse.BooleanOptionalAction
        elif repeatable:
            if name.startswith('--'):
                # Repeated flags use the 'append' action.
                kwargs['action'] = 'append'
            else:
                # Repeated positional arguments use 'nargs'.
                if required:
                    kwargs['nargs'] = '+'
                else:
                    kwargs['nargs'] = '*'
        elif name.startswith('--'):
            if action is not None:
                kwargs['action'] = action
            elif len(environment_variables) == 0:
                kwargs['action'] = StoreOnceAction
            else:
                kwargs['action'] = store_once_including_envvars_action_factory(
                    environment_variables
                )

        if name.startswith('--') and required is not None:
            kwargs['required'] = required

        if default is not None:
            kwargs['default'] = default

        self._parser.add_argument(name, **kwargs)

        self._argument_types[name] = type

        if type == Path and default is not None:
            # When the user specifies a value for their path argument,
            # `_normalize_path_arguments()` is called to make the path absolute.
            # However, in this case the user _didn't_ specify a value for their
            # path argument, so `_normalize_path_arguments()` didn't run.
            # Furthermore, there is a _default_ value for the path, which may be
            # relative. We must run an additional step to make the default path
            # value absolute.
            transformer = MakePathAbsoluteTransformer(name, self._cwd)

        if non_empty_string:
            transformer = NonEmptyStringTransformer(name)

        if transformer is not None:
            # Later we will use the name of the argument from the parsed
            # namespace, where we store the argument using '_' instead of
            # '-'.
            if name.startswith('--'):
                name = name[:2] + name[2:].replace('-', '_')
            else:
                name = name.replace('-', '_')

        self._transformers[name] = transformer

        for environment_variable in environment_variables:
            existing_arg = self._arg_by_envvar_name.get(environment_variable)
            if existing_arg is not None:
                raise ValueError(
                    f"Environment variable named '{environment_variable}' is "
                    f"registered for both '{existing_arg}' and '{name}'"
                )
            self._arg_by_envvar_name[environment_variable] = name

    def get_argument_type(self, name: str) -> Optional[type]:
        """Helper that returns the type of an argument value."""
        return self._argument_types.get(name, None)

    def get_transformer(self, name: str) -> Optional[BaseTransformer]:
        """Returns the specified argument's transformer or `None`."""
        return self._transformers.get(name, None)


class SubcommandParser(_Parser):

    def __init__(
        self,
        subcommand: str,
        parser: argparse.ArgumentParser,
        cwd: Path,
    ):
        super().__init__(parser=parser, cwd=cwd)
        self._subcommand = subcommand

    def get_subparsers(self) -> argparse._SubParsersAction:
        """Create subcommand parser for the subcommand."""
        if self._subparsers is None:
            self._subparsers = self._parser.add_subparsers(
                dest=_subparser_name(self._subcommand), required=True
            )

        return self._subparsers


class HelpFormatter(argparse.HelpFormatter):
    """Helper formatter that replaces all '--flag FLAG' with
    '--flag=FLAG'.
    """

    def format_help(self) -> str:
        # Get the default formatted help.
        help = super().format_help()

        # And replace all '--flag FLAG' with '--flag=FLAG'.
        return re.sub(r'(--[a-z-]+)[ ]([A-Z_]+)', r'\1=\2', help)


def add_common_channel_args(subcommand: SubcommandParser):
    subcommand.add_argument(
        '--application-url',
        type=str,
        help=
        "the URL of the Reboot application's API; e.g. a1234.prod1.rbt.cloud",
        required=True,
    )


class ArgumentParser(_Parser):
    """A CLI argument/options/flags parser that knows how to expand
    arguments found in a '.rc', e.g, '.rbtrc'.

    Formatting expected in a '.rc' file:

    (1) Comments. Any line starting with a '#' is skipped. All text
        after a trailing '#' is also dropped.

    (2) "Common" flags, i.e., flags that are relevant for all
        subcommands, defined by the top-level parser, are
        distinguished via a line that starts with {COMMON_PATTERN},
        e.g., '...':

        # Always expanded.
        ... --more-flags=42 and_args here

    (3) Subcommand specific flags:

        # Always expanded when invoking subcommand.
        subcommand --more-flags=42 and_args here

    (4) Config flags expanded from '--config=foo' for both "common"
        and subcommands:

        # Only expanded if --config=foo.
        ...:foo --flag=42
        subcommand:foo --more-flags=42

    (5) Recursive configs are fully supported:

        dev:fullstack --fullstack

        dev:demo --config=fullstack

    (6) All lines are aggregated.

        dev:demo --config=fullstack  # The demo is "fullstack".
        dev:demo --name=demo         # Name of demo.
        dev:demo --python            # Uses Python.


    TODO(benh): move this into own file 'rc_argument_parser.py'
    if/once we need it for other CLI tools.
    """

    def __init__(
        self,
        *,
        program: str,
        filename: str,
        subcommands: list[str],
        rc_file: Optional[str] = None,
        argv: Optional[list[str]] = None,
        cwd: Optional[Path] = None,
    ):
        super().__init__(
            parser=argparse.ArgumentParser(
                prog=program,
                allow_abbrev=False,
                # We need our own formatter class so we output
                # '--flag=FLAG' not '--flag FLAG'.
                formatter_class=HelpFormatter,
            ),
            cwd=cwd or Path(os.getcwd()),
        )
        self.dot_rc_filename = filename

        rbt_version: str
        try:
            rbt_version = version('reboot')
        except PackageNotFoundError:
            # If 'rbt' is running in not-a-built-wheel-package.
            rbt_version = '<unreleased build>'

        self._parser.add_argument(
            '--version',
            action='version',
            version=rbt_version,
        )

        top_level_subparsers = self._parser.add_subparsers(
            dest='subcommand', required=True
        )
        self._subparsers = top_level_subparsers

        self._subcommand_parsers: dict[str, SubcommandParser] = {}

        def get_or_create_subcommand_parser(
            subcommand: str
        ) -> SubcommandParser:
            """Helper function for recursively populating
            `self._subcommand_parsers`.

            Each nested subcommand parser is linked to it's parent parser. The
            top level parser is the one of the `ArgumentParser` instance.
            """

            # If the subcommand parser already exists, return it.
            if subcommand in self._subcommand_parsers:
                return self._subcommand_parsers[subcommand]

            # Split the subcommand into segments, e.g., 'foo bar baz' -> ['foo',
            # 'bar', 'baz'].
            segments = subcommand.split(' ')

            # There can be no empty string segments caused by multiple spaces.
            assert all([len(segment.strip()) > 0 for segment in segments])

            # The parent subcommand is all segments except the last one. E.g.,
            # for 'foo bar baz' the parent subcommand is 'foo bar' while the
            # current subcommand is 'baz'.
            parent_subcommand = ' '.join(segments[:-1])
            current_subcommand = segments[-1]

            # In order to create a subcommand, we need to get the parent
            # subcommand parser so we can update its `argparse` subparsers.
            parent_subparsers: argparse._SubParsersAction

            if parent_subcommand == '':
                # If there is no parent subcommand, we are at the top level.
                parent_subparsers = top_level_subparsers
            else:
                # Get or create the parent subcommand parser.
                parent_subparsers = get_or_create_subcommand_parser(
                    parent_subcommand
                ).get_subparsers()

            # We create the current subcommand parser as a new parser of the
            # parent subparser.
            subparser = parent_subparsers.add_parser(
                current_subcommand,
                allow_abbrev=False,
                # We need our own formatter class so we output
                # '--flag=FLAG' not '--flag FLAG'.
                formatter_class=HelpFormatter,
            )

            # Create our helper class for the subcommand parser, store it, and
            # return it.
            self._subcommand_parsers[subcommand] = SubcommandParser(
                subcommand=subcommand,
                parser=subparser,
                cwd=self._cwd,
            )
            return self._subcommand_parsers[subcommand]

        for subcommand in subcommands:

            if not re.match(SUBCOMMAND_REGEX, subcommand):
                raise ValueError(f"Invalid subcommand '{subcommand}'")

            # Recursively populate `self._subcommand_parsers` by creating
            # necessary parent subparsers as we go.
            subparser = get_or_create_subcommand_parser(subcommand)

            # Add the `--config` parameter to all subcommands.
            subparser.add_argument(
                '--config',
                repeatable=True,
                type=str,
                help=f"\"configs\" to apply from a '{filename}' file, "
                f"e.g., 'rbt {subcommand} --config=foo' would add all flags "
                f"on lines in the '{filename}' that start with '{subcommand}:foo'",
            )

        argv = argv or list(sys.argv)

        self._help = '-h' in argv or '--help' in argv

        # Don't bother trying to expand args/flags from a '.rc' if the
        # user is asking for help because expanding args/flags means
        # calling `self._parser.parse_known_args(...)` and `argparse`
        # will see that '--help' or '-h' and print out a help message
        # that doesn't include all of the actual args/flags that will
        # get added after this constructor returns.
        if self._help:
            self._argv = argv
            self._subcommand = None
            return

        # Try to expand flags from a '.rc'
        if rc_file is not None:
            rc_file = os.path.abspath(rc_file)
            if not os.path.isfile(rc_file):
                terminal.fail(f"Failed to find {filename} at {rc_file}")
            if not os.access(rc_file, os.R_OK):
                terminal.fail(
                    f"Found '{filename}' at {rc_file} but it is not readable"
                )

        self.dot_rc: Optional[str] = (
            rc_file or ArgumentParser._find_dot_rc(filename)
        )

        # Parse command line but only looking for subcommands and
        # '--config=' flags.
        self._initial_namespace, _ = self._parser.parse_known_args(
            args=argv[1:]
        )
        self._subcommand = self._update_subcommand_in_namespace(
            self._initial_namespace
        )

        self._argv = argv

    @staticmethod
    def strip_any_arg(
        argv: list[str],
        *queried_args: str,
    ) -> tuple[bool, list[str]]:
        """A very basic static check for the presence of any of a set of argument names."""
        # Note: This is located in this module because it might eventually want
        # to grow into a full parse of a set of "bootstrap" arguments.
        result_argv = [arg for arg in argv if arg not in queried_args]
        return len(argv) != len(result_argv), result_argv

    def subcommand(self, subcommand: str) -> SubcommandParser:
        """Returns the parser for the specified subcommand."""
        if subcommand not in self._subcommand_parsers:
            raise ValueError(f"Invalid subcommand '{subcommand}'")
        return self._subcommand_parsers[subcommand]

    def parse_args(self) -> tuple[argparse.Namespace, list[str]]:
        """Pass through to top-level parser with the expanded arguments after
        first validating that all flags include '=' between them and their value."""

        if self._help:
            return self._parser.parse_args(args=self._argv[1:]), []

        # We must have the subcommand at this point so that we can
        # call `self._get_argument_type(...)`.
        assert self._subcommand is not None

        # Normalize the args that arrived from `sys.argv` relative to the current directory,
        # and then expand arguments from the rc file.
        args = self._normalize_path_arguments(self._cwd, self._argv)
        # First expand environment variables; they should all come before any
        # '--' flag that may appear in the .rbtrc file. Note that expanding
        # these before the `.rbrc` does not mean one has any preference over the
        # other: any duplicate specification is an error.
        args = self._expand_environment_variables(args)
        args = self._expand_dot_rc(args)

        # Try to get the 'args_after_dash_dash' after we expand flags from
        # .rbtrc so that we can properly handle '--' in the .rbtrc file.
        try:
            dash_dash_index = args.index('--')
            args_after_dash_dash = args[dash_dash_index + 1:]
            args = args[:dash_dash_index]
        except ValueError:
            args_after_dash_dash = []

        # Ensure all non-boolean flags include '=', e.g.,
        # '--flag=value'.
        for i in range(len(args)):
            arg = args[i]
            if arg.startswith('--'):
                parts = arg.split('=', 1)
                assert len(parts) > 0
                arg_type: Optional[type] = self._get_argument_type(parts[0])

                if arg_type is None:
                    # If the right part of undefined flag contains a space (for
                    # example `--undefined_flag="value with spaces"`), then
                    # argparse would incorrectly treat the parts after a space
                    # as a separate positional argument, so we provide a better
                    # error message here instead.
                    if parts[0].startswith('--') and len(
                        parts
                    ) > 1 and ' ' in parts[1]:
                        self._parser.error(
                            f"unrecognized arguments: '{parts[0]}={parts[1]}'"
                        )

                    # Let `argparse` handle any invalid arguments.
                    continue

                if len(parts) == 1 and arg_type != bool:
                    # Try and guess what the user intended by printing
                    # out "did you mean {arg}={args[i + 1]" assuming
                    # that there is an `i + 1` argument.
                    did_you_mean = ""
                    if i + 1 < len(args):
                        quote = "'" if " " in args[i + 1] else ""
                        did_you_mean = f" (did you mean {arg}={quote}{args[i + 1]}{quote})"

                    self._parser.error(
                        f"expected {arg}=VALUE, missing '=VALUE'{did_you_mean}"
                    )

        namespace: argparse.Namespace = self._parser.parse_args(args=args)
        assert self._subcommand == self._update_subcommand_in_namespace(
            namespace
        )

        # Now let's apply any transformers to the parsed arguments.
        subcommand_parser = self._subcommand_parsers[self._subcommand]
        for name in vars(namespace):
            # After parsing, we have names without the '--' prefix. Since
            # we allow flags only with '--' prefix, we can add it back here,
            # to get the transformer.
            transformer = subcommand_parser.get_transformer('--' + name)
            if transformer is not None:
                value = getattr(namespace, name)
                if value is not None:
                    try:
                        if isinstance(value, list):
                            value = [transformer.transform(v) for v in value]
                        else:
                            value = transformer.transform(value)
                    except TransformerError as e:
                        self._parser.error(e.message)
                    else:
                        setattr(namespace, name, value)

        return namespace, args_after_dash_dash

    def _get_argument_type(self, arg: str) -> Optional[type]:
        """Helper for getting an argument type from the correct parser given
        the subcommand that was determined during initialization."""
        # Subcommands are required when parsing, so we could not have
        # gotten here if we do not have a valid subcommand.
        assert self._subcommand is not None
        assert self._subcommand in self._subcommand_parsers

        return self._subcommand_parsers[self._subcommand
                                       ].get_argument_type(arg)

    def _get_arg_by_envvar_name(self) -> dict[str, str]:
        """Helper for getting environment variable configuration for
        the subcommand that was determined during initialization."""
        # Subcommands are required when parsing, so we could not have
        # gotten here if we do not have a valid subcommand.
        assert self._subcommand is not None
        assert self._subcommand in self._subcommand_parsers

        return self._subcommand_parsers[self._subcommand]._arg_by_envvar_name

    def _normalize_path_arguments(
        self,
        root: Path,
        args: list[str],
    ) -> list[str]:
        """If any of the given arguments are of type `Path` and are relative, make them absolute."""

        def _normalize(arg: str) -> str:
            split_arg = arg.split("=", 1)
            if len(split_arg) != 2:
                return arg
            arg_name, arg_value = split_arg
            if not self._get_argument_type(arg_name) == Path:
                return arg
            path = Path(arg_value)
            if path.is_absolute():
                return arg
            return f"{arg_name}={str(root / path)}"

        return [_normalize(arg) for arg in args]

    @staticmethod
    def _find_dot_rc(filename: str) -> Optional[str]:
        """Tries to find the '.rc' file in a parent directory.

        Returns the path if found otherwise `None`.
        """
        dot_rc: Optional[str] = None

        cwd = Path(os.getcwd())
        for search_path in (cwd, *cwd.parents):
            candidate = search_path / filename
            if os.path.isfile(candidate):
                dot_rc = str(candidate)
                break

        if dot_rc is None:
            return None

        if not os.access(dot_rc, os.R_OK):
            terminal.fail(
                f"Found '{filename}' at {dot_rc} but it is not readable"
            )

        return os.path.abspath(dot_rc)

    @staticmethod
    def _update_subcommand_in_namespace(
        namespace: argparse.Namespace,
    ) -> Subcommand:
        """Removes subcommand nesting in the given namespace, and returns the complete subcommand."""

        # Subcommands are required.
        assert namespace.subcommand is not None

        # We need to build the full command from entries in the namespace.
        # The namespace can be thought of glorified dictionary of key value
        # pairs. Each key is a subcommand - including spaces - pointing to
        # the next subcommand. The key of the initial subcommand is
        # 'subcommand'.
        # For 'foo bar baz boo', the namespace would look like:
        #   namespace = {
        #       'subcommand': 'foo',
        #       'foo': 'bar',
        #       'foo bar': 'baz',
        #       'foo bar baz': 'boo',
        #   }
        # Since a namespace does not support bracket indexing, e.g., `namespace['foo
        # bar']`, we use `getattr` below to access the keys. We'd have to do the
        # same to access values that contains spaces or dots as neither
        # `namespace.foo bar` nor `namespace.foo bar.baz` are valid python. The
        # alternative is to cast the namespace to a dictionary and use bracket
        # indexing.
        #
        # When we have accessed the last key, we have the full subcommand and we
        # know that we've reached the end when `getattr` raises an
        # `AttributeError`. For the example above, when we would try and get the
        # value of 'foo bar baz boo'.
        def build_subcommand(subcommand: str):
            if not hasattr(namespace, _subparser_name(subcommand)):
                return subcommand

            result = build_subcommand(
                subcommand + ' ' +
                getattr(namespace, _subparser_name(subcommand))
            )
            delattr(namespace, _subparser_name(subcommand))
            return result

        result = build_subcommand(namespace.subcommand)
        namespace.subcommand = result
        return result

    def _read_flags_from_dot_rc(
        self,
        filename: str,
        dot_rc: str,
    ) -> Flags:
        """Returns the flags that should be added to the command line, keyed by
        the subcommand and config for those flags, or the empty tuple if
        they should be applied to all command lines.
        """

        # Instead of using the SUBCOMMAND_REGEX directly, we exploit that we
        # know all possible values of (nested) subcommands and can construct a
        # pattern that matches only the registered valid subcommands.
        #
        # We sort by length first so that the longest matching command is used
        # in a case like `cloud` vs `cloud up`.
        valid_subcommands = sorted(
            (
                subcommand
                for subcommand, parser in self._subcommand_parsers.items()
            ),
            key=lambda x: (-len(x), x),
        )
        VALID_SUBCOMMAND_REGEX = '|'.join(
            [re.escape(COMMON_PATTERN)] +
            [re.escape(subcommand) for subcommand in valid_subcommands]
        )

        # A line in the .rc file consists of a subcommand, an optional config, and
        # multiple arguments.
        rc_line_regex = re.compile(
            fr'(?P<subcommand>{VALID_SUBCOMMAND_REGEX})(:(?P<config>{CONFIG_REGEX}))?\s(?P<arguments>{ARGUMENTS_REGEX})'
        )

        flags: Flags = defaultdict(list)

        dot_rc_dir = Path(dot_rc).parent
        with open(dot_rc, 'r') as file:
            line_number = 0
            for line in file.readlines():
                line_number += 1
                line = line.strip()  # Remove leading and trailing whitespaces.

                # Remove any trailing comments.
                line = line.split('#', 1)[0]

                # Skip empty lines. This includes lines that previously had only
                # comments as we've stripped these above.
                if len(line) == 0:
                    continue

                # Match line against valid syntax.
                match = rc_line_regex.match(line)
                if match is None:
                    # The line is not a valid line, but we can still provide a
                    # more helpful error message.

                    # Check if the line contains a valid subcommand. If it does
                    # not, print an error message that includes the available
                    # subcommands.
                    if not re.search(fr'^\s*({VALID_SUBCOMMAND_REGEX})', line):
                        invalid_subcommand = re.split(
                            r'[-\:]',
                            line,
                        )[0].strip()
                        terminal.fail(
                            f"{dot_rc}:{line_number}: '{invalid_subcommand}' "
                            "is not a valid subcommand (available subcommands: "
                            f"{', '.join(valid_subcommands)})"
                        )
                    else:
                        # Catch all. We failed to parse the line.
                        terminal.fail(
                            f"{dot_rc}:{line_number}: failed to parse '{filename}' file:\n'{line}'"
                        )

                # For mypy that does not understand `fail`.
                assert match is not None

                # Extract matches and split arguments.
                subcommand: str = match.group('subcommand')
                config: Optional[str] = match.group('config')
                arguments: list[str] = self._normalize_path_arguments(
                    dot_rc_dir, shlex.split(match.group('arguments'))
                )

                # Update flags.
                flags[(subcommand, config)].extend(arguments)

        return flags

    def _expand_dot_rc(
        self,
        argv: list[str],
    ) -> list[str]:
        """Expand '.rc' file into `argv`."""
        if self.dot_rc is None:
            return argv[1:]
        assert self._subcommand is not None

        filename = self.dot_rc_filename
        subcommand = self._subcommand
        argv = list(argv)

        flags = self._read_flags_from_dot_rc(filename, self.dot_rc)

        # Now add all "common" flags.
        common_flags = flags[(COMMON_PATTERN, None)]
        if len(common_flags) > 0:
            argv = argv[:1] + common_flags + argv[1:]

        subcommand_flags: list[Flag] = []

        # Now add '{subcommand}' specific flags.
        subcommand_flags = flags[(subcommand, None)]
        if len(subcommand_flags) > 0:
            argv.extend(subcommand_flags)

        # Parse the known args again since we might have added some
        # configs from '{subcommand}'.
        namespace, _ = self._parser.parse_known_args(args=argv[1:])

        assert subcommand == self._update_subcommand_in_namespace(namespace)

        # Now expand config flags.
        configs = namespace.config or []

        common_config_flags: dict[Config, list[Flag]] = {}
        subcommand_config_flags: dict[Config, list[Flag]] = {}

        while not all(
            (config in common_config_flags) and
            (config in subcommand_config_flags) for config in configs
        ):
            for config in configs:
                # In order for 'config' to be valid we must find
                # either '{COMMON_PATTERN}:{config}' or
                # '{subcommand}:{config}' in the '{self.dot_rc}' file.
                expanded = (
                    config in common_config_flags and
                    config in subcommand_config_flags
                )

                # Expand '{COMMON_PATTERN}:{config}' flags, but prepend
                # those (after `argv[0]`, but before `argv[1]`).
                if config not in common_config_flags:
                    if (COMMON_PATTERN, config) in flags:
                        expanded = True
                        common_config_flags[config] = flags[
                            (COMMON_PATTERN, config)]
                        argv = argv[:1] + common_config_flags[config] + argv[1:]
                    else:
                        # Store the config so we know it was processed and
                        # we can halt the otherwise infinite while loop.
                        common_config_flags[config] = []

                # Expand '{subcommand}:{config}' flags.
                if config not in subcommand_config_flags:
                    if (subcommand, config) in flags:
                        expanded = True
                        subcommand_config_flags[config] = flags[
                            (subcommand, config)]
                        argv.extend(subcommand_config_flags[config])
                    else:
                        # Store the config so we know it was processed and
                        # we can halt the otherwise infinite while loop.
                        subcommand_config_flags[config] = []

                if not expanded:
                    terminal.fail(
                        f"--config={config} is invalid, no "
                        f"'{COMMON_PATTERN}:{config}' nor '{subcommand}:{config}' "
                        f"lines found in {self.dot_rc}"
                    )

            # Now re-parse the known args so we can see whether or not
            # expanding the last configs added any more configs that
            # we need to continue expanding.
            #
            # NOTE: we pass a copy of `argv` here so that we don't
            # mutate the original `argv` which we'll need to use for
            # our ultimate parsing, after we've expanded all of the
            # configs.
            namespace, _ = self._parser.parse_known_args(args=argv[1:])

            assert subcommand == self._update_subcommand_in_namespace(
                namespace
            )
            configs = namespace.config

        if terminal.is_verbose() and (
            len(common_flags) > 0 or len(subcommand_flags) > 0 or
            len(subcommand_config_flags) > 0
        ):
            terminal.verbose(
                f"Expanded flags from '{filename}' located at {self.dot_rc}"
            )
            if len(common_flags) > 0:
                terminal.verbose(
                    f"    {' '.join(common_flags)} (from '{COMMON_PATTERN}' in '{filename}')"
                )

            if len(subcommand_flags) > 0:
                terminal.verbose(
                    f"    {' '.join(subcommand_flags)} (from '{subcommand}' in '{filename}')"
                )

            for config, config_flags in common_config_flags.items():
                if len(config_flags) > 0:
                    terminal.verbose(
                        f"    {' '.join(config_flags)} (from '{COMMON_PATTERN}:{config}' in '{filename}' via --config={config})"
                    )

            for config, config_flags in subcommand_config_flags.items():
                if len(config_flags) > 0:
                    terminal.verbose(
                        f"    {' '.join(config_flags)} (from '{subcommand}:{config}' in '{filename}' via --config={config})"
                    )

            # Print a newline here for some extra spacing between any other output or errors.
            terminal.verbose("")
        return argv[1:]

    def _expand_environment_variables(self, argv: list[str]) -> list[str]:
        for envvar_name, arg_name in self._get_arg_by_envvar_name().items():
            envvar_value = os.environ.get(envvar_name)
            if envvar_value is None:
                continue
            argv.append(f"{arg_name}={envvar_value}")

        return argv


# A type alias to allow passing a global ArgumentParser factory function into
# individual commands (which would otherwise cause an import cycle).
ArgumentParserFactory = Callable[[Optional[list[str]]], ArgumentParser]
