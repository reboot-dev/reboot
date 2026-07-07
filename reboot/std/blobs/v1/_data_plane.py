"""Client-side glue for talking to a `BlobDataPlane` gRPC service.

The `Blob` control-plane servicer holds no bytes; it calls a data-plane
service (discovered via `REBOOT_BLOB_DATA_PLANE_URL`) to provision
uploads, finalize them, mint URLs, and delete objects. Every local run
mode provides a filesystem data plane automatically: `rbt dev run` and
`rbt serve run` spawn it as a subprocess, and the
`reboot.aio.tests.Reboot` harness runs it in-process. Deployments set
the URL themselves (Reboot Cloud points it at the app's facilitator).
"""

import grpc
import os
from rbt.std.blobs.v1.data_plane_pb2_grpc import BlobDataPlaneStub
from urllib.parse import urlparse

# The URL of the `BlobDataPlane` gRPC service. A bare `host:port`, or a
# URL whose scheme selects transport security (`https`/`grpcs` ->
# secure, anything else -> insecure). Set by `rbt dev run`/`rbt serve
# run` and the test harness (which provide the filesystem data plane
# when it is unset) or by Reboot Cloud provisioning (pointing at the
# app's facilitator).
ENVVAR_BLOB_DATA_PLANE_URL = "REBOOT_BLOB_DATA_PLANE_URL"

# The path namespace a data plane's forwarded paths must live under;
# the application refuses to forward anything else, so a data plane
# can never claim application routes (see `ForwardedPath` in
# `data_plane.proto`).
FORWARDED_PATH_PREFIX = "/__/reboot/blob/"

_SECURE_SCHEMES = ("https", "grpcs")


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


def proxy_target_from_environment(http_port: int) -> str:
    """The base URL of the data plane's HTTP byte endpoint, to which
    the application proxies forwarded paths: the host the application
    already reaches the data plane's gRPC service on (from
    `REBOOT_BLOB_DATA_PLANE_URL`), with the `http_port` its
    `Configuration` reported, over the same transport security."""
    url = os.environ.get(ENVVAR_BLOB_DATA_PLANE_URL)
    if not url:
        raise DataPlaneNotConfigured(
            f"`{ENVVAR_BLOB_DATA_PLANE_URL}` is not set."
        )
    parsed = urlparse(url if "://" in url else f"grpc://{url}")
    scheme = "https" if parsed.scheme in _SECURE_SCHEMES else "http"
    host = parsed.hostname or ""
    # `urlparse` strips the brackets off an IPv6 literal; put them
    # back, since they are required in a URL authority.
    if ":" in host:
        host = f"[{host}]"
    return f"{scheme}://{host}:{http_port}"


def stub_from_environment() -> BlobDataPlaneStub:
    """Builds a data-plane stub from `REBOOT_BLOB_DATA_PLANE_URL`. A
    fresh channel is created on the current event loop (rather than
    memoized) because `grpc.aio` channels are event-loop-affine, and
    an application may be brought up on a new loop. Called once per
    library `pre_run`; the channel then lives as long as the
    application (the `Library` has no shutdown hook on which to close
    it)."""
    url = os.environ.get(ENVVAR_BLOB_DATA_PLANE_URL)
    if not url:
        raise DataPlaneNotConfigured(
            f"`{ENVVAR_BLOB_DATA_PLANE_URL}` is not set. Run the "
            "application via `rbt dev run` or `rbt serve run` (which "
            "start the filesystem blob data plane automatically), or "
            "set the variable to your own data-plane service's URL."
        )
    return BlobDataPlaneStub(channel_for_url(url))
