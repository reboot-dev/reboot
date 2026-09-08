# backend/src/servicers/todos.py
from rbt.v1alpha1.errors_pb2 import Ok, PermissionDenied, Unauthenticated
from reboot.aio.auth.authorizers import Authorizer, allow_if, is_app_internal
from reboot.aio.contexts import (
    ReaderContext,
    TransactionContext,
    WriterContext,
)
from tests.reboot.documentation.todos import (
    AddTodoRequest,
    CreateTodoListRequest,
    CreateTodoListResponse,
    InitializeTodoListRequest,
    ListTodoListsResponse,
    ProfileResponse,
    TodoListSummary,
    TodosResponse,
)
from tests.reboot.documentation.todos_rbt import TodoList, User
from typing import Optional


def _caller_is_owner(
    *,
    context: ReaderContext,
    state: Optional[TodoList.State],
    **kwargs,
):
    """Allow when the caller's `user_id` matches the list's recorded
    `owner_id`. A not-yet-constructed list (`state is None`) falls
    through to deny."""
    if context.auth is None or not context.auth.user_id:
        return Unauthenticated()
    if state is not None and context.auth.user_id == state.owner_id:
        return Ok()
    return PermissionDenied()


class UserServicer(User.Servicer):
    """The signed-in person: their profile, and the todo lists they
    own."""

    async def create(
        self,
        context: TransactionContext,
    ) -> None:
        """Runs once, when a person signs in for the first time: give
        them a list to start with."""
        todo_list, _ = await TodoList.create(
            context,
            title="Getting started",
            owner_id=context.state_id,
        )
        await todo_list.add(context, todo="Add your first todo")
        self.state.todo_lists[todo_list.state_id] = "Getting started"

    async def set_claims(
        self,
        context: TransactionContext,
        request: User.SetClaimsRequest,
    ) -> None:
        """Runs on every sign-in with the identity provider's verified
        claims, which are the complete, current set: derive all
        claim-backed state from them rather than merging."""
        self.state.name = request.claims.get("name", "")
        self.state.email = request.claims.get("email", "")

    async def profile(
        self,
        context: ReaderContext,
    ) -> ProfileResponse:
        return ProfileResponse(name=self.state.name, email=self.state.email)

    async def create_todo_list(
        self,
        context: TransactionContext,
        request: CreateTodoListRequest,
    ) -> CreateTodoListResponse:
        """Create a list owned by the signed-in person and remember it
        on their `User`."""
        todo_list, _ = await TodoList.create(
            context,
            title=request.title,
            owner_id=context.state_id,
        )
        self.state.todo_lists[todo_list.state_id] = request.title
        return CreateTodoListResponse(todo_list_id=todo_list.state_id)

    async def list_todo_lists(
        self,
        context: ReaderContext,
    ) -> ListTodoListsResponse:
        return ListTodoListsResponse(
            todo_lists=[
                TodoListSummary(todo_list_id=todo_list_id, title=title)
                for todo_list_id, title in self.state.todo_lists.items()
            ]
        )


class TodoListServicer(TodoList.Servicer):
    """One todo list, readable and writable by its owner only."""

    def authorizer(self) -> Authorizer:
        return TodoList.Authorizer(
            # `create` is restricted to trusted app code and records
            # the list's owner; every other method is restricted to
            # that owner (or, again, to trusted app code).
            create=allow_if(all=[is_app_internal]),
            add=allow_if(any=[_caller_is_owner, is_app_internal]),
            todos=allow_if(any=[_caller_is_owner, is_app_internal]),
        )

    async def create(
        self,
        context: WriterContext,
        request: InitializeTodoListRequest,
    ) -> None:
        self.state.title = request.title
        self.state.owner_id = request.owner_id

    async def add(
        self,
        context: WriterContext,
        request: AddTodoRequest,
    ) -> None:
        self.state.todos.append(request.todo)

    async def todos(
        self,
        context: ReaderContext,
    ) -> TodosResponse:
        return TodosResponse(title=self.state.title, todos=self.state.todos)
