from pydantic import BaseModel
from rbt.v1alpha1.errors_pb2 import (
    FailedPrecondition,
    Ok,
    PermissionDenied,
    Unknown,
)
from reboot.aio.auth.authorizers import allow, allow_if
from reboot.aio.contexts import (
    ReaderContext,
    TransactionContext,
    WorkflowContext,
    WriterContext,
)
from tests.reboot.pydantic.methods.servicer_api import (
    AnotherError,
    ArbitraryData,
    ComplexTypesRequest,
    GetSnapshotResponse,
    InitializeFromWorkflowRequest,
    MyError,
    RaiseDeclaredErrorRequest,
    State,
    TransactionUpdateRequest,
    TransactionWriterRequest,
    UpdateRequest,
    UpdateResponse,
)
from tests.reboot.pydantic.methods.servicer_api_rbt import Test


# Make sure we can 'pickle' the output type of the writer.
# It has to be defined at module level (not a local object) for that to
# work.
class WriteOutput(BaseModel):
    previous_int: int
    previous_str: str


class TestServicer(Test.Servicer):

    def _initialize_state(self, *, str_value: str) -> None:
        """Initialize all required state fields for factory constructors."""
        self.state.int_value = 42
        self.state.str_value = str_value
        self.state.float_value = 3.14
        self.state.bool_value = True
        self.state.data_value = ArbitraryData(
            str_list_value=["initialized"],
            optional_str_list_value=[
                "optional",
                "list",
                "initialized",
            ],
        )
        self.state.data_list_value = []
        self.state.optional_data_list_value = None
        self.state.optional_data_dict_value = None

        # Check the default values are set correctly.
        assert self.state.data_value.empty_default_str_list_value == []
        assert self.state.data_value.optional_with_empty_default_str_list_value is None

        self.state.data_dict_value = {
            "key":
                ArbitraryData(
                    str_list_value=["dict", "value"],
                    optional_str_list_value=None,
                )
        }

        assert self.state.str_default_value == ""
        assert self.state.int_default_value == 0
        assert self.state.bool_default_value is False
        assert self.state.float_default_value == 0.0
        assert self.state.list_default_value == []
        assert self.state.dict_default_value == {}
        assert self.state.another_model_default_value is None
        assert self.state.literal_default_value == "option1"

        self.state.literal_value = "option1"

    def authorizer(self):

        def update_state_rule(
            context: ReaderContext,
            state: State | None,
            request: UpdateRequest | None,
            **kwargs,
        ):
            assert request is not None
            if request.int_increment < 0:
                return PermissionDenied()
            return Ok()

        return Test.Authorizer(
            initialize=allow(),
            initialize_from_workflow=allow(),
            reader_with_nones=allow(),
            update_state=allow_if(all=[update_state_rule]),
            get_snapshot=allow(),
            transaction_state_update=allow(),
            workflow=allow(),
            transaction=allow(),
            transaction_reader=allow(),
            transaction_writer=allow(),
            raise_value_error=allow(),
            raise_declared_error=allow(),
        )

    async def initialize(
        self,
        context: WriterContext,
    ) -> None:
        assert isinstance(self.state, State)
        self._initialize_state(str_value="initialized")

    async def initialize_from_workflow(
        self,
        context: WriterContext,
        request: InitializeFromWorkflowRequest,
    ) -> None:
        assert isinstance(self.state, State)
        assert isinstance(request, InitializeFromWorkflowRequest)
        self._initialize_state(str_value=request.str_value)

    async def reader_with_nones(
        self,
        context: ReaderContext,
    ) -> None:
        assert isinstance(self.state, State)

    async def update_state(
        self,
        context: WriterContext,
        request: UpdateRequest,
    ) -> UpdateResponse:
        assert isinstance(self.state, State)
        assert isinstance(request, UpdateRequest)

        previous_int = self.state.int_value
        previous_str = self.state.str_value

        self.state.int_value += request.int_increment
        self.state.str_value += request.str_append

        if request.bool_toggle:
            self.state.bool_value = not self.state.bool_value

        previous_literal = self.state.literal_value
        if request.literal_value is not None:
            self.state.literal_value = request.literal_value

        return UpdateResponse(
            previous_int=previous_int,
            previous_str=previous_str,
            new_int=self.state.int_value,
            new_str=self.state.str_value,
            previous_literal_value=previous_literal,
            new_literal_value=self.state.literal_value,
        )

    async def get_snapshot(
        self,
        context: ReaderContext,
    ) -> GetSnapshotResponse:
        assert isinstance(self.state, State)

        return GetSnapshotResponse(
            snapshot=State.StateSnapshot(
                current_int=self.state.int_value,
                current_str=self.state.str_value,
                current_float=self.state.float_value,
                current_bool=self.state.bool_value,
                current_data=self.state.data_value,
            )
        )

    async def transaction_state_update(
        self,
        context: TransactionContext,
        request: TransactionUpdateRequest,
    ) -> None:
        assert isinstance(request, TransactionUpdateRequest)

        await Test.ref(request.state_id).update_state(
            context,
            request.update_request,
        )

        if request.make_unauthorized_call:
            # Make an unauthorized call to trigger transaction abort.
            request.update_request.int_increment = -1000
            try:
                await Test.ref(request.state_id).update_state(
                    context,
                    request.update_request,
                )
            except Test.UpdateStateAborted as e:
                assert isinstance(e.error, PermissionDenied)
                # At present, even if the exception is caught and handled, the
                # transaction will still be set to abort for undeclared errors.
                assert context.transaction_must_abort

    @classmethod
    async def workflow(
        cls,
        context: WorkflowContext,
        request: UpdateRequest,
    ) -> UpdateResponse:
        STR_VALUE = "initialized from workflow"
        STR_VALUE_WITH_STATE_ID = "initialized from workflow with state id"
        MY_STATE_ID = "my-state-id"
        test_ref, _ = await Test.initialize_from_workflow(
            context,
            str_value=STR_VALUE,
        )
        test_ref_state = await test_ref.get_snapshot(context)
        assert (test_ref_state.snapshot.current_str == STR_VALUE)
        assert test_ref.state_id != MY_STATE_ID

        test_ref_with_state_id, _ = await Test.initialize_from_workflow(
            context,
            MY_STATE_ID,
            str_value=STR_VALUE_WITH_STATE_ID,
        )
        test_ref_with_state_id_state = await test_ref_with_state_id.get_snapshot(
            context
        )
        assert (
            test_ref_with_state_id_state.snapshot.current_str ==
            STR_VALUE_WITH_STATE_ID
        )
        assert test_ref_with_state_id.state_id == MY_STATE_ID

        state_from_read = await Test.ref().read(context)

        assert isinstance(state_from_read, State)

        # Preemptively compute the expected response and verify after the
        # write.
        response = UpdateResponse(
            previous_int=state_from_read.int_value,
            previous_str=state_from_read.str_value,
            new_int=state_from_read.int_value + request.int_increment,
            new_str=state_from_read.str_value + request.str_append,
            new_literal_value=request.literal_value or
            state_from_read.literal_value,
            previous_literal_value=state_from_read.literal_value,
        )

        async def write(state: State) -> WriteOutput:
            assert isinstance(state, State)

            output = WriteOutput(
                previous_int=state.int_value,
                previous_str=state.str_value,
            )

            state.int_value += request.int_increment
            state.str_value += request.str_append
            state.literal_value = request.literal_value or \
                state.literal_value

            if request.bool_toggle:
                state.bool_value = not state.bool_value

            return output

        write_output = await Test.ref().idempotently('Do write').write(
            context,
            write,
            type=WriteOutput,
        )

        assert response.previous_int == write_output.previous_int
        assert response.previous_str == write_output.previous_str

        # Use the same idempotency key to verify that the write is not
        # executed again and the same output is returned via "unpickle".
        another_write_output = await Test.ref().idempotently('Do write').write(
            context,
            write,
            type=WriteOutput,
        )

        assert another_write_output == write_output

        state_from_read = await Test.ref().idempotently(
            # Use an idempotency key to be able to read the state second
            # time.
            'Second state read',
        ).read(context)

        assert state_from_read.int_value == response.new_int
        assert state_from_read.str_value == response.new_str
        assert state_from_read.literal_value == response.new_literal_value

        # When we read the state with "always" it goes through the
        # different code path.
        state_from_read_always = await Test.ref().always().read(context)

        assert isinstance(state_from_read_always, State)

        assert state_from_read.model_dump(
        ) == state_from_read_always.model_dump()

        return response

    async def transaction(
        self,
        context: TransactionContext,
    ) -> None:
        self.state.str_value += "(transaction)"

        await self.ref().transaction_reader(context)

        await self.ref().transaction_writer(context, should_fail=False)

        # Make sure we can see the `transactionWriter` changes.
        assert self.state.str_value.endswith("(transactionWriter)")

        try:
            self.state.str_value += "(transaction)"
            await self.ref().transaction_writer(context, should_fail=True)
        except Test.TransactionWriterAborted as aborted:
            assert isinstance(aborted.error, Unknown)
            assert aborted.message is not None
            assert "Simulated failure in transaction_writer" in aborted.message

            # At present, even if the exception is caught and handled, the
            # transaction will still be set to abort for undeclared errors.
            assert context.transaction_must_abort

            # Make sure we don't see any changes from the failed writer.
            assert self.state.str_value.endswith("(transaction)")

    async def transaction_reader(
        self,
        context: ReaderContext,
    ) -> None:
        # Make sure we can see the `transaction` changes in a `reader` call.
        assert self.state.str_value.endswith("(transaction)")

    async def transaction_writer(
        self,
        context: WriterContext,
        request: TransactionWriterRequest,
    ) -> None:
        # Make sure we can see the `transaction` changes in a `writer` call.
        assert self.state.str_value.endswith("(transaction)")

        # Modify the state and check that we will see the changes in
        # the outer transaction.
        self.state.str_value += "(transactionWriter)"

        if request.should_fail:
            raise RuntimeError("Simulated failure in transaction_writer")

    async def complex_types_method_mypy(
        self,
        context: WriterContext,
        request: ComplexTypesRequest,
    ) -> None:
        raise RuntimeError(
            "That method is used only for mypy type checking and should "
            "not be called."
        )

    async def raise_value_error(
        self,
        context: WriterContext,
    ) -> None:
        raise ValueError("Simulated value error")

    async def raise_declared_error(
        self,
        context: WriterContext,
        request: RaiseDeclaredErrorRequest,
    ) -> None:
        if request.error_to_trigger == "my_error":
            raise Test.RaiseDeclaredErrorAborted(
                MyError(data="Simulated declared error")
            )
        elif request.error_to_trigger == "another_error":
            raise Test.RaiseDeclaredErrorAborted(
                AnotherError(data="Simulated another error")
            )
        else:
            assert request.error_to_trigger == "protobuf_error"
            raise Test.RaiseDeclaredErrorAborted(FailedPrecondition())
