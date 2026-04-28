import unittest
from rbt.v1alpha1.errors_pb2 import (
    FailedPrecondition,
    PermissionDenied,
    Unknown,
)
from reboot.aio.applications import Application
from reboot.aio.external import InitializeContext
from reboot.aio.tests import Reboot
from tests.reboot.pydantic.methods.servicer import TestServicer
from tests.reboot.pydantic.methods.servicer_api import (
    AnotherError,
    ArbitraryData,
    GetSnapshotResponse,
    MyError,
    State,
    UpdateRequest,
    UpdateResponse,
)
from tests.reboot.pydantic.methods.servicer_api_rbt import Test

_TEST_STATE_ID = 'test-5678'


class RebootTestCase(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_constructor(self) -> None:
        """Test `Writer` method which is a `factory`."""

        async def initialize(context: InitializeContext) -> None:
            MY_STATE_ID = "my-state-id"
            STR_VALUE = "initialized from workflow"
            STR_VALUE_WITH_STATE_ID = "initialized from workflow with state id"

            test_ref, _ = await Test.initialize_from_workflow(
                context,
                str_value=STR_VALUE,
            )
            state = await test_ref.get_snapshot(context)
            self.assertEqual(
                state.snapshot.current_str,
                STR_VALUE,
            )
            self.assertNotEqual(
                test_ref.state_id,
                MY_STATE_ID,
            )

            test_ref_with_state_id, _ = await Test.initialize_from_workflow(
                context,
                MY_STATE_ID,
                str_value=STR_VALUE_WITH_STATE_ID,
            )
            test_ref_with_state_id_state = await test_ref_with_state_id.get_snapshot(
                context
            )
            self.assertEqual(
                test_ref_with_state_id_state.snapshot.current_str,
                STR_VALUE_WITH_STATE_ID,
            )
            self.assertEqual(
                test_ref_with_state_id.state_id,
                MY_STATE_ID,
            )

        await self.rbt.up(
            Application(
                servicers=[TestServicer],
                initialize=initialize,
            ),
            servers=1,
        )

        context = self.rbt.create_external_context(name=self.id())

        test, response = await Test.initialize(
            context,
            _TEST_STATE_ID,
        )

        self.assertIsNone(response)

        # We explicitly suppress the `mypy` error for this call
        # to have some test coverage when a method returns `None`.
        reader_response = await test.reader_with_nones( # type: ignore[func-returns-value]
            context,
        )

        self.assertIsNone(reader_response)

        await Test.ref(
            _TEST_STATE_ID,
        ).reader_with_nones(context)

    async def test_writer(self) -> None:
        """Test `Writer` method with both request and response."""
        await self.rbt.up(
            Application(servicers=[TestServicer]),
            servers=1,
        )

        context = self.rbt.create_external_context(name=self.id())

        test, _ = await Test.initialize(
            context,
            _TEST_STATE_ID,
        )

        update_response = await test.update_state(
            context,
            UpdateRequest(
                int_increment=10,
                str_append="_updated",
                bool_toggle=True,
                literal_value='option2',
            ),
        )

        self.assertIsInstance(update_response, UpdateResponse)

        expected_response = UpdateResponse(
            previous_int=42,
            previous_str="initialized",
            new_int=52,
            new_str="initialized_updated",
            previous_literal_value='option1',
            new_literal_value='option2',
        )
        self.assertEqual(update_response, expected_response)

        # Test again to verify state was updated.
        second_update_response = await test.update_state(
            context,
            int_increment=5,
            str_append="_again",
            bool_toggle=False,
            literal_value='option3',
        )

        self.assertIsInstance(second_update_response, UpdateResponse)

        expected_response = UpdateResponse(
            previous_int=52,
            previous_str="initialized_updated",
            new_int=57,
            new_str="initialized_updated_again",
            previous_literal_value='option2',
            new_literal_value='option3',
        )
        self.assertEqual(second_update_response, expected_response)

        snapshot = await test.get_snapshot(context)

        with self.assertRaises(Test.UpdateStateAborted) as aborted:
            await test.update_state(
                context,
                UpdateRequest(
                    int_increment=-10,
                    str_append="_denied",
                    bool_toggle=False,
                ),
            )

        self.assertIsInstance(aborted.exception.error, PermissionDenied)

        snapshot_after_aborted = await test.get_snapshot(context)

        self.assertEqual(snapshot, snapshot_after_aborted)

    async def test_reader(self) -> None:
        """Test `Reader` method that returns state snapshot."""
        await self.rbt.up(
            Application(servicers=[TestServicer]),
            servers=1,
        )

        context = self.rbt.create_external_context(name=self.id())

        test, _ = await Test.initialize(
            context,
            _TEST_STATE_ID,
        )

        get_snapshot_response = await test.get_snapshot(context)

        expected_data = ArbitraryData(
            str_list_value=["initialized"],
            optional_str_list_value=[
                "optional",
                "list",
                "initialized",
            ],
        )
        expected_get_snapshot_response = GetSnapshotResponse(
            snapshot=State.StateSnapshot(
                current_int=42,
                current_str="initialized",
                current_float=3.14,
                current_bool=True,
                current_data=expected_data,
            )
        )

        self.assertIsInstance(get_snapshot_response, GetSnapshotResponse)
        self.assertEqual(get_snapshot_response, expected_get_snapshot_response)

        await test.update_state(
            context,
            int_increment=100,
            str_append="_changed",
            bool_toggle=True,
        )

        new_get_snapshot_response = await test.get_snapshot(context)

        expected_new_get_snapshot_response = GetSnapshotResponse(
            snapshot=State.StateSnapshot(
                current_int=142,
                current_str="initialized_changed",
                current_float=3.14,
                current_bool=False,
                current_data=expected_data,
            )
        )

        self.assertIsInstance(new_get_snapshot_response, GetSnapshotResponse)
        self.assertEqual(
            new_get_snapshot_response, expected_new_get_snapshot_response
        )

    async def test_transaction(self) -> None:
        """Test `Transaction` method that updates state."""
        await self.rbt.up(
            Application(servicers=[TestServicer]),
            servers=1,
        )

        context = self.rbt.create_external_context(name=self.id())

        test, _ = await Test.initialize(
            context,
            _TEST_STATE_ID,
        )

        _SECOND_STATE_ID = f"{_TEST_STATE_ID}_other"

        second_test, _ = await Test.initialize(
            context,
            _SECOND_STATE_ID,
        )

        get_snapshot_response_before = await second_test.get_snapshot(context)

        await test.transaction_state_update(
            context,
            update_request=UpdateRequest(
                int_increment=20,
                str_append="_tx",
                bool_toggle=True,
            ),
            state_id=_SECOND_STATE_ID,
        )

        expected_get_snapshot_response = GetSnapshotResponse(
            snapshot=State.StateSnapshot(
                current_int=62,
                current_str="initialized_tx",
                current_float=3.14,
                current_bool=False,
                current_data=ArbitraryData(
                    str_list_value=["initialized"],
                    optional_str_list_value=[
                        "optional",
                        "list",
                        "initialized",
                    ],
                ),
            )
        )

        get_snapshot_response = await second_test.get_snapshot(context)
        self.assertIsInstance(get_snapshot_response, GetSnapshotResponse)
        self.assertNotEqual(
            get_snapshot_response_before,
            get_snapshot_response,
        )
        self.assertEqual(get_snapshot_response, expected_get_snapshot_response)

        with self.assertRaises(Test.TransactionStateUpdateAborted) as aborted:
            await test.transaction_state_update(
                context,
                update_request=UpdateRequest(
                    int_increment=10,
                    str_append="",
                    bool_toggle=False,
                ),
                state_id=_SECOND_STATE_ID,
                make_unauthorized_call=True,
            )

        self.assertIn(
            "Transaction must abort",
            str(aborted.exception),
        )

        get_snapshot_response_after_aborted = await second_test.get_snapshot(
            context
        )

        # Should't change due to transaction abort.
        self.assertEqual(
            get_snapshot_response_after_aborted,
            get_snapshot_response,
        )

    async def test_workflow(self) -> None:
        """Test `Workflow` method with both request and response."""
        await self.rbt.up(
            Application(servicers=[TestServicer]),
            servers=1,
        )

        context = self.rbt.create_external_context(name=self.id())

        test, _ = await Test.initialize(
            context,
            _TEST_STATE_ID,
        )

        update_response = await test.workflow(
            context,
            int_increment=10,
            str_append="_updated",
            bool_toggle=True,
        )

        expected_response = UpdateResponse(
            previous_int=42,
            previous_str="initialized",
            new_int=52,
            new_str="initialized_updated",
            previous_literal_value="option1",
            new_literal_value="option1",
        )

        self.assertIsInstance(update_response, UpdateResponse)
        self.assertEqual(update_response, expected_response)

    async def test_transaction_ongoing_updates(self) -> None:
        """Test that ongoing updates are visible within a transaction."""
        await self.rbt.up(
            Application(servicers=[TestServicer]),
            servers=1,
        )

        context = self.rbt.create_external_context(name=self.id())

        test, _ = await Test.initialize(
            context,
            _TEST_STATE_ID,
        )

        with self.assertRaises(Test.TransactionAborted) as aborted:
            await test.transaction(context)

        self.assertIn(
            "Transaction must abort",
            str(aborted.exception),
        )

    async def test_raise_value_error(self) -> None:
        """Test `Writer` method which is a `factory`."""
        await self.rbt.up(
            Application(servicers=[TestServicer]),
            servers=1,
        )

        context = self.rbt.create_external_context(name=self.id())

        test, _ = await Test.initialize(
            context,
            _TEST_STATE_ID,
        )

        with self.assertRaises(Test.RaiseValueErrorAborted) as aborted:
            await test.raise_value_error(
                context,
            )

        self.assertIsInstance(aborted.exception.error, Unknown)
        assert aborted.exception.message is not None
        self.assertIn("Simulated value error", aborted.exception.message)

    async def test_raise_declared_error(self) -> None:
        """Test `Writer` method which is a `factory`."""
        await self.rbt.up(
            Application(servicers=[TestServicer]),
            servers=1,
        )

        context = self.rbt.create_external_context(name=self.id())

        test, _ = await Test.idempotently('initialize').initialize(
            context,
            _TEST_STATE_ID,
        )

        with self.assertRaises(Test.RaiseDeclaredErrorAborted) as aborted:
            await test.idempotently('raise my_error').raise_declared_error(
                context,
                error_to_trigger="my_error",
            )

        self.assertIsInstance(aborted.exception.error, MyError)
        self.assertEqual(
            aborted.exception.error.data,
            "Simulated declared error",
        )

        with self.assertRaises(
            Test.RaiseDeclaredErrorAborted
        ) as another_aborted:
            await test.idempotently('raise another_error'
                                   ).raise_declared_error(
                                       context,
                                       error_to_trigger="another_error",
                                   )
        self.assertIsInstance(another_aborted.exception.error, AnotherError)
        self.assertEqual(
            another_aborted.exception.error.data,
            "Simulated another error",
        )

        with self.assertRaises(
            Test.RaiseDeclaredErrorAborted
        ) as protobuf_aborted:
            await test.idempotently('raise protobuf_error'
                                   ).raise_declared_error(
                                       context,
                                       error_to_trigger="protobuf_error",
                                   )
        self.assertIsInstance(
            protobuf_aborted.exception.error, FailedPrecondition
        )

        with self.assertRaises(
            Test.RaiseDeclaredErrorAborted
        ) as aborted_in_task:
            task = await test.idempotently(
                'raise my_error task',
            ).spawn().raise_declared_error(
                context,
                error_to_trigger="my_error",
            )

            await task

        self.assertIsInstance(aborted_in_task.exception.error, MyError)
        self.assertEqual(
            aborted_in_task.exception.error.data,
            "Simulated declared error",
        )

    async def test_forall_with_iterables(self) -> None:
        """Test that forall accepts various iterables, not just lists."""
        await self.rbt.up(
            Application(servicers=[TestServicer]),
            servers=1,
        )

        context = self.rbt.create_external_context(name=self.id())

        state_ids_list = [
            "test-forall-1",
            "test-forall-2",
            "test-forall-3",
        ]
        for state_id in state_ids_list:
            await Test.initialize(context, state_id)

        # Test `forall` with `dict.keys()`.
        state_ids_dict = {state_id: None for state_id in state_ids_list}
        responses = await Test.forall(state_ids_dict.keys()
                                     ).get_snapshot(context)
        self.assertEqual(len(responses), 3)

        # Test `forall` with `set`.
        state_ids_set = set(state_ids_list)
        responses = await Test.forall(state_ids_set).get_snapshot(context)
        self.assertEqual(len(responses), 3)

        # Test `forall` with generator expression.
        responses = await Test.forall(
            (state_id for state_id in state_ids_list)
        ).get_snapshot(context)
        self.assertEqual(len(responses), 3)

        # Test `forall` with `filter()`.
        responses = await Test.forall(
            filter(lambda x: x.startswith("test-"), state_ids_list)
        ).get_snapshot(context)
        self.assertEqual(len(responses), 3)


if __name__ == '__main__':
    unittest.main(verbosity=2)
