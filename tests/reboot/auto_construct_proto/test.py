import unittest
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot
from tests.reboot.auto_construct_proto.test_rbt import User
from tests.reboot.auto_construct_proto.test_servicer import UserServicer

_USER_ID = "test-user"


class AutoConstructProtoClaimsTest(unittest.IsolatedAsyncioTestCase):
    """Claims delivery to a *proto-defined* auto-construct state. Its
    `SetClaims` request carries claims as
    `map<string, google.protobuf.Value>`, but the framework delivers
    them as native Python values, so it must convert them — a path a
    Pydantic state (whose request accepts native values directly)
    never takes, which is why it needs its own test."""

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(Application(servicers=[UserServicer]))
        self.internal = self.rbt.create_external_context(
            name=f"internal-{self.id()}",
            app_internal=True,
        )

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_authenticated_delivers_native_claims(self) -> None:
        # `_authenticated` constructs the state (if needed) and
        # delivers the claims through `set_claims`.
        await UserServicer._authenticated(
            self.internal,
            state_id=_USER_ID,
            claims={"email": "jane@example.com"},
        )

        response = await User.ref(_USER_ID).get(self.internal)
        self.assertEqual(response.email, "jane@example.com")
        self.assertEqual(response.update_count, 1)

    async def test_set_claims_if_exists_delivers_native_claims(self) -> None:
        # The webhook path also delivers native claims, to a state that
        # already exists.
        await UserServicer._authenticated(self.internal, state_id=_USER_ID)
        await UserServicer._set_claims_if_exists(
            self.internal,
            state_id=_USER_ID,
            claims={"email": "jane@example.com"},
        )

        response = await User.ref(_USER_ID).get(self.internal)
        self.assertEqual(response.email, "jane@example.com")
        self.assertEqual(response.update_count, 1)


if __name__ == "__main__":
    unittest.main()
