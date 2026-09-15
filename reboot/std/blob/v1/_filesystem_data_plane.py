"""The filesystem blob data plane.

Implements the `BlobDataPlane` gRPC service (see `data_plane.proto`)
over bytes on local disk, for an application that has not been pointed
at a data plane elsewhere. A plain gRPC service, like any other data
plane, so that the control plane speaks one interface wherever the
bytes live and over whatever transport reaches them.

Being a service of the application means being routed like one, and
Reboot serves legacy gRPC to whoever can reach the application --
Envoy will even transcode HTTP to it. Nothing here may be called that
way: `GetDownloadUrl` mints a capability for a blob's bytes and
`Delete` destroys them, both without consulting the `Blob` control
plane, whose authorizer is what decides who may read or remove a blob.
So every method names its caller first, on the same footing as every
other authorizer that asks whether a call is app-internal. What that
rests on is Envoy: a listener whose caller IDs it does not trust has
`x-reboot-caller-id` removed from everything arriving on it (see
`trust_caller_id` in `reboot/routing/envoy_config.py`), so a caller ID
that survives was put there by something entitled to.

Everything else is the store's: `FilesystemBlobStore` keeps the
bytes and drives `StoredBlob`, the state machine that keeps the
metadata, and `BlobDataPlaneServicer` hands it every call once
authorized. Nothing here holds state of its own, so any of a
replica's servers can serve any call.
"""

import grpc
from reboot.aio.caller_id import CallerID
from reboot.aio.headers import CALLER_ID_HEADER
from reboot.aio.interceptors import LegacyGrpcContext
from reboot.aio.internals.contextvars import get_application_id
from reboot.std.blob.v1._data_plane_servicer import BlobDataPlaneServicer
from reboot.std.blob.v1._store import FilesystemBlobStore


class FilesystemDataPlaneServicer(BlobDataPlaneServicer):
    """Serves `BlobDataPlane` from the application whose blobs it
    holds.

    The store is set by `BlobLibrary` once it knows where this
    application keeps them."""

    _store: FilesystemBlobStore

    def _blob_store(self) -> FilesystemBlobStore:
        return self._store

    async def _authorize(self, context: LegacyGrpcContext) -> None:
        """Refuses anyone but this application's own code.

        This is the check `is_app_internal` makes, made by hand
        because a legacy gRPC servicer has no authorizer to make it.
        It reads a header, and what stands behind that header is
        Envoy removing it from traffic whose caller IDs it does not
        trust -- see the note at the top of this module."""
        application_id = get_application_id()
        caller_id_header = dict(context.invocation_metadata()
                               ).get(CALLER_ID_HEADER)
        if caller_id_header is None or application_id is None:
            await context.abort(
                grpc.StatusCode.UNAUTHENTICATED,
                "the blob data plane serves only the application it "
                "belongs to",
            )
            raise RuntimeError("This is unreachable")

        try:
            caller_id = CallerID.parse(caller_id_header)
        except ValueError:
            await context.abort(
                grpc.StatusCode.UNAUTHENTICATED,
                "cannot deduce calling application from caller ID header",
            )
            raise RuntimeError("This is unreachable")

        if caller_id.application_id != application_id:
            await context.abort(
                grpc.StatusCode.PERMISSION_DENIED,
                "the blob data plane serves only the application it "
                "belongs to",
            )
            raise RuntimeError("This is unreachable")


def legacy_grpc_servicers() -> list[type]:
    return [FilesystemDataPlaneServicer]
