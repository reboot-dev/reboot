import aiohttp
import asyncio
import os
from reboot.aio.external import ExternalContext
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions
from selenium.webdriver.support.wait import WebDriverWait
from tests.reboot.greeter_rbt import Greeter
from tests.reboot.react.web_driver_runner import web_driver


async def test(context: ExternalContext, uri: str):
    """Tests HTTP requests will reach the application."""
    state_id = 'actor-test-132'

    # Call the constructor for this actor so we have state to
    # receive when `Greet` is called.
    await Greeter.idempotently(f"Create '{state_id}'").Create(
        context,
        state_id,
        title='Count',
        name='Chocula',
        adjective='tasty',
    )

    # We'll make HTTP requests from the browser below but we
    # also test that we can make an HTTP request not from the
    # browser here.
    async with aiohttp.ClientSession() as session:
        async with session.request(
            'GET',
            f'{uri}/hello_world',
            ssl=False,  # Disable SSL verification; self-signed cert.
        ) as response:
            assert response.status == 200, f'{response}'
            data = await response.json()
            assert data['message'] == 'Hello, world!'

        async with session.request(
            'POST',
            f'{uri}/inject_external_context',
            headers={"Authorization": f"Bearer {context.bearer_token}"}
            if context.bearer_token else {},
            ssl=False,  # Disable SSL verification; self-signed cert.
        ) as response:
            assert response.status == 200, f'{response}'
            data = await response.json()
            assert (
                data['message'] ==
                "Hello, HTTP POST '/inject_external_context'!"
            )
            if context.bearer_token is not None:
                assert data['bearerToken'] == context.bearer_token

    def run_selenium_test():
        with web_driver(
            uri=uri,
            bundle_js_path=os.path.join(
                os.path.dirname(__file__), 'bundle.js'
            ),
        ) as (driver, port):
            driver.get(f'http://127.0.0.1:{port}/')
            wait = WebDriverWait(driver, 5)

            # Test the we hit the backend and receive
            # state back.
            wait.until(
                expected_conditions.text_to_be_present_in_element(
                    (By.ID, 'data'),
                    'Hello, world!',
                )
            )

    # We execute the Selenium test in a separate thread to not block the
    # event loop.
    await asyncio.to_thread(run_selenium_test)
