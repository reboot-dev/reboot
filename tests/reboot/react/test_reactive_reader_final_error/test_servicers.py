import asyncio
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext, WriterContext
from tests.reboot.react.test_reactive_reader_final_error import test_rbt
from tests.reboot.react.test_reactive_reader_final_error.test_rbt import Test


class TestServicer(Test.singleton.Servicer):

    def __init__(self):
        # How many times `Get` has run, so that a test can tell whether
        # a reactive reader kept retrying after a declared error.
        self._get_attempts = 0

    def authorizer(self):
        return allow()

    async def Create(
        self,
        context: WriterContext,
        state: Test.State,
        request: test_rbt.CreateRequest,
    ) -> test_rbt.CreateResponse:
        return test_rbt.CreateResponse()

    async def Get(
        self,
        context: ReaderContext,
        state: Test.State,
        request: test_rbt.GetRequest,
    ) -> test_rbt.GetResponse:
        self._get_attempts += 1

        if state.message == '':
            raise Test.GetAborted(test_rbt.NoMessageYet())

        return test_rbt.GetResponse(message=state.message)

    async def SetMessage(
        self,
        context: WriterContext,
        state: Test.State,
        request: test_rbt.SetMessageRequest,
    ) -> test_rbt.SetMessageResponse:
        state.message = request.message
        return test_rbt.SetMessageResponse()

    async def Attempts(
        self,
        context: ReaderContext,
        state: Test.State,
        request: test_rbt.AttemptsRequest,
    ) -> test_rbt.AttemptsResponse:
        return test_rbt.AttemptsResponse(attempts=self._get_attempts)

    async def Slow(
        self,
        context: ReaderContext,
        state: Test.State,
        request: test_rbt.SlowRequest,
    ) -> test_rbt.SlowResponse:
        # Long enough for a test to make a mutation while a reactive
        # read of this method is still loading, and short enough for
        # the read to observe that mutation soon after, given that
        # effect validation runs this twice per evaluation.
        await asyncio.sleep(1)
        return test_rbt.SlowResponse()
