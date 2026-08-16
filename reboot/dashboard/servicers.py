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
    PreferencesSetSuppressOpenOnRestartRequest,
    PreferencesSetSuppressOpenOnRestartResponse,
)
from rbt.dashboard.v1.dashboard_rbt import API, Implementation, Preferences
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext, WorkflowContext, WriterContext
from reboot.aio.servicers import Servicer
from reboot.dashboard import api_watcher, implementation_watcher
from reboot.dashboard.constants import (
    ENVVAR_RBT_API_DIRECTORY,
    ENVVAR_RBT_APPLICATION,
)


class APIServicer(API.Servicer):
    """Holds the shape the developer's API files declare."""

    def authorizer(self):
        # Anyone who can reach this can already read the files it
        # describes: it holds nothing but the shape of the developer's
        # own API files, and only ever runs under `rbt dashboard`.
        return allow()

    async def Get(
        self,
        context: ReaderContext,
        request: APIGetRequest,
    ) -> APIGetResponse:
        return APIGetResponse(
            state_types=self.state.state_types,
            error=self.state.error,
        )

    @classmethod
    async def Watch(
        cls,
        context: WorkflowContext,
        request: API.WatchRequest,
    ) -> API.WatchResponse:
        """Returns only when the dashboard stops, reading the
        developer's API files whenever they change.

        The directory comes from the environment each time this runs,
        so that an `rbt dashboard` restarted against a different one
        reads the new directory. Taking it from the request would keep
        whichever directory the run that started watching had.
        """
        api_directory = os.environ[ENVVAR_RBT_API_DIRECTORY]

        await api_watcher.watch(context, api_directory=api_directory)

        return API.WatchResponse()

    async def Update(
        self,
        context: WriterContext,
        request: APIUpdateRequest,
    ) -> APIUpdateResponse:
        del self.state.state_types[:]
        self.state.state_types.extend(request.state_types)
        self.state.error = request.error
        return APIUpdateResponse()


class ImplementationServicer(Implementation.Servicer):
    """Holds where each state type the developer declared is
    implemented."""

    def authorizer(self):
        # Anyone who can reach this can already read the files it
        # names: it holds nothing but paths into the developer's own
        # checkout, and only ever runs under `rbt dashboard`.
        return allow()

    async def Get(
        self,
        context: ReaderContext,
        request: Implementation.GetRequest,
    ) -> Implementation.GetResponse:
        return Implementation.GetResponse(servicers=self.state.servicers)

    @classmethod
    async def Watch(
        cls,
        context: WorkflowContext,
        request: Implementation.WatchRequest,
    ) -> Implementation.WatchResponse:
        """Returns only when the dashboard stops, working out which of
        the developer's files implements each state type.

        The application comes from the environment each time this
        runs, for the same reason the API directory does. A developer
        who named none gets nothing looked for, which is the normal
        case for a Node.js application.
        """
        application = os.environ.get(ENVVAR_RBT_APPLICATION)

        if application is not None:
            await implementation_watcher.watch(
                context, application=application
            )

        return Implementation.WatchResponse()


class PreferencesServicer(Preferences.Servicer):
    """Holds what the developer has said about their dashboard.

    Two unrelated choices share one state because both are facts about
    this machine's dashboard rather than about the application, and
    each has its own writer so that recording one never overwrites the
    other.
    """

    def authorizer(self):
        # Nothing here is worth keeping from anyone who can reach it:
        # it holds what this machine's own browser was told about
        # opening dashboards, and only ever runs under `rbt dashboard`.
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
    """Returns the servicers that back the dashboard's own state.

    This state belongs to the dashboard rather than to the application
    being developed, so it lives in its own application and its own
    state store.

    This is a library rather than something built into the application
    below it, so that what these servicers are stays separate from what
    ends up hosting them.
    """
    return [
        APIServicer,
        ImplementationServicer,
        PreferencesServicer,
    ] + reboot.std.presence.v1.presence.servicers()
