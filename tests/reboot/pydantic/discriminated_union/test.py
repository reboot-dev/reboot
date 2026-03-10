"""Tests for discriminated union support in Pydantic APIs."""
import unittest
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot
from tests.reboot.pydantic.discriminated_union.servicer import (
    DiscriminatedUnionTestServicer,
    NestedDiscriminatedUnionTestServicer,
)
from tests.reboot.pydantic.discriminated_union.servicer_api import (
    InnerX,
    InnerY,
    NestedTestRequest,
    NestedTestResponse,
    OptionA,
    OptionB,
    OptionC,
    TestRequest,
    TestResponse,
)
from tests.reboot.pydantic.discriminated_union.servicer_api_rbt import (
    DiscriminatedUnionTest,
    NestedDiscriminatedUnionTest,
)

_TEST_STATE_ID = 'test-disc-union-1234'


class DiscriminatedUnionTestCase(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_discriminated_union_variant_a(self) -> None:
        await self.rbt.up(
            Application(servicers=[DiscriminatedUnionTestServicer]),
            servers=1,
        )

        context = self.rbt.create_external_context(name=self.id())

        test, _ = await DiscriminatedUnionTest.initialize(
            context,
            _TEST_STATE_ID,
        )

        # Send `OptionA`.
        request = TestRequest(
            discriminated_union=OptionA(
                kind='A',
                value_a='hello world',
            ),
        )

        response = await test.process_variant(context, request)

        self.assertIsInstance(response, TestResponse)
        self.assertIsInstance(response.result, OptionA)
        self.assertEqual(response.result.kind, 'A')
        self.assertEqual(response.result.value_a, 'hello world')

        # Verify state was updated.
        get_response = await test.get_current_variant(context)
        self.assertIsInstance(get_response.result, OptionA)
        self.assertEqual(get_response.result.value_a, 'hello world')

        # Also test the case where we set the discriminated union to
        # `None` explicitly.
        await test.process_variant(context, discriminated_union=None)

        get_response = await test.get_current_variant(context)
        self.assertIsNone(get_response.result)

    async def test_discriminated_union_variant_b(self) -> None:
        await self.rbt.up(
            Application(servicers=[DiscriminatedUnionTestServicer]),
            servers=1,
        )

        context = self.rbt.create_external_context(name=self.id())

        test, _ = await DiscriminatedUnionTest.initialize(
            context,
            _TEST_STATE_ID,
        )

        response = await test.process_variant(
            context,
            discriminated_union=OptionB(
                kind='B',
                value_b=3.14159,
            ),
        )

        self.assertIsInstance(response, TestResponse)
        self.assertIsInstance(response.result, OptionB)
        self.assertEqual(response.result.kind, 'B')
        self.assertEqual(response.result.value_b, 3.14159)

        # Verify state was updated.
        get_response = await test.get_current_variant(context)
        self.assertIsInstance(get_response.result, OptionB)
        self.assertEqual(get_response.result.value_b, 3.14159)

    async def test_switch_between_variants(self) -> None:
        """Test switching between different variants."""
        await self.rbt.up(
            Application(servicers=[DiscriminatedUnionTestServicer]),
            servers=1,
        )

        context = self.rbt.create_external_context(name=self.id())

        test, _ = await DiscriminatedUnionTest.initialize(
            context,
            _TEST_STATE_ID,
        )

        # Start with `OptionA`.
        request_a = TestRequest(
            discriminated_union=OptionA(
                kind='A',
                value_a='first',
            ),
        )
        response = await test.process_variant(context, request_a)
        self.assertIsInstance(response.result, OptionA)

        # Switch to `OptionB`.
        request_b = TestRequest(
            discriminated_union=OptionB(
                kind='B',
                value_b=42.0,
            ),
        )
        response = await test.process_variant(context, request_b)
        self.assertIsInstance(response.result, OptionB)
        self.assertEqual(response.result.value_b, 42.0)

        # Verify state is now OptionB.
        get_response = await test.get_current_variant(context)
        self.assertIsInstance(get_response.result, OptionB)

        # Switch back to OptionA.
        request_a2 = TestRequest(
            discriminated_union=OptionA(
                kind='A',
                value_a='back to A',
            ),
        )
        response = await test.process_variant(context, request_a2)
        self.assertIsInstance(response.result, OptionA)
        self.assertEqual(response.result.value_a, 'back to A')


class NestedDiscriminatedUnionTestCase(unittest.IsolatedAsyncioTestCase):
    """Tests for nested discriminated unions."""

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_nested_discriminated_union_with_inner_x(self) -> None:
        """Test OptionC with nested InnerX variant."""
        await self.rbt.up(
            Application(servicers=[NestedDiscriminatedUnionTestServicer]),
            servers=1,
        )

        context = self.rbt.create_external_context(name=self.id())

        test, _ = await NestedDiscriminatedUnionTest.initialize(
            context,
            _TEST_STATE_ID,
        )

        # Send `OptionC` with nested `InnerX`.
        request = NestedTestRequest(
            discriminated_union=OptionC(
                kind='C',
                nested=InnerX(
                    inner_kind='X',
                    x_value='nested x value',
                ),
            ),
        )

        response = await test.process_nested_variant(context, request)

        self.assertIsInstance(response, NestedTestResponse)
        self.assertIsInstance(response.result, OptionC)
        self.assertEqual(response.result.kind, 'C')
        self.assertIsInstance(response.result.nested, InnerX)
        self.assertEqual(response.result.nested.inner_kind, 'X')
        self.assertEqual(response.result.nested.x_value, 'nested x value')

        # Verify state was updated.
        get_response = await test.get_current_nested_variant(context)
        self.assertIsInstance(get_response.result, OptionC)
        self.assertIsInstance(get_response.result.nested, InnerX)
        self.assertEqual(get_response.result.nested.x_value, 'nested x value')

    async def test_nested_discriminated_union_with_inner_y(self) -> None:
        """Test OptionC with nested InnerY variant."""
        await self.rbt.up(
            Application(servicers=[NestedDiscriminatedUnionTestServicer]),
            servers=1,
        )

        context = self.rbt.create_external_context(name=self.id())

        test, _ = await NestedDiscriminatedUnionTest.initialize(
            context,
            _TEST_STATE_ID,
        )

        # Send `OptionC` with nested `InnerY`.
        response = await test.process_nested_variant(
            context,
            discriminated_union=OptionC(
                kind='C',
                nested=InnerY(
                    inner_kind='Y',
                    y_value=42,
                ),
            ),
        )

        self.assertIsInstance(response, NestedTestResponse)
        self.assertIsInstance(response.result, OptionC)
        self.assertEqual(response.result.kind, 'C')
        self.assertIsInstance(response.result.nested, InnerY)
        self.assertEqual(response.result.nested.inner_kind, 'Y')
        self.assertEqual(response.result.nested.y_value, 42)

    async def test_switch_between_nested_and_simple_variants(self) -> None:
        """Test switching between OptionC (nested) and simple options."""
        await self.rbt.up(
            Application(servicers=[NestedDiscriminatedUnionTestServicer]),
            servers=1,
        )

        context = self.rbt.create_external_context(name=self.id())

        test, _ = await NestedDiscriminatedUnionTest.initialize(
            context,
            _TEST_STATE_ID,
        )

        # Start with simple OptionA.
        response = await test.process_nested_variant(
            context,
            discriminated_union=OptionA(
                kind='A',
                value_a='simple A',
            ),
        )
        self.assertIsInstance(response.result, OptionA)

        # Switch to nested OptionC with InnerX.
        response = await test.process_nested_variant(
            context,
            discriminated_union=OptionC(
                kind='C',
                nested=InnerX(
                    inner_kind='X',
                    x_value='now nested',
                ),
            ),
        )
        self.assertIsInstance(response.result, OptionC)
        self.assertIsInstance(response.result.nested, InnerX)

        # Switch to simple OptionB.
        response = await test.process_nested_variant(
            context,
            discriminated_union=OptionB(
                kind='B',
                value_b=99.9,
            ),
        )
        self.assertIsInstance(response.result, OptionB)
        self.assertEqual(response.result.value_b, 99.9)

        # Switch back to nested OptionC with InnerY.
        response = await test.process_nested_variant(
            context,
            discriminated_union=OptionC(
                kind='C',
                nested=InnerY(
                    inner_kind='Y',
                    y_value=123,
                ),
            ),
        )
        self.assertIsInstance(response.result, OptionC)
        self.assertIsInstance(response.result.nested, InnerY)
        self.assertEqual(response.result.nested.y_value, 123)

        # Verify final state.
        get_response = await test.get_current_nested_variant(context)
        self.assertIsInstance(get_response.result, OptionC)
        self.assertIsInstance(get_response.result.nested, InnerY)


if __name__ == '__main__':
    unittest.main()
