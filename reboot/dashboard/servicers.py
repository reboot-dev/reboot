"""Servicers for the developer dashboard application."""
import os
from google.protobuf.json_format import MessageToDict, ParseDict
from google.protobuf.struct_pb2 import Value
from rbt.dashboard.v1.dashboard_pb2 import (
    APIGetRequest,
    APIGetResponse,
    APIRecordChangesRequest,
    APIRecordChangesResponse,
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
from rbt.std.collections.ordered_map.v1.ordered_map_rbt import OrderedMap
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import (
    ReaderContext,
    TransactionContext,
    WorkflowContext,
    WriterContext,
)
from reboot.dashboard.api_watcher import watch
from reboot.dashboard.constants import CHANGELOG_ID, ENVVAR_RBT_API_DIRECTORY
from reboot.std.item.v1.item import Item
from reboot.uuidv7 import uuid7


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
            error=self.state.error if self.state.HasField('error') else None,
        )

    async def RecordChanges(
        self,
        context: TransactionContext,
        request: APIRecordChangesRequest,
    ) -> APIRecordChangesResponse:
        """Records what changed, newest last."""
        if len(request.changes) == 0:
            return APIRecordChangesResponse()

        await OrderedMap.ref(CHANGELOG_ID).Insert(
            context,
            entries={
                # As a `Value`, since the map's items are `Value`s.
                str(uuid7()):
                    Item(value=ParseDict(MessageToDict(change), Value()))
                for change in request.changes
            },
        )

        return APIRecordChangesResponse()

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
        del self.state.state_types[:]
        self.state.state_types.extend(request.state_types)
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
