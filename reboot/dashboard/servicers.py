"""Servicers for the developer dashboard application."""
import os
import reboot.std.presence.v1.presence
from rbt.dashboard.v1.dashboard_pb2 import (
    APIGetRequest,
    APIGetResponse,
    APIUpdateCallsRequest,
    APIUpdateCallsResponse,
    APIUpdateRequest,
    APIUpdateResponse,
    PreferencesGetRequest,
    PreferencesGetResponse,
    PreferencesSetExpandedRequest,
    PreferencesSetExpandedResponse,
    PreferencesSetSuppressOpenOnRestartRequest,
    PreferencesSetSuppressOpenOnRestartResponse,
)
from rbt.dashboard.v1.dashboard_rbt import API, Preferences
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext, WorkflowContext, WriterContext
from reboot.aio.servicers import Servicer
from reboot.dashboard.api_watcher import watch
from reboot.dashboard.constants import (
    ENVVAR_RBT_API_DIRECTORY,
    ENVVAR_RBT_SOURCE_DIRECTORY,
)
from reboot.dashboard.servicer_watcher import watch as watch_calls


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
            state_types=self.state.state_types,
            error=self.state.error,
            method_calls=self.state.method_calls,
            calls_error=self.state.calls_error,
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

    @classmethod
    async def WatchCalls(
        cls,
        context: WorkflowContext,
        request: API.WatchCallsRequest,
    ) -> API.WatchCallsResponse:
        """Analyzes what the developer's methods call when they change.

        A developer who named no source directory gets no analysis;
        there is nowhere to read the implementations from, which is the
        normal case for a Node.js application.
        """
        source_directory = os.environ.get(ENVVAR_RBT_SOURCE_DIRECTORY)

        if source_directory is not None:
            await watch_calls(context, source_directory=source_directory)

        return API.WatchCallsResponse()

    async def Update(
        self,
        context: WriterContext,
        request: APIUpdateRequest,
    ) -> APIUpdateResponse:
        del self.state.state_types[:]
        self.state.state_types.extend(request.state_types)
        self.state.error = request.error
        return APIUpdateResponse()

    async def UpdateCalls(
        self,
        context: WriterContext,
        request: APIUpdateCallsRequest,
    ) -> APIUpdateCallsResponse:
        del self.state.method_calls[:]
        self.state.method_calls.extend(request.method_calls)
        self.state.calls_error = request.error
        return APIUpdateCallsResponse()


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
