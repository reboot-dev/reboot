from reboot.api import API, Field, Methods, Model, Reader, Type, Writer


class DashboardState(Model):
    # Whether a dashboard has ever been opened for this application.
    # `rbt dev run` opens one the first time and then leaves the
    # developer alone, so that a restart doesn't put a tab in front of
    # them again.
    opened: bool = Field(tag=1, default=False)


class OpenedResponse(Model):
    opened: bool = Field(tag=1)


api = API(
    Dashboard=Type(
        state=DashboardState,
        methods=Methods(
            opened=Reader(
                request=None,
                response=OpenedResponse,
                mcp=None,
            ),
            record_opened=Writer(
                request=None,
                response=None,
                mcp=None,
            ),
        ),
    ),
)
