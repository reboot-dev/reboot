from google.protobuf import empty_pb2
from rbt.v1alpha1.errors_pb2 import Aborted
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext, WriterContext
from tests.reboot.react.test_writer_abort_with_retrying_reactive_reader import (
    test_rbt,
)
from tests.reboot.react.test_writer_abort_with_retrying_reactive_reader.test_rbt import (
    Test,
)


class TestServicer(Test.singleton.Servicer):

    def __init__(self):
        self._writer_aborted_once = False

    def authorizer(self):
        return allow()

    async def Create(
        self,
        context: WriterContext,
        state: Test.State,
        request: test_rbt.CreateRequest,
    ) -> test_rbt.CreateResponse:
        return test_rbt.CreateResponse()

    async def ReturnResponseOrRaise(
        self,
        context: ReaderContext,
        state: Test.State,
        request: test_rbt.ReturnResponseOrRaiseRequest,
    ) -> test_rbt.ReturnResponseOrRaiseResponse:
        if self._writer_aborted_once:
            return test_rbt.ReturnResponseOrRaiseResponse(
                message='This is a response from the test servicer.'
            )
        else:
            raise RuntimeError('This is an error from the test servicer.')

    async def FailWithAborted(
        self,
        context: WriterContext,
        state: Test.State,
        request: empty_pb2.Empty,
    ) -> empty_pb2.Empty:
        self._writer_aborted_once = True
        raise Test.FailWithAbortedAborted(Aborted())
