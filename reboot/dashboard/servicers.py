"""Servicers for the developer dashboard application."""
import os
import reboot.std.presence.v1.presence
from rbt.dashboard.v1.dashboard_pb2 import (
    APIGetRequest,
    APIGetResponse,
    APIUpdateRequest,
    APIUpdateResponse,
    PreferencesGetRequest,
    PreferencesGetResponse,
    PreferencesSetExpandedRequest,
    PreferencesSetExpandedResponse,
    PreferencesSetNavWidthRequest,
    PreferencesSetNavWidthResponse,
    PreferencesSetSuppressOpenOnRestartRequest,
    PreferencesSetSuppressOpenOnRestartResponse,
)
from rbt.dashboard.v1.dashboard_rbt import API, Preferences
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext, WorkflowContext, WriterContext
from reboot.aio.servicers import Servicer
from reboot.dashboard.api_watcher import watch
from reboot.dashboard.constants import ENVVAR_RBT_API_DIRECTORY


class APIServicer(API.Servicer):
    """Holds the shape the developer's API files declare."""

    def authorizer(self):
        return allow()

    async def Get(
        self,
        context: ReaderContext,
        request: APIGetRequest,
    ) -> APIGetResponse:
        return APIGetResponse(
            state_types=(
                self.state.state_types
                if self.state.HasField('state_types') else None
            ),
            error=self.state.error if self.state.HasField('error') else None,
        )

    @classmethod
    async def Watch(
        cls,
        context: WorkflowContext,
        request: API.WatchRequest,
    ) -> API.WatchResponse:
        """Reads the developer's API files when they change.

        The directory comes from the environment each time this runs,
        so that an `rbt dashboard` restarted against a different one
        reads the new directory. Taking it from the request would keep
        whichever directory the run that started watching had.
        """
        api_directory = os.environ[ENVVAR_RBT_API_DIRECTORY]

        await watch(context, api_directory=api_directory)

        return API.WatchResponse()

    async def Update(
        self,
        context: WriterContext,
        request: APIUpdateRequest,
    ) -> APIUpdateResponse:
        if request.HasField('state_types'):
            self.state.state_types.CopyFrom(request.state_types)
        else:
            self.state.ClearField('state_types')
        if request.HasField('error'):
            self.state.error = request.error
        else:
            self.state.ClearField('error')
        return APIUpdateResponse()


class PreferencesServicer(Preferences.Servicer):
    """Holds what the developer has said about their dashboard.

    Two unrelated choices share one state because both are facts about
    this machine's dashboard rather than about the application, and
    each has its own writer so that recording one never overwrites the
    other.
    """

    def authorizer(self):
        return allow()

    async def Get(
        self,
        context: ReaderContext,
        request: PreferencesGetRequest,
    ) -> PreferencesGetResponse:
        return PreferencesGetResponse(
            suppress_open_on_restart=self.state.suppress_open_on_restart,
            expanded_state_types=self.state.expanded_state_types,
            nav_width=(
                self.state.nav_width
                if self.state.HasField('nav_width') else None
            ),
        )

    async def SetSuppressOpenOnRestart(
        self,
        context: WriterContext,
        request: PreferencesSetSuppressOpenOnRestartRequest,
    ) -> PreferencesSetSuppressOpenOnRestartResponse:
        self.state.suppress_open_on_restart = request.suppress_open_on_restart
        return PreferencesSetSuppressOpenOnRestartResponse()

    async def SetExpanded(
        self,
        context: WriterContext,
        request: PreferencesSetExpandedRequest,
    ) -> PreferencesSetExpandedResponse:
        expanded = set(self.state.expanded_state_types)

        if request.expanded:
            expanded.add(request.state_type)
        else:
            expanded.discard(request.state_type)

        self.state.expanded_state_types[:] = sorted(expanded)

        return PreferencesSetExpandedResponse()

    async def SetNavWidth(
        self,
        context: WriterContext,
        request: PreferencesSetNavWidthRequest,
    ) -> PreferencesSetNavWidthResponse:
        self.state.nav_width = request.nav_width
        return PreferencesSetNavWidthResponse()


def servicers() -> list[type[Servicer]]:
    """The servicers that back the dashboard's own state.

    This state belongs to the dashboard rather than to the application
    being developed, so it lives in its own application and its own
    state store.

    This is a library rather than something built into the application
    below it, so that what these servicers are stays separate from what
    ends up hosting them.
    """
    return [
        APIServicer,
        PreferencesServicer,
    ] + reboot.std.presence.v1.presence.servicers()
