from typing_extensions import ParamSpec, TypeVar

# This file exists because our `mypy.ini` declares
# `[mypy-pydantic_ai.*] ignore_missing_imports = True` and thus
# pydantic_ai is treated as `Any` by mypy, which means we can't
# usefully import pydantic_ai's `TypeVar` / `ParamSpec` objects
# (`AgentDepsT`, `OutputDataT`, `RunOutputDataT`, `ToolParams`) and
# have them work in mypy's eyes. Importing them gets `Any`, which
# fails the constraints for `Generic[...]` parents, generic type
# aliases, and the last position of `Concatenate[...]` -- producing
# a cascade of `[type-arg]` / `[valid-type]` errors.
#
# The fix (for now) is to define our own copies here. The definitions
# are exact copies of pydantic_ai's.
#
# These are runtime-distinct from pydantic_ai's identically-named
# `TypeVar` objects, but pydantic_ai's generic plumbing doesn't
# compare `TypeVar`'s by identity across modules so runtime
# behaviour is unaffected.
#
# `typing_extensions` is used because PEP 696's `default=` only landed
# in stdlib `typing` in Python 3.13 and we target 3.10+.
AgentDepsT = TypeVar("AgentDepsT", default=None, contravariant=True)
OutputDataT = TypeVar("OutputDataT", default=str, covariant=True)
RunOutputDataT = TypeVar("RunOutputDataT")
ToolParams = ParamSpec("ToolParams", default=...)
