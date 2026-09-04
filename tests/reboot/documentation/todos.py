# api/todos/v1/todos.py
from reboot.api import (
    API,
    Field,
    Methods,
    Model,
    Reader,
    Tool,
    Transaction,
    Type,
    Writer,
)


class UserState(Model):
    # The person's profile, kept current from the identity provider's
    # verified claims on every sign-in.
    name: str = Field(tag=1, default="")
    email: str = Field(tag=2, default="")
    # The todo lists this person owns: each list's state ID, and its
    # title so the lists can be shown without a call per list.
    todo_lists: dict[str, str] = Field(tag=3, default_factory=dict)


class ProfileResponse(Model):
    name: str = Field(tag=1)
    email: str = Field(tag=2)


class CreateTodoListRequest(Model):
    title: str = Field(tag=1)


class CreateTodoListResponse(Model):
    todo_list_id: str = Field(tag=1)


class TodoListSummary(Model):
    todo_list_id: str = Field(tag=1)
    title: str = Field(tag=2)


class ListTodoListsResponse(Model):
    todo_lists: list[TodoListSummary] = Field(tag=1, default_factory=list)


class TodoListState(Model):
    title: str = Field(tag=1, default="")
    # The `user_id` of the owner, so that only they may read or change
    # the list.
    owner_id: str = Field(tag=2, default="")
    todos: list[str] = Field(tag=3, default_factory=list)


class InitializeTodoListRequest(Model):
    title: str = Field(tag=1)
    owner_id: str = Field(tag=2)


class AddTodoRequest(Model):
    todo: str = Field(tag=1)


class TodosResponse(Model):
    title: str = Field(tag=1)
    todos: list[str] = Field(tag=2, default_factory=list)


api = API(
    User=Type(
        state=UserState,
        methods=Methods(
            profile=Reader(
                request=None,
                response=ProfileResponse,
                description="The signed-in user's name and email.",
                mcp=Tool(),
            ),
            create_todo_list=Transaction(
                request=CreateTodoListRequest,
                response=CreateTodoListResponse,
                description="Create a todo list for the signed-in "
                "user. Returns its `todo_list_id`, which is not "
                "human-readable but must be passed to tools that "
                "take one.",
                mcp=Tool(),
            ),
            list_todo_lists=Reader(
                request=None,
                response=ListTodoListsResponse,
                description="List the signed-in user's todo lists: "
                "`todo_list_id` and title for each.",
                mcp=Tool(),
            ),
        ),
    ),
    TodoList=Type(
        state=TodoListState,
        methods=Methods(
            create=Writer(
                request=InitializeTodoListRequest,
                response=None,
                factory=True,
                description="Create the list with a title and an "
                "owner.",
                mcp=None,
            ),
            add=Writer(
                request=AddTodoRequest,
                response=None,
                description="Add a todo to the list.",
                mcp=Tool(),
            ),
            todos=Reader(
                request=None,
                response=TodosResponse,
                description="The list's title and its todos.",
                mcp=Tool(),
            ),
        ),
    ),
)
