"""pytest-bdd support for testing Reboot applications with Gherkin.

A test module gets the built-in steps and their fixtures with:

    from reboot.bdd.steps import *

and defines its own steps with the `given`, `when`, `then`, and `step`
decorators below, which work exactly like pytest-bdd's except that the
decorated step function may be `async def`: such a step runs on the
same event loop as the Reboot test harness and every built-in step.
"""

import functools
import inspect
import pytest_bdd
# Re-exported so that a test module can get everything it needs from
# `reboot.bdd`.
from pytest_bdd import parsers as parsers
from pytest_bdd import scenario as scenario
from pytest_bdd import scenarios as scenarios
from reboot.bdd.loop import run
from typing import Any, Callable, Optional

StepDecorator = Callable[[Callable[..., Any]], Callable[..., Any]]


# Why the decorators below wrap step functions at all: pytest-bdd
# executes every step function synchronously, calling it and using
# whatever it returns, so the coroutine an `async def` step function
# returns would be discarded without ever being awaited and the step
# would silently do nothing. Wrapping supplies the missing await:
# calling the wrapper runs the coroutine to completion on the
# scenario's event loop, the same loop the `Reboot` harness and the
# built-in steps run on.
def _synchronous(step_function: Callable[..., Any]) -> Callable[..., Any]:
    """Returns the given step function as a synchronous function that
    pytest-bdd can call: an `async def` step function gets wrapped to
    run on the scenario's event loop, any other function is returned
    unchanged.
    """
    if not inspect.iscoroutinefunction(step_function):
        return step_function

    @functools.wraps(step_function)
    def synchronous(*args: Any, **kwargs: Any) -> Any:
        return run(step_function(*args, **kwargs))

    return synchronous


def _step_decorator(
    pytest_bdd_decorator: Callable[..., StepDecorator],
    name: Any,
    converters: Optional[dict[str, Callable[[str], Any]]],
    target_fixture: Optional[str],
    stacklevel: int,
) -> StepDecorator:
    """Returns a step decorator that synchronizes the step function and
    then applies the given pytest-bdd decorator, bumping `stacklevel`
    past this wrapper so that the step definition registers in the
    module that applied the decorator.
    """

    def decorator(step_function: Callable[..., Any]) -> Callable[..., Any]:
        return pytest_bdd_decorator(
            name,
            converters=converters,
            target_fixture=target_fixture,
            stacklevel=stacklevel + 1,
        )(_synchronous(step_function))

    return decorator


def given(
    name: Any,
    converters: Optional[dict[str, Callable[[str], Any]]] = None,
    target_fixture: Optional[str] = None,
    stacklevel: int = 1,
) -> StepDecorator:
    """Like `pytest_bdd.given`, except that the decorated step function
    may be `async def`."""
    return _step_decorator(
        pytest_bdd.given, name, converters, target_fixture, stacklevel
    )


def when(
    name: Any,
    converters: Optional[dict[str, Callable[[str], Any]]] = None,
    target_fixture: Optional[str] = None,
    stacklevel: int = 1,
) -> StepDecorator:
    """Like `pytest_bdd.when`, except that the decorated step function
    may be `async def`."""
    return _step_decorator(
        pytest_bdd.when, name, converters, target_fixture, stacklevel
    )


def then(
    name: Any,
    converters: Optional[dict[str, Callable[[str], Any]]] = None,
    target_fixture: Optional[str] = None,
    stacklevel: int = 1,
) -> StepDecorator:
    """Like `pytest_bdd.then`, except that the decorated step function
    may be `async def`."""
    return _step_decorator(
        pytest_bdd.then, name, converters, target_fixture, stacklevel
    )


def step(
    name: Any,
    converters: Optional[dict[str, Callable[[str], Any]]] = None,
    target_fixture: Optional[str] = None,
    stacklevel: int = 1,
) -> StepDecorator:
    """Like `pytest_bdd.step`, except that the decorated step function
    may be `async def`."""
    return _step_decorator(
        pytest_bdd.step, name, converters, target_fixture, stacklevel
    )
