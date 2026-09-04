import unittest
from reboot.aio.aborted import Aborted
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot
from servicers.todos import TodoListServicer, UserServicer
from tests.reboot.documentation.todos_rbt import TodoList, User

_ALICE = "alice"


class TodosTest(unittest.IsolatedAsyncioTestCase):
    """Exercises the todo-list `User` example the users docs pull
    from, so the code they show is real and tested."""

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(
            Application(servicers=[UserServicer, TodoListServicer])
        )
        # A signed-in person: minting the token goes through the same
        # code path as a real sign-in, which auto-constructs their
        # `User` (and so runs `UserServicer.create`).
        self.context = await self.rbt.create_external_context_as(
            name=f"test-{self.id()}",
            user_id=_ALICE,
        )

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_first_sign_in_seeds_a_list_once(self) -> None:
        # `create` ran on first sign-in and left a list behind.
        listed = await User.ref(_ALICE).list_todo_lists(self.context)
        self.assertEqual(
            [todo_list.title for todo_list in listed.todo_lists],
            ["Getting started"],
        )
        todos = await TodoList.ref(listed.todo_lists[0].todo_list_id
                                  ).todos(self.context)
        self.assertEqual(todos.todos, ["Add your first todo"])

        # Signing in again finds the same `User`; `create` does not
        # run a second time.
        again = await self.rbt.create_external_context_as(
            name=f"again-{self.id()}",
            user_id=_ALICE,
        )
        listed = await User.ref(_ALICE).list_todo_lists(again)
        self.assertEqual(len(listed.todo_lists), 1)

    async def test_create_add_and_list(self) -> None:
        created = await User.ref(_ALICE).create_todo_list(
            self.context,
            title="Groceries",
        )
        todo_list = TodoList.ref(created.todo_list_id)
        await todo_list.add(self.context, todo="Milk")

        todos = await todo_list.todos(self.context)
        self.assertEqual(todos.title, "Groceries")
        self.assertEqual(todos.todos, ["Milk"])

        listed = await User.ref(_ALICE).list_todo_lists(self.context)
        self.assertEqual(
            sorted(todo_list.title for todo_list in listed.todo_lists),
            ["Getting started", "Groceries"],
        )

    async def test_claims_fill_in_the_profile(self) -> None:
        # A sign-in that delivers identity claims lands them in
        # `UserServicer.set_claims`.
        token = await self.rbt.make_valid_oauth_access_token(
            user_id=_ALICE,
            claims={
                "name": "Alice",
                "email": "alice@example.com"
            },
        )
        context = self.rbt.create_external_context(
            name=f"claims-{self.id()}",
            bearer_token=token,
        )
        profile = await User.ref(_ALICE).profile(context)
        self.assertEqual(profile.name, "Alice")
        self.assertEqual(profile.email, "alice@example.com")

    async def test_non_owner_cannot_read_a_list(self) -> None:
        created = await User.ref(_ALICE).create_todo_list(
            self.context,
            title="Private",
        )

        # Another signed-in person, with a valid token but a different
        # `user_id`, is refused by the `_caller_is_owner` authorizer.
        other_context = await self.rbt.create_external_context_as(
            name=f"other-{self.id()}",
            user_id="bob",
        )
        with self.assertRaises(Aborted):
            await TodoList.ref(created.todo_list_id).todos(other_context)

        # The owner still can.
        todos = await TodoList.ref(created.todo_list_id).todos(self.context)
        self.assertEqual(todos.title, "Private")


if __name__ == "__main__":
    unittest.main()
