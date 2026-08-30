"""Servicers for the developer dashboard application."""
import os
from pathlib import Path
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
from rbt.dashboard.v1.dashboard_rbt import API, Implementation, Preferences
from rbt.std.collections.ordered_map.v1.ordered_map_rbt import OrderedMap
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import (
    ReaderContext,
    TransactionContext,
    WorkflowContext,
    WriterContext,
)
from reboot.dashboard import api_watcher, implementation_watcher
from reboot.dashboard.constants import (
    CHANGELOG_ID,
    ENVVAR_RBT_API_DIRECTORY,
    ENVVAR_RBT_APPLICATION,
    ENVVAR_RBT_GENERATED_DIRECTORY,
)
from reboot.std.item.v1.item import Item
from reboot.uuidv7 import uuid7


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
            api_directory=self.state.api_directory,
            error=self.state.error if self.state.HasField('error') else None,
            files=self.state.files,
            apis=self.state.apis,
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
        context: TransactionContext,
        request: APIUpdateRequest,
    ) -> APIUpdateResponse:
        """Replaces what the API files declare and records what
        changed, newest last, as one transaction."""
        self.state.api_directory = request.api_directory
        if request.HasField('error'):
            self.state.error = request.error
        else:
            self.state.ClearField('error')
        self.state.files.clear()
        for filename, file in request.files.items():
            self.state.files[filename].CopyFrom(file)
        self.state.apis.clear()
        for filename, api in request.apis.items():
            self.state.apis[filename].CopyFrom(api)

        if len(request.changes) > 0:
            await OrderedMap.ref(CHANGELOG_ID).Insert(
                context,
                entries={
                    str(uuid7()): Item(bytes=change.SerializeToString())
                    for change in request.changes
                },
            )

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
        return Implementation.GetResponse(
            servicers=self.state.servicers,
            generated=self.state.generated,
        )

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
        generated_directory = os.environ.get(ENVVAR_RBT_GENERATED_DIRECTORY)

        if application is not None:
            await implementation_watcher.watch(
                context,
                application=Path(application),
                generated_directory=(
                    Path(generated_directory)
                    if generated_directory is not None else None
                ),
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
