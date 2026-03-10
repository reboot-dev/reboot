import asyncio
from reboot.aio.applications import Application
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext, WriterContext
from reboot.aio.external import ExternalContext
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions
from selenium.webdriver.support.wait import WebDriverWait
from tests.reboot.protoc.shared_pb2 import Empty, Text
from tests.reboot.react.test_against_local_envoy import (
    web_test_against_local_envoy,
)
from tests.reboot.react.web_driver_runner import web_driver
from types import ModuleType


def run_test(
    echo_state_rbt_module: ModuleType,
    bundle_js_path: str,
):

    class EchoServicer(
        echo_state_rbt_module.Echo.Servicer  # type: ignore[name-defined]
    ):

        def authorizer(self):
            return allow()

        async def Reply(
            self,
            context: WriterContext,
            request: Text,
        ) -> Text:
            self.state.last_message.CopyFrom(request)
            return Text(content=request.content)

        async def LastMessage(
            self,
            context: ReaderContext,
            request: Empty,
        ) -> Text:
            return self.state.last_message

    async def test(context: ExternalContext, uri: str):
        # Use both methods on the _state_ type, to demonstrate state types
        # are also clients for all their methods.
        Echo = echo_state_rbt_module.Echo
        echo = Echo.ref("(singleton)")
        response = await echo.Reply(context, content="Hello from Python")
        assert response.content == "Hello from Python"

        # The following helper method contains blocking code, which must
        # run in a different executor to not block the event loop.
        def sync():

            with web_driver(
                uri=uri,
                bundle_js_path=bundle_js_path,
            ) as (driver, port):
                driver.get(f'http://127.0.0.1:{port}/')
                wait = WebDriverWait(driver, 5)  # Wait up to 5 seconds.

                # Test the we hit the backend and receive state back.
                wait.until(
                    expected_conditions.text_to_be_present_in_element(
                        (By.ID, 'lastMessage'),
                        'Hello from Python',
                    )
                )

                driver.find_element_by_id('button').click()

                # Test that the mutation results in a new reactive state value.
                wait.until(
                    expected_conditions.text_to_be_present_in_element(
                        (By.ID, 'lastMessage'),
                        'Hello from React',
                    )
                )

        await asyncio.get_running_loop().run_in_executor(None, sync)

    web_test_against_local_envoy(
        test=test,
        application=Application(servicers=[EchoServicer]),
    )
