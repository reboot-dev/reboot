import unittest
from reboot.aio.types import _STATE_TYPE_TAG_LENGTH, StateRef, StateTypeName


class TypesTestCase(unittest.IsolatedAsyncioTestCase):

    async def test_is_state_ref(self) -> None:
        self.assertFalse(StateRef.is_state_ref("a"))
        self.assertFalse(StateRef.is_state_ref("a" * 128))
        self.assertFalse(
            StateRef.is_state_ref("a" * _STATE_TYPE_TAG_LENGTH + ":a")
        )

        self.assertTrue(
            StateRef.is_state_ref(
                str(StateRef.from_id(StateTypeName("Example"), "a"))
            )
        )

        tagged = "AEyp_5wmAiADZg:parent/AAcExYZDHb-mAw:child"
        readable = "com.example.Parent:parent/com.example.Child:child"
        self.assertEqual(
            tagged,
            StateRef.from_id(
                StateTypeName("com.example.Parent"),
                "parent",
            ).colocate(
                StateTypeName("com.example.Child"),
                "child",
            ).to_str(),
        )
        state_ref = StateRef.from_maybe_readable(readable)
        self.assertEqual(tagged, state_ref.to_str())
        self.assertEqual(readable, state_ref.to_friendly_str())

    async def test_good_error_for_unescaped_slash(self) -> None:
        with self.assertRaises(ValueError) as e:
            StateRef.from_maybe_readable(
                "rbt.cloud.v1alpha1.application.Application:test-user/hello/hello"
            )

        self.assertIn(
            "If your state ID contains slashes (`/`), remember to replace them "
            "with their escape character: a backslash (`\\`).",
            str(e.exception),
        )


if __name__ == '__main__':
    unittest.main()
