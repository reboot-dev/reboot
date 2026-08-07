"""Servicers for the inspect dashboard's companion application."""
import reboot.std.presence.v1.presence
from rbt.inspect.companion_app.v1.dashboard_pb2 import (
    OpenedRequest,
    OpenedResponse,
    RecordOpenedRequest,
    RecordOpenedResponse,
    SchemaGetRequest,
    SchemaGetResponse,
    SchemaRecordRequest,
    SchemaRecordResponse,
)
from rbt.inspect.companion_app.v1.dashboard_rbt import Dashboard, Schema
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext, WriterContext
from reboot.aio.servicers import Servicer


class DashboardServicer(Dashboard.Servicer):
    """Records whether a dashboard has ever been opened.

    `rbt dev run` opens one the first time and then leaves the
    developer alone. Reading this rather than asking who is currently
    looking keeps the decision independent of whether a browser's
    disconnect ever reaches us, which is not something we can rely on
    through a proxy or a forwarded port.
    """

    def authorizer(self):
        return allow()

    async def Opened(
        self,
        context: ReaderContext,
        request: OpenedRequest,
    ) -> OpenedResponse:
        return OpenedResponse(opened=self.state.opened)

    async def RecordOpened(
        self,
        context: WriterContext,
        request: RecordOpenedRequest,
    ) -> RecordOpenedResponse:
        self.state.opened = True
        return RecordOpenedResponse()


class SchemaServicer(Schema.Servicer):
    """Holds the shape of the application under development.

    Written by the companion's watcher whenever what it sees changes,
    and read reactively by the dashboard, so a schema change reaches an
    open page without it having to ask.
    """

    def authorizer(self):
        return allow()

    async def Get(
        self,
        context: ReaderContext,
        request: SchemaGetRequest,
    ) -> SchemaGetResponse:
        return SchemaGetResponse(
            state_types=self.state.state_types,
            connected=self.state.connected,
            read_at_ms=self.state.read_at_ms,
        )

    async def Record(
        self,
        context: WriterContext,
        request: SchemaRecordRequest,
    ) -> SchemaRecordResponse:
        del self.state.state_types[:]
        self.state.state_types.extend(request.state_types)
        self.state.connected = request.connected
        self.state.read_at_ms = request.read_at_ms
        return SchemaRecordResponse()


def servicers() -> list[type[Servicer]]:
    """The servicers that back the inspect dashboard's own state.

    This state belongs to the dashboard rather than to the application
    being developed, so it lives in its own application and its own
    state store.

    This is a library rather than something built into the application
    below it, so that what these servicers are stays separate from what
    ends up hosting them.
    """
    return [DashboardServicer, SchemaServicer
           ] + reboot.std.presence.v1.presence.servicers()
