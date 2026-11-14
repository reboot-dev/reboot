from reboot.api import API, Field, Methods, Model, Reader, Type, Writer


class TaskState(Model):
    title: str = Field(tag=1, default="", description="What needs doing.")
    priority: int = Field(
        tag=2, default=0,
        description="How urgent the task is, 0 (whenever) to 3 (today)."
    )
    notes: str = Field(
        tag=3, default="", description="Free text the owner adds."
    )
    done: bool = Field(
        tag=4, default=False, description="Whether it is finished."
    )


class EditRequest(Model):
    title: str = Field(tag=1, default="", description="New title.")
    priority: int = Field(
        tag=2, default=0, description="New priority, 0 to 3."
    )
    notes: str = Field(tag=3, default="", description="New notes.")


api = API(
    Task=Type(
        state=TaskState,
        description="One task on someone's list.",
        methods=Methods(
            create=Writer(
                request=EditRequest, response=None, factory=True,
                description="Create the task.", mcp=None
            ),
            edit=Writer(
                request=EditRequest, response=None,
                description="Change the task.", mcp=None
            ),
            complete=Writer(
                request=None, response=None, description="Mark it done.",
                mcp=None
            ),
            get=Reader(
                request=None, response=TaskState, description="Read the task.",
                mcp=None
            ),
        ),
    ),
)
