import unittest
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot
from tests.reboot.pydantic.implicit_constructor_with_defaults.servicer import (
    DefaultValuesTestServicer,
)
from tests.reboot.pydantic.implicit_constructor_with_defaults.servicer_api import (
    GetStateResponse,
    VariantA,
)
from tests.reboot.pydantic.implicit_constructor_with_defaults.servicer_api_rbt import (
    DefaultValuesTest,
)

_TEST_STATE_ID = 'test'


class DiscriminatedUnionTestCase(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_discriminated_union_variant_a(self) -> None:
        await self.rbt.up(
            Application(servicers=[DefaultValuesTestServicer]),
            servers=1,
        )

        context = self.rbt.create_external_context(name=self.id())

        test = DefaultValuesTest.ref(_TEST_STATE_ID)

        await test.initialize_with_defaults(context)

        state = await test.get_state(context)

        empty_state = GetStateResponse(
            text="",
            number=0,
            flag=False,
            status="first",
            items=[],
            mapping={},
            optional_text=None,
            variant=None,
        )

        self.assertEqual(state, empty_state)

        await test.update_state(
            context,
            text="updated text",
            number=42,
            flag=True,
            status="second",
            items=["item1", "item2"],
            mapping={
                "key1": "value1",
                "key2": "value2"
            },
            optional_text="optional value",
            variant=VariantA(kind="A", value_a="variant-value"),
        )

        updated_state = await test.get_state(context)

        expected_state = GetStateResponse(
            text="updated text",
            number=42,
            flag=True,
            status="second",
            items=["item1", "item2"],
            mapping={
                "key1": "value1",
                "key2": "value2"
            },
            optional_text="optional value",
            variant=VariantA(kind="A", value_a="variant-value"),
        )

        self.assertEqual(updated_state, expected_state)

        await test.update_state(
            context,
        )

        self.assertEqual(
            await test.get_state(context),
            empty_state,
        )


if __name__ == '__main__':
    unittest.main()
