"""Servicers for the developer dashboard application."""
import os
from pathlib import Path
from rbt.dashboard.v1.dashboard_pb2 import (
    DashboardGetRequest,
    DashboardGetResponse,
    DashboardUpdateApiRequest,
    DashboardUpdateApiResponse,
    DashboardUpdateCodeRequest,
    DashboardUpdateCodeResponse,
    PreferencesGetRequest,
    PreferencesGetResponse,
    PreferencesSetMethodsExpandedRequest,
    PreferencesSetMethodsExpandedResponse,
    PreferencesSetNavWidthRequest,
    PreferencesSetNavWidthResponse,
    PreferencesSetSuppressOpenOnRestartRequest,
    PreferencesSetSuppressOpenOnRestartResponse,
)
from rbt.dashboard.v1.dashboard_rbt import Dashboard, Preferences
from rbt.std.collections.ordered_map.v1.ordered_map_rbt import OrderedMap
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import (
    ReaderContext,
    TransactionContext,
    WorkflowContext,
    WriterContext,
)
from reboot.dashboard.backend import api_watcher, code_watcher
from reboot.dashboard.backend.constants import (
    CHANGELOG_ID,
    ENVVAR_RBT_API_DIRECTORY,
    ENVVAR_RBT_APPLICATION,
    ENVVAR_RBT_GENERATED_DIRECTORY,
)
from reboot.dashboard.backend.needs_generate_reason import (
    needs_generate_reason,
)
from reboot.std.item.v1.item import Item
from reboot.uuidv7 import uuid7


class DashboardServicer(Dashboard.Servicer):
    """Holds the shape the developer's API files declare."""

    def authorizer(self):
        # Anyone who can reach this can already read the files it
        # describes: it holds nothing but the shape of the developer's
        # own API files, and only ever runs under `rbt dashboard`.
        return allow()

    async def Get(
        self,
        context: ReaderContext,
        request: DashboardGetRequest,
    ) -> DashboardGetResponse:
        return DashboardGetResponse(
            api_directory=self.state.api_directory,
            error=self.state.error if self.state.HasField('error') else None,
            api_files=self.state.api_files,
            apis=self.state.apis,
            api_digests=self.state.api_digests,
            servicers=self.state.servicers,
            generated=self.state.generated,
            needs_generate_reason=needs_generate_reason(self.state),
        )

    @classmethod
    async def WatchApi(
        cls,
        context: WorkflowContext,
        request: Dashboard.WatchApiRequest,
    ) -> Dashboard.WatchApiResponse:
        """Returns only when the dashboard stops, reading the
        developer's API files whenever they change.

        The directory comes from the environment each time this runs,
        so that an `rbt dashboard` restarted against a different one
        reads the new directory. Taking it from the request would keep
        whichever directory the run that started watching had.
        """
        api_directory = os.environ[ENVVAR_RBT_API_DIRECTORY]

        await api_watcher.watch(context, api_directory=api_directory)

        return Dashboard.WatchApiResponse()

    async def UpdateCode(
        self,
        context: TransactionContext,
        request: DashboardUpdateCodeRequest,
    ) -> DashboardUpdateCodeResponse:
        """Replaces what the application implements and records what
        changed, newest last."""
        del self.state.servicers[:]
        self.state.servicers.extend(request.servicers)
        self.state.code_files.clear()
        for filename, file in request.code_files.items():
            self.state.code_files[filename].CopyFrom(file)
        self.state.generated.clear()
        for filename, generated in request.generated.items():
            self.state.generated[filename].CopyFrom(generated)

        if len(request.changes) > 0:
            await OrderedMap.ref(CHANGELOG_ID).Insert(
                context,
                entries={
                    str(uuid7()): Item(bytes=change.SerializeToString())
                    for change in request.changes
                },
            )

        return DashboardUpdateCodeResponse()

    @classmethod
    async def WatchCode(
        cls,
        context: WorkflowContext,
        request: Dashboard.WatchCodeRequest,
    ) -> Dashboard.WatchCodeResponse:
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
            await code_watcher.watch(
                context,
                application=Path(application),
                generated_directory=(
                    Path(generated_directory)
                    if generated_directory is not None else None
                ),
            )

        return Dashboard.WatchCodeResponse()

    async def UpdateApi(
        self,
        context: TransactionContext,
        request: DashboardUpdateApiRequest,
    ) -> DashboardUpdateApiResponse:
        """Replaces what the API files declare and records what
        changed, newest last, as one transaction."""
        self.state.api_directory = request.api_directory
        if request.HasField('error'):
            self.state.error = request.error
        else:
            self.state.ClearField('error')
        self.state.api_files.clear()
        for filename, file in request.api_files.items():
            self.state.api_files[filename].CopyFrom(file)
        self.state.apis.clear()
        for filename, api in request.apis.items():
            self.state.apis[filename].CopyFrom(api)
        self.state.api_digests.clear()
        self.state.api_digests.update(request.api_digests)

        if len(request.changes) > 0:
            await OrderedMap.ref(CHANGELOG_ID).Insert(
                context,
                entries={
                    str(uuid7()): Item(bytes=change.SerializeToString())
                    for change in request.changes
                },
            )

        return DashboardUpdateApiResponse()


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
            expanded_methods=self.state.expanded_methods,
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

    async def SetMethodsExpanded(
        self,
        context: WriterContext,
        request: PreferencesSetMethodsExpandedRequest,
    ) -> PreferencesSetMethodsExpandedResponse:
        """Opens or closes each named method: one for a single
        method's toggle, all of a state type's for its own."""
        expanded = set(self.state.expanded_methods)

        for method in request.methods:
            key = f'{request.state_type}.{method}'
            if request.expanded:
                expanded.add(key)
            else:
                expanded.discard(key)

        self.state.expanded_methods[:] = sorted(expanded)

        return PreferencesSetMethodsExpandedResponse()

    async def SetNavWidth(
        self,
        context: WriterContext,
        request: PreferencesSetNavWidthRequest,
    ) -> PreferencesSetNavWidthResponse:
        self.state.nav_width = request.nav_width
        return PreferencesSetNavWidthResponse()
