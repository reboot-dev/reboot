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

    async def test_colon_in_state_id(self) -> None:
        # State IDs may contain `:` (and `/`, which gets escaped); only
        # the first `:` in a state ref component separates the state
        # type from the state id.
        state_ref = StateRef.from_id(
            StateTypeName("com.example.Parent"), "foo:bar/baz"
        )
        self.assertEqual("foo:bar/baz", state_ref.id)
        self.assertTrue(StateRef.is_state_ref(state_ref.to_str()))

        # The tagged form parses back to the same ref.
        self.assertEqual(
            state_ref, StateRef.from_maybe_readable(state_ref.to_str())
        )

        # The readable form (with the slash escaped as a backslash, but
        # the colons unescaped) parses to the same ref.
        readable = StateRef.from_maybe_readable(
            "com.example.Parent:foo:bar\\baz"
        )
        self.assertEqual(state_ref, readable)
        self.assertEqual("foo:bar/baz", readable.id)

    async def test_empty_state_type_rejected(self) -> None:
        with self.assertRaises(ValueError) as e:
            StateRef.from_maybe_readable(":id")

        self.assertIn(
            "Invalid state reference component `:id`",
            str(e.exception),
        )

        # An empty state ID portion parses successfully, and the state
        # type is converted to its tag.
        readable = StateRef.from_maybe_readable("com.example.Parent:")
        self.assertEqual("AEyp_5wmAiADZg:", readable.to_str())
        self.assertEqual("", readable.id)

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
