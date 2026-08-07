"""Servicers for the inspect dashboard's companion application."""
import reboot.std.presence.v1.presence
from reboot.aio.servicers import Servicer


def servicers() -> list[type[Servicer]]:
    """The servicers that back the inspect dashboard's own state.

    `Presence` records which dashboards are currently open, which is
    what makes it possible to tell an already-open dashboard from none
    at all. This state belongs to the dashboard rather than to the
    application being developed, so it lives in its own application and
    its own state store.

    This is a library rather than something built into the application
    below it, so that what these servicers are stays separate from what
    ends up hosting them.
    """
    return reboot.std.presence.v1.presence.servicers()
