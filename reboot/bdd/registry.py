"""Resolves the state type names that step text mentions, e.g. the
`Account` in 'the `Account` for "alice"', to the generated client
classes those calls go through."""

import sys
from reboot.aio.applications import Application
from reboot.aio.servicers import Servicer
from typing import Optional


def _client_type(servicer_type: type[Servicer]) -> type:
    """Returns the generated client class (the class with `ref()`) for
    the state type the given servicer serves.

    The generated `*_rbt.py` module defines both the servicer base
    class the developer subclassed and, under the last segment of the
    state type name, the client class. Walk the servicer's bases to
    the generated one and look the client class up in its module.
    """
    for base in servicer_type.__mro__:
        state_type_name = base.__dict__.get('__state_type_name__')
        if state_type_name is None:
            continue
        class_name = str(state_type_name).split('.')[-1]
        client_type: Optional[type] = getattr(
            sys.modules[base.__module__], class_name, None
        )
        if client_type is None:
            continue
        client_state_type_name = getattr(
            client_type, '__state_type_name__', None
        )
        if (
            client_state_type_name == state_type_name and
            hasattr(client_type, 'ref')
        ):
            return client_type
    raise ValueError(
        f"Could not resolve the generated client class for servicer "
        f"'{servicer_type.__name__}'; expected one of its base classes "
        "to come from a generated `*_rbt.py` module"
    )


def client_types_by_name(application: Application) -> dict[str, type]:
    """Returns the generated client class of each of the application's
    servicers, keyed by the full state type name (e.g.
    'bank.v1.Account')."""
    client_types: dict[str, type] = {}
    for servicer_type in application._servicers or []:
        client_type = _client_type(servicer_type)
        state_type_name = str(getattr(client_type, '__state_type_name__'))
        already_registered = client_types.get(state_type_name)
        if (
            already_registered is not None and
            already_registered is not client_type
        ):
            raise ValueError(
                f"State type '{state_type_name}' resolves to two "
                "different generated client classes"
            )
        client_types[state_type_name] = client_type
    return client_types
