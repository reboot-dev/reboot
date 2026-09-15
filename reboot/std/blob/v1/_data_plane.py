"""Client-side glue for talking to a `BlobDataPlane` gRPC service."""

import functools
import grpc
import os
from contextlib import asynccontextmanager
from rbt.std.blob.v1.data_plane_pb2_grpc import BlobDataPlaneStub
from reboot.aio.caller_id import CallerID
from reboot.aio.contexts import Context
from reboot.aio.external import ExternalContext
from reboot.aio.headers import CALLER_ID_HEADER
from reboot.aio.internals.contextvars import get_application_id
from reboot.aio.types import ApplicationId
from reboot.controller.replicas import num_replicas
from reboot.run_environments import on_cloud
from reboot.settings import ENVVAR_RBT_STATE_DIRECTORY
from typing import AsyncIterator, Optional
from urllib.parse import urlparse

# The URL of the `BlobDataPlane` gRPC service. A bare `host:port`, or a
# URL whose scheme selects transport security (`https`/`grpcs` ->
# secure, anything else -> insecure).
ENVVAR_BLOB_DATA_PLANE_URL = "REBOOT_BLOB_DATA_PLANE_URL"

# Where the filesystem data plane keeps bytes, relative to the
# application's state directory, so that whatever reclaims that state
# reclaims the blobs with it.
BLOBS_SUBDIRECTORY = "blobs"

_SECURE_SCHEMES = ("https", "grpcs")


class DataPlaneNotConfigured(RuntimeError):
    """Raised when there is no data plane to reach: none is named by
    `REBOOT_BLOB_DATA_PLANE_URL`, and the one an application hosts
    itself is only reachable from within that application."""


def configured_data_plane_url() -> Optional[str]:
    """The URL of the data plane this application has been pointed at
    via `REBOOT_BLOB_DATA_PLANE_URL`, or `None` when it hosts one
    itself."""
    return os.environ.get(ENVVAR_BLOB_DATA_PLANE_URL) or None


def channel_for_url(url: str) -> grpc.aio.Channel:
    """Builds a gRPC channel to the data-plane service at `url`. The
    scheme selects transport security; the host:port is the gRPC
    target. Any URL path is ignored (gRPC addresses by host:port, not
    path)."""
    # `urlparse` needs a scheme to populate `netloc`; treat a bare
    # `host:port` as such.
    parsed = urlparse(url if "://" in url else f"grpc://{url}")
    target = parsed.netloc
    if parsed.scheme in _SECURE_SCHEMES:
        return grpc.aio.secure_channel(target, grpc.ssl_channel_credentials())
    return grpc.aio.insecure_channel(target)


@asynccontextmanager
async def data_plane_stub_at(url: str) -> AsyncIterator[BlobDataPlaneStub]:
    """A stub for the data plane at `url`, over a channel that lives
    as long as the `with` block."""
    channel = channel_for_url(url)
    try:
        yield BlobDataPlaneStub(channel)
    finally:
        await channel.close()


class _NamedCallerStub(BlobDataPlaneStub):
    """A `BlobDataPlaneStub` that says which application is calling.

    The data plane refuses a call that does not, because being a
    service of the application makes it reachable by anyone who can
    reach the application. Reboot attaches this header to its own
    calls, but a legacy gRPC channel carries only what its caller puts
    on it."""

    def __init__(
        self,
        channel: grpc.aio.Channel,
        application_id: ApplicationId,
    ) -> None:
        super().__init__(channel)
        metadata = (
            (
                CALLER_ID_HEADER,
                str(CallerID(application_id=application_id)),
            ),
        )
        # The generated stub gives itself one multicallable per RPC;
        # each is rebound with the metadata, so that every call made
        # through this stub carries it.
        for name, multicallable in list(vars(self).items()):
            setattr(
                self,
                name,
                functools.partial(multicallable, metadata=metadata),
            )


@asynccontextmanager
async def data_plane_stub(
    context: Context | ExternalContext,
) -> AsyncIterator[BlobDataPlaneStub]:
    """A stub for whichever data plane this application uses.

    `REBOOT_BLOB_DATA_PLANE_URL` names one that lives elsewhere, and is
    honored wherever it is set. With it unset, the data plane is the
    one this application hosts itself, reached over Reboot's own
    routing rather than an address.

    Either way it is the same gRPC service, so a `Blob` speaks to both
    on one code path."""
    url = configured_data_plane_url()
    if url is not None:
        async with data_plane_stub_at(url) as stub:
            yield stub
        return

    # The data plane this application hosts itself. Reboot routes to
    # it by service name, so there is no address to configure -- and
    # none could be, since the servers hosting it are not running when
    # an application's environment is composed.
    application_id = get_application_id()
    if application_id is None:
        raise DataPlaneNotConfigured(
            "the blob data plane can only be reached from within an "
            "application"
        )
    async with context.legacy_grpc_channel() as channel:
        yield _NamedCallerStub(channel, application_id)


def blobs_directory() -> str:
    """Where this application keeps blob bytes.

    Beside the rest of its state, so that whatever reclaims that state
    reclaims the blobs with it, and so that every server of the
    application arrives at the same directory from the state directory
    alone. A run that keeps no state across restarts keeps its blobs in
    the same temporary directory as everything else it stores."""
    if on_cloud():
        # Reboot Cloud sets `REBOOT_BLOB_DATA_PLANE_URL` for every
        # application it runs, so one only reaches here having been
        # left without it. Local disk is no stand-in: it is neither
        # durable nor shared between replicas, so serving from it would
        # take uploads that are then silently lost.
        raise RuntimeError(
            f"'{ENVVAR_BLOB_DATA_PLANE_URL}' is not set. It is set "
            'automatically for applications on Reboot Cloud; please '
            'contact your administrator.'
        )

    count = num_replicas()
    if count > 1:
        # Every server of one replica shares that replica's disk, so
        # any number of them is fine; a second replica is not, since it
        # cannot see the bytes this one stores. Refuse rather than
        # serve downloads that succeed or 404 depending on which
        # replica the request reached.
        raise RuntimeError(
            'Blob bytes are stored on the local disk of a single '
            'replica, so they cannot be served by an application '
            f'running across {count} replicas. Point '
            f"'{ENVVAR_BLOB_DATA_PLANE_URL}' at a data plane all "
            'replicas share.'
        )

    state_directory = os.environ.get(ENVVAR_RBT_STATE_DIRECTORY)
    if state_directory is None:
        raise RuntimeError(
            f"'{ENVVAR_RBT_STATE_DIRECTORY}' is not set, so there is no "
            "state directory to keep blob bytes beside. Set it, or point "
            f"'{ENVVAR_BLOB_DATA_PLANE_URL}' at a data plane."
        )
    return os.path.join(state_directory, BLOBS_SUBDIRECTORY)
