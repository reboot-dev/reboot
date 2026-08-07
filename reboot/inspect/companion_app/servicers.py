"""Servicers for the inspect dashboard's companion application."""
import reboot.std.presence.v1.presence
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext, WriterContext
from reboot.aio.servicers import Servicer
from reboot.inspect.companion_app.dashboard_api_rbt import Dashboard


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

    async def opened(
        self,
        context: ReaderContext,
    ) -> Dashboard.OpenedResponse:
        return Dashboard.OpenedResponse(opened=self.state.opened)

    async def record_opened(self, context: WriterContext) -> None:
        self.state.opened = True


def servicers() -> list[type[Servicer]]:
    """The servicers that back the inspect dashboard's own state.

    This state belongs to the dashboard rather than to the application
    being developed, so it lives in its own application and its own
    state store.

    This is a library rather than something built into the application
    below it, so that what these servicers are stays separate from what
    ends up hosting them.
    """
    return [DashboardServicer] + reboot.std.presence.v1.presence.servicers()
