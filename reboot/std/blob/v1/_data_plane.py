"""Client-side glue for talking to a `BlobDataPlane` gRPC service."""

import grpc
import os
import rbt.v1alpha1.placement_planner_pb2 as placement_planner_pb2
import tempfile
from contextlib import asynccontextmanager
from google.protobuf import json_format
from rbt.std.blob.v1.data_plane_pb2_grpc import BlobDataPlaneStub
from reboot.aio.caller_id import CallerID
from reboot.aio.contexts import Context
from reboot.aio.headers import CALLER_ID_HEADER
from reboot.aio.internals.contextvars import get_application_id
from reboot.aio.types import ApplicationId
from reboot.aio.external import ExternalContext
from reboot.controller.settings import ENVVAR_REBOOT_REPLICA_CONFIG
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

# The directory the data plane settled on, carried to the servers an
# application spawns. Set by the application, not by anyone
# configuring it: to say where blobs go, say where state goes.
ENVVAR_BLOBS_DIRECTORY = "REBOOT_BLOBS_DIRECTORY"

_SECURE_SCHEMES = ("https", "grpcs")

# Where an unnamed run's blob bytes go, kept for the life of the
# process so that every store built in it agrees on one directory.
_temporary_directory: Optional[tempfile.TemporaryDirectory] = None


class DataPlaneNotConfigured(RuntimeError):
    """Raised when no data-plane URL is configured. Under `rbt dev
    run`/`rbt serve run` and in `reboot.aio.tests.Reboot` unit tests
    this never happens (they provide the filesystem data plane and set
    the URL); it indicates the application was started some other way
    without a data plane."""


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
async def configured_data_plane_stub(
) -> AsyncIterator[BlobDataPlaneStub]:
    """A stub for the data plane named by the environment.

    Separate from `data_plane_stub` because it needs no context, which
    is what library set-up has: it runs in every server process before
    any of them is serving, which is exactly when a context does not
    exist yet and exactly where per-process configuration has to be
    put."""
    url = os.environ.get(ENVVAR_BLOB_DATA_PLANE_URL)
    if not url:
        raise DataPlaneNotConfigured(
            f"`{ENVVAR_BLOB_DATA_PLANE_URL}` is not set."
        )
    channel = channel_for_url(url)
    try:
        yield BlobDataPlaneStub(channel)
    finally:
        await channel.close()


class _NamedCaller:
    """A `BlobDataPlaneStub` that says which application is calling.

    The data plane refuses a call that does not, because being a
    service of the application makes it reachable by anyone who can
    reach the application. Reboot attaches this header to its own
    calls, but a legacy gRPC channel carries only what its caller puts
    on it."""

    def __init__(
        self,
        stub: BlobDataPlaneStub,
        application_id: ApplicationId,
    ):
        self._stub = stub
        self._metadata = (
            (
                CALLER_ID_HEADER,
                str(CallerID(application_id=application_id)),
            ),
        )

    def __getattr__(self, name: str):

        async def call(request):
            return await getattr(self._stub, name)(
                request, metadata=self._metadata
            )

        return call


@asynccontextmanager
async def data_plane_stub(
    context: Context | ExternalContext,
) -> AsyncIterator[BlobDataPlaneStub | _NamedCaller]:
    """A stub for whichever data plane this application uses.

    `REBOOT_BLOB_DATA_PLANE_URL` names one that lives elsewhere -- on
    Reboot Cloud it is the application's facilitator -- and is honored
    wherever it is set. With it unset, the data plane is the one this
    application hosts itself, reached over Reboot's own routing rather
    than an address.

    Either way it is the same gRPC service, which is what keeps a
    local run and a Cloud deployment on one code path."""
    url = os.environ.get(ENVVAR_BLOB_DATA_PLANE_URL)
    if url:
        channel = channel_for_url(url)
        try:
            yield BlobDataPlaneStub(channel)
        finally:
            await channel.close()
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
        yield _NamedCaller(BlobDataPlaneStub(channel), application_id)


def replicas() -> int:
    """How many replicas this application runs across, per
    `REBOOT_REPLICA_CONFIG`; one when that is unset, which is how a
    single-replica run is configured."""
    replica_config_json = os.environ.get(ENVVAR_REBOOT_REPLICA_CONFIG)
    if replica_config_json is None:
        return 1
    replica_config = placement_planner_pb2.ReplicaConfig()
    # Tolerating unknown fields as the controller's own parse does, so
    # that a newer controller adding one is not reported here as a
    # parse error in place of the message this was going to give.
    json_format.Parse(
        replica_config_json, replica_config, ignore_unknown_fields=True
    )
    return len(replica_config.replicas)


def blobs_directory() -> str:
    """Where this application keeps blob bytes.

    Beside the rest of its state, so that whatever reclaims that state
    reclaims the blobs with it. A run that keeps no state across
    restarts gets a temporary directory, which is the same bargain it
    already made for everything else it stores."""
    if on_cloud():
        # Provisioning points every Cloud application at its
        # facilitator, so an application only reaches here having been
        # left without one. Local disk is no stand-in: it is neither
        # durable nor shared between replicas, so serving from it would
        # take uploads that are then silently lost.
        raise RuntimeError(
            f"'{ENVVAR_BLOB_DATA_PLANE_URL}' is not set. It is set "
            'automatically for applications on Reboot Cloud; please '
            'contact your administrator.'
        )

    count = replicas()
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

    chosen = os.environ.get(ENVVAR_BLOBS_DIRECTORY)
    if chosen is not None:
        return chosen

    state_directory = os.environ.get(ENVVAR_RBT_STATE_DIRECTORY)
    if state_directory is not None:
        directory = os.path.join(state_directory, BLOBS_SUBDIRECTORY)
    else:
        # An unnamed run keeps no state across restarts, so neither do
        # its blobs.
        global _temporary_directory
        if _temporary_directory is None:
            _temporary_directory = tempfile.TemporaryDirectory(
                prefix="reboot-blobs-"
            )
        directory = _temporary_directory.name

    # Put in the environment so that the servers this process goes on
    # to spawn find the same directory rather than each choosing one.
    # This runs during library set-up, which the process that owns the
    # application reaches before it starts any of them, and which each
    # of them then reaches with this already answered.
    os.environ[ENVVAR_BLOBS_DIRECTORY] = directory
    return directory
