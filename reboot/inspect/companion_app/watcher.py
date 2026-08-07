"""Watches the application under development and records its shape.

The dashboard cannot reliably notice that the application restarted:
whatever sits between a browser and that application -- a forwarded
port, a tunnel -- can outlive the process behind it and hold the
connection open, reporting nothing. The companion is in the same
container with nothing in between, so when the application goes away
its stream ends immediately.

So the companion does the noticing, and the dashboard reads what the
companion recorded. Measured 2026-08-07: a hot reload ended the stream
at once and a new schema was in hand about four seconds later.
"""
import asyncio
import time
from log.log import get_logger
from rbt.inspect.companion_app.v1.dashboard_pb2 import (
    FieldInfo,
    MethodInfo,
    StateTypeInfo,
)
from rbt.inspect.companion_app.v1.dashboard_rbt import Schema
from rbt.v1alpha1.inspect import inspect_pb2, inspect_pb2_grpc
from reboot.aio.backoff import Backoff
from reboot.aio.external import ExternalContext
from reboot.aio.headers import AUTHORIZATION_HEADER
from reboot.inspect.companion_app.constants import SCHEMA_ID
from typing import Optional

logger = get_logger(__name__)

# `Inspect` requires a bearer token, but under `rbt dev` no admin
# secret is configured, so any value is accepted.
DEV_ADMIN_TOKEN = 'dev'


def _field(field) -> FieldInfo:
    return FieldInfo(name=field.name, type=field.type)


def _method(method) -> MethodInfo:
    return MethodInfo(
        name=method.name,
        kind=method.kind,
        arguments=[_field(argument) for argument in method.arguments],
        returns=method.returns,
        errors=list(method.errors),
        description=(
            method.description if method.HasField('description') else None
        ),
        constructor=method.constructor,
        mcp=method.mcp,
    )


def _state_type(state_type) -> StateTypeInfo:
    return StateTypeInfo(
        name=state_type.name,
        file=state_type.file,
        fields=[_field(field) for field in state_type.fields],
        methods=[_method(method) for method in state_type.methods],
    )


async def _record(
    companion_url: str,
    state_types: list[StateTypeInfo],
    connected: bool,
    read_at_ms: int,
) -> None:
    context = ExternalContext(
        name='companion-schema-watcher', url=companion_url
    )
    await Schema.ref(SCHEMA_ID).Record(
        context,
        state_types=state_types,
        connected=connected,
        read_at_ms=read_at_ms,
    )


async def watch(*, application_url: str, companion_url: str) -> None:
    """Records the application's shape for as long as this runs.

    Reads `Inspect.GetSchema`, which describes the application once and
    then holds the connection open. That connection ending is how a
    restart is noticed; there is nothing to poll.
    """
    # Reconnecting is a connection to a port on this machine, which
    # fails immediately when nothing is listening there. Waiting long
    # between attempts buys nothing and adds directly to how long a
    # restarted application takes to reappear on the dashboard.
    backoff = Backoff(initial_backoff_seconds=0.1, max_backoff_seconds=1)
    recorded: Optional[bytes] = None
    state_types: list[StateTypeInfo] = []
    read_at_ms = 0
    # When the stream was lost, so the reconnect can be reported with
    # how long it actually took rather than only that it happened.
    lost_at: Optional[float] = None

    while True:
        try:
            # A plain gRPC stub rather than a Reboot call: `Inspect` is
            # a legacy gRPC service on a *different* application, and
            # this deliberately runs outside any servicer, which may
            # not call another application at all.
            context = ExternalContext(
                name='companion-schema-reader',
                url=application_url,
            )
            stub = inspect_pb2_grpc.InspectStub(context.legacy_grpc_channel())

            async for response in stub.GetSchema(
                inspect_pb2.GetSchemaRequest(),
                metadata=(
                    (AUTHORIZATION_HEADER, f'Bearer {DEV_ADMIN_TOKEN}'),
                ),
            ):
                # Only write when something changed, so a reconnect
                # that finds the same application doesn't wake every
                # open dashboard.
                current = response.SerializeToString()
                if current != recorded:
                    recorded = current
                    state_types = [
                        _state_type(state_type)
                        for state_type in response.state_types
                    ]
                    read_at_ms = int(time.time() * 1000)
                    await _record(
                        companion_url,
                        state_types,
                        connected=True,
                        read_at_ms=read_at_ms,
                    )

                    read = f'Read {len(state_types)} state types from the '
                    if lost_at is None:
                        logger.info(read + 'application')
                    else:
                        logger.info(
                            read + 'application, '
                            f'{time.monotonic() - lost_at:.1f}s after '
                            'losing it'
                        )
                    lost_at = None

                backoff.clear()

        except asyncio.CancelledError:
            raise
        except Exception as e:
            if lost_at is None:
                lost_at = time.monotonic()
                logger.info(
                    f"Lost the application's schema stream ({e}); "
                    'retrying until it answers'
                )

        # The application is restarting, or not up yet. Keep the shape
        # that was last seen and say only that it is no longer current,
        # so the dashboard can show it as history rather than as the
        # present. Dropping the shape here would empty the dashboard on
        # every restart, which is when it is being read most.
        try:
            if recorded is not None:
                recorded = None
                await _record(
                    companion_url,
                    state_types,
                    connected=False,
                    read_at_ms=read_at_ms,
                )
        except Exception:
            pass

        await backoff()
